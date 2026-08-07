import type { ReactNode } from "react";

import { TileText } from "@/components/type/TileText";
import { cn } from "@/lib/cn";

/**
 * Empty states are one of the few places the display face appears inside the app
 * (DESIGN.md section 5), so they are composed rather than centred.
 *
 * The composition follows the hero rule from section 5: a tile line set left, one large
 * gap, then the sentence and its action packed tight against each other as a single
 * right-hand cluster. Rest is pushed into one big gap instead of spread evenly.
 */

interface EmptyStateProps {
  /** Short and lowercase. The tile renderer draws lowercase glyphs only. */
  headline: string;
  /** Reading face. This is the sentence that tells the user what to do. */
  body: ReactNode;
  /** Typically a single Capsule. It is the one lifted object in this region. */
  action?: ReactNode;
  /** Cell edge in px. The display register, held to a section-header size. */
  cell?: number;
  className?: string;
}

export function EmptyState({
  headline,
  body,
  action,
  cell = 6,
  className,
}: EmptyStateProps) {
  return (
    <section className={cn("flex w-full flex-col gap-s5 py-s5", className)}>
      <TileText text={headline} mode="solid" cell={cell} />

      <div className="flex max-w-[46ch] flex-col items-end gap-s2 self-end text-right">
        <p className="t-body-lg text-ink">{body}</p>
        {action}
      </div>
    </section>
  );
}
