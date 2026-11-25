# Topic Video Introductions

Every Topic opens with an **Introduction card**: a portrait (9:16) presenter, the Topic's title, a short description and **Let's get started**. Synthesia is the intended video provider, but its credits are exhausted, so for now the card shows the presenter's placeholder portrait. No Synthesia call is made anywhere in this release.

## What was there, and the decision

| Existing piece | What it does | Used for |
| --- | --- | --- |
| `presenter` card (`content/lessons.ts`) | A presenter with a transcript, an optional video (`synthesia`, `youtube`, `elevenlabs`, `upload` with `recording`, `cropX`, `captionsVtt`, portrait 9:16) | **The Introduction card.** It's the same card type with one new optional field, `intro`. No new card type. |
| Ava's presenter cards (`server/ava.ts`, `tts.ts` `avaSpeaks`/`scriptFor`) | Ava's talking video or her voice over her portrait | Left alone. Ava isn't the default presenter. Topics that already open with an Ava hook keep it, as their Introduction card (see the migration). |
| `VideoLinkField`, the recording studio (`LessonEditor`) | Paste a YouTube or Synthesia link, or record a video | Still there on the card's settings. The Video introduction tab adds uploading a finished video. |
| ALIS builder's `"intro"` card (`lib/alisBuild.ts`) | An image card with the module title and summary | **Now built as the Introduction card** (owner's decision, 25 Nov 2026): the module's title, summary and support note, with the part's cover as the Topic's placeholder. A rebuild never brings back a title card. |
| The blank topic's `"intro"` card (`content/blankLesson.ts`) | An empty image card | Replaced: a new Topic's `intro` card is now the structural Introduction card. |
| Synthesia | Share links and embeds only (`lib/videoLinks.ts`, `CardVisual`, webinars). **No API integration existed.** | A provider adapter with no network code (`server/videoProviders.ts`). |

**A card is the Introduction card when it's a `presenter` card with `intro` set.** What learners see stays where it always was on a presenter card (`heading`, `body`, `transcript`, `visual`); the working copy lives in `intro`: the script being written, a video waiting for approval, the presenter, and production. So editing a script or uploading a new video never changes what learners see until the author approves it and publishes the Topic.

