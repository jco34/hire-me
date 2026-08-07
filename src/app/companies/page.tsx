import Link from "next/link";

import { AppShell } from "@/components/app/AppShell";
import { DeleteCompanyButton } from "@/app/companies/DeleteCompanyButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { CapsuleLink } from "@/components/ui/Capsule";
import { PageHeader } from "@/components/ui/PageHeader";
import { listCompanies } from "@/lib/queries/companies";
import { daysSince } from "@/lib/domain/stale";

/**
 * Companies exist as their own records so three roles at one place group properly and
 * company-level observations live in one spot rather than being repeated on each
 * application.
 */

export default async function CompaniesPage() {
  const rows = await listCompanies();

  return (
    <AppShell active="companies">
      <PageHeader
        title="companies"
        kicker={rows.length === 1 ? "1 company" : `${rows.length} companies`}
      >
        <CapsuleLink href="/applications/new">add an application</CapsuleLink>
      </PageHeader>

      <div className="mt-s3">
        {rows.length === 0 ? (
          <EmptyState
            headline="no companies yet"
            body="Companies are created for you when you add an application. There is nothing to fill in here first."
            action={<CapsuleLink href="/applications/new">add an application</CapsuleLink>}
          />
        ) : (
          <ul className="flex flex-col">
            {rows.map(({ company, applicationCount, lastActivityAt }) => {
              const quietFor = daysSince(lastActivityAt);
              return (
                <li
                  key={company.id}
                  className="flex flex-wrap items-baseline justify-between gap-s2 border-t border-[color-mix(in_srgb,var(--muted)_40%,transparent)] py-s2"
                >
                  <div className="min-w-0">
                    <p className="t-body-lg text-ink">{company.name}</p>
                    {company.location ? (
                      <p className="t-micro">{company.location}</p>
                    ) : null}
                    {company.notes ? (
                      <p className="t-body max-w-[60ch] text-ink-soft">{company.notes}</p>
                    ) : null}
                  </div>

                  <div className="flex items-baseline gap-s3">
                    <span className="t-body text-ink-soft">
                      {applicationCount === 1
                        ? "1 application"
                        : `${applicationCount} applications`}
                    </span>
                    {quietFor !== null ? (
                      <span className="t-body text-ink-soft">{quietFor}d</span>
                    ) : null}
                    {company.website ? (
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="t-micro text-ink-soft underline underline-offset-4 hover:text-ink"
                      >
                        site
                      </a>
                    ) : null}
                    <Link
                      href={`/applications?search=${encodeURIComponent(company.name)}`}
                      className="t-micro text-ink-soft transition-colors duration-150 ease-[ease] hover:text-ink"
                    >
                      view
                    </Link>
                    <Link
                      href={`/companies/${company.id}/edit`}
                      className="t-micro text-ink-soft transition-colors duration-150 ease-[ease] hover:text-ink"
                    >
                      edit
                    </Link>
                    <DeleteCompanyButton companyId={company.id} companyName={company.name} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
