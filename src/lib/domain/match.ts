import { z } from "zod";

/**
 * How well your resume answers a job posting, as a percentage.
 *
 * The split this module exists to enforce: **the model judges, the code counts.** A
 * language model is good at reading a posting and deciding whether a resume covers a
 * given requirement; it is bad at being consistent about arithmetic, and a percentage
 * that moves between 71 and 78 on identical input is not a number anyone can act on. So
 * the model only ever emits categorical judgements — `yes` / `partial` / `no` — and every
 * weight, every normalisation and the gate live here, in a pure function with no network
 * and no imports beyond zod. Change a weight and nothing about the prompt changes.
 *
 * Pure and isomorphic on purpose, exactly like `duplicate.ts` and `validation.ts`.
 */

/* ---------------------------------------------------------------------------
 * The judgement, as the model returns it
 * ------------------------------------------------------------------------- */

export const COVERAGE_VALUES = ["yes", "partial", "no"] as const;
export const IMPORTANCE_VALUES = ["must", "nice"] as const;

/**
 * `soft` is the disregard bucket: generic personal qualities like "team player" or
 * "strong communicator".
 *
 * They are separated out rather than scored badly because they are unanswerable by
 * construction. Every posting asks for them, no resume evidences them in a way a model can
 * check, so they were reliably landing as missed must-haves — which meant a generic line of
 * boilerplate in the posting was tripping `MUST_HAVE_GATE` and capping an otherwise strong
 * match at 70. The gate exists to catch a missing Kubernetes, not a missing adjective.
 *
 * The model still labels them, and `scoreMatch` drops them. Classifying is judgement and
 * belongs to the model; deciding they do not count is arithmetic and belongs here.
 */
export const REQUIREMENT_KINDS = ["skill", "responsibility", "soft"] as const;

export type Coverage = (typeof COVERAGE_VALUES)[number];
export type Importance = (typeof IMPORTANCE_VALUES)[number];
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

/** Cap on how much of a posting we will reason about, so one listing cannot bloat a row. */
export const MAX_REQUIREMENTS = 40;

const coverageSchema = z.enum(COVERAGE_VALUES);

/**
 * One thing the posting asks for, and whether the resume answers it.
 *
 * `catch` on the two enums rather than a hard failure: a single hallucinated token must
 * not throw away the other nineteen requirements the model got right. An unreadable
 * importance is treated as `nice` and an unreadable coverage as `no`, both of which err
 * toward a lower score — a match score that fails high is the one that costs you an
 * evening on the wrong posting.
 */
export const requirementSchema = z.object({
  label: z.string().trim().min(1).max(120),
  kind: z.enum(REQUIREMENT_KINDS).catch("skill"),
  importance: z.enum(IMPORTANCE_VALUES).catch("nice"),
  coverage: coverageSchema.catch("no"),
  /** A short quote or paraphrase from the resume. Shown to explain the judgement. */
  evidence: z.string().trim().max(400).nullish(),
});

export type Requirement = z.output<typeof requirementSchema>;

/**
 * Everything the model contributes to the score. Every field is optional: a posting that
 * says nothing about seniority yields a null `experienceFit`, and that dimension is then
 * dropped rather than guessed at.
 */
export const judgementSchema = z.object({
  requirements: z.array(requirementSchema).max(MAX_REQUIREMENTS).nullish(),
  experienceFit: coverageSchema.nullish().catch(null),
  logisticsFit: coverageSchema.nullish().catch(null),
  /** Years the posting asks for. Display only — it never enters the arithmetic. */
  minYears: z.number().nonnegative().max(50).nullish().catch(null),
  /** One line, in the model's words, for the top of the score block. */
  summary: z.string().trim().max(240).nullish(),
});

export type Judgement = z.output<typeof judgementSchema>;

/* ---------------------------------------------------------------------------
 * The arithmetic
 * ------------------------------------------------------------------------- */

export const DIMENSION_KEYS = ["skills", "experience", "domain", "logistics"] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

/**
 * Weights, out of 100 if every dimension applies. They deliberately sum to 95 rather than
 * 100: compensation was the fifth dimension and is deferred until there is a target salary
 * to compare against. Nothing depends on the total, because `scoreMatch` normalises by the
 * weights it actually used — which is the same mechanism that lets a posting with no stated
 * seniority be scored on the other three without being punished for the silence.
 */
export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  skills: 40,
  experience: 25,
  domain: 20,
  logistics: 10,
};

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  skills: "skills and stack",
  experience: "experience level",
  domain: "domain and duties",
  logistics: "location and setup",
};

/**
 * A single missed must-have caps the whole score here, however well the rest reads.
 *
 * Without a gate every posting converges on the high seventies — enough overlap always
 * exists — and a number that is always 78 tells you nothing about which posting to spend
 * an evening on. The cap is what makes a 90 worth acting on.
 */
export const MUST_HAVE_GATE = 70;

const COVERAGE_SCORE: Record<Coverage, number> = { yes: 1, partial: 0.5, no: 0 };
const IMPORTANCE_WEIGHT: Record<Importance, number> = { must: 3, nice: 1 };

export interface ScoredDimension {
  key: DimensionKey;
  label: string;
  /** 0..1 before weighting. */
  value: number;
  weight: number;
}

