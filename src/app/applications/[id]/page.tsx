import Link from "next/link";
import { notFound } from "next/navigation";

import { ContactRow } from "@/app/applications/[id]/ContactRow";
import { DeleteApplicationControl } from "@/app/applications/[id]/DeleteApplicationDialog";
import {
  ContactForm,
  FollowUpForm,
  NoteForm,
  OutcomeForm,
  StageForm,
} from "@/app/applications/[id]/DetailForms";
import { Timeline } from "@/app/applications/[id]/Timeline";
import { AppShell } from "@/components/app/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CapsuleLink } from "@/components/ui/Capsule";
import { EMPLOYMENT_TYPE_LABELS, MetaGrid, MetaItem, WORK_SETUP_LABELS } from "@/components/ui/Meta";
import { PageHeader } from "@/components/ui/PageHeader";
import { StageStrip } from "@/components/ui/StageStrip";
import { cn } from "@/lib/cn";
import { formatSalary } from "@/lib/domain/salary";
import { getApplication } from "@/lib/queries/applications";

/**
 * The detail panel.
 *
 * Everything about one application on one page: where it stands, what it pays, the
 * merged history, your notes, and who you have been talking to. The stage and outcome
 * controls are plain forms posting to server actions, so they work without JavaScript
 * and cannot get out of step with the row they describe.
 */

const formatDate =(value: Date | string | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getApplication(id);
  if (!detail) notFound();

  const { application, company, events, notes, contacts, staleness } = detail;

  return (
    <AppShell active="applications">
      <PageHeader title={company.name} kicker={application.title}>
        <DeleteApplicationControl id={id} />
        <CapsuleLink href={`/applications/${id}/edit`}>edit</CapsuleLink>
      </PageHeader>

      <div className="mt-s3 grid gap-s3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-s3">
          <section className="flex flex-col gap-s2">
            <StageStrip stage={application.stage} outcome={application.outcome} size="md" />
            <p
              className={cn(
                "t-body",
                staleness.stale ? "border-l-2 border-ink pl-s2 text-ink" : "text-ink-soft",
              )}
            >
              {staleness.stale
                ? `No activity for ${staleness.days} days.`
                : `Last activity ${staleness.days} days ago.`}
              {staleness.followUpDue ? " Follow up is due." : ""}
            </p>
          </section>

          <section className="flex flex-col gap-s2">
            <h2 className="t-micro">what it is</h2>
            <MetaGrid>
              <MetaItem label="salary" value={formatSalary(application)} />
              <MetaItem
                label="employment"
                value={
                  application.employmentType
                    ? EMPLOYMENT_TYPE_LABELS[application.employmentType]
                    : undefined
                }
              />
              <MetaItem
                label="setup"
                value={
                  application.workSetup ? WORK_SETUP_LABELS[application.workSetup] : undefined
                }
              />
              <MetaItem label="location" value={application.location ?? undefined} />
              <MetaItem label="applied" value={formatDate(application.appliedAt) ?? undefined} />
              <MetaItem label="source" value={application.source ?? undefined} />
              <MetaItem
                label="follow up"
                value={formatDate(application.followUpAt) ?? undefined}
              />
              <MetaItem
                label="posting"
                value={
                  application.url ? (
                    <a
                      href={application.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline underline-offset-4"
                    >
                      open
                    </a>
                  ) : undefined
                }
              />
            </MetaGrid>
            {application.description ? (
              <p className="t-body max-w-[70ch] text-ink">{application.description}</p>
            ) : null}
            {application.salaryRaw ? (
              <p className="t-body text-ink-soft">
                As written: {application.salaryRaw}
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-s2">
            <h2 className="t-micro">history</h2>
            <Timeline events={events} notes={notes} />
          </section>

          <section className="flex flex-col gap-s2">
            <h2 className="t-micro">add a note</h2>
            <NoteForm id={id} />
          </section>
        </div>

        <aside className="flex flex-col gap-s3">
          <Card>
            <CardHeader>
              <h2 className="t-micro">move it along</h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-s3">
              <StageForm id={id} stage={application.stage} />
              <OutcomeForm id={id} outcome={application.outcome} />
              <FollowUpForm id={id} followUpAt={application.followUpAt} />
            </CardBody>
          </Card>

          <section className="flex flex-col gap-s2">
            <h2 className="t-micro">who you are talking to</h2>
            {contacts.length === 0 ? (
              <p className="t-body text-ink-soft">No one recorded yet.</p>
            ) : (
              <ul className="flex flex-col gap-s2">
                {contacts.map((contact) => (
                  <ContactRow key={contact.id} contact={contact} />
                ))}
              </ul>
            )}

            <ContactForm id={id} />
          </section>

          <Link
            href="/applications"
            className="t-micro text-ink-soft transition-colors duration-150 ease-[ease] hover:text-ink"
          >
            back to all applications
          </Link>
        </aside>
      </div>
    </AppShell>
  );
}
