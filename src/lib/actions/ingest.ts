"use server";

import {
  INGEST_PROMPT,
  TRANSCRIBE_PROMPT,
  buildMatchPrompt,
  extractionToFormValues,
  ingestExtractionSchema,
  type IngestResult,
} from "@/lib/domain/ingest";
import { scoreMatch } from "@/lib/domain/match";
import { runExtraction } from "@/lib/ingest/run";
import { extractionShape } from "@/lib/ingest/shapes";
import type { ExtractionFile } from "@/lib/ingest/types";
import { activeResume } from "@/lib/queries/resumes";
import { actionError, parseWith, type ActionResult } from "@/lib/validation";

/**
 * Turn a pasted job listing (text and/or screenshots) into form-fill values.
 *
 * This file owns the parts that do not depend on which model reads the listing: what a
 * caller is allowed to send, which prompt gets built, which extractor is tried, and the
 * single schema gate every result passes through. The two transports live in
 * `lib/ingest/` and neither of them is visible from here beyond the `Extractor` shape.
 *
 * Nothing about a model, a key or a subprocess crosses back to the client — the return is
 * a plain string map either way. The output is schema-constrained by both transports and
 * re-validated by zod before it is handed back, and the user reviews every field before
 * saving, so an adversarial listing can at worst put junk in visible, editable fields.
 */

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function extractApplicationFields(
  formData: FormData,
): Promise<ActionResult<IngestResult>> {
  const text = (formData.get("text") ?? "").toString().trim();
  const files = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (text === "" && files.length === 0) {
    return actionError("Paste some listing text or a screenshot first.");
  }
  if (files.length > MAX_IMAGES) {
    return actionError(`Attach at most ${MAX_IMAGES} screenshots.`);
  }
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      return actionError("Each screenshot must be 5 MB or smaller.");
    }
  }

  // A missing resume is not an error. Scoring is an addition to paste-to-fill, not a
  // precondition for it, so an empty `resumes` table quietly falls back to filling fields
  // exactly as this action did before the feature existed.
  let resumeText: string | null = null;
  let resumeId: string | null = null;
  try {
    const resume = await activeResume();
    if (resume) {
      resumeText = resume.rawText;
      resumeId = resume.id;
    }
  } catch (error) {
    console.error(`[ingest] could not read the active resume: ${String(error)}`);
  }

  const prompt = [
    INGEST_PROMPT,
    text === "" && files.length > 0 ? TRANSCRIBE_PROMPT : "",
    resumeText ? buildMatchPrompt(resumeText) : "",
  ].join("");

  const attachments: ExtractionFile[] = [];
  for (const file of files) {
    attachments.push({
      bytes: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || "image/png",
    });
  }

  const run = await runExtraction({
    prompt,
    text,
    files: attachments,
    shape: extractionShape(resumeText !== null),
    subject: "that listing",
    advice: "Fill the form in by hand.",
  });
  if (!run.ok) return actionError(run.message);

  const validated = parseWith(ingestExtractionSchema, run.data);
  if (!validated.ok) {
    return actionError("Could not read that listing. Fill the form in by hand.");
  }

  const result = validated.data;

  // Prefer what the user actually pasted over anything the model produced. A transcription
  // is only ever a fallback for a screenshot-only paste, and it is the one field where the
  // model could quietly rewrite the source of truth the score is computed from.
  const listingText = text !== "" ? text : (result.listingText?.trim() || null);

  const match = result.judgement ? scoreMatch(result.judgement) : null;

  return {
    ok: true,
    data: {
      values: extractionToFormValues(result),
      match,
      listingText,
      resumeId: match ? resumeId : null,
      extractor: run.extractor,
    },
  };
}
