# Duplicate detection (phase 2)

**Date:** 2026-08-08
**Status:** Approved design, pending implementation plan

## Problem

The README frames phase 2 as "paste screenshots or text of a job listing, have the fields
extracted, review and confirm before saving, with duplicate detection" — but the paste-to-fill
plan and spec ([`2026-08-08-paste-to-fill-ingestion-design.md`](2026-08-08-paste-to-fill-ingestion-design.md))
never covered it, and no dedup logic exists anywhere in the code. Nothing today stops the same
listing from being pasted twice, or a role from being added again after it was already saved by
hand. This closes that gap.

## Governing requirements

- After a paste-to-fill extraction fills the form, check whether the resulting company + title
  looks like an application that already exists for this user.
- The check is a **warning, not a gate**: nothing is ever blocked. The user can always save
  regardless of the outcome, consistent with the rest of the app's review-before-save
  philosophy.
- Matching is **same company (exact, case-insensitive)** and **similar title (fuzzy)** — not a
  fuzzy company match, and not triggered by manual (non-paste) form entry.
- No new dependencies and no new Postgres extension. At this app's scale (one user, at most a
  few hundred rows), an in-process JS comparison over a handful of candidate rows is enough.

## Approach

Reuse the same architectural split the paste-to-fill feature already established: a pure
domain module for the comparison logic, a scoped read query for candidates, and a `"use
server"` action the client calls directly. The trigger point is `ApplicationForm`'s existing
`onExtracted` handler, which already runs right after a paste-to-fill extraction fills the
form.

## Components

### `src/lib/domain/duplicate.ts` (new, pure)

Mirrors `src/lib/domain/ingest.ts`: no SDK, no `server-only`, isomorphic and unit-verifiable.

- `titleSimilarity(a: string, b: string): number` — Sørensen–Dice coefficient over character
  bigrams, case-insensitive, whitespace-normalized. Zero dependencies, cheap, and tolerant of
  reordering and minor wording differences ("Senior Backend Engineer" vs "Sr. Backend
  Engineer").
- `DUPLICATE_TITLE_THRESHOLD = 0.6` — exported constant; a score at or above this counts as a
  likely duplicate.
- `findLikelyDuplicate(title: string, candidates: { id: string; title: string; companyName:
  string }[]): { id: string; title: string; companyName: string; score: number } | null` —
  returns the highest-scoring candidate at or above the threshold, or `null` if none qualifies
  or the candidate list is empty.

### `src/lib/queries/applications.ts` (add one function)

- `applicationsForCompanyName(companyName: string): Promise<{ id: string; title: string;
  companyName: string }[]>` — scoped by `currentUserId()`. Matches the company by the same
  case-insensitive predicate `resolveCompanyId` already uses (`lower(companies.name) =
  lower(companyName)`), joins to that company's applications. A company that doesn't exist yet
  returns `[]` immediately, since a brand-new company can't have an existing duplicate.

### `src/lib/actions/duplicates.ts` (new `"use server"` module)

- `checkForDuplicate(formData: FormData): Promise<ActionResult<DuplicateMatch | null>>` — reads
  `companyName` and `title` from the `FormData`. Empty/whitespace-only input short-circuits to
  `{ ok: true, data: null }` (nothing to check). Otherwise calls
  `applicationsForCompanyName`, then `findLikelyDuplicate`, and returns the result. Any
  unexpected failure (DB error) is caught and also returns `{ ok: true, data: null }` — this
  check fails open and silent, per the error-handling section below.
- `type DuplicateMatch = { id: string; title: string; companyName: string; score: number }`

### `ApplicationForm` change

`src/app/applications/ApplicationForm.tsx` already owns `formRef` and the `onExtracted`
handler passed to `IngestPanel`. That handler is extended:

1. `restoreValues(formRef.current, values)` (unchanged).
2. Clear any previous duplicate banner.
3. Read the **current** `companyName` and `title` values directly off `formRef.current`
   (not just the freshly extracted `values`) — so a company/title the user had already typed
   by hand before pasting still gets checked once the paste fills the rest of the form.
4. If both are non-empty, build a small `FormData` and call `checkForDuplicate` inside a
   `useTransition`.
5. On a non-null result, store it in state and render the banner.

The check fires once, right after an extraction. It is not wired to manual field edits, blur
events, or the save action.

### Duplicate banner (inline in `ApplicationForm`, no new component)

Rendered near the top of the form, below the `IngestPanel` region and above "the role"
fieldset, matching the existing form-level error convention already used in
[`ActionForm.tsx`](../../../src/components/app/ActionForm.tsx) (hairline left rule, `t-body`,
matte — no new visual pattern):

```
Looks like you may have already added this one — <link>Senior Backend Engineer at Acme Corp</link>.
```

- `role="status"` (not `role="alert"`) — this is informational, not an error.
- The link points to `/applications/[id]` and opens in a new tab (`target="_blank"`), so
  checking it never discards the in-progress pasted/filled form, which has no draft
  persistence.
- No dismiss control needed: the banner is purely informational and disappears on its own the
  next time `onExtracted` fires (or is simply ignored — save is never blocked by its presence).

## Error handling

The check is a nicety layered on top of a working manual/paste-fill flow, not a correctness
gate. It fails open and silent:

- Empty company or title → no check, no banner.
- No matching company → no check, no banner (handled by the query returning `[]`).
- No title at or above the threshold → no banner.
- Any unexpected error (DB, action failure) → no banner, no error message shown. The user is
  never blocked or alarmed by a check they didn't ask for.

## Limits

- Candidate set per check is bounded by however many applications the user has at one company
  — realistically a handful, never a full-table scan.
- No pagination or caching needed at this data scale.

## Design-system conformance (DESIGN.md)

- Banner reuses the existing form-level message pattern (hairline left rule, reading face,
  matte) rather than introducing a new alert/toast pattern.
- No new lifted capsule is introduced — the banner is inline text with one inline link, so the
  "one lifted capsule per region" rule (DESIGN.md section 7) is untouched.
- No new motion.

## Testing

No test runner is configured in the project (same constraint as the paste-to-fill feature).
Verification is:

- `titleSimilarity` and `findLikelyDuplicate` are pure functions, verified with an inline `npx
  tsx` assertion the same way `ingest.ts`'s mapper is.
- End-to-end in the browser via the dev server: paste a listing whose company + title closely
  matches an existing application (exact wording, then a near-miss wording/casing) → confirm
  the banner appears with the correct link and target company/title; paste a listing for a
  genuinely new company or a dissimilar title → confirm no banner appears; confirm save
  succeeds in both cases (the check never blocks it).

## Out of scope (deferred)

- Fuzzy **company** name matching. Two existing rows like "Acme" and "Acme Corp" are treated as
  different companies, matching the exact/case-insensitive semantics `resolveCompanyId`
  already enforces elsewhere. Reconciling near-duplicate companies is a separate,
  data-quality-shaped problem.
- Triggering the check from manual (non-paste) company/title entry.
- Any confirm-to-proceed gate or disabled save button.
- Persisting or logging past duplicate-check results.

## Open items to confirm at build time

- Confirm the Dice-bigram threshold of `0.6` reads sensibly against a few real listings during
  browser verification; adjust the constant if it's clearly too loose or too strict — it's a
  single exported number, not a structural decision.
