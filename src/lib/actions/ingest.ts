"use server";

import { GoogleGenAI, Type, type Part } from "@google/genai";

import type { FormValues } from "@/components/app/preserveValues";
import {
  INGEST_PROMPT,
  extractionToFormValues,
  ingestExtractionSchema,
} from "@/lib/domain/ingest";
import { actionError, parseWith, type ActionResult } from "@/lib/validation";

/**
 * Turn a pasted job listing (text and/or screenshots) into form-fill values.
 *
 * This is the only place the Gemini key is touched, and it never returns anything but a
 * plain string map, so nothing about the model or the key crosses to the client. The
 * output is schema-constrained by `responseSchema` and re-validated by zod before it is
 * handed back, and the user reviews every field before saving — so an adversarial
 * listing can at worst put junk in visible, editable fields.
 */

// `gemini-flash-latest` is the multimodal Flash alias that stays available on the free
// tier and tracks the current model. Pinned ids like `gemini-2.5-flash` return 404 "no
// longer available to new users" for freshly created keys.
const MODEL = "gemini-flash-latest";
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Response schema mirrors `ingestExtractionSchema`. Every field nullable so the model
 * can decline any it cannot find. No `as const`: the SDK's `Schema` type wants a plain
 * (non-readonly) object.
 */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
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
  },
};

export async function extractApplicationFields(
  formData: FormData,
): Promise<ActionResult<FormValues>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return actionError("Add a GEMINI_API_KEY to .env.local to use paste-to-fill.");
  }

  const text = (formData.get("text") ?? "").toString().trim();
  const files = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (text === "" && files.length === 0) {
    return actionError("Paste some listing text or a screenshot first.");
  }
  if (files.length > MAX_IMAGES) {
    return actionError(`Attach at most ${MAX_IMAGES} screenshots.`);
  }
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      return actionError("Each screenshot must be 5 MB or smaller.");
    }
  }

  const parts: Part[] = [{ text: INGEST_PROMPT }];
  if (text !== "") parts.push({ text: `Listing text:\n${text}` });
  for (const file of files) {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    parts.push({ inlineData: { data: base64, mimeType: file.type || "image/png" } });
  }

  let rawText: string;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: parts,
      config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    });
    rawText = response.text ?? "";
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/429|quota|rate/i.test(message)) {
      return actionError("Hit the free-tier limit. Wait a moment and try again.");
    }
    return actionError("Could not reach the extractor. Fill the form in by hand.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    return actionError("Could not read that listing. Fill the form in by hand.");
  }

  const validated = parseWith(ingestExtractionSchema, parsedJson);
  if (!validated.ok) {
    return actionError("Could not read that listing. Fill the form in by hand.");
  }

  return { ok: true, data: extractionToFormValues(validated.data) };
}
