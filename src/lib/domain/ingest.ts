import { z } from "zod";

import type { FormValues } from "@/components/app/preserveValues";
import {
  employmentTypeSchema,
  salaryPeriodSchema,
  workSetupSchema,
} from "@/lib/validation";

/**
 * Ingestion parses a job listing (text and/or screenshots) into the fields the create
 * form already has. This module is the pure half: the shape we accept back from the
 * model and the mapping into the form-fill payload. It imports neither the Gemini SDK
 * nor `server-only`, so it stays isomorphic and testable, exactly like `validation.ts`.
 *
 * Everything is optional. The model fills only what a listing actually states, and
 * anything it omits or gets slightly wrong is left for the user to correct before save.
 */

/**
 * The fields the model is asked to fill. Never stage/outcome/dates — those are the
 * user's own tracking state, not part of a posting. Kept in sync with the response
 * schema in the server action.
 */
export const INGEST_FIELD_KEYS = [
  "companyName",
  "title",
  "description",
  "url",
  "source",
  "employmentType",
  "workSetup",
  "location",
  "salaryMin",
  "salaryMax",
  "salaryCurrency",
  "salaryPeriod",
  "salaryRaw",
  "salaryNotDisclosed",
] as const;

const nullableString = z.string().trim().nullish();

/**
 * The model is told to return the enum tokens exactly, but a hallucinated value must
 * not blow up the whole extraction. `catch(null)` drops an out-of-range enum to null so
 * the rest of the fields still fill.
 */
export const ingestExtractionSchema = z.object({
  companyName: nullableString,
  title: nullableString,
  description: nullableString,
  url: nullableString,
  source: nullableString,
  employmentType: employmentTypeSchema.nullish().catch(null),
  workSetup: workSetupSchema.nullish().catch(null),
  location: nullableString,
  salaryMin: z.number().nonnegative().nullish().catch(null),
  salaryMax: z.number().nonnegative().nullish().catch(null),
  salaryCurrency: nullableString,
  salaryPeriod: salaryPeriodSchema.nullish().catch(null),
  salaryRaw: nullableString,
  salaryNotDisclosed: z.boolean().nullish().catch(null),
});

export type ExtractionResult = z.output<typeof ingestExtractionSchema>;

/**
 * Push a text value only when the model actually returned one, so a null never
 * overwrites something the user already typed.
 */
function put(values: FormValues, key: string, value: string | null | undefined): void {
  if (value === null || value === undefined) return;
  const trimmed = value.trim();
  if (trimmed === "") return;
  values[key] = [trimmed];
}

/**
 * Map the validated model output to the `FormValues` shape that `restoreValues`
 * consumes. A three-letter currency is upper-cased to match the form's own coercion,
 * numbers stringify, and the "not disclosed" checkbox follows the form convention:
 * present as `"on"` when true, an empty array (unchecked) when explicitly false, absent
 * when the model did not decide.
 */
export function extractionToFormValues(result: ExtractionResult): FormValues {
  const values: FormValues = {};

  put(values, "companyName", result.companyName);
  put(values, "title", result.title);
  put(values, "description", result.description);
  put(values, "url", result.url);
  put(values, "source", result.source);
  put(values, "employmentType", result.employmentType);
  put(values, "workSetup", result.workSetup);
  put(values, "location", result.location);
  put(values, "salaryCurrency", result.salaryCurrency?.toUpperCase());
  put(values, "salaryPeriod", result.salaryPeriod);
  put(values, "salaryRaw", result.salaryRaw);

  if (typeof result.salaryMin === "number") values.salaryMin = [String(result.salaryMin)];
  if (typeof result.salaryMax === "number") values.salaryMax = [String(result.salaryMax)];

  if (result.salaryNotDisclosed === true) values.salaryNotDisclosed = ["on"];
  else if (result.salaryNotDisclosed === false) values.salaryNotDisclosed = [];

  return values;
}

export const INGEST_PROMPT = [
  "You extract structured fields from a job listing supplied as text and/or screenshots.",
  "Return a JSON object matching the provided schema.",
  "Rules:",
  "- Only fill a field if the listing clearly states it. Use null for anything absent or uncertain.",
  "- description: summarise the role in one or two short sentences. Do NOT copy the whole posting.",
  "- employmentType must be one of: " + employmentTypeSchema.options.join(", ") + ".",
  "- workSetup must be one of: " + workSetupSchema.options.join(", ") + ".",
  "- salaryPeriod must be one of: " + salaryPeriodSchema.options.join(", ") + ".",
  "- salaryMin and salaryMax are plain numbers with no currency symbols or separators.",
  "- salaryCurrency is a three-letter ISO code (e.g. PHP, USD, SGD).",
  "- salaryRaw is the salary exactly as the posting worded it.",
  "- salaryNotDisclosed is true only if the posting explicitly hides or omits pay.",
  "- Do not invent a company name or title; leave null if genuinely not stated.",
].join("\n");
