// The tutor's voice: the browser's own speech, which is free and works offline.

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
  if (!canSpeak()) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function speak(text: string, signal?: AbortSignal): Promise<void> {
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

