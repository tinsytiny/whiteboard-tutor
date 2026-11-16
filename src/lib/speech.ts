// The tutor's voice. By default it uses the device's own voices, which are
// free and unlimited; on an iPad, a downloaded Premium or Enhanced voice
// sounds close to human. "HD voice" (Google's Gemini voice through
// /api/voice) is optional, because the free key only allows a little each day;
// when it runs out the device voice takes over, so the tutor never goes quiet.

import { startAudio } from "./sounds";

export const VOICE_KEY = "tutor.voice.v1";
const PREFS_KEY = "tutor.voiceprefs.v1";
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

export type VoicePrefs = { voiceName: string; rate: number; hd: boolean };
let prefs: VoicePrefs = { voiceName: "", rate: 1, hd: false };

export function loadVoicePrefs(): VoicePrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    prefs = {
      voiceName: typeof saved.voiceName === "string" ? saved.voiceName : "",
      rate: typeof saved.rate === "number" && saved.rate >= 0.7 && saved.rate <= 1.4 ? saved.rate : 1,
      hd: saved.hd === true,
    };
  } catch { /* defaults */ }
  return prefs;
}

export function setVoicePrefs(next: Partial<VoicePrefs>): VoicePrefs {
  prefs = { ...prefs, ...next };
  if (next.hd) natural = true; // give HD another try when it is switched back on
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
  if (prefs.hd && natural && typeof window !== "undefined") void clip(text);
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
  const buffer = prefs.hd && natural ? await Promise.race([clip(text), new Promise<null>((r) => setTimeout(() => r(null), 12_000))]) : null;
  if (signal?.aborted) return;
  // A clip can only be heard once audio was started by a tap (iPad Safari).
  if (buffer && startAudio()?.state === "running") return playClip(buffer, signal);
  return browserSpeak(text, signal);
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

