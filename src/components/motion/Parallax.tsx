"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Scroll-linked movement at a rate other than the scroll rate. DESIGN.md section 9:
 * this is the default on the marketing page, not the exception. Over a long page it
 * should read as many independently-rated elements, which is what makes the stillness
 * of the hero land when you return to the top.
 *
 * Fully disabled under prefers-reduced-motion, enforced both here (no rAF loop runs)
 * and in CSS (`[data-parallax] { transform: none !important }`).
 */

interface ParallaxProps {
  children: ReactNode;
  /**
   * Movement rate relative to scroll. 0 is locked to scroll. Positive drifts down
   * (slower than scroll), negative drifts up (faster). Keep within -0.4..0.4 or it
   * reads as a broken layout rather than depth.
   */
  rate?: number;
  className?: string;
  as?: "div" | "span" | "section";
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * External-store rather than state-in-effect, so there is no render pass where the
 * value is wrong. The server snapshot is `true`: assume reduced motion until the
 * client proves otherwise, so a reduced-motion user never sees a frame of movement.
 */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => true,
  );
}

export function Parallax({
  children,
  rate = 0.12,
  className,
  as: Tag = "div",
}: ParallaxProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const node = ref.current;
    if (!node) return;

    let frame = 0;
    let visible = false;

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) schedule();
      },
      { rootMargin: "20% 0px" },
    );
    observer.observe(node);

    const apply = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      // Distance of the element's centre from the viewport centre, so the offset is
      // zero when it is centred and grows symmetrically either side.
      const fromCentre = rect.top + rect.height / 2 - window.innerHeight / 2;
      node.style.transform = `translate3d(0, ${(-fromCentre * rate).toFixed(2)}px, 0)`;
    };

    const schedule = () => {
      if (frame || !visible) return;
      frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
      node.style.transform = "";
    };
  }, [rate, reduced]);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      data-parallax=""
      className={cn("will-change-transform", className)}
    >
      {children}
    </Tag>
  );
}
