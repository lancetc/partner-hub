# The 72-Hour Discharge Pivot: "Dot comes home"

A reusable Magazine block (type `discharge`, labelled **72-Hour Discharge Pivot**) that a Topic card can also place by reference, and a demo article. It's a time-aware triage simulation at a fictional coordinator's desk on the afternoon before a participant may come home from hospital. Alerts arrive as authored milestones. The handover record shows what's missing and unverified. An action board (Verify, Arrange, Escalate, Follow up) holds the decisions, and a readiness panel shows each gate as confirmed, pending or unresolved. The learner then records a handover and sees the consequences.

**Product principle:** a safe, honest transition plan with explicit ownership of unresolved risks. An unresolved gap that is escalated and not presented as ready is a defensible ending. A hidden first-service gap is never a safe handover, however quickly the learner finishes.

Source: _Partner Hub: The 72-Hour Discharge Pivot, PRD for Claude_ (21 November 2026). This is section 17's smallest end-to-end version: one fictional Dot case with changing alerts, deterministic states and several defensible endings; an accessible, pauseable triage board; a handover and debrief; authoring, source and clinical approval gates; a disabled AI dialogue stub; the canonical Job Aid with Favourites; and activity, Admin and Excel event wiring. The acceptance criteria (section 15) are tests.

In the Magazine editor: **Add a block → Simulate → 72-Hour Discharge Pivot**.

## Repository map: what's reused

