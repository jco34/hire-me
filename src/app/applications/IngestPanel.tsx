"use client";

import { useEffect, useRef, useState, useTransition, type ClipboardEvent, type DragEvent } from "react";

import type { FormValues } from "@/components/app/preserveValues";
import { Capsule, FlatButton } from "@/components/ui/Capsule";
import { extractApplicationFields } from "@/lib/actions/ingest";

/**
 * Paste a listing (text and/or screenshots); on extract, hand the filled values up so
 * the form below can populate itself. This panel never saves anything — it only fills
 * fields, and the user keeps the final say on the form.
 *
 * DESIGN.md: hairline borders, matte fill, reading face for read text, and the extract
 * button is this region's single lifted capsule (the form's save button is the other
 * region's, kept apart by section spacing).
 */

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const hairline = "border-[color-mix(in_srgb,var(--muted)_60%,transparent)]";

/** A pasted screenshot paired with the object URL used to preview it. Pairing them at
 * add-time avoids deriving preview URLs from an effect (and the churn that causes). */
type Shot = { file: File; url: string };

export function IngestPanel({ onExtracted }: { onExtracted: (values: FormValues) => void }) {
  const [text, setText] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // Revoke every outstanding object URL on unmount. A ref, kept current in its own
  // effect, lets the unmount cleanup see the live list without closing over a stale one.
  const shotsRef = useRef<Shot[]>([]);
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);
  useEffect(() => () => shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.url)), []);

  const addFiles = (incoming: File[]) => {
    const pics = incoming.filter((file) => file.type.startsWith("image/"));
    if (pics.length === 0) return;
    if (pics.some((file) => file.size > MAX_IMAGE_BYTES)) {
      setMessage("Each screenshot must be 5 MB or smaller.");
      return;
    }
    setShots((current) => {
      if (current.length + pics.length > MAX_IMAGES) {
        setMessage(`Using the first ${MAX_IMAGES} screenshots.`);
      }
      const added = pics.map((file) => ({ file, url: URL.createObjectURL(file) }));
      const next = [...current, ...added].slice(0, MAX_IMAGES);
      // Revoke any that fell past the cap so we don't leak the URLs we just made.
      added.slice(MAX_IMAGES - current.length).forEach((shot) => URL.revokeObjectURL(shot.url));
      return next;
    });
  };

  const onPaste = (event: ClipboardEvent) => {
    const pics = Array.from(event.clipboardData.files);
    if (pics.length > 0) {
      event.preventDefault();
      addFiles(pics);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  };

  const removeImage = (index: number) =>
    setShots((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((_, i) => i !== index);
    });

  const extract = () => {
    setMessage(null);
    const fd = new FormData();
    fd.set("text", text);
    shots.forEach((shot) => fd.append("images", shot.file));
    startTransition(async () => {
      const result = await extractApplicationFields(fd);
      if (result.ok) {
        onExtracted(result.data);
        setMessage("Filled the form below. Check every field before saving.");
      } else {
        const errors = result.errors;
        setMessage(errors._form?.[0] ?? Object.values(errors)[0]?.[0] ?? "Extraction failed.");
      }
    });
  };

  const canExtract = !pending && (text.trim() !== "" || shots.length > 0);

  return (
    <section
      aria-label="Paste a listing to fill the form"
      onPaste={onPaste}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={`flex flex-col gap-s2 rounded-[var(--r-md)] border p-s3 ${hairline}`}
    >
      <p className="t-micro">paste a listing</p>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        placeholder="Paste the job posting text here, or paste / drop a screenshot."
        className={`t-body w-full resize-y rounded-[var(--r-sm)] border bg-transparent p-s2 outline-none focus:border-ink ${hairline}`}
      />

      {shots.length > 0 ? (
        <ul className="flex flex-wrap gap-s2">
          {shots.map((shot, index) => (
            <li key={shot.url} className="relative">
              {/* Screenshots are evidence framed, not decoration (DESIGN.md 8). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.url}
                alt={`screenshot ${index + 1}`}
                className={`h-16 w-16 rounded-[var(--r-sm)] border object-cover ${hairline}`}
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                aria-label={`remove screenshot ${index + 1}`}
                className="t-micro absolute -right-s1 -top-s1 rounded-pill border border-ink bg-surface px-s1 leading-none text-ink"
              >
                x
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-s3">
        <Capsule type="button" onClick={extract} disabled={!canExtract}>
          {pending ? "reading" : "extract"}
        </Capsule>
        <FlatButton type="button" onClick={() => fileInput.current?.click()}>
          add screenshot
        </FlatButton>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>

      {message ? (
        <p className="t-body text-ink-soft" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
