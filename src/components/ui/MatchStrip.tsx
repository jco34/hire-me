import { cn } from "@/lib/cn";
import { matchBand } from "@/lib/domain/match";

/**
 * The match score. DESIGN.md sections 3 and 10.
 *
 * There is no chromatic status colour in this system, so there is no red-to-green gauge
 * here either. The score is drawn in the same geometric language as `StageStrip`: twenty
 * cells on the square grid, five points each, `--ink` for reached and `--muted` for not.
 *
 * The strip is `aria-hidden` and the reading-face figure beside it is not optional.
 * Meaning is never carried by fill weight alone, and the band label ("solid fit", "a
 * stretch") is what makes the number mean something without a legend.
 */

/* Geometry, in grid units. Same square and pitch as the stage strip so the two read as
   one family when they sit in the same row. */
const CELLS = 20;
const POINTS_PER_CELL = 100 / CELLS;
const SQUARE = 2;
const PITCH = 4;
const ROWS = 4;
const SQUARE_Y = (ROWS - SQUARE) / 2;

const UNIT_PX: Record<"sm" | "md", number> = { sm: 3, md: 5 };

const VIEW_X = -1;
const VIEW_W = (CELLS - 1) * PITCH + SQUARE + 2;

/** `.t-micro` hard-codes --ink-soft, so the ink variant is spelled out rather than layered. */
const MICRO_INK = "text-[0.75rem] leading-[1.4] tracking-[0.18em] uppercase text-ink";

export function MatchStrip({
  score,
  size = "sm",
  className,
}: {
  score: number;
  /** `sm` for table rows, `md` for the detail panel. */
  size?: "sm" | "md";
  className?: string;
}) {
  const unit = UNIT_PX[size];
  // Round rather than floor: at 5 points a cell, flooring makes 69 and 65 look identical.
  const filled = Math.round(score / POINTS_PER_CELL);

  return (
    <span
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
        {Array.from({ length: CELLS }, (_, i) => {
          const reached = i < filled;
          return (
            <rect
              key={i}
              x={i * PITCH}
              y={SQUARE_Y}
              width={SQUARE}
              height={SQUARE}
              fill={reached ? "var(--ink)" : "var(--muted)"}
              fillOpacity={reached ? 1 : 0.3}
              data-tile-cell=""
              style={{ ["--i" as string]: i }}
            />
          );
        })}
      </svg>

      <span className="inline-flex items-baseline gap-s2">
        <span className={MICRO_INK}>{score}% match</span>
        <span className="t-micro">{matchBand(score)}</span>
      </span>
    </span>
  );
}

/**
 * What a row with no score says. Kept as its own component so "never scored" is never
 * rendered as a zero or an empty cell — an unscored application is an unknown, not a bad
 * match, and the two must not look the same.
 */
export function NoMatch({ className }: { className?: string }) {
  return <span className={cn("t-micro", className)}>not scored</span>;
}
