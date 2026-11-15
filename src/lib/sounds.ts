// Small sounds for the explainer videos, made in the browser with Web Audio,
// so there are no sound files to download and nothing to pay for.

let ctx: AudioContext | null = null;

/** Call inside a tap: iPad Safari only starts audio from one. */
export function startAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, length: number, volume: number, type: OscillatorType = "sine") {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

/** A soft chalk-like scratch as something is written on the board. */
export function chalk() {
  if (!ctx) return;
  const length = 0.18;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.5;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 3200;
  filter.Q.value = 0.9;
  const gain = ctx.createGain();
  gain.gain.value = 0.18;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
}

/** A gentle two-note chime for a new section or a question. */
export function chime(rising = true) {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(rising ? 660 : 880, t, 0.5, 0.08);
  tone(rising ? 880 : 660, t + 0.12, 0.7, 0.07);
}

/** A short three-note flourish at the end. */
export function finale() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.13, 0.9, 0.07, "triangle"));
}

/** A quiet, slowly shifting background pad. Returns a function that stops it. */
export function music(): () => void {
  if (!ctx) return () => {};
  const audio = ctx;
  const master = audio.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(0.035, audio.currentTime + 2);
  master.connect(audio.destination);
  const chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [196, 247, 294]];
  const oscs = chords[0].map((f) => {
    const o = audio.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    o.connect(master);
    o.start();
    return o;
  });
  let step = 0;
  const timer = setInterval(() => {
    step = (step + 1) % chords.length;
    oscs.forEach((o, i) => o.frequency.linearRampToValueAtTime(chords[step][i], audio.currentTime + 1.5));
  }, 6000);
  return () => {
    clearInterval(timer);
    master.gain.linearRampToValueAtTime(0, audio.currentTime + 0.6);
    oscs.forEach((o) => o.stop(audio.currentTime + 0.7));
  };
}
