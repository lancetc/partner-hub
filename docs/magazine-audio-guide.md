# Magazine Audio Guide: implementation PRD

**Status:** Draft for review · **Area:** Magazine (courses and guides) · **Builds on:** Topic narration (ElevenLabs), Draft with AI (Claude), the Magazine sign-off process

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
3. ~~Should the Audio Guide switch default to **On**?~~ *Decided (19 Nov 2026):* yes. **Play automatically** is the default: introductions play as learners arrive, and they can turn the Audio Guide off with the switch (remembered per course) or pause and mute on the card. Opt-in is still available as an option.
4. Should course introductions also play on the course's landing card in the Magazine list? *Proposed:* not in Phase 1.
