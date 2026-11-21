import { useEffect, useState } from "react";
import { socket } from "./socket";
import Board, { COLORS, NAMES } from "./Board";
import Dice from "./Dice";
import { isMuted, toggleMute } from "./sounds";
import type { RoomState } from "./types";

export default function App() {
  const [name, setName] = useState(localStorage.getItem("ludo_name") || "");
  const [joined, setJoined] = useState(false);
  const [gid, setGid] = useState(localStorage.getItem("ludo_gid") || "");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("connecting…");
  const [timer, setTimer] = useState({ ms: 0, at: 0 });
  const [muted, setMuted] = useState(isMuted());

  const connect = (n: string) => {
    localStorage.setItem("ludo_name", n);
    socket.connect();
    setJoined(true);
  };

  useEffect(() => {
    socket.on("connect", () => setStatus("connected"));
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.on("connect_error", (e) => setStatus("cannot reach server: " + e.message));
    socket.on("guest", (g: { guestId: string }) => {
      localStorage.setItem("ludo_gid", g.guestId);
      setGid(g.guestId);
    });
    socket.on("room:state", (r: RoomState) => {
      setRoom(r);
      setErr("");
      setTimer({ ms: (r as { turnMs?: number }).turnMs ?? 0, at: Date.now() });
    });
    socket.on("room:timer", (t: { turnMs: number }) => setTimer({ ms: t.turnMs, at: Date.now() }));
    socket.on("room:left", () => setRoom(null));
    socket.on("error:msg", (m: string) => setErr(m));
    if (name.trim()) connect(name.trim());
    return () => { socket.off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = (event: string, data?: object) => {
    console.log("sending", event, data);
    setErr("");
    socket.emit(event, data);
  };

  if (!joined)
    return (
      <div className="card">
        <h1>Online Ludo</h1>
        <input placeholder="Your name" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={!name.trim()} onClick={() => connect(name.trim())}>Play as guest</button>
      </div>
    );

  if (!room)
    return (
      <div className="card">
        <h1>Online Ludo</h1>
        <p className="muted">Server: {status}</p>
        <button onClick={() => send("room:create")}>Create room</button>
        <div className="or">or join with a code</div>
        <input placeholder="ABC123" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button disabled={code.length !== 6} onClick={() => send("room:join", { code })}>Join room</button>
        {err && <p className="err">{err}</p>}
      </div>
    );

  const me = room.players.find((p) => p.id === gid);
  const isHost = room.hostId === gid;
  const myTurn = room.status === "playing" && me?.seat === room.turn;
  const nameOf = (s: number) => room.players.find((p) => p.seat === s)?.name ?? NAMES[s];

  const playerList = (
    <ul className="players">
      {room.players.map((p) => (
        <li key={p.id} className={room.status === "playing" && p.seat === room.turn ? "turn" : ""}>
          <span className="dot" style={{ background: COLORS[p.seat] }} />
          {p.name}{p.id === gid ? " (you)" : ""}{p.id === room.hostId ? " ★" : ""}
          {!p.connected && <em> offline</em>}
        </li>
      ))}
    </ul>
  );

  if (room.status === "lobby")
    return (
      <div className="card">
        <h1>Lobby</h1>
        <p>Share this code with friends</p>
        <div className="code">{room.code}</div>
        <button className="ghost" onClick={() => navigator.clipboard?.writeText(room.code)}>Copy code</button>
        {playerList}
        <p className="muted">{room.players.length}/4 players</p>
        {isHost ? (
          <button disabled={room.players.length < 2} onClick={() => send("room:start")}>Start game</button>
        ) : (
          <p className="muted">Waiting for the host to start…</p>
        )}
        <button className="ghost" onClick={() => send("room:leave")}>Leave</button>
        {err && <p className="err">{err}</p>}
      </div>
    );

  return (
    <div className="game">
      <div className={"status" + (myTurn ? " mine" : "")} style={room.status === "playing" ? { borderColor: COLORS[room.turn] } : undefined}>
        {room.status === "finished"
          ? "Game over"
          : myTurn
          ? room.dice === null ? "Your turn — roll the dice" : room.legal.length ? "Tap a highlighted token" : "No moves…"
          : `${nameOf(room.turn)}'s turn`}
      </div>
      <Board room={room} mySeat={me?.seat} onMove={(t) => send("game:move", { token: t })} />
      <div className="controls">
        <Dice value={room.dice} canRoll={myTurn && room.dice === null} onRoll={() => send("game:roll")}
          timerMs={room.status === "playing" ? timer.ms : 0} timerKey={timer.at} color={COLORS[room.turn]} />
      </div>
      {room.status === "finished" ? (
        <>
          <ol className="rank">{room.winners.map((s) => <li key={s}><span className="dot" style={{ background: COLORS[s] }} />{nameOf(s)}</li>)}</ol>
          {isHost && <button onClick={() => send("room:rematch")}>Play again</button>}
        </>
      ) : playerList}
      <button className="ghost" onClick={() => setMuted(toggleMute())}>{muted ? "🔇 Sound off" : "🔊 Sound on"}</button>
      <button className="ghost" onClick={() => send("room:leave")}>Leave game</button>
      {err && <p className="err">{err}</p>}
    </div>
  );
}