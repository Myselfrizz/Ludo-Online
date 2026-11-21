import { useEffect, useRef, useState } from "react";
import { play } from "./sounds";
import type { RoomState } from "./types";

export const COLORS = ["#d93751", "#3dae4f", "#f2b51d", "#3f8fa8"];
export const NAMES = ["Red", "Green", "Yellow", "Blue"];

const TRACK: [number, number][] = [[1, 6]];
for (const [dx, dy, n] of [
  [1, 0, 4], [1, -1, 1], [0, -1, 5], [1, 0, 2], [0, 1, 5], [1, 1, 1],
  [1, 0, 5], [0, 1, 2], [-1, 0, 5], [-1, 1, 1], [0, 1, 5], [-1, 0, 2],
  [0, -1, 5], [-1, -1, 1], [-1, 0, 5], [0, -1, 2],
] as [number, number, number][]) {
  for (let k = 0; k < n; k++) {
    const [x, y] = TRACK[TRACK.length - 1];
    TRACK.push([x + dx, y + dy]);
  }
}
const row = (xs: number[]): [number, number][] => xs.map((x) => [x, 7]);
const col = (ys: number[]): [number, number][] => ys.map((y) => [7, y]);
const COL = [row([1, 2, 3, 4, 5]), col([1, 2, 3, 4, 5]), row([13, 12, 11, 10, 9]), col([13, 12, 11, 10, 9])];
const YARDS = [[0, 0], [9, 0], [9, 9], [0, 9]];
const SAFE_MARKS = [8, 21, 34, 47];
const CREAM = "#fbf9f3"; // light ornaments on the coloured yards
const CELL = "#000000"; // dark board surface
const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // travel direction out of each start square
const dia = (cx: number, cy: number, r: number) => `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;

function pos(s: number, p: number, i: number): [number, number] {
  if (p === -1) return [YARDS[s][0] + 1.8 + (i % 2) * 2.4, YARDS[s][1] + 1.8 + (i >> 1) * 2.4];
  if (p <= 50) return [TRACK[(s * 13 + p) % 52][0] + 0.5, TRACK[(s * 13 + p) % 52][1] + 0.5];
  if (p <= 55) return [COL[s][p - 51][0] + 0.5, COL[s][p - 51][1] + 0.5];
  const c = [[6.9, 7.5], [7.5, 6.9], [8.1, 7.5], [7.5, 8.1]][s];
  const o = (i - 1.5) * 0.18;
  return s % 2 === 0 ? [c[0], c[1] + o] : [c[0] + o, c[1]];
}

type Props = { room: RoomState; mySeat: number | undefined; onMove: (t: number) => void };
type Item = { seat: number; i: number; x: number; y: number; r: number; p: number; moving: boolean };

export default function Board({ room, mySeat, onMove }: Props) {
  // "shown" lags behind the server state and walks tokens forward one square at a time.
  const [shown, setShown] = useState<number[][]>(room.tokens);
  useEffect(() => {
    const id = setInterval(() => {
      setShown((cur) => {
        const T = room.tokens;
        if (cur.length !== T.length) return T;
        let changed = false;
        const nx = cur.map((r, s) => r.map((p, i) => {
          const t = T[s][i];
          if (p === t) return p;
          changed = true;
          return t === -1 || p === -1 || t < p ? t : p + 1;
        }));
        return changed ? nx : cur;
      });
    }, 190);
    return () => clearInterval(id);
  }, [room.tokens]);

  // Sound effects: capture and token reaching home (played when the walking token arrives).
  const prev = useRef<number[][]>(room.tokens);
  useEffect(() => {
    const old = prev.current, now = room.tokens;
    prev.current = now;
    if (!old.length || old.length !== now.length) return;
    let captured = false, home = false, steps = 1;
    now.forEach((r, s) => r.forEach((p, i) => {
      const o = old[s][i];
      if (o >= 0 && p === -1) captured = true;
      else if (o >= 0 && p > o) steps = Math.max(steps, p - o);
      if (p === 56 && o !== 56) home = true;
    }));
    const delay = steps * 190;
    if (captured) setTimeout(() => play("capture"), delay);
    if (home) setTimeout(() => play("home"), captured ? delay + 1000 : delay);
  }, [room.tokens]);

  const settled = shown.length === room.tokens.length &&
    shown.every((r, s) => r.every((p, i) => p === room.tokens[s][i]));
  const active = room.status === "playing" && settled && mySeat === room.turn;

  // Spread tokens that share a square so none is hidden.
  const groups = new Map<string, { seat: number; i: number; pt: [number, number]; p: number }[]>();
  room.players.forEach(({ seat }) =>
    (shown[seat] ?? []).forEach((p, i) => {
      const pt = pos(seat, p, i);
      const k = pt[0].toFixed(2) + "," + pt[1].toFixed(2);
      groups.set(k, [...(groups.get(k) ?? []), { seat, i, pt, p }]);
    })
  );
  const items: Item[] = [];
  groups.forEach((g) => {
    const n = g.length;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const step = 0.92 / cols;
    g.forEach(({ seat, i, pt, p }, idx) => {
      const dx = n === 1 ? 0 : ((idx % cols) - (cols - 1) / 2) * step;
      const dy = n === 1 ? 0 : (Math.floor(idx / cols) - (rows - 1) / 2) * step;
      items.push({ seat, i, x: pt[0] + dx, y: pt[1] + dy, r: n === 1 ? 0.36 : Math.min(0.36, step * 0.46), p, moving: p !== room.tokens[seat]?.[i] });
    });
  });

  return (
    <svg viewBox="-1.2 -1.2 17.4 17.4" className="board">
      <defs>
        <pattern id="key" width="1" height="1" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" fill="#000000" />
          <path d="M.12 .88V.12H.88V.62H.38V.38H.62" fill="none" stroke="#6b7080" strokeWidth=".06" />
          <rect x=".72" y=".72" width=".14" height=".14" fill="#e8e6df" />
        </pattern>
        <pattern id="lat" width=".6" height=".6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0H.6M0 0V.6" stroke="#fff" strokeOpacity=".14" strokeWidth=".05" />
        </pattern>
      </defs>
      <rect x={-1.2} y={-1.2} width={17.4} height={17.4} fill="#000000" />
      <path d="M-1 -1H16V16H-1Z M0 0V15H15V0Z" fillRule="evenodd" fill="url(#key)" stroke="#6b7080" strokeWidth={0.05} />
      <rect x={0} y={0} width={15} height={15} fill={CELL} />

      {YARDS.map(([x, y], s) => {
        const cx = x + 3, cy = y + 3, c = COLORS[s];
        return (
          <g key={s}>
            <rect x={x} y={y} width={6} height={6} fill={c} />
            <rect x={x} y={y} width={6} height={6} fill="url(#lat)" />
            <rect x={x + 0.25} y={y + 0.25} width={5.5} height={5.5} fill="none" stroke={CREAM}
              strokeWidth={0.05} strokeDasharray=".05 .12" strokeLinecap="round" />
            <polygon points={dia(cx, cy, 2.6)} fill="none" stroke={CREAM} strokeWidth={0.07} />
            <polygon points={dia(cx, cy, 1.95)} fill="none" stroke={CREAM} strokeWidth={0.04} strokeOpacity={0.6} />
            {[[0, -1.25], [1.25, 0], [0, 1.25], [-1.25, 0]].map(([dx, dy], k) => (
              <g key={k}>
                <polygon points={dia(cx + dx, cy + dy, 0.6)} fill={CREAM} opacity={0.92} />
                <polygon points={dia(cx + dx, cy + dy, 0.26)} fill={c} opacity={0.85} />
              </g>
            ))}
            <polygon points={dia(cx, cy, 0.3)} fill={CREAM} />
            {[[0.65, 0.65], [5.35, 0.65], [0.65, 5.35], [5.35, 5.35]].map(([dx, dy], k) => (
              <polygon key={"c" + k} points={dia(x + dx, y + dy, 0.24)} fill={CREAM} opacity={0.9} />
            ))}
            {[0, 1, 2, 3].map((i) => {
              const [tx, ty] = pos(s, -1, i);
              return <circle key={"s" + i} cx={tx} cy={ty} r={0.52} fill="#000000" opacity={0.7} />;
            })}
          </g>
        );
      })}

      {TRACK.map(([x, y], i) =>
        i % 13 === 0 ? (
          <rect key={i} x={x + 0.05} y={y + 0.05} width={0.9} height={0.9} fill={COLORS[i / 13]} />
        ) : (
          <rect key={i} x={x} y={y} width={1} height={1} fill={CELL} stroke="#9aa1b2" strokeWidth={0.05}
            strokeDasharray=".04 .1" strokeLinecap="round" />
        )
      )}
      {COL.map((cells, s) =>
        cells.map(([x, y], k) => (
          <rect key={s + "-" + k} x={x + 0.07} y={y + 0.07} width={0.86} height={0.86} fill={COLORS[s]} />
        ))
      )}
      {[0, 1, 2, 3].map((s) => {
        const [cx, cy] = TRACK[s * 13];
        const [dx, dy] = DIR[s];
        const px = cx + 0.5, py = cy + 0.5, nx = -dy, ny = dx;
        return (
          <polygon key={"a" + s} fill={CREAM} opacity={0.92}
            points={`${px + dx * 0.28},${py + dy * 0.28} ${px - dx * 0.2 + nx * 0.22},${py - dy * 0.2 + ny * 0.22} ${px - dx * 0.2 - nx * 0.22},${py - dy * 0.2 - ny * 0.22}`} />
        );
      })}
      {SAFE_MARKS.map((i) => (
        <polygon key={i} points={dia(TRACK[i][0] + 0.5, TRACK[i][1] + 0.5, 0.24)} fill="none" stroke="#c4a86a" strokeWidth={0.06} />
      ))}
      <polygon points="6,6 6,9 7.5,7.5" fill={COLORS[0]} stroke={CELL} strokeWidth={0.05} />
      <polygon points="6,6 9,6 7.5,7.5" fill={COLORS[1]} stroke={CELL} strokeWidth={0.05} />
      <polygon points="9,6 9,9 7.5,7.5" fill={COLORS[2]} stroke={CELL} strokeWidth={0.05} />
      <polygon points="6,9 9,9 7.5,7.5" fill={COLORS[3]} stroke={CELL} strokeWidth={0.05} />
      {items.map(({ seat, i, x, y, r, p, moving }) => {
        const click = active && seat === mySeat && room.legal.includes(i);
        return (
          <g key={seat + "-" + i}
            style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform .19s linear", cursor: click ? "pointer" : "default" }}
            onClick={click ? () => onMove(i) : undefined}>
            <g key={p} className={moving ? "hop" : ""}>
              <circle r={r} fill={COLORS[seat]} stroke={click ? "#fff" : "#000000"}
              strokeWidth={click ? 0.1 : 0.06} className={click ? "pulse" : ""} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}