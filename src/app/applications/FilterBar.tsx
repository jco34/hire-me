"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

import { FlatButton } from "@/components/ui/Capsule";
import { OUTCOME_LABELS, STAGE_LABELS } from "@/components/ui/StageStrip";
import { EMPLOYMENT_TYPE_LABELS, WORK_SETUP_LABELS } from "@/components/ui/Meta";
import { cn } from "@/lib/cn";

/**
 * Filters live in the URL rather than in component state, so a filtered view is
 * linkable, survives a reload, and is the same thing the server already used to build
 * the rows. Each control writes one search param and lets the server re-query.
 */

const CONTROL = cn(
  "t-body bg-surface text-ink",
  "border border-[color-mix(in_srgb,var(--muted)_60%,transparent)]",
  "rounded-sm px-s2 min-h-11",
  "transition-colors duration-150 ease-[ease] focus:border-ink",
);

type Facets = {
  stages: string[];
  outcomes: string[];
  employmentTypes: string[];
  workSetups: string[];
};

export function FilterBar({
  facets,
  current,
}: {
  facets: Facets;
  current: {
    stage: string;
    outcome: string;
    employmentType: string;
    workSetup: string;
    search: string;
    staleOnly: boolean;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      startTransition(() => {
        router.replace(next.toString() ? `${pathname}?${next}` : pathname, {
          scroll: false,
        });
      });
    },
    [params, pathname, router],
  );

  const hasFilters =
    current.stage ||
    current.outcome ||
    current.employmentType ||
    current.workSetup ||
    current.search ||
    current.staleOnly;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-s2 transition-opacity duration-150 ease-[ease]",
        pending && "opacity-60",
      )}
    >
      <label className="sr-only" htmlFor="filter-search">
        Search by company or job title
      </label>
      <input
        id="filter-search"
        type="search"
        defaultValue={current.search}
        placeholder="company or title"
        className={cn(CONTROL, "w-[220px] placeholder:text-ink-soft")}
        onChange={(event) => setParam("search", event.target.value.trim() || null)}
      />

      <FacetSelect
        label="stage"
        value={current.stage}
        options={facets.stages}
        labels={STAGE_LABELS}
        onChange={(value) => setParam("stage", value)}
      />
      <FacetSelect
        label="outcome"
        value={current.outcome}
        options={facets.outcomes}
        labels={OUTCOME_LABELS}
        onChange={(value) => setParam("outcome", value)}
      />
      <FacetSelect
        label="type"
        value={current.employmentType}
        options={facets.employmentTypes}
        labels={EMPLOYMENT_TYPE_LABELS}
        onChange={(value) => setParam("employmentType", value)}
      />
      <FacetSelect
        label="setup"
        value={current.workSetup}
        options={facets.workSetups}
        labels={WORK_SETUP_LABELS}
        onChange={(value) => setParam("workSetup", value)}
      />

      <label className="flex min-h-11 cursor-pointer items-center gap-s1">
        <input
          type="checkbox"
          checked={current.staleOnly}
          onChange={(event) => setParam("staleOnly", event.target.checked ? "on" : null)}
          className="size-cell accent-[var(--ink)]"
        />
        <span className="t-micro text-ink-soft">gone quiet only</span>
      </label>

      {hasFilters ? (
        <FlatButton type="button" onClick={() => startTransition(() => router.replace(pathname))}>
          clear
        </FlatButton>
      ) : null}
    </div>
  );
}

function FacetSelect({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels: Record<string, string>;
  onChange: (value: string | null) => void;
}) {
  // A facet with nothing behind it is noise, so it is not rendered at all.
  if (options.length === 0) return null;

  return (
    <label className="flex items-center gap-s1">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value || null)}
        className={cn(CONTROL, "appearance-none pr-s3")}
      >
        <option value="">{label}: any</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}
