import type { CSSProperties, ReactNode } from "react";

import { Hero } from "@/components/marketing/Hero";
import {
  Aside,
  Micro,
  Prose,
  Section,
  TileDisplay,
  bodyRate,
  rail,
} from "@/components/marketing/Section";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { Parallax } from "@/components/motion/Parallax";
import { Reveal } from "@/components/motion/Reveal";
import { TileText } from "@/components/type/TileText";
import { CapsuleLink } from "@/components/ui/Capsule";
import { cn } from "@/lib/cn";

/**
 * Marketing route.
 *
 * Structure follows DESIGN.md sections 5 and 9. The hero is a still frame. Every
 * section below it runs its own ambient field at one rate, its header at two more,
 * and each body element at a rate of its own, so that returning to the top lands as
 * a stop rather than as a pause.
 *
 * Reveal depths are unique within each section on purpose. Nothing here arrives on
 * the same beat as anything next to it.
 */

const hairline = "border-[color-mix(in_srgb,var(--muted)_55%,transparent)]";
const hollow = cn("border", hairline);

/* -------------------------------------------------------------------------- */
/* Small pieces, all drawn on the cell grid                                     */
/* -------------------------------------------------------------------------- */

function Moved({
  rate,
  children,
  className,
}: {
  rate: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Parallax rate={rate} className={className}>
      {children}
    </Parallax>
  );
}

/** One axis position: a square, its label, and its state in the reading face. */
function AxisItem({
  label,
  note,
  on,
  depth,
  rate,
}: {
  label: string;
  note: string;
  on: boolean;
  depth: number;
  rate: number;
}) {
  return (
    <Reveal as="li" depth={depth} className="min-w-[84px]">
      <Moved rate={rate}>
        <span
          className={cn("block size-s3", on ? "bg-ink" : hollow)}
          aria-hidden="true"
        />
        <Micro className="mt-s2">{label}</Micro>
        <Micro className="mt-[2px]">{note}</Micro>
      </Moved>
    </Reveal>
  );
}

/** One entry in an application's history. Date in micro, the fact in reading face. */
function LogRow({
  date,
  text,
  depth,
  rate,
}: {
  date: string;
  text: string;
  depth: number;
  rate: number;
}) {
  return (
    <Reveal as="li" depth={depth}>
      <Moved rate={rate}>
        <div className={cn("flex gap-s3 border-t py-s2", hairline)}>
          <Micro className="w-[68px] shrink-0 pt-[3px]">{date}</Micro>
          <span className="t-body text-ink">{text}</span>
        </div>
      </Moved>
    </Reveal>
  );
}

/** One square per day. Filled where something happened, hollow where nothing did. */
function DayStrip({ total, marked }: { total: number; marked: number[] }) {
  return (
    <div aria-hidden="true" className="flex flex-wrap gap-[4px]">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "block size-cell",
            marked.includes(i)
              ? "bg-ink"
              : "bg-[color-mix(in_srgb,var(--muted)_50%,transparent)]",
          )}
        />
      ))}
    </div>
  );
}

/** A numbered step or a named part. Reading face throughout. */
function Block({
  index,
  title,
  body,
  depth,
  rate,
}: {
  index: string;
  title: string;
  body: string;
  depth: number;
  rate: number;
}) {
  return (
    <Reveal as="li" depth={depth}>
      <Moved rate={rate}>
        <div className={cn("border-t pt-s2", hairline)}>
          <Micro>{index}</Micro>
          <p className="t-body-lg mt-s1 text-ink">{title}</p>
          <p className="t-body mt-s2 max-w-[42ch] text-ink-soft">{body}</p>
        </div>
      </Moved>
    </Reveal>
  );
}

/* -------------------------------------------------------------------------- */
/* Content                                                                      */
/* -------------------------------------------------------------------------- */

const STAGES = [
  { label: "applied", note: "12 mar", on: true },
  { label: "screen", note: "19 mar", on: true },
  { label: "task", note: "26 mar", on: true },
  { label: "onsite", note: "not reached", on: false },
  { label: "final", note: "not reached", on: false },
  { label: "offer", note: "not reached", on: false },
];

const OUTCOMES = [
  { label: "offer", note: "open", on: false },
  { label: "rejected", note: "open", on: false },
  { label: "ghosted", note: "open", on: false },
  { label: "withdrawn", note: "open", on: false },
];

const LOG = [
  { date: "12 mar", text: "applied through the company site" },
  { date: "19 mar", text: "recruiter screen, twenty minutes" },
  { date: "26 mar", text: "take-home sent, due in a week" },
  { date: "02 apr", text: "take-home returned" },
  { date: "05 apr", text: "reply promised by the end of the week" },
];

