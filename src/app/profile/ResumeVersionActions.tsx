"use client";

import { useRouter } from "next/navigation";

import { ActionForm } from "@/components/app/ActionForm";
import { FlatButton } from "@/components/ui/Capsule";
import { Dialog, useDialog } from "@/components/ui/Dialog";
import { activateResume, deleteResume } from "@/lib/actions/resumes";
import type { ActionResult } from "@/lib/validation";

/**
 * Per-version controls, as one client island.
 *
 * Same reasoning as `DeleteCompanyButton`: the profile page is a server component and
 * `ActionForm`'s render-prop children cannot cross the boundary, so the triggers, the
 * confirmation dialog and the forms live together here.
 *
 * Deleting the active version is refused server-side, and that refusal surfaces in the
 * dialog as an ordinary field error.
 */

export function ActivateResumeButton({ id }: { id: string }) {
  const router = useRouter();

  async function handle(formData: FormData): Promise<ActionResult<null>> {
    const result = await activateResume(formData);
    if (result.ok) router.refresh();
    return result;
  }

  return (
    <ActionForm action={handle} submitLabel="use this one" variant="flat">
      <input type="hidden" name="id" value={id} />
    </ActionForm>
  );
}

export function DeleteResumeButton({
  id,
  label,
  scoredCount,
}: {
  id: string;
  label: string;
  /** Applications that name this version. They keep their score and lose the reference. */
  scoredCount: number;
}) {
  const { ref, open, close } = useDialog();
  const router = useRouter();

  async function handle(formData: FormData): Promise<ActionResult<null>> {
    const result = await deleteResume(formData);
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

      <Dialog ref={ref} title="delete this version" closeLabel="cancel">
        <ActionForm action={handle} submitLabel="delete version">
          <input type="hidden" name="id" value={id} />
          <p className="t-body text-ink">
            Delete {label}? This cannot be undone.
          </p>
          {scoredCount > 0 ? (
            <p className="t-body text-ink-soft">
              {scoredCount === 1
                ? "1 application was scored against it. It keeps its score"
                : `${scoredCount} applications were scored against it. They keep their scores`}
              , but will no longer say which resume produced them.
            </p>
          ) : null}
        </ActionForm>
      </Dialog>
    </>
  );
}
