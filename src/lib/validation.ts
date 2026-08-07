import { z } from "zod";

import {
  employmentTypeEnum,
  outcomeEnum,
  salaryPeriodEnum,
  stageEnum,
  workSetupEnum,
} from "@/lib/db/schema";

/**
 * Every mutation input is parsed here before it reaches the database.
 *
 * This module is deliberately free of `server-only` and of any Next import so that a
 * client form can share the same schema for optimistic field validation. Nothing here
 * touches the database or the auth seam.
 *
 * Inputs arrive as `FormData`, which means everything is a string and an untouched
 * control is either absent or the empty string. The coercion helpers below collapse
 * both of those into `null` so the nullable columns in `schema.ts` receive nulls rather
 * than empty strings, which would otherwise be indistinguishable from real values.
 */

/* ---------------------------------------------------------------------------
 * Action results
 *
 * Actions return errors instead of throwing so a form can render field-level messages.
 * Lives here rather than in an action module because a file with the `"use server"`
 * directive may only export async functions.
 * ------------------------------------------------------------------------- */

/** Key used for errors that belong to the submission as a whole, not to one field. */
export const FORM_ERROR_KEY = "_form";

export type FieldErrors = Record<string, string[]>;

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; errors: FieldErrors };

/** Collapse a `ZodError` into the flat shape a form renderer can index by input name. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : FORM_ERROR_KEY;
    const bucket = errors[key];
    if (bucket) {
      bucket.push(issue.message);
    } else {
      errors[key] = [issue.message];
    }
  }

  return errors;
}

/** Build a failed `ActionResult` for a problem zod cannot see, such as a missing row. */
export function actionError(message: string, field: string = FORM_ERROR_KEY): {
  ok: false;
  errors: FieldErrors;
} {
  return { ok: false, errors: { [field]: [message] } };
}

/**
 * `FormData` to a plain object. Repeated keys (checkbox groups, multi-selects) collapse
 * into an array so the filter schemas can accept either shape.
 */
export function formDataToObject(
  formData: FormData,
): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const out: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};

  for (const [key, value] of formData.entries()) {
    const existing = out[key];
    if (existing === undefined) {
      out[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      out[key] = [existing, value];
    }
  }

  return out;
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: FieldErrors };

/** Parse anything through a schema and get back the action-shaped result. */
export function parseWith<S extends z.ZodType>(
  schema: S,
  input: unknown,
): ParseResult<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, errors: toFieldErrors(result.error) };
}

/** Parse a `FormData` submission through a schema. */
export function parseFormData<S extends z.ZodType>(
  schema: S,
  formData: FormData,
): ParseResult<z.output<S>> {
  return parseWith(schema, formDataToObject(formData));
}

/* ---------------------------------------------------------------------------
 * Primitive coercions
 * ------------------------------------------------------------------------- */

/** Longest a free-text field may be. Generous, but bounded, so a paste cannot bloat a row. */
const MAX_LONG_TEXT = 20_000;
const MAX_SHORT_TEXT = 500;
const MAX_NAME = 200;

/** Largest salary figure accepted, which is also the widest the numeric(14,2) column fits. */
const MAX_MONEY = 999_999_999.99;

function blankToNull(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return value;
}

/** Optional free text. Empty or absent becomes null, never the empty string. */
function optionalText(max: number = MAX_SHORT_TEXT) {
  return z.preprocess(blankToNull, z.string().max(max).nullable());
}

function requiredText(max: number, label: string) {
  return z.preprocess(
    blankToNull,
    z
      .string({ error: `${label} is required.` })
      .min(1, `${label} is required.`)
      .max(max, `${label} must be ${max} characters or fewer.`),
  );
}

/**
 * Only http and https are accepted. A `javascript:` or `data:` URL stored here would be
 * rendered as a link in the detail panel, so it is rejected at the boundary rather than
 * sanitised at render time.
 */
function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const optionalUrl = z.preprocess(
  blankToNull,
  z
    .string()
    .max(MAX_SHORT_TEXT)
    .refine(isHttpUrl, "Must be a full http:// or https:// address.")
    .nullable(),
);

/**
 * Money arrives as a typed string. Thousands separators and spaces are tolerated because
 * people paste "80,000" straight out of a posting. Anything still unparseable is passed
 * through untouched so zod reports "expected number" rather than a silent NaN.
 */
