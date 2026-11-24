# The 28-Day Trust Check: "Mrs Patel's Week 8"

From the PRD _Partner Hub: 28-Day Trust Check and Service Recovery Playbook_ (21 November 2026). This release is the PRD's vertical slice (section 18, steps 2 to 4, with the safe-analytics parts of step 5):

1. **A fictional Service Recovery Diagnostic** (the PRD's "Churn-Risk Diagnostic & Save Simulator"), a Magazine block (`trustcheck`, labelled **28-Day Trust Check**), end to end: Mrs Patel's Week 8, four decisions, a plan builder, Day 7 and Day 28 checkpoints, several valid endings including a chosen move, a deterministic rubric with critical errors, author editing, publish gates, totals and a decision-register sheet, and a seeded demo draft.
2. **The 28-Day Trust Check Work Tool** (`/tools/trust-check`), a staged, role-restricted workbench over **demo data only**. It reads no real participant, booking, delivery, claims, complaint, incident or exit record, and it won't until Trilogy Care approves those data sources (the page, `DATA_SOURCES` and this note say so).

Principles the engine enforces, whatever a case says:

- **A signal is not a prediction.** There's no churn score, probability or "will leave" anywhere. `triageFromSignals` only names a type of unresolved problem (immediate escalation, service recovery, review with the person, context explained); a budget balance on its own is at most "review with the person", and a known pause, hospital stay or claim lag is context. A case whose signal card shows a churn score is refused at publishing.
- **The person comes first.** Her own words drive the conversation (she answers guardedly until she's been heard), and who may be told what follows her recorded sharing preferences. Telling a relative a topic she hasn't agreed to is critical.
- **Leaving is her right.** A supported move is a defensible ending with full marks; pressing her to stay, an inducement or recording her choice as a failure is critical.
- **Never discourage a complaint.** A choice that does is critical, and so is the plan's own wording, read with the Tough Family Call's reviewed phrases and hedging rule.
- **"Did it help?" needs evidence.** A status that claims a fix needs a delivery record and her own view chosen from the checkpoint; a booking or a reminder isn't either.

In the Magazine editor: **Add a block → Simulate → 28-Day Trust Check**.

## What it reuses (and doesn't duplicate)

| Need                                  | Reused from                                                                               | How                                                                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missed visits: outcomes and reasons   | Service Reliability Calculator (`lib/serviceReliability.ts`, `reliability-definitions-1`) | Each visit on a signal card is an `OUTCOMES`/`REASONS` pair; only `RECOVERY_REASONS` raise service recovery. A participant's own cancellation or an agreed pause never does.      |
| The money card                        | Quarterly Budget Decision Lab (`lib/quarterBudget.ts`, `lib/quarterEndRules.ts`)          | `carryoverThreshold` on the block's effective-dated rule set; `ruleStatus` holds publishing and assessed attempts when the rules are due for review (rule expiry)                 |
| Sharing preferences                   | Tough Family Call (`lib/familyCall.ts`)                                                   | The block's `sharing` is `SharingRule[]` (topic, allowed, detail); `restrictedTopics` reads it                                                                                    |
| Complaint wording                     | Tough Family Call (`content/familyCalls.ts` and `interpret` in `lib/familyCall.ts`)       | `discouragesComplaint` runs the family call's reviewed "discourages or dismisses a complaint" phrases and hedging rule on what the learner writes. Not a copy                     |
| Deterministic engine, attempts, gates | 72-Hour Discharge Pivot and Build Your Local Bench                                        | Pure replay of choices, frozen attempts with a hash, idempotent moves, authored paths played by the case check, readers' copy, suppressed totals, register sheet                  |
| Return episodes and check-ins         | Living Cases / Signal Room                                                                | Not rebuilt: Day 7 and Day 28 are within the attempt. A later "Mrs Patel returns" episode is authored in Return episodes, and the block's rationale takes a Problem desk theme ID |
| Job Aid and Favourites                | Job Aids (`content/playbooks.ts`, `AidSection`)                                           | A new seed, **28-Day Trust Check: check-in and action plan** (`trust-check-plan`, unapproved), in the debrief and the Work Tool with Save to Favourites                           |
| Role restriction                      | `plannerAccess` (`server/caseloadPlanner.ts`)                                             | Every Work Tool read and write; anyone else gets `{ access: null, notice }`                                                                                                       |
| Characters                            | Mrs Patel and Asha, both already in the library                                           | Nobody else is named, so publishing queues no portrait                                                                                                                            |
| Finding a replacement worker          | Not modelled                                                                              | The case's "another approved supplier" is the booking owner's job; the Contractor Network Builder is for building capacity, not this case                                         |

## Where things live

| Part                                                                                                    | File                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine: vocabulary, signals and money, sharing and complaint rules, moves, debrief, view, checks, parse | `src/lib/trustCheck.ts`                                                                                                                                                          |
| Mrs Patel's Week 8, its variations and authored paths                                                   | `src/content/trustCases.ts`                                                                                                                                                      |
| Attempts, events, author totals, register                                                               | `src/server/trustCheck.ts` (table `trust_attempts`, created by `ensureTrustTables`)                                                                                              |
| Learner API (`?stats=1` for authors)                                                                    | `src/app/api/magazine/[id]/trust-check/route.ts`                                                                                                                                 |
| Learner view and the editor's preview                                                                   | `src/components/magazine/TrustCheck.tsx`                                                                                                                                         |
| Editor                                                                                                  | `src/components/admin/MagazineTrustCheckEdit.tsx`                                                                                                                                |
| Work Tool: server, demo data, API, page, view                                                           | `src/server/trustTool.ts`, `src/content/trustDemo.ts`, `src/app/api/tools/trust-check/route.ts`, `src/app/tools/trust-check/page.tsx`, `src/components/tools/TrustCheckTool.tsx` |
| Job Aid (seed, unapproved)                                                                              | `trust-check-plan` and the `service-recovery` placeholder record in `src/content/playbooks.ts`                                                                                   |
| Demo article                                                                                            | `trustCheck` in `src/content/magazineDemos.ts` (key `trust-check`)                                                                                                               |
| Tests                                                                                                   | `src/lib/trustCheck.test.ts`, `src/server/trustCheck.test.ts`, `src/components/magazine/trustCheckRender.test.ts`, `src/content/magazineDemos.test.ts`                           |

Wiring in shared files: `lib/magazine.ts` (type, label, parse, Simulate palette, minutes), `server/magazine.ts` (readers' copy, activity list, `caseProblems` before the demo sign-off wrapper, `trustSignOffProblems` inside it), `MagazineEditor.tsx`, `MagazineInteractiveEdit.tsx`, `InteractiveBlocks.tsx`, `lib/blockRegistry.ts` (the activity contract), `lib/characters.ts`, `server/problemDesk.ts` (a **Trust checks** sheet) and `WorkTools.tsx` (the card).

## The case

**Illustrative and synthetic.** Monday 23 November, week 8 of 12. You're Mrs Patel's Care Partner.

| Signal card (source, reliability)                           | What it shows                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Two Tuesday cleans not delivered (booking record, verified) | Brightway cancelled 10 and 17 November: supplier reasons, no replacement delivered                          |
| A replacement she couldn't use (booking notes, verified)    | Thursday 7 am offered, not booked                                                                           |
| About 40% remains (dashboard, out of date)                  | $2,480 of $6,000 shown; planned $4,000, delivered $3,700, claimed $3,520, pending unknown, $2,000 scheduled |
| An invoice line she doesn't recognise (invoice, reported)   | "Additional clean, Sat 14 Nov: $150"                                                                        |
| Asha's voicemail (reported)                                 | "Send me her budget and sort this out"                                                                      |
| Her preferences; her care plan goal (verified)              | Asha copied on appointment changes only; "reliable cleaning, so I can keep hosting my book group"           |
| One requested record                                        | The refreshed claims feed ($180 pending), Brightway's roster, or the earlier "will call back"               |

Once the lag and scheduled services are counted, the 41% is a $300 projected closing balance, under the $1,000 carryover limit, and the $300 service gap is the two missed cleans.

**The decisions.** Notice: facts, alternative explanations (one is needed before a triage), one record, a provisional triage. Ask: who first, the opening, up to three questions, her complaint question, what's actually wrong, and the triage again (the provisional one is kept and never scored: revising isn't punished). Act: the plan (her concern in her words, actions, an operational owner, the next update, a contingency, the check, what Asha is told, what you'd say), then "Brightway can't commit to Tuesdays". Check: Day 7 and Day 28 records chosen as evidence, then the status. Learn: what to raise beyond the case.

**Variations** (retries in turn, and the editor's preview branches): she chooses to move at Day 28; a pause she chose with a claim lag (no concern after verification); a slip in the shower she mentions on the call (immediate escalation). The family-permission test (Asha asking for the budget) is in every variation. Learners see only "Some of what happens later is different this time": the label would give the ending away.

**Authored paths** (played by the case check and shown in the editor):

| Path                                                     | Ending                        | Score              |
| -------------------------------------------------------- | ----------------------------- | ------------------ |
| Hears her first, fixes both causes honestly, verifies    | Resolved with her             | 21/21              |
| The same, and she chooses to move: supported             | A respectful, supported move  | 21/21              |
| A pause she chose: verified, recorded, not pestered      | No concern after verification | 21/21              |
| A slip she hadn't mentioned: escalated today             | Safety concern escalated      | 21/21              |
| Spends the balance, a shower chair, Asha told the budget | A critical error              | low                |
| She chooses to move, and is offered a voucher to stay    | A critical error              | high, but critical |

**Rubric** (`trust-rubric-1`), 0 to 3 each: signal interpretation, participant voice and permissions, cause and priority, policy accuracy, accountable action, outcome check and choice, system learning. A dimension is the strictest level among the choices that touch it, capped by codes (`CODE_CAPS`). **Critical** (`CRITICAL`, any one is the critical ending and no assessed pass): pressure to spend; AT–HM from the ongoing budget; bypassing review; discouraging a complaint; sharing beyond her preferences; an unconfirmed promise; retention pressure; a move recorded as a failure; holding a safety concern; a fabricated reason; labelling her a churn risk. Each comes with a correction and its source. Other codes: a one-signal verdict, an inference as fact, a pause as a problem, family first, a call instead of a fix, no operational owner, no contingency, no evidence, a course where a process fix was needed.

## Events

To `magazine_events`, each with a key, the attempt, scenario version and hash, rubric, engine, policy (rule set) version, mode, variation, place, theme and `fictional: true`: `trust_check_opened`, `simulation_started`, `signal_viewed`, `evidence_selected`, `alternative_explanation_selected`, `triage_selected`, `participant_question_asked`, `plan_proposed` (option ids and whether something would be said, never the words), `critical_rule_flagged` (the code), `followup_checkpoint_viewed`, `outcome_recorded`, `transfer_branch_completed`, `improvement_issue_raised`, `response_submitted`, `feedback_viewed`, `activity_completed`, `assessment_attempted`, `assessment_passed`, `retry_started`. `job_aid_saved` is the Job Aids' own event. No typed words, no names (tested).

## Authoring, publishing, reporting

- **Editor.** Plain fields for the frame, the rule set and the follow-up window; JSON edits for sharing, signals, decisions, the plan builder, variations, paths, endings and sources, with the case check live and a branch preview table (ending, score, critical errors per path). AI dialogue and drafting are a disabled stub: no paid call.
- **Publishing.** `caseProblems` runs before the demo sign-off wrapper (a churn score on a card, a step with no safe choice, an unrevealed record, a path that doesn't end where it says, fewer than two defensible endings, a real-looking identifier: never waived). Inside the wrapper, `trustSignOffProblems`: the four placeholder Trilogy Care procedures replaced, a current rule set, the Job Aid, and nine sign-offs (owner, Care Coordination operations, Quality/complaints, policy and budgets, Finance/billing, clinical governance, Partnerships, privacy, learning) on this scenario version, with a review date not passed. The demo ships unsigned.
- **Totals** (`?stats=1`, authors only, marked `mode: "fictional"`): attempts, people, submitted, completed, retries; with five or more people, levels, endings, codes and critical errors.
- **Decision register.** The Problem desk Excel export's **Trust checks** sheet: scenario, rule set, signal, rationale decision, Job Aid, audience, reviewers, counts, means by dimension, critical errors, endings, codes, the separately owned work measure and "Fictional simulation" as the mode. Under five people: counts only.

## The Work Tool (demo data only)

For the business owner and the members they've authorised (`plannerAccess`); the Work Tools card shows only to them. A workbench of five anonymous demo issues (a missed service, a statement question with a complaint, low spend after a planned pause, a wish to change provider, a possible safety concern shown first), each with its workflow status (needs verification, waiting for owner, action due, checking outcome, resolved with person, transferred by choice, escalated: never a risk band), owner, last verified signal and next agreed contact, and the four questions: What do we know? What did the person say? Who owns the action? What happened?

The server guards every status (`workflowProblem`): a safety concern stays escalated; "resolved" needs the issue's evidence ticked; "transferred" needs the person's own decision; owners are operational roles. A complaint or incident reference is read-only, and no status withdraws or downgrades it. There's no free text (a board's name aside, refused if it looks like a person's details). Boards save privately to the business as numbered versions, idempotent by key; another business can't read or write them. Its events (`trust_check_opened`, `signal_viewed`, `followup_checkpoint_viewed`) carry a demo id only. The pilot's data sources and settings are listed on the page, none connected.

## Checked

- **Tests**: `src/lib/trustCheck.test.ts` (30), `src/server/trustCheck.test.ts` (16), `src/components/magazine/trustCheckRender.test.ts` (7) and the demo article test, mapped to the acceptance criteria: the case and every path (7, 10); one signal never a "will leave" verdict, a budget alone at most a review, pauses and lags as context (1, 8); alternatives before triage (1); a revised triage not punished (2); AT–HM corrected with its source (3); Asha and the budget flagged, appointments allowed (4); a plan needs its parts, a call isn't a fix (5); Tuesdays as her choice, never a promise (6); a fix and a supported move score the same, pressure is critical (7); a complaint stays in its own system (9); author totals and the register suppressed and fictional (11); role restriction and business boundaries (12); rule expiry, AT–HM, pause suppression, supporter access, transfer, and a booking isn't a verified outcome (14); idempotent moves, submits and saves; no typed words in events; the Work Tool imports nothing that holds real records.
- **On the running server**: a throwaway "ZZ Test trust check" course published under a demo sign-off; the strong path through the API as a coordinator (21/21, resolved, a resent submit identical, completed once viewed, totals suppressed, 403 on totals for a learner); the Work Tool API for an owner and a coordinator (access and none). Then, in a background Browser tab at 375 pixels, the whole case by keyboard-equivalent clicks: start, the evidence switch, opening cards, every decision with focus moving to the next one, her replies, the plan refused with its list of what's missing and then proposed, the Brightway branch, the checkpoints, and the debrief (choosing a booking and a reminder as Day 7 evidence gave the coded "not verified" result). No horizontal scroll and no control under 44 pixels at any stage. The course was archived and its attempts and events removed afterwards.
- **Fixed from that check**: focus didn't move after Start (the attempt remounts), and a Day 7 claim without evidence made the whole case "not verified" even after a properly verified Day 28 (now coded, with the outcome dimension capped, and the later ending stands).

## Not yet

- **Not checked by eye**: the desktop layout (a background tab stopped drawing the Magazine page after a reload; the static markup is pinned by tests instead), the Work Tool's workbench with access (the shared demo cookie on the network address had changed to a non-owner, and it wasn't changed back), the editor, a screen reader, and the Job Aid (unapproved, so learners correctly don't see it).
- **Admin dashboard charts and the eight-sheet Excel export** (Definitions, Signal counts, Issue funnel, Time to resolution, Planned vs delivered aggregate, Participant-reported outcomes, Transfers aggregate, Interventions and content versions): there are no operational outcomes to report until real data is approved. Practice evidence is in the register sheet.
- **Real signals** (PRD section 14's pilot): no Portal, CRM, booking, claims, complaints, incident or exit integration; no CRM-triggered outreach.
- **AI**: no bounded AI Mrs Patel, no AI-drafted check-in plan, and no Learning Designer UI change (the registry contract lets it recommend the block).
- **Pinning the Work Tool to Favourites**: needs a new favourites kind.
- **More cases** (first-statement confusion, contractor setup in the first 28 days, a clinical escalation as its own case) and a Topic card placement by reference.
- The Service Reliability Calculator's `placeholders.trustCheck` still says "not in the Hub yet": its owner can now point it at `/tools/trust-check`.

## For Trilogy Care to approve before real use or publication

**Operating model**

1. The Care Partner business owner's operational authority over follow-ups (default: fictional practice and a template only).
2. The follow-up cadence by issue type (default: Day 0, an owner check, about Day 7, by Day 28) and that urgent issues never enter it.
3. Who owns booking escalation, billing review and complaints, with real routes for the "Feedback and complaints team" contact and the four placeholder procedures (clinical and incident escalation, complaints, exit and transfer, booking and supplier escalation).
4. Whether coordinators or business owners record Work Tool statuses, and whether a status should ever be written back to a system of record (default: never).

**Data and privacy**

5. Each data source's contract: owner, fields, lawful purpose, roles and business boundary, freshness, suppression, retention, audit and correction (`DATA_SOURCES` lists seven, none connected).
6. Contact and sharing permissions: how a person's preferences are recorded and read, topic by topic; no inferred family entitlement.
7. Analytics thresholds (default: fewer than five, counts only) and what an aggregate dashboard may show across businesses.

**Content and claims**

8. The case's policy lines: carryover (the higher of $1,000 or 10%), the AT–HM boundary, statements, care-plan review and the right to change provider; the rule set's review date (20 May 2027).
9. The critical errors and caps (`CRITICAL`, `CODE_CAPS`), and that a supported move scores the same as a fix.
10. The Job Aid's steps, owner and approvals.
11. Formative by default; any assessed use and its pass mark (15 of 21 in the case).
12. The work measure, its owner, denominator and baseline (not set).

**Character canon** (for the character steward)

- Mrs Patel: Week 8 of a quarter; Brightway cancelling 10 and 17 November; the 14 November invoice line; her preference for a weekday-morning phone call; and, in variations only, a pause at her sister's, a slip in the shower she hadn't told Asha about, and a decision to move to a provider her book-group friend uses, nearer Asha.
- Asha: a voicemail asking for her mum's budget; that she drives her mum to appointments.
- The family conflict stays open: her Digital Member introduction and the Invoice X-Ray case say a son does the paperwork; One Day, Five Perspectives and this case use her daughter, Asha. Her Care Partner principal is unnamed here (Maya in the reliability story, Amira in One Day). The PRD's "Brisbane" isn't used.
