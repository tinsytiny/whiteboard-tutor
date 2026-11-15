import { generateText } from "ai";
import { connection } from "next/server";
import { google } from "@ai-sdk/google";
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
    const { text } = await generateText({ model: modelName && provider === "google" ? google(modelName) : tutorModel(), prompt: "Reply with the single word: ready", maxOutputTokens: 200, maxRetries: 0, abortSignal: AbortSignal.timeout(25_000) });
    console.log("check ok", Date.now() - started, "ms");
    return Response.json({ ok: true, provider, reply: text.trim().slice(0, 40) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("check error", Date.now() - started, "ms", error);
    return Response.json({ ok: false, provider, message: problemText(error) }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
