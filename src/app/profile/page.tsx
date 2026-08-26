import { ResumeComposer } from "@/app/profile/ResumeComposer";
import {
  ActivateResumeButton,
  DeleteResumeButton,
} from "@/app/profile/ResumeVersionActions";
import { AppShell } from "@/components/app/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { listResumes, type ResumeListRow } from "@/lib/queries/resumes";

/**
 * Your resume, which is the other half of every match score.
 *
 * The page exists because a score is only as good as what it was measured against, and
 * that document used to be reachable only through `npm run resume:import`. Versions are
 * kept rather than overwritten so a score can still name the resume that produced it —
 * see `matchResumeId` in `schema.ts`.
 */

const HAIRLINE = "border-[color-mix(in_srgb,var(--muted)_40%,transparent)]";

const formatDate = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
};

export default async function ProfilePage() {
  const rows = await listResumes();
  const active = rows.find((row) => row.resume.isActive) ?? null;
  const earlier = rows.filter((row) => !row.resume.isActive);

  return (
    <AppShell active="profile">
      <PageHeader
        title="profile"
        kicker={rows.length === 1 ? "1 resume" : `${rows.length} resumes`}
      />

      <div className="mt-s3 flex max-w-[900px] flex-col gap-s5">
        <section className="flex flex-col gap-s2">
          <h2 className="t-micro">in use</h2>
          {active ? (
            <ActiveResume row={active} />
          ) : (
            <EmptyState
              headline="no resume yet"
              body="Applications you add will fill their fields as usual, but nothing will be scored until there is a resume to score against."
            />
          )}
        </section>

        <ResumeComposer hasActive={active !== null} />

        {earlier.length > 0 ? (
          <section className="flex flex-col gap-s2">
            <h2 className="t-micro">earlier versions</h2>
            <ul className="flex flex-col">
              {earlier.map((row) => (
                <li
                  key={row.resume.id}
                  className={`flex flex-wrap items-baseline justify-between gap-s2 border-t ${HAIRLINE} py-s2`}
                >
                  <div className="min-w-0">
                    <p className="t-body text-ink">{row.resume.label}</p>
                    <p className="t-micro">
                      {formatDate(row.resume.createdAt)} · {row.resume.rawText.length}{" "}
                      characters · {scoredLabel(row.scoredCount)}
                    </p>
                  </div>
                  <div className="flex items-baseline gap-s2">
                    <ActivateResumeButton id={row.resume.id} />
                    <DeleteResumeButton
                      id={row.resume.id}
                      label={row.resume.label}
                      scoredCount={row.scoredCount}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function scoredLabel(count: number): string {
  if (count === 0) return "no scores";
  return count === 1 ? "1 score" : `${count} scores`;
}

function ActiveResume({ row }: { row: ResumeListRow }) {
  const { resume, scoredCount } = row;

  return (
    <div
      className={`flex flex-col gap-s2 rounded-[var(--r-md)] border p-s3 ${HAIRLINE} bg-surface`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-s2">
        <p className="t-body-lg text-ink">{resume.label}</p>
        <p className="t-micro">
          {formatDate(resume.createdAt)} · {resume.rawText.length} characters ·{" "}
          {scoredLabel(scoredCount)}
        </p>
      </div>

      {/* Collapsed by default. This is a reference copy, not something to read top to
          bottom, and expanded it would push the composer off the first screen. */}
      <details className="group">
        <summary className="t-micro cursor-pointer select-none transition-colors duration-150 ease-[ease] hover:text-ink">
          read what the scorer sees
        </summary>
        <pre
          className={`t-body mt-s2 max-h-[420px] overflow-auto rounded-[var(--r-sm)] border ${HAIRLINE} bg-bg p-s2 whitespace-pre-wrap text-ink`}
        >
          {resume.rawText}
        </pre>
      </details>
    </div>
  );
}
