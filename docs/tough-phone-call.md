# Tough Phone Call

Built from the PRD _“Tough Phone Call” AI Client & Family Simulator_ (19 November 2026). This note records how v1 works, the decisions made, and what's left.

In the Magazine editor: **Add a block → Simulate → Tough Phone Call**.

## What it is

A practice call with a fictional AI caller: a client or a family member with a difficult concern. The learner types or speaks as the Care Partner, uses simulated case tools between replies, and gets a debrief that points to their own words.

It's a **telephone preset of the conversational roleplay engine** ([voice-roleplay.md](voice-roleplay.md)), not a new system. It uses the same:

- scene model (states, good and unsafe moves, safety rules);
- turn pipeline;
- attempts and turns, and their privacy;
- voice handling (speak, check the transcript, send);
- route, limits and author counts.

The phone block adds a **phone case**. It has no choose-a-response version to fall back on.

Nothing in it changes a real invoice, roster, complaint or client record.

## The phone case

| Part                            | What it does                                                                                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Caller and client**           | Who's on the line, who they say they are, and who the call is about                                                                                                                                  |
| **What the caller may be told** | Authorised, general updates only, or not authorised, with what the check shows. Hidden until the learner uses **Check caller and permissions**                                                       |
| **Case tools**                  | Simulated lookups the learner uses between replies: check permissions, open a record, ask about immediate effects, urgent escalation, record a complaint. Each reveals only its authored facts, once |
| **Restricted words**            | Words and numbers that would share a restricted detail, like “itemised” or “260”                                                                                                                     |
| **Urgent cue** (optional)       | What the caller says after a set reply that means the client may be without essential help now, and the escalation tool that must then be used                                                       |
| **How each move is rated**      | Every good and unsafe move counts towards one of six dimensions, can cite a source, and (for unsafe moves) carries a better way to say it                                                            |
| **Policy pack**                 | Dated sources: title, excerpt, version, effective date, review date. Learners can read them during the call                                                                                          |
| **Sign-off**                    | Content owner, Care Operations, Quality and Privacy, plus Finance for a billing call, and the date                                                                                                   |

## The call

1. **Before:** the title, the caller, who they say they are, the setting, the learner's role, what they know, and roughly how long it takes (4 to 7 minutes). **Answer the call** starts it. Nothing plays by itself.
2. **During:** the transcript and reply box, with **Case tools** beside them. On a narrow screen, the call and the case tools are two labelled tabs, and the call controls stay on the call tab.
   - The case tools show the caller, what they may be told ("Not checked yet" until checked), each tool and what it revealed, and the policy excerpts.
   - **Caller concern** (Easing, Steady, High, Very high) changes only after a reply, in words. It's the made-up scene's state, not a measure of anyone, and never a score.
3. **The urgent cue:** on its authored reply, the caller's own line includes it, word for word, so it can't be reworded or missed. An **Immediate wellbeing check** alert appears, and the escalation tool appears in the case tools. It takes priority over everything routine.
4. **Ending:** after the most replies, when the caller reaches a natural close, on a safety rule, or with **Ask for help** or **Exit practice**.

## What's decided by rule, not by the model

- **The privacy gate.** If the learner says a restricted word before checking permissions, or to a caller not authorised for it, the turn records a disclosure. Being family isn't a blanket right. The caller's concern can always be heard; the details can't be shared until it's clear they may be.
- **The urgent cue.** If the cue was heard and the learner didn't use the escalation tool (or show one of the moves that count), the debrief records a critical miss, however warm the call was.
- **Safety rules** (from the shared engine) stop the call on authored phrases, like medication advice or offering to change a supplier's invoice.
- **What a lookup reveals** is only ever the authored facts.

## The model's part

As in the shared engine, a model reads each reply against the authored lists and writes the caller's next line. Its answer is held to the scene: only the learner's exact words count as evidence, the state moves one step at most, and unknown ids are refused.

For a phone call it's also given, for judging only:

- the case file;
- which records the learner has opened;
- what the caller may be told, and whether it's been checked.

That lets it tag an invented reason or an unsupported promise. It's told that the caller:

