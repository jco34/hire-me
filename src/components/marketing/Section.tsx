import type { CSSProperties, ReactNode } from "react";

import { GridField } from "@/components/marketing/GridField";
import { Parallax } from "@/components/motion/Parallax";
import { Reveal } from "@/components/motion/Reveal";
import { TileText, type TileMode } from "@/components/type/TileText";
import { cn } from "@/lib/cn";
import { layoutTileText } from "@/lib/tile-font";

/**
 * Marketing page furniture.
 *
 * The rail is the only horizontal constraint on the page. There is no centred
 * max-width container anywhere: content runs edge to edge and the rail is padding,
 * not a box (DESIGN.md section 5).
 */
export const rail = "px-s2 sm:px-s3 md:px-s5";

/**
 * Header height at rest, in px. Ten cells, and `--s-5` exactly.
 *
 * The hero is pulled up under the header by this much so the transparent header
 * band reads as part of the margin above the wordmark. It lives here rather than
 * in SiteHeader because that module is `"use client"`: a plain value imported from
 * a client module into a server component arrives as a client reference, not a
 * number, and quietly interpolates to nothing.
 */
export const HEADER_HEIGHT = 80;

/**
 * Display type sized by the cell rather than by the container.
 *
 * `TileText` renders fluid, filling whatever width it is given, so two lines of
 * different character counts inside the same flex column would come out at two
 * different glyph sizes. Measuring the layout and setting the container to
 * `cols * cell` keeps every line on one shared cell size, which is the whole point
 * of the grid. `max-w-full` lets a long line shrink rather than break the rail.
 */
export function TileDisplay({
  lines,
  mode = "solid",
  dot,
  align = "start",
  cell = "var(--tile-cell)",
  lineGap = "0.22em",
  label,
  className,
}: {
  lines: string[];
  mode?: TileMode;
  dot?: number;
  align?: "start" | "end";
  /** Any CSS length. The cell edge, not the type size. */
  cell?: string;
  lineGap?: string;
  /** Accessible equivalent. Defaults to the lines joined with a space. */
  label?: string;
  className?: string;
}) {
  const measured = lines.map((line) => ({ line, cols: layoutTileText(line).cols }));

  return (
    <span
      className={cn("flex flex-col", align === "end" && "items-end", className)}
      style={{ gap: lineGap }}
    >
      {measured.map(({ line, cols }, i) => (
        <span
          key={`${i}-${line}`}
          className="block max-w-full"
          style={{ width: `calc(${cols} * ${cell})` }}
        >
          <TileText text={line} mode={mode} dot={dot} presentational />
        </span>
      ))}
      <span className="sr-only">{label ?? lines.join(" ")}</span>
    </span>
  );
}

/**
 * Micro reading-face label.
 *
 * `.t-micro` is declared in `@layer components`, so plain utilities outrank it and
 * the tone is just a class. Ink micro text is reserved for the one non-grey signal
 * the system allows: a record that has gone quiet (DESIGN.md section 3).
 */
export function Micro({
  children,
  tone = "soft",
  className,
}: {
  children: ReactNode;
  tone?: "soft" | "ink";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "t-micro block",
        tone === "ink" ? "text-ink" : "text-ink-soft",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Reading face. Mixed case, measured, never the tile face. */
export function Prose({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("t-body-lg max-w-[56ch] text-ink", className)}>{children}</p>
  );
}

/**
 * Secondary reading-face copy, one step back from the prose.
 *
 * `--ink-soft`, never `--muted`. Muted measures 1.89:1 against the background and
 * fails WCAG at every size (DESIGN.md section 3).
 */
export function Aside({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("t-body max-w-[52ch] text-ink-soft", className)}>{children}</p>
  );
}

interface SectionProps {
  id: string;
  /** Two digits. Part of the kicker, in the reading face. */
  index: string;
  kicker: string;
  /** Display title, lowercase, one entry per line. */
  titleLines: string[];
  /** Honest status note, e.g. "phase 2 / not built yet". */
  note?: string;
  align?: "start" | "end";
  /** Ambient field behind the section. Off for the closing section. */
  field?: boolean;
  /** Base parallax rate for the field. The second layer counter-rates against it. */
  fieldRate?: number;
  /**
   * Parallax rate for the kicker. The title and the note step off it by
   * HEADER_RATE_STEP each, which is the start of the section's rate ramp.
   */
  rate?: number;
  children: ReactNode;
  className?: string;
}

