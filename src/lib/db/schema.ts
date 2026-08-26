import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { MatchBreakdown } from "@/lib/domain/match";

/* ---------------------------------------------------------------------------
 * Enums
 *
 * `stage` and `outcome` are two independent axes on purpose. A flat status field
 * cannot express "rejected, and it happened after the technical round", which is
 * most of what a real job search consists of.
 * ------------------------------------------------------------------------- */

export const stageEnum = pgEnum("stage", [
  "saved",
  "applied",
  "screening",
  "first_interview",
  "technical",
  "behavioral",
  "final",
  "offer",
]);

export const outcomeEnum = pgEnum("outcome", [
  "active",
  "rejected",
  "ghosted",
  "withdrawn",
  "accepted",
  "declined",
]);

export const employmentTypeEnum = pgEnum("employment_type", [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "freelance",
  "temporary",
]);

export const workSetupEnum = pgEnum("work_setup", ["onsite", "hybrid", "remote"]);

export const salaryPeriodEnum = pgEnum("salary_period", [
  "hourly",
  "daily",
  "monthly",
  "annual",
]);

export const eventTypeEnum = pgEnum("event_type", [
  "created",
  "stage_change",
  "outcome_change",
  "follow_up_set",
  "follow_up_cleared",
  "contact_added",
  "document_sent",
]);

/** Ordered stage progression. Index position drives the tile stage strip in the UI. */
export const STAGE_ORDER = stageEnum.enumValues;

/** Outcomes that mean the application is no longer moving. */
export const TERMINAL_OUTCOMES = [
  "rejected",
  "ghosted",
  "withdrawn",
  "accepted",
  "declined",
] as const;

/* ---------------------------------------------------------------------------
 * users
 *
 * Single-user stub for v1. Every table carries `userId` so adding real auth later
 * is swapping the resolver in `src/lib/auth.ts`, not a migration.
 * ------------------------------------------------------------------------- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email"),
  /** Days of silence before an application is flagged stale. */
  staleThresholdDays: integer("stale_threshold_days").notNull().default(14),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ---------------------------------------------------------------------------
 * resumes
 *
 * What every application is scored against. Versioned rather than a column on `users`
 * because a score is only meaningful next to the resume that produced it: rewrite your
 * resume and last month's 82 is a claim about a document that no longer exists.
 * `matchResumeId` on an application points back here so the UI can say which one answered.
 * ------------------------------------------------------------------------- */

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Yours to recognise it by: "aug 2026, backend-leaning". */
    label: text("label").notNull(),
    /** The whole resume as plain text. This is what the model actually reads. */
    rawText: text("raw_text").notNull(),
    /** Exactly one active resume per user, enforced by a partial unique index below. */
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("resumes_user_idx").on(t.userId),
    // Partial: only the active row participates, so any number of inactive versions can
    // sit alongside it. Without the predicate this would allow exactly one resume, total.
    uniqueIndex("resumes_active_key")
      .on(t.userId)
      .where(sql`${t.isActive}`),
  ],
);

/* ---------------------------------------------------------------------------
 * companies
 * ------------------------------------------------------------------------- */

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    website: text("website"),
    location: text("location"),
    /** Company-level observations: "recruiter is slow", "onsite is in BGC". */
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("companies_user_name_key").on(t.userId, sql`lower(${t.name})`),
    index("companies_user_idx").on(t.userId),
  ],
);

/* ---------------------------------------------------------------------------
 * applications
 * ------------------------------------------------------------------------- */

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    /** Short description, not the full posting. */
    description: text("description"),
    /** Stored so you can reread the posting. Never fetched by the app. */
    url: text("url"),
    /** Where the listing came from: linkedin, indeed, jobstreet, referral, other. */
    source: text("source"),

    employmentType: employmentTypeEnum("employment_type"),
    workSetup: workSetupEnum("work_setup"),
    location: text("location"),

    /* Salary. Structured for sorting, plus the original text so the AI never has to
       invent a number it did not see. Comparisons happen within a currency. */
    salaryMin: numeric("salary_min", { precision: 14, scale: 2 }),
    salaryMax: numeric("salary_max", { precision: 14, scale: 2 }),
    salaryCurrency: text("salary_currency"),
    salaryPeriod: salaryPeriodEnum("salary_period"),
    /** Verbatim from the posting: "competitive", "up to 120k + equity". */
    salaryRaw: text("salary_raw"),
    salaryNotDisclosed: boolean("salary_not_disclosed").notNull().default(false),

    /* Match score.

       `listingText` is the posting as it was pasted, and it is what makes the rest of
       this block possible at all: paste-to-fill only ever kept a two-sentence summary,
       and you cannot score a resume against a summary. It is also the only way to
       re-score later, when the resume changes. Null on every row saved before this
       existed, which is exactly why every column here is nullable — those read as
       "not scored" rather than as a zero. */
    listingText: text("listing_text"),
    /** 0-100. Null means never scored, which is not the same as scoring zero. */
    matchScore: integer("match_score"),
    /** Dimensions, per-requirement coverage and evidence. Shape: `MatchBreakdown`. */
    matchBreakdown: jsonb("match_breakdown").$type<MatchBreakdown>(),
    /** Which resume produced the score, so the UI can flag it stale after a rewrite. */
    matchResumeId: uuid("match_resume_id").references(() => resumes.id, {
      onDelete: "set null",
    }),
    matchScoredAt: timestamp("match_scored_at", { withTimezone: true }),

    stage: stageEnum("stage").notNull().default("saved"),
    outcome: outcomeEnum("outcome").notNull().default("active"),

    appliedAt: timestamp("applied_at", { withTimezone: true }),
    /** Denormalized from events and notes so stale sorting is a plain index scan. */
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    followUpAt: timestamp("follow_up_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("applications_user_idx").on(t.userId),
    index("applications_company_idx").on(t.companyId),
    index("applications_stale_idx").on(t.userId, t.lastActivityAt),
    index("applications_stage_idx").on(t.userId, t.stage, t.outcome),
    index("applications_follow_up_idx").on(t.userId, t.followUpAt),
    // Sorting the list by fit is the point of the feature, so it gets an index rather
    // than a sequential scan that grows with every application you ever saved.
    index("applications_match_idx").on(t.userId, t.matchScore),
  ],
);