const optionalMoney = z.preprocess((value) => {
  const base = blankToNull(value);
  if (base === null) return null;
  if (typeof base !== "string") return base;

  const cleaned = base.replace(/[\s,_]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : base;
}, z.number().min(0, "Cannot be negative.").max(MAX_MONEY, "That figure is too large.").nullable());

/**
 * Dates arrive either as `YYYY-MM-DD` from a date input or as a full ISO string. An
 * unparseable string is passed through so zod reports a type error against it.
 */
function toDateOrPassThrough(value: unknown): unknown {
  const base = blankToNull(value);
  if (base === null) return null;
  if (base instanceof Date) return base;
  if (typeof base !== "string" && typeof base !== "number") return base;

  const parsed = new Date(base);
  return Number.isNaN(parsed.getTime()) ? base : parsed;
}

const optionalDate = z.preprocess(
  toDateOrPassThrough,
  z.date({ error: "Not a valid date." }).nullable(),
);

const requiredDate = z.preprocess(
  toDateOrPassThrough,
  z.date({ error: "A date is required." }),
);

/** Unchecked checkboxes are absent from `FormData`; checked ones arrive as "on". */
const checkbox = z.preprocess((value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    return normalised === "on" || normalised === "true" || normalised === "1" || normalised === "yes";
  }
  return Boolean(value);
}, z.boolean());

const uuid = z.string().uuid("Not a valid id.");

/* ---------------------------------------------------------------------------
 * Enum schemas
 *
 * Sourced from the drizzle enums so a schema change cannot drift from validation.
 * ------------------------------------------------------------------------- */

export const stageSchema = z.enum(stageEnum.enumValues);
export const outcomeSchema = z.enum(outcomeEnum.enumValues);
export const employmentTypeSchema = z.enum(employmentTypeEnum.enumValues);
export const workSetupSchema = z.enum(workSetupEnum.enumValues);
export const salaryPeriodSchema = z.enum(salaryPeriodEnum.enumValues);

function optionalEnum<T extends z.ZodType>(inner: T) {
  return z.preprocess(blankToNull, inner.nullable());
}

/** Accepts a single value, a repeated key, or nothing, and always yields an array. */
function multiEnum<T extends z.ZodType>(inner: T) {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return [];
    return Array.isArray(value) ? value.filter((entry) => entry !== "") : [value];
  }, z.array(inner));
}

/* ---------------------------------------------------------------------------
 * Applications
 * ------------------------------------------------------------------------- */

const salaryFields = {
  salaryMin: optionalMoney,
  salaryMax: optionalMoney,
  salaryCurrency: z.preprocess(
    (value) => {
      const base = blankToNull(value);
      return typeof base === "string" ? base.toUpperCase() : base;
    },
    z
      .string()
      .regex(/^[A-Z]{3}$/, "Use a three letter currency code, for example PHP.")
      .nullable(),
  ),
  salaryPeriod: optionalEnum(salaryPeriodSchema),
  salaryRaw: optionalText(MAX_SHORT_TEXT),
  salaryNotDisclosed: checkbox,
};

const applicationCoreFields = {
  companyName: requiredText(MAX_NAME, "Company name"),
  title: requiredText(MAX_NAME, "Job title"),
  description: optionalText(MAX_LONG_TEXT),
  url: optionalUrl,
  source: optionalText(MAX_NAME),
  employmentType: optionalEnum(employmentTypeSchema),
  workSetup: optionalEnum(workSetupSchema),
  location: optionalText(MAX_NAME),
  ...salaryFields,
  stage: stageSchema.default("saved"),
  outcome: outcomeSchema.default("active"),
  appliedAt: optionalDate,
  followUpAt: optionalDate,
};

type SalaryInput = {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryNotDisclosed: boolean;
};

/**
 * A range that runs backwards is almost always a typo, and it would make the salary
 * column sort nonsensically, so it is rejected rather than silently swapped.
 */
function checkSalaryCoherence(value: SalaryInput, ctx: z.RefinementCtx): void {
  if (value.salaryMin !== null && value.salaryMax !== null && value.salaryMin > value.salaryMax) {
    ctx.addIssue({
      code: "custom",
      path: ["salaryMax"],
      message: "Maximum must be greater than or equal to the minimum.",
    });
  }

  if (value.salaryNotDisclosed && (value.salaryMin !== null || value.salaryMax !== null)) {
    ctx.addIssue({
      code: "custom",
      path: ["salaryNotDisclosed"],
      message: "Clear the salary figures before marking the salary as not disclosed.",
    });
  }
}

export const applicationCreateSchema = z
  .object(applicationCoreFields)
  .superRefine(checkSalaryCoherence);

/**
 * Update carries stage and outcome so a single edit form can change everything, but the
 * action still writes an event for either of them so the log cannot drift from the row.
 */
export const applicationUpdateSchema = z
  .object({ id: uuid, ...applicationCoreFields })
  .superRefine(checkSalaryCoherence);

export const applicationIdSchema = z.object({ id: uuid });

