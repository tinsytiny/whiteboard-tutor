"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import type { Recap } from "@/lib/recap";

function Quiz({ recap }: { recap: Recap }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const answered = Object.keys(picked).length;
  const right = recap.quiz.filter((q, i) => picked[i] === q.answer).length;
  return (
    <section aria-labelledby="quiz-h">
      <h2 id="quiz-h" className="text-xl font-semibold text-text">Quick quiz</h2>
      <ol className="mt-3 space-y-5">
        {recap.quiz.map((q, i) => {
          const choice = picked[i];
          const done = choice !== undefined;
          return (
            <li key={i}>
              <fieldset disabled={done}>
                <legend className="font-medium text-text">{i + 1}. {q.q}</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {q.options.map((o, k) => {
                    const isRight = done && k === q.answer;
                    const isWrong = done && k === choice && k !== q.answer;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setPicked((p) => ({ ...p, [i]: k }))}
                        className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-text ${isRight ? "border-accent bg-accent-soft" : isWrong ? "border-danger" : "border-border-input bg-surface"}`}
                      >
                        <span>{o}</span>
                        {isRight && <Check size={18} aria-label="Correct answer" className="shrink-0 text-accent" />}
                        {isWrong && <X size={18} aria-label="Your answer, not correct" className="shrink-0 text-danger" />}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <p aria-live="polite" className="mt-2 min-h-6 text-sm text-muted">
                {done && <><span className="font-semibold text-text">{choice === q.answer ? "Right." : "Not quite."}</span> {q.why}</>}
              </p>
            </li>
          );
        })}
      </ol>
      {answered === recap.quiz.length && recap.quiz.length > 0 && (
        <div className="flex items-center gap-3">
          <p className="font-semibold text-text">You got {right} of {recap.quiz.length}.</p>
          <button type="button" onClick={() => setPicked({})} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm text-text">
            <RotateCcw size={14} aria-hidden /> Try again
          </button>
        </div>
      )}
    </section>
  );
}

function Cards({ recap }: { recap: Recap }) {
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  return (
    <section aria-labelledby="cards-h">
      <h2 id="cards-h" className="text-xl font-semibold text-text">Flashcards</h2>
      <p className="mt-1 text-sm text-muted">Say the answer in your head, then turn the card over.</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {recap.cards.map((c, i) => {
          const back = Boolean(flipped[i]);
          return (
            <li key={i}>
              <button
                type="button"
                aria-pressed={back}
                onClick={() => setFlipped((f) => ({ ...f, [i]: !back }))}
                className={`flex min-h-28 w-full flex-col justify-between rounded-xl border p-4 text-left ${back ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
              >
                <span className="font-hand text-2xl text-ink">{back ? c.back : c.front}</span>
                <span className="mt-2 text-xs text-muted">{back ? "Answer. Tap to see the question." : "Tap to see the answer."}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function RecapView({ recap, sample }: { recap: Recap; sample: boolean }) {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      {sample && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-text">Sample recap. The live tutor is not connected yet, so this one is scripted.</p>}
      {recap.notes.length > 0 && (
        <section aria-labelledby="notes-h">
          <h2 id="notes-h" className="text-xl font-semibold text-text">Your notes</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-text">
            {recap.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </section>
      )}
      {recap.quiz.length > 0 && <Quiz recap={recap} />}
      {recap.cards.length > 0 && <Cards recap={recap} />}
    </div>
  );
}
