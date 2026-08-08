# Paste-to-fill ingestion (phase 2)

**Date:** 2026-08-08
**Status:** Approved design, pending implementation plan

## Problem

Adding an application today is a fully manual form ([`src/app/applications/new/page.tsx`](../../../src/app/applications/new/page.tsx)). DESIGN.md section 8 always intended a paste-to-fill flow — "user-pasted job screenshots ... appear in the ingestion review screen" — but phase 1 shipped without it and left a `"comes in phase 2"` note in the empty state. This is that phase 2: paste a job listing as **text or screenshots**, have the fields filled automatically, and keep final say to edit or save.

## Governing requirements

- Paste **text** and/or one or more **screenshots**; fields fill automatically.
- The user always reviews and edits before anything is saved. **Nothing is written to the database until the user clicks save.**
- Extraction uses the **Gemini API on the Google AI Studio free tier** (multimodal Flash model reads both images and text).
- Screenshots are used for extraction only and then discarded — **no image storage, no detail-panel viewer** in this phase (DESIGN.md section 8's "evidence in the detail panel" is deferred).

## Approach

Reuse the existing uncontrolled form. The form's inputs are named and uncontrolled, and [`preserveValues.ts`](../../../src/components/app/preserveValues.ts) already contains `restoreValues(form, values)`, which sets each named field from a `Record<string, string[]>`. Extraction produces exactly that shape, so filling the form is the same mechanism already in the codebase — no new state model, no controlled inputs.

## Components

### `IngestPanel` (new client component)
`src/app/applications/IngestPanel.tsx`

- A `<textarea>` for pasted listing text.
- An image paste/drop zone: accepts clipboard image paste and file selection, renders thumbnails, allows removing an image. Capped (see Limits).
- An **extract** button — the single lifted capsule of this region.
- A status/error line in the reading face (`t-body`).
- Self-contained: it owns the pasted text + image list, calls the extraction action, and emits `onExtracted(values: FormValues)` plus `onError(message)`. It does not know about the form.

### `ApplicationForm` change
`src/app/applications/ApplicationForm.tsx`

- Add one optional prop, `ingest?: boolean`. When true, render `IngestPanel` above the fieldsets so it shares the existing `formRef`.
- On `onExtracted`, fill the form by reusing the `restoreValues` logic against `formRef.current`. Because extraction only returns keys it actually found, fields the user already typed are left untouched. Re-extracting overwrites the fields that come back.
- The edit page (`[id]/edit/page.tsx`) passes nothing, so its behaviour is unchanged.

### `NewApplicationPage` change
`src/app/applications/new/page.tsx` passes `ingest` to the form. Kicker copy updated (no longer "a new application" only — reflect the paste capability, e.g. `"paste a listing or fill it in"`).

## Extraction (server)

New file `src/lib/actions/ingest.ts` with `"use server"`:

```
extractApplicationFields(
  prev: ActionResult<FormValues> | null,
  formData: FormData,   // { text?: string, images?: File[] }
): Promise<ActionResult<FormValues>>
```

Steps:
1. Read `GEMINI_API_KEY` from `process.env`. Missing → `actionError("Add a GEMINI_API_KEY to .env.local to use paste-to-fill.")`.
2. Reject empty input (no text and no images) with a readable message.
3. Build a Gemini request via the official `@google/genai` SDK targeting **`gemini-2.5-flash`** (multimodal). Text goes in as a text part; each image goes in as an inline base64 part. A `responseSchema` (JSON object) forces structured output.
4. Instruction prompt: "Extract job-listing fields from the following content. Only fill a field if the content clearly states it. Return the allowed enum tokens exactly. Summarise the description to one or two lines, not the full posting." The prompt names the exact enum tokens for `employmentType`, `workSetup`, `salaryPeriod`.
5. Parse the model's JSON, re-validate with a dedicated zod schema `ingestExtractionSchema` (every field optional/nullable, enums constrained to the same tokens as `validation.ts`).
6. Convert the validated object to `FormValues` (string map) via a **pure function** `extractionToFormValues(parsed)` — kept pure so it is unit-testable without a runner. Booleans map to the checkbox convention (`salaryNotDisclosed` present as `"on"` only when true; omitted otherwise). Numbers stringify.
7. Return `{ ok: true, data: formValues }`.

### Fields extracted
`companyName`, `title`, `description` (1–2 line summary), `url`, `source`, `employmentType` (enum), `workSetup` (enum), `location`, `salaryMin`, `salaryMax`, `salaryCurrency` (3-letter), `salaryPeriod` (enum), `salaryRaw`, `salaryNotDisclosed` (bool).

**Not extracted:** `stage`, `outcome`, `appliedAt`, `followUpAt`. These are the user's own tracking state, not part of a listing, so they keep the form defaults (`saved` / `active`).

## Error handling

Every failure path returns an `ActionResult` error with a human-readable message rendered on the panel's status line; the form stays fully editable by hand:

- Missing API key.
- Empty input.
- Network / SDK error.
- Rate limit (HTTP 429) → a specific "hit the free-tier limit, try again in a moment" message.
- Model returned unparseable or schema-invalid JSON → "couldn't read that listing, fill it in by hand".

Partial extraction is success: fill whatever came back, leave the rest.

## Safety

- The Gemini API key lives only in the server env and is used only inside the server action; it is never sent to the client.
- Pasted listings are untrusted content, but the action only **extracts**. Output is constrained by `responseSchema` and re-validated by zod, and the user reviews every field before saving. A prompt-injected listing can at worst place junk in visible, editable fields — it cannot reach the database unreviewed or execute anything.
- The existing `optionalUrl` validation (http/https only) still guards the `url` field at save time, so an extracted `javascript:`/`data:` URL is rejected on save exactly as a typed one would be.

## Limits

- Max images per extraction: **6**.
- Max size per image: **5 MB** (rejected client-side with a message before upload).
- These protect both the request size and the free-tier quota.

## Design-system conformance (DESIGN.md)

- Panel uses the shared vocabulary: hairline `--muted` border, `--r-md` corners, matte flat fill, reading face for all text a user reads.
- **One lifted capsule per region:** the **extract** button is the lifted capsule of the ingest region; the form's **save application** button is the lifted capsule of the form region. They are separated by section-level spacing (`--s-5`) so the two read as distinct regions, satisfying section 7.
- Motion follows the existing form patterns; entrance and state transitions use the established tokens and are dropped under `prefers-reduced-motion` (section 9).
- Thumbnails of pasted screenshots are shown in hairline-bordered, rounded, matte frames, never bled (section 8's framing rule), even though the images are not persisted.

## Environment & dependency changes

- Add `@google/genai` to `package.json` dependencies.
- Add `GEMINI_API_KEY=` to `.env.local` (user supplies their own free-tier key from Google AI Studio). Document it (README / AGENTS note or a `.env.example` entry).

## Copy cleanup

- `src/app/applications/page.tsx` empty state: replace "Pasting a listing to fill these fields in comes in phase 2." with copy that points to the now-live feature.
- `src/app/applications/new/page.tsx` kicker: reflect the paste capability.

## Testing

No test runner is configured in the project. Verification is:

- `extractionToFormValues` is written as a pure function so it can be unit-tested if/when a runner is added.
- End-to-end in the browser via the dev server: paste sample listing text → confirm the correct fields fill and untouched fields stay empty; remove/exceed image limits → confirm the client-side guard; unset `GEMINI_API_KEY` → confirm the clean missing-key message; force a failure → confirm the form is still usable by hand.

## Out of scope (deferred)

- Persisting screenshots and showing them as evidence in the detail panel (DESIGN.md section 8, second half).
- A two-step wizard / dedicated review route.
- Any non-Gemini extraction backend.

## Open items to confirm at build time

- Exact `@google/genai` call shape for multimodal input + `responseSchema` (confirm against current SDK docs).
- Exact current free-tier Flash model id (`gemini-2.5-flash` assumed).
