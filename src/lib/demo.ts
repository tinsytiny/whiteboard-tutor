import type { BoardAction, LessonMode } from "./board";

// A built-in sample lesson, used only when no tutor key is configured, so the
// board and lesson room can be seen working. It is clearly labelled in the UI.

const OPENING: BoardAction[] = [
  { t: "say", text: "This is a built-in sample lesson, because the live tutor is not connected yet. Let me show you how the board works with the slope of a curve." },
  { t: "heading", text: "How steep is a curve?" },
  { t: "say", text: "A straight line has one slope. A curve has a different slope at every point, so we ask how steep it is at one spot." },
  { t: "math", tex: "f(x) = x^2" },
  { t: "say", text: "Take the point where x is one. The tangent line just touches the curve there, and its slope is the slope of the curve." },
  { t: "plot", fns: ["x^2", "2*x-1"], xmin: -2, xmax: 3, label: "the curve and its tangent at x = 1" },
  { t: "say", text: "To find that slope we take a second point a tiny step h away, and work out rise over run." },
  { t: "math", tex: "\\frac{f(1+h)-f(1)}{h} = \\frac{(1+h)^2 - 1}{h}" },
  { t: "math", tex: "= \\frac{2h + h^2}{h} = 2 + h" },
  { t: "note", text: "Common trap: cancelling h before expanding the bracket. Expand first." },
  { t: "ask", text: "As the step h shrinks to zero, what does 2 + h become?" },
];

const RIGHT: BoardAction[] = [
  { t: "say", text: "Exactly. The step vanishes and we are left with two, so the curve has slope two at x equals one." },
  { t: "math", tex: "\\lim_{h \\to 0} (2 + h) = 2" },
  { t: "say", text: "Do the same at any x and the pattern appears. Here is how the slope changes along the curve." },
  { t: "table", head: ["x", "slope of x²"], rows: [["-1", "-2"], ["0", "0"], ["1", "2"], ["2", "4"]] },
  { t: "math", tex: "f'(x) = 2x" },
  { t: "ask", text: "That is the end of the sample. Connect the live tutor to ask about anything you like." },
];

const HINT: BoardAction[] = [
  { t: "say", text: "Not quite, so let me put it another way. Try some small values of h and watch what happens." },
  { t: "table", head: ["h", "2 + h"], rows: [["0.1", "2.1"], ["0.01", "2.01"], ["0.001", "2.001"]] },
  { t: "ask", text: "What number is 2 + h closing in on?" },
];

export function demoLesson(_mode: LessonMode, studentTurns: string[]): BoardAction[] {
  if (studentTurns.length <= 1) return OPENING;
  const last = studentTurns[studentTurns.length - 1].toLowerCase();
  return /\b(2|two)\b/.test(last) ? RIGHT : HINT;
}
