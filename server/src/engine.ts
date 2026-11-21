import { randomInt } from "node:crypto";

// Progress per token: -1 = yard, 0..50 = main track, 51..55 = home column, 56 = home.
export const HOME = 56;
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]); // absolute track cells

export type Game = {
  seats: number[];
  tokens: number[][]; // tokens[seat][0..3]
  turn: number;
  dice: number | null;
  legal: number[];
  winners: number[];
};

export const newGame = (seats: number[]): Game => ({
  seats,
  tokens: [0, 1, 2, 3].map(() => [-1, -1, -1, -1]),
  turn: seats[0],
  dice: null,
  legal: [],
  winners: [],
});

const abs = (seat: number, p: number) => (seat * 13 + p) % 52;

export function roll(g: Game) {
  const d = randomInt(1, 7); // cryptographically secure
  g.dice = d;
  g.legal = g.tokens[g.turn].flatMap((p, i) =>
    p === -1 ? (d === 6 ? [i] : []) : p + d <= HOME ? [i] : []
  );
}

function next(g: Game, extra: boolean) {
  g.dice = null;
  g.legal = [];
  if (g.winners.length >= g.seats.length - 1) {
    for (const s of g.seats) if (!g.winners.includes(s)) g.winners.push(s);
    return;
  }
  if (extra && !g.winners.includes(g.turn)) return;
  let i = g.seats.indexOf(g.turn);
  do i = (i + 1) % g.seats.length;
  while (g.winners.includes(g.seats[i]));
  g.turn = g.seats[i];
}

export const pass = (g: Game) => next(g, false);
export const isOver = (g: Game) => g.winners.length === g.seats.length;

export function move(g: Game, i: number) {
  const s = g.turn;
  const d = g.dice!;
  const p = g.tokens[s][i];
  const np = p === -1 ? 0 : p + d;
  g.tokens[s][i] = np;
  let captured = false;
  if (np <= 50 && !SAFE.has(abs(s, np))) {
    for (const o of g.seats) {
      if (o === s) continue;
      g.tokens[o].forEach((q, j) => {
        if (q >= 0 && q <= 50 && abs(o, q) === abs(s, np)) {
          g.tokens[o][j] = -1;
          captured = true;
        }
      });
    }
  }
  if (g.tokens[s].every((q) => q === HOME)) g.winners.push(s);
  next(g, d === 6 || captured || np === HOME); // extra turn
}
