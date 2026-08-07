import { eq } from "drizzle-orm";

import { LOCAL_USER_ID } from "../auth";
import { db } from "./index";
import {
  applicationEvents,
  applicationNotes,
  applications,
  companies,
  contacts,
  users,
  type EmploymentType,
  type EventType,
  type Outcome,
  type SalaryPeriod,
  type Stage,
  type WorkSetup,
} from "./schema";

// `./index` and `../auth` import the `server-only` marker, which throws unless the
// resolver runs with the `react-server` export condition. Next sets it; tsx does not,
// so `npm run db:seed` passes `--conditions=react-server`. Do not remove that flag.

/**
 * Development seed. Run with `npm run db:seed`.
 *
 * The fixture deliberately spans the whole state space rather than being a tidy sample:
 * every stage, every terminal outcome, every employment type, every work setup, and all
 * five salary shapes the schema allows. If a rendering path only breaks on a hourly
 * rate with no maximum, or on an application that has been silent for a month, that row
 * is in here.
 *
 * Idempotent by demolition: the local user's rows are deleted and rewritten, so running
 * it twice leaves exactly one copy. Everything hangs off `users.id` by cascade, so
 * removing the companies removes the applications, events, notes and contacts with them.
 *
 * All dates are relative to the moment it runs, so the stale row is always stale.
 */

const NOW = new Date();