/**
 * How far apart two vertically adjacent elements may be rated.
 *
 * Relative displacement between two elements is `rateDelta * distanceFromCentre`,
 * so at the edge of a 900px viewport a delta of 0.015 is about 7px. Anything much
 * larger between neighbours reads as a broken layout rather than as depth, which is
 * why every section ramps its rates gradually instead of alternating them.
 */
export const HEADER_RATE_STEP = 0.015;

/**
 * Section bodies ramp monotonically in document order.
 *
 * Relative displacement between two elements is `rateDelta * distanceFromCentre`.
 * At the edge of a 900px viewport that is roughly `rateDelta * 450`, so neighbours
 * rated 0.35 apart tear ~150px apart: squares scatter off their labels and stacked
 * rows overlap. Alternating signs down a section is precisely the wrong shape.
 *
 * A single descending ramp keeps every adjacent pair within one step (~9px of drift
 * against an --s-5 gap) while elements far apart in the document, which never share a
 * screen, still differ enough to read as different depths.
 *
 * The ramp steps per *cluster*, not per element. A repeated series (a row of stage
 * squares, a stack of log rows, a three-column grid of cards) is one visual object and
 * all of its items share a rate. Rating them individually shears a row of identical
 * squares off its own baseline, which reads as a broken grid rather than as depth,
 * and that is a worse failure here than having no parallax at all.
 */
export const BODY_RATE_BASE = 0.195;
export const BODY_RATE_STEP = 0.02;

/** Rate for the nth cluster of a section body, counting in document order from 0. */
export const bodyRate = (cluster: number) =>
  BODY_RATE_BASE - cluster * BODY_RATE_STEP;

/**
 * A full-bleed section.
 *
 * The header claims depths 0, 2 and 4 and its own parallax rates. Section bodies
 * take the odd depths and higher so nothing in a section arrives on the same beat
 * as anything else (DESIGN.md section 9).
 *
 * Vertical rhythm is `--s-5` both for the padding and for the gap between clusters,
 * which is the token for the distance between sections. `--s-8` is hero breathing
 * room and is not spent anywhere else.
 */
export function Section({
  id,
  index,
  kicker,
  titleLines,
  note,
  align = "start",
  field = true,
  fieldRate = 0.22,
  rate = 0.24,
  children,
  className,
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn("relative isolate flex flex-col gap-s5 py-s5", rail, className)}
      style={
        {
          ["--tile-cell" as string]: "clamp(4.4px, 0.95vw, 12px)",
        } as CSSProperties
      }
    >
      {field && (
        <>
          <GridField
            id={`${id}-field-near`}
            rate={fieldRate}
            pitch={40}
            dot={2}
            opacity={0.42}
          />
          <GridField
            id={`${id}-field-far`}
            rate={fieldRate * -0.55}
            pitch={96}
            dot={4}
            opacity={0.2}
            driftDelay="-2.4s"
          />
        </>
      )}

      <header
        className={cn(
          "flex flex-col gap-s2",
          align === "end" && "items-end text-right",
        )}
      >
        {/* Rates ramp by HEADER_RATE_STEP rather than alternating. Neighbours that
            differ sharply pull apart at the viewport edges and read as a broken
            layout; a gradual ramp reads as depth, which is the intent. */}
        <Reveal depth={0}>
          <Parallax rate={rate}>
            <Micro>
              {index} / {kicker}
            </Micro>
          </Parallax>
        </Reveal>

        <Reveal depth={2}>
          <Parallax rate={rate - HEADER_RATE_STEP}>
            <h2>
              <TileDisplay lines={titleLines} align={align} />
            </h2>
          </Parallax>
        </Reveal>

        {note && (
          <Reveal depth={4}>
            <Parallax rate={rate - HEADER_RATE_STEP * 2}>
              <Micro tone="ink">{note}</Micro>
            </Parallax>
          </Reveal>
        )}
      </header>

      {children}
    </section>
  );
}
