import "server-only";

import { and, asc, eq, ilike, inArray, not, or, sql, type SQL } from "drizzle-orm";

import { currentUser, currentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  applications,
  companies,
  TERMINAL_OUTCOMES,
  type Application,
  type ApplicationEvent,
  type ApplicationNote,
  type Company,
  type Contact,
  type EmploymentType,
  type Outcome,
  type Stage,
  type WorkSetup,
} from "@/lib/db/schema";
import type { DuplicateCandidate } from "@/lib/domain/duplicate";
import { staleness, type Staleness } from "@/lib/domain/stale";
import {
  applicationFiltersSchema,
  type ApplicationFilters,
  type ApplicationFiltersInput,
  type ApplicationSortKey,
  type SortDirection,
} from "@/lib/validation";

/**
 * Read side for applications.
 *
 * Every function resolves the user itself. No caller passes a userId, because a caller
 * that can pass one can pass someone else's, and this is the layer that would leak it.
 */

export type ApplicationListRow = {
  application: Application;
  company: Company;
  staleness: Staleness;
};

export type ApplicationDetail = {
  application: Application;
  company: Company;
  events: ApplicationEvent[];
  notes: ApplicationNote[];
  contacts: Contact[];
  staleness: Staleness;
};

export type ApplicationFacets = {
  stages: Stage[];
  outcomes: Outcome[];
  employmentTypes: EmploymentType[];
  workSetups: WorkSetup[];
  sources: string[];
};

/** LIKE metacharacters typed by the user are literals, not wildcards. */
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * The stale predicate, expressed in SQL so `staleOnly` can be a filter rather than a
 * post-fetch array filter that would break any future pagination.
 */
function staleCondition(thresholdDays: number): SQL {
  return and(
    sql`${applications.lastActivityAt} < now() - make_interval(days => ${thresholdDays})`,
    not(inArray(applications.outcome, [...TERMINAL_OUTCOMES])),
  ) as SQL;
}

function buildFilterConditions(userId: string, filters: ApplicationFilters, thresholdDays: number) {
  const conditions: SQL[] = [eq(applications.userId, userId)];

  if (filters.stage.length > 0) {
    conditions.push(inArray(applications.stage, filters.stage));
  }
  if (filters.outcome.length > 0) {
    conditions.push(inArray(applications.outcome, filters.outcome));
  }
  if (filters.employmentType.length > 0) {
    conditions.push(inArray(applications.employmentType, filters.employmentType));
  }
  if (filters.workSetup.length > 0) {
    conditions.push(inArray(applications.workSetup, filters.workSetup));
  }

  if (filters.search) {
    const pattern = `%${escapeLikePattern(filters.search)}%`;
    // `ilike` rather than lower() on both sides: it reads as the intent and Postgres
    // plans it the same way for a scan of this size.
    conditions.push(
      or(ilike(companies.name, pattern), ilike(applications.title, pattern)) as SQL,
    );
  }

  if (filters.staleOnly) {
    conditions.push(staleCondition(thresholdDays));
  }

  return conditions;
}

function buildOrderBy(sort: ApplicationSortKey, direction: SortDirection): SQL[] {
  const dir = direction === "asc" ? sql`asc` : sql`desc`;

  switch (sort) {
    case "company":
      return [sql`${companies.name} ${dir}`, asc(applications.title)];
    case "title":
      return [sql`${applications.title} ${dir}`];
    case "stage":
      // The Postgres enum is declared in progression order, so the native ordering of
      // the column is already the ordering the stage strip draws.
      return [sql`${applications.stage} ${dir}`, sql`${applications.outcome} asc`];
    case "salary":
      // Currency and period lead the sort, matching `salaryComparisonKey`. Neither is
      // converted anywhere in this app, so interleaving them would be a lie: ₱1,200/hr
      // is not less than ₱45,000/mo, and a single numeric sort would claim it is.
      // Grouping first and sorting inside each group is the honest answer.
      return [
        sql`${applications.salaryCurrency} asc nulls last`,
        sql`${applications.salaryPeriod} asc nulls last`,
        sql`coalesce(${applications.salaryMax}, ${applications.salaryMin}) ${dir} nulls last`,
      ];
    case "appliedAt":
      return [sql`${applications.appliedAt} ${dir} nulls last`];
    case "createdAt":
      return [sql`${applications.createdAt} ${dir}`];
    case "lastActivityAt":
    default:
      return [sql`${applications.lastActivityAt} ${dir}`];
  }
}

