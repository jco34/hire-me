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
export const DUPLICATE_TITLE_THRESHOLD = 0.75;

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
  if (title.trim() === "") return null;

  let best: DuplicateMatch | null = null;

  for (const candidate of candidates) {
    const score = titleSimilarity(title, candidate.title);
    if (score >= DUPLICATE_TITLE_THRESHOLD && (!best || score > best.score)) {
      best = { ...candidate, score };
    }
  }

  return best;
}