| PRD concept                                  | Reused from                                                                                                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block registry and activity contract         | `lib/blockRegistry.ts` (a `decide` contract with the PRD's events, barriers and a poor-fit note pointing to process fixes)                                                                               |
| Magazine and Topic renderers                 | `lib/magazine.ts` (type, label, parse, Simulate palette, minutes), `InteractiveBlocks.tsx`, and a Topic `pivotRef` on image cards, exactly as Spot the Hazard's `sceneRef` and the Budget Lab's `labRef` |
| Attempts, idempotent writes, frozen versions | Spot the Hazard and the Budget Decision Lab: a lazily created table, a unique attempt number, the scenario frozen on the attempt, events with keys and versions, totals suppressed under five people     |
| Sign-off and publish gates                   | `publishGuide` in `server/magazine.ts`, inside the demo sign-off wrapper (`server/demoSignOff.ts`)                                                                                                       |
| Job Aids and Favourites                      | `AidSection` (Save to Favourites), and a new seed Job Aid in `content/playbooks.ts`                                                                                                                      |
| Characters                                   | Dot and Fiona from the library, keeping their canon (`content/storyPilot.ts`)                                                                                                                            |
| Decision register (Excel)                    | `server/problemDesk.ts`: a **Discharge simulations** sheet beside Budget Decision Labs                                                                                                                   |
| Assessment                                   | The Budget Lab's contract: formative by default; assessed uses a pass mark, logs `assessment_attempted`, and `assessment_passed` only with no critical error. The Question Pool isn't used               |

## Where things live

| Part                                                                                                  | File                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| The engine: types, moves, replay (`derive`), gates, rubric, debrief, desk view, checks, readers' copy | `src/lib/dischargePivot.ts`                                                                                |
| Source register (public sources checked 21 Nov 2026; Trilogy Care's own procedures as placeholders)   | `src/lib/dischargeSources.ts`                                                                              |
| The Dot case, its retry variation and its authored paths                                              | `src/content/dischargeCases.ts`                                                                            |
| Attempts, events, author totals, placements, the register                                             | `src/server/dischargePivot.ts` (table `discharge_attempts`, created by `ensureDischargeTables`)            |
| Learner API (`?embed=1` for a Topic card, `?stats=1` for authors)                                     | `src/app/api/magazine/[id]/discharge/route.ts`                                                             |
| Published simulations, placements and sources (`?source=` to trace one), for authors and Quality      | `src/app/api/admin/discharge-pivots/route.ts`                                                              |
| Learner view, the editor's local preview, and `TopicDischargePivot`                                   | `src/components/magazine/DischargePivot.tsx`                                                               |
| Editor                                                                                                | `src/components/admin/MagazineDischargeEdit.tsx`                                                           |
| Topic card field                                                                                      | `src/components/admin/LessonDischargeField.tsx`; `pivotRef` on a card in `src/content/lessons.ts`          |
| The Hospital-to-Home Handover Check Job Aid (seed, unapproved)                                        | `src/content/playbooks.ts`                                                                                 |
| Demo article                                                                                          | `dischargePivot` in `src/content/magazineDemos.ts` (key `discharge-pivot`)                                 |
| Tests                                                                                                 | `src/lib/dischargePivot.test.ts`, `src/server/dischargePivot.test.ts`, `src/content/magazineDemos.test.ts` |

## The model (PRD section 10)

| PRD entity          | Here                                                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DischargeScenario` | The block: title, participant, who decides, supporter status, the story clock, rationale, Job Aid, mode, sign-off                                                                                           |
| `ScenarioVersion`   | `scenarioVersion` plus the frozen copy on every attempt (with its hash), `PIVOT_VERSION`, `RUBRIC_VERSION`, `ENGINE_VERSION`; the sign-off records the scenario version reviewed                            |
| `Alert`             | `alerts[]`: from (a role), reliability (verified, not yet verified, second-hand), access (who may be told), release (`at`, `after` actions plus `delay`, a time `window`), variation, body, effects, source |
| `Action`            | `actions[]`: lane, intent, owner, needs, dependency, time cost, possible consequence, the field it shows, effects, codes (with exceptions), specialist signal, verdict, feedback, source                    |
| `ReadinessGate`     | `gates[]`: label, essential or not, the record fields it reads, conditions for confirmed, pending, escalated and a documented contingency, accepted owners, source                                          |
| `Attempt`           | a `discharge_attempts` row: learner, course version, block, attempt number, play (timed or untimed), variation, the frozen scenario, the ordered moves, the handover, the debrief as given                  |

**Deterministic replay.** The learner's state is just their ordered moves: fields checked, alerts read, actions taken (with the story minute), waits, pause, the handover. `derive` replays them against the scenario every time, so the server, the editor's preview and a resumed attempt compute the same thing.

**What can and can't change a status.** A learner's own card can only set a field to _requested_, _pending_, _recorded_ or _agreed_. Only an alert from a **verified** source can make something _accepted_, _approved_, _booked_, _confirmed_, _delivered_ or _reviewed_. The scenario check refuses a block that breaks this. So no click turns a recommendation into a delivered service; "Mark the first nursing visit as arranged" exists as a card, changes nothing in the record, and is the critical error.

**The story clock** starts on Wednesday at 3:30 pm and moves only when the learner acts or chooses **Wait for replies** (15 minutes). Reading the record, an alert or the readiness panel costs nothing. The proposed discharge (Thursday 11 am) closes the desk, leaving the handover. **Untimed practice** hides the clock and ignores the time windows: a reply that would close while the learner thinks never does.

## The Dot case

**Illustrative synthetic case only.** Dot keeps her library facts: her roses, bowls on Thursday mornings, osteoarthritis in both hands, making her own decisions. Fiona is her daughter, close, not a registered supporter. Nobody else is named, so publishing queues no character or portrait.

| Minute        | Alert (from, reliability)             | What it changes                                                                                                                                     |
| ------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0             | Hospital discharge planner (verified) | Proposed discharge; OT recommends a shower chair; ward note says "maybe twice daily"                                                                |
| 10            | Fiona (second-hand)                   | "Is everything arranged? Cancel the gardener? I can do the dressings."                                                                              |
| ask + 45      | Signed discharge summary (verified)   | Wound plan, medicines and responsible practitioner confirmed (once a day, not twice)                                                                |
| call          | Dot (verified, her own words)         | Her wishes; Fiona may know visit times and what's arranged, not the medicines or wound                                                              |
| ask + 10      | Trilogy Care clinical lead (verified) | Takes clinical ownership                                                                                                                            |
| 60            | A colleague (second-hand)             | "Put her on Restorative Care. Or Transition Care."                                                                                                  |
| request + 30  | Nursing provider (verified)           | **Declines Friday and the weekend**: the essential-service gap                                                                                      |
| 90            | Hospital OT (verified)                | No loan chair; delivery Monday; ask for an interim plan                                                                                             |
| escalate + 30 | Discharge planner (verified)          | By 6:30 pm: outreach nurse confirmed for Friday. Later: referral pending, call by 9 am. Retry variation: outreach full, the hospital's team decides |

Four lanes, 25 cards: the strong moves, and the unsafe shortcuts the PRD names (accept Fiona's dressings, set twice-daily dressings from the note, charge the chair to the quarterly budget, promise Restorative Care, book extra help "the review will cover", email Fiona the summary, reassure her it's all arranged, mark the visit arranged, cancel the gardener for money, tell the hospital Dot can't leave).

**Endings.** Several are defensible. Each authored path is played by the scenario check and shown in the editor's branch preview:

| Path                                                                      | Ending                                     | Score |
| ------------------------------------------------------------------------- | ------------------------------------------ | ----- |
| Escalates the uncovered visit as soon as the provider declines            | A fully confirmed first-day plan           | 15/15 |
| Does the equipment and gardener first; tells the hospital after 6:30 pm   | A documented contingency and a named owner | 14/15 |
| Retry variation: the outreach team is full                                | An unresolved gap, escalated, not ready    | 15/15 |
| Untimed practice, the same late order                                     | A fully confirmed first-day plan           | 14/15 |
| Unsafe shortcut: tells Fiona it's arranged and declares ready, at 3:50 pm | A critical error                           | low   |

## Scoring (`discharge-rubric-1`)

Five dimensions, 0 to 3 each (PRD section 8): **clinical handover**, **first-day continuity**, **participant voice and privacy**, **funding and service route**, **coordination**. Each is the count of authored criteria met (conditions on the replay and the handover), capped by codes. Elapsed time is never an input: playing the same choices with extra waiting scores the same (tested). One criterion is about **order**: telling the discharge planner within 30 story minutes of the provider declining, which means "without doing other work first", in timed and untimed play alike (story minutes come only from decisions and waits). It's why the late path scores 14, not 15, while still reaching a defensible ending.

**Critical errors** (no pass in assessed mode): marking the handover ready or a gate confirmed while an essential gap remains (`hiddenGap`, from a card, a handover answer or the declaration); wound care by an unqualified or unconfirmed person; an invented clinical direction; a promised pathway or equipment approval; AT–HM from ongoing funding; sharing what Dot didn't agree to; a requested review treated as funding. Other codes: a request treated as a confirmation, a family member deciding, cancelling a valued service for money, trying to halt the discharge, an unescalated gap, no first check.

**The handover.** For each gate the learner says confirmed, pending or unresolved, and who owns the next step; answers what they'll tell Dot and the hospital, and what the first check after the return home is; and declares _ready_, _ready with a documented contingency_ or _handover incomplete: the gap is escalated_. Overstating an essential gate, or declaring more than is true, is `hiddenGap`.

**Completion** needs a field checked, a decision on the board, a submitted handover and the debrief on screen. An opened page, a moved card or the clock reaching discharge never completes it.

**The debrief**: the ending; critical errors first; what was actually confirmed, what remained uncertain, who was contacted, and the first check after the return home; the handover as stated against what stood; the rubric in words with what was done and what was still to do; the answers' feedback; order and timing (time to escalate the uncovered visit, as context only); moves not made; a step-by-step replay of the timeline; why it matters; the Job Aid with Save to Favourites; sources and owners; versions; **Try again** (with the variation).

## Events

To `magazine_events`, with person, course version, block, attempt, scenario, hash, rubric, engine and pivot versions, mode, variation, place (`magazine` or `topic:<slug>`) and an idempotency `key`: `activity_started`, `handover_field_checked`, `action_taken`, `clinical_gap_identified`, `escalation_selected`, `funding_route_selected`, `service_confirmation_received`, `readiness_status_viewed`, `activity_paused`, `activity_resumed`, `handover_submitted`, `response_submitted`, `feedback_viewed`, `activity_completed`, `assessment_attempted`, `assessment_passed`, `retry_started`. **Every string in an event is an id, a code or a version** (tested): no free text (there's none to type) and no fictional clinical detail.

## Authoring, review and publishing

- **Editor.** Plain fields for the frame; JSON edits for the record, alerts, cards, gates, questions, rubric, endings, gap, variations and paths. The **scenario check** runs live: references resolve, every card and alert is reachable, no card can confirm, only verified alerts confirm, every gate has an owner, label and source, and every authored path plays to its ending (defensible ones with no critical error, at least two different ones). The **branch preview** lists each path's ending, score, critical errors and finishing time. The **reviewer view** puts every alert, card, gate and handover option beside its source, and marks critical errors. The **sources** list shows each one's owner and status. A disabled **AI assistance** section says what AI will and won't do. **Preview** (desktop and phone) plays the same engine locally, first attempt or the retry variation, and stores nothing.
- **Publishing.** A scenario that fails its check is refused even under a demo sign-off (that's the engine, not a reviewer's call). Inside the demo sign-off wrapper, `pivotHardProblems` (which "Publish anyway" can't waive) also needs every cited source current and real (the three Trilogy Care procedures are placeholders), the Job Aid linked, an assessed pass mark if assessed, the six sign-offs and the date, the scenario version reviewed matching the block's, and a review date not passed. The demo ships unsigned.
- **A source change.** Set a source's status in `lib/dischargeSources.ts` to `review-required` (or let its review date pass): every block citing it is held from publishing and new assessed attempts can't start; `withdrawn` stops new attempts (410). `GET /api/admin/discharge-pivots?source=<id>` lists every live placement resting on it. Old attempts keep their frozen scenario and debrief.
- **Readers' copy.** The frame only: no record, alerts, cards, gates, questions, rubric, endings, variations or paths. The desk view sends what has arrived and the cards usable now, never feedback, codes or a future alert.
- **Totals for authors** (`?stats=1`): attempts, people, submitted, completed, retries, versions; with five or more people, rubric levels, endings, codes, critical errors, passes, essential gates left open and the median minutes to escalate the uncovered visit in the simulation.
- **Decision register.** The Problem desk Excel export has a **Discharge simulations** sheet: scenario, status, placements, theme and rationale decision, Job Aid, audience, dates, reviewers, mode, counts, means by dimension, critical errors, passes, codes, gates left open, minutes to escalate, and the separately owned work measure, shown as "Not set: an owned gap, not evidence" when missing. Under five people: counts only.

## Accessibility (PRD section 13)

Every decision is a labelled button; nothing is drag-only. On a phone the four desk areas are tabs (alerts show "(2 new)"); on a wide screen they sit side by side. New alerts are announced politely and never move focus; focus moves to each stage's heading after the learner acts. Statuses are words ("Requested, not confirmed"), with an icon shape, never colour alone. Pause and resume, untimed play, and a step-by-step replay. No motion, flashing or sound. Controls are at least 44 pixels tall.

## Checked

- **Tests**: `src/lib/dischargePivot.test.ts` (24) and `src/server/dischargePivot.test.ts` (9), mapped to the acceptance criteria: the case passes its own check and every path ends where it says (1); only Dot and Fiona are named; can't publish as shipped (1, 16); a hidden first-service gap is the critical error when finished in 15 story minutes, when every good card was used, and from "mark arranged", with no assessed pass (5); time never changes the score; no card confirms, and the check catches one that tries (3); recommended, requested, declined, pending and confirmed kept apart (3); the panel never ready because every card was taken (4); an unresolved gate stays unresolved until confirmed or a documented contingency (4); Fiona and consent (7); no prescribing, fitness decision or halting (6); AT–HM, TCP, Restorative Care and a review (8, 10); the gardener (9); the escalated ending is defensible, an unescalated one isn't (11); pause and untimed (12); idempotent moves, starts, submits and completion, and retries with a variation keeping the first debrief through a republish (13); totals suppressed, placements, register and refusal for non-authors (15); nothing written outside its table and the event log (17); readers' copy and desk view without the key; events carry ids only. The demo article and registry tests.
- **On the running server** (a throwaway "ZZ Test" course published under a demo sign-off, deleted afterwards): the whole prompt path through the API as a coordinator (15/15, confirmed, completed once viewed, a resent action a no-op, author totals suppressed, 403 for a non-author on totals, placements listed); then in a background Browser tab at 375 pixels: start, the four tabs, checking a field (announced), 14 cards, waiting, the readiness panel turning ready only once confirmations arrived, the handover form, submit, the debrief and replay, with no horizontal scroll and no control under 44 pixels. At 1280 pixels: the 2 × 2 desk, Try again giving the "outreach team is full" variation, pause and resume, and the unsafe shortcut's debrief with the critical error first. The editor showed the scenario check and the branch preview for the demo draft. No character or portrait was queued by publishing.
- **Fixed from that check**: focus didn't move to the desk heading after Start (the attempt component remounted), and the replay listed the first action before the 3:30 pm alert that prompted it.

## Not yet

- **AI dialogue and AI drafting**: a disabled stub, no paid call.
- **The AI Learning Designer's recommendation** reads the registry contract (so it can suggest this block, or say a process fix is needed); no Designer UI changes.
- **A form editor** for cards, alerts and gates: JSON edits for now, with the live check.
- **The Question Pool** for assessed placements, and an Admin dashboard view of the totals (they're in the API and the register).
- **More cases and variations**: only Dot and one retry variation.
- **Learner reports that the block is inaccurate**.
- **Not checked by eye**: screenshots (a background tab doesn't paint; its streamed page needed `requestAnimationFrame` shimmed to show at all), a screen reader, the editor's own Preview, the Topic card placement in the player, and the Job Aid in the debrief (it's unapproved, so learners correctly don't see it yet).

## For Trilogy Care to approve before publication

**Operational contacts**

1. The real routes for the two placeholder Job Aid contacts: "Clinical lead for hospital discharges" and "After-hours clinical escalation".
2. Who the internal clinical owner of a return home is, and how a coordinator reaches them (the case's "Trilogy Care clinical lead").
3. How coordinators contact a hospital discharge planner, and whether hospital community outreach nursing is a route Trilogy Care uses.
4. Which nursing providers are authorised, and how capacity is confirmed in writing.

**Clinical thresholds and content**

5. That an uncovered first wound-care visit after discharge is an essential gap to escalate "straight away", and the escalation timing the "within 30 story minutes" criterion stands for.
6. Every clinical line in the case: a daily nurse dressing (not the ward note's twice), the ward doing Thursday's, the OT's seated wash at the basin with no shower until the chair arrives, and that family or support-worker dressings aren't arranged.
7. Which errors are critical, and their remediation: the seven in `CRITICAL`, and the caps in `CODE_CAPS`.
8. The essential gates and what confirms each (six, five essential).

**Funding facts**

9. A shower chair goes through AT–HM, assessed and approved separately, never the ongoing quarterly balance, in the base case (transitioned-HCP funds would need a separately reviewed variant).
10. Transition Care is a hospital referral and assessment; Restorative Care needs assessment and approval and excludes someone receiving or eligible for transition care; neither is automatic after a hospital stay.
11. A Support Plan Review request is pending, never an approval or immediate funding, and what evidence an urgent one needs.

**Workflow decisions**

12. Replace the three placeholder procedures: the hospital-to-home handover procedure, the clinical escalation route and the privacy and consent procedure.
13. The Hospital-to-Home Handover Check's steps, owner and approvals (it's safety-critical: owner, Clinical and Quality).
14. That the coordinator doesn't stop a hospital's discharge, and what they do instead.
15. What a supporter who isn't registered may be told, and how consent is recorded.
16. Formative by default; whether any programme needs the assessed mode, and its pass mark (11 of 15 in the case).
17. The work measure (first-service gaps or discharge rework per eligible discharge), its owner, denominator, baseline and review date.

**Character canon** (for the character steward): Dot's short hospital stay and a wound needing a nurse's dressings; the OT's shower-chair recommendation; that Dot tells Fiona about her medicines and the wound herself. The PRD's "after treatment for a fall" is **not** used, because Dot's profile says never to give her a fall an approved episode hasn't established.
