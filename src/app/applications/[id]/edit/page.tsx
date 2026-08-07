import { notFound } from "next/navigation";

import { ApplicationForm } from "@/app/applications/ApplicationForm";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { updateApplication } from "@/lib/actions/applications";
import { getApplication } from "@/lib/queries/applications";

export default async function EditApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getApplication(id);
  if (!detail) notFound();

  return (
    <AppShell active="applications">
      <PageHeader title="edit" kicker={`${detail.company.name} / ${detail.application.title}`} />
      <ApplicationForm
        action={updateApplication}
        application={detail.application}
        companyName={detail.company.name}
        submitLabel="save changes"
        cancelHref={`/applications/${id}`}
      />
    </AppShell>
  );
}
