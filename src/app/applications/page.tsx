import Link from "next/link";

import { ApplicationRow } from "@/app/applications/ApplicationRow";
import { FilterBar } from "@/app/applications/FilterBar";
import { AppShell } from "@/components/app/AppShell";
import { CapsuleLink } from "@/components/ui/Capsule";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/cn";
import {
  applicationFilterFacets,
  listApplications,
  type ApplicationListRow,
} from "@/lib/queries/applications";
import { APPLICATION_SORT_KEYS, type ApplicationSortKey } from "@/lib/validation";

/**
 * The primary view. A dense table, because eight fields per job is more than a card
 * can show and scanning is what you actually do here (DESIGN.md section 5).
 *
 * Filters and sort live in the URL, so this component stays a plain server render of
 * whatever the query string asks for.
 */

type Search = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const COLUMNS: { key: ApplicationSortKey | null; label: string; className?: string }[] = [
  { key: "company", label: "company" },
  { key: "title", label: "title" },
  { key: "stage", label: "stage" },
  { key: "match", label: "match" },
  { key: "salary", label: "salary" },
  { key: null, label: "setup", className: "hidden lg:table-cell" },
  { key: null, label: "location", className: "hidden xl:table-cell" },
  { key: "lastActivityAt", label: "silence", className: "text-right" },
];

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;

  const sortParam = first(params.sort);
  const sort = (APPLICATION_SORT_KEYS as readonly string[]).includes(sortParam)
    ? (sortParam as ApplicationSortKey)
    : "lastActivityAt";
  const direction: "asc" | "desc" =
    first(params.direction) === "asc" ? "asc" : "desc";

  const filters = {
    stage: first(params.stage),
    outcome: first(params.outcome),
    employmentType: first(params.employmentType),
    workSetup: first(params.workSetup),
    search: first(params.search),
    staleOnly: first(params.staleOnly),
    minMatch: first(params.minMatch),
    sort,
    direction,
  };

  const [rows, facets] = await Promise.all([
    listApplications(filters),
    applicationFilterFacets(),
  ]);

  const quiet = rows.filter((row) => row.staleness.stale).length;

  return (
    <AppShell active="applications">
      <PageHeader title="applications" kicker={summarise(rows.length, quiet)}>
        <CapsuleLink href="/applications/new">add an application</CapsuleLink>
      </PageHeader>

      <div className="mt-s3 flex flex-col gap-s3">
        <FilterBar
          facets={facets}
          current={{
            stage: filters.stage,
            outcome: filters.outcome,
            employmentType: filters.employmentType,
            workSetup: filters.workSetup,
            search: filters.search,
            staleOnly: filters.staleOnly === "on",
            minMatch: filters.minMatch,
          }}
        />

        {rows.length === 0 ? (
          <EmptyState
            headline="nothing here yet"
            body={
              hasAnyFilter(filters)
                ? "No application matches these filters. Clear them to see everything you have recorded."
                : "Add your first application — paste a listing or a screenshot to fill it in, or type it by hand."
            }
            action={<CapsuleLink href="/applications/new">add an application</CapsuleLink>}
          />
        ) : (
          <ApplicationsTable rows={rows} sort={sort} direction={direction} params={params} />
        )}
      </div>
    </AppShell>
  );
}

function summarise(total: number, quiet: number): string {
  if (total === 0) return "nothing recorded";
  const noun = total === 1 ? "application" : "applications";
  return quiet > 0 ? `${total} ${noun} / ${quiet} gone quiet` : `${total} ${noun}`;
}

function hasAnyFilter(filters: Record<string, string>): boolean {
  return Boolean(
    filters.stage ||
      filters.outcome ||
      filters.employmentType ||
      filters.workSetup ||
      filters.search ||
      filters.staleOnly ||
      filters.minMatch,
  );
}

function ApplicationsTable({
  rows,
  sort,
  direction,
  params,
}: {
  rows: ApplicationListRow[];
  sort: ApplicationSortKey;
  direction: "asc" | "desc";
  params: Search;
}) {
  return (
    // Wide content scrolls inside its own container. The page body never scrolls sideways.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Job applications, sorted by {sort}, {direction}ending.
        </caption>
        <thead>
          <tr className="border-b border-[color-mix(in_srgb,var(--muted)_60%,transparent)]">
            {COLUMNS.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={cn("t-micro px-s1 py-s1 align-bottom", column.className)}
                aria-sort={
                  column.key === sort
                    ? direction === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {column.key ? (
                  <SortLink
                    column={column.key}
                    label={column.label}
                    sort={sort}
                    direction={direction}
                    params={params}
                  />
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ApplicationRow key={row.application.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortLink({
  column,
  label,
  sort,
  direction,
  params,
}: {
  column: ApplicationSortKey;
  label: string;
  sort: ApplicationSortKey;
  direction: "asc" | "desc";
  params: Search;
}) {
  const isActive = column === sort;
  // Clicking the active column flips it; clicking a new one starts descending, which is
  // the useful default for dates and money.
  const nextDirection = isActive && direction === "desc" ? "asc" : "desc";

  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "sort" || key === "direction") continue;
    const single = Array.isArray(value) ? value[0] : value;
    if (single) next.set(key, single);
  }
  next.set("sort", column);
  next.set("direction", nextDirection);

  return (
    <Link
      href={`/applications?${next}`}
      scroll={false}
      className={cn(
        "inline-flex items-center gap-s1 transition-colors duration-150 ease-[ease]",
        isActive ? "text-ink" : "hover:text-ink",
      )}
    >
      {label}
      <span aria-hidden="true" className={cn(!isActive && "opacity-0")}>
        {direction === "asc" ? "^" : "v"}
      </span>
    </Link>
  );
}
