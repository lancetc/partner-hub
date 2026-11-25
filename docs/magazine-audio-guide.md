# Magazine Audio Guide: implementation PRD

**Status:** Draft for review · **Area:** Magazine (courses and guides) · **Builds on:** Topic narration (ElevenLabs), Draft with AI (Claude), the Magazine sign-off process

> **Superseded in part (25 Nov 2026) by Magazine Audio Introductions, section 15.** Introductions no longer play by themselves, a page with Ava's video shows the introduction player as well, the default voice is the Magazine Editorial Voice (OpenAI Alloy), audio is made in the background and approved before learners hear it, and a published introduction keeps playing until its replacement is approved. Where sections 1 to 14 disagree with section 15, section 15 is current.

## 1. Summary

A voice that works as a learning companion across a Magazine course. It doesn't read the page aloud. At the start of the course and of each page it gives a short spoken introduction: it raises a question, sets up a challenge or links to what came before. Then the learner reads and does the page.

Authors don't write these from scratch. Claude drafts every script from the course's own content. The author reviews, edits and approves the scripts, and the hub records approved scripts with ElevenLabs and attaches each recording to its page. If a page changes substantially after recording, its narration is flagged for review rather than silently going out of date.

By default each introduction plays as the learner arrives on a page, and they can turn the Audio Guide off at any time. Authors can instead make it wait for Play, or for the learner to opt in.

## 2. Goals and non-goals

**Goals**

- Give a Magazine a sense of voice and progression without turning it into a narrated slide deck.
- Make narration close to free for authors: one click drafts the whole course's scripts, and review is the only real work.
- Keep narration accurate and current: no invented policy, no spoilers, and a visible flag when content moves on.
- Respect learners: no surprise audio, clear controls, and a transcript for everyone.

**Not in this phase**

- Reading whole pages aloud (the future **Listen** mode, section 12).
- Narration for every block. Contextual audio on selected blocks is Phase 2.
- Voice cloning or recording the author's own voice for narration. The webcam studio already covers recorded video.

## 3. Three levels of narration

| Level | Purpose | Example | Phase |
| --- | --- | --- | --- |
| Course introduction | Welcome the learner, show why it matters, say what they'll gain | "Every complaint is a chance to rebuild trust. Let's explore how." | 1 (standard) |
| Page introduction | Introduce the next idea and spark curiosity | "Mrs Russo isn't happy. What would you say first?" | 1 (standard) |
| Contextual narration | Optional audio on a scenario, picture or activity | "Listen carefully to how the client describes the problem." | 2 (optional) |

A one-page guide has a page introduction only. Its course introduction is the same thing, so authors don't see two.

**Ava's spoken introduction.** A course's approved introduction script (`audio.intro`) is what Ava says on the cover, live in her voice (OpenAI Alloy by default; docs/ai-learning-guide.md), with no recording needed. A one-page course has no cover, so Ava gives the same introduction at the top of its page, where the page's picture goes (`GuideReader`, `magazine:<id>:intro`). Every course had one written in November 2026.

## 4. What the learner experiences

### The Audio Guide card

A compact card sits at the top of each page, under the page header and above the first section. It doesn't appear on the cover, or on a page without approved audio.

```
YOUR AUDIO GUIDE                      Page introduction · 0:18
[▶ Play]  [↺ Replay]  [Mute]
"A complaint isn't always about what went wrong. Sometimes it's about
whether someone feels heard. Let's see what happens when Mrs Russo
raises a concern."
Continue reading below ↓
```

- **The transcript is always visible.** It's the quote under the controls. Learners who can't or won't listen lose nothing, and the card is useful even with the Audio Guide off.
- While it plays, the word being spoken is highlighted, using the word timings ElevenLabs returns (as Topic narration already does). This follows the learner's existing "follow word by word" preference.
- The card states its length ("0:18") and its level ("Course introduction" or "Page introduction").

### Turning it on and off

- Above the card, an **Audio guide: On / Off** switch.
- **Off:** the card shows its transcript and a Play button. Nothing plays by itself.
- **On:** the introduction plays as the learner arrives on each page they haven't finished. Turning a page is the user gesture browsers need, so this works without an extra click. Pages already finished don't play again by themselves. Replay is always there.
- **Pause, replay and mute** sit on the card. **Mute** stops audio for the rest of the visit without turning the Audio Guide off.
- With **Play automatically** (the default) the switch starts **On**; with **Offer automatic playback after the learner opts in** it starts **Off**. Either way the learner's choice is remembered per course (see 9.3). A browser that blocks sound before the first click shows Play instead.
- If the author chose **Learner presses Play** (section 5), the switch isn't shown and every introduction waits for Play.

