import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The one warm object on screen.
 *
 * DESIGN.md section 7: a slightly lighter capsule with a hairline border and a hard
 * offset drop shadow, and it is the only thing in the system that looks pressable.
 * Exactly one per screen region. If you need a second action, use FlatButton.
 *
 * The shadow is a hard offset, never a blur. Press collapses it toward the surface
 * and nudges the capsule into the gap so the whole thing reads as physical.
 */

const base = cn(
  "inline-flex items-center justify-center gap-s1",
  "rounded-pill border border-[color-mix(in_srgb,var(--muted)_70%,transparent)]",
  "bg-surface text-ink",
  "px-s3 py-s2 min-h-11",
  "text-[0.8125rem] tracking-[0.14em] uppercase leading-none",
  "shadow-[4px_4px_0_var(--ink)]",
  "transition-[background-color,color,box-shadow,transform] duration-150 ease-[ease]",
  "hover:bg-[color-mix(in_srgb,var(--surface)_60%,white)]",
  "active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_var(--ink)]",
  "disabled:opacity-50 disabled:pointer-events-none",
  "cursor-pointer select-none",
);

export function Capsule({
  className,
  children,
  ...props
}: ComponentProps<"button">) {
  return (
    <button className={cn(base, className)} {...props}>
      {children}
    </button>
  );
}

export function CapsuleLink({
  className,
  children,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link className={cn(base, className)} {...props}>
      {children}
    </Link>
  );
}

/** Flat secondary action. No lift, no shadow. Never competes with the capsule. */
export function FlatButton({
  className,
  children,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-s1 min-h-11 px-s2",
        "text-[0.75rem] tracking-[0.14em] uppercase leading-none",
        "text-ink-soft hover:text-ink",
        "border-b border-transparent hover:border-ink",
        "transition-colors duration-150 ease-[ease]",
        "cursor-pointer select-none",
        "disabled:opacity-50 disabled:pointer-events-none",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function CapsuleRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-s2">{children}</div>;
}
