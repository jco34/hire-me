"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { IngestPanel } from "@/app/applications/IngestPanel";
import { checkForDuplicate } from "@/lib/actions/duplicates";
import type { DuplicateMatch } from "@/lib/domain/duplicate";
import type { IngestResult } from "@/lib/domain/ingest";
import type { MatchBreakdown } from "@/lib/domain/match";
import { MatchPanel } from "@/components/app/MatchPanel";
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
  ingest,
}: {
  action: Action;
  application?: Application;
  companyName?: string;
  submitLabel: string;
  cancelHref: string;
  /** Show the paste-to-fill panel above the form. Only the create route sets this. */
  ingest?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
  const [, startDuplicateCheck] = useTransition();

  /* The score and the posting it came from. Held in state rather than written straight to
     the database: extraction fills the form, it does not save it, and that stays true of
     the score. They ride to the server in hidden inputs when the user presses save. */
  const [match, setMatch] = useState<MatchBreakdown | null>(null);
  const [listingText, setListingText] = useState<string>("");
  const [matchResumeId, setMatchResumeId] = useState<string>("");

  const handleExtracted = (result: IngestResult) => {
    const form = formRef.current;
    restoreValues(form, result.values);
    setDuplicate(null);
    setMatch(result.match);
    setListingText(result.listingText ?? "");
    setMatchResumeId(result.resumeId ?? "");
    if (!form) return;

    // Read the form's current values (not just the freshly extracted ones), so a
    // company/title the user already typed by hand before pasting still gets checked.
    const submitted = new FormData(form);
    const hasCompanyAndTitle = Boolean(
      submitted.get("companyName")?.toString().trim() &&
        submitted.get("title")?.toString().trim(),
    );
    if (!hasCompanyAndTitle) return;

    startDuplicateCheck(async () => {
      const result = await checkForDuplicate(submitted).catch(() => null);
      if (result?.ok && result.data) setDuplicate(result.data);
    });
  };

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
      {ingest ? (
        // Its own region, held apart from the form's save capsule by section spacing so
        // the "one lifted capsule per region" rule holds (DESIGN.md 7).
        <div className="mb-s5">
          <IngestPanel onExtracted={handleExtracted} />
        </div>
      ) : null}

      {match ? (
        <>
          <MatchPanel breakdown={match} className="mb-s3" />
          {/* Carried to the server on save. The score is read back off the breakdown so
              the number and its evidence cannot disagree; see `matchFields` in
              validation.ts. */}
          <input type="hidden" name="matchBreakdown" value={JSON.stringify(match)} />
          <input type="hidden" name="matchResumeId" value={matchResumeId} />
        </>
      ) : null}

      {/* Kept even when the judgement failed: a stored posting is what makes a later
          re-score possible at all. */}
      {listingText ? (
        <input type="hidden" name="listingText" value={listingText} />
      ) : null}

      {duplicate ? (
        <p className="t-body border-l-2 border-ink pl-s2 text-ink" role="status">
          Looks like you may have already added this one —{" "}
          <a
            href={`/applications/${duplicate.id}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {duplicate.title} at {duplicate.companyName}
          </a>
          .
        </p>
      ) : null}

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
