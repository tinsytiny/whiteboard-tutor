"use client";

import { ChevronLeft, ChevronRight, Music, Pause, Play, RotateCcw, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardAction, Turn } from "@/lib/board";
import { chalk, chime, finale, music, startAudio } from "@/lib/sounds";
import { canSpeak, prefetchVoice, speak, unlockSpeech } from "@/lib/speech";
import { focusFor, isBoardAction, Item } from "./Board";

// A lesson played back as an explainer video: each question becomes a title
// card, the board fills in step by step, the tutor's words are spoken and shown
// as captions, with quiet music and sound effects. It is built from the lesson
// itself, so it is instant and free.

type Step =
  | { kind: "title"; text: string; chapter: number }
  | { kind: "say"; text: string; question: boolean; chapter: number; mark?: string }
  | { kind: "board"; action: BoardAction; chapter: number };

function stepsOf(turns: Turn[]): Step[] {
  const steps: Step[] = [];
  let chapter = -1;
  for (const t of turns) {
    if (t.role === "student") {
      chapter++;
      steps.push({ kind: "title", text: t.text, chapter });
    } else {
      if (chapter < 0) chapter = 0;
      for (const a of t.actions) {
        if (a.t === "say" || a.t === "ask") steps.push({ kind: "say", text: a.text, question: a.t === "ask", chapter, mark: a.t === "say" ? a.mark : undefined });
        else if (isBoardAction(a)) steps.push({ kind: "board", action: a, chapter });
      }
    }
  }
  return steps;
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

const TOGGLE = "inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors active:scale-[0.97]";

export function VideoPlayer({ turns, title, onClose }: { turns: Turn[]; title: string; onClose: () => void }) {
  const steps = useMemo(() => stepsOf(turns), [turns]);
  const [at, setAt] = useState(0); // the step on screen now
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState(true);
  const [effects, setEffects] = useState(true);
  const [withMusic, setWithMusic] = useState(true);
  const [done, setDone] = useState(false);

  const run = useRef<AbortController | null>(null);
  const stopMusic = useRef<(() => void) | null>(null);
  const opts = useRef({ voice, effects });
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => { opts.current = { voice, effects }; }, [voice, effects]);

  const current = steps[Math.min(at, steps.length - 1)];
  const chapter = current?.chapter ?? 0;
  const chapters = steps.length ? steps[steps.length - 1].chapter + 1 : 0;
  const shown = steps.slice(0, at + 1).filter((s): s is Extract<Step, { kind: "board" }> => s.kind === "board" && s.chapter === chapter);
  const caption = [...steps.slice(0, at + 1)].reverse().find((s) => s.chapter === chapter && s.kind === "say") as Extract<Step, { kind: "say" }> | undefined;
  const focus = current?.kind === "say" && !current.question ? focusFor(shown.map((s) => s.action), current.mark) : current?.kind === "board" ? shown.length - 1 : -1;

  const stop = useCallback(() => {
    run.current?.abort();
    run.current = null;
    window.speechSynthesis?.cancel();
    stopMusic.current?.();
    stopMusic.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback(
    (from: number) => {
      stop();
      // Both of these must start inside the tap, for iPad Safari.
      unlockSpeech();
      startAudio();
      if (withMusic) stopMusic.current = music();
      const ctrl = new AbortController();
      run.current = ctrl;
      setPlaying(true);
      setDone(false);
      void (async () => {
        for (let i = from; i < steps.length; i++) {
          if (ctrl.signal.aborted) return;
          setAt(i);
          const s = steps[i];
          const { voice: talk, effects: fx } = opts.current;
          // Fetch the next two lines' voices while this one plays.
          if (talk) steps.slice(i + 1, i + 6).filter((n) => n.kind === "say").slice(0, 2).forEach((n) => prefetchVoice((n as { text: string }).text));
          if (s.kind === "title") {
            if (fx) chime(true);
            await wait(2600, ctrl.signal);
          } else if (s.kind === "say") {
            if (fx && s.question) chime(false);
            if (talk && canSpeak()) await speak(s.text, ctrl.signal);
            else await wait(Math.min(900 + s.text.length * 45, 6000), ctrl.signal);
            await wait(250, ctrl.signal);
          } else {
            if (fx) chalk();
            await wait(s.action.t === "plot" ? 1800 : 1100, ctrl.signal);
          }
        }
        if (ctrl.signal.aborted) return;
        if (opts.current.effects) finale();
        stopMusic.current?.();
        stopMusic.current = null;
        run.current = null;
        setPlaying(false);
        setDone(true);
      })();
    },
    [steps, stop, withMusic],
  );

  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    stage.current?.querySelector("[data-latest]")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [shown.length]);

  const toggle = () => (playing ? stop() : play(done ? 0 : at));
  const seek = (i: number) => {
    const target = Math.max(0, Math.min(steps.length - 1, i));
    if (playing) play(target);
    else { setAt(target); setDone(false); }
  };
  const flipMusic = () => {
    const next = !withMusic;
    setWithMusic(next);
    if (!next) { stopMusic.current?.(); stopMusic.current = null; }
    else if (playing) { startAudio(); stopMusic.current = music(); }
  };

  if (steps.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Video: ${title}`}
      className="fixed inset-0 z-30 flex flex-col bg-[#18201d] text-[#f3efe6] animate-[fade-in_200ms_ease-out]"
      onKeyDown={(e) => {
        if (e.key === "Escape") { stop(); onClose(); }
        if (e.key === " " && (e.target as HTMLElement).tagName !== "BUTTON") { e.preventDefault(); toggle(); }
      }}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-sm">
          <span className="font-semibold">Video</span>
          <span className="opacity-60"> · {title}{chapters > 1 ? ` · part ${chapter + 1} of ${chapters}` : ""}</span>
        </p>
        <button type="button" autoFocus onClick={() => { stop(); onClose(); }} className={`${TOGGLE} bg-white/10 hover:bg-white/20`}>
          <X size={16} aria-hidden /> Close
        </button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <div className="relative aspect-video max-h-full w-full max-w-6xl overflow-hidden rounded-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
          <div ref={stage} className="board-paper absolute inset-0 overflow-y-auto px-[6%] pb-28 pt-[4%]">
            <div className="flex flex-col gap-3 [&_.board-math]:sm:text-2xl">
              {shown.map((s, i) => (
                <div key={`${chapter}-${i}`} className={`board-item rise ${i === focus ? "focus" : ""}`} {...(i === shown.length - 1 ? { "data-latest": "" } : {})}>
                  <Item a={s.action} />
                </div>
              ))}
            </div>
          </div>

          {current?.kind === "title" && (
            <div key={`title-${chapter}`} className="absolute inset-0 grid place-items-center bg-[#1f2b27]/92 p-8 text-center animate-[fade-in_300ms_ease-out]">
              <div className="rise max-w-3xl">
                <p className="flex items-center justify-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#9fd3bf]">
                  <Sparkles size={16} aria-hidden /> {chapters > 1 ? `Part ${chapter + 1}` : "Today's question"}
                </p>
                <p className="mt-4 text-balance text-2xl font-semibold leading-tight text-white sm:text-4xl">{current.text}</p>
              </div>
            </div>
          )}

          {caption && current?.kind !== "title" && (
            <p key={caption.text} aria-live="polite" className="absolute inset-x-[4%] bottom-[5%] rounded-xl bg-[#18201d]/85 px-4 py-3 text-center text-base leading-snug text-white backdrop-blur-sm animate-[fade-in_250ms_ease-out] sm:text-xl">
              {caption.question && <span className="mr-2 font-semibold text-[#9fd3bf]">Your turn:</span>}
              {caption.text}
            </p>
          )}

          {!playing && (
            <button type="button" onClick={toggle} aria-label={done ? "Watch again" : at === 0 ? "Play video" : "Carry on"} className="absolute inset-0 grid place-items-center bg-black/25 transition-colors hover:bg-black/15">
              <span className="grid h-20 w-20 place-items-center rounded-full bg-white text-[#18201d] shadow-xl transition-transform active:scale-95">
                {done ? <RotateCcw size={30} aria-hidden /> : <Play size={34} aria-hidden className="ml-1" />}
              </span>
            </button>
          )}
        </div>
      </div>

      <footer className="flex flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex gap-0.5" aria-hidden>
          {steps.map((s, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              onClick={() => seek(i)}
              className={`h-2 flex-1 rounded-full transition-colors ${i <= at ? "bg-[#9fd3bf]" : "bg-white/15 hover:bg-white/30"} ${s.kind === "title" && i > 0 ? "ml-1.5" : ""}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => seek(at - 1)} aria-label="Back a step" className={`${TOGGLE} hover:bg-white/10`}><ChevronLeft size={20} aria-hidden /></button>
            <button type="button" onClick={toggle} className={`${TOGGLE} bg-white px-5 text-[#18201d]`}>
              {playing ? <Pause size={18} aria-hidden /> : done ? <RotateCcw size={18} aria-hidden /> : <Play size={18} aria-hidden />}
              {playing ? "Pause" : done ? "Watch again" : at === 0 ? "Play" : "Carry on"}
            </button>
            <button type="button" onClick={() => seek(at + 1)} aria-label="Forward a step" className={`${TOGGLE} hover:bg-white/10`}><ChevronRight size={20} aria-hidden /></button>
            <span className="ml-2 text-sm tabular-nums opacity-60">{at + 1} / {steps.length}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => { if (voice) window.speechSynthesis?.cancel(); setVoice(!voice); }} aria-pressed={voice} className={`${TOGGLE} ${voice ? "bg-[#2e5a4c]" : "bg-white/10 opacity-70"}`}>
              {voice ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />} Voice
            </button>
            <button type="button" onClick={flipMusic} aria-pressed={withMusic} className={`${TOGGLE} ${withMusic ? "bg-[#2e5a4c]" : "bg-white/10 opacity-70"}`}>
              <Music size={16} aria-hidden /> Music
            </button>
            <button type="button" onClick={() => setEffects(!effects)} aria-pressed={effects} className={`${TOGGLE} ${effects ? "bg-[#2e5a4c]" : "bg-white/10 opacity-70"}`}>
              <Sparkles size={16} aria-hidden /> Sounds
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
