"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { currentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { applicationEvents, applications, contacts } from "@/lib/db/schema";
import {
  actionError,
  contactCreateSchema,
  contactIdSchema,
  contactUpdateSchema,
  parseFormData,
  type ActionResult,
} from "@/lib/validation";

/**
 * Write side for contacts.
 *
 * Adding a contact is a real moment in an application's history ("a recruiter got in
 * touch"), so it writes a `contact_added` event in the same transaction as the row.
 * Editing or removing one is bookkeeping and writes nothing to the log, because the
 * event table is append-only and an edit has no honest event to append.
 */

/**
 * Duplicated per action module because a `"use server"` module may only export async
 * functions, so this cannot be shared from one of them.
 */
function revalidateContactRoutes(): void {
  revalidatePath("/applications");
  revalidatePath("/applications/[id]", "page");
}

export async function createContact(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();

  const parsed = parseFormData(contactCreateSchema, formData);
  if (!parsed.ok) return parsed;
  const input = parsed.data;

  const result = await db.transaction(async (tx): Promise<ActionResult<{ id: string }>> => {
    const [owned] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, input.applicationId), eq(applications.userId, userId)))
      .limit(1);

    if (!owned) return actionError("That application no longer exists.");

    const now = new Date();

    const [created] = await tx
      .insert(contacts)
      .values({
        userId,
        applicationId: input.applicationId,
        name: input.name,
        role: input.role,
        email: input.email,
        phone: input.phone,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: contacts.id });

    await tx.insert(applicationEvents).values({
      userId,
      applicationId: input.applicationId,
      type: "contact_added",
      // The event table has no contact reference, so the name goes in the detail string
      // to keep the timeline entry readable on its own.
      detail: input.role ? `${input.name} (${input.role})` : input.name,
      occurredAt: now,
    });

    return { ok: true, data: { id: created.id } };
  });

  if (result.ok) revalidateContactRoutes();
  return result;
}

export async function updateContact(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();

  const parsed = parseFormData(contactUpdateSchema, formData);
  if (!parsed.ok) return parsed;
  const input = parsed.data;

  const updated = await db
    .update(contacts)
    .set({
      name: input.name,
      role: input.role,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
      updatedAt: new Date(),
    })
    .where(and(eq(contacts.id, input.id), eq(contacts.userId, userId)))
    .returning({ id: contacts.id });

  if (updated.length === 0) return actionError("That contact no longer exists.");

  revalidateContactRoutes();
  return { ok: true, data: { id: input.id } };
}

export async function deleteContact(formData: FormData): Promise<ActionResult<null>> {
  const userId = await currentUserId();

  const parsed = parseFormData(contactIdSchema, formData);
  if (!parsed.ok) return parsed;

  const deleted = await db
    .delete(contacts)
    .where(and(eq(contacts.id, parsed.data.id), eq(contacts.userId, userId)))
    .returning({ id: contacts.id });

  if (deleted.length === 0) return actionError("That contact no longer exists.");

  revalidateContactRoutes();
  return { ok: true, data: null };
}
