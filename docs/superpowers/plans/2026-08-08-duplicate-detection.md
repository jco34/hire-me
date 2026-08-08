# Duplicate Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a paste-to-fill extraction fills the add-application form, warn (non-blocking) when the company + title looks like an application the user already has.

**Architecture:** A pure domain module compares the freshly-filled title against this user's existing applications at the same (exact, case-insensitive) company using a dependency-free Dice-coefficient string similarity. A scoped read query fetches the candidate rows. A `"use server"` action wires the two together and is called by `ApplicationForm` right after its existing `onExtracted` handler fills the form, rendering an inline, dismissible-by-ignoring banner with a link to the existing application. Save is never blocked.

**Tech Stack:** Next.js 16.3 (server actions), React 19 (`useTransition`), Drizzle (existing `applications`/`companies` tables, no schema change), zod (unchanged, not used by this feature), Tailwind 4 (existing form-message classes only).

## Global Constraints

- Matching is **same company (exact, case-insensitive)** + **similar title (fuzzy)**. Company matching reuses the exact predicate `resolveCompanyId` already uses (`lower(companies.name) = lower(companyName)`) — no fuzzy company matching.
- The check is a **warning, not a gate**. Save must never be blocked or require confirmation.
- The check fires **once, automatically, right after a paste-to-fill extraction** fills the form. It is not wired to manual field edits, blur events, or the save action.
- No new dependencies, no new Postgres extension. The similarity function is written by hand (Sørensen–Dice coefficient over character bigrams).
- The check **fails open and silent**: any error (DB failure, bad input) results in no banner and no error message — never an alarming message for a check the user didn't ask for.
- `DUPLICATE_TITLE_THRESHOLD = 0.6` is the initial similarity cutoff, exported as a named constant so it can be tuned without touching logic.
- The project has **no test runner**. "Tests" here are: the comparison functions verified with an inline `npx tsx` assertion (same convention as `src/lib/domain/ingest.ts`), plus `npm run typecheck`, `npm run lint`, and browser verification.

---

### Task 1: Pure similarity/matching domain module

**Files:**
- Create: `src/lib/domain/duplicate.ts`

**Interfaces:**
- Consumes: nothing (no imports beyond the language itself — stays free of the DB, zod, and any SDK, exactly like `src/lib/domain/ingest.ts`).
- Produces:
  - `DUPLICATE_TITLE_THRESHOLD: number`
  - `type DuplicateCandidate = { id: string; title: string; companyName: string }`
  - `type DuplicateMatch = DuplicateCandidate & { score: number }`
  - `titleSimilarity(a: string, b: string): number` — 0 to 1.
  - `findLikelyDuplicate(title: string, candidates: DuplicateCandidate[]): DuplicateMatch | null`

- [ ] **Step 1: Write the module**

Create `src/lib/domain/duplicate.ts`:

```ts
/**
 * Duplicate detection compares a freshly paste-filled application against this user's
 * existing applications at the same company. This module is the pure half: string
 * similarity and the best-match search. It imports nothing — no DB, no zod, no SDK — so
 * it stays isomorphic and directly testable, exactly like `ingest.ts`.
 *
 * Company matching is exact and case-insensitive (done by the caller's query, matching
 * `resolveCompanyId`'s own predicate). Title matching is fuzzy, since re-postings and
 * hand-typed titles rarely match a stored title byte-for-byte.
 */

/** A score at or above this counts as a likely duplicate. Tune here; nothing else changes. */
export const DUPLICATE_TITLE_THRESHOLD = 0.6;

export type DuplicateCandidate = { id: string; title: string; companyName: string };
export type DuplicateMatch = DuplicateCandidate & { score: number };

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function bigrams(value: string): string[] {
  if (value.length === 0) return [];
  if (value.length === 1) return [value];

  const grams: string[] = [];
  for (let i = 0; i < value.length - 1; i++) {
    grams.push(value.slice(i, i + 2));
  }
  return grams;
}

/**
 * Sørensen–Dice coefficient over character bigrams: cheap, dependency-free, and
 * tolerant of minor wording/casing differences ("Senior Backend Engineer" vs "Sr.
 * Backend Engineer") without needing a real NLP dependency for two short strings.
 */
export function titleSimilarity(a: string, b: string): number {
  const gramsA = bigrams(normalize(a));
  const gramsB = bigrams(normalize(b));

  if (gramsA.length === 0 && gramsB.length === 0) return 1;
  if (gramsA.length === 0 || gramsB.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const gram of gramsA) counts.set(gram, (counts.get(gram) ?? 0) + 1);

  let matches = 0;
  for (const gram of gramsB) {
    const remaining = counts.get(gram) ?? 0;
    if (remaining > 0) {
      matches += 1;
      counts.set(gram, remaining - 1);
    }
  }

  return (2 * matches) / (gramsA.length + gramsB.length);
}

/** The highest-scoring candidate at or above the threshold, or null if none qualifies. */
export function findLikelyDuplicate(
  title: string,
  candidates: DuplicateCandidate[],
): DuplicateMatch | null {
  let best: DuplicateMatch | null = null;

  for (const candidate of candidates) {
    const score = titleSimilarity(title, candidate.title);
    if (score >= DUPLICATE_TITLE_THRESHOLD && (!best || score > best.score)) {
      best = { ...candidate, score };
    }
  }

  return best;
}
```

