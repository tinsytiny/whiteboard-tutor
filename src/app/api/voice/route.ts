import { google } from "@ai-sdk/google";
import { experimental_generateSpeech as generateSpeech } from "ai";
import { connection } from "next/server";

// The tutor's human-sounding voice, from Google's free Gemini speech model.
// GET /api/voice?text=... returns a WAV clip. The app falls back to the
// browser's own voice when this is unavailable (no key, or the free daily
// limit is used up), so lessons always keep talking.

const VOICE_MODEL = process.env.TUTOR_VOICE_MODEL ?? "gemini-3.8-flash-tts";
const VOICE = process.env.TUTOR_VOICE ?? "Achird";
const MAX_CHARS = 700;

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const text = (url.searchParams.get("text") ?? "").trim().slice(0, MAX_CHARS);
  if (!text) return new Response("No text", { status: 400 });
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return new Response("No voice service", { status: 503 });
  const requested = url.searchParams.get("model");
  const model = requested && /^gemini-[a-z0-9.-]{1,40}$/.test(requested) ? requested : VOICE_MODEL;
  const started = Date.now();
  try {
    const { audio } = await generateSpeech({
      model: google.speech(model),
      text,
      voice: url.searchParams.get("voice")?.replace(/[^A-Za-z]/g, "").slice(0, 20) || VOICE,
      instructions: "Speak like a warm, patient human tutor talking to one student: natural pace, relaxed and encouraging, with gentle emphasis on the key idea.",
      maxRetries: 0,
      abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
    });
    console.log("voice ok", model, text.length, "chars", Date.now() - started, "ms");
    return new Response(audio.uint8Array as BodyInit, {
      headers: { "content-type": audio.mediaType || "audio/wav", "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 0;
    console.error("voice error", model, status, Date.now() - started, "ms", error instanceof Error ? error.message.slice(0, 300) : error);
    return new Response("Voice unavailable", { status: status === 429 ? 429 : 502, headers: { "cache-control": "no-store" } });
  }
}
