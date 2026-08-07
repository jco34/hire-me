"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Scroll-triggered entrance. 0.72s ease-out on opacity, spring on transform, per
 * DESIGN.md section 9.
 *
 * `depth` is the point of this component. Reveals must land at several distinct
 * depths rather than as one batch, so every Reveal in a section should be given a
 * different depth. A section where everything arrives on the same beat is a bug.
 */

interface RevealProps {
  children: ReactNode;
  /** Stagger band. 0 lands first, each step adds 90ms. */
  depth?: number;
  /** Extra delay in ms on top of the depth band. */
  delay?: number;
  /** Fraction of the element that must be visible before it fires. */
  threshold?: number;
  className?: string;
  as?: "div" | "section" | "span" | "li" | "tr";
}

const DEPTH_STEP_MS = 90;

export function Reveal({
  children,
  depth = 0,
  delay = 0,
  threshold = 0.15,
  className,
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Anything already in view on load should not wait for a scroll that may never come.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={cn("hm-reveal", className)}
      data-revealed={revealed}
      style={{ ["--reveal-delay" as string]: `${depth * DEPTH_STEP_MS + delay}ms` }}
    >
      {children}
    </Tag>
  );
}
