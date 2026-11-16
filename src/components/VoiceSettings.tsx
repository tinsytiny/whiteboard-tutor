"use client";

import { Play, Settings2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  englishVoices,
  hdRanOut,
  kokoro,
  loadVoicePrefs,
  NATURAL_VOICES,
  setVoicePrefs,
  speak,
  unlockSpeech,
  voiceQuality,
  warmNaturalVoice,
  type VoiceEngine,
  type VoicePrefs,
} from "@/lib/speech";

const SAMPLE = "Hi, I'm your tutor. Let's work through this together, one step at a time.";

const ENGINES: { id: VoiceEngine; name: string; blurb: string }[] = [
  { id: "natural", name: "Natural voice", blurb: "Human-sounding and unlimited. Downloads once (about 90 MB), then runs on this device." },
  { id: "device", name: "Device voice", blurb: "Instant and unlimited. Uses the voices already on this device." },
  { id: "hd", name: "HD voice from Google", blurb: "Very natural, but only a little is free each day." },
];

/** Pick how the tutor sounds. */
export function VoiceSettings() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<VoicePrefs>({ engine: "natural", naturalVoice: "af_heart", voiceName: "", rate: 1 });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [status, setStatus] = useState({ state: kokoro.state, progress: kokoro.progress });
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Browser-only settings, read once the page has loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(loadVoicePrefs());
    const sync = () => setStatus({ state: kokoro.state, progress: kokoro.progress });
    kokoro.listeners.add(sync);
    sync();
    if (!("speechSynthesis" in window)) return () => { kokoro.listeners.delete(sync); };
    const refresh = () => setVoices(englishVoices());
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => {
      kokoro.listeners.delete(sync);
      window.speechSynthesis.removeEventListener("voiceschanged", refresh);
    };
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
  const goodDevice = voices.length > 0 && voiceQuality(voices[0]) >= 7;
  const pct = Math.round(status.progress * 100);

  return (
    <div ref={panel} className="relative" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Voice settings" className="grid h-11 w-11 place-items-center rounded-full border border-border-input bg-surface text-text transition-colors hover:text-accent">
        <Settings2 size={18} aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label="Voice settings" className="absolute right-0 top-full z-20 mt-2 max-h-[80dvh] w-[min(23rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border bg-surface p-4 text-left shadow-[0_20px_50px_-15px_rgba(30,40,35,0.35)] animate-[fade-in_150ms_ease-out]">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-text">Tutor&rsquo;s voice</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:text-text"><X size={16} aria-hidden /></button>
          </div>

          <fieldset className="mt-2 flex flex-col gap-2">
            <legend className="sr-only">Voice type</legend>
            {ENGINES.map((e) => (
              <label key={e.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${prefs.engine === e.id ? "border-accent bg-accent-soft" : "border-border"}`}>
                <input type="radio" name="engine" checked={prefs.engine === e.id} onChange={() => update({ engine: e.id })} className="mt-1 accent-[var(--accent)]" />
                <span>
                  <span className="block text-sm font-semibold text-text">{e.name}</span>
                  <span className="block text-sm text-muted">{e.blurb}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {prefs.engine === "natural" && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-text" htmlFor="natural-pick">Natural voice</label>
              <select id="natural-pick" value={prefs.naturalVoice} onChange={(e) => update({ naturalVoice: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-border-input bg-surface px-2 text-base text-text">
                {NATURAL_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <p className="mt-2 text-sm text-muted" aria-live="polite">
                {status.state === "ready" && "Ready. It's saved on this device."}
                {status.state === "loading" && `Downloading the voice… ${pct}%. Until it's ready, the device voice speaks.`}
                {status.state === "idle" && "It starts downloading when you tap Test or start a lesson."}
                {status.state === "failed" && "The natural voice couldn't load in this browser, so the device voice is speaking."}
              </p>
              {status.state === "loading" && (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} /></div>
              )}
              {status.state === "idle" && (
                <button type="button" onClick={() => warmNaturalVoice()} className="mt-2 text-sm font-semibold text-accent underline underline-offset-2">Download it now</button>
              )}
            </div>
          )}

          {prefs.engine !== "hd" || hdRanOut() ? (
            <div className="mt-3">
              <label className="block text-sm font-medium text-text" htmlFor="voice-pick">
                Device voice <span className="font-normal text-muted">{prefs.engine === "device" ? "" : "(used while the other voice isn't ready)"}</span>
              </label>
              {voices.length ? (
                <select id="voice-pick" value={current?.name ?? ""} onChange={(e) => update({ voiceName: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-border-input bg-surface px-2 text-base text-text">
                  {voices.map((v) => <option key={v.name + v.lang} value={v.name}>{v.name}{voiceQuality(v) >= 7 ? " ★" : ""} · {v.lang}</option>)}
                </select>
              ) : (
                <p className="mt-1 text-sm text-muted">This browser has no voices to choose from.</p>
              )}
              {prefs.engine === "device" && !goodDevice && voices.length > 0 && (
                <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-text">
                  For a more human device voice on an iPad: Settings, Accessibility, Spoken Content, Voices, English. Download one marked Premium or Enhanced, then reload this page and pick it here (★).
                </p>
              )}
            </div>
          ) : null}

          {prefs.engine === "hd" && hdRanOut() && (
            <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-text">Today&rsquo;s free HD voice is used up, so the device voice is speaking. Try Natural voice for unlimited use.</p>
          )}

          <label className="mt-4 block text-sm font-medium text-text" htmlFor="voice-rate">Speed <span className="tabular-nums font-normal text-muted">{prefs.rate.toFixed(2)}×</span></label>
          <input id="voice-rate" type="range" min={0.8} max={1.3} step={0.05} value={prefs.rate} onChange={(e) => update({ rate: Number(e.target.value) })} className="mt-1 w-full accent-[var(--accent)]" />

          <button type="button" onClick={test} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-on-accent transition-transform active:scale-[0.98]">
            <Play size={16} aria-hidden /> Test the voice
          </button>
        </div>
      )}
    </div>
  );
}
