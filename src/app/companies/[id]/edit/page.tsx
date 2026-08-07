import { notFound } from "next/navigation";

import { CompanyForm } from "@/app/companies/CompanyForm";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { updateCompany } from "@/lib/actions/companies";
import { getCompany } from "@/lib/queries/companies";

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getCompany(id);
  if (!detail) notFound();

  return (
    <AppShell active="companies">
      <PageHeader title="edit" kicker={detail.company.name} />
      <CompanyForm action={updateCompany} company={detail.company} />
    </AppShell>
  );
}
