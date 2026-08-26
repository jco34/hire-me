import type { z } from "zod";

import type { ExtractorName } from "@/lib/domain/ingest";

/**
 * The seam between an action and whatever model actually reads the input.
 *
 * There are two implementations — Gemini over HTTP, and Claude Code as a local child
 * process — and no caller cares which one it holds. Three actions share them: filling a
 * form from a job listing, re-scoring a stored posting, and transcribing an uploaded
 * resume. That last one is why `ResponseShape` exists: the first two want JSON matching a
 * schema, the third wants prose.
 *
 * Transports return raw output. They never validate: the caller owns its own schema and
 * parses once, after the chain has settled on an answer.
 */

/** An attachment: a screenshot of a listing, or an uploaded resume PDF. */
export interface ExtractionFile {
  bytes: Buffer;
  mimeType: string;
}

/**
 * What the answer has to look like.
 *
 * Both providers can be held to a schema, but they speak different dialects: Gemini wants
 * an OpenAPI subset built from its own `Type` enum, Claude wants JSON Schema. Rather than
 * convert between them at runtime, a shape carries both, built side by side in `shapes.ts`
 * so the two descriptions of one thing are written in the same place.
 */
export type ResponseShape =
  | {
      kind: "json";
      /** Gemini's `responseSchema`. */
      gemini: Record<string, unknown>;
      /** Claude derives `--json-schema` from this; callers validate with it too. */
      zod: z.ZodType;
    }
  | { kind: "text" };

export interface ExtractionRequest {
  /** The instructions. */
  prompt: string;
  /** Pasted text, or "" when the input is entirely files. */
  text: string;
  files: ExtractionFile[];
  shape: ResponseShape;
  /**
   * What the input is, in the words an error should use: "that listing", "that file".
   * Only ever appears in a message the user reads.
   */
  subject: string;
  /**
   * The sentence telling the user what to do when every extractor has failed — "Fill the
   * form in by hand.", "Paste the text instead." It is the one part of a failure that is
   * genuinely different per caller, so it comes from the caller rather than being guessed
   * at by a transport that has no idea which screen it is failing on.
   */
  advice: string;
  /**
   * Optional ceiling on a single attempt. Set where a form sits disabled while it waits,
   * because the honest failure is worth more there than a slightly higher success rate.
   */
  timeoutMs?: number;
}

/**
 * `retryable` is the only thing the fallback rule reads.
 *
 * It means "this failed for a reason that says nothing about the request" — an overloaded
 * model, a rate limit, a network that dropped. A rejected key or an unreadable file is not
 * retryable: handing those to a second extractor buries a message the user needs to see
 * behind another ten seconds of waiting.
 */
export type ExtractionOutcome =
  | { ok: true; data: unknown }
  | { ok: false; retryable: boolean; message: string };

export interface Extractor {
  name: ExtractorName;
  run: (request: ExtractionRequest) => Promise<ExtractionOutcome>;
}
