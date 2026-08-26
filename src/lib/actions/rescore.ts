"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { currentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications } from "@/lib/db/schema";
import { buildMatchPrompt } from "@/lib/domain/ingest";
import { scoreMatch } from "@/lib/domain/match";
import { runExtraction } from "@/lib/ingest/run";
import { judgementShape, rescoreResultSchema } from "@/lib/ingest/shapes";
import { activeResume } from "@/lib/queries/resumes";
import { actionError, parseFormData, parseWith, rescoreSchema, type ActionResult } from "@/lib/validation";

/**
 * Score an application again, against whatever resume is active now.
 *
 * Deliberately manual. This is a whole extra model call — against a free-tier key, or
 * against a subscription's usage limits when it falls through to Claude — so it never runs
 * on page load or on a schedule. You press the button when you have rewritten your resume
 * and want to know what changed.
 *
 * Only works on applications that stored their posting. Everything saved before
 * `listingText` existed has nothing to score against, and says so rather than guessing
 * from the two-sentence description.
 */

export async function rescoreApplication(formData: FormData): Promise<ActionResult<null>> {
  const parsed = parseFormData(rescoreSchema, formData);
  if (!parsed.ok) return parsed;

  const userId = await currentUserId();

  const [row] = await db
    .select({ id: applications.id, listingText: applications.listingText })
    .from(applications)
    .where(and(eq(applications.id, parsed.data.id), eq(applications.userId, userId)))
    .limit(1);

  if (!row) return actionError("That application no longer exists.");
  if (!row.listingText) {
    return actionError(
      "This one was saved without its posting, so there is nothing to score. Paste the listing into a new application instead.",
    );
  }

  const resume = await activeResume();
  if (!resume) {
    return actionError("No resume loaded. Run `npm run resume:import` first.");
  }

  const run = await runExtraction({
    prompt:
      "Judge how well the candidate's resume answers the job posting below.\n" +
      buildMatchPrompt(resume.rawText),
    text: row.listingText,
    files: [],
    shape: judgementShape(),
    subject: "that posting",
    advice: "Try again in a minute.",
  });
  if (!run.ok) return actionError(run.message);

  const validated = parseWith(rescoreResultSchema, run.data);
  if (!validated.ok) return actionError("Could not read the score that came back. Try again.");

  const judgement = validated.data.judgement;
  const breakdown = judgement ? scoreMatch(judgement) : null;
  if (!breakdown) {
    return actionError("There was not enough in that posting to score against.");
  }

  await db
    .update(applications)
    .set({
      matchScore: breakdown.score,
      matchBreakdown: breakdown,
      matchResumeId: resume.id,
      matchScoredAt: new Date(),
      // Scoring is not a sign of life from the employer, so `lastActivityAt` is untouched
      // and the silence counter keeps running. Same reasoning as follow-ups.
      updatedAt: new Date(),
    })
    .where(and(eq(applications.id, row.id), eq(applications.userId, userId)));

  revalidatePath("/applications");
  revalidatePath("/applications/[id]", "page");
  return { ok: true, data: null };
}
