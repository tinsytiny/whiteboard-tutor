// The tutor's voice, from one of three engines:
// - "natural" (default): Kokoro, a free open-source voice model that runs in
//   the browser. It downloads once (about 90 MB) and then works without limit.
// - "device": the device's own voices, instant and unlimited; on an iPad a
//   downloaded Premium or Enhanced voice sounds close to human.
// - "hd": Google's Gemini voice through /api/voice; very natural, but the free
//   key only allows a little each day.
// Whenever the chosen engine isn't ready, the device voice speaks the line,
// so the tutor never goes quiet.

import { startAudio } from "./sounds";

export const VOICE_KEY = "tutor.voice.v1";
const PREFS_KEY = "tutor.voiceprefs.v1";
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

export type VoiceEngine = "natural" | "device" | "hd";
export type VoicePrefs = { engine: VoiceEngine; naturalVoice: string; voiceName: string; rate: number };
let prefs: VoicePrefs = { engine: "natural", naturalVoice: "af_heart", voiceName: "", rate: 1 };

/** Kokoro's voices that suit a tutor (a = American, b = British; f/m = female/male). */
export const NATURAL_VOICES: { id: string; name: string }[] = [
  { id: "af_heart", name: "Heart (warm, American)" },
  { id: "af_bella", name: "Bella (bright, American)" },
  { id: "am_michael", name: "Michael (calm, American)" },
  { id: "am_fenrir", name: "Fenrir (deep, American)" },
  { id: "bf_emma", name: "Emma (British)" },
  { id: "bm_george", name: "George (British)" },
];

export function loadVoicePrefs(): VoicePrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    prefs = {
      voiceName: typeof saved.voiceName === "string" ? saved.voiceName : "",
      rate: typeof saved.rate === "number" && saved.rate >= 0.7 && saved.rate <= 1.4 ? saved.rate : 1,
      engine: saved.engine === "device" || saved.engine === "hd" ? saved.engine : saved.hd === true ? "hd" : "natural",
      naturalVoice: NATURAL_VOICES.some((v) => v.id === saved.naturalVoice) ? saved.naturalVoice : "af_heart",
    };
  } catch { /* defaults */ }
  return prefs;
}

export function setVoicePrefs(next: Partial<VoicePrefs>): VoicePrefs {
  prefs = { ...prefs, ...next };
  if (next.engine === "hd") natural = true; // give HD another try when it is chosen again
  if (prefs.engine === "natural") warmNaturalVoice();
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* not remembered */ }
  return prefs;
}

/** Higher is more human-sounding. Apple's Premium and Enhanced voices are the best free voices on an iPad. */
export function voiceQuality(v: SpeechSynthesisVoice): number {
  const home = typeof navigator !== "undefined" && v.lang.toLowerCase() === navigator.language.toLowerCase() ? 1 : 0;
  return (
    (/premium/i.test(v.name) ? 10 : /enhanced|natural|neural|online/i.test(v.name) ? 7 : 0) +
    (/google/i.test(v.name) ? 3 : 0) +
    (/\b(ava|zoe|evan|nathan|noelle|joelle|samantha|daniel|karen|serena|matilda|lee|tom|susan|allison)\b/i.test(v.name) ? 2 : 0) +
    (/eloquence|novelty|bells|bubbles|bad news|boing|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|fred|junior|ralph|kathy|grandma|grandpa|rocko|shelley|sandy|flo|reed|eddy/i.test(v.name) ? -20 : 0) +
    home
  );
}

/** The device's English voices, best first. */
export function englishVoices(): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => /^en/i.test(v.lang))
    .sort((a, b) => voiceQuality(b) - voiceQuality(a) || a.name.localeCompare(b.name));
}

function chosenVoice(): SpeechSynthesisVoice | undefined {
  const voices = englishVoices();
  return voices.find((v) => v.name === prefs.voiceName) ?? voices[0];
}

/** Whether HD voice ran out during this visit. */
export const hdRanOut = () => !natural;

/**
 * iPad and iPhone Safari only allow speech that starts from a tap. Calling this
 * inside a tap (send, the sound button, replay) unlocks speech for the lesson
 * that follows, even though the tutor's words arrive a moment later.
 */
