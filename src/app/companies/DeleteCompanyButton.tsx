"use client";

import { useRouter } from "next/navigation";

import { ActionForm } from "@/components/app/ActionForm";
import { FlatButton } from "@/components/ui/Capsule";
import { Dialog, useDialog } from "@/components/ui/Dialog";
import { deleteCompany } from "@/lib/actions/companies";
import type { ActionResult } from "@/lib/validation";

/**
 * Delete is its own client island rather than a form inlined in a list row: the list
 * page is a server component, and `ActionForm`'s render-prop children are a function,
 * which cannot cross the server/client boundary as a prop. So the trigger, the
 * confirmation `Dialog`, and the form that calls `deleteCompany` all live together in
 * this one "use client" module.
 *
 * Deleting is refused server-side while the company still has applications (see the
 * comment on `deleteCompany`), and that refusal is a normal field error surfaced by
 * `ActionForm` inside the dialog, not a thrown exception or a silent no-op.
 */
export function DeleteCompanyButton({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  // Destructured to bare identifiers rather than kept as `dialog.ref` / `dialog.open`.
  // The eslint-plugin-react-hooks `refs` rule (part of the React Compiler tooling) can
  // trace a ref's provenance through a direct `useRef()` result or a destructured
  // identifier from a hook call, but not through a member-access expression on the
  // hook's return object — `dialog.ref` reads as "maybe accessed during render" to its
  // static analysis even though it never is. This is the same object, just bound
  // differently, so it changes nothing at runtime.
  const { ref, open, close } = useDialog();
  const router = useRouter();

  // `deleteCompany` only reports success or failure. Closing the dialog and refreshing
  // the server-rendered list once the row is actually gone is this component's job.
  async function handleDelete(formData: FormData): Promise<ActionResult<null>> {
    const result = await deleteCompany(formData);
    if (result.ok) {
      close();
      router.refresh();
    }
    return result;
  }

  return (
    <>
      <FlatButton type="button" onClick={() => open()}>
        delete
      </FlatButton>

      <Dialog ref={ref} title="delete company" closeLabel="cancel">
        <ActionForm action={handleDelete} submitLabel="delete company">
          <input type="hidden" name="id" value={companyId} />
          <p className="t-body text-ink">
            Delete {companyName}? This removes the company. It cannot be undone.
          </p>
        </ActionForm>
      </Dialog>
    </>
  );
}
