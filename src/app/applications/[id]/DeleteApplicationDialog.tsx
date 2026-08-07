"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";

import { Capsule, FlatButton } from "@/components/ui/Capsule";
import { Dialog, useDialog } from "@/components/ui/Dialog";
import { deleteApplication } from "@/lib/actions/applications";
import { FORM_ERROR_KEY, type ActionResult } from "@/lib/validation";

/**
 * Delete-application control: a flat trigger plus a confirmation dialog.
 *
 * Deleting an application is irreversible and cascades to its events, notes and
 * contacts, so it gets the dialog treatment rather than a bare button. `deleteApplication`
 * returns `ActionResult<null>`, not an id, so success is not "go somewhere new with the
 * data we got back" the way `ApplicationForm` redirects after a create or edit — it is
 * "go back to the list because this record is gone".
 *
 * The redirect is fired from inside the action itself rather than from a `useEffect`
 * watching the result, unlike `ApplicationForm.tsx`. This route is exactly the path
 * `deleteApplication` revalidates, so once the row is gone Next re-renders this same
 * segment through `notFound()` as part of the very same transition — which unmounts
 * this component before a follow-up effect would get a chance to run. Pushing the
 * navigation immediately, before that render lands, wins the race.
 */

export function DeleteApplicationControl({ id }: { id: string }) {
  // Destructured to bare identifiers rather than kept as `dialog.ref` / `dialog.open`.
  // The eslint-plugin-react-hooks `refs` rule (React Compiler tooling) can trace a
  // ref's provenance through a direct `useRef()` result or a destructured identifier
  // from a hook call, but not through a member-access expression on the hook's return
  // object, so `dialog.ref` reads as unsafe to its static analysis even though it never
  // runs during render. Same object, just bound differently; no behavior change.
  const { ref, open } = useDialog();
  const router = useRouter();

  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult<null> | null, formData: FormData) => {
      const result = await deleteApplication(formData);
      if (result.ok) router.push("/applications");
      return result;
    },
    null,
  );

  const error = state && !state.ok ? state.errors[FORM_ERROR_KEY]?.[0] : undefined;

  return (
    <>
      <FlatButton type="button" onClick={() => open()}>
        delete application
      </FlatButton>

      <Dialog
        ref={ref}
        title="delete this application"
        footer={
          <form action={formAction}>
            <input type="hidden" name="id" value={id} />
            <Capsule type="submit" disabled={pending}>
              {pending ? "deleting" : "delete"}
            </Capsule>
          </form>
        }
      >
        <p className="t-body text-ink">
          This removes the application, and its notes, contacts and history with it. This
          cannot be undone.
        </p>
        {error ? (
          <p className="t-body mt-s2 border-l-2 border-ink pl-s2 text-ink" role="alert">
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