- [ ] **Step 2: Smoke-test the module with tsx**

This module has no `@/` imports, so it needs no path-alias resolution and should run cleanly under `tsx`.

```bash
cd "C:/Personal Projects/hire-me" && npx tsx -e "import { titleSimilarity, findLikelyDuplicate, DUPLICATE_TITLE_THRESHOLD } from './src/lib/domain/duplicate.ts'; const ok = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } }; ok(titleSimilarity('Senior Backend Engineer', 'Senior Backend Engineer') === 1, 'identical strings score 1'); ok(titleSimilarity('Senior Backend Engineer', 'Sr. Backend Engineer') >= DUPLICATE_TITLE_THRESHOLD, 'near-miss wording scores above threshold'); ok(titleSimilarity('Senior Backend Engineer', 'Frontend Designer') < DUPLICATE_TITLE_THRESHOLD, 'unrelated titles score below threshold'); ok(titleSimilarity('Backend Engineer', 'BACKEND   engineer') === 1, 'case and whitespace are normalized'); const candidates = [ { id: 'a', title: 'Frontend Designer', companyName: 'Acme' }, { id: 'b', title: 'Senior Backend Engineer', companyName: 'Acme' } ]; const match = findLikelyDuplicate('Sr. Backend Engineer', candidates); ok(match !== null && match.id === 'b', 'finds the right candidate'); ok(findLikelyDuplicate('Totally Different Role', candidates) === null, 'returns null when nothing qualifies'); ok(findLikelyDuplicate('anything', []) === null, 'returns null for an empty candidate list'); console.log('OK');"
```
Expected: prints `OK`.

- [ ] **Step 3: Typecheck**

```bash
cd "C:/Personal Projects/hire-me" && npm run typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "C:/Personal Projects/hire-me" && git add src/lib/domain/duplicate.ts && git commit -m "feat: pure duplicate-title similarity and matching"
```

---

### Task 2: Candidate query

**Files:**
- Modify: `src/lib/queries/applications.ts:203` (insert a new exported function after `getApplication`, before the `applicationFilterFacets` comment block)

**Interfaces:**
- Consumes: `applications`, `companies` from `@/lib/db/schema`; `currentUserId` from `@/lib/auth`; `and`, `eq`, `sql` from `drizzle-orm` (all already imported at the top of this file — no new imports needed).
- Produces: `applicationsForCompanyName(companyName: string): Promise<{ id: string; title: string; companyName: string }[]>`

- [ ] **Step 1: Add the function**

In `src/lib/queries/applications.ts`, insert this after the closing brace of `getApplication` (line 203) and before the `/** Values actually present in the user's data. */` comment that precedes `applicationFilterFacets`:

