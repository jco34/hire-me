import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Form controls in the material language of DESIGN.md sections 6, 7 and 10.
 *
 * Flat by construction. The capsule is the only lifted object in a region, so nothing
 * here carries a shadow at rest or on focus. Focus is a border going to --ink plus the
 * global :focus-visible ring, never a removed outline.
 *
 * Everything is a server component and everything works uncontrolled, because these are
 * used inside plain `<form action={serverAction}>`.
 */

/** 1px --muted at partial opacity. The `--hairline` token, expressed as a Tailwind class. */
const HAIRLINE = "border-[color-mix(in_srgb,var(--muted)_60%,transparent)]";

/**
 * Shared control surface. `aria-invalid` earns an --ink rule on the left edge only, the
 * same gesture DESIGN.md section 3 gives a stale row: urgency here is contrast, not hue.
 */
const controlBase = cn(
  "block w-full bg-surface text-ink",
  "border",
  HAIRLINE,
  "rounded-sm px-s2 py-s1 min-h-11",
  "t-body",
  "placeholder:text-ink-soft",
  "transition-[background-color,color,border-color,box-shadow] duration-150 ease-[ease]",
  "hover:border-[color-mix(in_srgb,var(--muted)_90%,transparent)]",
  "focus:border-ink",
  "aria-[invalid=true]:border-l-ink",
  "disabled:opacity-50 disabled:cursor-not-allowed",
);

/**
 * Deterministic id from a human label. `useId` is a client hook and these are server
 * components, so the id has to be derivable from props alone. Pass `name` (or `id`)
 * whenever two fields could share a label.
 */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ---------------------------------------------------------------------------
 * Field
 * ------------------------------------------------------------------------- */

/** Wiring handed to the control so label, hint and error all resolve to one element. */
export interface FieldControlProps {
  id: string;
  name?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

interface FieldProps {
  /** Rendered in the micro register: uppercase, tracked, --muted. */
  label: string;
  /** Explicit control id. Defaults to `name`, then to a slug of the label. */
  id?: string;
  name?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  /**
   * Pass a function to receive `id`, `aria-describedby` and `aria-invalid` already
   * resolved. Pass a node instead only when you are wiring those attributes yourself.
   */
  children: ReactNode | ((control: FieldControlProps) => ReactNode);
}

export function Field({
  label,
  id,
  name,
  required,
  hint,
  error,
  className,
  children,
}: FieldProps) {
  const controlId = id ?? name ?? slug(label);
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;

  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  const control: FieldControlProps = {
    id: controlId,
    name,
    required,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
  };

  return (
    <div className={cn("flex flex-col gap-s1", className)}>
      <label htmlFor={controlId} className="t-micro flex items-center gap-s1">
        {label}
        {/* A lit cell means required. Drawn at the stipple sub-cell scale the tile
            renderer already uses, so it sits on the grid without shouting. `required` on
            the control is what carries the meaning to assistive technology. */}
        {required && (
          <span
            aria-hidden="true"
            className="block size-[calc(var(--cell)/2)] bg-ink"
          />
        )}
      </label>

      {typeof children === "function" ? children(control) : children}

      {hint && (
        <p id={hintId} className="t-body text-ink-soft">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="t-body border-l border-ink pl-s1 text-ink">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Controls
 * ------------------------------------------------------------------------- */

export function TextInput({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input type={type} className={cn(controlBase, className)} {...props} />;
}

export function TextArea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(controlBase, "resize-y leading-[1.75]", className)}
      {...props}
    />
  );
}

export function DateInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="date"
      className={cn(
        controlBase,
        // The UA picker glyph is the one borrowed mark in the system and it cannot be
        // replaced without losing the picker. Held back so it reads as --muted weight.
        "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
        "[&::-webkit-calendar-picker-indicator]:opacity-50",
        "[&::-webkit-calendar-picker-indicator]:hover:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

export function NumberInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="number"
      inputMode="decimal"
      className={cn(
        controlBase,
        // Spinners are a stock icon pair and a sub-44px target. Keyboard stepping stays.
        "[appearance:textfield]",
        "[&::-webkit-outer-spin-button]:appearance-none",
        "[&::-webkit-inner-spin-button]:appearance-none",
        className,
      )}
      {...props}
    />
  );
}

/** Downward triangle on the 5x8 cell grid. Three rows is the whole glyph. */
const CHEVRON_ROWS = ["#####", ".###.", "..#.."];
const CHEVRON_UNIT = 3;

interface SelectProps extends ComponentProps<"select"> {
  /** Convenience for enum-backed fields. Ignored when `children` is provided. */
  options?: readonly { value: string; label: string }[];
  /** Renders a leading empty option so the control can start unset. */
  placeholder?: string;
}

export function Select({
  className,
  options,
  placeholder,
  children,
  ...props
}: SelectProps) {
  return (
    <span className="relative block text-ink-soft transition-colors duration-150 ease-[ease] focus-within:text-ink">
      <select
        className={cn(
          controlBase,
          // Room for the chevron, which sits at the right rail.
          "appearance-none pr-s3",
          className,
        )}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {children ??
          options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
      </select>

      <svg
        viewBox={`0 0 ${CHEVRON_ROWS[0].length} ${CHEVRON_ROWS.length}`}
        width={CHEVRON_ROWS[0].length * CHEVRON_UNIT}
        height={CHEVRON_ROWS.length * CHEVRON_UNIT}
        shapeRendering="crispEdges"
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none absolute top-1/2 right-s2 -translate-y-1/2"
      >
        {CHEVRON_ROWS.flatMap((row, y) =>
          [...row].map((mark, x) =>
            mark === "#" ? (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width={1}
                height={1}
                fill="currentColor"
              />
            ) : null,
          ),
        )}
      </svg>
    </span>
  );
}

interface CheckboxProps extends Omit<ComponentProps<"input">, "type"> {
  label: string;
  /** Secondary line under the label. Reading face, never load-bearing on its own. */
  description?: ReactNode;
  /** Applied to the wrapper, not the input. */
  className?: string;
}

export function Checkbox({
  label,
  description,
  className,
  id,
  name,
  ...props
}: CheckboxProps) {
  const controlId = id ?? name ?? slug(label);

  return (
    <div className={cn("flex flex-col", className)}>
      {/* The label carries the 44px target. The box itself is three cells square. */}
      <label
        htmlFor={controlId}
        className="flex min-h-11 cursor-pointer items-center gap-s2"
      >
        <input
          type="checkbox"
          id={controlId}
          name={name}
          className={cn(
            "size-6 shrink-0 cursor-pointer appearance-none rounded-sm border bg-surface",
            HAIRLINE,
            // Checked is a two-cell --ink square inset inside the box. The inset is a
            // zero-blur ring, not a soft shadow.
            "checked:border-ink checked:bg-ink",
            "checked:shadow-[inset_0_0_0_4px_var(--surface)]",
            "transition-[background-color,border-color,box-shadow] duration-150 ease-[ease]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
          {...props}
        />
        <span className="t-body text-ink">{label}</span>
      </label>

      {/* Indented past the box and its gap so it hangs under the label text. */}
      {description && (
        <p className="t-body pl-[calc(var(--cell)*3+var(--s-2))] text-ink-soft">
          {description}
        </p>
      )}
    </div>
  );
}
