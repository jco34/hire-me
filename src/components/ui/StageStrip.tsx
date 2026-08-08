import type { Outcome, Stage } from "@/lib/db/schema";
import { cn } from "@/lib/cn";

/**
 * The stage strip. DESIGN.md section 3.
 *
 * Stage and outcome are encoded by position on the grid and by fill weight, in the same
 * geometric language as the tile font. There is no status colour in this system and
 * adding one is a breaking change, not a tweak.
 *
 *   reached     --ink, solid
 *   unreached   --muted at low opacity
 *   current     doubled in weight, drawn as a second outline around the cell
 *   rejected / ghosted / withdrawn / declined
 *               whole strip in --muted, diagonal strike through the final reached cell
 *   offer / accepted
 *               whole strip in --ink, final cell doubled
 *
 * The strip is aria-hidden and the reading-face label beside it is not optional.
 * DESIGN.md section 10: stage and outcome are never communicated by fill weight alone.
 */

/**
 * Insertion order is the stage progression and it is load-bearing: index position drives
 * the strip. Mirrors `stageEnum` in `src/lib/db/schema.ts`; `Record<Stage, string>` makes
 * the compiler reject any drift. Declared here rather than imported so a client component
 * rendering a strip never pulls drizzle into the browser bundle.
 */
export const STAGE_LABELS: Record<Stage, string> = {
  saved: "saved",
  applied: "applied",
  screening: "screening",
  first_interview: "first interview",
  technical: "technical",
  behavioral: "behavioral",
  final: "final",
  offer: "offer",
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  active: "active",
  rejected: "rejected",
  ghosted: "ghosted",
  withdrawn: "withdrawn",
  accepted: "accepted",
  declined: "declined",
};

const STAGE_SEQUENCE = Object.keys(STAGE_LABELS) as Stage[];

/** Outcomes that closed without a job. Strip goes quiet and the last cell is struck. */
const CLOSED_OUTCOMES = new Set<Outcome>([
  "rejected",
  "ghosted",
  "withdrawn",
  "declined",
]);

/* `offer` and `accepted` need no special case: they are the non-closed path, so the strip
   is already --ink and the doubled cell is already the final reached one. */

/* Geometry, in grid units. Scaled to px by `size`. */
const SQUARE = 2;
/** Square plus gap. Two units of gap leaves room for the doubling outline. */
const PITCH = 4;
/** Four rows tall so the doubling outline fits above and below the square. */
const ROWS = 4;
const SQUARE_Y = (ROWS - SQUARE) / 2;
const RING_STROKE = 0.5;

const UNIT_PX: Record<"sm" | "md", number> = { sm: 3, md: 5 };

const VIEW_X = -1;
const VIEW_W = (STAGE_SEQUENCE.length - 1) * PITCH + SQUARE + 2;

/** `.t-micro` hard-codes --muted, so the ink variant is spelled out rather than layered. */
const MICRO_INK = "text-[0.75rem] leading-[1.4] tracking-[0.18em] uppercase text-ink";

interface StageStripProps {
  stage: Stage;
  outcome: Outcome;
  /** `sm` for table rows, `md` for the detail panel. */
  size?: "sm" | "md";
  className?: string;
}

export function StageStrip({
  stage,
  outcome,
  size = "sm",
  className,
}: StageStripProps) {
  const reachedIndex = Math.max(STAGE_SEQUENCE.indexOf(stage), 0);
  const closed = CLOSED_OUTCOMES.has(outcome);

  const unit = UNIT_PX[size];
  const reachedFill = closed ? "var(--muted)" : "var(--ink)";

  return (
    <div
      className={cn(
        "inline-flex gap-s2",
        size === "sm" ? "items-center" : "flex-col items-start gap-s1",
        className,
      )}
    >
      <svg
        viewBox={`${VIEW_X} 0 ${VIEW_W} ${ROWS}`}
        width={VIEW_W * unit}
        height={ROWS * unit}
        shapeRendering="crispEdges"
        aria-hidden="true"
        focusable="false"
        className="block shrink-0 overflow-visible"
      >
        {STAGE_SEQUENCE.map((key, i) => {
          const x = i * PITCH;
          const reached = i <= reachedIndex;
          return (
            <rect
              key={key}
              x={x}
              y={SQUARE_Y}
              width={SQUARE}
              height={SQUARE}
              fill={reached ? reachedFill : "var(--muted)"}
              fillOpacity={reached ? 1 : 0.3}
              data-tile-cell=""
              style={{ ["--i" as string]: i }}
            />
          );
        })}

        {/* Doubled weight on the cell that carries the meaning. Struck cells are already
            carrying a mark, so they are not doubled as well. */}
        {!closed && (
          <rect
            x={reachedIndex * PITCH - 1 + RING_STROKE / 2}
            y={RING_STROKE / 2}
            width={SQUARE + 2 - RING_STROKE}
            height={ROWS - RING_STROKE}
            fill="none"
            stroke={reachedFill}
            strokeWidth={RING_STROKE}
          />
        )}

        {closed && (
          <line
            x1={reachedIndex * PITCH - 0.5}
            y1={ROWS - 0.5}
            x2={reachedIndex * PITCH + SQUARE + 0.5}
            y2={0.5}
            stroke="var(--muted)"
            strokeWidth={RING_STROKE}
            strokeLinecap="square"
            shapeRendering="geometricPrecision"
          />
        )}
      </svg>

      {/* Never replaced by the strip. Meaning is never carried by fill weight alone. */}
      <span className="inline-flex items-baseline gap-s2">
        <span className="t-body text-ink">{STAGE_LABELS[stage]}</span>
        <span className={outcome === "active" ? "t-micro" : MICRO_INK}>
          {OUTCOME_LABELS[outcome]}
        </span>
      </span>
    </div>
  );
}
