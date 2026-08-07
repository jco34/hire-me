import type { Application, Outcome } from "@/lib/db/schema";

import { isTerminal } from "./stage";

/**
 * Silence tracking.
 *
 * Staleness is the one signal the design contract lets out of the grey: a stale row gets
 * an `--ink` left rule and its counter renders in `--ink`. Everything that decides
 * whether a row earns that treatment lives here, and it is pure so the same numbers can
 * be produced on the server for sorting and on the client for rendering.
 */

const MS_PER_DAY = 86_400_000;

/** Everything the staleness helpers read. */
export type StaleSubject = Pick<Application, "lastActivityAt" | "followUpAt" | "outcome">;

export type Staleness = {
  /** Whole days of silence since the last recorded activity. */
  days: number;
  /** True when that silence has crossed the user's threshold and still matters. */
  stale: boolean;
  /** True when a follow-up was scheduled and its date has passed. */
  followUpDue: boolean;
};

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Whole days elapsed since a date, floored. Null in, null out, so a missing timestamp
 * never renders as "0 days" and reads as fresh.
 */
export function daysSince(
  date: Date | string | number | null | undefined,
  now: Date = new Date(),
): number | null {
  const parsed = toDate(date);
  if (!parsed) return null;

  const elapsed = now.getTime() - parsed.getTime();
  // A future timestamp means a late-logged event dated forward. Clamp rather than
  // reporting negative silence.
  return elapsed <= 0 ? 0 : Math.floor(elapsed / MS_PER_DAY);
}

/**
 * A terminal application is never stale. A rejection is not waiting on anyone, and
 * flagging it would bury the applications that genuinely need chasing.
 */
function canGoStale(outcome: Outcome): boolean {
  return !isTerminal(outcome);
}

export function isStale(
  application: StaleSubject,
  thresholdDays: number,
  now: Date = new Date(),
): boolean {
  if (!canGoStale(application.outcome)) return false;

  const days = daysSince(application.lastActivityAt, now);
  return days !== null && days >= thresholdDays;
}

export function followUpDue(
  application: Pick<StaleSubject, "followUpAt">,
  now: Date = new Date(),
): boolean {
  const due = toDate(application.followUpAt);
  return due !== null && due.getTime() <= now.getTime();
}

/** The full staleness picture for one row, computed once and passed to the renderer. */
export function staleness(
  application: StaleSubject,
  thresholdDays: number,
  now: Date = new Date(),
): Staleness {
  return {
    days: daysSince(application.lastActivityAt, now) ?? 0,
    stale: isStale(application, thresholdDays, now),
    followUpDue: followUpDue(application, now),
  };
}
