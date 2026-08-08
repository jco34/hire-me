import { ApplicationForm } from "@/app/applications/ApplicationForm";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { createApplication } from "@/lib/actions/applications";

export default function NewApplicationPage() {
  return (
    <AppShell active="applications">
      <PageHeader title="add" kicker="paste a listing or fill it in" />
      <ApplicationForm
        action={createApplication}
        submitLabel="save application"
        cancelHref="/applications"
        ingest
      />
    </AppShell>
  );
}
