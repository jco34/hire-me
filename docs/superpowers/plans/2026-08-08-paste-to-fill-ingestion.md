# Paste-to-fill Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user paste a job listing as text and/or screenshots on the "add an application" page, have Gemini fill the existing form's fields, and keep full say to edit or save before anything is written.

**Architecture:** A `"use server"` action sends pasted text + inline base64 images to Gemini 2.5 Flash with a `responseSchema`, re-validates the JSON with zod, and returns a `FormValues` map. A client `IngestPanel` above the existing uncontrolled form calls that action and fills the form by reusing the codebase's existing `restoreValues` helper. No database writes happen until the user clicks the existing **save application** button.

**Tech Stack:** Next.js 16.3 (server actions, `useActionState`/`useTransition`), React 19, `@google/genai` SDK, zod 4, Tailwind 4, Drizzle (unchanged here).

## Global Constraints

- Extraction backend is **Gemini on the Google AI Studio free tier**, model **`gemini-2.5-flash`**, via the official **`@google/genai`** SDK. No other backend.
- The Gemini key is read **only** server-side as `process.env.GEMINI_API_KEY`; it is never imported into, passed to, or referenced from a client component.
- **Nothing is persisted by this feature.** Screenshots are used for extraction then discarded — no image storage, no detail-panel viewer.
- Extraction fills these fields only: `companyName`, `title`, `description` (summarised to 1–2 lines), `url`, `source`, `employmentType`, `workSetup`, `location`, `salaryMin`, `salaryMax`, `salaryCurrency`, `salaryPeriod`, `salaryRaw`, `salaryNotDisclosed`. It never sets `stage`, `outcome`, `appliedAt`, `followUpAt`.
- Enum values returned by the model must be exactly the Drizzle enum tokens used in `src/lib/validation.ts` (`employmentTypeSchema`, `workSetupSchema`, `salaryPeriodSchema`).
- Limits: **max 6 images**, **max 5 MB per image**, enforced client-side before the request.
- Design system (DESIGN.md): hairline `--muted` borders, `--r-md` corners, matte/flat fills, reading face (`t-body`/`t-micro`) for all read text; the **extract** button is the single lifted capsule of the ingest region, separated from the form's **save** capsule by `--s-5`; motion uses existing tokens and drops under `prefers-reduced-motion`. Screenshot thumbnails sit in hairline-bordered rounded matte frames.
- The project has **no test runner**. "Tests" here are: keep the mapper a pure function verified with an inline `npx tsx` assertion, plus `npm run typecheck`, `npm run lint`, and browser verification.

---

### Task 1: Add the SDK, env example, and docs note

**Files:**
- Modify: `package.json` (dependencies)
- Create: `.env.example`
- Modify: `AGENTS.md` (append a one-line env note near the end)

**Interfaces:**
- Produces: the `@google/genai` package available to import; documented `GEMINI_API_KEY`.

- [ ] **Step 1: Install the SDK**

```bash
cd "C:/Personal Projects/hire-me" && npm install @google/genai
```

- [ ] **Step 2: Verify it resolves**

```bash
cd "C:/Personal Projects/hire-me" && node -e "console.log(require('@google/genai/package.json').version)"
```
Expected: prints a version number (e.g. `2.0.1`).

- [ ] **Step 3: Create `.env.example`**

```
# Google AI Studio free-tier key for paste-to-fill extraction (https://aistudio.google.com/apikey)
GEMINI_API_KEY=
# Existing Postgres connection string used by Drizzle
DATABASE_URL=
```

- [ ] **Step 4: Add an env note to `AGENTS.md`**

Append this block to the end of `AGENTS.md`:

```markdown
# Environment

Paste-to-fill ingestion reads `GEMINI_API_KEY` (Google AI Studio free tier) from `.env.local`, server-side only. See `.env.example`.
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Personal Projects/hire-me" && git add package.json package-lock.json .env.example AGENTS.md && git commit -m "chore: add @google/genai and document GEMINI_API_KEY"
```

---

### Task 2: Pure extraction domain module

A shared, SDK-free module (like `validation.ts`) holding the zod schema for the model's JSON, the pure mapper to `FormValues`, and the prompt text. Kept free of `@google/genai` and `server-only` so it stays isomorphic and unit-verifiable.

