"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { HEADER_HEIGHT, rail } from "@/components/marketing/Section";
import { TileText } from "@/components/type/TileText";
import { cn } from "@/lib/cn";

/**
 * Sticky header that reacts to scroll position (DESIGN.md sections 5 and 9).
 *
 * At the top it is nothing but a wordmark and a link floating over the hero, which
 * keeps the still frame intact. Once the hero is behind you it takes on the page
 * background and a hairline bottom border, and tightens from HEADER_HEIGHT to 56px.
 * Both heights are multiples of the cell.
 *
 * The transition is state-change vocabulary (0.15s on colour, border and box), not
 * entrance choreography, so it stays under prefers-reduced-motion the same way
 * hover and focus feedback does.
 *
 * No capsule here. The hero CTA is the only pressable-looking thing on the page.
 */
export function SiteHeader() {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      // Half a viewport is enough to be clear of the wordmark and its margins.
      setPast(window.scrollY > window.innerHeight * 0.55);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-past-hero={past}
      className={cn(
        "sticky top-0 z-50 flex items-center justify-between",
        rail,
        "border-b transition-[height,background-color,border-color] duration-150 ease-[ease]",
        past
          ? "h-14 border-b-[color-mix(in_srgb,var(--muted)_60%,transparent)] bg-bg"
          : "border-b-transparent bg-transparent",
      )}
      style={past ? undefined : { height: HEADER_HEIGHT }}
    >
      <Link
        href="/"
        className="inline-flex items-center"
        aria-label="hire me, home"
      >
        {/* Fluid, so the cell lands on 3px at small widths and 4px above them
            and the header mark never competes with the hero mark. */}
        <span className="block w-[123px] sm:w-[164px]">
          <TileText text="hire me" mode="solid" presentational />
        </span>
      </Link>

      <Link
        href="/applications"
        className={cn(
          "inline-flex min-h-11 items-center",
          "text-[0.6875rem] uppercase leading-none tracking-[0.18em]",
          "text-ink-soft transition-colors duration-150 ease-[ease] hover:text-ink",
        )}
      >
        applications
      </Link>
    </header>
  );
}