/* ---------------------------------------------------------------------------
 * application_events
 *
 * Append-only. System-authored. This is the record of what happened and when, and
 * it is what makes "rejected after the technical" and "silent for 24 days" answerable.
 * Never updated, never deleted except by cascade.
 * ------------------------------------------------------------------------- */

export const applicationEvents = pgTable(
  "application_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),

    type: eventTypeEnum("type").notNull(),

    fromStage: stageEnum("from_stage"),
    toStage: stageEnum("to_stage"),
    fromOutcome: outcomeEnum("from_outcome"),
    toOutcome: outcomeEnum("to_outcome"),

    /** Free text detail, e.g. "panel with the platform team". */
    detail: text("detail"),

    /** When it actually happened. Distinct from createdAt, since you can log late. */
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("events_application_idx").on(t.applicationId, t.occurredAt),
    index("events_user_idx").on(t.userId, t.occurredAt),
  ],
);

/* ---------------------------------------------------------------------------
 * application_notes
 *
 * User-authored and editable, unlike events. Interview prep, salary discussions,
 * things you want to reread before a call. The detail panel merges notes and events
 * into a single timeline for display.
 * ------------------------------------------------------------------------- */

export const applicationNotes = pgTable(
  "application_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("notes_application_idx").on(t.applicationId, t.createdAt)],
);

/* ---------------------------------------------------------------------------
 * contacts
 * ------------------------------------------------------------------------- */

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** "Technical recruiter", "Hiring manager". */
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("contacts_application_idx").on(t.applicationId)],
);

/* ---------------------------------------------------------------------------
 * Relations
 * ------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  companies: many(companies),
  applications: many(applications),
  resumes: many(resumes),
}));

export const resumesRelations = relations(resumes, ({ one }) => ({
  user: one(users, { fields: [resumes.userId], references: [users.id] }),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  user: one(users, { fields: [companies.userId], references: [users.id] }),
  applications: many(applications),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  user: one(users, { fields: [applications.userId], references: [users.id] }),
  company: one(companies, {
    fields: [applications.companyId],
    references: [companies.id],
  }),
  events: many(applicationEvents),
  notes: many(applicationNotes),
  contacts: many(contacts),
}));

export const applicationEventsRelations = relations(applicationEvents, ({ one }) => ({
  application: one(applications, {
    fields: [applicationEvents.applicationId],
    references: [applications.id],
  }),
}));

export const applicationNotesRelations = relations(applicationNotes, ({ one }) => ({
  application: one(applications, {
    fields: [applicationNotes.applicationId],
    references: [applications.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  application: one(applications, {
    fields: [contacts.applicationId],
    references: [applications.id],
  }),
}));

/* ---------------------------------------------------------------------------
 * Inferred types
 * ------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type ApplicationEvent = typeof applicationEvents.$inferSelect;
export type NewApplicationEvent = typeof applicationEvents.$inferInsert;
export type ApplicationNote = typeof applicationNotes.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Resume = typeof resumes.$inferSelect;
export type NewResume = typeof resumes.$inferInsert;

export type Stage = (typeof stageEnum.enumValues)[number];
export type Outcome = (typeof outcomeEnum.enumValues)[number];
export type EmploymentType = (typeof employmentTypeEnum.enumValues)[number];
export type WorkSetup = (typeof workSetupEnum.enumValues)[number];
export type SalaryPeriod = (typeof salaryPeriodEnum.enumValues)[number];
export type EventType = (typeof eventTypeEnum.enumValues)[number];
