// The tutor's voice. First choice is a natural, human-sounding voice from
// Google's free Gemini speech model (through /api/voice). If that isn't
// available, for example when the free daily allowance is used up, the
// browser's own built-in voice takes over, so the tutor never goes quiet.

import { startAudio } from "./sounds";

export const VOICE_KEY = "tutor.voice.v1";
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** The clearest English voice the device has: Apple's enhanced voices, then Google's, then any English. */
function bestVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  const rank = (v: SpeechSynthesisVoice) =>
    (/premium|enhanced|natural|neural/i.test(v.name) ? 4 : 0) + (/google|samantha|daniel|karen|serena|ava|zoe/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
  return voices.sort((a, b) => rank(b) - rank(a))[0];
}

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

let natural = true; // switched off for this visit if the voice service says no
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
  if (natural && typeof window !== "undefined") void clip(text);
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

/** Says a line, in the natural voice when it can, otherwise the browser's voice. */
export async function speak(text: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  const buffer = natural ? await Promise.race([clip(text), new Promise<null>((r) => setTimeout(() => r(null), 12_000))]) : null;
  if (signal?.aborted) return;
  // A clip can only be heard once audio was started by a tap (iPad Safari).
  if (buffer && startAudio()?.state === "running") return playClip(buffer, signal);
  return browserSpeak(text, signal);
}

function browserSpeak(text: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak() || signal?.aborted) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const voice = bestVoice();
    if (voice) u.voice = voice;
    u.rate = 1.02;
    // Some browsers never fire "end", so don't let the board wait forever.
    const guard = setTimeout(done, 2500 + text.length * 110);
    function done() { clearTimeout(guard); signal?.removeEventListener("abort", done); resolve(); }
    u.onend = done;
    u.onerror = done;
    signal?.addEventListener("abort", done);
    window.speechSynthesis.speak(u);
  });
}

