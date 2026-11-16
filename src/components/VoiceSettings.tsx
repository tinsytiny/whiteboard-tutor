"use client";

import { Check, Play, Settings2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { englishVoices, hdRanOut, loadVoicePrefs, setVoicePrefs, speak, unlockSpeech, voiceQuality, type VoicePrefs } from "@/lib/speech";

const SAMPLE = "Hi, I'm your tutor. Let's work through this together, one step at a time.";

/** Pick the tutor's voice and speed. The device's voices are free and unlimited. */
export function VoiceSettings() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<VoicePrefs>({ voiceName: "", rate: 1, hd: false });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Browser-only settings, read once the page has loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(loadVoicePrefs());
    if (!("speechSynthesis" in window)) return;
    const refresh = () => setVoices(englishVoices());
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", refresh);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const update = (next: Partial<VoicePrefs>) => setPrefs(setVoicePrefs(next));
  const test = () => { unlockSpeech(); window.speechSynthesis?.cancel(); void speak(SAMPLE); };
  const current = voices.find((v) => v.name === prefs.voiceName) ?? voices[0];
  const best = voices.length > 0 && voiceQuality(voices[0]) >= 7;
  const label = (v: SpeechSynthesisVoice) => `${v.name}${voiceQuality(v) >= 7 ? " ★" : ""} · ${v.lang}`;

  return (
    <div ref={panel} className="relative" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Voice settings" className="grid h-11 w-11 place-items-center rounded-full border border-border-input bg-surface text-text transition-colors hover:text-accent">
        <Settings2 size={18} aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label="Voice settings" className="absolute right-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-4 text-left shadow-[0_20px_50px_-15px_rgba(30,40,35,0.35)] animate-[fade-in_150ms_ease-out]">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-text">Tutor&rsquo;s voice</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:text-text"><X size={16} aria-hidden /></button>
          </div>

          <label className="mt-3 block text-sm font-medium text-text" htmlFor="voice-pick">Voice <span className="font-normal text-muted">(free, unlimited)</span></label>
          {voices.length ? (
            <select id="voice-pick" value={current?.name ?? ""} onChange={(e) => update({ voiceName: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-border-input bg-surface px-2 text-base text-text">
              {voices.map((v) => <option key={v.name + v.lang} value={v.name}>{label(v)}</option>)}
            </select>
          ) : (
            <p className="mt-1 text-sm text-muted">This browser has no voices to choose from.</p>
          )}

          <label className="mt-4 block text-sm font-medium text-text" htmlFor="voice-rate">Speed <span className="tabular-nums font-normal text-muted">{prefs.rate.toFixed(2)}×</span></label>
          <input id="voice-rate" type="range" min={0.8} max={1.3} step={0.05} value={prefs.rate} onChange={(e) => update({ rate: Number(e.target.value) })} className="mt-1 w-full accent-[var(--accent)]" />

          <button type="button" onClick={test} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-soft text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-on-accent">
            <Play size={16} aria-hidden /> Test this voice
          </button>

          {!best && voices.length > 0 && (
            <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-text">
              For a more human voice on an iPad: Settings, Accessibility, Spoken Content, Voices, English. Download a voice marked Premium or Enhanced, then reload this page and pick it here (★).
            </p>
          )}

          <div className="mt-4 border-t border-border pt-3">
            <button type="button" role="switch" aria-checked={prefs.hd} onClick={() => update({ hd: !prefs.hd })} className="flex w-full items-start gap-3 text-left">
              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border ${prefs.hd ? "border-accent bg-accent text-on-accent" : "border-border-input"}`}>{prefs.hd && <Check size={14} aria-hidden />}</span>
              <span>
                <span className="block text-sm font-medium text-text">HD voice from Google</span>
                <span className="block text-sm text-muted">
                  {hdRanOut() ? "Today's free HD voice is used up, so the voice above is speaking. It resets daily." : "Very natural, but the free key only allows a little each day. When it runs out, the voice above takes over."}
                </span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
