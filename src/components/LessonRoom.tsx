"use client";

import { ArrowLeft, ArrowUp, BookOpen, Clapperboard, Library as LibraryIcon, FileText, GraduationCap, Hand, Lightbulb, ListChecks, Mic, Paperclip, Play, Plus, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ATTACH_MAX_BYTES, ATTACH_MAX_FILES, ATTACH_TYPES, readActions, type Attachment, type BoardAction, type LessonMode, type Turn } from "@/lib/board";
import { APP_NAME } from "@/lib/brand";
import type { Recap } from "@/lib/recap";
import { getFiles, keepFile, listFiles, removeFile, viewFile, type StoredFile } from "@/lib/files";
import { deleteLesson, loadLessons, saveLesson, type SavedLesson } from "@/lib/store";
import { Library } from "./Library";
import { VideoPlayer } from "./VideoPlayer";
import { canSpeak, prefetchVoice, speak, unlockSpeech, VOICE_KEY } from "@/lib/speech";
import { Board, isBoardAction } from "./Board";
import { RecapView } from "./RecapView";

type Line = { who: "student" | "tutor" | "problem"; text: string; question?: boolean; files?: string[] };

const MODES: { id: LessonMode; name: string; blurb: string; placeholder: string; icon: typeof BookOpen }[] = [
  { id: "topic", name: "Understand a topic", blurb: "Have an idea explained step by step until it makes sense.", placeholder: "What are you stuck on? For example: why does a negative times a negative give a positive?", icon: Lightbulb },
  { id: "homework", name: "Work through a problem", blurb: "Get one hint at a time, so the answer is yours.", placeholder: "Type the problem, and say how far you got.", icon: BookOpen },
  { id: "exam", name: "Revise for a test", blurb: "Run through your notes, spot the traps, then get quizzed.", placeholder: "Paste your notes or list the topics on the test.", icon: GraduationCap },
];

const BTN = "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-surface px-3 text-sm text-text disabled:opacity-40";

/** A pause that ends at once if the student interrupts. */
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const id = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(id); resolve(); }, { once: true });
  });

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Speech recognition is not in every browser, and has no standard TypeScript type yet.
type Recognizer = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
function recognizer(): Recognizer | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/** A finished lesson drawn all at once, from its turns. */
function render(turns: Turn[]): { lines: Line[]; board: BoardAction[] } {
  const lines: Line[] = [];
  const board: BoardAction[] = [];
  for (const t of turns) {
    if (t.role === "student") lines.push({ who: "student", text: t.text, files: t.fileNames ?? t.files?.map((f) => f.name) });
    else for (const a of t.actions) {
      if (a.t === "say" || a.t === "ask") lines.push({ who: "tutor", text: a.text, question: a.t === "ask" });
      else if (isBoardAction(a)) board.push(a);
    }
  }
  return { lines, board };
}

const titleOf = (turns: Turn[]) => {
  const first = turns.find((t) => t.role === "student");
  const text = first && first.role === "student" ? first.text.replace(/\s+/g, " ").trim() : "Lesson";
  return text.length > 70 ? text.slice(0, 67) + "…" : text;
};

