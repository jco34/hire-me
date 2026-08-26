"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type DragEvent } from "react";

import { Capsule, FlatButton } from "@/components/ui/Capsule";
import { extractApplicationFields } from "@/lib/actions/ingest";
import type { IngestResult } from "@/lib/domain/ingest";

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

/**
 * Pull image files out of a clipboard payload.
 *
 * `files` is what Chrome fills for a screenshot taken with the system snipping tool, but
 * it is not the only shape a clipboard image arrives in — some sources populate only
 * `items`. Reading both means a paste either works or is genuinely not an image, with no
 * third case where the picture is right there and the app cannot see it.
 */
function clipboardImages(data: DataTransfer | null): File[] {
  if (!data) return [];

  const fromFiles = Array.from(data.files).filter((file) => file.type.startsWith("image/"));
  if (fromFiles.length > 0) return fromFiles;

  return Array.from(data.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

export function IngestPanel({ onExtracted }: { onExtracted: (result: IngestResult) => void }) {
  const [text, setText] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  /* The shots list is mirrored in a ref and written through `commit`, so it is correct
     synchronously. Two things need that: the unmount cleanup, which must see every
     outstanding object URL rather than a stale render's worth, and `addFiles`, which has
     to know how much room is left *before* deciding what to say to the user. Deriving the
     count inside a `setShots` updater instead would mean calling `setMessage` from within
     an updater, which is not pure and which React may run twice. */
  const shotsRef = useRef<Shot[]>([]);

  const commit = useCallback((next: Shot[]) => {
    shotsRef.current = next;
    setShots(next);
  }, []);

  useEffect(() => () => shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.url)), []);

  const addFiles = useCallback(
    (incoming: File[]) => {
      const pics = incoming.filter((file) => file.type.startsWith("image/"));
      if (pics.length === 0) return;

      if (pics.some((file) => file.size > MAX_IMAGE_BYTES)) {
        setMessage("Each screenshot must be 5 MB or smaller.");
        return;
      }

      const current = shotsRef.current;
      const room = MAX_IMAGES - current.length;
      if (room <= 0) {
        setMessage(`That is ${MAX_IMAGES} screenshots, the limit. Remove one to add another.`);
        return;
      }

      const added = pics
        .slice(0, room)
        .map((file) => ({ file, url: URL.createObjectURL(file) }));
      commit([...current, ...added]);

      const total = current.length + added.length;
      setMessage(
        pics.length > room
          ? `Added ${added.length}. That is ${MAX_IMAGES}, the limit.`
          : `${total} screenshot${total === 1 ? "" : "s"} attached.`,
      );
    },
    [commit],
  );

  /**
   * Paste is listened for on the window, not on this panel.
   *
   * A screenshot goes to the clipboard, and the clipboard does not care what has focus.
   * Scoped to the panel, Ctrl+V only worked if you had first clicked into the textarea —
   * anywhere else on the page it silently did nothing, which reads as "pasting is not
   * supported, I had better save the file first". So the listener covers the whole page
   * and the panel keeps no `onPaste` of its own; two handlers would attach every
   * screenshot twice.
   *
   * A clipboard with no image in it is left completely alone — no `preventDefault` — so
   * pasting ordinary text into the textarea or any form field below behaves normally.
   */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const pics = clipboardImages(event.clipboardData);
      if (pics.length === 0) return;
      event.preventDefault();
      addFiles(pics);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  };

  const removeImage = (index: number) => {
    const current = shotsRef.current;
    const target = current[index];
    if (target) URL.revokeObjectURL(target.url);
    commit(current.filter((_, i) => i !== index));
  };

  const extract = () => {
    setMessage(null);
    const fd = new FormData();
    fd.set("text", text);
    shots.forEach((shot) => fd.append("images", shot.file));
    startTransition(async () => {
      const result = await extractApplicationFields(fd);
      if (result.ok) {
        onExtracted(result.data);
        const filled = result.data.match
          ? "Filled the form below and scored it."
          : "Filled the form below.";
        // Said plainly when it was not the primary extractor. A fallback you cannot see is
        // indistinguishable from the main path having a slow day.
        const who =
          result.data.extractor === "claude" ? "Claude read this one instead of Gemini. " : "";
        setMessage(`${who}${filled} Check every field before saving.`);
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
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={`flex flex-col gap-s2 rounded-[var(--r-md)] border p-s3 ${hairline}`}
    >
      <p className="t-micro">paste a listing</p>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        placeholder="Paste the job posting text here."
        className={`t-body w-full resize-y rounded-[var(--r-sm)] border bg-transparent p-s2 outline-none focus:border-ink ${hairline}`}
      />

      {/* The affordance has to be stated. Nothing on screen otherwise suggests that a key
          press anywhere on the page does something, and the old wording sat inside the
          textarea placeholder where it vanished the moment you typed. */}
      <p className="t-micro">
        screenshots: press ctrl+v anywhere on this page. no need to save the file first, and
        you can paste several one after another — up to {MAX_IMAGES}.
      </p>

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
          add from a file
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
        {shots.length > 0 ? (
          <span className="t-micro">
            {shots.length} of {MAX_IMAGES}
          </span>
        ) : null}
      </div>

      {message ? (
        <p className="t-body text-ink-soft" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