- isn't staff;
- can't look anything up;
- never asks the learner's own questions;
- never repeats what's in the case file.

A reason that matches an opened record is accurate, and whether it should have been shared is decided by the privacy gate, not the model.

**Checked live** (see below), the model first had the caller speak like staff, and later echo the learner's questions. Both were fixed by the instructions above, and the caller then stayed in character.

## The debrief

Assembled from the authored wording and the learner's own words. No model writes it.

- **Practised** or **Needs another attempt**: a formative recommendation, not a pass mark. A critical issue or any unsafe move means "Needs another attempt". So does leaving part-way, or a rated dimension below Effective.
- **How the call ended**, which is never "the caller calmed down":
  - **Clarified, and a next step agreed**
  - **Escalated, with the client's needs protected**
  - **The caller is still concerned, and their complaint is recorded**
  - **Unsafe or unresolved**
- **Critical issues**, with the reply and words.
- **Six things a good call does:**
  - De-escalation and listening
  - Empathy and dignity
  - Fact-finding and policy accuracy
  - Safety and urgency
  - Privacy and agency
  - Ownership and follow-up

  Each shows a rating in words and as a number out of 3 (Not demonstrated, Emerging, Effective, Strong), the replies that showed it or need care, and something to try. An unsafe move caps a dimension at Emerging, and a critical issue makes it "Critical issue". **Insufficient evidence** is shown when the call didn't test a dimension (privacy, with a caller who's fully authorised; safety, in a call with no urgent cue and nothing said about it). It's never counted as zero.

- **The call, line by line**: each reply, the case tools used before it, and each highlighted phrase with "In this simulated call, this showed…", an alternative for anything unsafe, and its source.
- **Rewrite a line**: pick a reply, write it another way, and see how it reads at that point in the call. Five per call. It isn't added to the call, and nothing but a count is stored.
- **Try the call again** and **Delete this call**.

## The two pilot scenes

Both are **fictional drafts with no sign-off**, so they can't be published until reviewed.

- **The declined gardener invoice** (billing). Karen says she's Mr Hale's daughter. She's cleared for general updates only, so the itemisation reason and the amount are restricted. The care plan shows self-management doesn't end Trilogy Care's responsibility as provider.
- **The contractor didn't arrive** (service). Michelle, Mrs Duffy's authorised representative, calls about a missed personal care visit. After the first reply she says her mum hasn't had her morning tablets and is alone. That's the urgent cue. **The escalation route in this scene is a placeholder** until Care Operations supplies the approved one.

Their sources are the public pages the PRD names (Outcome 2.6b, Outcome 1.4, the Statement of Rights, Trilogy Care's feedback and billing pages, and the Department's self-management page), with placeholder effective dates. The complaints source says its timeframes are outer limits, never a reason to delay urgent safety action.

**Ids.** Every id in a course must be unique, so adding, copying or replacing a scene gives all of its ids a fresh suffix.

## Publishing

The block can't be published, and "Publish anyway" doesn't cover it, until:

- the sign-off is recorded (Finance too, for a billing call);
- every source is before its review date.

The usual checks also apply: the scene's states, moves, unsafe moves and safety rules; a permissions tool; facts for every tool; a dimension for every move; and an escalation tool for an urgent cue.

**What learners' browsers get.** Never the caller's profile, the rubric, the safety rules, what a tool reveals, what the caller may be told, the restricted words or the urgent cue. Revealed facts come from the server as each tool is used.

## Checked live

Checked on a throwaway course with the real model, then deleted:

- the invoice call: a sound opening, then a disclosure before checking, a payment promise, and a next step;
- the no-show call: the urgent cue arriving on reply 1, the escalation tool, and a sound finish.

What was seen:

- the privacy gate fired;
- the false promise was capped;
- privacy was "Insufficient evidence" with an authorised caller;
- the ending was "Escalated";
- the narrow-screen tabs and urgent alert worked;
- the editor rendered.

**The live model mis-tagged three things.** "I'll call you back by one" was read as promising an arrival time. A complaint offered after the client was helped was read as leading with the complaints process. A reason taken from the opened invoice was read as a guess.

