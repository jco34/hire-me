"use client";

import { useState } from "react";

import { ActionForm } from "@/components/app/ActionForm";
import { FlatButton } from "@/components/ui/Capsule";
import { deleteContact } from "@/lib/actions/contacts";
import type { Contact } from "@/lib/db/schema";

/**
 * One contact card in the sidebar list, as a client island.
 *
 * Same treatment as a note row: a flat delete control with a lightweight two-step
 * confirm, rather than the heavier dialog reserved for deleting the whole application.
 */

const ROW = "border-t border-[color-mix(in_srgb,var(--muted)_40%,transparent)] pt-s1";

export function ContactRow({ contact }: { contact: Contact }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className={ROW}>
      <p className="t-body text-ink">{contact.name}</p>
      {contact.role ? <p className="t-micro">{contact.role}</p> : null}
      {contact.email ? (
        <a
          href={`mailto:${contact.email}`}
          className="t-body block text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          {contact.email}
        </a>
      ) : null}
      {contact.phone ? <p className="t-body text-ink-soft">{contact.phone}</p> : null}

      {confirming ? (
        <div className="mt-s1 flex items-center gap-s2">
          <span className="t-micro text-ink-soft">delete this contact?</span>
          <ActionForm action={deleteContact} submitLabel="confirm delete" variant="flat">
            {() => <input type="hidden" name="id" value={contact.id} />}
          </ActionForm>
          <FlatButton type="button" onClick={() => setConfirming(false)}>
            cancel
          </FlatButton>
        </div>
      ) : (
        <div className="mt-s1">
          <FlatButton type="button" onClick={() => setConfirming(true)}>
            delete
          </FlatButton>
        </div>
      )}
    </li>
  );
}
