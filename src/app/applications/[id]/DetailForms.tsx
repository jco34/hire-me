"use client";

import { ActionForm } from "@/components/app/ActionForm";
import { DateInput, Field, Select, TextArea, TextInput } from "@/components/ui/Field";
import { OUTCOME_LABELS, STAGE_LABELS } from "@/components/ui/StageStrip";
import { changeOutcome, changeStage, clearFollowUp, setFollowUp } from "@/lib/actions/applications";
import { createContact } from "@/lib/actions/contacts";
import { createNote } from "@/lib/actions/notes";
import type { Outcome, Stage } from "@/lib/db/schema";

/**
 * The detail panel's write surfaces.
 *
 * These live in a client module rather than inline on the page because `ActionForm`
 * hands its children an `errorFor` helper, and a function cannot cross the server to
 * client boundary. Keeping the render props client-to-client is what makes validation
 * errors visible at all; the alternative silently discards them.
 *
 * Server actions are imported directly, which is allowed from a client component and
 * keeps the page from having to thread them through as props.
 */

const toOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

const asDateValue = (value: Date | string | null): string => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

export function StageForm({ id, stage }: { id: string; stage: Stage }) {
  return (
    <ActionForm action={changeStage} submitLabel="record stage">
      {({ errorFor }) => (
        <>
          <input type="hidden" name="applicationId" value={id} />
          <Field label="Stage" name="toStage" error={errorFor("toStage")}>
            {(control) => (
              <Select {...control} options={toOptions(STAGE_LABELS)} defaultValue={stage} />
            )}
          </Field>
          <Field label="What happened" name="detail" error={errorFor("detail")}>
            {(control) => <TextInput {...control} placeholder="optional" />}
          </Field>
          {/* Backward moves are almost always a misclick, so the action refuses them
              unless this is ticked. */}
          <label className="flex min-h-11 cursor-pointer items-center gap-s1">
            <input type="checkbox" name="allowBackward" className="size-cell" />
            <span className="t-micro">allow moving backwards</span>
          </label>
        </>
      )}
    </ActionForm>
  );
}

export function OutcomeForm({ id, outcome }: { id: string; outcome: Outcome }) {
  return (
    <ActionForm action={changeOutcome} submitLabel="record outcome" variant="flat">
      {({ errorFor }) => (
        <>
          <input type="hidden" name="applicationId" value={id} />
          <Field label="Outcome" name="toOutcome" error={errorFor("toOutcome")}>
            {(control) => (
              <Select
                {...control}
                options={toOptions(OUTCOME_LABELS)}
                defaultValue={outcome}
              />
            )}
          </Field>
        </>
      )}
    </ActionForm>
  );
}

export function NoteForm({ id }: { id: string }) {
  return (
    <ActionForm action={createNote} submitLabel="save note" resetOnSuccess>
      {({ errorFor }) => (
        <>
          <input type="hidden" name="applicationId" value={id} />
          <Field label="Note" name="body" required error={errorFor("body")}>
            {(control) => (
              <TextArea
                {...control}
                rows={3}
                placeholder="What was said, what to prepare, what they asked for."
              />
            )}
          </Field>
        </>
      )}
    </ActionForm>
  );
}

/**
 * Follow-up date. The set form is always available, so nudging an already-set date to a
 * new one is just resubmitting it; the clear control only appears once there is
 * something to clear, and needs no confirmation because it is reversible — you just set
 * a new one.
 */
export function FollowUpForm({
  id,
  followUpAt,
}: {
  id: string;
  followUpAt: Date | string | null;
}) {
  return (
    <div className="flex flex-col gap-s2">
      <ActionForm action={setFollowUp} submitLabel="set follow up" variant="flat">
        {({ errorFor }) => (
          <>
            <input type="hidden" name="applicationId" value={id} />
            <Field
              label="Follow up on"
              name="followUpAt"
              required
              error={errorFor("followUpAt")}
            >
              {(control) => (
                <DateInput {...control} defaultValue={asDateValue(followUpAt)} />
              )}
            </Field>
          </>
        )}
      </ActionForm>

      {followUpAt ? (
        <ActionForm action={clearFollowUp} submitLabel="clear follow up" variant="flat">
          {() => <input type="hidden" name="applicationId" value={id} />}
        </ActionForm>
      ) : null}
    </div>
  );
}

export function ContactForm({ id }: { id: string }) {
  return (
    <ActionForm
      action={createContact}
      submitLabel="add contact"
      variant="flat"
      resetOnSuccess
    >
      {({ errorFor }) => (
        <>
          <input type="hidden" name="applicationId" value={id} />
          <Field label="Name" name="name" required error={errorFor("name")}>
            {(control) => <TextInput {...control} />}
          </Field>
          <Field label="Role" name="role" error={errorFor("role")}>
            {(control) => <TextInput {...control} placeholder="recruiter" />}
          </Field>
          <Field label="Email" name="email" error={errorFor("email")}>
            {(control) => <TextInput {...control} type="email" />}
          </Field>
        </>
      )}
    </ActionForm>
  );
}
