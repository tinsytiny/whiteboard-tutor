// The tutor's AI runs through Vercel's AI Gateway. On Vercel the site signs in
// to the gateway by itself, so there is no key to create or paste. Anywhere
// else (for example on a laptop) the app plays the built-in sample lesson,
// unless AI_GATEWAY_API_KEY is set.

/** Chosen for cost: lessons are short and frequent, and this model reads pictures and PDFs. */
export const TUTOR_MODEL = process.env.TUTOR_MODEL ?? "anthropic/claude-haiku-5.5";

export const tutorIsLive = () => Boolean(process.env.VERCEL || process.env.AI_GATEWAY_API_KEY);

/** Plain words for the student when the AI could not answer. */
export function problemText(error: unknown): string {
  const status = typeof error === "object" && error !== null && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 0;
  const text = error instanceof Error ? `${error.message} ${JSON.stringify(error)}` : String(error);
  if (/customer_verification_required|credit card/i.test(text)) return "The tutor's AI isn't switched on yet. Vercel needs a card on its account before it releases the free AI credit.";
  if (status === 402 || /quota|credits? (exhausted|exceeded)|insufficient/i.test(text)) return "The tutor's free AI allowance has run out for now. It refills each month.";
  if (status === 403) return "The tutor's AI service refused the request. This is a setup problem, not something you did.";
  if (status === 429) return "The tutor is busy right now. Give it a moment and try again.";
  if (status === 401) return "The tutor could not sign in to its AI service. This is a setup problem, not something you did.";
  return "The tutor hit a problem. Try that again.";
}
