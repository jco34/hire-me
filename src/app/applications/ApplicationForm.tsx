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
import {
  Checkbox,
  DateInput,
  Field,
  NumberInput,
  Select,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { EMPLOYMENT_TYPE_LABELS, WORK_SETUP_LABELS } from "@/components/ui/Meta";
import { OUTCOME_LABELS, STAGE_LABELS } from "@/components/ui/StageStrip";
import { cn } from "@/lib/cn";
import type { Application } from "@/lib/db/schema";
import { FORM_ERROR_KEY, type ActionResult, type FieldErrors } from "@/lib/validation";

/**
 * One form for create and edit. The shape of an application does not change between
 * the two, so neither does this; only the action and the defaults differ.
 *
 * Errors come back from the server action as a flat map keyed by input name, which is
 * why every control is uncontrolled and named. A failed submit re-renders with the
 * values the user typed still in the DOM.
 */

type Action = (
  prev: ActionResult<{ id: string }> | null,
  formData: FormData,
) => Promise<ActionResult<{ id: string }>>;

const SALARY_PERIODS = [
  { value: "hourly", label: "per hour" },
  { value: "daily", label: "per day" },
  { value: "monthly", label: "per month" },
  { value: "annual", label: "per year" },
] as const;

const toOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

const asDateValue = (value: Date | string | null): string => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

export function ApplicationForm({
  action,
  application,
  companyName,
  submitLabel,
  cancelHref,
}: {
  action: Action;
  application?: Application;
  companyName?: string;
  submitLabel: string;
  cancelHref: string;
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
      router.push(`/applications/${state.result.data.id}`);
    } else {
      // React clears uncontrolled fields when the action resolves. On a form this long,
      // losing every value because one of them was wrong is not an acceptable trade.
      restoreValues(formRef.current, state.values);
    }
  }, [state, router]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mt-s3 flex max-w-[900px] flex-col gap-s3"
    >
      {application ? <input type="hidden" name="id" value={application.id} /> : null}

      {errors[FORM_ERROR_KEY] ? (
        <p className="t-body border-l-2 border-ink pl-s2 text-ink" role="alert">
          {errors[FORM_ERROR_KEY][0]}
        </p>
      ) : null}

      <Fieldset legend="the role">
        <Field label="Company" name="companyName" required error={errorFor("companyName")}>
          {(control) => (
            <TextInput
              {...control}
              defaultValue={companyName ?? ""}
              autoComplete="organization"
            />
          )}
        </Field>

        <Field label="Job title" name="title" required error={errorFor("title")}>
          {(control) => <TextInput {...control} defaultValue={application?.title ?? ""} />}
        </Field>

        <Field
          label="Short description"
          name="description"
          error={errorFor("description")}
          hint="A couple of lines. Not the whole posting."
          className="sm:col-span-2"
        >
          {(control) => (
            <TextArea {...control} rows={3} defaultValue={application?.description ?? ""} />
          )}
        </Field>

        <Field
          label="Posting URL"
          name="url"
          error={errorFor("url")}
          hint="Stored so you can reread it. Never fetched."
        >
          {(control) => (
            <TextInput {...control} type="url" defaultValue={application?.url ?? ""} />
          )}
        </Field>

        <Field label="Source" name="source" error={errorFor("source")} hint="linkedin, jobstreet, referral">
          {(control) => <TextInput {...control} defaultValue={application?.source ?? ""} />}
        </Field>
      </Fieldset>

      <Fieldset legend="where and how">
        <Field label="Employment type" name="employmentType" error={errorFor("employmentType")}>
          {(control) => (
            <Select
              {...control}
              placeholder="not stated"
              options={toOptions(EMPLOYMENT_TYPE_LABELS)}
              defaultValue={application?.employmentType ?? ""}
            />
          )}
        </Field>

        <Field label="Work setup" name="workSetup" error={errorFor("workSetup")}>
          {(control) => (
            <Select
              {...control}
              placeholder="not stated"
              options={toOptions(WORK_SETUP_LABELS)}
              defaultValue={application?.workSetup ?? ""}
            />
          )}
        </Field>

        <Field label="Location" name="location" error={errorFor("location")}>
          {(control) => (
            <TextInput {...control} defaultValue={application?.location ?? ""} />
          )}
        </Field>
      </Fieldset>

      <Fieldset legend="pay">
        <Field label="Minimum" name="salaryMin" error={errorFor("salaryMin")}>
          {(control) => (
            <NumberInput {...control} defaultValue={application?.salaryMin ?? ""} step="0.01" />
          )}
        </Field>

        <Field label="Maximum" name="salaryMax" error={errorFor("salaryMax")}>
          {(control) => (
            <NumberInput {...control} defaultValue={application?.salaryMax ?? ""} step="0.01" />
          )}
        </Field>

        <Field label="Currency" name="salaryCurrency" error={errorFor("salaryCurrency")} hint="PHP, USD, SGD">
          {(control) => (
            <TextInput
              {...control}
              maxLength={3}
              defaultValue={application?.salaryCurrency ?? ""}
              className="uppercase"
            />
          )}
        </Field>

        <Field label="Period" name="salaryPeriod" error={errorFor("salaryPeriod")}>
          {(control) => (
            <Select
              {...control}
              placeholder="not stated"
              options={SALARY_PERIODS}
              defaultValue={application?.salaryPeriod ?? ""}
            />
          )}
        </Field>

        <Field
          label="As written"
          name="salaryRaw"
          error={errorFor("salaryRaw")}
          hint="Exactly what the posting said, including things a range cannot hold."
          className="sm:col-span-2"
        >
          {(control) => (
            <TextInput {...control} defaultValue={application?.salaryRaw ?? ""} />
          )}
        </Field>

        <div className="sm:col-span-2">
          <Checkbox
            name="salaryNotDisclosed"
            label="Salary not disclosed"
            description="Clear the figures above before ticking this."
            defaultChecked={application?.salaryNotDisclosed ?? false}
          />
          {errorFor("salaryNotDisclosed") ? (
            <p className="t-body mt-s1 border-l-2 border-ink pl-s2 text-ink" role="alert">
              {errorFor("salaryNotDisclosed")}
            </p>
          ) : null}
        </div>
      </Fieldset>

      <Fieldset legend="where it stands">
        <Field label="Stage" name="stage" error={errorFor("stage")}>
          {(control) => (
            <Select
              {...control}
              options={toOptions(STAGE_LABELS)}
              defaultValue={application?.stage ?? "saved"}
            />
          )}
        </Field>

        <Field label="Outcome" name="outcome" error={errorFor("outcome")}>
          {(control) => (
            <Select
              {...control}
              options={toOptions(OUTCOME_LABELS)}
              defaultValue={application?.outcome ?? "active"}
            />
          )}
        </Field>

        <Field label="Applied on" name="appliedAt" error={errorFor("appliedAt")}>
          {(control) => (
            <DateInput {...control} defaultValue={asDateValue(application?.appliedAt ?? null)} />
          )}
        </Field>

        <Field
          label="Follow up on"
          name="followUpAt"
          error={errorFor("followUpAt")}
          hint="Your own reminder. It does not reset the silence counter."
        >
          {(control) => (
            <DateInput {...control} defaultValue={asDateValue(application?.followUpAt ?? null)} />
          )}
        </Field>
      </Fieldset>

      <div className="flex items-center gap-s3">
        <Capsule type="submit" disabled={pending}>
          {pending ? "saving" : submitLabel}
        </Capsule>
        <Link
          href={cancelHref}
          className="t-micro text-ink-soft transition-colors duration-150 ease-[ease] hover:text-ink"
        >
          cancel
        </Link>
      </div>
    </form>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset
      className={cn(
        "flex flex-col gap-s2 border-t border-[color-mix(in_srgb,var(--muted)_60%,transparent)] pt-s2",
        "sm:grid sm:grid-cols-2 sm:gap-s2",
      )}
    >
      <legend className="t-micro">{legend}</legend>
      {children}
    </fieldset>
  );
}