/** A timestamp `days` in the past, pinned to mid-morning so timelines read naturally. */
function daysAgo(days: number, hour = 10): Date {
  const date = new Date(NOW);
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function daysAhead(days: number, hour = 10): Date {
  return daysAgo(-days, hour);
}

type SeedEvent = {
  type: EventType;
  daysAgo: number;
  fromStage?: Stage;
  toStage?: Stage;
  fromOutcome?: Outcome;
  toOutcome?: Outcome;
  detail?: string;
};

type SeedNote = {
  daysAgo: number;
  body: string;
};

type SeedContact = {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  notes?: string;
};

type SeedApplication = {
  company: string;
  title: string;
  description?: string;
  url?: string;
  source?: string;
  employmentType?: EmploymentType;
  workSetup?: WorkSetup;
  location?: string;
  salaryMin?: string;
  salaryMax?: string;
  salaryCurrency?: string;
  salaryPeriod?: SalaryPeriod;
  salaryRaw?: string;
  salaryNotDisclosed?: boolean;
  stage: Stage;
  outcome: Outcome;
  followUpDaysAhead?: number;
  followUpDaysAgo?: number;
  events: SeedEvent[];
  notes?: SeedNote[];
  contacts?: SeedContact[];
};

type SeedCompany = {
  name: string;
  website?: string;
  location?: string;
  notes?: string;
};

const SEED_COMPANIES: SeedCompany[] = [
  {
    name: "Kalibrr",
    website: "https://www.kalibrr.com",
    location: "Makati City, Philippines",
    notes: "Office is a short walk from Ayala station. Recruiters reply fast.",
  },
  {
    name: "Sprout Solutions",
    website: "https://sprout.ph",
    location: "Pasig City, Philippines",
    notes: "HR tech. Two open roles at once, same recruiter handles both.",
  },
  {
    name: "Northlane Labs",
    website: "https://northlanelabs.example.com",
    location: "Remote, US hours",
    notes: "Fully async. Interviews are recorded, not live, except the final.",
  },
  {
    name: "Cebu Data Works",
    website: "https://cebudataworks.example.com",
    location: "Cebu City, Philippines",
    notes: "Onsite four days a week. Would mean relocating.",
  },
  {
    name: "Verdant Ledger",
    website: "https://verdantledger.example.com",
    location: "Singapore",
    notes: "Fintech. Pays in SGD, would need a work pass.",
  },
  {
    name: "PayHive",
    website: "https://payhive.example.com",
    location: "Remote",
    notes: "Never disclosed a number at any point in the process.",
  },
  {
    name: "Orbital Bricks",
    location: "Bonifacio Global City, Taguig, Philippines",
    notes: "Went quiet after the screening call. No reply to two follow-ups.",
  },
  {
    name: "Meridian Health Systems",
    website: "https://meridianhealth.example.com",
    location: "Remote, EU hours",
    notes: "Healthcare. Long process but every step was scheduled in advance.",
  },
];

const SEED_APPLICATIONS: SeedApplication[] = [
  /* Saved, never sent. Structured PHP monthly range. */
  {
    company: "Kalibrr",
    title: "Frontend Engineer",
    description: "React and TypeScript on their candidate-facing product.",
    url: "https://www.kalibrr.com/c/kalibrr/jobs/frontend-engineer",
    source: "jobstreet",
    employmentType: "full_time",
    workSetup: "hybrid",
    location: "Makati City, Philippines",
    salaryMin: "70000.00",
    salaryMax: "95000.00",
    salaryCurrency: "PHP",
    salaryPeriod: "monthly",
    stage: "saved",
    outcome: "active",
    events: [{ type: "created", daysAgo: 2, toStage: "saved", toOutcome: "active" }],
    notes: [
      {
        daysAgo: 2,
        body: "Tailor the CV before sending. They want design-system experience up top.",
      },
    ],
  },

  /* Applied and waiting. */
  {
    company: "Sprout Solutions",
    title: "Senior React Developer",
    description: "Payroll product front end, small team, ships weekly.",
    url: "https://sprout.ph/careers/senior-react-developer",
    source: "jobstreet",
    employmentType: "full_time",
    workSetup: "remote",
    location: "Remote, Philippines",
    salaryMin: "90000.00",
    salaryMax: "130000.00",
    salaryCurrency: "PHP",
    salaryPeriod: "monthly",
    stage: "applied",
    outcome: "active",
    events: [
      { type: "created", daysAgo: 7, toStage: "saved", toOutcome: "active" },
      { type: "stage_change", daysAgo: 6, fromStage: "saved", toStage: "applied" },
    ],
    notes: [{ daysAgo: 6, body: "Applied through their own site, not the job board." }],
  },

  /* Contract, remote, USD annual. Follow-up scheduled for the future. */
  {
    company: "Northlane Labs",
    title: "Full Stack Engineer",
    description: "Six month contract with a stated intent to convert.",
    url: "https://northlanelabs.example.com/jobs/full-stack-engineer",
    source: "linkedin",
    employmentType: "contract",
    workSetup: "remote",
    location: "Remote",
    salaryMin: "60000.00",
    salaryMax: "85000.00",
    salaryCurrency: "USD",
    salaryPeriod: "annual",
    stage: "screening",
    outcome: "active",
    followUpDaysAhead: 3,
    events: [
      { type: "created", daysAgo: 22, toStage: "saved", toOutcome: "active" },
      { type: "stage_change", daysAgo: 20, fromStage: "saved", toStage: "applied" },
      {
        type: "stage_change",
        daysAgo: 11,
        fromStage: "applied",
        toStage: "screening",
        detail: "Async intro questions, recorded video reply.",
      },
      { type: "contact_added", daysAgo: 11, detail: "Dana Okonjo (Talent Partner)" },
      { type: "follow_up_set", daysAgo: 4, detail: "Chase the recruiter if nothing lands." },
    ],
    notes: [
      {
        daysAgo: 11,
        body: "Recorded answers went long. Keep the next one under three minutes.",
      },
      { daysAgo: 4, body: "Recruiter said a decision would come this week." },
    ],
    contacts: [
      {
        name: "Dana Okonjo",
        role: "Talent Partner",
        email: "dana@northlanelabs.example.com",
        notes: "Only replies in the mornings, US eastern.",
      },
    ],
  },

  /* Onsite Cebu. Follow-up already overdue. */
  {
    company: "Cebu Data Works",
    title: "Backend Engineer",
    description: "Node and Postgres, data pipelines for logistics clients.",
    source: "jobstreet",
    employmentType: "full_time",
    workSetup: "onsite",
    location: "Cebu City, Philippines",
    salaryMin: "65000.00",
    salaryMax: "85000.00",
    salaryCurrency: "PHP",
    salaryPeriod: "monthly",
    stage: "first_interview",
    outcome: "active",
    followUpDaysAgo: 2,
    events: [
      { type: "created", daysAgo: 26, toStage: "saved", toOutcome: "active" },
      { type: "stage_change", daysAgo: 25, fromStage: "saved", toStage: "applied" },
      { type: "stage_change", daysAgo: 18, fromStage: "applied", toStage: "screening" },
      {
        type: "stage_change",
        daysAgo: 9,
        fromStage: "screening",
        toStage: "first_interview",
        detail: "Video call with the engineering manager.",
      },
      { type: "follow_up_set", daysAgo: 9, detail: "Ask about the relocation package." },
    ],
    notes: [
      {
        daysAgo: 9,
        body: "Relocation is the whole question here. They hinted at an allowance but gave no figure.",
      },
    ],
    contacts: [
      {
        name: "Marlon Sy",
        role: "Engineering Manager",
        email: "marlon.sy@cebudataworks.example.com",
        phone: "+63 32 555 0142",
      },
    ],
  },

  /* Mid-process, SGD monthly, hybrid abroad. */
  {
    company: "Verdant Ledger",
    title: "Platform Engineer",
    description: "Ledger services, heavy on correctness and audit trails.",
    url: "https://verdantledger.example.com/careers/platform-engineer",
    source: "referral",
    employmentType: "full_time",
    workSetup: "hybrid",
    location: "Singapore",
    salaryMin: "7000.00",
    salaryMax: "9500.00",
    salaryCurrency: "SGD",
    salaryPeriod: "monthly",
    stage: "technical",
    outcome: "active",
    events: [
      { type: "created", daysAgo: 31, toStage: "saved", toOutcome: "active" },
      { type: "stage_change", daysAgo: 30, fromStage: "saved", toStage: "applied" },
      { type: "stage_change", daysAgo: 24, fromStage: "applied", toStage: "screening" },
      { type: "stage_change", daysAgo: 15, fromStage: "screening", toStage: "first_interview" },
      {
        type: "stage_change",
        daysAgo: 3,
        fromStage: "first_interview",
        toStage: "technical",
        detail: "Take-home, four hours, ledger reconciliation.",
      },
      { type: "contact_added", daysAgo: 24, detail: "Priya Raman (Technical Recruiter)" },
    ],
    notes: [
      { daysAgo: 15, body: "Referral came from Aldrin. Mention him again if it stalls." },
      { daysAgo: 3, body: "Take-home is due in a week. Budget two evenings." },
    ],
    contacts: [
      {
        name: "Priya Raman",
        role: "Technical Recruiter",
        email: "priya.raman@verdantledger.example.com",
      },
    ],
  },

  /* Rejected after the technical. Salary was never disclosed. */
  {
    company: "PayHive",
    title: "Senior Frontend Engineer",
    description: "Merchant dashboard rebuild.",
    url: "https://payhive.example.com/jobs/senior-frontend-engineer",
    source: "linkedin",
    employmentType: "full_time",
    workSetup: "remote",
    location: "Remote",
    salaryNotDisclosed: true,
    stage: "technical",
    outcome: "rejected",
    events: [
      { type: "created", daysAgo: 40, toStage: "saved", toOutcome: "active" },
      { type: "stage_change", daysAgo: 39, fromStage: "saved", toStage: "applied" },
      { type: "stage_change", daysAgo: 33, fromStage: "applied", toStage: "screening" },
      { type: "stage_change", daysAgo: 26, fromStage: "screening", toStage: "first_interview" },
      { type: "stage_change", daysAgo: 19, fromStage: "first_interview", toStage: "technical" },
      {
        type: "outcome_change",
        daysAgo: 12,
        fromOutcome: "active",
        toOutcome: "rejected",
        detail: "Live coding round. Said they went with someone with more payments experience.",
      },
    ],
    notes: [
      {
        daysAgo: 12,
        body: "Fair result. I stalled on the idempotency question and never recovered.",
      },
    ],
  },

  /* Ghosted, silent for a month. This is the row that proves stale rendering works. */
  {
    company: "Orbital Bricks",
    title: "React Native Developer",
    description: "Consumer app, two person mobile team.",
    source: "jobstreet",
    employmentType: "full_time",
    workSetup: "onsite",
    location: "Bonifacio Global City, Taguig, Philippines",
    salaryRaw: "competitive",
    stage: "screening",
    outcome: "ghosted",
    events: [
      { type: "created", daysAgo: 54, toStage: "saved", toOutcome: "active" },
      { type: "stage_change", daysAgo: 53, fromStage: "saved", toStage: "applied" },
      {
        type: "stage_change",
        daysAgo: 45,
        fromStage: "applied",
        toStage: "screening",
        detail: "Twenty minute phone screen.",
      },
      { type: "follow_up_set", daysAgo: 38, detail: "No reply since the screen." },
      { type: "follow_up_cleared", daysAgo: 31, detail: "Chased twice, nothing came back." },
      {
        type: "outcome_change",
        daysAgo: 30,
        fromOutcome: "active",
        toOutcome: "ghosted",
        detail: "Marking this dead. Two follow-ups, no reply.",
      },
    ],
    notes: [{ daysAgo: 31, body: "Second follow-up sent. Giving it one more week." }],
  },

  /* Deep in the process, USD annual, remote. */
  {
    company: "Meridian Health Systems",
    title: "Software Engineer II",
    description: "Patient scheduling platform. Regulated, slow, well organised.",
    url: "https://meridianhealth.example.com/careers/software-engineer-ii",
    source: "referral",
    employmentType: "full_time",
    workSetup: "remote",
    location: "Remote",
    salaryMin: "95000.00",
    salaryMax: "120000.00",
    salaryCurrency: "USD",
    salaryPeriod: "annual",
    stage: "final",
    outcome: "active",
    followUpDaysAhead: 5,
    events: [
      { type: "created", daysAgo: 48, toStage: "saved", toOutcome: "active" },
      { type: "stage_change", daysAgo: 47, fromStage: "saved", toStage: "applied" },
      { type: "stage_change", daysAgo: 41, fromStage: "applied", toStage: "screening" },
      { type: "stage_change", daysAgo: 34, fromStage: "screening", toStage: "first_interview" },
      { type: "stage_change", daysAgo: 21, fromStage: "first_interview", toStage: "technical" },
      { type: "stage_change", daysAgo: 11, fromStage: "technical", toStage: "behavioral" },
      {
        type: "stage_change",
        daysAgo: 1,
        fromStage: "behavioral",
        toStage: "final",
        detail: "Panel with the platform team and the director.",
      },
      { type: "contact_added", daysAgo: 41, detail: "Ines Duarte (Recruiting Lead)" },
      { type: "contact_added", daysAgo: 11, detail: "Tom Bayliss (Director of Engineering)" },
    ],
    notes: [
      { daysAgo: 21, body: "Technical was a system design walkthrough, no live coding." },
      {
        daysAgo: 1,
        body: "Final is a panel. Prepare the scheduling conflict story and one question each.",
      },
    ],
    contacts: [
      {
        name: "Ines Duarte",
        role: "Recruiting Lead",
        email: "ines.duarte@meridianhealth.example.com",
        notes: "Schedules everything a week ahead. Very reliable.",
      },
      {
        name: "Tom Bayliss",
        role: "Director of Engineering",
        email: "tom.bayliss@meridianhealth.example.com",
      },
    ],
  },

  /* Offer, accepted. The one that worked. */
  {
    company: "Northlane Labs",
    title: "Design Engineer",
    description: "Design system and front-end platform work.",
    url: "https://northlanelabs.example.com/jobs/design-engineer",
    source: "linkedin",
    employmentType: "full_time",
    workSetup: "remote",
    location: "Remote",
    salaryMin: "110000.00",
    salaryMax: "135000.00",
    salaryCurrency: "USD",
    salaryPeriod: "annual",
    stage: "offer",
    outcome: "accepted",
    events: [
      { type: "created", daysAgo: 60, toStage: "saved", toOutcome: "active" },
      { type: "stage_change", daysAgo: 59, fromStage: "saved", toStage: "applied" },
      { type: "stage_change", daysAgo: 52, fromStage: "applied", toStage: "screening" },
      { type: "stage_change", daysAgo: 44, fromStage: "screening", toStage: "first_interview" },
      { type: "stage_change", daysAgo: 36, fromStage: "first_interview", toStage: "technical" },
      { type: "stage_change", daysAgo: 27, fromStage: "technical", toStage: "final" },
      {
        type: "stage_change",
        daysAgo: 14,
        fromStage: "final",
        toStage: "offer",
        detail: "Verbal offer at the top of the band.",
      },
      {
        type: "outcome_change",
        daysAgo: 5,
        fromOutcome: "active",
        toOutcome: "accepted",
        detail: "Signed. Start date agreed for the first of next month.",
      },
    ],
    notes: [
      { daysAgo: 14, body: "Asked for 135 and they did not blink. Should have asked for more." },
      { daysAgo: 5, body: "Contract signed. Tell the others still in flight." },
    ],
    contacts: [
      {
        name: "Dana Okonjo",
        role: "Talent Partner",
        email: "dana@northlanelabs.example.com",
        notes: "Same recruiter as the contract role.",
      },
    ],
  },

  /* Withdrawn part-time role, PHP monthly. */
  {
    company: "Sprout Solutions",
    title: "QA Automation Engineer",
    description: "Playwright suites for the payroll product.",
    source: "jobstreet",
    employmentType: "part_time",
    workSetup: "hybrid",
    location: "Pasig City, Philippines",
    salaryMin: "45000.00",
    salaryMax: "60000.00",
    salaryCurrency: "PHP",
    salaryPeriod: "monthly",
    stage: "behavioral",
    outcome: "withdrawn",
    events: [
      { type: "created", daysAgo: 35, toStage: "saved", toOutcome: "active" },
      { type: "stage_change", daysAgo: 34, fromStage: "saved", toStage: "applied" },
      { type: "stage_change", daysAgo: 29, fromStage: "applied", toStage: "screening" },
      { type: "stage_change", daysAgo: 23, fromStage: "screening", toStage: "behavioral" },
      {
        type: "outcome_change",
        daysAgo: 16,
        fromOutcome: "active",
        toOutcome: "withdrawn",
        detail: "Pulled out. Part time hours would not have covered rent.",
      },
    ],
    notes: [
      {
        daysAgo: 16,
        body: "Told the recruiter honestly it was the hours, not the work. Left the door open.",
      },
    ],
  },

  /* Internship, daily rate, silent for three weeks. Second stale row. */
  {
    company: "Kalibrr",
    title: "Frontend Intern",
    description: "Six month internship on the careers site.",
    source: "jobstreet",
    employmentType: "internship",
    workSetup: "onsite",
    location: "Makati City, Philippines",
    salaryMin: "800.00",
    salaryMax: "1200.00",
    salaryCurrency: "PHP",
    salaryPeriod: "daily",
    stage: "applied",
    outcome: "active",
    events: [
      { type: "created", daysAgo: 24, toStage: "saved", toOutcome: "active" },
      { type: "stage_change", daysAgo: 22, fromStage: "saved", toStage: "applied" },
    ],
    notes: [{ daysAgo: 22, body: "Long shot, but it is the same team as the engineer role." }],
  },

  /* Freelance, hourly, minimum only and no maximum. */
  {
    company: "Cebu Data Works",
    title: "Freelance UI Developer",
    description: "Short engagement rebuilding an internal dashboard.",
    source: "referral",
    employmentType: "freelance",
    workSetup: "remote",
    location: "Remote, Philippines",
    salaryMin: "1200.00",
    salaryCurrency: "PHP",
    salaryPeriod: "hourly",
    salaryRaw: "1,200/hr, 20 hours a week, reviewed monthly",
    stage: "saved",
    outcome: "active",
    events: [{ type: "created", daysAgo: 8, toStage: "saved", toOutcome: "active" }],
    notes: [
      {
        daysAgo: 8,
        body: "Would sit alongside a full time role. Only worth it if the backend role falls through.",
      },
    ],
  },
];

/** Applied-at is the first moment the application left `saved`. */
function deriveAppliedAt(events: SeedEvent[]): Date | null {
  const applied = events
    .filter((event) => event.toStage !== undefined && event.toStage !== "saved")
    .sort((a, b) => b.daysAgo - a.daysAgo)[0];

  return applied ? daysAgo(applied.daysAgo) : null;
}

/**
 * Last activity is derived rather than declared, so the fixture cannot claim a silence
 * the timeline contradicts. Notes count, matching what the note actions do at runtime.
 */
function deriveLastActivityAt(definition: SeedApplication): Date {
  const candidates = [
    ...definition.events.map((event) => event.daysAgo),
    ...(definition.notes ?? []).map((note) => note.daysAgo),
  ];

  return daysAgo(Math.min(...candidates));
}

async function seed(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({
        id: LOCAL_USER_ID,
        name: "You",
        staleThresholdDays: 14,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { name: "You", updatedAt: new Date() },
      });

    // Everything else cascades from these two deletes, which is what makes re-running
    // safe rather than duplicating the whole fixture.
    await tx.delete(applications).where(eq(applications.userId, LOCAL_USER_ID));
    await tx.delete(companies).where(eq(companies.userId, LOCAL_USER_ID));

    const insertedCompanies = await tx
      .insert(companies)
      .values(
        SEED_COMPANIES.map((company) => ({
          userId: LOCAL_USER_ID,
          name: company.name,
          website: company.website ?? null,
          location: company.location ?? null,
          notes: company.notes ?? null,
        })),
      )
      .returning({ id: companies.id, name: companies.name });

    const companyIdByName = new Map(insertedCompanies.map((row) => [row.name, row.id]));

    for (const definition of SEED_APPLICATIONS) {
      const companyId = companyIdByName.get(definition.company);
      if (!companyId) {
        throw new Error(
          `Seed application "${definition.title}" references unknown company "${definition.company}".`,
        );
      }

      const lastActivityAt = deriveLastActivityAt(definition);

      const [application] = await tx
        .insert(applications)
        .values({
          userId: LOCAL_USER_ID,
          companyId,
          title: definition.title,
          description: definition.description ?? null,
          url: definition.url ?? null,
          source: definition.source ?? null,
          employmentType: definition.employmentType ?? null,
          workSetup: definition.workSetup ?? null,
          location: definition.location ?? null,
          salaryMin: definition.salaryMin ?? null,
          salaryMax: definition.salaryMax ?? null,
          salaryCurrency: definition.salaryCurrency ?? null,
          salaryPeriod: definition.salaryPeriod ?? null,
          salaryRaw: definition.salaryRaw ?? null,
          salaryNotDisclosed: definition.salaryNotDisclosed ?? false,
          stage: definition.stage,
          outcome: definition.outcome,
          appliedAt: deriveAppliedAt(definition.events),
          lastActivityAt,
          followUpAt:
            definition.followUpDaysAhead !== undefined
              ? daysAhead(definition.followUpDaysAhead)
              : definition.followUpDaysAgo !== undefined
                ? daysAgo(definition.followUpDaysAgo)
                : null,
          createdAt: daysAgo(Math.max(...definition.events.map((event) => event.daysAgo))),
          updatedAt: lastActivityAt,
        })
        .returning({ id: applications.id });

      await tx.insert(applicationEvents).values(
        definition.events.map((event) => ({
          userId: LOCAL_USER_ID,
          applicationId: application.id,
          type: event.type,
          fromStage: event.fromStage ?? null,
          toStage: event.toStage ?? null,
          fromOutcome: event.fromOutcome ?? null,
          toOutcome: event.toOutcome ?? null,
          detail: event.detail ?? null,
          occurredAt: daysAgo(event.daysAgo),
          createdAt: daysAgo(event.daysAgo),
        })),
      );

      if (definition.notes && definition.notes.length > 0) {
        await tx.insert(applicationNotes).values(
          definition.notes.map((note) => ({
            userId: LOCAL_USER_ID,
            applicationId: application.id,
            body: note.body,
            createdAt: daysAgo(note.daysAgo),
            updatedAt: daysAgo(note.daysAgo),
          })),
        );
      }

      if (definition.contacts && definition.contacts.length > 0) {
        await tx.insert(contacts).values(
          definition.contacts.map((contact) => ({
            userId: LOCAL_USER_ID,
            applicationId: application.id,
            name: contact.name,
            role: contact.role ?? null,
            email: contact.email ?? null,
            phone: contact.phone ?? null,
            notes: contact.notes ?? null,
          })),
        );
      }
    }
  });

  const companyCount = SEED_COMPANIES.length;
  const applicationCount = SEED_APPLICATIONS.length;
  console.log(`Seeded ${applicationCount} applications across ${companyCount} companies.`);
}

seed()
  .then(() => {
    // The pg pool keeps the event loop alive and it is not exported from the db module,
    // so the script exits explicitly rather than hanging after a successful run.
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("Seed failed.");
    console.error(error);
    process.exit(1);
  });
