import { NoteRow } from "@/app/applications/[id]/NoteRow";
import { Micro } from "@/components/marketing/Section";
import { cn } from "@/lib/cn";
import type { ApplicationEvent, ApplicationNote } from "@/lib/db/schema";
import { stageLabel, outcomeLabel } from "@/lib/domain/stage";

/**
 * Events and notes merged into one history.
 *
 * They are separate tables for a good reason (events are append-only and system
 * authored, notes are yours and editable), but you read them as one story, so the
 * seam belongs here in the view rather than in the schema.
 *
 * Note rows carry edit and delete controls, so each renders through the `NoteRow`
 * client island rather than the static markup below. Event rows stay static: they are
 * system authored and immutable, never editable.
 */

type Entry =
  | { id: string; at: Date; kind: "event"; event: ApplicationEvent }
  | { id: string; at: Date; kind: "note"; note: ApplicationNote };

function describe(event: ApplicationEvent): string {
  switch (event.type) {
    case "created":
      return "record created";
    case "stage_change":
      return event.fromStage
        ? `stage: ${stageLabel(event.fromStage)} to ${stageLabel(event.toStage!)}`
        : `stage: ${stageLabel(event.toStage!)}`;
    case "outcome_change":
      return event.fromOutcome
        ? `outcome: ${outcomeLabel(event.fromOutcome)} to ${outcomeLabel(event.toOutcome!)}`
        : `outcome: ${outcomeLabel(event.toOutcome!)}`;
    case "follow_up_set":
      return "follow up scheduled";
    case "follow_up_cleared":
      return "follow up cleared";
    case "contact_added":
      return "contact added";
    case "document_sent":
      return "document sent";
    default:
      return event.type;
  }
}

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(
    date,
  );

export function Timeline({
  events,
  notes,
}: {
  events: ApplicationEvent[];
  notes: ApplicationNote[];
}) {
  const entries: Entry[] = [
    ...events.map((event) => ({
      id: `event-${event.id}`,
      at: new Date(event.occurredAt),
      kind: "event" as const,
      event,
    })),
    ...notes.map((note) => ({
      id: `note-${note.id}`,
      at: new Date(note.createdAt),
      kind: "note" as const,
      note,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  if (entries.length === 0) {
    return <p className="t-body text-ink-soft">Nothing recorded yet.</p>;
  }

  return (
    <ol className="flex flex-col">
      {entries.map((entry) =>
        entry.kind === "note" ? (
          <NoteRow key={entry.id} note={entry.note} dateLabel={formatDate(entry.at)} />
        ) : (
          <li
            key={entry.id}
            className={cn(
              "flex gap-s3 border-t border-[color-mix(in_srgb,var(--muted)_40%,transparent)] py-s2",
            )}
          >
            <div className="w-[92px] shrink-0">
              <Micro>{formatDate(entry.at)}</Micro>
            </div>
            <div className="min-w-0 flex-1">
              <p className="t-body wrap-anywhere text-ink-soft">{describe(entry.event)}</p>
              {entry.event.detail ? (
                <p className="t-body text-ink">{entry.event.detail}</p>
              ) : null}
            </div>
            <Micro className="shrink-0">event</Micro>
          </li>
        ),
      )}
    </ol>
  );
}
