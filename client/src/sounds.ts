// Sound effects. If /sounds/capture.mp3 or /sounds/home.mp3 exist (client/public/sounds/),
// those play. Otherwise built-in synthesized sounds are used.
let ctx: AudioContext | null = null;
let muted = localStorage.getItem("ludo_muted") === "1";

export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  localStorage.setItem("ludo_muted", muted ? "1" : "0");
  return muted;
}

function ac() {
  if (!ctx) {
    const W = window as unknown as { webkitAudioContext?: typeof AudioContext };
    ctx = new (window.AudioContext || W.webkitAudioContext!)();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol = 0.25, slideTo?: number) {
  const c = ac();
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
  lp.type = "lowpass";
  lp.frequency.value = 1800;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(lp);
  lp.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const synth = {
  capture() { // sad-trombone "wah wah wah waaah"
    ([[233, 0, 0.28], [220, 0.3, 0.28], [208, 0.6, 0.28]] as [number, number, number][])
      .forEach(([f, t, d]) => tone(f, t, d, "sawtooth", 0.28));
    tone(196, 0.9, 0.8, "sawtooth", 0.3, 170);
  },
  home() { // victory fanfare
    [523, 659, 784].forEach((f, i) => tone(f, i * 0.12, 0.14, "square", 0.18));
    tone(1047, 0.36, 0.6, "square", 0.2);
    tone(1319, 0.36, 0.6, "triangle", 0.15);
  },
};

const probed: Record<string, Promise<boolean>> = {};
const hasFile = (n: string) =>
  (probed[n] ??= fetch(`/sounds/${n}.mp3`, { method: "HEAD" })
    .then((r) => r.ok && (r.headers.get("content-type") || "").startsWith("audio"))
    .catch(() => false));

export async function play(name: "capture" | "home") {
  if (muted) return;
  if (await hasFile(name)) {
    try { await new Audio(`/sounds/${name}.mp3`).play(); return; } catch { /* fall back to synth */ }
  }
  synth[name]();
}