`intro.layout`: `"intro"` shows the new opening screen (`components/player/IntroCard.tsx`). `"legacy"` is an existing presenter card that was adopted as the Introduction card and still looks as it did (Ava's transmission, say). The author switches it in the Video introduction tab.

## Structural rules

- **Always first, made with every new Topic.** `withIntroCard` (`lib/topicIntro.ts`) is applied on create and on every save (`server/authoredLessons.ts`), when the editor opens a Topic (the edit and new pages), and when Claude redrafts a Topic (`carryIntro` keeps the existing card, with its script and media).
- **Not removable, duplicable or movable.** `lib/lessonGraph.ts`: `movable()` is false for it, and nothing can move in front of it ("The introduction stays first."). LessonEditor disables Delete, Duplicate, the drag grip and Required completion on it.
- **Never holds anyone.** It is exempt from required-completion gates, and its primary action is always "Let's get started". Swipe left does the same.
- **Full-card portrait** (owner's decision, 25 Nov 2026). The presenter fills the whole card, top to bottom and edge to edge: the approved video, or the placeholder portrait at its saved focal point. The title, description and **Let's get started** sit over a gradient on the card itself; the Introduction card has no footer. On a phone the card is the phone's card area; on desktop it fills the card frame.
- **Sound when the card opens: the owner's override of PRD §4** (25 Nov 2026, Topic Introduction cards only; the PRD said "Do not autoplay video or audio").
  - With an approved video, it plays with its sound. Otherwise the introduction is spoken in the Hub narrator's voice (Alloy, through `/api/tts?key=lesson:<slug>:<card>`). A recorded file on the card (`audioSrc`) is used instead when there is one.
  - What's spoken (`introSpokenText`, shared by the card and `scriptFor` in `server/tts.ts`): the approved script (the card's transcript), else the narration a folded title card brought with it, else the card's title and description. A draft script is never spoken. `avaSpeaks` is false for the Introduction card, so it is never in Ava's voice; an adopted Ava card (`layout: "legacy"`) keeps hers.
  - It plays once per visit to the card and stops when the learner moves on. It follows the card-audio switch (`autoplayEnabled`, and the mute button's stop) and one sound at a time (`lib/onePlayer`).
  - When the browser refuses sound without a tap, or nothing starts within six seconds (`autoStartIntro`), the card shows **Tap to listen**. A video's captions and the transcript are always there. If the audio can't load at all, the card stays as it is, with its transcript.
  - Audio for a script is generated once and cached on disk by `narration()`. The first time a new script is heard, it is a small paid OpenAI speech call; that's expected. The editor's preview never plays or generates sound.
  - Still no play button over the placeholder: its sound control is the "Tap to listen" / Pause button beside the transcript, and nothing says a video is coming.
- **"Skip to Quiz".** There's no Topic-level Skip to Quiz in the Hub. The nearest is a learning path's upfront quiz (`lib/pathQuizSettings.ts`), which reads quiz cards and records completions by slug and version. It is unaffected.

## Data

In each Topic's draft and published JSON (`authored_lessons`), on the Introduction card:

| PRD field | Where |
| --- | --- |
| Introduction card reference | The card marked `intro`, and `lesson.start` |
| Script, script version | `intro.script.spoken` (working copy; not named `text`, because lesson text fields are machine-translated), `intro.script.version`, `status`, `origin`, `model`, `approvedBy/At`. The approved script is also the card's `transcript`. |
| Presenter profile reference | `intro.presenter` (absent: the default presenter) |
| Placeholder image reference | `intro.placeholder` (this Topic's own), else the presenter's portrait, copied to `visual.photo` |
| Video asset, captions, transcript, duration | `visual.video` (`src`, `poster`, `captionsVtt`), `transcript`, `durationSec`; the record in `intro.video` |
| Media provider, provider generation id | `intro.video.provider`, `generationId`; `intro.production.provider`, `generationId` |
| Generation status | `intro.production.state` (`ready`, `generating`, `generated`, `failed`) |
| Approval status | `intro.script.status`, `intro.video.approvedBy/At`, `intro.pendingVideo` (waiting) |
| Associated Topic content version | `intro.script.basedOn`, and `intro.script.basis` (a fingerprint of the Topic when approved) |
| Last generated date | `intro.script.draftedAt`, `intro.video.at`, `intro.production.at` |
| Estimated and actual costs | `intro.production.estCost`, `actualCost`, `intro.video.cost` |

Two small tables, each created on first use (`CREATE TABLE IF NOT EXISTS`, like `narrationJobs.ts`):

- `intro_presenters` (`server/introPresenters.ts`): name, description, placeholder portrait, provider, avatar, voice and template ids, language, accent, delivery style, audience, active, default. One default; Ava can't be made the default.
- `topic_intro_events` (`server/topicIntros.ts`): analytics, below.

Old Topics still parse: `intro` is optional, and a Topic without it is given one when it's next saved, opened in the editor, or migrated.

**Built-in content topics** (`content/lessons.ts`) are code. They aren't edited. The editor shows them with their Introduction card, the first save stores them in `authored_lessons` with it, and the migration gives any never-edited one a database copy at its shipped version. On this database every content topic already has a row.

## The default presenter and placeholder

`DEFAULT_PRESENTER` (`lib/topicIntro.ts`), seeded into `intro_presenters`: "Your learning presenter", provider Synthesia (no avatar, voice or template ids yet), en-AU, Australian, warm and conversational.

Its portrait is an existing picture from the image library: `/api/uploads/57497f37-a3dc-4248-8041-c233d56617ff.webp`, "Smiling coordinator at her desk": a woman in a teal blouse with her hands folded at a desk, in a bright, softly lit open-plan office, looking at the camera. It is approachable, professional and in Trilogy Care's teal. It is 2400×1340, so it is shown as a 9:16 crop centred on her (`position: 72% 40%`). There was no portrait-shaped presenter picture: `public/images/presenter-intro.jpg` is Ava's Synthesia still, and the other portraits are named story characters. No image was generated.

- Uploaded files are git-ignored, so on another machine (the Netlify demo) this picture is missing until it's uploaded there.
- Authors can replace it in **Admin → Topic introductions → Presenters**, or give any Topic its own placeholder in the Topic's Video introduction tab, both through the image library.

## Script

- 35 to 70 words, about 15 to 30 seconds (150 words a minute).
- The four-part structure: a question, situation or challenge; why it matters; the link to the learner's responsibilities; what they'll explore.
- Australian English, warm and professionally confident. No "Welcome to this training module". It doesn't read the description or outcome aloud, makes no unsupported clinical, financial or regulatory claims, and gives no spoilers.
- `introPrompt` gives the model the Topic's title and description, audience, learning outcome (its behaviour change), every card in order (decisions and their options, spoken transcripts, the summary's action), the assessment questions without their answers, and the sources the cards cite. The PRD's Hiring Runway Window example is included as a tone example.
- Drafting uses the same adapters as the Magazine's narration: Claude (`claudeJson.askForJson`) when it's connected, otherwise OpenAI (`openaiText.openaiJson`), with one retry if the word count or opening fails the checks. The drafter is injected (`IntroDrafter`), so tests use a fake and make no paid calls.
- The editor shows the word count, an estimated duration and warnings (`introScriptWarnings`).

## Authoring

**Topic editor → Video introduction** (`components/admin/TopicIntroEditor.tsx`):

- Generate, edit and regenerate the script. Generating and regenerating are paid calls, and regenerating asks first.
- Approve the script.
- Choose a presenter, and upload or replace the placeholder.
- Upload a finished portrait video, with a WebVTT captions file. It waits for approval, with a preview.
- Approve the video.
- Preview the card as learners will see it.
- Prepare an approved script for production. The **Generate video with Synthesia** button is shown but disabled.

**Admin → Topic introductions** (`/admin/topic-intros`, `components/admin/TopicIntroManager.tsx`) lists every Topic with its category, presenter, placeholder thumbnail, script status, video status, approval, overall status and last update.

- **Filters:** missing scripts, requires review, no Introduction card yet, approved with no video, ready for production.
- **Bulk actions on drafts:**
  - Generate missing scripts. It shows an estimate first (calls, tokens and model; a dollar figure only if `INTRO_TEXT_PRICE_IN` and `INTRO_TEXT_PRICE_OUT` are set), and only runs with that estimate's confirmation token. Up to 25 at a time, stopping at the first failure.
  - Assign a presenter.
  - Replace placeholders, or reset them to the presenter's portrait.
  - Prepare approved scripts for production.
- Per-Topic engagement, the presenters, and the migration preview with its Apply button.
- Nothing here publishes a Topic or sends anything to a provider.

## Statuses

There are eleven statuses, from `introState()` (`lib/topicIntro.ts`). Each maps onto the shared vocabulary in `lib/mediaStudio.ts`.

| Status | When |
| --- | --- |
| Script required | No script |
| Script drafted | A script waiting for approval |
| Script approved | Approved, not yet published |
| Placeholder | Published with an approved script and the placeholder portrait (no video) |
| Ready for production | Prepared for video; nothing sent |
| Generating video | A provider job is running (not possible while generation is off) |
| Video generated | Made, not yet attached for approval |
| Awaiting approval | A video waiting for the author, or an approved video waiting for the Topic to be published |
| Published | Learners see the video |
| Requires review | The Topic changed materially since the script was approved, the video doesn't say the approved script, or it was made with another presenter |
| Generation failed | The provider job failed |

## Outdated flag

When the script is approved, `intro.script.basis` keeps a fingerprint of the Topic, leaving out the Introduction card. That fingerprint is an exact hash, a hash of the title, outcome and questions, and a MinHash of all the words. The same method is used for the Magazine's narration.

- **Raised:** when the title, the outcome or a question changes, or when about a quarter of the words change. Small edits don't raise it.
- **Nothing is regenerated.** The published introduction stays as it is until the author approves a replacement and publishes. "The script still fits" clears the flag without changing the script.

## Analytics

There was no general Topic event stream to reuse: Topic progress is the saved attempt, and the event tables are per feature. So `topic_intro_events` follows the `aid_events` and `story_events` pattern. It holds ids and numbers only, with an idempotency key.

| Column | What it holds |
| --- | --- |
| `slug`, `card`, `version` | Which Topic, card and version |
| `event` | `view`, `play`, `progress` (25/50/75), `complete`, `replay`, `captions`, `continue`, `skip` (moved on from a video before it ended), `leave` (seconds on the card) |
| `media` | `video` or `placeholder`, so the two are always kept apart |
| `seconds`, `percent` | Numbers only |

- **Recording:** `POST /api/lessons/intro-events`, sent by `IntroCard` and `LessonPlayer`. Nothing is sent in author previews or reviews.
- **Reading:** `introStats()`, shown in the manager, gives each Topic's views, viewers, plays, completions, replays, captions, skips, moves into the Topic, average time on the card, average reach, and viewers who went on to complete the Topic.
- **Not covered yet:** assessment performance per viewer. Join to the attempt's `first:` answers if it's wanted.
- The manager says that watching a video isn't evidence of learning.

## Migration

`introMigrationPreview(db)` is read-only. `applyIntroMigration(db, actor, now)` applies it, from the manager's Apply button, which asks for confirmation.

- **Existing first presenter card:** reused as the Introduction card (`layout: "legacy"`). Its transcript becomes the approved script and its video is kept. No duplicate is made.
- **A picture title card first** (owner's decision, 25 Nov 2026: "fold them into the intro"). An `image` card that is the Topic's title card (called `intro`, or headed with the Topic's title) becomes the Introduction card, in place (`titleCardToFold`, `foldTitleCard`):
  - It keeps its id, so `start` and every link to it are unchanged, and a learner whose saved attempt is on it resumes on the Introduction card.
  - Its label, heading and body become the introduction's (an ALIS support note stays in the description). A body that is only a production note ("Synthesia video to replace.", on 38 of them) is dropped, and the card shows the Topic's summary.
  - Its photo becomes the Topic's own placeholder, keeping its crop position, so it fills the card.
  - A narration script it had becomes the introduction's draft script, to be reworked and approved. Until then it is still what's spoken (in the narrator's voice).
  - A title card with something the introduction can't show (key points, a figure, a document, a credited or animated picture) isn't folded: the Introduction card goes in front of it instead.
- **Any other first card:** a new Introduction card goes in front, with the default presenter's placeholder and the Topic's title and summary. No script yet.
- **A marked card that isn't first:** moved to the front.
- **A second marked card:** loses its mark. No card is deleted.
- **Published copies are changed in place, keeping their version.** This is what keeps progress: the player resumes an attempt only when `stored.version === lesson.version`, and the saved `nodeId` and `route` still exist.
  - Completions stay against the version they were recorded for.
  - The `completion` rule, quiz cards, assessment settings, path quizzes and every existing card are untouched.
  - `published_at` and `lesson_versions` (the history) are left as they were.
  - After applying, restart the dev server so every route bundle reloads the published lessons.
- **Never-published drafts** get it in the draft only.
- **Deleted Topics and follow-up steps** (`reinforcement`) are skipped.
- **Idempotent:** a second run changes nothing (tested).

### Preview on `data/hub.sqlite` with the fold (25 Nov 2026, read-only)

| Count | Topics |
| --- | --- |
| Topics (not deleted, not follow-up steps) | 119 |
| Already have an Introduction card | 0 |
| Would get a new Introduction card | 13 |
| Would fold their picture title card into it | 58 (20 bring a picture as their placeholder, 38 bring Ava-era narration as a draft script) |
| Would reuse their first presenter card | 48 |
| …of which with a playable video kept | 1 (`our-mission-and-model`, Synthesia MP4) |
| …the other 47 | Ava ElevenLabs hooks with no video file (portrait and voice), kept as they are |
| Duplicates / cards to move | 0 / 0 |
| Published copies changed in place | 119 |
| Content-file topics needing a database copy | 0 |
| Title cards left after the new card (not foldable) | 0 |
| Learners part-way through the affected Topics | 41 (they resume where they were) |

The owner approved applying it with the fold. **It has not been applied yet**: running the apply script against `data/hub.sqlite` was blocked by Claude Code's permission check, so it needs the user's own go-ahead (or the manager's Apply button). The script backs the database up first (`VACUUM INTO data/backups/hub-before-topic-intros-2026-11-25.sqlite`), applies, previews again and runs a second time to show nothing changes.

After applying, 38 folded Topics have a draft script that begins "Hi, I'm Ava": it is spoken by the narrator until an author reworks and approves it.

## Alignment with Magazine Audio Introductions

The Magazine's files were not edited.

- **Statuses:** both features map onto `MEDIA_STATUSES` in `lib/mediaStudio.ts`.
- **Provider, profile and model fields:** Magazine `NarrationAudio.provider/profile/model/cost` ↔ Topic `IntroVideo.provider/profile/generationId/cost`. Magazine `VoiceProfile` ↔ Topic `PresenterProfile`.
- **Approve, then publish:** Magazine `status: draft | approved` with `next` holding a replacement ↔ Topic `intro.script.status`, with the learner-facing fields changing only on approval and `pendingVideo` waiting for approval.
- **Outdated flag:** the same fingerprint method, `substantiallyChanged` ↔ `materiallyChanged`.
- **Job pattern:** Magazine `narrationJobs` (queued, running, done, failed) ↔ Topic `intro.production.state` (ready, generating, generated, failed). When Synthesia is enabled, a `topic_intro_jobs` table on the `narrationJobs` model is the natural next step.
- **For later convergence:** `lib/mediaStudio.ts` copies the Magazine's `wordCount`, `secondsFor`, `textHash` and fingerprint code. `lib/magazineNarration.ts` can import them from there and drop its copies; it is the seed of the proposed Media Studio.

## Enabling Synthesia later

1. **Verify Synthesia's current API.** The Hub has never called it. Check template-based video creation with an avatar, voice and template, status polling, downloading the rendered MP4 and captions, and the credit cost per video.
2. **Implement the adapter.** Write `createVideo` and `videoStatus` in `server/videoProviders.ts`, server-side only.
3. **Configure it.** Add `SYNTHESIA_API_KEY` to `.env.local` (never in files or on Netlify unless agreed), and set `TOPIC_INTRO_VIDEO_GENERATION=on`. `videoGenerationEnabled()` then turns true.
4. **Fill in the presenters.** Each presenter needs Synthesia's avatar, voice and template ids, in the manager.
5. **Add a job runner.** A small `topic_intro_jobs` queue, modelled on `server/narrationJobs.ts`, run one Topic at a time when an author confirms it.
   - It sets `production.state` to `generating`, stores `generationId` and the costs, and on completion uploads the MP4 and VTT as hub uploads.
   - It then `attachVideo`s the result as a `pendingVideo`.
   - **Never auto-submit:** prepared Topics stay "Ready for production" until an author confirms each one, even after credits are replenished.
6. **Enable the button.** Turn on "Generate video with Synthesia" in the Video introduction tab, behind `videoGenerationEnabled()` and a cost confirmation.
7. **Nothing else changes.** The learner card already plays approved portrait videos with captions.

## Limitations and deviations

- **Adopted presenter cards keep their old look.** The 48 Topics whose first card is reused (47 Ava hooks) look as before until an author chooses "Use the introduction screen". Two things do change once they're migrated:
  - The button reads "Let's get started".
  - The card no longer holds learners until Ava's audio or the video ends.

  Ava's own transmission rules still apply on those cards, including her audio starting when the learner's audio is on.
- **Learners receive the working copy.** The `intro` metadata (draft scripts, a pending video's address) is in the lesson JSON sent to the player. It isn't secret, but it isn't stripped either.
- **Offline copies** saved before the migration show the Topic without its Introduction card until they're refreshed (the version doesn't change).
- **Version comparisons** (`lib/lessonDiff.ts`) ignore `intro`. Learner-visible changes to the card still show as narration, picture or text changes.
- **Approval is in the editor.** The approver is the signed-in author's name, recorded in the draft.
- **No duration in the play button** unless the script was approved through the editor, which sets `durationSec`.
- **Checked in the browser** (25 Nov 2026, a background tab, a throwaway Topic, since deleted): a folded title card fills the card at 375px and on desktop, light and dark, with "Let's get started" on the card; the spoken introduction started by itself from an existing recorded file (no speech generated), stopped when moving on, and "Tap to listen" appeared when sound could not start.
- **Not checked in the browser:**
  - A video's autoplay with sound, and live narrator speech (that would be a paid call).
  - Swipe gestures (the button path was checked).
  - Analytics events from a live, published Topic (covered by server tests).
