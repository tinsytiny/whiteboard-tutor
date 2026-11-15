import type { Turn } from "./board";

export type QuizItem = { q: string; options: string[]; answer: number; why: string };
export type Flashcard = { front: string; back: string };
export type Recap = { notes: string[]; quiz: QuizItem[]; cards: Flashcard[] };

/** The lesson as plain text, for writing the recap from. */
export function lessonText(turns: Turn[]): string {
  return turns
    .map((t) =>
      t.role === "student"
        ? `STUDENT: ${t.text}`
        : t.actions
            .map((a) =>
              a.t === "say" || a.t === "ask" ? `TUTOR: ${a.text}`
              : a.t === "math" ? `BOARD (maths): ${a.tex}`
              : a.t === "plot" ? `BOARD (graph): ${a.fns.join(", ")}`
              : a.t === "table" ? `BOARD (table): ${[a.head, ...a.rows].map((r) => r.join(" | ")).join(" / ")}`
              : a.t === "error" ? ""
              : `BOARD: ${a.text}`,
            )
            .filter(Boolean)
            .join("\n"),
    )
    .join("\n");
}

/** Shown when the live tutor is not connected. Matches the built-in sample lesson. */
export const SAMPLE_RECAP: Recap = {
  notes: [
    "A curve has a different slope at every point. The slope at a point is the slope of the tangent line there.",
    "To find it, take a second point a small step h away and work out rise over run.",
    "For f(x) = x² at x = 1 this gives 2 + h, which becomes 2 as h shrinks to zero.",
    "Doing the same at any x gives the rule f′(x) = 2x.",
    "Trap to avoid: expand the bracket before cancelling h.",
  ],
  quiz: [
    { q: "What is the slope of y = x² at x = 3?", options: ["3", "6", "9", "2"], answer: 1, why: "The slope rule is 2x, and 2 × 3 = 6." },
    { q: "In rise over run with a step of h, what do we do with h at the end?", options: ["Set it to 1", "Let it shrink towards zero", "Double it", "Ignore it from the start"], answer: 1, why: "The tangent's slope is what the ratio approaches as the step shrinks to zero." },
    { q: "Where is the curve y = x² flat?", options: ["At x = 1", "At x = -1", "At x = 0", "Nowhere"], answer: 2, why: "The slope is 2x, which is zero only when x = 0." },
  ],
  cards: [
    { front: "Tangent line", back: "The straight line that just touches a curve at one point and has the same slope there." },
    { front: "Slope of x² at any x", back: "2x" },
    { front: "Rise over run between x and x + h", back: "(f(x + h) − f(x)) ÷ h" },
    { front: "Why let h shrink to zero?", back: "So the second point slides onto the first and the line through both becomes the tangent." },
    { front: "(1 + h)² expanded", back: "1 + 2h + h²" },
  ],
};
