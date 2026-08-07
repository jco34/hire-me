import type { ReactNode } from "react";

import type { EmploymentType, WorkSetup } from "@/lib/db/schema";
import { cn } from "@/lib/cn";

/**
 * Label-over-value pairs for the detail panel: salary, location, setup, employment type.
 *
 * DESIGN.md section 6: a label and its value belong together, so they sit at --s-1 with
 * nothing between them. Separate pairs are separate clusters and sit at --s-3. Nothing
 * sits at a middling distance.
 */

/** An absent value is still information. It is stated, never left as a hole. */
const ABSENT = "not stated";

interface MetaItemProps {
  label: string;
  /** Empty string, null and undefined all resolve to the placeholder. */
  value?: ReactNode;
  className?: string;
}

export function MetaItem({ label, value, className }: MetaItemProps) {
  const absent = value === null || value === undefined || value === "";

  return (
    <div className={cn("flex min-w-0 flex-col gap-s1", className)}>
      <span className="t-micro">{label}</span>
      <span
        className={cn("t-body break-words", absent ? "text-ink-soft" : "text-ink")}
      >
        {absent ? ABSENT : value}
      </span>
    </div>
  );
}

interface MetaGridProps {
  children: ReactNode;
  className?: string;
}

export function MetaGrid({ children, className }: MetaGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-s3 sm:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Enum display strings
 *
 * Kept beside MetaItem because this is where they are read. `Record<Enum, string>` makes
 * the compiler reject drift from `src/lib/db/schema.ts`, and declaring them here rather
 * than importing the schema keeps drizzle out of any client bundle that renders a value.
 * ------------------------------------------------------------------------- */

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "full time",
  part_time: "part time",
  contract: "contract",
  internship: "internship",
  freelance: "freelance",
  temporary: "temporary",
};

export const WORK_SETUP_LABELS: Record<WorkSetup, string> = {
  onsite: "onsite",
  hybrid: "hybrid",
  remote: "remote",
};