**Files:**
- Create: `src/lib/domain/ingest.ts`

**Interfaces:**
- Consumes: `FormValues` type from `src/components/app/preserveValues.ts`; enum schemas from `src/lib/validation.ts` (`employmentTypeSchema`, `workSetupSchema`, `salaryPeriodSchema`).
- Produces:
  - `ingestExtractionSchema: z.ZodType` — validates the parsed model JSON.
  - `type ExtractionResult = z.output<typeof ingestExtractionSchema>`
  - `extractionToFormValues(result: ExtractionResult): FormValues` — pure map to the form-fill shape.
  - `INGEST_PROMPT: string` — the instruction text.
  - `INGEST_FIELD_KEYS: readonly string[]` — the field names Gemini fills (used by the response schema in Task 3).

- [ ] **Step 1: Write the module**

Create `src/lib/domain/ingest.ts`:

```ts
import { z } from "zod";

import type { FormValues } from "@/components/app/preserveValues";
import {
  employmentTypeSchema,
  salaryPeriodSchema,
  workSetupSchema,
} from "@/lib/validation";

/**
 * Ingestion parses a job listing (text and/or screenshots) into the fields the
 * create form already has. This module is the pure half: the shape we accept back
 * from the model and the mapping into the form-fill payload. It imports neither the
 * Gemini SDK nor `server-only`, so it stays isomorphic and testable, exactly like
 * `validation.ts`.
 *
 * Everything is optional. The model fills only what a listing actually states, and
 * anything it omits or gets slightly wrong is left for the user to correct before save.
 */

/** The fields the model is asked to fill. Never stage/outcome/dates — those are the
 * user's own tracking state, not part of a posting. */
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

/** Push a text value only when the model actually returned one, so a null never
 * overwrites something the user already typed. */
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
```

- [ ] **Step 2: Verify the enum option accessor exists**

The prompt uses `employmentTypeSchema.options`. Confirm these are `z.enum(...)` (they are, per `validation.ts`), which exposes `.options`. If a schema is wrapped differently, use `.options` on the underlying `z.enum`. Run the smoke check in Step 3 — a wrong accessor throws there.

- [ ] **Step 3: Optional smoke-test of the mapper with tsx**

The mapper is pure, so it can be exercised directly — but only if `@/` path aliases resolve under `tsx` (the domain module imports `@/lib/validation`). The project's `db:seed` script runs under `tsx`, so aliases may already resolve; if this one-liner throws a "cannot find module '@/…'" error, skip it — Task 6's browser run exercises the same mapper end-to-end, and `npm run typecheck` already guarantees the types.

```bash
cd "C:/Personal Projects/hire-me" && npx tsx -e "import { ingestExtractionSchema, extractionToFormValues } from './src/lib/domain/ingest.ts'; const parsed = ingestExtractionSchema.parse({ companyName: 'Acme', title: 'Backend Engineer', description: 'Build APIs.', employmentType: null, workSetup: null, salaryMin: 80000, salaryMax: 120000, salaryCurrency: 'usd', salaryPeriod: null, salaryNotDisclosed: false, url: null, source: null, location: null, salaryRaw: null }); const v = extractionToFormValues(parsed); const ok = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } }; ok(v.companyName[0] === 'Acme', 'company'); ok(v.salaryCurrency[0] === 'USD', 'currency upper'); ok(v.salaryMin[0] === '80000', 'salaryMin string'); ok(Array.isArray(v.salaryNotDisclosed) && v.salaryNotDisclosed.length === 0, 'notDisclosed false -> unchecked'); ok(!('stage' in v) && !('outcome' in v), 'no tracking fields'); console.log('OK');"
```
Expected: prints `OK`, or a module-resolution error you may skip past per the note above.

- [ ] **Step 4: Typecheck**

```bash
cd "C:/Personal Projects/hire-me" && npm run typecheck
```
Expected: no errors. This is the real gate for this task — it must pass.

- [ ] **Step 5: Commit**

```bash
cd "C:/Personal Projects/hire-me" && git add src/lib/domain/ingest.ts && git commit -m "feat: pure ingestion extraction schema and form-values mapper"
```

