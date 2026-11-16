import { generateText, streamText } from "ai";
import { connection } from "next/server";
import { google } from "@ai-sdk/google";
import { parseAction } from "@/lib/board";
import { systemPrompt } from "@/lib/prompt";
import { problemText, tutorIsLive, tutorModel } from "@/lib/tutor";

// A quick health check for the tutor's AI: open /api/check in a browser.
// It asks the model for one word, so it uses almost none of the free allowance.
export async function GET(request: Request) {
  await connection(); // run on every visit, never at build time
  const provider = process.env.GOOGLE_GENERATIVE_AI_API_KEY ? "google" : tutorIsLive() ? "gateway" : "sample";
  if (provider === "sample") return Response.json({ ok: false, provider, message: "No AI is set up, so lessons use the sample." });
  const started = Date.now();
  const requested = new URL(request.url).searchParams.get("model");
  const modelName = requested && /^gemini-[a-z0-9.-]{1,40}$/.test(requested) ? requested : null;
  console.log("check start", provider, modelName ?? "default");
  try {
    const model = modelName && provider === "google" ? google(modelName) : tutorModel();
    // ?lesson=1 runs a short real lesson with the tutor's own instructions and
    // reports how many board actions came back valid.
    const params = new URL(request.url).searchParams;
    if (params.get("lesson")) {
      const mode = (["topic", "homework", "exam"] as const).find((m) => m === params.get("mode")) ?? "topic";
      const question = (params.get("q") ?? "What is the derivative of x^3? Keep it short.").slice(0, 400);
      const run = streamText({ model, system: systemPrompt(mode), prompt: question, maxOutputTokens: 6000, maxRetries: 0, abortSignal: AbortSignal.timeout(55_000) });
      let text = "";
      let firstLine = 0;
      for await (const part of run.textStream) {
        text += part;
        if (!firstLine && text.includes("\n")) firstLine = Date.now() - started;
      }
      const lines = text.split("\n").filter((line) => line.trim());
      const actions = lines.map(parseAction).filter((action) => action !== null);
      const bad = lines.filter((line) => !parseAction(line)).slice(0, 5);
      console.log("check lesson", Date.now() - started, "ms", actions.length, "of", lines.length);
      return Response.json(
        { ok: actions.length > 0, provider, ms: Date.now() - started, firstLineMs: firstLine, lines: lines.length, valid: actions.length, bad, ...(params.get("show") ? { actions } : { kinds: actions.map((action) => action.t) }) },
        { headers: { "cache-control": "no-store" } },
      );
    }
    const { text } = await generateText({ model, prompt: "Reply with the single word: ready", maxOutputTokens: 200, maxRetries: 0, abortSignal: AbortSignal.timeout(25_000) });
    console.log("check ok", Date.now() - started, "ms");
    return Response.json({ ok: true, provider, reply: text.trim().slice(0, 40) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("check error", Date.now() - started, "ms", error);
    return Response.json({ ok: false, provider, message: problemText(error) }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