### What it never does

- Play after the learner has turned the Audio Guide off, or (with opt-in) before they've turned it on.
- Hold up **Finish this page**. Narration is never an activity under "Readers work through every activity first".
- Talk over a video. If a video on the page starts, the narration pauses.

## 5. Author settings: Magazine Audio Settings

These go in a new **Audio guide** panel in the editor's sidebar, under Guide settings, saved with the draft.

| Setting | Options | Default |
| --- | --- | --- |
| Narration levels | ☑ Course introduction · ☑ Page introductions · ☐ Contextual audio for selected blocks (Phase 2, shown disabled) | Both standard levels on |
| Voice | **Use the Topic narrator** (`ELEVENLABS_VOICE_ID`, currently "Claire, Calm & Friendly") · **Choose another voice** (a list from ElevenLabs) | Topic narrator |
| Script length | Short (15–20 s, about 35–50 words) · Standard (20–30 s, about 50–75 words) · Extended (30–45 s, about 75–110 words) | Standard |
| Playback | **Play automatically** (recommended): introductions play as learners arrive, with an Audio guide switch to turn them off · **Learner presses Play** · **Offer automatic playback after the learner opts in** (the switch starts off) | Play automatically |

Word counts assume about 150 words a minute, the pace of the current voice settings.

Changing the voice or the length marks the existing scripts or audio as out of date (section 8), so the author can redo only what's needed.

## 6. AI-written scripts

### What Claude reads

- The course title, its standfirst ("what learners will be able to do") and its audience.
- The course outline: every page's title, purpose, teaching pattern and position.
- For each page being scripted:
  - its full content, as the JSON Revise with AI already uses
  - the pages just before and after it, as titles and purposes, so it can link them
- The course's source documents and brief, for background only. The scripts introduce; they don't teach new facts.

### The rules, in the prompt and checked afterwards

1. **Hook, don't summarise.** Open with a question, a challenge or a surprising idea from the page.
2. **Keep it short.** Stay within the length setting. *Checked:* the word count must be within the chosen range, with 10% leeway.
3. **Speak naturally.** Use conversational Australian English and "you", not corporate training language. Write for the ear: short sentences, no lists, no brackets, no abbreviations a voice would stumble on.
4. **Build continuity.** A page introduction may refer to what the learner just did and what's next. The course introduction says what they'll gain.
5. **No spoilers.** Never reveal the best choice in a decision, the right answer in a quiz or activity, or a branching scenario's good ending.
   - *Checked:* each script is compared with the page's best-choice text, the feedback on it and the quiz answers. A long word-for-word overlap (8 or more words in a row) fails the check and is sent back to Claude once to fix, as Draft with AI does.
6. **Respect the source material.** Never state a rate, date, rule, clinical instruction or compliance requirement. Pages teach those, with their evidence; introductions point at them. *Checked:* a script with a dollar figure, percentage or date is flagged for the author to confirm.
7. **The author decides.** Every script is a draft until the author approves it. Audio is only made from approved scripts.

### How the reply is checked

Claude replies with JSON: `{ "intro": "…", "pages": [{ "id": "page id", "script": "…" }] }`.

Each script goes through the checks above using the existing `askForJson` repair loop: one automatic retry with the problems listed, then any remaining problems are shown to the author.

## 7. Generate Magazine Narration (all at once)

The main entry point, for an author who has just built a course.

1. The author clicks **Generate Magazine Narration** in the Audio guide panel.
2. Claude reads the whole course in **one request**, so the scripts form a single arc.
3. It drafts one course introduction plus one introduction per content page. Assessment pages get none.
4. The **Narration review** view opens, showing every script together in course order. For each script:
   - the page title, the script (editable), its word count and estimated length
   - any check warnings
   - **Approve**, **Write again** (regenerates just this script, optionally with a note such as "less formal") and **Preview voice** (records a temporary take, not attached)
   - **Approve all** at the top
