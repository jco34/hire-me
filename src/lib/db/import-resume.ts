import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { and, eq, ne } from "drizzle-orm";

import { LOCAL_USER_ID } from "../auth";
import { db } from "./index";
import { insertActiveResume } from "./resume-store";
import { resumes } from "./schema";

// `./index` and `../auth` import the `server-only` marker, which throws unless the
// resolver runs with the `react-server` export condition. Next sets it; tsx does not, so
// `npm run resume:import` passes `--conditions=react-server`. Do not remove that flag.

/**
 * Load a resume into the database. Run with:
 *
 *   npm run resume:import -- private/resume/resume.txt "aug 2026"
 *
 * The file on disk stays the source of truth you edit and re-import from; the row is what
 * the scorer reads on every extraction. Keeping the source out of the repo matters — a
 * resume carries a home address and a phone number — so `private/` is gitignored and this
 * script is the bridge across that line.
 *
 * PDFs are not parsed here on purpose. Extract the text first, with:
 *
 *   pdftotext -layout -enc UTF-8 <file>.pdf <file>.txt
 *
 * The `-enc UTF-8` is not optional. Without it every bullet in the document comes back as
 * mojibake and the model reads a resume full of replacement characters.
 *
 * Importing makes the new row active and deactivates the previous one, which is what the
 * partial unique index `resumes_active_key` requires. Old rows are kept rather than
 * overwritten so a score can still name the resume that produced it.
 */

async function main(): Promise<void> {
  // `dotenv/config` takes its settings from argv, so the npm script's own
  // `dotenv_config_path=...` sits in front of anything the caller typed after `--`.
  // Filtering it out here keeps the usage line honest.
  const [pathArg, labelArg] = process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("dotenv_config_"));

  if (!pathArg) {
    console.error(
      "Usage: npm run resume:import -- <path-to-text-file> [label]\n" +
        "Extract a PDF first: pdftotext -layout -enc UTF-8 resume.pdf resume.txt",
    );
    process.exitCode = 1;
    return;
  }

  const path = resolve(pathArg);
  let rawText: string;
  try {
    rawText = readFileSync(path, "utf8").trim();
  } catch (error) {
    console.error(`Could not read ${path}: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
    return;
  }

  if (rawText.length < 200) {
    console.error(
      `${path} holds only ${rawText.length} characters. That is not a resume — check the ` +
        "extraction actually produced text rather than an empty file.",
    );
    process.exitCode = 1;
    return;
  }

  // A PDF read as UTF-8 rather than converted arrives as binary noise. Catching it here is
  // far kinder than discovering it as an unexplained 3% match score three weeks later.
  if (rawText.startsWith("%PDF")) {
    console.error(
      `${path} is a PDF, not text. Convert it first:\n` +
        `  pdftotext -layout -enc UTF-8 "${pathArg}" "${pathArg.replace(/\.pdf$/i, ".txt")}"`,
    );
    process.exitCode = 1;
    return;
  }

  const label = labelArg?.trim() || basename(path);

  const id = await insertActiveResume(LOCAL_USER_ID, label, rawText);

  const superseded = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.userId, LOCAL_USER_ID), ne(resumes.id, id)));

  console.log(
    `Imported "${label}" (${rawText.length} characters) as the active resume.` +
      (superseded.length > 0
        ? ` ${superseded.length} earlier version(s) kept, deactivated.`
        : ""),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
