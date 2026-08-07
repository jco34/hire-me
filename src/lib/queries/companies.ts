import "server-only";

import { and, asc, count, eq, max, sql } from "drizzle-orm";

import { currentUser, currentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, companies, type Application, type Company } from "@/lib/db/schema";
import { staleness, type Staleness } from "@/lib/domain/stale";

/**
 * Read side for companies. Same rule as the application queries: the user is resolved
 * here, never accepted from a caller.
 */

export type CompanyListRow = {
  company: Company;
  applicationCount: number;
  /** Most recent activity across the company's applications. Null when it has none. */
  lastActivityAt: Date | null;
};

export type CompanyDetail = {
  company: Company;
  applications: Array<{ application: Application; staleness: Staleness }>;
};

/**
 * The companies index. The count and the last-activity figure are aggregated in SQL so
 * the page is one query no matter how many companies exist.
 */
export async function listCompanies(): Promise<CompanyListRow[]> {
  const userId = await currentUserId();

  const rows = await db
    .select({
      company: companies,
      applicationCount: count(applications.id),
      lastActivityAt: max(applications.lastActivityAt),
    })
    .from(companies)
    // Left join, so a company with no applications yet still appears. The userId
    // predicate sits in the join condition rather than the where clause, otherwise it
    // would turn the left join back into an inner one.
    .leftJoin(
      applications,
      and(eq(applications.companyId, companies.id), eq(applications.userId, userId)),
    )
    .where(eq(companies.userId, userId))
    .groupBy(companies.id)
    .orderBy(asc(companies.name));

  return rows.map((row) => ({
    company: row.company,
    applicationCount: row.applicationCount,
    lastActivityAt: toDate(row.lastActivityAt),
  }));
}

/** A company and everything filed under it. Null when not found or not owned. */
export async function getCompany(id: string): Promise<CompanyDetail | null> {
  const user = await currentUser();

  const row = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.userId, user.id)),
    with: {
      applications: {
        orderBy: (fields, { desc }) => [desc(fields.lastActivityAt)],
      },
    },
  });

  if (!row) return null;

  const { applications: companyApplications, ...company } = row;
  const now = new Date();

  return {
    company,
    applications: companyApplications.map((application) => ({
      application,
      staleness: staleness(application, user.staleThresholdDays, now),
    })),
  };
}

/**
 * Case-insensitive exact match, mirroring the `companies_user_name_key` unique index.
 * Used on create so "Acme" and "acme" do not become two companies.
 */
export async function findCompanyByName(name: string): Promise<Company | null> {
  const userId = await currentUserId();
  const trimmed = name.trim();
  if (trimmed === "") return null;

  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.userId, userId), sql`lower(${companies.name}) = lower(${trimmed})`))
    .limit(1);

  return company ?? null;
}

/**
 * `max()` over a timestamp column comes back as whatever the driver decoded, which is a
 * Date for `timestamptz` but is typed loosely by the aggregate helper.
 */
function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
