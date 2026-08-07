import type { ReactNode } from "react";

import { TileText } from "@/components/type/TileText";
import { cn } from "@/lib/cn";

/**
 * Sticky page header for the app routes.
 *
 * DESIGN.md section 5: header is sticky, and clustering is asymmetric. The kicker and
 * title are one tight cluster on the left at --s-1, the actions sit tight to the right
 * rail, and the whole gap between them is --s-5. Nothing lands in the middle.
 *
 * Flat on purpose. The lifted object in this region is whichever Capsule the caller puts
 * in the action slot.
 */

const HAIRLINE = "border-[color-mix(in_srgb,var(--muted)_60%,transparent)]";

interface PageHeaderProps {
  /** Display register. Lowercase; the tile renderer draws lowercase glyphs only. */
  title: string;
  /**
   * Sub-display register, drawn in stipple. Per DESIGN.md section 10 this face is only
   * legible enough for text whose meaning is available elsewhere in the reading face,
   * so keep it to route context rather than anything decision-bearing.
   */
  kicker?: string;
  /** Action slot. At most one Capsule; anything further is a FlatButton. */
  children?: ReactNode;
  /** Cell edge in px for the title. Modest by default: this is not the hero. */
  cell?: number;
  /** Override `top-0` when the header sits under a taller app chrome. */
  className?: string;
}

export function PageHeader({
  title,
  kicker,
  children,
  cell = 5,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-10 bg-bg",
        "flex items-end justify-between gap-s5",
        "px-s3 py-s3 border-b",
        HAIRLINE,
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-s1">
        {kicker && <TileText text={kicker} mode="stipple" cell={3} />}
        <h1>
          <TileText text={title} mode="solid" cell={cell} />
        </h1>
      </div>

      {children && (
        <div className="flex shrink-0 items-center gap-s2">{children}</div>
      )}
    </header>
  );
}
