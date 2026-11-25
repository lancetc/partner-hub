# Discovery Path Audio Introductions: the Discovery Exciter

_25 Nov 2026. Implements the "Partner Hub: Discovery Path Audio Introductions" PRD. Builds on the Magazine Audio Introductions (docs/magazine-audio-guide.md, section 15)._

## 1. What changed for learners

- **No more Ava on a path page.** The path page used to open with Ava's transmission, reading the path's description aloud (`PathIntro`, `path:<id>`). That's gone, and the description is never read aloud now. Ava stays in the Magazine (her course, page and Family Call lines) and wherever else she's used.
- **"Listen to your introduction".** When a path has an approved Discovery Exciter with approved audio, the page shows the Magazine's editorial player under the path's name and above its description. It has play and pause, a waveform you can press or drag to seek, the time and length, speed (0.75× to 2×), Replay, an expandable transcript, and a quiet "Narrated by an AI voice · Magazine Editorial Voice" ("Recorded narration" for an uploaded file). It has keyboard and screen reader controls, never autoplays (`preload="none"`), and plays one sound at a time (`lib/onePlayer`).
- **No player at all** until an Exciter's audio is approved. Nothing is read in its place.
- Listening is optional and never counts towards finishing anything.
- The description is back to its short summary, shown as text.

## 2. What was reused, and what was generalised

| Need | Reused as it was | Generalised (safely, Magazine behaviour unchanged) | Added for paths |
| --- | --- | --- | --- |
| Player | `components/magazine/IntroPlayer.tsx`, `lib/onePlayer.ts` | `IntroPlayer` takes `label` and `className` (defaults: "Listen to the introduction", `mt-6`) | `PathExciter` in `components/PathPage.tsx` |
| Script, status, version, approval, visibility, replacement (`next`), content snapshot | The `Narration` and `NarrationAudio` types and their rules in `lib/magazineNarration.ts`: `editWorking`, `attachRecording`, `approveForPublication`, `playable`/`listenable`, `narrationState`, `substantiallyChanged`, `scriptWarnings`, `spoilerIn`, `formulaicOpening`, cost table | `textSnapshot(text, key)`, the generic form of `introSnapshot` (now built on it); `DELIVERY_NOTES` | `lib/pathExciter.ts`: `Exciter` = `Narration` + `curious`, `source`, `updatedAt`; `pathSnapshot`, `exciterForLearners`, `exciterWarnings`, `readExciter` |
| Voice | `VOICE_PROFILES.editorial` (Alloy, `OPENAI_TTS_MODEL`, default gpt-4o-mini-tts), `hubSpeech`, `makeRecording`, `saveUpload`, the TTS disk cache | `SpeechEngine` opts take an optional `delivery`; `hubSpeech` adds its note to the profile's instructions; `makeRecording` passes it on and audits it | The optional "slightly more curious delivery" (`DELIVERY_NOTES.curious`) |
| Background recording | `server/narrationJobs.ts`, table `magazine_narration_jobs`, one queue, one at a time, 60 an hour per author | Jobs have an **owner** (the `guide_id` column): a course id, or `learning_path:<id>`. `ownerJobs`, `queueOwnerAudio`, `markOwnerJobsAttached`, `retryOwnerJob`; the Magazine's functions are now `requireGuide` plus these. A `delivery` column (empty for the Magazine) is part of "the same recording" | Target `exciter` per path |
| Drafting | `askForJson` (Claude) / `openaiJson` (OpenAI fallback) with the check-and-repair loop | | `exciterPrompt`, `exciterIssues`, `draftExciters` with an injectable `ScriptWriter` |
| Listening | The `intro_audio.*` actions, `SMALL_GROUP` | `narrationStats.introListening(rows)` and `shareOf`, which `introAudioStats` now uses | `path_intro_events`, `exciterStats` |
| Manager | Its design and states (`NARRATION_STATES`), cost text | | `PathIntroductionManager`, `/admin/learning-paths/introductions` |

No second audio system: every recording goes through the same queue, voice, upload store and cost table as the Magazine.

