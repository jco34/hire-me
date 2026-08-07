import Link from "next/link";
import type { ReactNode } from "react";

import { TileText } from "@/components/type/TileText";
import { cn } from "@/lib/cn";

/**
 * Chrome for the tracker routes.
 *
 * Inherits the palette, grid, surfaces and motion of the marketing page and departs
 * from it in exactly one way: density. The tile face appears here only as the header
 * wordmark and page titles. Everything a user reads to make a decision about a job is
 * in the reading face (DESIGN.md section 2).
 */

const NAV = [
  { href: "/applications", label: "applications" },
  { href: "/companies", label: "companies" },
] as const;

export function AppShell({
  children,
  active,
}: {
  children: ReactNode;
  active: "applications" | "companies";
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header
        className={cn(
          "sticky top-0 z-30 flex items-center justify-between gap-s3",
          "border-b border-[color-mix(in_srgb,var(--muted)_60%,transparent)]",
          "bg-bg px-s2 py-s2 sm:px-s3",
        )}
      >
        <Link href="/" className="shrink-0" aria-label="hire me, home">
          <TileText text="hire me" cell={3} presentational />
        </Link>

        <nav className="flex items-center gap-s3">
          {NAV.map((item) => {
            const isActive = item.label === active;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "t-micro border-b py-s1 transition-colors duration-150 ease-[ease]",
                  isActive
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-soft hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 px-s2 py-s3 sm:px-s3">{children}</main>
    </div>
  );
}