The scenes' unsafe moves now say plainly where the line is. This is exactly what the PRD's pilot quality gate is for: a reviewed set of sample transcripts, re-run when a scene or the model changes, still needs building.

Speaking a reply wasn't tried: voice is off for the Hub, and it needs a microphone.

## Not yet

- **A reviewed evaluation set** of sample transcripts, re-run before release. The PRD's pilot gate lists the cases.
- **Topics.** The block is Magazine-only.
- **AI-drafted scenes** from a prompt or approved documents.
- **The approved internal workflows.** The caller-verification, escalation, replacement-visit and complaint-recording workflows aren't real yet, and the no-show route is a placeholder.
- **A character voice per scene.** The spoken line uses the Hub's voice.
- **Reporting beyond counts.** Authors get the shared engine's counts. There's no report of learning gaps by dimension yet.
- **Retention.** Calls stay until the learner deletes them.

---

# Tough Family Call

Built from the PRD _Partner Hub: Tough Family Call Simulator_ (21 November 2026), section 19: the smallest reviewable vertical slice. It **extends this block**: a `phonecall` block with a `family` case runs on its own engine. Without one, a phone call works exactly as before, and old attempts load as they did.

In the Magazine editor: **Add a block → Simulate → Tough Phone Call**, then **Start from a pilot scene → Tough Family Call: Fiona and the missed garden visit**.

## Repository map: what's reused

| PRD concept                        | Reused from                                                                                                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block, picker, editor              | The `phonecall` block: its scene (opening, profile, intensity scale, moves, risks, safety rules, voice), phone case (older person, caller, case-file sections, restricted figures, better options, dated sources, sign-off) and editor |
| Bounded model                      | The roleplay engine's adapters (`askForJson` for Claude, `openaiJson` for OpenAI), `safetyMatch`, `said`, `replyProblem`, the 600-character reply limit and an hourly turn limit                                                       |
| Speech to text                     | `/api/magazine/[id]/roleplay/transcribe` (the recording is transcribed and not kept; only when the Hub has voice switched on)                                                                                                          |
| Text to speech                     | `server/tts.ts` `narration()`: Fiona in `openai:coral` with reviewed delivery notes (part of the cache key); Ava in her own voice (Alloy) via `/api/tts?key=familycall:<guide>:<block>:brief` or `:debrief`                            |
| Ava host                           | `AvaTransmission` (audio never preloads or plays by itself; the script shows as text)                                                                                                                                                  |
| Characters                         | Dot and Fiona from the library, with their canon kept. Nobody else is named (the gardener is "W1, of Archway Gardens"), so publishing queues no portrait                                                                               |
| Job Aid and Favourites             | `AidSection`, and the **Difficult Family Call** seed (unapproved) in `content/playbooks.ts`                                                                                                                                            |
| Attempts, events, totals, register | The Discharge Pivot's pattern: a frozen scenario per attempt, `magazine_events` with keys and versions, suppression under five people, a Problem desk Excel sheet                                                                      |
| Sign-off gates                     | `publishGuide`: the case check before the demo sign-off wrapper, the reviewers inside it                                                                                                                                               |

## Where things live

| Part                                                                                                                                   | File                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Engine: types, parsing, intents, turns, the bounded caller's checks, corrections, rubric, debrief, case check, sign-off, readers' copy | `src/lib/familyCall.ts`                                                                                             |
| The Dot and Fiona case, with six evaluation fixtures                                                                                   | `src/content/familyCalls.ts` (also a pilot scene in `content/phoneCalls.ts`)                                        |
| Attempts, turns, events, retention, totals, Admin view, review queue, register                                                         | `src/server/familyCall.ts` (tables `family_call_attempts` and `family_call_turns`, created by `ensureFamilyTables`) |
| Learner API, and Fiona's voice                                                                                                         | `src/app/api/magazine/[id]/family-call/route.ts`, `.../family-call/speech/route.ts`                                 |
| Admin API and page                                                                                                                     | `src/app/api/admin/family-calls/route.ts`, `/admin/family-calls` (`FamilyCallsAdmin.tsx`)                           |
| Learner view and the editor's preview                                                                                                  | `src/components/magazine/FamilyCall.tsx`                                                                            |
| Editor                                                                                                                                 | `src/components/admin/MagazineFamilyCallEdit.tsx` (inside `MagazinePhoneCallEdit.tsx`)                              |
| Demo article                                                                                                                           | `familyCall` in `src/content/magazineDemos.ts` (key `family-call`)                                                  |
| Tests                                                                                                                                  | `src/lib/familyCall.test.ts`, `src/server/familyCall.test.ts`, `src/content/magazineDemos.test.ts`                  |