## 3. Data

The Exciter is kept apart from the path, in its own table, so saving a path never touches it and it never touches the description.

| PRD field | Where |
| --- | --- |
| Script, script version | `path_exciters.doc`: `script`, `version` (1, then one more per new AI draft) |
| Audio ref, duration | `doc.audio.src` (a hub upload), `.seconds`, `.words` |
| Voice profile, model, delivery | `doc.audio.profile` (`editorial`), `.model`, `.voice` (`profile:editorial` or `upload`), `.delivery` (`curious`), `.provider` |
| Generation status | `magazine_narration_jobs` (owner `learning_path:<id>`), then `doc.audio.pending` until approved |
| Approval status, by, at | `doc.status` (the script), no `audio.pending` (the audio), `doc.approvedBy`, `doc.approvedAt` |
| Content hash / version | `doc.basis`: a snapshot of the path when the script was approved |
| Cost estimate | `magazine_narration_jobs.est_cost` when queued, `doc.audio.cost` when made |
| Visibility | `doc.hidden` |
| Pending replacement | `doc.next` |
| Delivery, source, last updated | `doc.curious`, `doc.source` (`seed`, `ai`, `author`), `doc.updatedAt`; `path_exciters.updated_by`, `updated_at` |

`path_exciters (path_id, doc, updated_by, updated_at)` and `path_intro_events (path_id, user_id, event, detail, at)` are created on first use (`server/pathExciterStore.ts`), like the jobs table, so `db.ts` wasn't changed and the running server didn't need a restart.

## 4. Authoring (path editor, "Discovery Exciter" section)

The section replaces "Ava's introduction" in the path editor. Authors only (`canAuthor`). It works on the saved path, so it asks for unsaved changes to be saved first.

- **Generate / Regenerate script.** AI reads the whole saved path: title, description (labelled "don't read it out"), audience, who it's for, outcomes, reward, upfront quiz, chapters and stages, and every Topic in order, with its summary, length and card headings. It returns one Exciter in the PRD's shape (70 to 130 words, a question or dilemma first). It's checked and sent back once if it's empty, far off the length, opens like a training module, or repeats an eight-word run of the description. Regenerating asks first. An optional note steers it.
- **The script** is editable, with its word count, estimated duration (150 words a minute) and warnings: length, a figure or date, a possible regulatory, financial or clinical claim, a formulaic opening, or reading out the description. **Save script** saves it. Typing never makes audio.
- **Approve script**, then **Generate audio**, which is always a confirmed action showing the estimated cost. It's recorded in the background, then **Preview** and **Approve for publication**. **Regenerate audio** makes a fresh take, also confirmed. **Upload replacement audio** takes an MP3; it's timed from its length and waits for approval like any other. **Preview the voice** plays the Editorial Voice sample.
- **Slightly more curious delivery**: the same voice with `DELIVERY_NOTES.curious` added. It applies to the next audio generated.
- **Show to learners** (on or off), **Remove** (confirmed; the recording stays in the media library).
- **Replacements.** Once learners hear an Exciter, any change (a new script, an edit, new or uploaded audio) goes into `next`. Learners keep the published one until the replacement is approved for publication. **Discard the replacement** is offered.

## 5. The outdated flag

`pathSnapshot` takes a key (the set of Topic slugs and the outcomes) and a fingerprint of everything else: the name, audience, who it's for, description, reward, chapters and Topic titles. The flag is raised when a Topic is added or removed or the outcomes change, or when about a fifth of the other words change (`substantiallyChanged`, as for Magazine pages). Reordering Topics doesn't raise it. The section then shows: "This Discovery Path has changed since its introduction was approved. Review the introduction to make sure it still reflects the path." It offers **It's still appropriate** (takes a new snapshot), **Update the script**, **Regenerate the script** and **Generate replacement audio**. Nothing regenerates or changes by itself, and learners keep the approved audio.

## 6. Discovery Path Introduction Manager

Admin › Content › **Path introductions** (`/admin/learning-paths/introductions`, also linked from the Discovery Paths list and from each editor section). Authors only.

