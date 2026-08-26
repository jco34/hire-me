"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { currentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  applicationEvents,
  applications,
  companies,
  type Application,
  type NewApplicationEvent,
} from "@/lib/db/schema";
import { canChangeStage, stageIndex, stageLabel, outcomeLabel } from "@/lib/domain/stage";
import {
  actionError,
  applicationCreateSchema,
  applicationIdSchema,
  applicationUpdateSchema,
  followUpClearSchema,
  followUpSetSchema,
  outcomeChangeSchema,
  parseFormData,
  stageChangeSchema,
  type ActionResult,
} from "@/lib/validation";

/**
 * Write side for applications.
 *
 * Two invariants hold everywhere in this file:
 *
 * 1. The user is resolved here and every statement is scoped by it. Server actions are
 *    reachable by direct POST, so an id arriving in a form is a claim, not a fact.
 * 2. A row change and the event that describes it are written in the same transaction.
 *    An event log that can drift from the row it describes is worse than no event log,
 *    because it looks authoritative while being wrong.
 */

/** The transaction handle, so helpers can be written outside the callback. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Duplicated in each action module rather than shared: a module carrying the
 * `"use server"` directive may only export async functions, so a shared sync helper
 * cannot live in one and be imported by the others.
 */
function revalidateApplicationRoutes(): void {
  revalidatePath("/applications");
  revalidatePath("/applications/[id]", "page");
  revalidatePath("/companies");
}

/** Money leaves validation as a number and enters a numeric(14,2) column as a string. */
function toNumericColumn(value: number | null): string | null {
  return value === null ? null : value.toFixed(2);
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolve a company by name inside the caller's transaction, creating it when it is new.
 *
 * The lookup is case-insensitive to match `companies_user_name_key`, so typing "acme"
 * when "Acme" already exists reuses the row instead of failing on the unique index.
 */
async function resolveCompanyId(tx: Tx, userId: string, name: string): Promise<string> {
  const [existing] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.userId, userId), sql`lower(${companies.name}) = lower(${name})`))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await tx
    .insert(companies)
    .values({ userId, name })
    .onConflictDoNothing()
    .returning({ id: companies.id });

  if (created) return created.id;

  // Lost a race against a concurrent insert; the row exists now, so read it back.
  const [raced] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.userId, userId), sql`lower(${companies.name}) = lower(${name})`))
    .limit(1);

  if (!raced) {
    throw new Error(`Could not resolve or create the company "${name}".`);
  }
  return raced.id;
}

/** Load an application the current user actually owns, locked for the rest of the transaction. */
async function loadOwnedApplication(
  tx: Tx,
  userId: string,
  id: string,
): Promise<Application | undefined> {
  const [row] = await tx
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .limit(1)
    .for("update");

  return row;
}

/** Activity only ever moves forward, even when an event is logged after the fact. */
function laterOf(current: Date, candidate: Date): Date {
  return candidate.getTime() > current.getTime() ? candidate : current;
}

/* ---------------------------------------------------------------------------
 * Create / update / delete
 * ------------------------------------------------------------------------- */

export async function createApplication(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();

  const parsed = parseFormData(applicationCreateSchema, formData);
  if (!parsed.ok) return parsed;
  const input = parsed.data;

  const now = new Date();
  // Anything past `saved` means it was actually sent, so date it now unless the user
  // supplied the real date. Leaving it null would hide the row from applied-at sorting.
  const appliedAt = input.appliedAt ?? (input.stage === "saved" ? null : now);

  const id = await db.transaction(async (tx) => {
    const companyId = await resolveCompanyId(tx, userId, input.companyName);

    const [created] = await tx
      .insert(applications)
      .values({
        userId,
        companyId,
        title: input.title,
        description: input.description,
        url: input.url,
        source: input.source,
        employmentType: input.employmentType,
        workSetup: input.workSetup,
        location: input.location,
        salaryMin: toNumericColumn(input.salaryMin),
        salaryMax: toNumericColumn(input.salaryMax),
        salaryCurrency: input.salaryCurrency,
        salaryPeriod: input.salaryPeriod,
        salaryRaw: input.salaryRaw,
        salaryNotDisclosed: input.salaryNotDisclosed,
        listingText: input.listingText,
        // Read off the breakdown rather than from a field of its own, so the number on the
        // row and the number in the evidence can never disagree.
        matchScore: input.matchBreakdown?.score ?? null,
        matchBreakdown: input.matchBreakdown,
        matchResumeId: input.matchBreakdown ? input.matchResumeId : null,
        matchScoredAt: input.matchBreakdown ? now : null,
        stage: input.stage,
        outcome: input.outcome,
        appliedAt,
        followUpAt: input.followUpAt,
        lastActivityAt: now,
      })
      .returning({ id: applications.id });

    await tx.insert(applicationEvents).values({
      userId,
      applicationId: created.id,
      type: "created",
      toStage: input.stage,
      toOutcome: input.outcome,
      occurredAt: now,
    });

    return created.id;
  });

  revalidateApplicationRoutes();
  return { ok: true, data: { id } };
}

