"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { currentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { insertActiveResume, setActiveResume } from "@/lib/db/resume-store";
import { resumes } from "@/lib/db/schema";
import { runExtraction } from "@/lib/ingest/run";
import { TEXT_SHAPE } from "@/lib/ingest/shapes";
import {
  actionError,
  parseFormData,
  resumeCreateSchema,
  resumeIdSchema,
  type ActionResult,
} from "@/lib/validation";

/**
 * Write side for resumes.
 *
 * The resume is the thing every match score is measured against, so the rules here are
 * about never leaving the user in a state where scoring silently stops working: there is
 * always exactly one active resume, and the active one cannot be deleted.
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Hard ceiling on how long the composer may sit disabled, per attempt.
 *
 * The SDK retries a 503 with backoff of its own, and when Google is having a bad day that
 * turns into minutes of a greyed-out form with a spinner and no way out — measurably worse
 * than a clear failure, because the user cannot even fall back to pasting. Sixty seconds is
 * far longer than a successful transcription needs and short enough to stay honest.
 *
 * It is passed to every extractor rather than just to Gemini, because the fallback makes a
 * second attempt possible and two uncapped attempts would be exactly the wedged form this
 * limit exists to prevent.
 */
const REQUEST_TIMEOUT_MS = 60_000;

/** PDFs and photos of a printed resume. Both are things people actually have to hand. */
const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

function revalidateResumeRoutes(): void {
  revalidatePath("/profile");
  // Score staleness on the detail panel is derived from which resume is active, so it
  // changes the moment one of these actions runs.
  revalidatePath("/applications/[id]", "page");
}

/** "26 aug 2026" — enough to tell two versions apart at a glance. */
function todayLabel(): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(new Date())
    .toLowerCase();
}

/* ---------------------------------------------------------------------------
 * Reading a file into text
 * ------------------------------------------------------------------------- */

const EXTRACT_PROMPT = [
  "Transcribe this resume to plain text.",
  "Rules:",
  "- Return the text only. No commentary, no preamble, no markdown fences.",
  "- Preserve section headings, job titles, employers, dates and bullet points.",
  "- Keep the reading order a human would use. Do not summarise and do not omit anything.",
  "- Do not invent anything that is not in the document.",
].join("\n");

/**
 * Turn an uploaded resume into text the user can review before saving.
 *
 * Deliberately a separate step from saving. The model transcribes, the user reads what it
 * produced in a plain textarea, and only then is anything stored — the same bargain
 * paste-to-fill makes with a job listing. A silent bad transcription here would poison
 * every score that followed, and it would be invisible.
 *
 * Every failure ends by pointing at the paste box, because pasting always works, needs no
 * key, and is the one path that cannot be having a bad day.
 */
export async function extractResumeText(formData: FormData): Promise<ActionResult<string>> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return actionError("Choose a PDF or an image of your resume.");
  }
  if (file.size > MAX_FILE_BYTES) {
    return actionError("That file is over 10 MB. Paste the text instead.");
  }
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return actionError("Upload a PDF, PNG, JPEG or WebP, or paste the text instead.");
  }

  const run = await runExtraction({
    prompt: EXTRACT_PROMPT,
    text: "",
    files: [{ bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.type }],
    shape: TEXT_SHAPE,
    subject: "that file",
    advice: "Paste the text instead.",
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
  if (!run.ok) return actionError(run.message);

  const text = typeof run.data === "string" ? run.data.trim() : "";

  if (text.length < 200) {
    return actionError(
      "Barely any text came back from that file. Paste the text instead.",
    );
  }

  return { ok: true, data: text };
}

/* ---------------------------------------------------------------------------
 * Versions
 * ------------------------------------------------------------------------- */

export async function createResume(formData: FormData): Promise<ActionResult<null>> {
  const userId = await currentUserId();

  const parsed = parseFormData(resumeCreateSchema, formData);
  if (!parsed.ok) return parsed;

  await insertActiveResume(
    userId,
    parsed.data.label ?? todayLabel(),
    parsed.data.rawText,
  );

  revalidateResumeRoutes();
  return { ok: true, data: null };
}

export async function activateResume(formData: FormData): Promise<ActionResult<null>> {
  const userId = await currentUserId();

  const parsed = parseFormData(resumeIdSchema, formData);
  if (!parsed.ok) return parsed;

  const promoted = await setActiveResume(userId, parsed.data.id);
  if (!promoted) return actionError("That resume no longer exists.");

  revalidateResumeRoutes();
  return { ok: true, data: null };
}

/**
 * Delete a version.
 *
 * The active one is refused: deleting it would leave nothing to score against, and every
 * later extraction would quietly come back unscored with no explanation. Activate another
 * version first, which forces the choice to be deliberate.
 *
 * Applications scored against a deleted version keep their number — `matchResumeId` is
 * `on delete set null` — and simply stop being able to name what produced it.
 */
export async function deleteResume(formData: FormData): Promise<ActionResult<null>> {
  const userId = await currentUserId();

  const parsed = parseFormData(resumeIdSchema, formData);
  if (!parsed.ok) return parsed;

  const [target] = await db
    .select({ isActive: resumes.isActive })
    .from(resumes)
    .where(and(eq(resumes.id, parsed.data.id), eq(resumes.userId, userId)))
    .limit(1);

  if (!target) return actionError("That resume no longer exists.");
  if (target.isActive) {
    return actionError("This is the resume in use. Make another version active first.");
  }

  await db
    .delete(resumes)
    .where(and(eq(resumes.id, parsed.data.id), eq(resumes.userId, userId)));

  revalidateResumeRoutes();
  return { ok: true, data: null };
}
