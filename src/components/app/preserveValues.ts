/**
 * React 19 resets an uncontrolled form's fields once its action resolves. That is the
 * right default for a composer you submit and move on from, and the wrong one for a
 * form that came back with a validation error: the user fixes one field and discovers
 * the other twenty are blank.
 *
 * These helpers snapshot what was submitted and put it back when the submit failed.
 * Controlled inputs would also solve this, at the cost of making every field in the
 * application stateful to fix a problem that only occurs on the error path.
 */

export type FormValues = Record<string, string[]>;

export function captureValues(formData: FormData): FormValues {
  const values: FormValues = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    (values[key] ??= []).push(value);
  }

  return values;
}

export function restoreValues(
  form: HTMLFormElement | null,
  values: FormValues,
): void {
  if (!form) return;

  for (const element of Array.from(form.elements)) {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      )
    ) {
      continue;
    }

    const name = element.name;
    if (!name) continue;

    // A checkbox is absent from FormData when it was unticked, so presence is the value.
    // Matching on the element's own `value` (not just key presence) matters for a
    // checkbox group sharing one `name`: with two checked-out-of-three, presence alone
    // would re-check all three on restore instead of just the two that were submitted.
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      element.checked = (values[name] ?? []).includes(element.value);
      continue;
    }

    if (element instanceof HTMLInputElement && element.type === "hidden") continue;

    const submitted = values[name]?.[0];
    if (submitted !== undefined) element.value = submitted;
  }
}
