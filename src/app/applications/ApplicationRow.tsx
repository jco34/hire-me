"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

import { EMPLOYMENT_TYPE_LABELS, WORK_SETUP_LABELS } from "@/components/ui/Meta";
import { StageStrip } from "@/components/ui/StageStrip";
import { cn } from "@/lib/cn";
import { formatSalary } from "@/lib/domain/salary";
import type { ApplicationListRow } from "@/lib/queries/applications";

/**
 * The whole row is the click target; the company name stays an anchor underneath so
 * keyboard and screen-reader navigation is unaffected. A click that lands on a real
 * link/button, or that ends a text selection, is left alone rather than double-navigated.
 */
export function ApplicationRow({ row }: { row: ApplicationListRow }) {
  const router = useRouter();
  const { application, company, staleness } = row;
  const href = `/applications/${application.id}`;

  const navigate = (event: MouseEvent<HTMLTableRowElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest("a, button")) return;
    if (window.getSelection()?.toString()) return;
    router.push(href);
  };

  return (
    <tr
      onClick={navigate}
      className={cn(
        "group cursor-pointer border-b border-[color-mix(in_srgb,var(--muted)_40%,transparent)]",
        "transition-colors duration-150 ease-[ease] hover:bg-surface",
        // Urgency is contrast, not hue: a quiet row gets a hard left rule.
        staleness.stale && "border-l-2 border-l-ink",
      )}
    >
      <td className="px-s1 py-s2 align-top">
        <Link
          href={href}
          className="t-body text-ink underline-offset-4 hover:underline"
        >
          {company.name}
        </Link>
      </td>
      <td className="t-body px-s1 py-s2 align-top text-ink">{application.title}</td>
      <td className="px-s1 py-s2 align-top">
        <StageStrip stage={application.stage} outcome={application.outcome} size="sm" />
      </td>
      <td className="t-body px-s1 py-s2 align-top whitespace-nowrap text-ink">
        {formatSalary(application)}
      </td>
      <td className="t-body hidden px-s1 py-s2 align-top whitespace-nowrap text-ink-soft lg:table-cell">
        {[
          application.workSetup ? WORK_SETUP_LABELS[application.workSetup] : null,
          application.employmentType
            ? EMPLOYMENT_TYPE_LABELS[application.employmentType]
            : null,
        ]
          .filter(Boolean)
          .join(" / ") || "not stated"}
      </td>
      <td className="t-body hidden px-s1 py-s2 align-top text-ink-soft xl:table-cell">
        {application.location ?? "not stated"}
      </td>
      <td className="px-s1 py-s2 text-right align-top">
        <span
          className={cn(
            "t-body whitespace-nowrap",
            staleness.stale ? "text-ink" : "text-ink-soft",
          )}
        >
          {staleness.days}d
        </span>
        {staleness.followUpDue ? (
          <span className="t-micro block text-ink">follow up due</span>
        ) : null}
      </td>
    </tr>
  );
}