/**
 * The table view. One join, one round trip: the company name is needed on every row and
 * fetching it per row would turn a twelve row table into thirteen queries.
 */
export async function listApplications(
  filters: ApplicationFiltersInput = {},
): Promise<ApplicationListRow[]> {
  const user = await currentUser();
  const parsed = applicationFiltersSchema.parse(filters);

  const conditions = buildFilterConditions(user.id, parsed, user.staleThresholdDays);
  const orderBy = buildOrderBy(parsed.sort, parsed.direction);

  const rows = await db
    .select({ application: applications, company: companies })
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .where(and(...conditions))
    // A stable final key keeps the order deterministic when the sort key ties, which
    // otherwise makes rows appear to shuffle between renders.
    .orderBy(...orderBy, asc(applications.id));

  const now = new Date();

  return rows.map((row) => ({
    application: row.application,
    company: row.company,
    staleness: staleness(row.application, user.staleThresholdDays, now),
  }));
}

/** Everything the detail panel renders, in one relational read. Null when not yours. */
export async function getApplication(id: string): Promise<ApplicationDetail | null> {
  const user = await currentUser();

  const row = await db.query.applications.findFirst({
    where: and(eq(applications.id, id), eq(applications.userId, user.id)),
    with: {
      company: true,
      events: {
        orderBy: (fields, { desc }) => [desc(fields.occurredAt), desc(fields.createdAt)],
      },
      notes: {
        orderBy: (fields, { desc }) => [desc(fields.createdAt)],
      },
      contacts: {
        orderBy: (fields, { asc: ascending }) => [ascending(fields.createdAt)],
      },
    },
  });

  if (!row) return null;

  const { company, events, notes, contacts, ...application } = row;

  return {
    application,
    company,
    events,
    notes,
    contacts,
    staleness: staleness(application, user.staleThresholdDays),
  };
}

/**
 * Candidate applications for a duplicate check: this user's applications at a company
 * matched by the same case-insensitive predicate `resolveCompanyId` uses. A company
 * name with no match returns an empty array immediately — a brand-new company cannot
 * already have a duplicate.
 */
export async function applicationsForCompanyName(
  companyName: string,
): Promise<DuplicateCandidate[]> {
  const userId = await currentUserId();

  return db
    .select({ id: applications.id, title: applications.title, companyName: companies.name })
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .where(
      and(
        eq(applications.userId, userId),
        eq(companies.userId, userId),
        sql`lower(${companies.name}) = lower(${companyName})`,
      ),
    );
}

/**
 * Values actually present in the user's data.
 *
 * Filter controls built from the full enums would offer options that match nothing,
 * which reads as broken. These come from the rows.
 */
export async function applicationFilterFacets(): Promise<ApplicationFacets> {
  const userId = await currentUserId();

  const rows = await db
    .selectDistinct({
      stage: applications.stage,
      outcome: applications.outcome,
      employmentType: applications.employmentType,
      workSetup: applications.workSetup,
      source: applications.source,
    })
    .from(applications)
    .where(eq(applications.userId, userId));

  const stages = new Set<Stage>();
  const outcomes = new Set<Outcome>();
  const employmentTypes = new Set<EmploymentType>();
  const workSetups = new Set<WorkSetup>();
  const sources = new Set<string>();

  for (const row of rows) {
    stages.add(row.stage);
    outcomes.add(row.outcome);
    if (row.employmentType) employmentTypes.add(row.employmentType);
    if (row.workSetup) workSetups.add(row.workSetup);
    if (row.source) sources.add(row.source);
  }

  return {
    // Ordered by the enum declaration rather than by discovery, so the controls keep a
    // stable order as data changes.
    stages: orderByEnum(stages, applications.stage.enumValues),
    outcomes: orderByEnum(outcomes, applications.outcome.enumValues),
    employmentTypes: orderByEnum(employmentTypes, applications.employmentType.enumValues),
    workSetups: orderByEnum(workSetups, applications.workSetup.enumValues),
    sources: [...sources].sort((a, b) => a.localeCompare(b)),
  };
}

function orderByEnum<T extends string>(present: Set<T>, order: readonly string[]): T[] {
  return order.filter((value): value is T => present.has(value as T));
}
