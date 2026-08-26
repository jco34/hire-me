import "server-only";

import { Type } from "@google/genai";
import { z } from "zod";

import { ingestExtractionSchema } from "@/lib/domain/ingest";
import { judgementSchema } from "@/lib/domain/match";
import type { ResponseShape } from "@/lib/ingest/types";

/**
 * The response shapes, written once for both providers.
 *
 * The Gemini half has to be hand-written — its `responseSchema` is an OpenAPI subset with
 * its own `Type` enum, and there is no converter from zod to it. The Claude half is the zod
 * schema itself, which the CLI turns into JSON Schema on the way out. Keeping the pair
 * literally adjacent is the point: the hand-written half cannot quietly drift from the zod
 * schema that everything is finally validated against when the two sit on the same screen.
 */

/**
 * Mirrors the field half of `ingestExtractionSchema`. Every field nullable so the model can
 * decline any it cannot find. No `as const`: the SDK's `Schema` type wants a plain
 * (non-readonly) object.
 */
const FIELD_PROPERTIES = {
  companyName: { type: Type.STRING, nullable: true },
  title: { type: Type.STRING, nullable: true },
  description: { type: Type.STRING, nullable: true },
  url: { type: Type.STRING, nullable: true },
  source: { type: Type.STRING, nullable: true },
  employmentType: { type: Type.STRING, nullable: true },
  workSetup: { type: Type.STRING, nullable: true },
  location: { type: Type.STRING, nullable: true },
  salaryMin: { type: Type.NUMBER, nullable: true },
  salaryMax: { type: Type.NUMBER, nullable: true },
  salaryCurrency: { type: Type.STRING, nullable: true },
  salaryPeriod: { type: Type.STRING, nullable: true },
  salaryRaw: { type: Type.STRING, nullable: true },
  salaryNotDisclosed: { type: Type.BOOLEAN, nullable: true },
  listingText: { type: Type.STRING, nullable: true },
};

/**
 * Mirrors `judgementSchema` in `match.ts`.
 *
 * `kind` is deliberately an unconstrained string rather than an enum: `REQUIREMENT_KINDS`
 * is what the prompt enumerates, and `requirementSchema` is what enforces it, with a
 * `catch` that turns an unrecognised label into something harmless. Pinning the enum here
 * as well would mean a third place to update.
 */
const JUDGEMENT_PROPERTIES = {
  requirements: {
    type: Type.ARRAY,
    nullable: true,
    items: {
      type: Type.OBJECT,
      properties: {
        label: { type: Type.STRING },
        kind: { type: Type.STRING },
        importance: { type: Type.STRING },
        coverage: { type: Type.STRING },
        evidence: { type: Type.STRING, nullable: true },
      },
      required: ["label", "kind", "importance", "coverage"],
    },
  },
  experienceFit: { type: Type.STRING, nullable: true },
  logisticsFit: { type: Type.STRING, nullable: true },
  minYears: { type: Type.NUMBER, nullable: true },
  summary: { type: Type.STRING, nullable: true },
};

const JUDGEMENT_OBJECT = {
  type: Type.OBJECT,
  nullable: true,
  properties: JUDGEMENT_PROPERTIES,
};

/**
 * Paste-to-fill: the form fields, plus the judgement when there is a resume to judge
 * against. The judgement half is left out entirely when there is not — handing a model a
 * schema slot it has been given no way to fill is an invitation to invent something.
 */
export function extractionShape(withJudgement: boolean): ResponseShape {
  return {
    kind: "json",
    gemini: {
      type: Type.OBJECT,
      properties: withJudgement
        ? { ...FIELD_PROPERTIES, judgement: JUDGEMENT_OBJECT }
        : { ...FIELD_PROPERTIES },
    },
    zod: withJudgement ? ingestExtractionSchema : ingestExtractionSchema.omit({ judgement: true }),
  };
}

/**
 * Re-scoring an application that already has its posting stored: the judgement alone.
 *
 * Nested under a `judgement` key rather than hoisted to the top level, because that is
 * literally what `buildMatchPrompt` asks for — "Fill the `judgement` object" — and that
 * prompt is shared with paste-to-fill, where the key really is nested. Flattened here, the
 * prompt and the schema disagreed, and since every field of `judgementSchema` is optional
 * the resulting empty object validated cleanly and scored as nothing at all.
 */
export const rescoreResultSchema = z.object({
  judgement: judgementSchema.nullish().catch(null),
});

export function judgementShape(): ResponseShape {
  return {
    kind: "json",
    gemini: { type: Type.OBJECT, properties: { judgement: JUDGEMENT_OBJECT } },
    zod: rescoreResultSchema,
  };
}

/** Transcribing an uploaded resume, where the answer is prose and there is nothing to shape. */
export const TEXT_SHAPE: ResponseShape = { kind: "text" };