/**
 * The general edit.
 *
 * Stage and outcome are accepted here as well as through their dedicated actions, so a
 * single edit form works, but a change to either still writes its event in the same
 * transaction. `lastActivityAt` moves only when stage or outcome moved: fixing a typo in
 * a job title is not a sign of life from the employer, and treating it as one would
 * quietly reset the silence counter.
 */
export async function updateApplication(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();

  const parsed = parseFormData(applicationUpdateSchema, formData);
  if (!parsed.ok) return parsed;
  const input = parsed.data;

  const result = await db.transaction(async (tx): Promise<ActionResult<{ id: string }>> => {
    const existing = await loadOwnedApplication(tx, userId, input.id);
    if (!existing) return actionError("That application no longer exists.");

    const companyId = await resolveCompanyId(tx, userId, input.companyName);

    const now = new Date();
    const stageChanged = input.stage !== existing.stage;
    const outcomeChanged = input.outcome !== existing.outcome;
    const movedPastSaved = stageIndex(input.stage) > stageIndex("saved");

    await tx
      .update(applications)
      .set({
        companyId,
        title: input.title,
        description: input.description,
        url: input.url,
        source: input.source,
        employmentType: input.employmentType,
        workSetup: input.workSetup,
        location: input.location,
        salaryMin: toNumericColumn(input.salaryMin),
        salaryMax: toNumericColumn(input.salaryMax),
        salaryCurrency: input.salaryCurrency,
        salaryPeriod: input.salaryPeriod,
        salaryRaw: input.salaryRaw,
        salaryNotDisclosed: input.salaryNotDisclosed,
        stage: input.stage,
        outcome: input.outcome,
        // A recorded applied date is never cleared by an edit that did not supply one.
        // Wiping it because a form omitted the field would silently destroy history,
        // and the same backfill as `changeStage` covers the case where it was missing.
        appliedAt: input.appliedAt ?? existing.appliedAt ?? (movedPastSaved ? now : null),
        followUpAt: input.followUpAt,
        lastActivityAt:
          stageChanged || outcomeChanged ? laterOf(existing.lastActivityAt, now) : undefined,
        updatedAt: now,
      })
      .where(and(eq(applications.id, input.id), eq(applications.userId, userId)));

    const events: NewApplicationEvent[] = [];
    if (stageChanged) {
      events.push({
        userId,
        applicationId: input.id,
        type: "stage_change",
        fromStage: existing.stage,
        toStage: input.stage,
        occurredAt: now,
      });
    }
    if (outcomeChanged) {
      events.push({
        userId,
        applicationId: input.id,
        type: "outcome_change",
        fromOutcome: existing.outcome,
        toOutcome: input.outcome,
        occurredAt: now,
      });
    }
    if (events.length > 0) {
      await tx.insert(applicationEvents).values(events);
    }

    return { ok: true, data: { id: input.id } };
  });

  if (result.ok) revalidateApplicationRoutes();
  return result;
}

export async function deleteApplication(formData: FormData): Promise<ActionResult<null>> {
  const userId = await currentUserId();

  const parsed = parseFormData(applicationIdSchema, formData);
  if (!parsed.ok) return parsed;

  // Events, notes and contacts go with it by cascade.
  const deleted = await db
    .delete(applications)
    .where(and(eq(applications.id, parsed.data.id), eq(applications.userId, userId)))
    .returning({ id: applications.id });

  if (deleted.length === 0) {
    return actionError("That application no longer exists.");
  }

  revalidateApplicationRoutes();
  return { ok: true, data: null };
}

/* ---------------------------------------------------------------------------
 * Stage, outcome and follow-up
 * ------------------------------------------------------------------------- */

