"use client";

import katex from "katex";
import { useEffect, useMemo, useRef } from "react";
import type { BoardAction } from "@/lib/board";
import { Bars, Drawing, Flow } from "./Diagrams";
import { Plot } from "./Plot";

function Maths({ tex }: { tex: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: true, throwOnError: true, trust: false, strict: "ignore" });
    } catch {
      return null; // maths the renderer can't read is written out as plain text instead of an error
    }
  }, [tex]);
  if (html === null) return <p className="font-hand text-2xl leading-10 text-ink">{tex.replace(/\\(text|mathrm|mathbf)\{([^}]*)\}/g, "$2").replace(/[{}]/g, "")}</p>;
  return <div className="board-math overflow-x-auto py-1 text-lg text-ink sm:text-2xl" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Plain words with simple fractions like 3/4 shown stacked, the way you'd write them. */
function Words({ text }: { text: string }) {
  const parts = text.split(/(\b\d+\s*\/\s*\d+\b)/);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => {
        const m = /^(\d+)\s*\/\s*(\d+)$/.exec(part);
        if (!m) return <span key={i}>{part}</span>;
        const html = katex.renderToString(`\\dfrac{${m[1]}}{${m[2]}}`, { throwOnError: false });
        return <span key={i} className="inline-fraction" aria-label={`${m[1]} over ${m[2]}`} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </>
  );
}

export function Item({ a }: { a: BoardAction }) {
  switch (a.t) {
    case "heading":
      return <h2 className="font-hand text-3xl font-bold text-ink underline decoration-accent decoration-2 underline-offset-4">{a.text}</h2>;
    case "write":
      return <p className="font-hand text-2xl leading-10 text-ink"><Words text={a.text} /></p>;
    case "math":
      return <Maths tex={a.tex} />;
    case "plot":
      return <Plot fns={a.fns} xmin={a.xmin} xmax={a.xmax} label={a.label} />;
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="border-collapse bg-surface font-hand text-xl text-ink">
            <thead>
              <tr>{a.head.map((h, i) => <th key={i} scope="col" className="border border-border-input px-3 py-1 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {a.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border border-border-input px-3 py-1">{c}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      );
    case "note":
      return <p className="max-w-xl rounded-md border border-warn-text/40 bg-warn-soft px-3 py-2 font-hand text-xl text-warn-text"><Words text={a.text} /></p>;
    case "draw":
      return <Drawing svg={a.svg} label={a.label} />;
    case "flow":
      return <Flow steps={a.steps} cycle={a.cycle} />;
    case "bars":
      return <Bars bars={a.bars} />;
    default:
      return null;
  }
}

export const isBoardAction = (a: BoardAction) => ["heading", "write", "math", "plot", "table", "note", "draw", "flow", "bars"].includes(a.t);

/** Which board item a spoken line is about: the one its mark names, else the newest. */
export function focusFor(board: BoardAction[], mark?: string): number {
  if (board.length === 0) return -1;
  if (mark) {
    const want = mark.toLowerCase().replace(/[\s\\{}]/g, "");
    for (let i = board.length - 1; i >= 0; i--) {
      const a = board[i];
      const hay = ("text" in a ? a.text : "tex" in a ? a.tex : "label" in a ? (a.label ?? "") : "steps" in a ? a.steps.join(" ") : "head" in a ? [a.head, ...a.rows].flat().join(" ") : "fns" in a ? a.fns.join(" ") : "")
        .toLowerCase()
        .replace(/[\s\\{}]/g, "");
      if (want && hay.includes(want)) return i;
    }
  }
  return board.length - 1;
}

export function Board({ actions, empty, focus = -1 }: { actions: BoardAction[]; empty: string; focus?: number }) {
  const end = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [actions.length]);
  useEffect(() => {
    // Bring the item being talked about into view if it has scrolled away.
    if (focus >= 0 && focus < actions.length - 1) area.current?.querySelector(".focus")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focus, actions.length]);

  return (
    <section ref={area} aria-label="Whiteboard" className="board-paper h-full overflow-y-auto rounded-xl border border-border px-6 py-5 shadow-sm sm:px-10">
      {actions.length === 0 ? (
        <p className="font-hand text-2xl leading-10 text-muted">{empty}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {actions.map((a, i) => (
            <div key={i} className={`board-item ${a.t === "write" || a.t === "heading" || a.t === "note" ? "handwrite" : "rise"} ${i === focus ? "focus" : ""}`}>
              <Item a={a} />
            </div>
          ))}
        </div>
      )}
      <div ref={end} className="h-6" />
    </section>
  );
}