---

### Task 3: The Gemini server action

**Files:**
- Create: `src/lib/actions/ingest.ts`

**Interfaces:**
- Consumes: `ingestExtractionSchema`, `extractionToFormValues`, `INGEST_PROMPT`, `INGEST_FIELD_KEYS` from `src/lib/domain/ingest.ts`; `FormValues` from `preserveValues.ts`; `ActionResult`, `actionError`, `parseWith` from `src/lib/validation.ts`; `GoogleGenAI`, `Type` from `@google/genai`.
- Produces: `extractApplicationFields(formData: FormData): Promise<ActionResult<FormValues>>` — the single-arg action the client calls directly.

- [ ] **Step 1: Write the action**

Create `src/lib/actions/ingest.ts`:

```ts
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

const MODEL = "gemini-2.5-flash";
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Response schema mirrors `ingestExtractionSchema`. Every field nullable so the model
 * can decline any it cannot find. No `as const`: the SDK's `Schema` type wants a plain
 * (non-readonly) object. */
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
```

- [ ] **Step 2: Note on `INGEST_FIELD_KEYS`**

`INGEST_FIELD_KEYS` from Task 2 documents the field set; `RESPONSE_SCHEMA` above lists the same keys explicitly (the SDK schema needs literal `Type.*` values). Keep the two lists in sync — if a field is added, add it in both places.

- [ ] **Step 3: Typecheck**

```bash
cd "C:/Personal Projects/hire-me" && npm run typecheck
```
Expected: no errors. (If `Part` is not exported by this SDK version, replace `Part[]` with `Array<Record<string, unknown>>` or the SDK's `ContentListUnion` element type — confirm against `node_modules/@google/genai` types.)

- [ ] **Step 4: Lint**

```bash
cd "C:/Personal Projects/hire-me" && npm run lint
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd "C:/Personal Projects/hire-me" && git add src/lib/actions/ingest.ts && git commit -m "feat: Gemini server action to extract application fields"
```

---

### Task 4: The IngestPanel client component

**Files:**
- Create: `src/app/applications/IngestPanel.tsx`

**Interfaces:**
- Consumes: `extractApplicationFields` from `src/lib/actions/ingest.ts`; `FormValues` from `preserveValues.ts`; `Capsule` from `src/components/ui/Capsule.tsx`; `cn` from `src/lib/cn.ts`.
- Produces: `IngestPanel({ onExtracted }: { onExtracted: (values: FormValues) => void })` — a self-contained paste/extract panel.

- [ ] **Step 1: Write the component**

Create `src/app/applications/IngestPanel.tsx`. Match the surrounding style (hairline borders via `color-mix` on `--muted`, `t-body`/`t-micro`, `--r-md`, spacing tokens `s1`/`s2`/`s3`). Behaviour:

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Capsule } from "@/components/ui/Capsule";
import type { FormValues } from "@/components/app/preserveValues";
import { extractApplicationFields } from "@/lib/actions/ingest";
import { cn } from "@/lib/cn";

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Paste a listing (text and/or screenshots); on extract, hand the filled values up so
 * the form can populate itself. This panel never saves anything — it only fills fields.
 */
