import type { CSSProperties } from "react";

import { ScrollCue } from "@/components/marketing/ScrollCue";
import { HEADER_HEIGHT, rail, TileDisplay } from "@/components/marketing/Section";
import { TileText } from "@/components/type/TileText";
import { CapsuleLink } from "@/components/ui/Capsule";
import { cn } from "@/lib/cn";

/**
 * The still frame (DESIGN.md section 5).
 *
 * Full bleed on the implied square grid, no centred container. The wordmark sits
 * high with 200px of nothing under it, and everything else is packed into one tight
 * right-hand cluster. The emptiness is the design, so nothing goes in it.
 *
 * Deliberately motionless: no parallax, no ambient field, no reveals. The rest of
 * the page moves at a dozen different rates and this is what it is measured
 * against. The pulsing scroll cue is the single exception, and it is the invitation
 * to leave.
 *
 * The hero is pulled up under the sticky header, which is transparent at rest, so
 * the header band reads as part of the margin above the wordmark rather than as a
 * bar sitting on top of it.
 */

const SUBHEAD = ["every application you sent", "and what happened next"];

export function Hero() {
  return (
    <section
      className={cn("relative flex flex-col pt-s8", rail)}
      style={
        {
          // Pulled up under the sticky header, which is transparent at rest, so the
          // 200px above the wordmark is measured from the top of the viewport.
          marginTop: -HEADER_HEIGHT,
          minHeight: "100svh",
          // The subhead cell, so both lines share one glyph size at any width.
          ["--sub-cell" as string]: "clamp(2.05px, 0.4vw, 3.9px)",
        } as CSSProperties
      }
    >
      <h1 className="w-full">
        <TileText text="hire me" mode="solid" />
      </h1>

      {/* 200px of nothing. This is the design. */}
      <div className="mt-s8 flex justify-end">
        <div className="flex max-w-full flex-col items-end gap-s1">
          <TileDisplay
            lines={SUBHEAD}
            mode="stipple"
            dot={0.5}
            align="end"
            cell="var(--sub-cell)"
            lineGap="0.5em"
          />
          <div className="mt-s2">
            <CapsuleLink href="/applications">open the tracker</CapsuleLink>
          </div>
        </div>
      </div>

      <div className="mt-auto flex justify-center pb-s3">
        <ScrollCue />
      </div>
    </section>
  );
}
