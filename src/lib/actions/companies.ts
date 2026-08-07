"use server";

import { and, count, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { currentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, companies } from "@/lib/db/schema";
import {
  actionError,
  companyCreateSchema,
  companyIdSchema,
  companyUpdateSchema,
  parseFormData,
  type ActionResult,
} from "@/lib/validation";

/**
 * Write side for companies. Same rules as the application actions: user resolved here,
 * every statement scoped by it, ownership verified before any write.
 */

/**
 * Duplicated per action module because a `"use server"` module may only export async
 * functions, so this cannot be shared from one of them.
 */
function revalidateCompanyRoutes(): void {
  revalidatePath("/companies");
  // The company name is rendered on every application row and in the detail panel.
  revalidatePath("/applications");
  revalidatePath("/applications/[id]", "page");
}

export async function createCompany(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();

  const parsed = parseFormData(companyCreateSchema, formData);
  if (!parsed.ok) return parsed;
  const input = parsed.data;

  const [existing] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.userId, userId), sql`lower(${companies.name}) = lower(${input.name})`))
    .limit(1);

  if (existing) {
    return actionError(`"${input.name}" is already on your list.`, "name");
  }

  const [created] = await db
    .insert(companies)
    .values({
      userId,
      name: input.name,
      website: input.website,
      location: input.location,
      notes: input.notes,
    })
    .returning({ id: companies.id });

  revalidateCompanyRoutes();
  return { ok: true, data: { id: created.id } };
}

export async function updateCompany(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();

  const parsed = parseFormData(companyUpdateSchema, formData);
  if (!parsed.ok) return parsed;
  const input = parsed.data;

  // Renaming onto another company's name would violate `companies_user_name_key`, so it
  // is reported as a field error rather than surfacing as a database exception.
  const [clash] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        eq(companies.userId, userId),
        ne(companies.id, input.id),
        sql`lower(${companies.name}) = lower(${input.name})`,
      ),
    )
    .limit(1);

  if (clash) {
    return actionError(`"${input.name}" is already on your list.`, "name");
  }

  const updated = await db
    .update(companies)
    .set({
      name: input.name,
      website: input.website,
      location: input.location,
      notes: input.notes,
      updatedAt: new Date(),
    })
    .where(and(eq(companies.id, input.id), eq(companies.userId, userId)))
    .returning({ id: companies.id });

  if (updated.length === 0) {
    return actionError("That company no longer exists.");
  }

  revalidateCompanyRoutes();
  return { ok: true, data: { id: input.id } };
}

/**
 * Deleting a company cascades to its applications at the database level, which would
 * silently destroy history. So it is refused while anything still references it and the
 * user is told exactly how much is in the way.
 */
export async function deleteCompany(formData: FormData): Promise<ActionResult<null>> {
  const userId = await currentUserId();

  const parsed = parseFormData(companyIdSchema, formData);
  if (!parsed.ok) return parsed;
  const { id } = parsed.data;

  const result = await db.transaction(async (tx): Promise<ActionResult<null>> => {
    const [owned] = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, id), eq(companies.userId, userId)))
      .limit(1);

    if (!owned) return actionError("That company no longer exists.");

    const [{ total }] = await tx
      .select({ total: count() })
      .from(applications)
      .where(and(eq(applications.companyId, id), eq(applications.userId, userId)));

    if (total > 0) {
      return actionError(
        total === 1
          ? "This company still has 1 application. Delete or reassign it first."
          : `This company still has ${total} applications. Delete or reassign them first.`,
      );
    }

    await tx.delete(companies).where(and(eq(companies.id, id), eq(companies.userId, userId)));

    return { ok: true, data: null };
  });

  if (result.ok) revalidateCompanyRoutes();
  return result;
}
