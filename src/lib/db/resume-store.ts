import { and, eq, ne } from "drizzle-orm";

import { db } from "./index";
import { resumes } from "./schema";

/**
 * The one place a resume becomes the active one.
 *
 * Shared by the `/profile` route and by `npm run resume:import`, which is the whole point:
 * `resumes_active_key` is a partial unique index, so "stand every other version down, then
 * raise this one" has to happen in a single transaction or the insert is rejected. Two
 * copies of that dance would eventually disagree, and the failure mode — a user with no
 * active resume, so nothing scores — is silent.
 *
 * Not a server action: a `"use server"` module may only export async functions and is
 * reachable by POST, and this is neither. The action wrapper in `actions/resumes.ts` owns
 * validation and revalidation; this owns the transaction.
 */

/** Insert a new resume and make it the active one. Returns the new id. */
export async function insertActiveResume(
  userId: string,
  label: string,
  rawText: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    await tx
      .update(resumes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(resumes.userId, userId), eq(resumes.isActive, true)));

    const [created] = await tx
      .insert(resumes)
      .values({ userId, label, rawText, isActive: true })
      .returning({ id: resumes.id });

    return created.id;
  });
}

/**
 * Promote an existing version back to active. Returns false when the id is not the
 * caller's, so the action can report a missing row rather than silently doing nothing.
 */
export async function setActiveResume(userId: string, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: resumes.id })
      .from(resumes)
      .where(and(eq(resumes.id, id), eq(resumes.userId, userId)))
      .limit(1);

    if (!target) return false;

    // Scoped with `ne` so the row being promoted is never momentarily stood down by its
    // own update, which would make an already-active resume flicker to none.
    await tx
      .update(resumes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(resumes.userId, userId), ne(resumes.id, id)));

    await tx
      .update(resumes)
      .set({ isActive: true, updatedAt: new Date() })
      .where(and(eq(resumes.id, id), eq(resumes.userId, userId)));

    return true;
  });
}
