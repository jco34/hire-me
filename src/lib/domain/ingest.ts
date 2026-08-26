import { z } from "zod";

import type { FormValues } from "@/components/app/preserveValues";
import {
  COVERAGE_VALUES,
  IMPORTANCE_VALUES,
  MAX_REQUIREMENTS,
  REQUIREMENT_KINDS,
  judgementSchema,
  type MatchBreakdown,
} from "@/lib/domain/match";
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

  /**
   * The posting as plain text, asked for only when the listing arrived as screenshots.
   * When you paste text we already have it and the model is told to return null rather
   * than echo thousands of characters back at us.
   *
   * This is what makes a screenshot-only application re-scoreable later, which is the
   * whole reason it is worth the output tokens.
   */
  listingText: z.string().nullish(),

  /**
   * The match judgement. Absent when no resume is loaded, since the model is then never
   * asked for it. `catch` keeps a malformed judgement from failing the extraction: the
   * fields still fill, the score is simply missing, and the user is no worse off than
   * before this feature existed.
   */
  judgement: judgementSchema.nullish().catch(null),
});

export type ExtractionResult = z.output<typeof ingestExtractionSchema>;

/**
 * Which model actually read the listing.
 *
 * Gemini is the primary; Claude is a local fallback for when it is overloaded. Named here
 * rather than beside the transports so this module stays the one both the client and the
 * server read their shapes from.
 */
export type ExtractorName = "gemini" | "claude";

/** What a successful extraction hands back to the create form. */
export interface IngestResult {
  /** Values for the form below, exactly as before. */
  values: FormValues;
  /** The computed score, or null when there was nothing to score it against. */
  match: MatchBreakdown | null;
  /** The posting, kept so the application can be re-scored after a resume rewrite. */
  listingText: string | null;
  /** Which resume produced `match`, so the saved row can name it. Null when unscored. */
  resumeId: string | null;
  /**
   * Which extractor produced this. Surfaced to the user only when it was not the primary:
   * a fallback that fires silently is one you cannot tell apart from a slow day.
   */
  extractor: ExtractorName;
}

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

/** Asked for only when the listing came in as screenshots. See `listingText` above. */
export const TRANSCRIBE_PROMPT = [
  "",
  "The listing was supplied as screenshots with no accompanying text.",
  "Also set listingText to a plain-text transcription of the posting: requirements,",
  "responsibilities and qualifications in full, headers and navigation chrome omitted.",
].join("\n");

/**
 * The judging half of the prompt.
 *
 * Note what is *not* asked for: a percentage, a rating, a verdict, or any number at all
 * beyond the years the posting itself states. The model reports coverage per requirement
 * and nothing else; `scoreMatch` in `match.ts` owns every weight and the arithmetic. Ask a
 * model for the number and the same posting scores 71 one minute and 78 the next.
 */
export function buildMatchPrompt(resumeText: string): string {
  return [
    "",
    "SECOND TASK — judge how well the candidate's resume answers this posting.",
    "",
    "Candidate resume:",
    "---",
    resumeText,
    "---",
    "",
    "Fill the `judgement` object:",
    `- requirements: up to ${MAX_REQUIREMENTS} entries, one per thing the posting asks for.`,
    "  Extract them from the POSTING, then decide whether the RESUME answers each one.",
    "  - label: the requirement in three words or fewer, e.g. 'Kubernetes', '5+ years React'.",
    "  - kind: " + REQUIREMENT_KINDS.join(" | ") + ". A named technology, tool, language or",
    "    qualification is a skill. Something the person would DO in the role is a responsibility.",
    "    A generic personal quality is soft: 'team player', 'strong communicator', 'self-starter',",
    "    'attention to detail', 'works well under pressure', 'passionate about X'. Use soft even",
    "    when the posting lists it as required — these are scored as nothing, so mislabelling one",
    "    as a skill costs the candidate points no resume could ever have earned back.",
    "  - importance: " + IMPORTANCE_VALUES.join(" | ") + ". 'must' only when the posting",
    "    presents it as required. Anything under 'nice to have', 'a plus', 'bonus' is 'nice'.",
    "  - coverage: " + COVERAGE_VALUES.join(" | ") + ". 'yes' when the resume clearly",
    "    demonstrates it. 'partial' for genuinely adjacent experience — Docker against a",
    "    Kubernetes requirement, Express against a Fastify one. 'no' when it is absent.",
    "  - evidence: the phrase from the RESUME that justifies 'yes' or 'partial'. Null for 'no'.",
    "- experienceFit: does the resume meet the seniority and years the posting asks for?",
    "  'yes' if it meets or exceeds them, 'partial' if short by up to two years or one title",
    "  step, 'no' if further off. Null if the posting states no seniority or years at all.",
    "- logisticsFit: can the candidate take this role given where they live and the posting's",
    "  location and work setup? Remote is 'yes'. Onsite in the candidate's own city or country",
    "  is 'yes'. Onsite in a country they would have to relocate to is 'no'. Null if the",
    "  posting says nothing about location or setup.",
    "- minYears: the years of experience the posting asks for, as a number. Null if unstated.",
    "- summary: one sentence, under 30 words, on where the candidate is strong and where they",
    "  fall short for THIS role. Address them as 'you'. No score, no percentage, no grade.",
    "",
    "Be strict. A requirement the resume does not actually evidence is 'no', not 'partial'.",
    "Judging generously produces a flattering number that costs the candidate a wasted evening.",
  ].join("\n");
}
