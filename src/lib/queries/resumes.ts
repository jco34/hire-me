import "server-only";

import { and, count, desc, eq } from "drizzle-orm";

import { currentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, resumes, type Resume } from "@/lib/db/schema";

/**
 * Read side for resumes.
 *
 * Like the other query modules, the user is resolved here rather than passed in: a caller
 * that can pass a userId can pass someone else's.
 */

export type ResumeListRow = {
  resume: Resume;
  /** Applications whose score was computed against this version. */
  scoredCount: number;
};

/** The resume every new application is scored against, or null if none is loaded yet. */
export async function activeResume(): Promise<Resume | null> {
  const userId = await currentUserId();

  const [row] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.userId, userId), eq(resumes.isActive, true)))
    .limit(1);

  return row ?? null;
}

/**
 * Every version, active first, then newest.
 *
 * The scored count is what makes deleting an old version a real decision rather than a
 * shrug: those applications lose the record of what they were judged against.
 */
export async function listResumes(): Promise<ResumeListRow[]> {
  const userId = await currentUserId();

  const rows = await db
    .select({ resume: resumes, scoredCount: count(applications.id) })
    .from(resumes)
    .leftJoin(applications, eq(applications.matchResumeId, resumes.id))
    .where(eq(resumes.userId, userId))
    .groupBy(resumes.id)
    .orderBy(desc(resumes.isActive), desc(resumes.createdAt));

  return rows;
}
