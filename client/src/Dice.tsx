import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

// Face N shows when the die is rotated by PER_FACE[N-1] (from the reference code).
const PER_FACE = [
  [-0.1, 0.3, -1], [-0.1, 0.6, -0.4], [-0.85, -0.42, 0.73],
  [-0.8, 0.3, -0.75], [0.3, 0.45, 0.9], [-0.16, 0.6, 0.18],
];
const PIPS = [[4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
const FACES = ["front", "up", "left", "right", "bottom", "back"];

const TURN_MS = 30000;

type Props = {
  value: number | null; canRoll: boolean; onRoll: () => void;
  timerMs?: number; timerKey?: number; color?: string;
};

export default function Dice({ value, canRoll, onRoll, timerMs = 0, timerKey = 0, color = "#888" }: Props) {
  // "tapped" = the player pressed the dice and we're waiting for the server's result.
  const [tapped, setTapped] = useState(false);
  useEffect(() => { if (value !== null) setTapped(false); }, [value]);
  useEffect(() => {
    if (!tapped) return;
    const id = setTimeout(() => setTapped(false), 3000); // safety if the server never answers
    return () => clearTimeout(id);
  }, [tapped]);

  const tumbling = tapped && value === null;
  const state = value ? "throw" : tumbling ? "tumble" : "idle";
  const transform = value
    ? `rotate3d(${PER_FACE[value - 1].join(",")}, 180deg)`
    : "rotate3d(0, 0.9, 0.9, 90deg)";
  const clickable = canRoll && !tumbling;

  return (
    <div className="diceBox">
      <div className="stageWrap">
      <div className={"stage" + (clickable ? " can" : "")}
        onClick={clickable ? () => { setTapped(true); onRoll(); } : undefined}>
        {/* key remounts the dice so the throw animation replays on every roll */}
        <div key={state} className={"roller " + state} style={{ "--dc": color } as CSSProperties}>
          <div className="shadow" />
          <div className={"die " + state} style={{ transform }}>
            {PIPS.map((pips, f) => (
              <div key={f} className={"face " + FACES[f]}>
                {Array.from({ length: 9 }, (_, c) => <i key={c} className={pips.includes(c) ? "pip" : ""} />)}
              </div>
            ))}
          </div>
        </div>
      </div>
      {timerMs > 0 && (
        <svg className="ring" style={{ filter: `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 9px ${color}) drop-shadow(0 0 20px ${color})` }}>
          <rect x={0} y={0} width="100%" height="100%" rx={18} fill="none" stroke={color} strokeOpacity={0.2} strokeWidth={4} />
          <rect key={timerKey} x={0} y={0} width="100%" height="100%" rx={18} fill="none" stroke={color} strokeWidth={4}
            strokeLinecap="round" pathLength={100} strokeDasharray={100}
            style={{ strokeDashoffset: (1 - Math.min(timerMs, TURN_MS) / TURN_MS) * 100, animation: `drain ${timerMs}ms linear forwards` }} />
        </svg>
      )}
      </div>
      <div className="hint">{clickable ? "Tap the dice to roll" : value ? `Rolled ${value}` : "\u00a0"}</div>
    </div>
  );
}