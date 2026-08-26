"use client";

import { useRef, useState, useTransition, type ChangeEvent, type DragEvent } from "react";

import { Capsule, FlatButton } from "@/components/ui/Capsule";
import { createResume, extractResumeText } from "@/lib/actions/resumes";
import { FORM_ERROR_KEY, type FieldErrors } from "@/lib/validation";

/**
 * Paste a resume, or drop a PDF and let the extractor read it.
 *
 * The two paths converge on the same textarea on purpose: whatever the model transcribes
 * lands in an editable box the user reads before anything is stored. A resume is the thing
 * every score is measured against, so a silently mangled transcription would be invisible
 * and would poison every match from then on.
 *
 * DESIGN.md: hairline frame, matte fill, reading face throughout. The save button is this
 * region's single lifted capsule.
 */

const hairline = "border-[color-mix(in_srgb,var(--muted)_60%,transparent)]";

export function ResumeComposer({ hasActive }: { hasActive: boolean }) {
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const read = (file: File) => {
    setMessage(null);
    setErrors({});
    setFileName(file.name);
    const fd = new FormData();
    fd.set("file", file);
    startReading(async () => {
      const result = await extractResumeText(fd);
      if (result.ok) {
        setText(result.data);
        setMessage("Read it. Check the text below before saving — fix anything it mangled.");
      } else {
        setMessage(result.errors[FORM_ERROR_KEY]?.[0] ?? "Could not read that file.");
      }
    });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) read(file);
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) read(file);
    event.target.value = "";
  };

  const save = () => {
    setMessage(null);
    setErrors({});
    const fd = new FormData();
    fd.set("label", label);
    fd.set("rawText", text);
    startSaving(async () => {
      const result = await createResume(fd);
      if (result.ok) {
        setText("");
        setLabel("");
        setFileName(null);
        setMessage("Saved and made active. New applications will be scored against it.");
      } else {
        setErrors(result.errors);
        setMessage(result.errors[FORM_ERROR_KEY]?.[0] ?? null);
      }
    });
  };

  const busy = reading || saving;

  return (
    <section
      aria-label={hasActive ? "Replace your resume" : "Add your resume"}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={`flex flex-col gap-s2 rounded-[var(--r-md)] border p-s3 ${hairline}`}
    >
      <p className="t-micro">{hasActive ? "replace it" : "add your resume"}</p>

      <div className="flex flex-wrap items-center gap-s3">
        <FlatButton type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
          {reading ? "reading" : "choose a pdf"}
        </FlatButton>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          hidden
          onChange={onPick}
        />
        <span className="t-micro">
          {fileName ?? "or drop one here, or just paste the text"}
        </span>
      </div>

      <label className="flex flex-col gap-s1">
        <span className="sr-only">Resume text</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={12}
          disabled={reading}
          aria-invalid={errors.rawText ? true : undefined}
          placeholder="Paste your resume here, or drop a PDF above."
          className={`t-body w-full resize-y rounded-[var(--r-sm)] border bg-transparent p-s2 outline-none focus:border-ink aria-[invalid=true]:border-l-ink ${hairline}`}
        />
      </label>

      {errors.rawText ? (
        <p className="t-body border-l-2 border-ink pl-s2 text-ink" role="alert">
          {errors.rawText[0]}
        </p>
      ) : null}

      <label className="flex flex-wrap items-center gap-s2">
        <span className="t-micro">label</span>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="optional — today's date if you leave it"
          className={`t-body min-h-11 flex-1 rounded-[var(--r-sm)] border bg-transparent px-s2 outline-none placeholder:text-ink-soft focus:border-ink ${hairline}`}
        />
      </label>

      <div className="flex flex-wrap items-center gap-s3">
        <Capsule type="button" onClick={save} disabled={busy || text.trim() === ""}>
          {saving ? "saving" : hasActive ? "save as active" : "save resume"}
        </Capsule>
        <span className="t-micro">
          {text.trim() === "" ? "nothing to save yet" : `${text.trim().length} characters`}
        </span>
      </div>

      {message ? (
        <p className="t-body text-ink-soft" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
