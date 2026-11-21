export type RoomState = {
  code: string;
  hostId: string;
  status: "lobby" | "playing" | "finished";
  players: { id: string; name: string; seat: number; connected: boolean }[];
  turn: number;
  dice: number | null;
  legal: number[];
  tokens: number[][];
  winners: number[];
};