const INGEST_STEPS = [
  {
    index: "step 01",
    title: "paste",
    body: "Copy the text of a posting and drop it into one field. No extension, no bookmarklet, no signing in to a job board.",
  },
  {
    index: "step 02",
    title: "review",
    body: "It reads out company, role, location, and salary where the posting states one, then shows you what it found. Every field is editable before anything is written.",
  },
  {
    index: "step 03",
    title: "save",
    body: "You confirm, and it becomes an application with its first event already dated. Nothing is saved from a guess you have not looked at.",
  },
];

const DOCUMENT_PARTS = [
  {
    index: "kept once",
    title: "base resume",
    body: "One document you maintain by hand. It is the source, and it is never rewritten for you.",
  },
  {
    index: "per application",
    title: "variant",
    body: "A copy reordered and trimmed against the listing text already sitting in the record, with a note of what changed and why.",
  },
  {
    index: "per application",
    title: "cover letter",
    body: "A first pass, not a finished letter. It exists so the blank page is not the thing stopping you.",
  },
];

const CLOSED_APIS = [
  {
    index: "partner gated",
    title: "linkedin",
    body: "Job and profile data sit behind the partner programme. You apply as a company, sign an agreement, and pass review. There is no tier for one person.",
  },
  {
    index: "partner gated",
    title: "indeed",
    body: "Publisher and employer access is granted case by case to businesses. Individual search access was withdrawn years ago and has not come back.",
  },
  {
    index: "no public api",
    title: "jobstreet",
    body: "Programmatic access runs through agency and partner arrangements. There is no documented endpoint an individual can hold a key to.",
  },
];

