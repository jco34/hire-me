"use client";

import { useState } from "react";

import { ActionForm } from "@/components/app/ActionForm";
import { Micro } from "@/components/marketing/Section";
import { FlatButton } from "@/components/ui/Capsule";
import { Field, TextArea } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { deleteNote, updateNote } from "@/lib/actions/notes";
import type { ApplicationNote } from "@/lib/db/schema";

/**
 * One note row in the merged timeline, as a client island.
 *
 * Notes are the editable, user-authored half of the timeline (events are append-only
 * and system authored, so they never get this treatment). Edit toggles an inline
 * textarea in place rather than opening a dialog; delete is a lightweight two-step
 * flat-button confirm, since losing a note you wrote is worth guarding but does not
 * carry the weight of deleting the whole application.
 */

const ROW = "flex gap-s3 border-t border-[color-mix(in_srgb,var(--muted)_40%,transparent)] py-s2";

type Mode = "view" | "edit" | "confirm-delete";

export function NoteRow({
  note,
  dateLabel,
}: {
  note: ApplicationNote;
  dateLabel: string;
}) {
  const [mode, setMode] = useState<Mode>("view");

  if (mode === "edit") {
    return (
      <li className={ROW}>
        <div className="w-[92px] shrink-0">
          <Micro>{dateLabel}</Micro>
        </div>
        <div className="min-w-0 flex-1">
          <ActionForm
            action={async (formData) => {
              const result = await updateNote(formData);
              if (result.ok) setMode("view");
              return result;
            }}
            submitLabel="save"
            variant="flat"
          >
            {({ errorFor }) => (
              <>
                <input type="hidden" name="id" value={note.id} />
                <Field label="Note" name="body" required error={errorFor("body")}>
                  {(control) => (
                    <TextArea {...control} rows={3} defaultValue={note.body} />
                  )}
                </Field>
                <FlatButton
                  type="button"
                  className="self-start"
                  onClick={() => setMode("view")}
                >
                  cancel
                </FlatButton>
              </>
            )}
          </ActionForm>
        </div>
        <Micro className="shrink-0">note</Micro>
      </li>
    );
  }

  if (mode === "confirm-delete") {
    return (
      <li className={ROW}>
        <div className="w-[92px] shrink-0">
          <Micro>{dateLabel}</Micro>
        </div>
        <div className="min-w-0 flex-1">
          <p className="t-body wrap-anywhere text-ink">{note.body}</p>
          <div className="mt-s1 flex items-center gap-s2">
            <span className="t-micro text-ink-soft">delete this note?</span>
            <ActionForm action={deleteNote} submitLabel="confirm delete" variant="flat">
              {() => <input type="hidden" name="id" value={note.id} />}
            </ActionForm>
            <FlatButton type="button" onClick={() => setMode("view")}>
              cancel
            </FlatButton>
          </div>
        </div>
        <Micro className="shrink-0">note</Micro>
      </li>
    );
  }

  return (
    <li className={cn(ROW)}>
      <div className="w-[92px] shrink-0">
        <Micro>{dateLabel}</Micro>
      </div>
      <div className="min-w-0 flex-1">
        <p className="t-body wrap-anywhere text-ink">{note.body}</p>
        <div className="mt-s1 flex items-center gap-s2">
          <FlatButton type="button" onClick={() => setMode("edit")}>
            edit
          </FlatButton>
          <FlatButton type="button" onClick={() => setMode("confirm-delete")}>
            delete
          </FlatButton>
        </div>
      </div>
      <Micro className="shrink-0">note</Micro>
    </li>
  );
}