## How a turn works

1. **Safety, by rule.** An authored phrase stops the call with the reviewed response. No model is asked.
2. **The authored reading.** Risky phrases come first (so "no need to make a complaint" is never read as offering the route), then restricted figures, then everything else. A risky phrase softened just before it ("I can't promise he'll be there tomorrow") isn't scored: a critical one goes to review. Something Fiona is asked about is answered only when it's asked as a question.
3. **The bounded caller,** when the block uses it and a model is connected. The model proposes intent ids, evidence with quotes, and a line. Unknown fields or ids refuse the whole proposal, and a quote the learner didn't say is dropped. The line is refused if it has a number not already in the call, an amount of money, a revelation not yet unlocked, a forbidden claim (registered supporter, consent, a fall, a reason, a booking) or staff-speak.
4. **The server's state changes only by authored rules:** the intents' flags, revelations and intensity shifts, then a stage beat (Fiona's own push, word for word). Facts and permissions aren't in the state at all. Intensity has a floor that only an unsupported promise breaks, so a sound call ends with Fiona still upset, and a false promise can calm her.
5. **Fallback.** If the model is down, gives an invalid answer or strays, the authored reply is used and the turn is kept. The learner sees a notice, and `caller_fallback_used` is logged with the reason.

Text and voice go through the same code. The mode is recorded, never scored. A spoken line can be corrected before the result: it's read again by rule, the story doesn't change, and a changed critical finding goes to review.

## The rubric (`family-rubric-1`)

Five dimensions, each 0 to 3, with three authored criteria each:

- **Communication:** acknowledges the concern.
- **Older person's agency:** centres the older person.
- **Information boundaries:** maintains boundaries.
- **Accuracy and escalation:** clarifies and checks facts.
- **Follow-through:** takes accountable action.

The criteria read the moves shown, the case-file sections opened, the note and the wrap-up actions. A non-critical unsafe move caps its dimension at 1; a critical error makes it 0.

**Critical errors** in this case:

- an invented booking;
- an invented reason;
- removing the gardener on Fiona's word;
- discouraging a complaint;
- a funding promise;
- treating Fiona as the decision-maker;
- sharing Dot's budget.

A blanket refusal and defending the contractor cap their dimension but aren't critical. Each critical error carries its consequence and a better option.

A finding goes to **review**, never an automatic fail, when:

- only the model saw it;
- it's hedged;
- a transcript correction changed it;
- in assessed mode, its threshold isn't approved yet.

In assessed mode, review holds the result until a reviewer records passed, not passed or formative only.

The caller's mood is never an input, and there's no rapport meter. Practice cues are authored rules on the state, shown with their reason. They're optional, and hidden in assessed mode.

**Completion** needs all of these:

- the briefing (the call starts from it);
- a substantive call: at least the fewest replies, without leaving or ending early;
- a note or a follow-up action;
- the debrief viewed.

## Endings

| Path (fixture)                                                | Ending                                                                                   | Score    |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| A sound call                                                  | Fiona is still upset, and a check and a callback are agreed (defensible; practised)      | 15 of 15 |
| The same, at lower intensity                                  | A check and a callback are agreed; Fiona is a little calmer (defensible)                 | 15 of 15 |
| "He'll be there tomorrow", "get rid of him", "it's your call" | Fiona is calmer for now, on a promise the record doesn't support (three critical errors) | low      |
| Shares the budget figures                                     | A boundary or a fact was crossed                                                         | low      |
| "I can't tell you anything"                                   | Unresolved (boundaries capped, not critical)                                             | low      |
| "No need to make a complaint"                                 | A boundary or a fact was crossed                                                         | low      |

## Events

Events go to `magazine_events`. Each one carries:

- the attempt;
- the scenario, its version and its hash;
- the rubric, prompt and engine versions;
- the character and source versions;
- the mode, the caller, the place, the eligible audience or role, and the receipt time;
- an idempotency key.

The events are `activity_started`, `call_mode_selected`, `case_file_checked`, `call_paused`, `call_resumed`, `boundary_checked`, `complaint_route_offered`, `scenario_state_reached`, `caller_fallback_used`, `transcript_correction_requested`, `follow_up_recorded`, `response_submitted`, `feedback_viewed`, `activity_completed`, `assessment_attempted`, `assessment_passed`, `review_resolved`, `source_issue_reported` and `retry_started`. **No spoken or typed words are in any event** (tested).

## Privacy

- The transcript, note and quoted words stay on the attempt for `retentionDays` (30 in the demo), then they're removed. The levels and the ending stay.
- Only the learner reads their call. Authors see totals.
- A reviewer opening flagged evidence is audited (`family_call.transcript_viewed`).
- The Admin view and the Excel sheet hold no words, no audio and no reading of anyone's feelings.

## Publishing

**The case check** (`familyCaseProblems`) is never waived. It checks that:

- every reference resolves, and every move can be shown by an intent;
- the sharing preferences have at least one yes and one no;
- the case file has the complaint route, and unknown or disputed facts;
- authored lines are short, unshouted, and say nothing the caller must never claim;
- each dimension has three criteria;
- there's a defensible ending and a fallback ending;
- the model debrief reads as safe under the rubric;
- every fixture plays to its expected ending, including a passing fixture where the caller is still upset.

**The sign-off** (`familyHardProblems`) sits inside the demo sign-off wrapper. It needs:

- from the phone case: the owner, Care Operations, Quality and Privacy;
- from the family case: the story owner, Quality/complaints, the Support at Home policy owner, an accessibility reviewer and the escalation-process owner;
- the release and review dates, and the scenario version they reviewed;
- each critical error's threshold approved;
- the voice's licence, its approved use, and who recorded it;
- the privacy notice.

An assessed call must run on the reviewed script. Withdrawing the call stops new attempts, and an assessed call past its review date is held.

## Checked

- **Tests.** Engine and server tests mapped to the acceptance criteria above, plus the demo article. The full suite passes.
- **Live, on a throwaway "ZZ Test family call" course.** It was published with test sign-offs on the reviewed script, so no AI call was made, then archived, and its attempts and events were removed. In a background tab:
  - At 375 px: the briefing, the call and case-file tabs, opening sections, a typed reply, the practice cues, the wrap-up and the debrief. There was no horizontal scroll, and no control under 44 px.
  - On a desktop width: the unsafe path's debrief, with its three critical errors first, each with its consequence and a better option.
  - The wrap-up checkboxes registered with real clicks.
  - The editor showed the case check and the sign-off list for the demo draft.
  - The Admin view showed the call, with its levels suppressed.
  - No TTS or speech request was made.
- **Fixed from the live check.** Fiona skipped a reply when a beat had already raised the topic. She dropped an answer to a direct question (it now takes up to three lines). And she answered "has it happened before?" to a statement.

## Not yet

- **AI dialogue suggestions while authoring:** a disabled stub. No paid call is made.
- **Calls 2 and 3** (the contribution question, and siblings who disagree): they need Finance and policy/Quality review.
- **A form editor** for intents, criteria and fixtures: JSON edits with the live check, for now.
- **A coach's view** of a learner's call, pending policy.
- **Placement on a Topic.**
- **The model hasn't been run.** Every model path is tested with an injected fake, and the live check used the script. The bounded caller's evaluation set (the fixtures against the real model) is still to do before learners use it.
- **Not tried live:** the microphone, voice playback (Fiona or Ava), the review queue in the browser, a screen reader, and the Job Aid in the debrief (it's unapproved, so learners correctly don't see it).
