import { generateText } from "ai";
import { problemText, tutorIsLive, tutorModel } from "@/lib/tutor";

// A quick health check for the tutor's AI: open /api/check in a browser.
// It asks the model for one word, so it uses almost none of the free allowance.
export async function GET() {
  const provider = process.env.GOOGLE_GENERATIVE_AI_API_KEY ? "google" : tutorIsLive() ? "gateway" : "sample";
  if (provider === "sample") return Response.json({ ok: false, provider, message: "No AI is set up, so lessons use the sample." });
  try {
    const { text } = await generateText({ model: tutorModel(), prompt: "Reply with the single word: ready", maxOutputTokens: 20 });
    return Response.json({ ok: true, provider, reply: text.trim().slice(0, 40) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("check error", error);
    return Response.json({ ok: false, provider, message: problemText(error) }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