export function unlockSpeech() {
  startAudio();
  if (prefs.engine === "natural") warmNaturalVoice();
  if (!canSpeak()) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

let natural = true; // false once the HD voice service says no during this visit
const clips = new Map<string, Promise<AudioBuffer | null>>();

function clip(text: string): Promise<AudioBuffer | null> {
  const key = text.trim();
  let found = clips.get(key);
  if (!found) {
    found = (async () => {
      if (!natural) return null;
      try {
        const res = await fetch(`/api/voice?text=${encodeURIComponent(key)}`);
        if (!res.ok) {
          if (res.status === 429 || res.status === 503) natural = false;
          return null;
        }
        const ctx = startAudio();
        if (!ctx) return null;
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      }
    })();
    clips.set(key, found);
    if (clips.size > 200) clips.delete(clips.keys().next().value!);
  }
  return found;
}

/** Start fetching a line's voice early, so it is ready when its turn comes. */
export function prefetchVoice(text: string) {
  if (typeof window === "undefined") return;
  if (prefs.engine === "hd" && natural) void clip(text);
  if (prefs.engine === "natural" && kokoro.state === "ready") void naturalClip(text);
}

function playClip(buffer: AudioBuffer, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const ctx = startAudio();
    if (!ctx) return resolve();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const done = () => { signal?.removeEventListener("abort", stop); resolve(); };
    const stop = () => { try { src.stop(); } catch { /* already stopped */ } done(); };
    src.onended = done;
    signal?.addEventListener("abort", stop);
    src.start();
  });
}

/** Says a line: HD voice when it's switched on and available, otherwise the device's voice. */
export async function speak(text: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  const source =
    prefs.engine === "hd" && natural ? clip(text)
    : prefs.engine === "natural" && kokoro.state === "ready" ? naturalClip(text)
    : null;
  const buffer = source ? await Promise.race([source, new Promise<null>((r) => setTimeout(() => r(null), 12_000))]) : null;
  if (signal?.aborted) return;
  // A clip can only be heard once audio was started by a tap (iPad Safari).
  if (buffer && startAudio()?.state === "running") return playClip(buffer, signal);
  return browserSpeak(text, signal);
}

// ---- Kokoro, the in-browser natural voice ----

type KokoroState = "idle" | "loading" | "ready" | "failed";
export const kokoro: { state: KokoroState; progress: number; listeners: Set<() => void> } = { state: "idle", progress: 0, listeners: new Set() };
let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, (buffer: AudioBuffer | null) => void>();
const naturalClips = new Map<string, Promise<AudioBuffer | null>>();
const changed = () => kokoro.listeners.forEach((f) => f());

/** Starts downloading the natural voice in the background (once per visit; the browser keeps the files). */
export function warmNaturalVoice() {
  if (typeof window === "undefined" || worker || typeof Worker === "undefined") return;
  try {
    worker = new Worker("/voice/worker.js", { type: "module" });
  } catch {
    kokoro.state = "failed"; changed(); return;
  }
  kokoro.state = "loading"; changed();
  worker.onmessage = (event: MessageEvent) => {
    const msg = event.data;
    if (msg.type === "progress") { kokoro.progress = msg.total ? msg.loaded / msg.total : 0; changed(); }
    else if (msg.type === "ready") { kokoro.state = "ready"; kokoro.progress = 1; changed(); }
    else if (msg.type === "failed") { kokoro.state = "failed"; changed(); console.warn("natural voice failed to load", msg.message); }
    else if (msg.type === "audio" || msg.type === "error") {
      const done = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (!done) return;
      const ctx = startAudio();
      if (msg.type === "error" || !ctx) return done(null);
      const samples = msg.samples as Float32Array;
      const buffer = ctx.createBuffer(1, samples.length, msg.rate);
      buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      done(buffer);
    }
  };
  worker.onerror = () => { kokoro.state = "failed"; changed(); };
  worker.postMessage({ type: "load" });
}

function naturalClip(text: string): Promise<AudioBuffer | null> {
  const key = `${prefs.naturalVoice}|${prefs.rate}|${text.trim()}`;
  let found = naturalClips.get(key);
  if (!found && worker) {
    const id = nextId++;
    found = new Promise((resolve) => waiting.set(id, resolve));
    worker.postMessage({ type: "say", id, text: text.trim(), voice: prefs.naturalVoice, speed: prefs.rate });
    naturalClips.set(key, found);
    if (naturalClips.size > 200) naturalClips.delete(naturalClips.keys().next().value!);
  }
  return found ?? Promise.resolve(null);
}

function browserSpeak(text: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak() || signal?.aborted) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const voice = chosenVoice();
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = prefs.rate;
    // Some browsers never fire "end", so don't let the board wait forever.
    const guard = setTimeout(done, 2500 + (text.length * 110) / prefs.rate);
    function done() { clearTimeout(guard); signal?.removeEventListener("abort", done); resolve(); }
    u.onend = done;
    u.onerror = done;
    signal?.addEventListener("abort", done);
    window.speechSynthesis.speak(u);
  });
}

