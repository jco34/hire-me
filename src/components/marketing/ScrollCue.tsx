import { TileText } from "@/components/type/TileText";
import { cn } from "@/lib/cn";

/**
 * Scroll cue at the base of the hero.
 *
 * Built from squares on the same cell grid as the glyphs, not from an icon set
 * (DESIGN.md section 8). Three rows form a chevron; each row runs the 0.9s pulse
 * with a small negative delay so the taper reads as a wave rather than a blink.
 *
 * The static taper lives on the squares rather than on the animated row, so it
 * survives the keyframe's own opacity and is still there when `.hm-pulse` is
 * switched off wholesale under prefers-reduced-motion.
 */

const CHEVRON: { lit: number[]; opacity: number }[] = [
  { lit: [0, 4], opacity: 0.4 },
  { lit: [1, 3], opacity: 0.7 },
  { lit: [2], opacity: 1 },
];

export function ScrollCue() {
  return (
    <div className="flex flex-col items-center gap-s2">
      <TileText text="scroll" mode="stipple" cell={3} dot={0.5} />

      <div aria-hidden="true" className="flex flex-col">
        {CHEVRON.map(({ lit, opacity }, row) => (
          <span
            key={row}
            className="hm-pulse flex"
            style={{ animationDelay: `${row * -0.12}s` }}
          >
            {[0, 1, 2, 3, 4].map((col) => (
              <span
                key={col}
                className={cn("block size-cell", lit.includes(col) && "bg-ink")}
                style={lit.includes(col) ? { opacity } : undefined}
              />
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
