"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { TileText } from "@/components/type/TileText";
import { FlatButton } from "@/components/ui/Capsule";
import { cn } from "@/lib/cn";
import { layoutTileText } from "@/lib/tile-font";

/**
 * Modal built on the native `<dialog>` element, so focus trapping, inertness of the rest
 * of the page, Escape-to-close and the top layer all come from the platform rather than
 * from a re-implementation.
 *
 * DESIGN.md section 7: the panel is the lifted object here, carrying the hard offset
 * shadow. A single Capsule in the footer is still the one pressable thing; nothing else
 * inside may lift.
 */

const HAIRLINE = "border-[color-mix(in_srgb,var(--muted)_60%,transparent)]";

export interface DialogHandle {
  ref: RefObject<HTMLDialogElement | null>;
  open: () => void;
  close: () => void;
}

export function useDialog(): DialogHandle {
  const ref = useRef<HTMLDialogElement>(null);

  const open = useCallback(() => {
    ref.current?.showModal();
  }, []);

  const close = useCallback(() => {
    ref.current?.close();
  }, []);

  return { ref, open, close };
}

interface DialogProps {
  ref: RefObject<HTMLDialogElement | null>;
  /** Drawn in the display face. Lowercase reads best; the renderer lowercases anyway. */
  title: string;
  children: ReactNode;
  /** Action cluster, tight to the right rail. */
  footer?: ReactNode;
  /** Fired after the dialog closes, whichever route it closed by. */
  onClose?: () => void;
  /** Label on the flat dismiss control. */
  closeLabel?: string;
  className?: string;
}

/**
 * Dialog title in the tile face.
 *
 * A fixed-cell single-line SVG overflows any panel narrower than the title's natural
 * width and scrolls the whole modal sideways; a single fluid line that fits-to-width
 * instead collapses to an illegible few pixels on a phone. So the title wraps by word:
 * each word is its own fluid tile at cell=4, laid out in a flex-wrap row, so a long
 * title breaks onto a second line rather than shrinking away. `max-w-full` on each word
 * is the last-resort cap for a single word wider than the line.
 */
function TileTitle({ id, text }: { id: string; text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span
      id={id}
      className="flex min-w-0 flex-1 flex-wrap items-start gap-x-s2 gap-y-s1"
    >
      {words.map((word, i) => (
        <span
          key={`${i}-${word}`}
          className="block min-w-0 max-w-full"
          style={{ width: `calc(${layoutTileText(word).cols} * 4px)` }}
        >
          <TileText text={word} mode="solid" presentational />
        </span>
      ))}
      <span className="sr-only">{text}</span>
    </span>
  );
}

export function Dialog({
  ref,
  title,
  children,
  footer,
  onClose,
  closeLabel = "close",
  className,
}: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const lastOutsideFocus = useRef<HTMLElement | null>(null);

  // `open` is set by showModal(), not by React, so the entrance has to watch the
  // attribute. Driving `data-revealed` from the DOM rather than from state keeps this a
  // one-way sync to an external system instead of a render cascade.
  //
  // The two frames matter. The panel goes from display:none straight to its end state
  // otherwise, and a transition out of display:none is simply skipped. One frame to let
  // the start state paint, a second to flip it. Reduced motion is handled in globals.css,
  // which strips the transform and shortens the fade.
  useEffect(() => {
    const node = ref.current;
    const panel = panelRef.current;
    if (!node || !panel) return;

    let frame = 0;

    const sync = () => {
      cancelAnimationFrame(frame);
      if (!node.open) {
        panel.dataset.revealed = "false";
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          panel.dataset.revealed = "true";
        });
      });
    };
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(node, { attributes: true, attributeFilter: ["open"] });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref]);

  // Native `close()` restores focus to the opener in current browsers, but only when the
  // opener is still where it was. Tracking the last focus outside the panel makes the
  // restore explicit and survives the opener being re-rendered.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && !node.contains(target)) lastOutsideFocus.current = target;
    };

    const handleClose = () => {
      const opener = lastOutsideFocus.current;
      if (opener?.isConnected) opener.focus();
      onClose?.();
    };

    document.addEventListener("focusin", onFocusIn);
    node.addEventListener("close", handleClose);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      node.removeEventListener("close", handleClose);
    };
  }, [ref, onClose]);

  // The dialog box is exactly the panel, so a click that lands on the dialog itself came
  // from the backdrop.
  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={handleClick}
      className={cn(
        "m-auto w-[min(calc(100vw-var(--s-3)*2),560px)] max-h-[85vh] bg-transparent p-0 text-ink",
        // --ink at low opacity. ::backdrop inherits custom properties from its originating
        // element, so the token resolves here rather than being restated as a literal.
        "backdrop:bg-[color-mix(in_srgb,var(--ink)_28%,transparent)]",
        className,
      )}
    >
      <div
        ref={panelRef}
        className={cn(
          "hm-reveal flex max-h-[85vh] flex-col gap-s3 bg-surface p-s3",
          "border",
          HAIRLINE,
          "rounded-md shadow-[4px_4px_0_var(--ink)]",
        )}
        data-revealed="false"
      >
        <div className="flex items-start justify-between gap-s3">
          <TileTitle id={titleId} text={title} />
          <FlatButton
            type="button"
            onClick={() => ref.current?.close()}
            className="-mt-s1 shrink-0"
          >
            {closeLabel}
          </FlatButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-s2">{footer}</div>
        )}
      </div>
    </dialog>
  );
}