export async function changeStage(formData: FormData): Promise<ActionResult<null>> {
  const userId = await currentUserId();

  const parsed = parseFormData(stageChangeSchema, formData);
  if (!parsed.ok) return parsed;
  const input = parsed.data;

  const result = await db.transaction(async (tx): Promise<ActionResult<null>> => {
    const existing = await loadOwnedApplication(tx, userId, input.applicationId);
    if (!existing) return actionError("That application no longer exists.");

    if (!canChangeStage(existing.stage, input.toStage, { allowBackward: input.allowBackward })) {
      const message =
        existing.stage === input.toStage
          ? `Already at ${stageLabel(input.toStage)}.`
          : `Moving back to ${stageLabel(input.toStage)} needs to be confirmed.`;
      return actionError(message, "toStage");
    }

    const occurredAt = input.occurredAt ?? new Date();
    const movedPastSaved = stageIndex(input.toStage) > stageIndex("saved");

    await tx
      .update(applications)
      .set({
        stage: input.toStage,
        // Reaching any stage beyond `saved` means the application went out, so backfill
        // the date if it was never recorded.
        appliedAt: existing.appliedAt ?? (movedPastSaved ? occurredAt : null),
        lastActivityAt: laterOf(existing.lastActivityAt, occurredAt),
        updatedAt: new Date(),
      })
      .where(and(eq(applications.id, input.applicationId), eq(applications.userId, userId)));

    await tx.insert(applicationEvents).values({
      userId,
      applicationId: input.applicationId,
      type: "stage_change",
      fromStage: existing.stage,
      toStage: input.toStage,
      detail: input.detail,
      occurredAt,
    });

    return { ok: true, data: null };
  });

  if (result.ok) revalidateApplicationRoutes();
  return result;
}

export async function changeOutcome(formData: FormData): Promise<ActionResult<null>> {
  const userId = await currentUserId();

  const parsed = parseFormData(outcomeChangeSchema, formData);
  if (!parsed.ok) return parsed;
  const input = parsed.data;

  const result = await db.transaction(async (tx): Promise<ActionResult<null>> => {
    const existing = await loadOwnedApplication(tx, userId, input.applicationId);
    if (!existing) return actionError("That application no longer exists.");

    if (existing.outcome === input.toOutcome) {
      return actionError(`Already ${outcomeLabel(input.toOutcome)}.`, "toOutcome");
    }

    const occurredAt = input.occurredAt ?? new Date();

    await tx
      .update(applications)
      .set({
        outcome: input.toOutcome,
        lastActivityAt: laterOf(existing.lastActivityAt, occurredAt),
        updatedAt: new Date(),
      })
      .where(and(eq(applications.id, input.applicationId), eq(applications.userId, userId)));

    await tx.insert(applicationEvents).values({
      userId,
      applicationId: input.applicationId,
      type: "outcome_change",
      fromOutcome: existing.outcome,
      toOutcome: input.toOutcome,
      detail: input.detail,
      occurredAt,
    });

    return { ok: true, data: null };
  });

  if (result.ok) revalidateApplicationRoutes();
  return result;
}

/**
 * Follow-ups deliberately do not touch `lastActivityAt`. Scheduling a reminder is your
 * activity, not the employer's, and letting it reset the silence counter would make an
 * application look alive precisely when it has gone quiet.
 */
export async function setFollowUp(formData: FormData): Promise<ActionResult<null>> {
  const userId = await currentUserId();

  const parsed = parseFormData(followUpSetSchema, formData);
  if (!parsed.ok) return parsed;
  const input = parsed.data;

  const result = await db.transaction(async (tx): Promise<ActionResult<null>> => {
    const existing = await loadOwnedApplication(tx, userId, input.applicationId);
    if (!existing) return actionError("That application no longer exists.");

    const now = new Date();

    await tx
      .update(applications)
      .set({ followUpAt: input.followUpAt, updatedAt: now })
      .where(and(eq(applications.id, input.applicationId), eq(applications.userId, userId)));

    await tx.insert(applicationEvents).values({
      userId,
      applicationId: input.applicationId,
      type: "follow_up_set",
      // The event table has no date column of its own, so the target date is written
      // into the detail string to keep the timeline entry self-explanatory.
      detail: input.detail ?? `follow up on ${formatDay(input.followUpAt)}`,
      occurredAt: now,
    });

    return { ok: true, data: null };
  });

  if (result.ok) revalidateApplicationRoutes();
  return result;
}

export async function clearFollowUp(formData: FormData): Promise<ActionResult<null>> {
  const userId = await currentUserId();

  const parsed = parseFormData(followUpClearSchema, formData);
  if (!parsed.ok) return parsed;
  const input = parsed.data;

  const result = await db.transaction(async (tx): Promise<ActionResult<null>> => {
    const existing = await loadOwnedApplication(tx, userId, input.applicationId);
    if (!existing) return actionError("That application no longer exists.");
    if (existing.followUpAt === null) {
      return actionError("There is no follow-up to clear.");
    }

    const now = new Date();

    await tx
      .update(applications)
      .set({ followUpAt: null, updatedAt: now })
      .where(and(eq(applications.id, input.applicationId), eq(applications.userId, userId)));

    await tx.insert(applicationEvents).values({
      userId,
      applicationId: input.applicationId,
      type: "follow_up_cleared",
      detail: `follow up on ${formatDay(existing.followUpAt)} cleared`,
      occurredAt: now,
    });

    return { ok: true, data: null };
  });

  if (result.ok) revalidateApplicationRoutes();
  return result;
}