5. **Record approved scripts** sends only approved scripts that have no current recording to ElevenLabs, one at a time, with progress. A failed recording can be retried on its own.
6. Each recording is saved as a hub upload and attached to its page (or to the course, for the introduction), with its word timings.
7. Later runs of Generate only redo what's missing or out of date (section 8). Unchanged, approved, recorded scripts are left alone. Regenerating everything is a separate, explicit **Start again** action.

Each script can also be written, edited, approved and recorded from the page itself: a small Audio guide strip at the top of the page in the editor.

## 8. Freshness: keeping narration current

Each narration records what it was made from:

- `contentHash`: a hash of the page's reading content (title, purpose and every block's words, without ids or layout), taken when the script was approved
- `scriptHash`, `voiceId` and `modelId` on the recording

Each narration then shows one of these states:

| State | Meaning | Shown as | Publishing |
| --- | --- | --- | --- |
| Current | Approved, recorded, and the page hasn't changed much since | ✓ Narrated | OK |
| Needs review | The page has changed substantially since approval | Amber "Narration may be out of date" | Allowed, listed as a suggestion |
| Re-record | The script, voice or model has changed since recording | Amber "Record again" | **Blocks**: the audio no longer matches its transcript |
| Draft | Written but not approved | "Script to approve" | Not played to learners. A suggestion, not blocking |
| None | No script | (nothing) | OK |

**"Substantially changed"** means any of these, so small tweaks don't nag:

- the page title or purpose changed
- a decision, quiz, scenario or branching block was added, removed or reworded (this is what spoilers and hooks depend on)
- more than 20% of the page's words changed

The threshold lives in one function, `narrationStale(page, narration)`, so it's easy to tune.

The course introduction goes stale when the course title, standfirst or page list changes.

**Needs review** is a flag, not a lock. The author can mark it **Still fine** (which takes a new `contentHash` without re-recording) or write the script again.

## 9. Implementation

### 9.1 Data model (in the draft document, so narration versions with editions)

Narration lives in the guide document alongside the pages. Published editions are immutable, so a learner on edition 4 hears edition 4's narration.

```ts
// src/lib/magazine.ts
type NarrationLength = "short" | "standard" | "extended";
type GuideAudio = {
  levels: { course: boolean; pages: boolean; blocks: boolean };
  voice: { kind: "topic" } | { kind: "custom"; voiceId: string; name: string };
  length: NarrationLength;
  playback: "auto" | "offer-auto" | "press-play";
  intro?: Narration;            // the course introduction
};
type Narration = {
  script: string;               // up to 1,200 characters
  status: "draft" | "approved";
  contentHash?: string;         // what the page said when the script was approved
  audio?: {
    src: string;                // a hub upload (/api/uploads/…), never the TTS cache
    seconds: number;
    words: WordTiming[] | null; // for highlighting and captions
    scriptHash: string;
    voiceId: string;
    modelId: string;
    at: string;
  };
  checks?: string[];            // warnings from the last generation (spoiler, figure…)
};
// GuideDoc gains `audio?: GuideAudio`; Page gains `narration?: Narration`.
```

- `readGuideDoc` reads both, and drops audio that isn't a hub upload. A draft may hold unapproved scripts.
- The approval draft hash covers narration, so changing a script after sign-off sends the course back through review, as any content change does.
- The AI pre-review also reads the scripts and can flag spoilers or invented facts.
- `pageMinutes` is unchanged. Narration is optional, so it doesn't add to the time.

### 9.2 Server

New `src/server/magazineNarration.ts`:

| Function | What it does |
| --- | --- |
| `narrationPrompt(input)` | Builds the prompt for the whole course or one script (section 6) |
| `narrationIssues(doc, scope, length)` | The automatic checks: length, spoiler overlap, figures, ids |
| `draftNarration(db, actor, guideId, { scope, note?, doc }, now, send)` | Claude, streamed with `eventStream`. `scope` is `"course"`, `"intro"` or a page id. Returns scripts; saves nothing, like Revise with AI |
| `recordNarration(db, actor, guideId, { target, script }, now)` | ElevenLabs with timestamps (reusing `tts.ts`'s request with the chosen voice), saved through `saveUpload`. Returns the `audio` record. Refuses unapproved or empty scripts |
| `voices(actor)` | ElevenLabs `/v1/voices` for "Choose another voice", cached for an hour. Needs the key's Voices read permission; without it, only the Topic narrator is offered, with a note |
| `narrationStale(page, narration)` / `introStale(doc, intro)` | Freshness (section 8), pure functions in `src/lib/magazineNarration.ts` so the editor and the publish checks share them |

Routes:

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/admin/magazine/[id]/narration/draft` | POST | Draft scripts. NDJSON stream |
| `/api/admin/magazine/[id]/narration/record` | POST | Record one approved script |
| `/api/admin/magazine/voices` | GET | The voice list |
| `/api/magazine/[id]/events` | POST | Gains `narration` events: `started`, `finished`, `guide.on`, `guide.off` |

Publish checks in `publishChecks`:

- **Blocking:** a recording that doesn't match its script, voice or model ("Record again").
- **Suggestions:**
  - a narration that needs review
  - a draft script not approved
  - a check warning not cleared
  - "Audio guide is on but page N has no narration"

Audit events: `magazine.narration_drafted` (model, usage, scope), `magazine.narration_recorded` (voice, characters, seconds), `magazine.narration_approved`.

### 9.3 Learner preference

- **Audio Guide On/Off** is saved per learner and per course with the reader's progress, as a `guide_audio` value next to the answers, so it follows them across devices.
- **Mute** lasts for the browser tab only.
- Keyboard: the card's controls are ordinary buttons. **Space** plays or pauses when the card has focus. Nothing plays on hover or focus.
- `prefers-reduced-motion` turns off the word highlight animation, not the audio.

### 9.4 Editor UI

- **Audio guide panel** in the sidebar: the settings, a status summary ("6 of 8 narrated · 1 needs review"), **Generate Magazine Narration** and **Open narration review**.
- **Narration review** opens as a full-width view in place of the outline, like Revise with AI's comparison:
  - one row per script, in course order, with its state (section 8) and actions
  - a filter for **Needs attention**
- **On each page:** a slim **Audio guide** strip above the first section shows the script, its state and its actions. In the editor, the reader's card is shown as it will appear.
- **Course outline:** each page row gets a small narration state icon.

### 9.5 Reader UI

- A new `AudioGuideCard` in `src/components/magazine/`, rendered by `GuideReader` under the page header (and under the cover for the course introduction).
- One shared `<audio>` element per reader, so two introductions never overlap. It pauses when a video plays: video players dispatch the existing `STOP_AUDIO` event.

## 10. Accessibility

- **Transcript:** always visible on the card, as the quote. No information is audio-only.
- **Audio control:** introductions are short (15 to 45 seconds) and pause, mute and the Audio guide switch are always on the card, which meets WCAG 1.4.2 (Audio Control).
- **Labels:** controls have accessible names ("Play the page introduction, 18 seconds"). Progress updates aren't announced.
- **Word highlighting:** uses colour and underline, not colour alone, and follows the learner's existing preference.

## 11. Costs and limits

- **ElevenLabs:** about 8 scripts × about 400 characters, roughly 3,200 characters per course. Re-recording only what changed keeps repeat costs small.
- **Claude:** one request for the whole course, plus small single-script requests.
- **Limits:** a cap of 60 recordings per author per hour, matching the image generation limit, to stop runaway loops.

## 12. Rollout

**Phase 1: Guided introductions.** This is the scope of this PRD.

- Settings, with the Topic narrator plus the voice list.
- Generate Magazine Narration and single-script redo.
- Review, edit, approve and record.
- Freshness states, publish checks and sign-off integration.
- The reader card, the Audio Guide switch, events and analytics (plays and finishes per page, and opt-in rate).

**Phase 2: Contextual audio.**

- An optional `narration` on picture, text and media, decision, branching, conversation and hotspots blocks.
- These play from a small "Listen" button on the block and are drafted with the same rules ("Listen carefully to how the client describes the problem").
- The "Contextual audio for selected blocks" setting switches this on.

**Phase 3: Learning modes.**

- **Read** (no audio).
- **Guided** (Phase 1).
- **Listen:** a fuller audio adaptation per page, where the author chooses to offer one, with its own scripts and review.

## 13. Acceptance criteria (Phase 1)

1. Generate Magazine Narration on a seven-page course returns eight scripts in one review view, each within the length setting, with no best-choice or quiz answer text in any script.
2. **Record approved scripts** records only approved scripts without current audio, attaches each to its page, and survives one failing (the others still record; the failed one can be retried).
3. Editing a page's decision block turns that page's narration to **Needs review**. Changing a script's words after recording turns it to **Record again**, which blocks publishing.
4. With Play automatically, a learner who turns the Audio Guide off hears nothing more unless they press Play; with opt-in, nothing plays until they turn it on. The transcript is always on the card.
5. With the Audio Guide on, moving to an unfinished page plays its introduction once. Revisiting a finished page doesn't. A video starting pauses it.
6. Learners on an older edition hear that edition's narration.
7. Narration never affects **Finish this page** or completion.
8. Unit tests cover the checks, freshness, document reading and publish checks. A browser check covers the reader card and the switch.

## 14. Dependencies and open questions

**Dependencies**

- `ANTHROPIC_API_KEY` for script drafting. It isn't set in local development yet.
- `ELEVENLABS_API_KEY` with **Text to speech** permission (already used by Topics), plus **Voices read** for "Choose another voice".

**Open questions**

1. Should approving a narration script need a reviewer, or is it the author's call, with the course's normal sign-off covering it? *Proposed:* the author approves; sign-off covers it.
2. Is a 20% word change the right "substantially changed" threshold? *Proposed:* start there and tune from author feedback.
3. ~~Should the Audio Guide switch default to **On**?~~ *Decided (19 Nov 2026):* yes. **Play automatically** is the default: introductions play as learners arrive, and they can turn the Audio Guide off with the switch (remembered per course) or pause and mute on the card. Opt-in is still available as an option. *Superseded (25 Nov 2026):* Magazine Audio Introductions (section 15) says audio must never autoplay, so introductions now always wait for Play; what's left of the setting is the Audio guide switch, which starts Ava's transmissions without sound when it's off.
4. Should course introductions also play on the course's landing card in the Magazine list? *Proposed:* not in Phase 1.

## 15. Magazine Audio Introductions (25 Nov 2026)

This extends the Audio Guide above to the *Partner Hub: Magazine Audio Introductions* PRD. It reuses the Audio Guide's scripts, checks, freshness snapshots, recording and storage rather than building a second system. Section 15 is current wherever it differs from sections 1 to 14.

### 15.1 What was reused and what was added

| PRD need | Reused | Added |
| --- | --- | --- |
| Per-page introduction in the document | `Page.narration`, `GuideAudio`, `readGuideDoc` | Optional fields on `Narration` and `NarrationAudio` (15.10). Old guides parse unchanged |
| Script generation | `draftNarration`, `narrationPrompt`, `narrationIssues`, the `askForJson` / `openaiJson` repair loop, `scriptWarnings`, `spoilerIn` | The five-part structure, the author's brief, position, Ava Relay purpose and named people in the prompt; the `editorial` length (70 to 130 words); formulaic-opening, repeated-opening and claim checks |
| Alloy voice | `tts.ts` `narration()` and its disk cache, `openaiSpeech` with `style` (from Family Call) | The **Magazine Editorial Voice** profile (`VOICE_PROFILES.editorial`), `openaiSpeechModel()`, `fresh` takes |
| Storage | `saveUpload` (hub uploads in `data/uploads`) | Nothing new |
| Background generation | The characters portrait queue (in-process, one at a time) and Ava's video jobs (status rows) | `server/narrationJobs.ts`, table `magazine_narration_jobs` |
| Change detection | `pageSnapshot`, `introSnapshot`, `substantiallyChanged`, `narrationState` | States `pending` and `revoice`; the PRD's notice word for word |
| Learner player | (The old `AudioGuideCard` stays only for the Audio guide switch) | `components/magazine/IntroPlayer.tsx` |
| One sound at a time | `STOP_AUDIO` (kept) | `lib/onePlayer.ts` |
| Manager | `NarrationReview` | Rebuilt as the **Audio Introduction Manager**, with a Listening tab |
| Analytics | `magazine_events` via `send("events", …)` | `intro_audio.*` events, `server/narrationStats.ts` |

Routes: `POST /api/admin/magazine/[id]/narration/draft` (unchanged), `GET/POST /api/admin/magazine/[id]/narration/jobs` (replaces `/narration/record`), `GET /api/admin/magazine/[id]/narration/stats`, `GET /api/admin/magazine/voices/preview?voice=`.

### 15.2 The learner player: "Listen to the introduction"

- A page-level feature, not a block. `GuideReader` draws it in the header's text column, beneath the heading, the description and the reading-time line, and before the page's content, on every content page whose introduction is `listenable`: approved, its audio approved (not `pending`), recorded from these exact words, and not turned off (`hidden`).
- A round teal Play/Pause; a waveform that fills as it plays (bars shaped by where the words fall, from the word timings; the same on server and browser, with no randomness); the time and length; seek (press or drag the waveform, a `role="slider"` with arrow keys for 5 seconds, Page Up and Page Down for 15, Home and End); speed (0.75×, 1×, 1.25×, 1.5×, 2×, remembered in this browser); Replay; an expandable transcript that marks the word being spoken (following the learner's "follow word by word" preference); and a quiet "Narrated by an AI voice · Magazine Editorial Voice" ("Recorded narration" for an uploaded file).
- It never autoplays (`preload="none"`, no autoplay, whatever `playback` says) and is never part of finishing a page.
- Moving to another page pauses it, and what was heard is counted.

### 15.3 Ava and the introduction on the same page (decision)

- **Ava's transmission is unchanged.** With a video for the page she still plays where the page's picture goes, starting by herself as before (muted until the page has been used, or with the Audio guide switch off), and the picture takes over when she's done. The course cover's Ava introduction (`audio.intro`, spoken live) is unchanged.
- **The introduction player is shown as well**, in the text column under the description. On a phone the header stacks: heading, description, the player, then Ava's window, then the content. They read as two voices with two jobs: Alloy is the Magazine's editorial voice introducing the page; Ava is the field correspondent with her own transmission. (In "Ready for Your First Shift", Ava's videos have their own words, so nothing is said twice.) An author whose Ava video speaks the page's introduction script word for word may want to give Ava her own line, or keep only one of them; the editor says both appear.
- **Never at the same time** (`lib/onePlayer.ts`, installed by the reader and the player). When the learner presses Play on anything (the introduction, Ava, a video block), everything else that's playing pauses. When something starts *by itself* (Ava arriving on screen) while something else is playing, it waits instead (it's paused), so a start nobody asked for never interrupts one the learner chose. "The learner's" means a real click inside that player in the last five seconds. Muted, looping pictures are left alone. Ava's code isn't changed: the rule works on the page's media events.
- The page header's grid now has one bounded column on a phone. Ava's window caption made the header wider than the screen on pages with her video (it was like this before), and the player would otherwise have sat under it.

### 15.4 The Magazine Editorial Voice, and speech from any provider

- `VOICE_PROFILES.editorial` (lib/magazineNarration): OpenAI Alloy with delivery notes (warm, approachable, calm and professionally confident, conversational Australian English, natural pacing with intentional pauses, not promotional, respectful of an experienced adult audience, no corporate-training delivery). It's the default voice for new courses (`{ kind: "profile", id: "editorial" }`, recorded as `voice: "profile:editorial"`).
- The model is configurable: `OPENAI_TTS_MODEL` (default `gpt-4o-mini-tts`, which supports Alloy and delivery instructions). `openaiSpeech` now leaves `instructions` out for `tts-1` models, which don't take them.
- `SpeechEngine` (server/magazineNarration) is one shape for any provider: text and a voice in; audio, word timings, provider, model and profile out. `hubSpeech` is the real one (OpenAI or ElevenLabs through `tts.ts`); tests pass a stand-in. Another provider or voice is a new profile or engine, and the player and editor don't change. All calls are made on the server with the server's keys.
- Existing courses keep their chosen voice (most say "topic", the Hub narrator, which is now Alloy; "Ready for Your First Shift" says `openai:alloy`). Switching a course to the Editorial Voice marks its recordings **Earlier voice**: a suggestion, not a block, and they keep playing until replaced. (Before, a voice change blocked publishing and silenced them.)

### 15.5 Scripts

The prompt gives the course title, the learning outcomes (standfirst), the audience, the author's brief from Draft with AI (the behaviour change and background), the course outline, and for each page: its position (between which pages), description, Ava Relay purpose where set, the people its cases name, its full content and activities as JSON, and the answers it mustn't give away. Claude also gets the course's source documents; the OpenAI fallback doesn't (as before). Each introduction follows the PRD's five parts as one piece of speech, 70 to 130 words (the `editorial` length, now the default; shorter is fine where it suits), with the PRD's example for tone only. Checks that send the reply back once: length (well outside the range), give-aways, formulaic openings ("Welcome to this module", "In today's lesson" and the like), and two introductions starting with the same three words. Warnings for the author: figures and dates, and words that usually carry a regulatory, financial or clinical claim.

### 15.6 Authoring

Each content page has an **Audio introduction** section at the top (even before the audio settings exist; using it sets them up with the defaults): generate or regenerate the script (with an optional note), edit it (with its word count and estimated length), approve the script, generate or regenerate the audio, preview it, upload replacement audio (an MP3, timed from its length), preview the voice profile, **Approve for publication**, **Show to learners** (on or off), and Remove. Editing a script never makes audio: every paid action is a button the author presses. The sidebar panel keeps the settings (introductions on or off, voice, length, the Audio guide switch).

### 15.7 Background generation, and the published introduction staying put

- Generate audio queues a job for each script (`queued`, `running`, then `done` or `failed`), recorded one at a time in this server. The editor checks every few seconds while any is waiting or running, and attaches each finished recording to the script it was made from, marked `pending` for the author to listen to and approve. A recording of words that have changed since isn't attached. If the editor was closed, the recording is attached the next time it's opened. Once attached, a recording isn't offered again (so discarding a replacement sticks) unless the same words are asked for again.
- The same words in the same voice reuse the recording already made (no new charge); **Regenerate audio** asks for a fresh take. A failed job keeps its error and offers **Try again**. A job stopped part-way by a restart is marked failed after ten minutes. Recording is limited to 60 an hour per author.
- **A failure never touches a course**: jobs don't write to drafts or editions, and published editions can't change anyway.
- **Replacements.** Once an introduction is what learners hear, any change (a new script, an edit, new or uploaded audio) goes into `narration.next`. Learners keep hearing the published one until the replacement is approved for publication *and* the course is published. **Discard the replacement** drops it. `next`, and audio awaiting approval, are never sent to learners (`narrationForReaders`).

### 15.8 The Audio Introduction Manager

Opened from the sidebar, it lists every introduction in the course with its page, script status and version, audio status (none, queued, generating, failed with Retry, to approve, generated, uploaded, earlier voice, doesn't match the script), approval (by whom, when), duration (estimated from the words before there's audio), last generated date and a review flag. Bulk actions: **Generate missing scripts**, **Approve all scripts**, **Generate audio for approved scripts**, **Approve audio**, and for selected rows **Regenerate scripts** and **Regenerate audio**; each row has Preview and Edit; **Outdated only** finds what needs review. Every paid bulk run asks first, and audio shows an estimated cost where the price is reliable: characters × the configured model's price from `SPEECH_PRICES_TO_VERIFY` (US$15 per million characters for gpt-4o-mini-tts and tts-1, US$30 for tts-1-hd), marked to verify. ElevenLabs bills plan credits, and AI script writing has no reliable per-request price here, so those say there's no estimate. The server also refuses several recordings at once without `confirmed`. The **Listening** tab shows the figures in 15.11.

### 15.9 The outdated notice

When a page changes materially after its introduction was approved (the same test as before: the title, purpose or a question changed, or about a fifth of the words), the section shows, word for word: "This page has changed since its audio introduction was generated. Review the introduction to ensure it still reflects the learning experience." It offers **It's still appropriate** (takes a new snapshot), **Update the script**, **Regenerate the script** and **Generate replacement audio**. Nothing is removed or replaced automatically; publishing lists it as a suggestion.

### 15.10 Data (in the guide document, plus one jobs table)

| PRD field | Where |
| --- | --- |
| Introduction script | `narration.script` |
| Script version | `narration.version` (1, then one more for each new script) |
| Audio asset reference, duration | `narration.audio.src` (a hub upload), `.seconds`, `.words` |
| Voice provider, voice profile, generation model | `audio.provider` (`openai`, `elevenlabs`, `upload`), `audio.profile` (`editorial`), `audio.model`; `audio.voice` as before |
| Generation status | `magazine_narration_jobs.status`, then `audio.pending` once made |
| Approval status, approved by | `narration.status` (the script), no `audio.pending` (the audio), `narration.approvedBy`, `narration.approvedAt` |
| Generation timestamp | `audio.at` |
| Content version and hash | `narration.basis` (`hash`, `key` and a MinHash signature of the page when the script was approved). The edition number is the version learners see |
| Estimated and actual cost | `magazine_narration_jobs.est_cost` (when queued) and `audio.cost` (when made). OpenAI's speech API doesn't report a charge, so "actual" is the same estimate, from the characters and the model that made it |
| Visibility | `narration.hidden` |
| Replacement in progress | `narration.next` |

Old guides parse: every new field is optional, and a recording without `pending` counts as approved (each earlier recording was made from an approved script).

### 15.11 Analytics

`send("events", { event: "introAudio", pageId, detail: { action, seconds?, percent?, speed? } })` records `intro_audio.play`, `.complete`, `.replay`, `.transcript`, `.speed` and `.listened` in `magazine_events`, with the page id and numbers only; anything else in `detail` is dropped. The Manager's Listening tab totals them by page: plays, unique listeners, time listened, average reached, finished, replays, transcript opens, speeds chosen, and the share who finished the page among listeners and among people who didn't listen (only when both groups have five people or more). Totals only, never who. Listening is never a completion requirement and isn't treated as evidence of learning. Ava's transmissions keep their `narration.*` events. The Excel decision register isn't extended: it's for decision-practice blocks, and these are engagement figures.

### 15.12 Deviations and limitations

- **No autoplay at all**, replacing the decision in 14.3. The `playback` setting now only controls the Audio guide switch (Ava's muted start). New courses default to `press-play`. The course overview has no player: its introduction is Ava's, on the cover.
- **Script generation isn't a background job.** It's one streamed request for the whole course (or one page), as before, so the scripts form one arc and the author sees progress. Audio generation is the background job.
- **Two approvals**: the script, then the audio for publication. Uploading audio approves the script it reads.
- **Costs** are estimates from a price table marked to verify, not billing data.
- **Embedded videos** (YouTube or Vimeo in an iframe) can't be paused by the one-sound rule. Uploaded videos, Ava and the introduction can.
- **Word timings** for OpenAI voices are estimated from the recording's length, as before; uploaded audio is timed the same way.
- **Jobs run in the server process.** They survive a page closing, not a server restart (a job stopped part-way is marked failed and can be tried again). On a serverless host this would need a queue; the job table is where one would plug in, and where a future Partner Hub Media Studio could take over.
- Unchanged: the course introduction on the cover is spoken live by Ava (`/api/tts`), not the recorded file.

### 15.13 Generating introductions for existing courses

For each course, as an author:

1. Open the course in the editor. In the sidebar's **Audio introductions** panel, choose **Magazine Editorial Voice (Alloy, recommended)** and **Editorial introduction · 30–60 seconds**. (For a course without audio settings, open any page's **Audio introduction** section, or press **Set up audio introductions**.)
2. Open the **Audio Introduction Manager**. Press **Generate missing scripts** (or select pages and **Regenerate scripts** to replace existing ones with the new five-part style), and confirm. This needs Claude (`ANTHROPIC_API_KEY`) or, failing that, OpenAI (`OPENAI_API_KEY`, which is set on this machine).
3. Read and edit each script (**Edit** on its row), then **Approve all scripts** or approve them one by one.
4. Press **Generate audio for approved scripts** (or **Regenerate audio** for selected pages, such as those in an **Earlier voice**), check the estimated cost, and confirm. Keep working; recordings arrive as they're made.
5. Listen to each one (the row's Play), then **Approve audio** (or **Approve for publication** page by page).
6. **Review and publish** the course. Learners hear nothing new until then, and published introductions keep playing meanwhile.

Estimated cost at US$15 per million characters (gpt-4o-mini-tts, to verify): an introduction of 70 to 130 words is about 400 to 800 characters, so roughly US$0.006 to US$0.012 each. A 9-page course is about 6,000 characters (about US$0.09), the 22-page ALIS course about US$0.25, and all 54 content pages in the 26 published courses roughly US$0.32 to US$0.65 (about US$0.50 at 600 characters each). Script writing is extra (one AI request per course, not estimated here). Re-recording unchanged words costs nothing.

### 15.14 Shared with Discovery Paths (25 Nov 2026)

The Discovery Exciter (docs/discovery-exciter.md) reuses this machinery for Discovery Paths, generalised without changing the Magazine:

- Recording jobs have an owner (`guide_id` holds a course id or `learning_path:<id>`) and an optional `delivery` note.
- `SpeechEngine` takes that delivery note (`DELIVERY_NOTES.curious`).
- `textSnapshot` is the generic snapshot.
- `introListening` is the shared listening count.
- `IntroPlayer` takes a `label` ("Listen to your introduction" on paths).

Magazine recordings and Exciter recordings share the 60-an-hour cap per author.
