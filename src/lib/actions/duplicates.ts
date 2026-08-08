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