```ts
/**
 * Candidate applications for a duplicate check: this user's applications at a company
 * matched by the same case-insensitive predicate `resolveCompanyId` uses. A company
 * name with no match returns an empty array immediately — a brand-new company cannot
 * already have a duplicate.
 */
export async function applicationsForCompanyName(
  companyName: string,
): Promise<{ id: string; title: string; companyName: string }[]> {
  const userId = await currentUserId();

  return db
    .select({ id: applications.id, title: applications.title, companyName: companies.name })
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .where(
      and(eq(applications.userId, userId), sql`lower(${companies.name}) = lower(${companyName})`),
    );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "C:/Personal Projects/hire-me" && npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Lint**

```bash
cd "C:/Personal Projects/hire-me" && npm run lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "C:/Personal Projects/hire-me" && git add src/lib/queries/applications.ts && git commit -m "feat: query for a user's applications at a matching company name"
```

---

### Task 3: The duplicate-check server action

**Files:**
- Create: `src/lib/actions/duplicates.ts`

**Interfaces:**
- Consumes: `findLikelyDuplicate`, `type DuplicateMatch` from `@/lib/domain/duplicate`; `applicationsForCompanyName` from `@/lib/queries/applications`; `type ActionResult` from `@/lib/validation`.
- Produces: `checkForDuplicate(formData: FormData): Promise<ActionResult<DuplicateMatch | null>>` — the single-arg action the client calls directly.

- [ ] **Step 1: Write the action**

Create `src/lib/actions/duplicates.ts`:

```ts
"use server";

import { findLikelyDuplicate, type DuplicateMatch } from "@/lib/domain/duplicate";
import { applicationsForCompanyName } from "@/lib/queries/applications";
import type { ActionResult } from "@/lib/validation";

/**
 * Best-effort duplicate check, run once right after a paste-to-fill extraction fills
 * the form. This never blocks a save and never surfaces an error: any failure here
 * (bad input, a DB hiccup) simply returns no match, since the user never asked for this
 * check by name and shouldn't be alarmed by it misfiring.
 */
export async function checkForDuplicate(
  formData: FormData,
): Promise<ActionResult<DuplicateMatch | null>> {
  const companyName = (formData.get("companyName") ?? "").toString().trim();
  const title = (formData.get("title") ?? "").toString().trim();

  if (companyName === "" || title === "") {
    return { ok: true, data: null };
  }

  try {
    const candidates = await applicationsForCompanyName(companyName);
    return { ok: true, data: findLikelyDuplicate(title, candidates) };
  } catch {
    return { ok: true, data: null };
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "C:/Personal Projects/hire-me" && npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Lint**

```bash
cd "C:/Personal Projects/hire-me" && npm run lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "C:/Personal Projects/hire-me" && git add src/lib/actions/duplicates.ts && git commit -m "feat: server action to check a paste-filled application for duplicates"
```

---

### Task 4: Wire the check and banner into the form

**Files:**
- Modify: `src/app/applications/ApplicationForm.tsx`

**Interfaces:**
- Consumes: `checkForDuplicate` from `@/lib/actions/duplicates`; `type DuplicateMatch` from `@/lib/domain/duplicate`.
- Produces: no new exports — internal wiring only.

- [ ] **Step 1: Add imports**

In `src/app/applications/ApplicationForm.tsx`, add to the existing `react` import (line 5) and add two new imports near the other `@/lib` imports:

Change:
```tsx
import { useActionState, useEffect, useRef } from "react";
```
to:
```tsx
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
```

Add after the `IngestPanel` import (line 7):
```tsx
import { checkForDuplicate } from "@/lib/actions/duplicates";
import type { DuplicateMatch } from "@/lib/domain/duplicate";
```

- [ ] **Step 2: Add state and the extraction handler**

Inside the `ApplicationForm` component, immediately after the existing `const formRef = useRef<HTMLFormElement>(null);` line, add:

```tsx
const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
const [, startDuplicateCheck] = useTransition();

const handleExtracted = (values: FormValues) => {
  const form = formRef.current;
  restoreValues(form, values);
  setDuplicate(null);
  if (!form) return;

  // Read the form's current values (not just the freshly extracted ones), so a
  // company/title the user already typed by hand before pasting still gets checked.
  const submitted = new FormData(form);
  const hasCompanyAndTitle =
    submitted.get("companyName")?.toString().trim() &&
    submitted.get("title")?.toString().trim();
  if (!hasCompanyAndTitle) return;

  startDuplicateCheck(async () => {
    const result = await checkForDuplicate(submitted);
    if (result.ok && result.data) setDuplicate(result.data);
  });
};
```

- [ ] **Step 3: Use the new handler and render the banner**

Replace:
```tsx
      {ingest ? (
        // Its own region, held apart from the form's save capsule by section spacing so
        // the "one lifted capsule per region" rule holds (DESIGN.md 7).
        <div className="mb-s5">
          <IngestPanel onExtracted={(values) => restoreValues(formRef.current, values)} />
        </div>
      ) : null}

      {application ? <input type="hidden" name="id" value={application.id} /> : null}
```
with:
```tsx
      {ingest ? (
        // Its own region, held apart from the form's save capsule by section spacing so
        // the "one lifted capsule per region" rule holds (DESIGN.md 7).
        <div className="mb-s5">
          <IngestPanel onExtracted={handleExtracted} />
        </div>
      ) : null}

      {duplicate ? (
        <p className="t-body border-l-2 border-ink pl-s2 text-ink" role="status">
          Looks like you may have already added this one —{" "}
          <a
            href={`/applications/${duplicate.id}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {duplicate.title} at {duplicate.companyName}
          </a>
          .
        </p>
      ) : null}

      {application ? <input type="hidden" name="id" value={application.id} /> : null}
