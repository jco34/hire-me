import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Flat panel. DESIGN.md section 3: --surface is punctuation, not wallpaper, so a card
 * should feel occasional. If a screen is mostly --surface, the screen is wrong.
 *
 * Deliberately unshadowed. The lifted, shadowed object in a region is the capsule, and
 * a card that lifts would be a second one competing with it.
 */

const HAIRLINE = "border-[color-mix(in_srgb,var(--muted)_60%,transparent)]";

export function Card({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("bg-surface text-ink border", HAIRLINE, "rounded-md", className)}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps extends ComponentProps<"div"> {
  /** Right-hand cluster. Asymmetric by design: title left, actions tight to the rail. */
  actions?: ReactNode;
}

export function CardHeader({
  className,
  children,
  actions,
  ...props
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-s3",
        "px-s3 py-s2 border-b",
        HAIRLINE,
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-s1">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-s2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("p-s3", className)} {...props}>
      {children}
    </div>
  );
}

interface HairlineProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

/** 1px --muted at partial opacity. The only rule the system draws. */
export function Hairline({ orientation = "horizontal", className }: HairlineProps) {
  if (orientation === "vertical") {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn("w-px shrink-0 self-stretch bg-muted/60", className)}
      />
    );
  }

  return <hr className={cn("h-px w-full border-0 bg-muted/60", className)} />;
}
