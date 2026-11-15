import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

// The tutor's AI. If GOOGLE_GENERATIVE_AI_API_KEY is set (a free key from
// Google AI Studio, no card needed), lessons use Google's Gemini free tier.
// Otherwise they go through Vercel's AI Gateway, which signs in by itself on
// Vercel but needs a card on the Vercel account. With neither, the app plays
// the built-in sample lesson.

const usesGoogle = () => Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

/** Gemini Flash: free tier, fast, reads pictures and PDFs. Google retires old versions for new keys, so update this when it does. */
export function tutorModel(): LanguageModel {
  if (usesGoogle()) return google(process.env.TUTOR_MODEL ?? "gemini-3.5-flash");
  return process.env.TUTOR_MODEL ?? "anthropic/claude-haiku-5.5";
}

export const tutorIsLive = () => Boolean(usesGoogle() || process.env.VERCEL || process.env.AI_GATEWAY_API_KEY);

/** Plain words for the student when the AI could not answer. */
export function problemText(error: unknown): string {
  const status = typeof error === "object" && error !== null && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 0;
  const text = error instanceof Error ? `${error.message} ${JSON.stringify(error)}` : String(error);
  if (/customer_verification_required|credit card/i.test(text)) return "The tutor's AI isn't switched on yet. Vercel needs a card on its account before it releases the free AI credit.";
  if (status === 402 || /credits? (exhausted|exceeded)|insufficient/i.test(text)) return "The tutor's free AI allowance has run out for now. It refills each month.";
  if (status === 403) return "The tutor's AI service refused the request. This is a setup problem, not something you did.";
  if (status === 429) return "The tutor has hit its free limit for the moment. Wait a minute and try again; the daily limit resets each day.";
  if (status === 400 && /api key/i.test(text)) return "The tutor's Google AI key isn't valid. Check the key saved in Vercel.";
  if (status === 401) return "The tutor could not sign in to its AI service. This is a setup problem, not something you did.";
  return "The tutor hit a problem. Try that again.";
}
