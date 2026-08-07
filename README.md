# hire-me

A local-first job application tracker. Your resume, salary figures, and application
history stay on your own machine and in your own Postgres.

## Status

**Phase 1 is built: the tracker.** Schema, full CRUD (including delete, with
confirmation on anything irreversible), the dense table view with filtering and
sorting, stage and outcome as independent axes, the append-only event log, companies,
editable notes, contacts, follow-up reminders, and stale detection.

| Route | What it does |
| --- | --- |
| `/` | Marketing page |
| `/applications` | Dense sortable, filterable table. Quiet records carry a left rule. |
| `/applications/new` | Create by hand |
| `/applications/[id]` | Detail: stage strip, meta, merged history, notes, contacts, follow-up, delete |
| `/applications/[id]/edit` | Edit |
| `/companies` | Companies with application counts, last activity, edit and delete |
| `/companies/[id]/edit` | Edit a company's details |

Deleting a company is refused while it still has applications, with the exact count
surfaced in the confirmation dialog rather than failing silently. Deleting an
application cascades to its own events, notes and contacts, so it's behind a
confirmation dialog too. Notes are the one editable, deletable half of the timeline;
events are permanent by design, since they're the record of what actually happened.

Phase 2: paste screenshots or text of a job listing, have the fields extracted, review
and confirm before saving, with duplicate detection.

Phase 3: parse your resume into a structured master, tailor it against a posting with a
diff against the master, generate cover letters, export to PDF and DOCX.

## What it deliberately does not do

**It does not connect to LinkedIn, Indeed, or JobStreet.** Not an oversight:

- LinkedIn closed public API access in 2015. Job APIs are Partner Program only, and are
  explicitly closed to new partners. Their personal data export does not include the jobs
  you applied to.
- Indeed retired its public Publisher API and XML feeds in 2024. What remains needs a
  signed developer agreement and is built for employers receiving applicants, not for you
  tracking your own applications.
- JobStreet (SEEK) requires an integration request and partner credentials, and is also
  employer-side.

Scraping them violates their terms of service and gets accounts restricted. The one
automation path that actually works for an individual is reading your own inbox, since all
three email you when you apply and when your status changes. That is a later phase.

## Setup

Requires Node 22+ and a local PostgreSQL 18 instance.

```bash
npm install
```

Create the database:

```bash
createdb -U postgres hire_me
```

Copy `.env.example` to `.env.local` and set `DATABASE_URL` to your own credentials.
`.env.local` is gitignored and should stay that way.

Apply the schema and load sample data:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Then:

```bash
npm run dev
```

## Inspecting the database with pgAdmin

pgAdmin 4 ships with the PostgreSQL 18 installer, so if you installed Postgres that way
you already have it (`C:\Program Files\pgAdmin 4`, or search Start for "pgAdmin 4").

1. Open pgAdmin 4. On first launch it asks for a **master password** — this only locks
   pgAdmin's own saved-connection store on your machine and is unrelated to your Postgres
   password.
2. In the left tree, right-click **Servers** > **Register** > **Server...**
3. **General tab**: Name it whatever you like, e.g. `local`.
4. **Connection tab**:
   - Host name/address: `localhost`
   - Port: `5432`
   - Maintenance database: `postgres`
   - Username: `postgres` (or whatever role you used in `DATABASE_URL`)
   - Password: the same password from your `DATABASE_URL` in `.env.local`
   - Tick "Save password" if you don't want to retype it every time.
5. Save. Expand the new server > **Databases** > `hire_me` > **Schemas** > `public` >
   **Tables** to see `applications`, `application_events`, `application_notes`,
   `companies`, `contacts`, `users`.
6. To run a query instead of browsing: select the `hire_me` database, then **Tools** >
   **Query Tool** (or the lightning-bolt icon), and run e.g.
   `select title, stage, outcome from applications order by last_activity_at desc;`

If `hire_me` doesn't appear under Databases, you haven't run `createdb -U postgres
hire_me` yet, or you created it under a different Postgres user than the one you
registered here — right-click **Databases** > **Refresh** after creating it.

pgAdmin is read/write, same as `psql` — anything you change there changes what the app
sees. `npm run db:studio` (Drizzle Studio) is a lighter-weight alternative that opens in
the browser and understands the schema's enums and relations natively, if you'd rather
use that day to day and keep pgAdmin for one-off SQL.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a migration from `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Reset and reseed the local user's data |
| `npm run db:studio` | Drizzle Studio |

## Architecture

```
src/lib/db/schema.ts     the data contract. Stage and outcome are independent axes.
src/lib/auth.ts          the auth seam. v1 resolves one local user; swap the body to add real auth.
src/lib/queries/         read-only, server-only, always scoped by currentUserId()
src/lib/actions/         server actions. Stage changes write the row and the event in one transaction.
src/lib/domain/          pure logic: stage progression, salary formatting, staleness
src/lib/tile-font.ts     glyph data for the generative display type
src/components/type/     the tile renderer
src/components/ui/       design system primitives
src/components/motion/   reveal and parallax
```

Every table carries `user_id` and every query scopes by it, so moving to a hosted
multi-user deployment is a change to `src/lib/auth.ts` rather than a migration.

## Design

[DESIGN.md](DESIGN.md) is the binding visual contract. Read it before changing anything
visual. It has a short list of anti-patterns that are rejected on sight, including any
chromatic colour, a second font weight, and motion that survives
`prefers-reduced-motion`.

Display type is not a font file. It is glyph data on a 5x8 square cell grid plus a
renderer, so the interface demonstrates its grid system rather than describing it.