export function IngestPanel({ onExtracted }: { onExtracted: (values: FormValues) => void }) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // Object URLs for thumbnails, revoked when the image list changes or on unmount.
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = images.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [images]);

  const addFiles = (incoming: File[]) => {
    const pics = incoming.filter((file) => file.type.startsWith("image/"));
    if (pics.some((file) => file.size > MAX_IMAGE_BYTES)) {
      setMessage("Each screenshot must be 5 MB or smaller.");
      return;
    }
    setImages((current) => {
      const next = [...current, ...pics].slice(0, MAX_IMAGES);
      if (current.length + pics.length > MAX_IMAGES) {
        setMessage(`Using the first ${MAX_IMAGES} screenshots.`);
      }
      return next;
    });
  };

  const onPaste = (event: React.ClipboardEvent) => {
    const pics = Array.from(event.clipboardData.files);
    if (pics.length > 0) {
      event.preventDefault();
      addFiles(pics);
    }
  };

  const removeImage = (index: number) =>
    setImages((current) => current.filter((_, i) => i !== index));

  const extract = () => {
    setMessage(null);
    const fd = new FormData();
    fd.set("text", text);
    images.forEach((file) => fd.append("images", file));
    startTransition(async () => {
      const result = await extractApplicationFields(fd);
      if (result.ok) {
        onExtracted(result.data);
        setMessage("Filled the form below. Check every field before saving.");
      } else {
        const errors = result.errors;
        setMessage(errors._form?.[0] ?? Object.values(errors)[0]?.[0] ?? "Extraction failed.");
      }
    });
  };

  const canExtract = !pending && (text.trim() !== "" || images.length > 0);

  return (
    <section
      aria-label="Paste a listing to fill the form"
      onPaste={onPaste}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        addFiles(Array.from(e.dataTransfer.files));
      }}
      className="flex flex-col gap-s2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--muted)_60%,transparent)] p-s3"
    >
      <p className="t-micro">paste a listing</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Paste the job posting text here, or paste / drop a screenshot."
        className="t-body w-full resize-y rounded-[var(--r-sm)] border border-[color-mix(in_srgb,var(--muted)_60%,transparent)] bg-transparent p-s2 outline-none focus:border-ink"
      />

      {previews.length > 0 ? (
        <ul className="flex flex-wrap gap-s2">
          {previews.map((url, index) => (
            <li key={url} className="relative">
              {/* Screenshots are evidence framed, not decoration (DESIGN.md 8). */}
              <img
                src={url}
                alt={`screenshot ${index + 1}`}
                className="h-[64px] w-[64px] rounded-[var(--r-sm)] border border-[color-mix(in_srgb,var(--muted)_60%,transparent)] object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                aria-label={`remove screenshot ${index + 1}`}
                className="t-micro absolute -right-s1 -top-s1 rounded-[var(--r-pill)] border border-ink bg-surface px-s1 leading-none text-ink"
              >
                x
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-s3">
        <Capsule type="button" onClick={extract} disabled={!canExtract}>
          {pending ? "reading" : "extract"}
        </Capsule>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="t-micro text-ink-soft transition-colors duration-150 ease-[ease] hover:text-ink"
        >
          add screenshot
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {message ? (
        <p className="t-body text-ink-soft" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Confirm `Capsule` supports `type="button"` + `onClick` + `disabled`**

Open `src/components/ui/Capsule.tsx` and confirm it forwards `type`, `onClick`, and `disabled` to the underlying `<button>`. If `Capsule` only renders a submit button, either extend it to accept these props or use a plain `<button>` styled with the same classes the CTA capsule uses (hairline + `4px 4px 0 var(--ink)` shadow collapsing to `2px 2px 0` on press). The extract button MUST be the region's single lifted capsule per DESIGN.md 7.

- [ ] **Step 3: Typecheck + lint**

```bash
cd "C:/Personal Projects/hire-me" && npm run typecheck && npm run lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "C:/Personal Projects/hire-me" && git add src/app/applications/IngestPanel.tsx && git commit -m "feat: IngestPanel paste-and-extract UI"
```

---

### Task 5: Wire ingest into the form and new page, fix stale copy

**Files:**
- Modify: `src/app/applications/ApplicationForm.tsx`
- Modify: `src/app/applications/new/page.tsx`
- Modify: `src/app/applications/page.tsx` (empty-state copy)

**Interfaces:**
- Consumes: `IngestPanel` from `src/app/applications/IngestPanel.tsx`; existing `restoreValues` already imported in `ApplicationForm.tsx`.
- Produces: `ApplicationForm` accepts optional `ingest?: boolean`.

- [ ] **Step 1: Add the `ingest` prop and render the panel**

In `src/app/applications/ApplicationForm.tsx`:
1. Add the import: `import { IngestPanel } from "@/app/applications/IngestPanel";`
2. Add `ingest,` to the destructured props and `ingest?: boolean;` to the props type.
3. Immediately inside the `<form>`, before the `{application ? ...}` hidden id line, render the panel with section spacing so it reads as its own region:

```tsx
{ingest ? (
  <div className="mb-s5">
    <IngestPanel onExtracted={(values) => restoreValues(formRef.current, values)} />
  </div>
) : null}
```

`restoreValues` sets each named field from the map and leaves untouched fields alone, so the user's manual entries survive an extraction that omits them.

- [ ] **Step 2: Turn ingest on for the new page and fix its kicker**

In `src/app/applications/new/page.tsx`:
- Change the `PageHeader` kicker from `"a new application"` to `"paste a listing or fill it in"`.
- Add the `ingest` prop:

```tsx
<ApplicationForm
  action={createApplication}
  submitLabel="save application"
  cancelHref="/applications"
  ingest
/>
```

- [ ] **Step 3: Fix the stale empty-state copy**

In `src/app/applications/page.tsx`, replace:

```
"Add the first application by hand. Pasting a listing to fill these fields in comes in phase 2."
```

with:

```
"Add your first application — paste a listing or a screenshot to fill it in, or type it by hand."
```

- [ ] **Step 4: Typecheck + lint**

```bash
cd "C:/Personal Projects/hire-me" && npm run typecheck && npm run lint
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd "C:/Personal Projects/hire-me" && git add src/app/applications/ApplicationForm.tsx src/app/applications/new/page.tsx src/app/applications/page.tsx && git commit -m "feat: wire paste-to-fill into the add-application form"
```

---

### Task 6: End-to-end browser verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Use the preview tool (`preview_start` with a dev-server launch config running `npm run dev`), then navigate to `/applications/new`.

- [ ] **Step 2: Verify the missing-key path (optional but recommended)**

Temporarily rename `GEMINI_API_KEY` in `.env.local`, restart, click **extract** with sample text, and confirm the panel shows "Add a GEMINI_API_KEY to .env.local…". Restore the key and restart.

- [ ] **Step 3: Verify a text extraction**

Paste a realistic listing into the textarea, e.g.:

```
Senior Backend Engineer — Acme Corp (Remote, Philippines)
Full-time. PHP 120,000–160,000 per month.
Build and maintain our payments API. Apply via LinkedIn.
```

Click **extract**. Expected: company `Acme Corp`, title `Senior Backend Engineer`, a 1–2 line description, work setup `remote`, employment type `full-time` (whatever the real token is), salary min/max `120000`/`160000`, currency `PHP`, period `monthly`, source mentions LinkedIn. Confirm `stage`/`outcome` stayed at their defaults and dates are empty.

- [ ] **Step 4: Verify user edits survive and save works**

Type a value into a field the listing did not mention (e.g. Location), re-run extract, and confirm your typed Location is not wiped. Then edit any field, click **save application**, and confirm it redirects to the new application's detail page (the unchanged `createApplication` path).

- [ ] **Step 5: Check console/network**

Use the preview tools to read console messages and network requests: no client-side errors, and no request that carries the API key to the browser.

- [ ] **Step 6: Reduced motion + screenshot proof**

Confirm the panel is usable under `prefers-reduced-motion`. Capture a screenshot of a successful fill to share with the user.

- [ ] **Step 7: Final commit if any verification tweaks were needed**

```bash
cd "C:/Personal Projects/hire-me" && git add -A && git commit -m "fix: ingestion verification adjustments"
```
(Skip if nothing changed.)

---

## Notes for the implementer

- **Confirm the real enum tokens** in `src/lib/db/schema.ts` (`employmentTypeEnum`, `workSetupEnum`, `salaryPeriodEnum`, `stageEnum`, `outcomeEnum`) before trusting any sample values in this plan — use the exact tokens the DB defines.
- **AGENTS.md caveat:** this is a modified Next.js. The server-action and form patterns here mirror the existing `src/lib/actions/applications.ts` and `ApplicationForm.tsx`, which already work against this version — do not "modernise" them from training-data habits. If anything about server actions or forms is unclear, read `node_modules/next/dist/docs/01-app` before changing an approach.
- **Do not commit `.env.local`.** Only `.env.example` is committed.
- The pre-existing uncommitted changes in the working tree (DESIGN.md, several components, `ApplicationRow.tsx`) are unrelated to this feature — do not fold them into these commits.
