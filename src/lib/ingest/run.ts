import "server-only";

import type { ExtractorName } from "@/lib/domain/ingest";
import { claudeExtractor, isEnabled as claudeFallbackEnabled } from "@/lib/ingest/claude";
import { geminiExtractor } from "@/lib/ingest/gemini";
import type { ExtractionRequest, Extractor } from "@/lib/ingest/types";

/**
 * The fallback rule, in one place for every caller.
 *
 * Three actions read documents with a model — filling the create form from a listing,
 * re-scoring a stored posting, and transcribing an uploaded resume. All three want the same
 * behaviour when Google is overloaded, so none of them owns the decision.
 */

export type ExtractionRunResult =
  | { ok: true; data: unknown; extractor: ExtractorName }
  | { ok: false; message: string };

/**
 * Which extractors to try, in order.
 *
 * The default is Gemini alone, exactly as it was before the fallback existed.
 * `INGEST_EXTRACTOR` pins one transport — which is how you exercise the Claude path
 * without waiting for Google to have a bad day, and how you run with no Gemini key.
 */
function extractors(): Extractor[] {
  const forced = process.env.INGEST_EXTRACTOR?.trim().toLowerCase();
  if (forced === "claude") return [claudeExtractor];
  if (forced === "gemini") return [geminiExtractor];
  return claudeFallbackEnabled() ? [geminiExtractor, claudeExtractor] : [geminiExtractor];
}

/**
 * Try each extractor until one answers.
 *
 * A transport that failed for a reason unrelated to the request — overload, a rate limit, a
 * network that dropped — hands off to the next one. Anything else is reported as it stands
 * rather than retried into a slower silence: a rejected key does not become a working key
 * because a second model looked at it.
 */
export async function runExtraction(
  request: ExtractionRequest,
): Promise<ExtractionRunResult> {
  const chain = extractors();

  for (const [index, extractor] of chain.entries()) {
    const outcome = await extractor.run(request);
    if (outcome.ok) return { ok: true, data: outcome.data, extractor: extractor.name };

    const isLast = index === chain.length - 1;
    if (isLast || !outcome.retryable) return { ok: false, message: outcome.message };

    console.warn(`[ingest] ${extractor.name} failed; trying ${chain[index + 1]?.name}`);
  }

  return { ok: false, message: `Could not read ${request.subject}. ${request.advice}` };
}
