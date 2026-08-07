"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { currentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { applicationNotes, applications } from "@/lib/db/schema";
import {
  actionError,
  noteCreateSchema,
  noteIdSchema,
  noteUpdateSchema,
  parseFormData,
  type ActionResult,
} from "@/lib/validation";

/**
 * Write side for notes.
 *
 * Notes are the only user-authored, editable half of the timeline. Writing one counts as
 * activity, so it bumps `lastActivityAt` on the parent application in the same
 * transaction: a note written today about a call today means the application is not
 * silent, and the stale counter has to agree.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Duplicated per action module because a `"use server"` module may only export async
 * functions, so this cannot be shared from one of them.
 */
function revalidateNoteRoutes(): void {
  revalidatePath("/applications");
  revalidatePath("/applications/[id]", "page");
}

/** Only bump forward, so editing an old note cannot rewind the silence counter. */
async function touchApplication(tx: Tx, userId: string, applicationId: string, at: Date) {
  const [existing] = await tx
    .select({ lastActivityAt: applications.lastActivityAt })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
    .limit(1)
    .for("update");

  if (!existing) return false;

  await tx
    .update(applications)
    .set({
      lastActivityAt: at.getTime() > existing.lastActivityAt.getTime() ? at : existing.lastActivityAt,
      updatedAt: at,
    })
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)));

  return true;
}

export async function createNote(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();

  const parsed = parseFormData(noteCreateSchema, formData);
  if (!parsed.ok) return parsed;
  const input = parsed.data;

  const result = await db.transaction(async (tx): Promise<ActionResult<{ id: string }>> => {
    const now = new Date();

    // Doubles as the ownership check: the update is scoped by userId, so a note can only
    // be attached to an application the caller actually owns.
    const owned = await touchApplication(tx, userId, input.applicationId, now);
    if (!owned) return actionError("That application no longer exists.");

    const [created] = await tx
      .insert(applicationNotes)
      .values({
        userId,
        applicationId: input.applicationId,
        body: input.body,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: applicationNotes.id });

    return { ok: true, data: { id: created.id } };
  });

  if (result.ok) revalidateNoteRoutes();
  return result;
}

export async function updateNote(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();

  const parsed = parseFormData(noteUpdateSchema, formData);
  if (!parsed.ok) return parsed;
  const input = parsed.data;

  const result = await db.transaction(async (tx): Promise<ActionResult<{ id: string }>> => {
    const now = new Date();

    const updated = await tx
      .update(applicationNotes)
      .set({ body: input.body, updatedAt: now })
      .where(and(eq(applicationNotes.id, input.id), eq(applicationNotes.userId, userId)))
      .returning({ applicationId: applicationNotes.applicationId });

    if (updated.length === 0) return actionError("That note no longer exists.");

    await touchApplication(tx, userId, updated[0].applicationId, now);

    return { ok: true, data: { id: input.id } };
  });

  if (result.ok) revalidateNoteRoutes();
  return result;
}

/**
 * Deleting a note does not rewind `lastActivityAt`. The call it recorded still happened,
 * and recomputing the timestamp from the remaining rows would make removing a typo look
 * like the employer went quiet.
 */
export async function deleteNote(formData: FormData): Promise<ActionResult<null>> {
  const userId = await currentUserId();

  const parsed = parseFormData(noteIdSchema, formData);
  if (!parsed.ok) return parsed;

  const deleted = await db
    .delete(applicationNotes)
    .where(and(eq(applicationNotes.id, parsed.data.id), eq(applicationNotes.userId, userId)))
    .returning({ id: applicationNotes.id });

  if (deleted.length === 0) return actionError("That note no longer exists.");

  revalidateNoteRoutes();
  return { ok: true, data: null };
}