export const stageChangeSchema = z.object({
  applicationId: uuid,
  toStage: stageSchema,
  occurredAt: optionalDate,
  detail: optionalText(MAX_SHORT_TEXT),
  /** Backward moves are almost always a misclick, so they need to be asked for. */
  allowBackward: checkbox,
});

export const outcomeChangeSchema = z.object({
  applicationId: uuid,
  toOutcome: outcomeSchema,
  occurredAt: optionalDate,
  detail: optionalText(MAX_SHORT_TEXT),
});

export const followUpSetSchema = z.object({
  applicationId: uuid,
  followUpAt: requiredDate,
  detail: optionalText(MAX_SHORT_TEXT),
});

export const followUpClearSchema = z.object({
  applicationId: uuid,
});

/* ---------------------------------------------------------------------------
 * Filters
 * ------------------------------------------------------------------------- */

export const APPLICATION_SORT_KEYS = [
  "company",
  "title",
  "stage",
  "salary",
  "lastActivityAt",
  "appliedAt",
  "createdAt",
] as const;

export const applicationSortSchema = z.enum(APPLICATION_SORT_KEYS);
export const sortDirectionSchema = z.enum(["asc", "desc"]);

export const applicationFiltersSchema = z.object({
  stage: multiEnum(stageSchema).default([]),
  outcome: multiEnum(outcomeSchema).default([]),
  employmentType: multiEnum(employmentTypeSchema).default([]),
  workSetup: multiEnum(workSetupSchema).default([]),
  search: z.preprocess(blankToNull, z.string().max(MAX_NAME).nullable()).default(null),
  staleOnly: checkbox.default(false),
  sort: applicationSortSchema.default("lastActivityAt"),
  direction: sortDirectionSchema.default("desc"),
});

/* ---------------------------------------------------------------------------
 * Companies
 * ------------------------------------------------------------------------- */

const companyCoreFields = {
  name: requiredText(MAX_NAME, "Company name"),
  website: optionalUrl,
  location: optionalText(MAX_NAME),
  notes: optionalText(MAX_LONG_TEXT),
};

export const companyCreateSchema = z.object(companyCoreFields);
export const companyUpdateSchema = z.object({ id: uuid, ...companyCoreFields });
export const companyIdSchema = z.object({ id: uuid });

/* ---------------------------------------------------------------------------
 * Notes
 * ------------------------------------------------------------------------- */

export const noteCreateSchema = z.object({
  applicationId: uuid,
  body: requiredText(MAX_LONG_TEXT, "Note"),
});

export const noteUpdateSchema = z.object({
  id: uuid,
  body: requiredText(MAX_LONG_TEXT, "Note"),
});

export const noteIdSchema = z.object({ id: uuid });

/* ---------------------------------------------------------------------------
 * Contacts
 * ------------------------------------------------------------------------- */

const contactCoreFields = {
  name: requiredText(MAX_NAME, "Contact name"),
  role: optionalText(MAX_NAME),
  email: z.preprocess(blankToNull, z.email("Not a valid email address.").nullable()),
  phone: optionalText(MAX_NAME),
  notes: optionalText(MAX_LONG_TEXT),
};

export const contactCreateSchema = z.object({
  applicationId: uuid,
  ...contactCoreFields,
});

export const contactUpdateSchema = z.object({
  id: uuid,
  ...contactCoreFields,
});

export const contactIdSchema = z.object({ id: uuid });

/* ---------------------------------------------------------------------------
 * Inferred types
 * ------------------------------------------------------------------------- */

export type ApplicationCreateInput = z.output<typeof applicationCreateSchema>;
export type ApplicationUpdateInput = z.output<typeof applicationUpdateSchema>;
export type StageChangeInput = z.output<typeof stageChangeSchema>;
export type OutcomeChangeInput = z.output<typeof outcomeChangeSchema>;
export type FollowUpSetInput = z.output<typeof followUpSetSchema>;

/** Filters as the caller may supply them, with every key optional. */
export type ApplicationFiltersInput = z.input<typeof applicationFiltersSchema>;
/** Filters after parsing, with defaults applied. */
export type ApplicationFilters = z.output<typeof applicationFiltersSchema>;
export type ApplicationSortKey = z.output<typeof applicationSortSchema>;
export type SortDirection = z.output<typeof sortDirectionSchema>;

export type CompanyCreateInput = z.output<typeof companyCreateSchema>;
export type CompanyUpdateInput = z.output<typeof companyUpdateSchema>;
export type NoteCreateInput = z.output<typeof noteCreateSchema>;
export type NoteUpdateInput = z.output<typeof noteUpdateSchema>;
export type ContactCreateInput = z.output<typeof contactCreateSchema>;
export type ContactUpdateInput = z.output<typeof contactUpdateSchema>;
