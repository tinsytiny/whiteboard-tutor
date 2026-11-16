import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

// The tutor's AI. If GOOGLE_GENERATIVE_AI_API_KEY is set (a free key from
// Google AI Studio, no card needed), lessons use Google's Gemini free tier.
// Otherwise they go through Vercel's AI Gateway, which signs in by itself on
// Vercel but needs a card on the Vercel account. With neither, the app plays
// the built-in sample lesson.

const usesGoogle = () => Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

/**
 * The Gemini models to try, in order. Flash-Lite comes first: it answers in
 * about a second and its free daily allowance is large, while full Flash is
 * limited to about 20 requests a day on a free key. When one model is out of
 * allowance or unavailable, the next one answers instead. Google retires old
 * versions for new keys, so update these names when it does.
 */
const GEMINI = ["gemini-3.5-flash-lite", "gemini-3.5-flash"];

/** Models that recently ran out of allowance, with when to try them again. */
const resting = new Map<string, number>();

export function tutorModelNames(): string[] {
  const names = [...new Set([process.env.TUTOR_MODEL, ...GEMINI].filter((n): n is string => Boolean(n)))];
  const now = Date.now();
  const awake = names.filter((n) => (resting.get(n) ?? 0) < now);
  return awake.length ? awake : names;
}

/** Remember that a model is out of allowance, so the next lessons skip it for a while. */
export function restModel(name: string, error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  const retry = /retry in (?:(\d+)h)?(?:(\d+)m)?([\d.]+)s/i.exec(text);
  const ms = retry ? ((Number(retry[1] ?? 0) * 60 + Number(retry[2] ?? 0)) * 60 + Number(retry[3])) * 1000 : 10 * 60_000;
  resting.set(name, Date.now() + Math.min(ms, 24 * 3600_000));
}

/** True when trying another model might work: out of allowance, overloaded, or the model is gone. */
export function worthAnotherModel(error: unknown): boolean {
  const status = typeof error === "object" && error !== null && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 0;
  return status === 429 || status === 404 || status >= 500;
}

export function tutorModel(name?: string): LanguageModel {
  if (usesGoogle()) return google(name ?? tutorModelNames()[0]);
  return process.env.TUTOR_MODEL ?? "anthropic/claude-haiku-5.5";
}

export const usesGoogleKey = usesGoogle;

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