- Every live path with: its script (status, version, words, the first lines), audio status (None, Queued, Generating, Failed, To approve, Generated, Uploaded, Doesn't match the script), approval (by, when), duration (actual, or estimated from the words), last updated, a review flag, and badges for "Learners hear this", turned off, and "Review: path changed".
- Bulk actions, each confirmed: **Generate missing scripts**, **Approve all (or selected) scripts** (lists the paths and asks whether each was read), **Generate audio for approved scripts** (shows the cost estimate), and for selected rows **Regenerate scripts** and **Regenerate audio**. There's an **Outdated only** filter, and per row **Preview** (one shared audio element) and **Edit**.
- The server refuses audio without `confirmed` (even for one path), several scripts without `confirmed`, and bulk approval without `confirmed`.
- **Listening** tab (section 7).

## 7. Analytics

`POST /api/paths/[id]/exciter-events` records `intro_audio.play`, `.complete`, `.replay`, `.transcript`, `.speed` and `.listened` in `path_intro_events`: the path id, the learner's id (only to count people once) and numbers (`seconds`, `percent`, `speed`). Anything else sent is dropped. There's a cap of 300 events a person, a path, a day, and none in a path preview.

The Manager's Listening tab totals, by path:

- plays, unique listeners, time listened, average reached, listened to the end, replays, transcript opens, and speeds;
- **progression**: of listeners, the share who went on to a Topic in the path (any progress or completion) and the share who finished it (every live Topic complete), and of people who started without listening, the share who finished.

The shares are shown only for groups of five or more. They're totals, never who. Listening is never required for completion, and nothing in progress, completion or certificates reads these events.

## 8. Migration of the existing paths (applied 25 Nov 2026)

`scripts/migrate-discovery-exciters.ts` (logic in `server/exciterMigration.ts`):

- `npx vite-node --config vitest.config.ts scripts/migrate-discovery-exciters.ts` does a dry run on a `VACUUM INTO` copy and reports.
- Add `--apply` to apply it to `data/hub.sqlite`.

For each path it:

- seeds a **draft** Exciter (`source: "seed"`) and restores the original description, through the existing `updateLearningPath` with the path's own saved fields;
- checks every other field is unchanged (name, audience, order, skipping, who it's for, picture, outcomes, reward, quiz, archived, Topics, chapters);
- is idempotent: it restores a description only over the spoken script it replaced (`SPOKEN_DESCRIPTIONS`), seeds only where there's no Exciter (or replaces an untouched seed), and never touches an author's script;
- reports a description edited since, a missing path, or a live path it doesn't cover, as exceptions.

**Result on data/hub.sqlite:**

- 14 paths updated, with 14 descriptions restored and 14 draft Exciters created (87 to 127 words each).
- **Exceptions: none.**
- A second run changed nothing.
- No audio was generated and nothing was approved.

| Path | Exciter words |
| --- | --- |
| Aged Care in a Nutshell | 106 |
| Care Coordination | 127 |
| Contractor induction: final check | 87 |
| Delivering Support at Home Services for Trilogy Care | 116 |
| Dot's Week | 110 |
| Getting Invoices Paid | 112 |
| Partnering with Trilogy Care | 113 |
| Ready for Your First Shift | 111 |
| SIRS Training (`lp-sirs-training`) | 120 |
| Support at Home Transport Billing | 109 |
| Support at Home in Practice | 121 |
| SIRS 1, 2, 3 (ALIS) | 111, 106, 105 |

**How the scripts were written.** Each was rewritten by hand from the spoken script the description had become on 24 Nov (or `ALIS_PARTS[].intro`), with no AI, into the PRD's shape. Every fact is the path's own (its Topics, outcomes, structure and quiz), and no new claims were added. They live in `content/discoveryExciters.ts`. The three SIRS Exciters are the reshaped `ALIS_PARTS[].intro` in `content/alisCourse.ts`.

**Checks.** All 14 are within 70 to 130 words, have no script warnings, and share no eight-word run with their description.

**The ALIS builder** (`server/alisBuild.ts`) now writes `ALIS_PARTS[].description` to the description and `ALIS_PARTS[].intro` as the Exciter seed (`PathInput.exciterSeed`). A seed never replaces an author's script or an approval.

## 9. Owner's steps: approve the scripts and generate audio

1. Open **Admin › Path introductions**. All 14 show **Script to approve**.
2. Read each script (**Edit** opens the path's Discovery Exciter section). Edit and **Save script** where needed. **Regenerate script** is there if you'd like an AI draft from the whole path instead (a small paid AI request each).
3. **Approve all scripts** (or select some and approve them), and confirm.
4. **Generate audio for approved scripts** checks the estimate and confirms. The recordings arrive in the background, one at a time.
5. **Preview** each row, then open each path's section and press **Approve for publication**. The player appears on the path page straight away.
6. Optional: tick **Slightly more curious delivery** on a path before generating its audio.

**Estimated cost:**

- gpt-4o-mini-tts at US$15 per million characters (from `SPEECH_PRICES_TO_VERIFY`, price to verify).
- The 14 scripts as seeded are 8,719 characters (484 to 705 each).
- That's about **US$0.13 for all 14**, under US$0.01 each.
- Regenerating unchanged words in the same voice and delivery reuses the recording at no cost.
- AI script writing has no reliable per-request price here, so there's no estimate for it.

## 10. Decisions and deviations

- **Approve for publication publishes straight away.** Paths have no edition or publish step, unlike Magazine courses. The replacement rule still holds: learners keep the approved audio until a new one is approved.
- **Two approvals** (script, then audio), as in the Magazine. Uploading audio approves the script it reads.
- **Single-path audio generation is confirmed too** (the PRD asks for confirmed paid actions; the Magazine only confirms bulk runs). The server enforces it.
- **The player sits under the title, above the description**: "at the beginning of every Discovery Path". With no approved audio, nothing is shown.
- **Ava's `path:` video rows and files are kept, not shown.**
  - `tts.scriptFor` no longer answers `path:` keys (404), and `avaSpeaks` is false for them, so they drop out of Admin › AI Learning Guide's line list and can't take new videos.
  - Ava's tests now use a Magazine page line instead of a path.
  - The path editor's "Ava's introduction" section (`AvaVideoSlot`) is replaced by the Discovery Exciter section. `AvaVideoSlot.tsx` itself is unchanged.
- **Shared rate limit.** Exciter recordings audit as `magazine.narration_recorded` (entity `learning_path:<id>`), so the 60 an hour per author cap covers Magazine and path recordings together. Other Exciter audit events are `learning_path.exciter_*`.
- **Attaching recordings happens on the server**, when the section or the Manager loads: paths have no client-side draft document. One that's been put with its script isn't offered again.
- **Script drafting isn't a background job**: one streamed request per path, in turn for bulk runs. Audio is the background job.
- **Progression** isn't timed against the first listen: it's "listeners who have touched the path", and it's a prompt, not evidence.
- **Prettier** reformatted a few untouched lines in `server/learningPaths.ts` (long audit calls) when it was run on the changed file.

## 11. Limitations, and what wasn't checked

- Audio was never generated (no paid calls). The background queue, delivery note, attach, approve and replacement flow are covered by tests with a stand-in speech engine, and in the browser with an uploaded placeholder file on a throwaway path (since archived).
- Real playback (sound, the moving waveform, seeking audio) wasn't checked in a browser. The background check tab can't play or screenshot, and its `requestAnimationFrame` was stood in for. The layout, controls, labels, no autoplay, transcript, light and dark themes, and widths of 375px and 1280px were checked from the DOM.
- AI script drafting wasn't run live: it's covered by a stand-in writer.
- Jobs run in the server process, as for the Magazine: a restart mid-recording marks the job failed after ten minutes, and it can be retried.
- The placeholder MP3 used for the browser check stays in the media library (`data/uploads`, not in the repo) as "zz-exciter-check.mp3". It can be deleted from Admin › Images and media.
