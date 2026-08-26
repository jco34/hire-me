<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Environment

Paste-to-fill ingestion reads `GEMINI_API_KEY` (Google AI Studio free tier) from `.env.local`, server-side only. See `.env.example`.

## Claude fallback

When Gemini is overloaded, rate-limited, or unreachable, every model-backed action falls
back to Claude Code running headless as a local child process. A Claude Pro subscription is
not API access — there is no key for this — so the fallback works only on a machine where
someone is already logged in via `claude`. **Never enable it on a deployed instance.**

All three call sites share one chain (`runExtraction` in `src/lib/ingest/run.ts`):
paste-to-fill (`actions/ingest.ts`), re-scoring (`actions/rescore.ts`), and resume
transcription (`actions/resumes.ts`). Response shapes live in `src/lib/ingest/shapes.ts` —
each one pairs the hand-written Gemini `responseSchema` with the zod schema Claude derives
its JSON Schema from, deliberately adjacent so the two cannot drift.

| Variable | Effect |
| --- | --- |
| `INGEST_CLAUDE_FALLBACK=1` | Turns the fallback on. Absent, ingestion behaves exactly as it did before it existed. |
| `INGEST_EXTRACTOR=claude\|gemini` | Pins one extractor and skips the chain. `claude` is how you exercise the fallback without waiting for a real outage, and how you run with no Gemini key. |
| `CLAUDE_BIN` | Full path to the `claude` executable. Only needed when it is not found on `PATH`. |

Each fallback call draws on that subscription's usage limits and takes roughly 15-20s.
`src/lib/ingest/claude.ts` documents how the child process is confined — a job listing is
untrusted text being handed to an agent that has a filesystem, and the flags that matter are
explained there.

Note that Gemini's free tier allows only 20 requests per day per model, which is the limit
you will hit long before any per-minute one.
