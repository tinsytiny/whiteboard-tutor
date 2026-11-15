"use client";

import katex from "katex";
import { useEffect, useMemo, useRef } from "react";
import type { BoardAction } from "@/lib/board";
import { Plot } from "./Plot";

function Maths({ tex }: { tex: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: true, throwOnError: false, trust: false, strict: "ignore" }),
    [tex],
  );
  return <div className="board-math overflow-x-auto py-1 text-base text-ink sm:text-xl" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Item({ a }: { a: BoardAction }) {
  switch (a.t) {
    case "heading":
      return <h2 className="font-hand text-3xl font-bold text-ink underline decoration-accent decoration-2 underline-offset-4">{a.text}</h2>;
    case "write":
      return <p className="font-hand text-2xl leading-10 text-ink">{a.text}</p>;
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
      return <p className="max-w-xl rounded-md border border-warn-text/40 bg-warn-soft px-3 py-2 font-hand text-xl text-warn-text">{a.text}</p>;
    default:
      return null;
  }
}

export const isBoardAction = (a: BoardAction) => ["heading", "write", "math", "plot", "table", "note"].includes(a.t);

export function Board({ actions, empty }: { actions: BoardAction[]; empty: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [actions.length]);

  return (
    <section aria-label="Whiteboard" className="board-paper h-full overflow-y-auto rounded-xl border border-border px-6 py-5 shadow-sm sm:px-10">
      {actions.length === 0 ? (
        <p className="font-hand text-2xl leading-10 text-muted">{empty}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {actions.map((a, i) => <div key={i} className="rise"><Item a={a} /></div>)}
        </div>
      )}
      <div ref={end} className="h-6" />
    </section>
  );
}