export function LessonRoom() {
  const [mode, setMode] = useState<LessonMode>("topic");
  const [started, setStarted] = useState(false);
  const [draft, setDraft] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [board, setBoard] = useState<BoardAction[]>([]);
  const [busy, setBusy] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [voice, setVoice] = useState(true);
  const [canTalk, setCanTalk] = useState(false);
  const [sample, setSample] = useState(false);
  const [files, setFiles] = useState<(Attachment & { bytes: number })[]>([]);
  const [fileNote, setFileNote] = useState("");
  const [saved, setSaved] = useState<SavedLesson[]>([]);
  const [kept, setKept] = useState<StoredFile[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [video, setVideo] = useState<{ turns: Turn[]; title: string } | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [recapSample, setRecapSample] = useState(false);
  const [recapState, setRecapState] = useState<"idle" | "loading" | "error">("idle");
  const [view, setView] = useState<"room" | "recap">("room");
  const [canListen, setCanListen] = useState(false);
  const [listening, setListening] = useState(false);

  const picker = useRef<HTMLInputElement>(null);
  const turns = useRef<Turn[]>([]);
  const lessonId = useRef("");
  const recapRef = useRef<Recap | null>(null);
  const abort = useRef<AbortController | null>(null);
  const ear = useRef<Recognizer | null>(null);
  const voiceRef = useRef(voice);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { voiceRef.current = voice; }, [voice]);
  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [lines.length, busy]);
  useEffect(() => {
    // Browser-only state, read after the page has loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(loadLessons());
    void listFiles().then(setKept);
    setCanListen(recognizer() !== null);
    setCanTalk(canSpeak());
    try { if (localStorage.getItem(VOICE_KEY) === "off") setVoice(false); } catch { /* storage blocked: keep sound on */ }
    if (canSpeak()) window.speechSynthesis.getVoices(); // starts loading the voice list
    return () => { abort.current?.abort(); window.speechSynthesis?.cancel(); ear.current?.stop(); };
  }, []);

  const persist = useCallback((m: LessonMode) => {
    const kept = turns.current.filter((t) => t.role === "student" || t.actions.length > 0);
    if (!lessonId.current || !kept.some((t) => t.role === "tutor")) return;
    setSaved(saveLesson({ id: lessonId.current, mode: m, title: titleOf(kept), updatedAt: Date.now(), turns: kept, recap: recapRef.current ?? undefined }));
  }, []);

  const addFiles = useCallback(async (incoming: File[]) => {
    if (incoming.length === 0) return;
    setFileNote("");
    const next = [...files];
    for (const f of incoming) {
      if (/\.note$/i.test(f.name)) { setFileNote("Notability's own .note files can't be read yet. In Notability choose Share, then PDF, and add that instead."); continue; }
      if (!ATTACH_TYPES.includes(f.type)) { setFileNote(`${f.name} isn't a PDF or picture, so it wasn't added.`); continue; }
      if (next.length >= ATTACH_MAX_FILES) { setFileNote(`You can add up to ${ATTACH_MAX_FILES} files to one message.`); break; }
      if (next.reduce((n, x) => n + x.bytes, 0) + f.size > ATTACH_MAX_BYTES) { setFileNote(`${f.name || "That file"} is too large for now. The limit is 4 MB a message, so try fewer pages.`); continue; }
      next.push({ name: f.name || "Pasted page", type: f.type, data: await toBase64(f), bytes: f.size });
    }
    setFiles(next);
  }, [files]);

  const show = useCallback(async (a: BoardAction, signal: AbortSignal) => {
    if (a.t === "say" || a.t === "ask") {
      setLines((l) => [...l, { who: "tutor", text: a.text, question: a.t === "ask" }]);
      // Pace the lesson to the speed of speech, so the board keeps step with the voice.
      if (voiceRef.current) await speak(a.text, signal);
      else await wait(Math.min(350 + a.text.length * 28, 4200), signal);
    } else if (a.t === "error") {
      setLines((l) => [...l, { who: "problem", text: a.text }]);
    } else if (isBoardAction(a)) {
      setBoard((b) => [...b, a]);
      await wait(a.t === "plot" ? 1500 : 700, signal);
    }
    if (signal.aborted) throw new DOMException("interrupted", "AbortError");
  }, []);

  const toggleVoice = () => {
    const next = !voice;
    if (next) unlockSpeech(); else window.speechSynthesis?.cancel();
    setVoice(next);
    try { localStorage.setItem(VOICE_KEY, next ? "on" : "off"); } catch { /* not remembered, that's fine */ }
  };

  const hear = (text: string) => { window.speechSynthesis?.cancel(); void speak(text); };

  const interrupt = useCallback(() => {
    abort.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  const send = useCallback(async (text: string) => {
    const attached = files.map(({ name, type, data, id }) => ({ name, type, data, id: id ?? crypto.randomUUID() }));
    const said = text.trim() || (attached.length ? "Here are my pages. Please take a look." : "");
    if (!said) return;
    if (!lessonId.current) lessonId.current = crypto.randomUUID();
    if (attached.length) {
      // Keep every page in the Library. A page brought back from the Library is already there.
      const lessonTitle = titleOf(turns.current.length ? turns.current : [{ role: "student", text: said }]);
      const fresh = files.filter((f) => !f.id);
      void Promise.all(
        attached.map((f, i) => (files[i]?.id ? null : keepFile({ ...f, bytes: files[i]?.bytes ?? 0, addedAt: Date.now(), lessonId: lessonId.current, lessonTitle }))),
      ).then(() => (fresh.length ? listFiles().then(setKept) : undefined));
    }
    setDraft("");
    setFiles([]);
    setFileNote("");
    setStarted(true);
    setView("room");
    // The lesson has moved on, so an earlier recap no longer covers it.
    recapRef.current = null; setRecap(null); setRecapState("idle");
    setLines((l) => [...l, { who: "student", text: said, files: attached.map((f) => f.name) }]);
    const request: Turn[] = [...turns.current, { role: "student", text: said, ...(attached.length ? { files: attached, fileIds: attached.map((f) => f.id) } : {}) }];
    // The tutor's turn is recorded as it is revealed, so an interrupted
    // explanation stays in the lesson's history exactly as far as it got.
    const shown: BoardAction[] = [];
    turns.current = [...request, { role: "tutor", actions: shown }];

    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true);
    try {
      const res = await fetch("/api/lesson", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, turns: request.filter((t) => t.role === "student" || t.actions.length > 0) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`lesson request failed: ${res.status}`);
      setSample(res.headers.get("x-tutor") === "demo");
      // Read the tutor's reply as it streams in, while showing it at the pace of
      // the voice, so each line's voice can be fetched before its turn comes.
      const queue: BoardAction[] = [];
      let ended = false;
      const arrived = { wake: null as (() => void) | null };
      const reading = (async () => {
        try {
          for await (const a of readActions(res.body!)) {
            queue.push(a);
            if (voiceRef.current && (a.t === "say" || a.t === "ask")) prefetchVoice(a.text);
            arrived.wake?.();
          }
        } finally {
          ended = true;
          arrived.wake?.();
        }
      })();
      while (true) {
        const a = queue.shift();
        if (a) {
          if (a.t !== "error") shown.push(a);
          await show(a, ctrl.signal);
        } else if (ended) break;
        else await new Promise<void>((r) => { arrived.wake = r; });
        arrived.wake = null;
      }
      await reading;
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setLines((l) => [...l, { who: "problem", text: "Something went wrong reaching the tutor. Try sending that again." }]);
      }
    } finally {
      persist(mode);
      if (abort.current === ctrl) { abort.current = null; setBusy(false); }
    }
  }, [mode, show, files, persist]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) interrupt();
    if (voice) unlockSpeech();
    void send(draft);
  };

  const addFromLibrary = (f: StoredFile) => {
    setLibraryOpen(false);
    setFileNote("");
    if (files.some((x) => x.id === f.id)) return;
    if (files.length >= ATTACH_MAX_FILES) { setFileNote(`You can add up to ${ATTACH_MAX_FILES} files to one message.`); return; }
    if (files.reduce((n, x) => n + x.bytes, 0) + f.bytes > ATTACH_MAX_BYTES) { setFileNote(`${f.name} would take this message over the 4 MB limit, so send the other pages first.`); return; }
    setFiles([...files, { id: f.id, name: f.name, type: f.type, data: f.data, bytes: f.bytes }]);
  };

  const forgetFile = (id: string) => {
    setKept((k) => k.filter((f) => f.id !== id));
    void removeFile(id);
  };

  const reset = () => {
    setLibraryOpen(false);
    interrupt();
    ear.current?.stop();
    turns.current = []; lessonId.current = ""; recapRef.current = null;
    setLines([]); setBoard([]); setStarted(false); setDraft(""); setSample(false); setFiles([]); setFileNote("");
    setRecap(null); setRecapState("idle"); setView("room"); setReplaying(false);
  };

  const open = (l: SavedLesson) => {
    interrupt();
    setLibraryOpen(false);
    turns.current = l.turns; lessonId.current = l.id; recapRef.current = l.recap ?? null;
    // Bring the lesson's pages back from the Library, so the tutor can still see them if you carry on.
    void (async () => {
      const ids = l.turns.flatMap((t) => (t.role === "student" ? (t.fileIds ?? []) : []));
      if (!ids.length) return;
      const found = await getFiles(ids);
      if (lessonId.current !== l.id) return;
      turns.current = turns.current.map((t) => {
        if (t.role !== "student" || !t.fileIds?.length) return t;
        const pages = t.fileIds.flatMap((id) => found.filter((f) => f.id === id).map(({ id: fid, name, type, data }) => ({ id: fid, name, type, data })));
        return pages.length ? { ...t, files: pages } : t;
      });
    })();
    const r = render(l.turns);
    setMode(l.mode); setLines(r.lines); setBoard(r.board); setStarted(true); setSample(false);
    setRecap(l.recap ?? null); setRecapSample(false); setRecapState("idle"); setView("room");
  };

  /** Step back through the lesson as it was taught. Stopping shows the whole lesson again. */
  const replay = async () => {
    interrupt();
    if (voice) unlockSpeech();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLines([]); setBoard([]); setBusy(true); setReplaying(true); setView("room");
    try {
      for (const t of turns.current) {
        if (t.role === "student") {
          setLines((l) => [...l, { who: "student", text: t.text, files: t.fileNames ?? t.files?.map((f) => f.name) }]);
          await wait(600, ctrl.signal);
          if (ctrl.signal.aborted) throw new DOMException("interrupted", "AbortError");
        } else {
          t.actions.forEach((a) => { if (voiceRef.current && (a.t === "say" || a.t === "ask")) prefetchVoice(a.text); });
          for (const a of t.actions) await show(a, ctrl.signal);
        }
      }
    } catch {
      // Stopped early.
    } finally {
      if (abort.current === ctrl) {
        const r = render(turns.current);
        setLines(r.lines); setBoard(r.board);
        abort.current = null; setBusy(false); setReplaying(false);
      }
    }
  };

  const finish = async () => {
    interrupt();
    setView("recap");
    if (recapRef.current) return;
    setRecapState("loading");
    try {
      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turns: turns.current.filter((t) => t.role === "student" || t.actions.length > 0).map((t) => (t.role === "student" ? { role: t.role, text: t.text } : t)) }),
      });
      const data = await res.json();
      if (!res.ok || !data.recap) throw new Error(data.error ?? "recap failed");
      recapRef.current = data.recap;
      setRecap(data.recap); setRecapSample(Boolean(data.sample)); setRecapState("idle");
      persist(mode);
    } catch {
      setRecapState("error");
    }
  };

  const listen = () => {
    if (voice) unlockSpeech();
    if (listening) { ear.current?.stop(); return; }
    const r = recognizer();
    if (!r) return;
    ear.current = r;
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const heard = Array.from(e.results).map((x) => x[0].transcript).join(" ").trim();
      if (heard) setDraft((d) => (d ? d + " " : "") + heard);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    if (busy) interrupt(); // speaking up interrupts the tutor, as it would in a room
    setListening(true);
    r.start();
  };

  const current = MODES.find((m) => m.id === mode)!;
  const hasLesson = board.length > 0 || lines.some((l) => l.who === "tutor");

  const inputBar = (
    <form
      onSubmit={submit}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); void addFiles([...e.dataTransfer.files]); }}
      className="space-y-2"
    >
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Files to send">
          {files.map((f, i) => (
            <li key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-accent-soft py-1 pl-2 pr-1 text-sm text-text">
              <FileText size={14} aria-hidden className="shrink-0" />
              <span className="truncate">{f.name}</span>
              <button type="button" onClick={() => setFiles(files.filter((_, k) => k !== i))} aria-label={`Remove ${f.name}`} className="grid h-6 w-6 shrink-0 place-items-center rounded">
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {fileNote && <p role="alert" className="text-sm text-danger">{fileNote}</p>}
      <div className="flex items-end gap-2">
        <input
          ref={picker}
          type="file"
          multiple
          accept={[...ATTACH_TYPES, ".note"].join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ""; }}
        />
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:gap-2">
          <button type="button" onClick={() => picker.current?.click()} aria-label="Add a PDF or picture" className="grid h-11 w-11 place-items-center rounded-lg border border-border-input bg-surface text-text">
            <Paperclip size={20} aria-hidden />
          </button>
          {canListen && (
            <button type="button" onClick={listen} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Speak instead of typing"} className={`grid h-11 w-11 place-items-center rounded-lg border ${listening ? "border-accent bg-accent text-on-accent" : "border-border-input bg-surface text-text"}`}>
              <Mic size={20} aria-hidden />
            </button>
          )}
        </div>
        <label htmlFor="say" className="sr-only">{started ? "Reply to the tutor" : "Your question"}</label>
        <textarea
          id="say"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            const pasted = [...e.clipboardData.files];
            if (pasted.length) { e.preventDefault(); void addFiles(pasted); }
          }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          rows={started ? 2 : 4}
          placeholder={listening ? "Listening…" : started ? "Answer, or ask why" : current.placeholder}
          className="min-h-11 flex-1 resize-none rounded-lg border border-border-input bg-surface px-3 py-2 text-base text-text placeholder:text-muted"
        />
        <button type="submit" disabled={!draft.trim() && files.length === 0} aria-label="Send" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent text-on-accent disabled:opacity-40">
          <ArrowUp size={20} aria-hidden />
        </button>
      </div>
    </form>
  );

  const library = (
    <Library
      lessons={saved}
      files={kept}
      onOpenLesson={open}
      onWatchLesson={(l) => { setLibraryOpen(false); interrupt(); setVideo({ turns: l.turns, title: l.title }); }}
      onDeleteLesson={(id) => setSaved(deleteLesson(id))}
      onUseFile={addFromLibrary}
      onViewFile={viewFile}
      onDeleteFile={forgetFile}
    />
  );

  const watch = () => {
    interrupt();
    const kept = turns.current.filter((t) => t.role === "student" || t.actions.length > 0);
    setVideo({ turns: kept, title: titleOf(kept) });
  };

  const player = video && <VideoPlayer turns={video.turns} title={video.title} onClose={() => setVideo(null)} />;

  const drawer = libraryOpen && (
    <div className="fixed inset-0 z-20 flex justify-end" role="dialog" aria-modal="true" aria-label="Library" onKeyDown={(e) => { if (e.key === "Escape") setLibraryOpen(false); }}>
      <button type="button" aria-label="Close the library" onClick={() => setLibraryOpen(false)} className="absolute inset-0 bg-text/30 backdrop-blur-[2px] animate-[fade-in_200ms_ease-out]" />
      <div className="relative flex h-full w-full max-w-lg flex-col gap-3 overflow-y-auto bg-bg p-4 shadow-2xl animate-[slide-in_260ms_cubic-bezier(0.2,0.8,0.2,1)]">
        <div className="flex justify-end">
          <button type="button" autoFocus onClick={() => setLibraryOpen(false)} className={BTN}><X size={16} aria-hidden /> Close</button>
        </div>
        {library}
      </div>
    </div>
  );

  const soundButton = canTalk && (
    <button
      type="button"
      onClick={toggleVoice}
      aria-pressed={voice}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors active:scale-[0.97] ${voice ? "border-accent bg-accent text-on-accent" : "border-border-input bg-surface text-text"}`}
    >
      {voice ? <Volume2 size={18} aria-hidden /> : <VolumeX size={18} aria-hidden />}
      {voice ? "Sound on" : "Sound off"}
    </button>
  );

  if (!started) {
    return (
      <main className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-8 px-4 py-10">
        <header>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold tracking-wide text-accent">{APP_NAME}</p>
            {soundButton}
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-text sm:text-4xl">What shall we work on?</h1>
          <p className="mt-2 text-muted">Your tutor talks it through and writes every step on the board. Stop it any time and ask why.</p>
        </header>
        <fieldset>
          <legend className="sr-only">Kind of lesson</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {MODES.map((m) => {
              const on = m.id === mode;
              return (
                <label key={m.id} className={`cursor-pointer rounded-xl border p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${on ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}>
                  <input type="radio" name="mode" value={m.id} checked={on} onChange={() => setMode(m.id)} className="sr-only" />
                  <m.icon size={22} aria-hidden className="text-accent" />
                  <span className="mt-2 block font-semibold text-text">{m.name}</span>
                  <span className="mt-1 block text-sm text-muted">{m.blurb}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div>
          {inputBar}
          <p className="mt-3 text-sm text-muted">Paste or drop in a PDF or a picture of your notes, for example pages exported or copied from Notability.</p>
        </div>
        {library}
        {player}
      </main>
    );
  }

  const header = (
    <header className="flex items-center justify-between gap-3 lg:col-span-2">
      <p className="text-sm font-semibold text-accent">{APP_NAME} <span className="hidden font-normal text-muted sm:inline">· {current.name}</span></p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {view === "recap" ? (
          <button type="button" onClick={() => setView("room")} className={BTN}><ArrowLeft size={16} aria-hidden /> Back to the board</button>
        ) : (
          <>
            {soundButton}
            <button type="button" onClick={watch} disabled={!hasLesson || busy} className={`${BTN} border-accent text-accent`}><Clapperboard size={16} aria-hidden /> Video</button>
            <button type="button" onClick={() => void replay()} disabled={!hasLesson || replaying} className={BTN}><Play size={16} aria-hidden /> <span className="hidden sm:inline">Replay</span><span className="sr-only sm:hidden">Replay</span></button>
            <button type="button" onClick={() => void finish()} disabled={!hasLesson} className={BTN}><ListChecks size={16} aria-hidden /> Recap</button>
          </>
        )}
        <button type="button" onClick={() => setLibraryOpen(true)} aria-haspopup="dialog" className={BTN}><LibraryIcon size={16} aria-hidden /> <span className="hidden sm:inline">Library</span><span className="sr-only sm:hidden">Library</span></button>
        <button type="button" onClick={reset} className={BTN}><Plus size={16} aria-hidden /> <span className="hidden sm:inline">New lesson</span><span className="sr-only sm:hidden">New lesson</span></button>
      </div>
    </header>
  );

  if (view === "recap") {
    return (
      <main className="mx-auto max-w-[1400px] space-y-6 p-3">
        {header}
        <h1 className="mx-auto max-w-3xl text-2xl font-semibold text-text">Lesson recap</h1>
        {recapState === "loading" && <p role="status" className="mx-auto max-w-3xl text-muted">Writing your notes and quiz…</p>}
        {recapState === "error" && (
          <div className="mx-auto max-w-3xl space-y-3">
            <p role="alert" className="text-danger">The recap could not be written this time.</p>
            <button type="button" onClick={() => void finish()} className={BTN}>Try again</button>
          </div>
        )}
        {recap && <RecapView recap={recap} sample={recapSample} />}
        {drawer}{player}
      </main>
    );
  }

  return (
    <main className="mx-auto grid h-dvh max-w-[1400px] grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_minmax(0,1fr)]">
      {header}

      <Board actions={board} empty="The board is clear. Your tutor is about to start." />

      <aside aria-label="Conversation" className="flex min-h-0 flex-col rounded-xl border border-border bg-surface">
        {sample && <p className="border-b border-border bg-warn-soft px-3 py-2 text-sm text-warn-text">Sample lesson. The live tutor is not connected yet, so this one is scripted.</p>}
        <div role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-3">
          {lines.map((l, i) =>
            l.who === "student" ? (
              <div key={i} className="ml-8 rounded-lg bg-accent-soft px-3 py-2 text-text">
                <p><span className="sr-only">You: </span>{l.text}</p>
                {l.files?.map((n, k) => <p key={k} className="mt-1 flex items-center gap-1.5 text-sm text-muted"><FileText size={14} aria-hidden className="shrink-0" /><span className="truncate">{n}</span></p>)}
              </div>
            ) : l.who === "problem" ? (
              <p key={i} role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-danger">{l.text}</p>
            ) : (
              <div key={i} className="group mr-4 flex items-start gap-1">
                <p className={`flex-1 text-text ${l.question ? "font-semibold" : ""}`}><span className="sr-only">Tutor: </span>{l.text}</p>
                {canTalk && (
                  <button type="button" onClick={() => hear(l.text)} aria-label="Hear this again" className="-mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:text-accent">
                    <Volume2 size={15} aria-hidden />
                  </button>
                )}
              </div>
            ),
          )}
          {busy && <p className="text-sm text-muted">{replaying ? "Replaying the lesson…" : "Tutor is explaining…"}</p>}
          <div ref={logEnd} />
        </div>
        <div className="space-y-2 border-t border-border p-3">
          {busy && (
            <button type="button" onClick={interrupt} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border-input text-sm font-medium text-text">
              <Hand size={16} aria-hidden /> {replaying ? "Stop the replay" : "Hold on, I have a question"}
            </button>
          )}
          {inputBar}
        </div>
      </aside>
      {drawer}{player}
    </main>
  );
}
