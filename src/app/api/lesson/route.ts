import Anthropic from "@anthropic-ai/sdk";
import { ATTACH_MAX_BYTES, ATTACH_MAX_FILES, ATTACH_TYPES, type Attachment, type BoardAction, type LessonMode, type Turn } from "@/lib/board";
import { demoLesson } from "@/lib/demo";
import { systemPrompt } from "@/lib/prompt";

export const maxDuration = 300;

const MODEL = process.env.TUTOR_MODEL ?? "claude-opus-5-5";
const MODES: LessonMode[] = ["topic", "homework", "exam"];
const MAX_TURNS = 60;
const MAX_CHARS = 8000;

const line = (a: BoardAction) => JSON.stringify(a) + "\n";

type ImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

function studentContent(text: string, files: Attachment[] = []): Anthropic.Beta.BetaContentBlockParam[] {
  // Files go before the words, so the tutor reads the page and then the question.
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = files.map((f) =>
    f.type === "application/pdf"
      ? { type: "document" as const, title: f.name, source: { type: "base64" as const, media_type: "application/pdf" as const, data: f.data } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: f.type as ImageType, data: f.data } },
  );
  return [...blocks, { type: "text", text }];
}

function toMessages(turns: Turn[]): Anthropic.Beta.BetaMessageParam[] {
  return turns.map((t) =>
    t.role === "student"
      ? { role: "user" as const, content: studentContent(t.text, t.files) }
      : { role: "assistant" as const, content: t.actions.map((a) => JSON.stringify(a)).join("\n") || "{}" },
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
  const live = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

  if (!live) {
    const students = turns.filter((t) => t.role === "student").map((t) => (t as { text: string }).text);
    const actions = demoLesson(mode, students);
    return new Response(enc.encode(actions.map(line).join("")), { headers: { ...headers, "x-tutor": "demo" } });
  }

  const client = new Anthropic();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const fail = (text: string) => controller.enqueue(enc.encode(line({ t: "error", text })));
      try {
        const run = client.beta.messages.stream(
          {
            model: MODEL,
            // If the model declines a request on policy grounds, the API retries
            // it on a fallback model inside the same call.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            max_tokens: 16000,
            thinking: { type: "adaptive" },
            output_config: { effort: "medium" },
            system: [{ type: "text", text: systemPrompt(mode), cache_control: { type: "ephemeral" } }],
            messages: toMessages(turns),
          },
          { signal: req.signal },
        );
        for await (const event of run) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(enc.encode(event.delta.text));
          }
        }
        const final = await run.finalMessage();
        controller.enqueue(enc.encode("\n"));
        if (final.stop_reason === "refusal") fail("The tutor can't help with that one. Try asking it another way.");
        else if (final.stop_reason === "max_tokens") fail("That explanation ran long and was cut off. Ask me to carry on.");
      } catch (error) {
        if (req.signal.aborted) {
          // The student interrupted. Nothing to report.
        } else if (error instanceof Anthropic.RateLimitError) {
          fail("The tutor is busy right now. Give it a moment and try again.");
        } else if (error instanceof Anthropic.AuthenticationError) {
          fail("The tutor's key was rejected. Check the ANTHROPIC_API_KEY setting.");
        } else if (error instanceof Anthropic.APIError) {
          console.error("tutor api error", error.status, error.message);
          fail("The tutor hit a problem. Try that again.");
        } else {
          console.error("tutor error", error);
          fail("The tutor hit a problem. Try that again.");
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { ...headers, "x-tutor": "live" } });
}
