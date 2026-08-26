import { MatchStrip } from "@/components/ui/MatchStrip";
import { cn } from "@/lib/cn";
import { MUST_HAVE_GATE, type MatchBreakdown } from "@/lib/domain/match";

/**
 * The score and the evidence behind it.
 *
 * The evidence is not decoration. A bare percentage is a mood; the thing that changes what
 * you actually do is the list of must-haves your resume does not answer, so `missing` is
 * never hidden behind a disclosure and never rendered as a count.
 *
 * DESIGN.md: hairline border, matte fill, reading face throughout, and no lifted capsule —
 * this block sits in a region that already has one.
 */

const hairline = "border-[color-mix(in_srgb,var(--muted)_60%,transparent)]";

export function MatchPanel({
  breakdown,
  className,
}: {
  breakdown: MatchBreakdown;
  className?: string;
}) {
  return (
    <section
      aria-label={`Match score: ${breakdown.score} percent`}
      className={cn("flex flex-col gap-s2 rounded-[var(--r-md)] border p-s3", hairline, className)}
    >
      <MatchStrip score={breakdown.score} size="md" />

      {breakdown.summary ? <p className="t-body">{breakdown.summary}</p> : null}

      {breakdown.gated ? (
        <p className="t-body border-l-2 border-ink pl-s2 text-ink">
          Held at {MUST_HAVE_GATE} because the posting requires something your resume does
          not show.
        </p>
      ) : null}

      <dl className="flex flex-col gap-s1">
        {breakdown.dimensions.map((dimension) => (
          <div key={dimension.key} className="flex flex-wrap items-baseline gap-s2">
            <dt className="t-micro min-w-[11ch]">{dimension.label}</dt>
            <dd className="t-body text-ink">{Math.round(dimension.value * 100)}%</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-s2 sm:grid-cols-2">
        <EvidenceList label="missing" items={breakdown.missing} hollow />
        <EvidenceList label="partly covered" items={breakdown.partial} hollow />
        <EvidenceList label="covered" items={breakdown.covered} className="sm:col-span-2" />
      </div>

      {breakdown.minYears !== null ? (
        <p className="t-micro">the posting asks for {breakdown.minYears} years</p>
      ) : null}
    </section>
  );
}

function EvidenceList({
  label,
  items,
  hollow,
  className,
}: {
  label: string;
  items: string[];
  /** Hollow markers for what is absent, solid for what is present. No colour either way. */
  hollow?: boolean;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className={className}>
      <p className="t-micro">{label}</p>
      <ul className="mt-s1 flex flex-col gap-s1">
        {items.map((item) => (
          <li key={item} className="t-body flex items-baseline gap-s2">
            <span
              aria-hidden="true"
              className={cn(
                "mt-[0.55em] inline-block h-[6px] w-[6px] shrink-0",
                hollow ? "border border-muted" : "bg-ink",
              )}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
