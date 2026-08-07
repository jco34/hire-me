"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";

import {
  captureValues,
  restoreValues,
  type FormValues,
} from "@/components/app/preserveValues";
import { Capsule } from "@/components/ui/Capsule";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import type { Company } from "@/lib/db/schema";
import { FORM_ERROR_KEY, type ActionResult, type FieldErrors } from "@/lib/validation";

/**
 * Edit-only form for a company. Unlike `ApplicationForm`, there is no create mode:
 * companies are only ever created as a side effect of adding an application (see the
 * empty state on `/companies`), so this form always carries an existing `Company` and
 * always posts to `updateCompany`.
 *
 * Same value-preservation-on-error pattern as `ApplicationForm`: fields are uncontrolled
 * and named, `captureValues`/`restoreValues` put a failed submission's values back after
 * React clears the form on action resolution, and a successful submit redirects away.
 */

type Action = (
  prev: ActionResult<{ id: string }> | null,
  formData: FormData,
) => Promise<ActionResult<{ id: string }>>;

export function CompanyForm({
  action,
  company,
}: {
  action: Action;
  company: Company;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    async (
      prev: { result: ActionResult<{ id: string }>; values: FormValues } | null,
      formData: FormData,
    ) => ({
      result: await action(prev?.result ?? null, formData),
      values: captureValues(formData),
    }),
    null,
  );

  const errors: FieldErrors = state && !state.result.ok ? state.result.errors : {};
  const errorFor = (name: string) => errors[name]?.[0];

  useEffect(() => {
    if (!state) return;
    if (state.result.ok) {
      router.push("/companies");
    } else {
      restoreValues(formRef.current, state.values);
    }
  }, [state, router]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mt-s3 flex max-w-[900px] flex-col gap-s3"
    >
      <input type="hidden" name="id" value={company.id} />

      {errors[FORM_ERROR_KEY] ? (
        <p className="t-body border-l-2 border-ink pl-s2 text-ink" role="alert">
          {errors[FORM_ERROR_KEY][0]}
        </p>
      ) : null}

      <fieldset
        className={cn(
          "flex flex-col gap-s2 border-t border-[color-mix(in_srgb,var(--muted)_60%,transparent)] pt-s2",
          "sm:grid sm:grid-cols-2 sm:gap-s2",
        )}
      >
        <legend className="t-micro">company</legend>

        <Field label="Name" name="name" required error={errorFor("name")}>
          {(control) => (
            <TextInput {...control} defaultValue={company.name} autoComplete="organization" />
          )}
        </Field>

        <Field label="Website" name="website" error={errorFor("website")}>
          {(control) => (
            <TextInput {...control} type="url" defaultValue={company.website ?? ""} />
          )}
        </Field>

        <Field label="Location" name="location" error={errorFor("location")}>
          {(control) => (
            <TextInput {...control} defaultValue={company.location ?? ""} />
          )}
        </Field>

        <Field
          label="Notes"
          name="notes"
          error={errorFor("notes")}
          className="sm:col-span-2"
        >
          {(control) => (
            <TextArea {...control} rows={4} defaultValue={company.notes ?? ""} />
          )}
        </Field>
      </fieldset>

      <div className="flex items-center gap-s3">
        <Capsule type="submit" disabled={pending}>
          {pending ? "saving" : "save changes"}
        </Capsule>
        <Link
          href="/companies"
          className="t-micro text-ink-soft transition-colors duration-150 ease-[ease] hover:text-ink"
        >
          cancel
        </Link>
      </div>
    </form>
  );
}
