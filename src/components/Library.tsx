"use client";

import { FileText, MessagesSquare, Plus, Search, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import type { StoredFile } from "@/lib/files";
import type { SavedLesson } from "@/lib/store";

const MODE_NAMES: Record<string, string> = { topic: "Topic", homework: "Homework", exam: "Exam prep" };

export function when(t: number): string {
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days < 1) return new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days < 7) return new Date(t).toLocaleDateString(undefined, { weekday: "long" });
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const size = (bytes: number) => (bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`);

type Props = {
  lessons: SavedLesson[];
  files: StoredFile[];
  onOpenLesson: (lesson: SavedLesson) => void;
  onDeleteLesson: (id: string) => void;
  onUseFile: (file: StoredFile) => void;
  onViewFile: (file: StoredFile) => void;
  onDeleteFile: (id: string) => void;
};

/** Past lessons and the pages you've brought in, kept in this browser. */
export function Library({ lessons, files, onOpenLesson, onDeleteLesson, onUseFile, onViewFile, onDeleteFile }: Props) {
  const [tab, setTab] = useState<"lessons" | "files">("lessons");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shownLessons = q ? lessons.filter((l) => l.title.toLowerCase().includes(q) || l.turns.some((t) => t.role === "student" && t.text.toLowerCase().includes(q))) : lessons;
  const shownFiles = q ? files.filter((f) => f.name.toLowerCase().includes(q) || f.lessonTitle?.toLowerCase().includes(q)) : files;
  const tabClass = (on: boolean) =>
    `inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${on ? "bg-text text-surface" : "text-muted hover:text-text"}`;

  return (
    <section aria-labelledby="library-h" className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="library-h" className="text-lg font-semibold text-text">Library</h2>
        <div role="tablist" aria-label="Library" className="flex gap-1 rounded-full bg-bg p-1">
          <button role="tab" type="button" aria-selected={tab === "lessons"} onClick={() => setTab("lessons")} className={tabClass(tab === "lessons")}>
            <MessagesSquare size={16} aria-hidden /> Lessons <span className="tabular-nums opacity-70">{lessons.length}</span>
          </button>
          <button role="tab" type="button" aria-selected={tab === "files"} onClick={() => setTab("files")} className={tabClass(tab === "files")}>
            <FileText size={16} aria-hidden /> Files <span className="tabular-nums opacity-70">{files.length}</span>
          </button>
        </div>
      </div>

      {(lessons.length > 0 || files.length > 0) && (
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border-input bg-surface px-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
          <Search size={16} aria-hidden className="text-muted" />
          <span className="sr-only">Search the library</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tab === "lessons" ? "Search your lessons" : "Search your files"} className="min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-muted" />
        </label>
      )}

      {tab === "lessons" ? (
        shownLessons.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted">
            {q ? "No lessons match that." : "Your lessons appear here after you start one. Open any of them to pick up where you left off."}
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-y-auto rounded-xl border border-border bg-surface">
            {shownLessons.map((l) => {
              const asks = l.turns.filter((t) => t.role === "student").length;
              const pages = l.turns.reduce((n, t) => n + (t.role === "student" ? (t.fileNames?.length ?? 0) : 0), 0);
              return (
                <li key={l.id} className="flex items-center gap-2 p-2">
                  <button type="button" onClick={() => onOpenLesson(l)} className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-bg">
                    <span className="block truncate font-medium text-text">
                      {l.title}
                    </span>
                    <span className="block text-sm text-muted">
                      {MODE_NAMES[l.mode] ?? "Lesson"} · {when(l.updatedAt)} · {asks} {asks === 1 ? "message" : "messages"}
                      {pages > 0 && ` · ${pages} ${pages === 1 ? "page" : "pages"}`}
                      {l.recap && " · recap"}
                    </span>
                  </button>
                  <button type="button" onClick={() => onDeleteLesson(l.id)} aria-label={`Delete lesson: ${l.title}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:text-danger">
                    <Trash2 size={16} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : shownFiles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted">
          {q ? "No files match that." : "PDFs and pictures you give the tutor are kept here, so you can look at them again or bring them into a new lesson."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
          {shownFiles.map((f) => (
            <li key={f.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
              <button type="button" onClick={() => onViewFile(f)} aria-label={`View ${f.name}`} className="grid aspect-[4/3] place-items-center overflow-hidden bg-bg">
                {f.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`data:${f.type};base64,${f.data}`} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-muted"><FileText size={28} aria-hidden /><span className="text-xs font-semibold">PDF</span></span>
                )}
              </button>
              <div className="flex flex-1 flex-col gap-1 p-2">
                <p className="truncate text-sm font-medium text-text" title={f.name}>{f.name}</p>
                <p className="truncate text-xs text-muted">{when(f.addedAt)} · {size(f.bytes)}{f.lessonTitle ? ` · ${f.lessonTitle}` : ""}</p>
                <div className="mt-auto flex gap-1 pt-1">
                  <button type="button" onClick={() => onUseFile(f)} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-accent-soft px-2 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-on-accent">
                    <Plus size={14} aria-hidden /> Use
                  </button>
                  <button type="button" onClick={() => onViewFile(f)} aria-label={`View ${f.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:text-text">
                    <Eye size={15} aria-hidden />
                  </button>
                  <button type="button" onClick={() => onDeleteFile(f.id)} aria-label={`Delete ${f.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:text-danger">
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
