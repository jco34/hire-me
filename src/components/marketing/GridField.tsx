import { Parallax } from "@/components/motion/Parallax";
import { cn } from "@/lib/cn";

/**
 * Ambient background field of small squares on the cell grid.
 *
 * DESIGN.md section 9: parallax is the default on the marketing page and the page
 * should read as many independently-rated elements. This is the cheap half of that.
 * It is one SVG with a repeating <pattern>, so a whole section of field costs two
 * rects and one paint rather than hundreds of DOM nodes with their own listeners.
 *
 * Cost under prefers-reduced-motion is zero: `.hm-drift` is switched off in CSS and
 * `Parallax` never starts its rAF loop, so the field settles into a static texture.
 */

interface GridFieldProps {
  /** Unique across the page. Used for the SVG pattern id. */
  id: string;
  /** Parallax rate. Keep it different from the content in front of it. */
  rate?: number;
  /** Pattern pitch in px. Multiples of the 8px cell. */
  pitch?: number;
  /** Edge length of the primary square in px. */
  dot?: number;
  /** Opacity of the whole field. It is ambient, so it stays low. */
  opacity?: number;
  /** Ambient drift loop. Off puts the field at rest without touching parallax. */
  drift?: boolean;
  /** Negative delays desynchronise stacked fields so they never move as one sheet. */
  driftDelay?: string;
  className?: string;
}

export function GridField({
  id,
  rate = 0.2,
  pitch = 40,
  dot = 2,
  opacity = 0.4,
  drift = true,
  driftDelay = "0s",
  className,
}: GridFieldProps) {
  const half = pitch / 2;
  const minor = Math.max(1, Math.round(dot * 0.6));

  return (
    <div
      aria-hidden="true"
      className={cn(
        // Clipped to its own section. A field that bleeds past its section would
        // reach into the hero, and the hero has to stay empty.
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        className,
      )}
    >
      {/* Oversized inside the clip so parallax and drift never expose an edge. */}
      <Parallax rate={rate} className="absolute inset-x-0 -inset-y-[25%]">
        <svg
          className={cn("h-full w-full", drift && "hm-drift")}
          style={{ animationDelay: driftDelay }}
          shapeRendering="crispEdges"
          focusable="false"
        >
          <defs>
            <pattern
              id={id}
              width={pitch}
              height={pitch}
              patternUnits="userSpaceOnUse"
            >
              <rect x={0} y={0} width={dot} height={dot} fill="var(--muted)" />
              <rect
                x={half}
                y={half}
                width={minor}
                height={minor}
                fill="var(--muted)"
                opacity={0.55}
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${id})`} opacity={opacity} />
        </svg>
      </Parallax>
    </div>
  );
}