/* -------------------------------------------------------------------------- */

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        <Hero />

        {/* ---------------------------------------------------------------- */}
        <Section
          id="tracks"
          index="01"
          kicker="what it tracks"
          titleLines={["stage and", "outcome"]}
          fieldRate={0.22}
        >
          <Reveal depth={1}>
            <Moved rate={bodyRate(0)}>
              <Prose>
                Stage is how far an application got. Outcome is how it ended. They
                are separate axes, which is why a rejection after a final round and
                a rejection after a form submission stay two different records
                instead of collapsing into one word.
              </Prose>
            </Moved>
          </Reveal>

          <div className="flex flex-col gap-s3 md:ml-[32%]">
            <Reveal depth={3}>
              <Moved rate={bodyRate(1)}>
                <Micro>stage / one square per position</Micro>
              </Moved>
            </Reveal>
            <ul className="flex flex-wrap gap-s3">
              {STAGES.map((stage, i) => (
                <AxisItem
                  key={stage.label}
                  {...stage}
                  depth={5 + i}
                  rate={bodyRate(2)}
                />
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-s3 md:ml-[32%]">
            <Reveal depth={12}>
              <Moved rate={bodyRate(3)}>
                <Micro>outcome / nothing has ended it yet</Micro>
              </Moved>
            </Reveal>
            <ul className="flex flex-wrap gap-s3">
              {OUTCOMES.map((outcome, i) => (
                <AxisItem
                  key={outcome.label}
                  {...outcome}
                  depth={13 + i}
                  rate={bodyRate(4)}
                />
              ))}
            </ul>
          </div>

          <Reveal depth={18}>
            <Moved rate={bodyRate(5)}>
              <Aside>
                An empty outcome is a real state and it is stored as one. Filled
                means reached, hollow means not reached, and the label is always
                there next to it.
              </Aside>
            </Moved>
          </Reveal>

          <div className="flex flex-col gap-s2">
            <Reveal depth={19}>
              <Moved rate={bodyRate(6)}>
                <Micro>the event log</Micro>
              </Moved>
            </Reveal>
            <Reveal depth={20}>
              <Moved rate={bodyRate(7)}>
                <Prose>
                  Every change is an event with a date on it. The list is the
                  history of the application, not a status field that overwrites
                  itself each time you touch it.
                </Prose>
              </Moved>
            </Reveal>
            <ul className="mt-s2 max-w-[60ch]">
              {LOG.map((entry, i) => (
                <LogRow
                  key={entry.date}
                  {...entry}
                  depth={21 + i}
                  rate={bodyRate(8)}
                />
              ))}
            </ul>
          </div>

          <Reveal depth={27}>
            <Moved rate={bodyRate(9)}>
              <div className={cn("flex flex-col gap-s2 border-l border-ink pl-s2")}>
                <Micro tone="ink">24 days since the last event</Micro>
                <DayStrip total={28} marked={[0, 7, 14, 21, 24]} />
                <Aside>
                  When a record goes quiet it gets a left rule and its counter moves
                  to full contrast. Nothing is sent, nothing is chased on your
                  behalf. It stops being invisible, and that is all.
                </Aside>
              </div>
            </Moved>
          </Reveal>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="ingestion"
          index="02"
          kicker="getting a job into the record"
          titleLines={["paste a", "listing"]}
          note="phase 2 / not built yet"
          align="end"
          fieldRate={-0.18}
        >
          <Reveal depth={1}>
            <Moved rate={bodyRate(0)}>
              <Prose className="ml-auto text-right">
                Typing the same six fields for the fortieth time is the reason
                people stop tracking. The answer is not automation you cannot
                inspect. It is a paste box and a review step you can argue with.
              </Prose>
            </Moved>
          </Reveal>

          <ul className="flex flex-col gap-s3 md:grid md:grid-cols-3 md:gap-s3">
            {INGEST_STEPS.map((step, i) => (
              <Block
                key={step.title}
                {...step}
                depth={3 + i * 2}
                rate={bodyRate(1)}
              />
            ))}
          </ul>

          <Reveal depth={9}>
            <Moved rate={bodyRate(2)}>
              <Aside className="ml-auto text-right">
                A screenshot of the posting can be attached and it sits in the
                record as evidence. It is never the source of a saved field.
              </Aside>
            </Moved>
          </Reveal>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="documents"
          index="03"
          kicker="resumes and cover letters"
          titleLines={["tailored", "drafts"]}
          note="phase 3 / not built yet"
          fieldRate={0.27}
        >
          <Reveal depth={1}>
            <Moved rate={bodyRate(0)}>
              <Prose className="md:ml-[24%]">
                One resume rarely fits two postings, and rewriting it by hand for
                each is the work most people skip. The plan is a base resume you
                keep once, plus a variant generated per application from the
                listing text already sitting in the record.
              </Prose>
            </Moved>
          </Reveal>

          <ul className="flex flex-col gap-s3 md:grid md:grid-cols-3">
            {DOCUMENT_PARTS.map((part, i) => (
              <Block
                key={part.title}
                {...part}
                depth={3 + i * 2}
                rate={bodyRate(1)}
              />
            ))}
          </ul>

          <Reveal depth={9}>
            <Moved rate={bodyRate(2)}>
              <Aside className="md:ml-[24%]">
                They are drafts and they stay drafts until you have read them.
                Nothing is sent from here. The app has no mailbox and no plan for
                one.
              </Aside>
            </Moved>
          </Reveal>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="no-integrations"
          index="04"
          kicker="a position, not an apology"
          titleLines={["no", "integrations"]}
          align="end"
          fieldRate={-0.25}
        >
          <Reveal depth={1}>
            <Moved rate={bodyRate(0)}>
              <Prose className="ml-auto text-right">
                LinkedIn, Indeed and JobStreet all have APIs. None of them are open
                to an individual. Access runs through a partner programme: you
                apply as a company, you sign an agreement, and you build against a
                review process. There is no key at the end of that road for one
                person tracking their own search.
              </Prose>
            </Moved>
          </Reveal>

          <ul className="flex flex-col gap-s3 md:grid md:grid-cols-3">
            {CLOSED_APIS.map((api, i) => (
              <Block
                key={api.title}
                {...api}
                depth={3 + i * 2}
                rate={bodyRate(1)}
              />
            ))}
          </ul>

          <Reveal depth={9}>
            <Moved rate={bodyRate(2)}>
              <Prose className="ml-auto text-right">
                So there is no connect button here. The only way to build one would
                be to drive a logged-in session on your behalf, which breaks the
                week a page changes and puts your account at risk in the meantime.
                Paste and type are the whole ingestion surface, and they will still
                work in a year.
              </Prose>
            </Moved>
          </Reveal>

          <Reveal depth={11}>
            <Moved rate={bodyRate(3)}>
              <Aside className="ml-auto text-right">
                If any of them opens a public API to individuals, it goes in. Until
                then, saying so plainly is worth more than a button that fails
                quietly.
              </Aside>
            </Moved>
          </Reveal>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Closing />
      </main>
    </>
  );
}

/**
 * The return to stillness.
 *
 * No ambient field, no parallax, nothing running. Reveals are opacity and a short
 * spring on first arrival and then the section holds, which is what makes the six
 * viewports of movement behind it read as deliberate.
 */
function Closing() {
  return (
    <section
      className={cn("relative flex min-h-svh flex-col justify-center py-s8", rail)}
      style={
        {
          ["--sub-cell" as string]: "clamp(2.05px, 0.4vw, 3.9px)",
        } as CSSProperties
      }
    >
      <Reveal depth={0}>
        <div className="w-full">
          <TileText text="hire me" mode="solid" />
        </div>
      </Reveal>

      <div className="mt-s8 flex justify-end">
        <div className="flex max-w-full flex-col items-end gap-s1">
          <Reveal depth={2}>
            <TileDisplay
              lines={["a record you keep", "and can read back"]}
              mode="stipple"
              dot={0.5}
              align="end"
              cell="var(--sub-cell)"
              lineGap="0.5em"
            />
          </Reveal>
          <Reveal depth={4} className="mt-s2">
            <CapsuleLink href="/applications">open the tracker</CapsuleLink>
          </Reveal>
        </div>
      </div>

      <Reveal depth={6} className="mt-s5">
        <Micro>local first / your records stay on your machine</Micro>
      </Reveal>
    </section>
  );
}
