# Trilogy Care Partner Hub — clickable prototype

A front-end prototype of the Partner Hub described in `Trilogy-Care-Partner-Hub-PRD.md`: the news homepage, the one-card-at-a-time lesson player, and the flexible onboarding checklist. All stories, people, rates and processes are **demonstration content**.

## Run it

Node.js is installed per-user at `~/.local/node` (added to `PATH` in `~/.zshrc`).

```bash
cd partner-hub
npm run dev
```

Then open http://localhost:3000.

## What's in it

| Area | Route | Notes |
| --- | --- | --- |
| News | `/`, `/news/[slug]` | Editorial grid, category filters, saved stories, policy status and source details |
| Learning | `/learning`, `/learning/[slug]` | Card player with presenter, calculator, branching, audio (browser speech), short response, quiz and briefing acknowledgement |
| Onboarding | `/onboarding` | Welcome sequence, role/service-based checklist, document lifecycle, readiness status, prototype reviewer controls |
| Resources | `/resources` | Guides, templates and contacts |
| Saved | `/saved` | Bookmarked stories, lessons and resources (also in search) |

Lessons are structured data in `src/content/lessons.ts` (typed cards, explicit `next` transitions). Brand tokens live in `src/app/globals.css`.

## Learning paths and follow ups

Spaced follow ups after a lesson, from `Trilogy-Care-Spaced-Learning-Claude-Feature-Brief.md`. Unlike the rest of the prototype, this runs on a local server: records live in SQLite at `data/hub.sqlite` (created and seeded on first request; delete it to reset).

**Try it:** complete *A little extra time* as Sam. The completion screen gives the first follow up date. Switch to Jordan (account menu → Signed in as), open **Administration**, press **+7 days** on the demo clock, then switch back to Sam and open the follow up from Learning or the homepage strip.

| Piece | Where |
| --- | --- |
| Shared scheduling function (preview, enrolment, worker) | `src/lib/schedule.ts` |
| Schema, seed (orgs, demo users, demo path and follow ups) | `src/server/db.ts`, `src/content/followups.ts` |
| Enrolment, attempts, follow up state | `src/server/learning.ts` |
| Worker: release, one digest per person per local day, reminders, dispatch | `src/server/worker.ts`, started every 15 min by `src/instrumentation.ts` |
| Notification adapters (email via HTTP provider, SMS stub) | `src/server/notify.ts` |
| Authoring: drafts, review, publish, pause/resume, rebaseline, withdraw | `src/server/paths.ts` |
| Reporting, scoped by organisation | `src/server/reports.ts` |
| Learner UI | `/learning` (Follow ups), `/learning/follow-ups/[id]` |
| Admin UI | `/admin`, `/admin/paths/[id]`, `/admin/follow-ups/[id]`, `/admin/outbox` |

Tests (`npm test`) cover the scheduling rules, weekend and daylight saving cases, idempotent enrolment, concurrent workers, digest cap, reminders, unknown provider outcomes, attempts, after-completion mode, pause/resume, withdrawal and cross-organisation access.

### One topic, four experiences (Legislative Framework)

Spaced learning as retrieval and application, not repetition. Completing **Legislative Framework** (Learn, day 0) enrols the learner in a sequence of three short lessons, each played in the normal lesson player:

| Stage | When | Lesson | Purpose |
| --- | --- | --- | --- |
| Recall | Week 2 (gap 14) | `lf-recall` | Two questions from memory, then feedback |
| Apply | Month 2 (gap 46) | `lf-apply` | Branching privacy scenario |
| Refresh | Week 14 (gap 38) | `lf-refresh`, or `lf-refresh-support` | One decision; the support version adds a reminder and practice |

Refresh is adaptive: if any earlier first attempt in the sequence was incorrect, the worker releases the support version instead. Dates don't change. Path steps can now be short lessons (`followUpId: "lesson:<slug>"`) with a `stage` label and an optional `adaptive.ifStruggled` variant. The Learning page shows the four stages on one timeline. The sequence content is draft and needs subject matter review.

### Configuration still needed for deployment

- **Email:** set `EMAIL_WEBHOOK_URL` (and `EMAIL_WEBHOOK_TOKEN`) to a provider or relay that accepts `{to, name, subject, text}` and honours the `idempotency-key` header. Until then digests stay in the outbox as "Not sent: provider not configured". Delivery confirmation needs a provider webhook, which isn't built yet.
- **SMS:** choose a provider and implement `SmsAdapter.send`.
- **Scheduler:** in production, call `runWorker()` from a platform scheduler every ~15 minutes and set `HUB_WORKER=off` on web processes.
- **Database and identity:** replace SQLite and the demo sign-in cookie with the agreed managed database and verified sign-in; the permission checks are already server-side.
- **Remove prototype controls:** the demo clock, account switcher and "Simulate weak connection".

### Not built yet

- Adding a full existing lesson as a path step (steps are short follow ups only).
- Content generation suggestions (no service is configured; "Create follow up path" makes templates).
- Automatic migration of existing enrolments to a new path version (they stay on their version).
- Public holiday calendars.

## Live narration (ElevenLabs)

Card audio is spoken live by an Australian ElevenLabs voice when the server has a key; otherwise the browser's own voice is used.

The hub currently uses **Charlie** (`IKne3meq5aSn9XLyUdCD`), the premade Australian voice available on ElevenLabs' free plan, set in `.env.local`. The code default is **Claire – Calm & Friendly** (`6UXvJKkwaqtXE3nZHvbF`), a library voice that needs a paid plan or added credits; to switch back, remove the `ELEVENLABS_VOICE_ID` line from `.env.local` and restart.

1. Copy `.env.local.example` to `.env.local` and set `ELEVENLABS_API_KEY`.
2. Restart the dev server.

The browser asks `/api/tts?key=lesson:<slug>:<card>` for a card's approved script (never free text). Each script is synthesised once per voice and model, cached in `data/tts/`, then replayed from the cache. Change `ELEVENLABS_VOICE_ID` or `ELEVENLABS_MODEL_ID` to try another voice or model; the cache key includes both. Delete `data/tts/` after editing a script if you want to clear old audio.

## Prototype limits

- Lesson progress, saved items and onboarding are still stored in this browser's `localStorage` (per demo account) behind a simulated server write (`src/lib/store.ts`). Lesson *completion* and everything about follow ups go to the server.
- Uploaded files are not stored; only the file name and size are kept.
- The account menu has prototype controls: **Simulate weak connection** (about half of saves fail, to exercise retry states) and **Reset demo data**.
- Narration uses the browser's speech engine as a stand-in for approved recorded audio or presenter video.
