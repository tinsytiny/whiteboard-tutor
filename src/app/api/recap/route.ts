import { generateText, Output } from "ai";
import { z } from "zod";
import type { Turn } from "@/lib/board";
import { lessonText, SAMPLE_RECAP, type Recap } from "@/lib/recap";
import { problemText, restModel, tutorIsLive, tutorModel, tutorModelNames, usesGoogleKey, worthAnotherModel } from "@/lib/tutor";

export const maxDuration = 120;

const RecapSchema = z.object({
  notes: z.array(z.string()),
  quiz: z.array(z.object({ q: z.string(), options: z.array(z.string()), answer: z.number(), why: z.string() })),
  cards: z.array(z.object({ front: z.string(), back: z.string() })),
});

const SYSTEM = `You write the end-of-lesson recap for a student who has just had a one-to-one whiteboard lesson. You are given the lesson transcript. Base everything only on what was actually taught in it.

Return:
- notes: 4 to 6 short plain-language notes covering the key ideas, in the order they were taught, including any trap that was pointed out. Plain text, no markdown or LaTeX.
- quiz: exactly 3 multiple-choice questions that check understanding, not recall of wording. Each has exactly 4 options, "answer" is the zero-based index of the one correct option, and "why" is one sentence explaining it. Vary which position is correct. Check each answer yourself before writing it.
- cards: exactly 5 flashcards, a short prompt on the front and a short answer on the back.

Write in the language the student used.`;

/** Never trust the shape blindly: a quiz with a wrong answer index teaches the wrong thing. */
function clean(r: Recap): Recap | null {
  const quiz = r.quiz.filter((q) => q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length);
  const cards = r.cards.filter((c) => c.front.trim() && c.back.trim());
  const notes = r.notes.filter((n) => n.trim());
  return notes.length || quiz.length || cards.length ? { notes, quiz, cards } : null;
}

export async function POST(req: Request) {
  let turns: Turn[];
  try {
    const body = await req.json();
    if (!Array.isArray(body.turns) || body.turns.length === 0 || body.turns.length > 200) throw new Error("turns");
    turns = body.turns;
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  if (!tutorIsLive()) {
    return Response.json({ recap: SAMPLE_RECAP, sample: true });
  }

  let text: string;
  try {
    text = lessonText(turns).slice(0, 120_000);
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    const write = (name?: string) =>
      generateText({
        model: tutorModel(name),
        system: SYSTEM,
        prompt: `Here is the lesson.\n\n${text}`,
        output: Output.object({ schema: RecapSchema }),
        maxOutputTokens: 4000,
        maxRetries: 0,
      });
    // Fall back to the next model when one is out of its free allowance.
    const names = usesGoogleKey() ? tutorModelNames() : [undefined];
    let result: Awaited<ReturnType<typeof write>> | null = null;
    for (let m = 0; m < names.length && !result; m++) {
      try {
        result = await write(names[m]);
      } catch (error) {
        if (!worthAnotherModel(error) || m === names.length - 1) throw error;
        restModel(names[m]!, error);
      }
    }
    const output = result!.output;
    const recap = output ? clean(output) : null;
    if (!recap) return Response.json({ error: "The recap could not be written. Try again." }, { status: 502 });
    return Response.json({ recap, sample: false });
  } catch (error) {
    console.error("recap error", error);
    return Response.json({ error: problemText(error) }, { status: 502 });
  }
}
