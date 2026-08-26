import "server-only";

import { GoogleGenAI, type Part } from "@google/genai";

import type { ExtractionOutcome, ExtractionRequest, Extractor } from "@/lib/ingest/types";

/**
 * The primary extractor: one multimodal Gemini call.
 *
 * This file owns the Gemini key and the mapping from an HTTP status onto words a user can
 * act on. It owns no prompt and no schema — those come in with the request, because the
 * same transport now serves paste-to-fill, re-scoring and resume transcription.
 */

// `gemini-flash-latest` is the multimodal Flash alias that stays available on the free
// tier and tracks the current model. Pinned ids like `gemini-2.5-flash` return 404 "no
// longer available to new users" for freshly created keys.
const MODEL = "gemini-flash-latest";

/**
 * HTTP status behind a failed call, or null when the request never got a response.
 *
 * The SDK throws `ApiError` (carrying a numeric `status`) for every 4xx and 5xx, and lets
 * transport failures — DNS, TLS, connection reset, timeout — propagate as plain errors
 * with no status. That distinction is the whole point: "Google said no" and "we never
 * reached Google" want different words in front of the user.
 *
 * Read `status` structurally rather than with `instanceof ApiError`. A second copy of the
 * SDK anywhere in the bundle would defeat the prototype check and silently downgrade
 * every API error back to "could not reach", which is the exact confusion this replaces.
 */
function httpStatusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

/**
 * Whether a second extractor is worth trying.
 *
 * Overload (5xx), rate limiting (429) and a request that never landed at all (no status)
 * are the three failures that say nothing about the input — the same input may well
 * succeed elsewhere. Everything else is about this request or this key, and is reported
 * as-is rather than retried into a slower, quieter version of the same failure.
 */
export function isRetryable(status: number | null): boolean {
  return status === null || status === 429 || status >= 500;
}

/**
 * Map a failed call onto something the user can act on.
 *
 * Only 401 and 403 are unambiguously a key problem. A 400 is not: a malformed request —
 * an unsupported screenshot type, say — lands there too, and telling someone to go check
 * their API key when the real fault is the file they attached sends them hunting in the
 * wrong place. So 400 is only read as a key fault when Google names `API_KEY_INVALID` in
 * the body, which the SDK stringifies into the error message.
 *
 * `subject` and `advice` come from the caller. A failure on the resume uploader has to end
 * at "Paste the text instead."; the same failure on the create form has to end at "Fill the
 * form in by hand." — the status is shared, the way out is not.
 */
function errorMessage(
  status: number | null,
  detail: string,
  subject: string,
  advice: string,
): string {
  if (status === null) return `Could not reach the extractor. ${advice}`;
  if (status === 429) return `Hit the free-tier limit. ${advice}`;
  if (status === 401 || status === 403 || (status === 400 && detail.includes("API_KEY_INVALID"))) {
    return "The extractor rejected the API key. Check GEMINI_API_KEY in .env.local.";
  }
  if (status === 400) return `The extractor could not read ${subject}. ${advice}`;
  if (status === 404) {
    return `The extractor model (${MODEL}) is not available to this key. ${advice}`;
  }
  if (status >= 500) return `The extractor is temporarily unavailable. ${advice}`;
  return `Could not reach the extractor. ${advice}`;
}

async function run(request: ExtractionRequest): Promise<ExtractionOutcome> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      // A missing key is a configuration state, not an outage. Falling through to Claude
      // here would quietly paper over a `.env.local` someone meant to fill in; running
      // without a Gemini key at all is what `INGEST_EXTRACTOR=claude` is for.
      retryable: false,
      message: "Add a GEMINI_API_KEY to .env.local, or set INGEST_EXTRACTOR=claude to use Claude.",
    };
  }

  const parts: Part[] = [{ text: request.prompt }];
  if (request.text !== "") parts.push({ text: `Listing text:\n${request.text}` });
  for (const file of request.files) {
    parts.push({
      inlineData: { data: file.bytes.toString("base64"), mimeType: file.mimeType },
    });
  }

  const json = request.shape.kind === "json";

  let rawText: string;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: parts,
      config: {
        responseMimeType: json ? "application/json" : "text/plain",
        ...(json && request.shape.kind === "json"
          ? { responseSchema: request.shape.gemini }
          : {}),
        ...(request.timeoutMs ? { httpOptions: { timeout: request.timeoutMs } } : {}),
      },
    });
    rawText = response.text ?? "";
  } catch (error) {
    const status = httpStatusOf(error);
    const detail = error instanceof Error ? error.message : String(error);
    // Server-side only, so this reaches the dev terminal and never the client. Without it
    // a revoked key, an outage, and a dead network are indistinguishable from each other.
    // Logged as status plus message: the key rides in the `x-goog-api-key` header rather
    // than the URL, so neither field can carry it into the log.
    console.error(`[ingest] gemini failed (status ${status ?? "none"}): ${detail}`);
    return {
      ok: false,
      retryable: isRetryable(status),
      message: errorMessage(status, detail, request.subject, request.advice),
    };
  }

  if (!json) return { ok: true, data: rawText.trim() };

  try {
    return { ok: true, data: JSON.parse(rawText) };
  } catch {
    // Schema-constrained output that is not JSON means the model truncated or refused.
    // Not retryable: the input is the likely cause, and it would be the same input.
    return {
      ok: false,
      retryable: false,
      message: `Could not read ${request.subject}. ${request.advice}`,
    };
  }
}

export const geminiExtractor: Extractor = { name: "gemini", run };
