import type { Application, SalaryPeriod } from "@/lib/db/schema";

/**
 * Salary display and comparison.
 *
 * Two rules hold this together. First, the structured columns are for sorting and the
 * raw column is for truth: if a posting only said "competitive" then that is what we
 * show, and no number is invented. Second, comparison happens inside a single currency.
 * There is no FX conversion here, deliberately, because a stale rate silently reordering
 * a salary column is worse than not sorting across currencies at all.
 */

/** Everything the salary helpers read. Any application-shaped row satisfies it. */
export type SalarySubject = Pick<
  Application,
  | "salaryMin"
  | "salaryMax"
  | "salaryCurrency"
  | "salaryPeriod"
  | "salaryRaw"
  | "salaryNotDisclosed"
>;

/** Short suffixes, per the reading-face density budget in the design contract. */
const PERIOD_SUFFIX: Record<SalaryPeriod, string> = {
  hourly: "/hr",
  daily: "/day",
  monthly: "/mo",
  annual: "/yr",
};

const PERIOD_LABEL: Record<SalaryPeriod, string> = {
  hourly: "per hour",
  daily: "per day",
  monthly: "per month",
  annual: "per year",
};

export function salaryPeriodSuffix(period: SalaryPeriod | null): string {
  return period ? PERIOD_SUFFIX[period] : "";
}

export function salaryPeriodLabel(period: SalaryPeriod | null): string {
  return period ? PERIOD_LABEL[period] : "";
}

/**
 * Drizzle hands numeric columns back as strings to protect precision, so every read of
 * `salaryMin` / `salaryMax` has to go through here rather than being trusted as a number.
 */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * `Intl.NumberFormat` construction is not cheap and the table calls it once per row, so
 * formatters are memoised per currency and precision.
 */
const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string | null, fractionDigits: number): Intl.NumberFormat {
  const key = `${currency ?? ""}:${fractionDigits}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;

  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  };

  let formatter: Intl.NumberFormat;
  if (currency) {
    try {
      // An unknown or malformed code throws rather than degrading, so fall back to a
      // plain number and let the caller prefix the code as written.
      formatter = new Intl.NumberFormat(undefined, {
        ...options,
        style: "currency",
        currency,
        // "symbol" rather than "narrowSymbol": the narrow form renders SGD as a bare "$",
        // which is indistinguishable from USD in a table that carries both.
        currencyDisplay: "symbol",
      });
    } catch {
      formatter = new Intl.NumberFormat(undefined, options);
    }
  } else {
    formatter = new Intl.NumberFormat(undefined, options);
  }

  formatterCache.set(key, formatter);
  return formatter;
}

function isCurrencyFormatter(formatter: Intl.NumberFormat): boolean {
  return formatter.resolvedOptions().style === "currency";
}

function formatAmount(amount: number, currency: string | null, fractionDigits: number): string {
  const formatter = getFormatter(currency, fractionDigits);
  const formatted = formatter.format(amount);

  // The fallback path lost the currency, so put the code back where the symbol would be.
  if (currency && !isCurrencyFormatter(formatter)) {
    return `${currency} ${formatted}`;
  }
  return formatted;
}

/** Whole-peso and whole-dollar figures read better without ".00" in a dense table. */
function fractionDigitsFor(values: number[]): number {
  return values.every((value) => Number.isInteger(value)) ? 0 : 2;
}

/**
 * A display string for any salary shape the schema allows.
 *
 * Order of precedence: the not-disclosed flag wins, then structured figures, then the
 * verbatim text, then an honest admission that nothing was recorded.
 */
export function formatSalary(application: SalarySubject): string {
  if (application.salaryNotDisclosed) return "not disclosed";

  const min = toNumber(application.salaryMin);
  const max = toNumber(application.salaryMax);
  const raw = application.salaryRaw?.trim();

  if (min === null && max === null) {
    return raw && raw.length > 0 ? raw : "not stated";
  }

  const currency = application.salaryCurrency;
  const suffix = salaryPeriodSuffix(application.salaryPeriod);
  const digits = fractionDigitsFor([min, max].filter((value): value is number => value !== null));

  if (min !== null && max !== null) {
    if (min === max) {
      return `${formatAmount(min, currency, digits)}${suffix}`;
    }
    return `${formatAmount(min, currency, digits)} - ${formatAmount(max, currency, digits)}${suffix}`;
  }

  if (min !== null) {
    return `from ${formatAmount(min, currency, digits)}${suffix}`;
  }

  // max only
  return `up to ${formatAmount(max as number, currency, digits)}${suffix}`;
}

/**
 * A sortable figure, or null when there is nothing to sort by.
 *
 * The top of the range is used when present because that is the number people actually
 * compare offers on. The result is only meaningful against other applications in the
 * same currency and period, which is the caller's responsibility to respect.
 */
export function comparableSalary(application: SalarySubject): number | null {
  if (application.salaryNotDisclosed) return null;
  return toNumber(application.salaryMax) ?? toNumber(application.salaryMin);
}

/**
 * Bucket key for grouping before a comparison. Two applications are only comparable when
 * this matches, since neither currency nor period is converted anywhere in this app.
 */
export function salaryComparisonKey(application: SalarySubject): string {
  return `${application.salaryCurrency ?? "?"}:${application.salaryPeriod ?? "?"}`;
}
