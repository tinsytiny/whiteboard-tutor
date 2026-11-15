import { streamText, type ModelMessage } from "ai";
import { ATTACH_MAX_BYTES, ATTACH_MAX_FILES, ATTACH_TYPES, type Attachment, type BoardAction, type LessonMode, type Turn } from "@/lib/board";
import { demoLesson } from "@/lib/demo";
import { systemPrompt } from "@/lib/prompt";
import { problemText, tutorIsLive, tutorModel } from "@/lib/tutor";

export const maxDuration = 300;

const MODES: LessonMode[] = ["topic", "homework", "exam"];
const MAX_TURNS = 60;
const MAX_CHARS = 8000;

const line = (a: BoardAction) => JSON.stringify(a) + "\n";

function toMessages(turns: Turn[]): ModelMessage[] {
  return turns.map((t): ModelMessage =>
    t.role === "student"
      ? {
          role: "user",
          // Files go before the words, so the tutor reads the page and then the question.
          content: [
            ...(t.files ?? []).map((f: Attachment) => ({ type: "file" as const, mediaType: f.type, data: f.data, filename: f.name })),
            { type: "text" as const, text: t.text },
          ],
        }
      : { role: "assistant", content: t.actions.map((a) => JSON.stringify(a)).join("\n") || "{}" },
  );
}

function validFiles(v: unknown): boolean {
  if (v === undefined) return true;
  if (!Array.isArray(v) || v.length > ATTACH_MAX_FILES) return false;
  let bytes = 0;
  for (const f of v) {
    if (!f || typeof f.name !== "string" || typeof f.data !== "string" || !ATTACH_TYPES.includes(f.type)) return false;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(f.data)) return false;
    bytes += (f.data.length * 3) / 4;
  }
  return bytes <= ATTACH_MAX_BYTES * 1.02;
}

function validTurns(v: unknown): v is Turn[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= MAX_TURNS &&
    v.every((t) =>
      t && t.role === "student"
        ? typeof t.text === "string" && t.text.length > 0 && t.text.length <= MAX_CHARS && validFiles(t.files)
        : t && t.role === "tutor" && Array.isArray(t.actions),
    ) &&
    v[v.length - 1].role === "student"
  );
}

export async function POST(req: Request) {
  let body: { mode?: unknown; turns?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const mode = MODES.includes(body.mode as LessonMode) ? (body.mode as LessonMode) : "topic";
  if (!validTurns(body.turns)) return new Response("Bad request", { status: 400 });
  const turns = body.turns;

  const enc = new TextEncoder();
  const headers = { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" };
  if (!tutorIsLive()) {
    const students = turns.filter((t) => t.role === "student").map((t) => (t as { text: string }).text);
    const actions = demoLesson(mode, students);
    return new Response(enc.encode(actions.map(line).join("")), { headers: { ...headers, "x-tutor": "demo" } });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const fail = (text: string) => controller.enqueue(enc.encode(line({ t: "error", text })));
      let failed = false;
      try {
        const run = streamText({
          model: tutorModel(),
          system: systemPrompt(mode),
          messages: toMessages(turns),
          maxOutputTokens: 8000,
          abortSignal: req.signal,
          onError: ({ error }) => {
            if (req.signal.aborted || failed) return;
            failed = true;
            console.error("tutor error", error);
            fail(problemText(error));
          },
        });
        for await (const text of run.textStream) controller.enqueue(enc.encode(text));
        controller.enqueue(enc.encode("\n"));
        if (!failed && !req.signal.aborted && (await run.finishReason) === "length") {
          fail("That explanation ran long and was cut off. Ask me to carry on.");
        }
      } catch (error) {
        // An abort means the student interrupted, which is not a problem to report.
        if (!req.signal.aborted && !failed) {
          console.error("tutor error", error);
          fail(problemText(error));
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { ...headers, "x-tutor": "live" } });
}