export interface MatchBreakdown {
  /** 0..100, rounded once, at the end. */
  score: number;
  /** True when the gate pulled the score down, so the UI can say why. */
  gated: boolean;
  dimensions: ScoredDimension[];
  /** Must-haves the resume does not answer. The list that actually changes behaviour. */
  missing: string[];
  /** Adjacent-but-not-the-same: Docker against a Kubernetes requirement. */
  partial: string[];
  covered: string[];
  minYears: number | null;
  summary: string | null;
}

/** Weighted mean of a set of requirements, or null when the set is empty. */
function coverageOf(requirements: Requirement[]): number | null {
  if (requirements.length === 0) return null;

  let weighted = 0;
  let total = 0;
  for (const requirement of requirements) {
    const weight = IMPORTANCE_WEIGHT[requirement.importance];
    weighted += weight * COVERAGE_SCORE[requirement.coverage];
    total += weight;
  }

  return total === 0 ? null : weighted / total;
}

/**
 * Turn a judgement into a percentage and the evidence behind it.
 *
 * Returns null when there is nothing to score at all — no requirements and no axis
 * judgements. That is a real outcome (a screenshot the model could not read, a posting
 * that is three lines of boilerplate) and it must stay distinguishable from a genuine
 * zero, which is why the column is nullable and the UI says "not scored".
 */
export function scoreMatch(judgement: Judgement): MatchBreakdown | null {
  // Soft skills are dropped here, once, before anything reads the list — so they cannot
  // reach a dimension, the must-have gate, or any of the evidence lists the panel renders.
  // A garbled `kind` still parses as `skill` (see `requirementSchema`), which is the right
  // way to fail: a real requirement is never silently discarded by a bad label.
  const requirements = (judgement.requirements ?? []).filter((r) => r.kind !== "soft");

  const skills = coverageOf(requirements.filter((r) => r.kind === "skill"));
  const domain = coverageOf(requirements.filter((r) => r.kind === "responsibility"));
  const experience = judgement.experienceFit
    ? COVERAGE_SCORE[judgement.experienceFit]
    : null;
  const logistics = judgement.logisticsFit ? COVERAGE_SCORE[judgement.logisticsFit] : null;

  const candidates: Array<[DimensionKey, number | null]> = [
    ["skills", skills],
    ["experience", experience],
    ["domain", domain],
    ["logistics", logistics],
  ];

  const dimensions: ScoredDimension[] = [];
  for (const [key, value] of candidates) {
    if (value === null) continue;
    dimensions.push({
      key,
      label: DIMENSION_LABELS[key],
      value,
      weight: DIMENSION_WEIGHTS[key],
    });
  }

  if (dimensions.length === 0) return null;

  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const weighted = dimensions.reduce((sum, d) => sum + d.weight * d.value, 0);
  const raw = Math.round((weighted / totalWeight) * 100);

  const missing = requirements
    .filter((r) => r.importance === "must" && r.coverage === "no")
    .map((r) => r.label);

  // The gate is a cap, not a subtraction: a score already below it is left alone, so a
  // genuinely poor match does not get quietly promoted to 70 by the thing meant to punish it.
  const gated = missing.length > 0 && raw > MUST_HAVE_GATE;
  const score = gated ? MUST_HAVE_GATE : raw;

  return {
    score,
    gated,
    dimensions,
    missing,
    partial: requirements.filter((r) => r.coverage === "partial").map((r) => r.label),
    covered: requirements.filter((r) => r.coverage === "yes").map((r) => r.label),
    minYears: judgement.minYears ?? null,
    summary: judgement.summary ?? null,
  };
}

/**
 * Read a breakdown back out of the `jsonb` column.
 *
 * A row written by an older shape of this module must degrade to "not scored" rather than
 * crash the detail page, so this parses defensively and returns null on anything it does
 * not recognise.
 */
const scoredDimensionSchema = z.object({
  key: z.enum(DIMENSION_KEYS),
  label: z.string(),
  value: z.number().min(0).max(1),
  weight: z.number().nonnegative(),
});

export const matchBreakdownSchema = z.object({
  score: z.number().int().min(0).max(100),
  gated: z.boolean(),
  dimensions: z.array(scoredDimensionSchema),
  missing: z.array(z.string()),
  partial: z.array(z.string()),
  covered: z.array(z.string()),
  minYears: z.number().nullable(),
  summary: z.string().nullable(),
});

export function parseBreakdown(value: unknown): MatchBreakdown | null {
  const parsed = matchBreakdownSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/* ---------------------------------------------------------------------------
 * Words for the number
 * ------------------------------------------------------------------------- */

/**
 * A band label, always rendered beside the figure.
 *
 * DESIGN.md section 10: meaning is never carried by fill weight alone, so the strip always
 * has words next to it. These are deliberately about what to *do*, not about how good you
 * are — the score is a triage signal for which posting deserves a tailored application,
 * not a verdict on you.
 */
export function matchBand(score: number): string {
  if (score >= 85) return "worth tailoring for";
  if (score >= 70) return "solid fit";
  if (score >= 50) return "a stretch";
  return "long shot";
}
