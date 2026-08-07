import { cn } from "@/lib/cn";
import {
  GLYPH_H,
  layoutTileText,
  type TileLayout,
} from "@/lib/tile-font";

/**
 * Renders display type from the generative cell grid. See DESIGN.md section 4.
 *
 * Server component on purpose: this is geometry, not interaction, and it should not
 * cost the client bundle anything. Individual cells carry `--i` so callers can stagger
 * them without the renderer knowing anything about motion.
 */

export type TileMode = "solid" | "stipple";

interface TileTextProps {
  text: string;
  /**
   * solid   - each lit cell is a full square in --ink, with faint seams where cells abut
   * stipple - each lit cell is a small square in --muted, giving the dot-matrix stroke
   */
  mode?: TileMode;
  /**
   * Cell edge length in px. Omit to render fluid, filling the container width and
   * deriving its own height from the grid aspect ratio.
   */
  cell?: number;
  /** Empty columns between glyphs. Tight fitting is the default. */
  tracking?: number;
  /** Override the fill. Defaults to --ink for solid, --muted for stipple. */
  fill?: string;
  /**
   * Fraction of the cell each stipple dot occupies. Lower reads finer and lighter
   * against the grey, which is the trade the brief accepts for sub-display text.
   */
  dot?: number;
  className?: string;
  /** Set when the same string is already announced by a nearby element. */
  presentational?: boolean;
}

const SEAM_WIDTH = 0.035;

export function TileText({
  text,
  mode = "solid",
  cell,
  tracking,
  fill,
  dot = 0.5,
  className,
  presentational = false,
}: TileTextProps) {
  const layout = layoutTileText(text, { tracking });
  if (layout.cols === 0) return null;

  const resolvedFill = fill ?? (mode === "solid" ? "var(--ink)" : "var(--muted)");
  const fluid = cell === undefined;

  const svg = (
    <svg
      viewBox={`0 0 ${layout.cols} ${layout.rows}`}
      width={fluid ? "100%" : layout.cols * cell}
      height={fluid ? undefined : layout.rows * cell}
      preserveAspectRatio="xMinYMid meet"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      className={cn("block overflow-visible", fluid && "h-auto w-full")}
      style={fluid ? { aspectRatio: `${layout.cols} / ${GLYPH_H}` } : undefined}
    >
      {mode === "solid"
        ? renderSolid(layout, resolvedFill)
        : renderStipple(layout, resolvedFill, dot)}
    </svg>
  );

  return (
    <span className={cn("block", className)} data-tile={mode}>
      {svg}
      {!presentational && <span className="sr-only">{text}</span>}
    </span>
  );
}

function renderSolid(layout: TileLayout, fill: string) {
  // A stroke on every cell produces the seam line wherever two cells abut, and reads
  // as a faint outline where a cell stands alone. That is the intended artifact.
  return layout.cells.map((c) => (
    <rect
      key={c.index}
      x={c.col}
      y={c.row}
      width={1}
      height={1}
      fill={fill}
      stroke="var(--muted)"
      strokeWidth={SEAM_WIDTH}
      strokeOpacity={0.45}
      data-tile-cell=""
      style={{ ["--i" as string]: c.index }}
    />
  ));
}

function renderStipple(layout: TileLayout, fill: string, dot: number) {
  const inset = (1 - dot) / 2;
  return layout.cells.map((c) => (
    <rect
      key={c.index}
      x={c.col + inset}
      y={c.row + inset}
      width={dot}
      height={dot}
      fill={fill}
      data-tile-cell=""
      style={{ ["--i" as string]: c.index }}
    />
  ));
}

/**
 * Multi-line display type. Each line is its own grid so lines stay independently
 * sized and can be revealed at different depths.
 */
export function TileLines({
  lines,
  className,
  lineGap = "0.35em",
  align = "start",
  ...props
}: Omit<TileTextProps, "text"> & {
  lines: string[];
  lineGap?: string;
  align?: "start" | "end";
}) {
  return (
    <span
      className={cn("flex flex-col", align === "end" && "items-end", className)}
      style={{ gap: lineGap }}
    >
      {lines.map((line, i) => (
        <TileText key={i} text={line} {...props} />
      ))}
    </span>
  );
}