```

- [ ] **Step 4: Typecheck**

```bash
cd "C:/Personal Projects/hire-me" && npm run typecheck
```
Expected: no errors.

- [ ] **Step 5: Lint**

```bash
cd "C:/Personal Projects/hire-me" && npm run lint
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd "C:/Personal Projects/hire-me" && git add src/app/applications/ApplicationForm.tsx && git commit -m "feat: warn on likely duplicate right after a paste-to-fill extraction"
```

---

### Task 5: End-to-end browser verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server and seed an existing application**

Use the preview tool to run the dev server and navigate to `/applications/new`. If the seed data (`npm run db:seed`) doesn't already include an application at a known company/title, create one by hand first — e.g. company `Acme Corp`, title `Senior Backend Engineer` — and note its detail page loads at `/applications/<id>`.

- [ ] **Step 2: Verify an exact-title match triggers the banner**

On `/applications/new`, paste listing text for the same company and title, e.g.:

```
Senior Backend Engineer — Acme Corp (Remote, Philippines)
Full-time. PHP 120,000–160,000 per month.
```

Click **extract**. Expected: once the form fills, a banner appears reading "Looks like you may have already added this one — Senior Backend Engineer at Acme Corp." with a working link that opens the existing application's detail page in a new tab.

- [ ] **Step 3: Verify a near-miss title still matches**

Reload `/applications/new`. Paste text for the same company with a reworded title, e.g. `Sr. Backend Engineer, Acme Corp`. Click **extract**. Expected: the banner still appears (fuzzy match above the 0.6 threshold).

- [ ] **Step 4: Verify a dissimilar title does not match**

Reload `/applications/new`. Paste text for the same company (`Acme Corp`) but an unrelated title, e.g. `Marketing Intern`. Click **extract**. Expected: no banner.

- [ ] **Step 5: Verify a new company does not match**

Reload `/applications/new`. Paste text for a company that doesn't exist yet in this user's data, with any title. Click **extract**. Expected: no banner (the query returns no candidates for an unmatched company).

- [ ] **Step 6: Verify save is never blocked**

With the banner showing (repeat Step 2's paste), click **save application**. Expected: the application saves and redirects to its detail page exactly as before this feature — the duplicate warning never prevents or interrupts the save.

- [ ] **Step 7: Check console/network**

Use the preview tools to read console messages: no client-side errors from the new code path.

- [ ] **Step 8: Clean up any test applications**

Delete (via the app's own delete-with-confirmation flow) any application created purely for this verification, so no test data is left in the real database.

- [ ] **Step 9: Final commit if any verification tweaks were needed**

```bash
cd "C:/Personal Projects/hire-me" && git add -A && git commit -m "fix: duplicate-detection verification adjustments"
```
(Skip if nothing changed.)

---

## Notes for the implementer

- **AGENTS.md caveat:** this is a modified Next.js. Server-action and form patterns here mirror the existing `src/lib/actions/ingest.ts` and `ApplicationForm.tsx`, which already work against this version — do not "modernise" them from training-data habits. If anything about server actions or forms is unclear, read `node_modules/next/dist/docs/01-app` before changing an approach.
- The pure module in Task 1 has zero imports and needs no `@/` alias resolution, so its `tsx` smoke test should not hit the module-resolution caveat noted in the ingestion plan.
- Do not fold in unrelated changes from the working tree — check `git status` before each commit and stage only the files this plan names.
