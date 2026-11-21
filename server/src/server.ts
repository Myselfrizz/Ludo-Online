import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt, randomUUID } from "node:crypto";
import { Server } from "socket.io";
import { z } from "zod";
import { newGame, roll, move, pass, isOver, type Game } from "./engine.js";

const PORT = Number(process.env.PORT) || 3000;
const ORIGINS = (process.env.CLIENT_URL || "http://localhost:5173").split(",");

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: ORIGINS }));
app.get("/health", (_req, res) =>
  res.json({ status: "OK", message: "Online Ludo server is running" })
);

// Serve the built React client from the same server (one URL, no CORS problems).
const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
app.use(express.static(clientDist));
app.use((_req, res) => res.sendFile(path.join(clientDist, "index.html")));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: ORIGINS } });

type Player = { id: string; name: string; seat: number; socketId: string | null };
type Room = {
  code: string;
  hostId: string;
  players: Player[];
  status: "lobby" | "playing" | "finished";
  game: Game | null;
  timer?: NodeJS.Timeout;
  turnTimer?: NodeJS.Timeout;
  deadline?: number;
};
const rooms = new Map<string, Room>();
const inRoom = new Map<string, string>(); // guestId -> room code

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() {
  for (;;) {
    let c = "";
    for (let i = 0; i < 6; i++) c += ALPHA[randomInt(ALPHA.length)];
    if (!rooms.has(c)) return c;
  }
}

const view = (r: Room) => ({
  code: r.code,
  hostId: r.hostId,
  status: r.status,
  players: r.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, connected: !!p.socketId })),
  turn: r.game?.turn ?? 0,
  dice: r.game?.dice ?? null,
  legal: r.game?.legal ?? [],
  tokens: r.game?.tokens ?? [],
  winners: r.game?.winners ?? [],
  turnMs: r.deadline ? Math.max(0, r.deadline - Date.now()) : 0,
});
const broadcast = (r: Room) => io.to(r.code).emit("room:state", view(r));

function finishCheck(r: Room) {
  if (r.game && isOver(r.game)) r.status = "finished";
}

const TURN_MS = 30_000;

// Every action has a timer. If it runs out, the turn passes to the next player.
function tick(r: Room) {
  clearTimeout(r.timer);
  clearTimeout(r.turnTimer);
  const g = r.game;
  if (!g || r.status !== "playing") { r.deadline = 0; return; }
  const sync = (ms: number) => {
    r.deadline = ms ? Date.now() + ms : 0;
    io.to(r.code).emit("room:timer", { turnMs: ms });
  };
  if (g.dice !== null && g.legal.length === 0) {
    sync(0);
    r.timer = setTimeout(() => { pass(g); broadcast(r); tick(r); }, 1200);
    return;
  }
  sync(TURN_MS);
  // Timeout (or disconnected player): no auto-roll, no auto-move. The turn just passes on.
  const skip = () => { pass(g); broadcast(r); tick(r); };
  r.turnTimer = setTimeout(skip, TURN_MS);
  const p = r.players.find((x) => x.seat === g.turn);
  if (p && !p.socketId) r.timer = setTimeout(skip, 1500);
}

const Name = z.string().trim().min(1).max(16);
const Code = z.string().trim().toUpperCase().length(6);

io.on("connection", (socket) => {
  const auth = socket.handshake.auth;
  const guestId = z.string().uuid().safeParse(auth.guestId).success ? (auth.guestId as string) : randomUUID();
  const parsedName = Name.safeParse(auth.name);
  const name = parsedName.success ? parsedName.data : "Guest";
  socket.emit("guest", { guestId });

  const err = (m: string) => socket.emit("error:msg", m);
  const myRoom = () => {
    const c = inRoom.get(guestId);
    return c ? rooms.get(c) : undefined;
  };

  // Reconnect to an existing seat
  const existing = myRoom();
  const me = existing?.players.find((p) => p.id === guestId);
  if (existing && me) {
    me.socketId = socket.id;
    socket.join(existing.code);
    broadcast(existing);
    tick(existing);
  }

  const addPlayer = (r: Room) => {
    const seat = [0, 1, 2, 3].find((s) => !r.players.some((p) => p.seat === s))!;
    r.players.push({ id: guestId, name, seat, socketId: socket.id });
    inRoom.set(guestId, r.code);
    socket.join(r.code);
    broadcast(r);
  };

  socket.on("room:create", () => {
    if (myRoom()) return err("You are already in a room");
    const r: Room = { code: newCode(), hostId: guestId, players: [], status: "lobby", game: null };
    rooms.set(r.code, r);
    addPlayer(r);
  });

  socket.on("room:join", (payload) => {
    if (myRoom()) return err("You are already in a room");
    const c = Code.safeParse(payload?.code);
    const r = c.success ? rooms.get(c.data) : undefined;
    if (!r) return err("Room not found");
    if (r.status !== "lobby") return err("Game already started");
    if (r.players.length >= 4) return err("Room is full (4 players)");
    addPlayer(r);
  });

  socket.on("room:leave", () => {
    const r = myRoom();
    if (!r) return;
    inRoom.delete(guestId);
    socket.leave(r.code);
    if (r.status === "lobby") r.players = r.players.filter((p) => p.id !== guestId);
    else {
      const p = r.players.find((x) => x.id === guestId);
      if (p) p.socketId = null;
    }
    if (r.players.length === 0 || r.players.every((p) => !p.socketId)) {
      clearTimeout(r.timer);
      r.players.forEach((p) => inRoom.delete(p.id));
      rooms.delete(r.code);
    } else {
      if (r.hostId === guestId && r.status === "lobby") r.hostId = r.players[0].id;
      broadcast(r);
      tick(r);
    }
    socket.emit("room:left");
  });

  socket.on("room:start", () => {
    const r = myRoom();
    if (!r || r.hostId !== guestId || r.status !== "lobby") return;
    if (r.players.length < 2) return err("Need at least 2 players");
    r.game = newGame(r.players.map((p) => p.seat).sort());
    r.status = "playing";
    broadcast(r);
    tick(r);
  });

  socket.on("room:rematch", () => {
    const r = myRoom();
    if (!r || r.hostId !== guestId || r.status !== "finished") return;
    r.players = r.players.filter((p) => inRoom.get(p.id) === r.code);
    r.game = null;
    r.status = "lobby";
    broadcast(r);
  });

  socket.on("game:roll", () => {
    const r = myRoom();
    const g = r?.game;
    const p = r?.players.find((x) => x.id === guestId);
    if (!r || !g || !p || r.status !== "playing" || p.seat !== g.turn || g.dice !== null) return;
    roll(g);
    broadcast(r);
    tick(r);
  });

  socket.on("game:move", (payload) => {
    const r = myRoom();
    const g = r?.game;
    const p = r?.players.find((x) => x.id === guestId);
    const t = z.number().int().min(0).max(3).safeParse(payload?.token);
    if (!r || !g || !p || !t.success || r.status !== "playing") return;
    if (p.seat !== g.turn || g.dice === null || !g.legal.includes(t.data)) return;
    move(g, t.data);
    finishCheck(r);
    broadcast(r);
    tick(r);
  });

  socket.on("disconnect", () => {
    const r = myRoom();
    const p = r?.players.find((x) => x.id === guestId);
    if (r && p && p.socketId === socket.id) {
      p.socketId = null;
      broadcast(r);
      tick(r);
    }
  });
});

httpServer.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));