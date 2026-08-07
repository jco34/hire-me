"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useActionState } from "react";

import {
  captureValues,
  restoreValues,
  type FormValues,
} from "@/components/app/preserveValues";
import { Capsule, FlatButton } from "@/components/ui/Capsule";
import { cn } from "@/lib/cn";
import { FORM_ERROR_KEY, type ActionResult } from "@/lib/validation";

/**
 * Bridges the single-argument server actions to a form that can show what went wrong.
 *
 * A plain `<form action={fn}>` requires the action to return void, so an action that
 * returns an `ActionResult` would have its validation errors silently dropped on the
 * floor: the user presses save, nothing visible happens, and the record is unchanged.
 * `useActionState` keeps the result, and this component renders it.
 *
 * On success the form resets, which is what you want for a composer (a note, a contact)
 * and harmless for the stage and outcome controls, which re-render from fresh data.
 */

type SingleArgAction<T> = (formData: FormData) => Promise<ActionResult<T>>;

/** The action's result plus what was submitted, so a failure can be repopulated. */
type Attempt<T> = { result: ActionResult<T>; values: FormValues };

interface ActionFormProps<T> {
  action: SingleArgAction<T>;
  submitLabel: string;
  /** `flat` for secondary actions, so only one lifted capsule exists per region. */
  variant?: "capsule" | "flat";
  className?: string;
  /** Cleared and re-focused after a successful submit. */
  resetOnSuccess?: boolean;
  children:
    | ReactNode
    | ((helpers: {
        errorFor: (name: string) => string | undefined;
        pending: boolean;
      }) => ReactNode);
}

export function ActionForm<T>({
  action,
  submitLabel,
  variant = "capsule",
  className,
  resetOnSuccess = false,
  children,
}: ActionFormProps<T>) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    async (_prev: Attempt<T> | null, formData: FormData): Promise<Attempt<T>> => ({
      result: await action(formData),
      values: captureValues(formData),
    }),
    null,
  );

  useEffect(() => {
    if (!state) return;
    // React clears the fields once the action resolves. Keep that on success, undo it
    // on failure so the user is correcting a form rather than retyping one.
    if (state.result.ok) {
      if (resetOnSuccess) formRef.current?.reset();
    } else {
      restoreValues(formRef.current, state.values);
    }
  }, [state, resetOnSuccess]);

  const errors = state && !state.result.ok ? state.result.errors : {};
  const errorFor = (name: string) => errors[name]?.[0];

  return (
    <form
      ref={formRef}
      action={formAction}
      className={cn("flex flex-col gap-s2", className)}
    >
      {typeof children === "function" ? children({ errorFor, pending }) : children}

      {errors[FORM_ERROR_KEY] ? (
        <p className="t-body border-l-2 border-ink pl-s2 text-ink" role="alert">
          {errors[FORM_ERROR_KEY][0]}
        </p>
      ) : null}

      {variant === "capsule" ? (
        <Capsule type="submit" disabled={pending} className="self-start">
          {pending ? "saving" : submitLabel}
        </Capsule>
      ) : (
        <FlatButton type="submit" disabled={pending} className="self-start">
          {pending ? "saving" : submitLabel}
        </FlatButton>
      )}
    </form>
  );
}
