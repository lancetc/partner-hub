# Quarterly Budget Decision Lab: "Dot at quarter end"

A reusable Magazine block (type `budgetlab`, labelled **Quarterly Budget Decision Lab**) that can also be placed on a Topic card by reference, and a demo article. A care coordinator meets a sizeable balance late in a participant's Support at Home quarter. They tell the **current** balance from the **projected** one, check with the participant before anything else, build a possible plan from discrete sessions on real dates, route an equipment request to AT–HM, then explain the plan and see the consequences.

**Product principle:** the right answer is a plan the person understands and agrees with, within the funding and service rules. A low closing balance isn't an outcome. The rubric never looks at the closing balance, and a plan that leaves money above the carryover threshold can be the strongest answer.

It's practice with synthetic data: **"Practice case: fictional figures"** is on screen throughout. Nothing in it books a service, makes a claim, sends an invoice, notifies a participant or changes a care plan.

Source: _Partner Hub: Quarterly Budget Decision Lab, PRD for Claude_ (21 November 2026). This build is the PRD's first slice (section 13): the Dot scenario and its decision sequence, the calculation and feedback architecture (section 7), scoring and completion (section 8), and the acceptance criteria (section 14) as unit tests.

In the Magazine editor: **Add a block → Simulate → Quarterly Budget Decision Lab**.

## Where things live

| Part                                                                                        | File                                                                                                 |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Rules the Budget Sandbox doesn't have** (for Finance and policy review)                   | `src/lib/quarterEndRules.ts`                                                                         |
| The calculation: current vs projected, threshold, contributions, checks (pure, in cents)    | `src/lib/quarterBudget.ts`                                                                           |
| The block: case shape, learner state, rubric, endings, readers' copy, parse, publish checks | `src/lib/budgetLab.ts`                                                                               |
| The reviewed fictional case (Dot at quarter end)                                            | `src/content/budgetLabCases.ts`                                                                      |
| Attempts, events, author totals, Topic placements, the register sheet                       | `src/server/budgetLab.ts` (table `budgetlab_attempts`, created lazily by `ensureBudgetLabTables`)    |
| Learner API (`?embed=1` for a Topic card, `?stats=1` for authors)                           | `src/app/api/magazine/[id]/budgetlab/route.ts`                                                       |
| Published labs a Topic card can place (authors only)                                        | `src/app/api/admin/budget-labs/route.ts`                                                             |
| Learner view, and `TopicBudgetLab` for a Topic card                                         | `src/components/magazine/BudgetDecisionLab.tsx`                                                      |
| Editor                                                                                      | `src/components/admin/MagazineBudgetLabEdit.tsx`                                                     |
| Topic card field                                                                            | `src/components/admin/LessonLabField.tsx`; `labRef` on a card in `src/content/lessons.ts`            |
| The Quarterly Budget Check Job Aid (seed, in review)                                        | `src/content/playbooks.ts`; `scripts/seed-job-aids.ts` adds it to a running server's database        |
| Demo article                                                                                | `quarterEnd` in `src/content/magazineDemos.ts` (key `quarter-end`)                                   |
| Tests                                                                                       | `src/lib/quarterBudget.test.ts`, `src/server/budgetLab.test.ts`, `src/content/magazineDemos.test.ts` |

Wired in the usual places: `lib/blockRegistry.ts` (its activity contract), `lib/magazine.ts` (type, label, parse, Simulate palette, minutes), `lib/characters.ts` (Dot and Fiona), `server/magazine.ts` (readers' copy, activity list, publish check), `MagazineEditor.tsx`, `MagazineInteractiveEdit.tsx`, `InteractiveBlocks.tsx`, `LessonPlayer.tsx`, `LessonEditor.tsx`, and the decision register export in `server/problemDesk.ts`.

## What's reused from the Budget Sandbox, and what's new

Imported from the Budget Sandbox (`lib/sandbox.ts`, `content/sandboxCases.ts`), never copied:

- the contribution **categories** (Clinical Supports, Independence, Everyday Living), Clinical Supports at 0%, and `categoryOn`, so personal care is Clinical Supports from 1 October 2026 here too;
- the ruleset's **care-management percentage** (10%) and **carryover minimum and percentage** ($1,000 or 10%);
- the **ledger rule** that a session draws its government-funded share from the balance, and the participant's contribution is never extra funding;
- `money`, `isDate`, `quarterDays` and the unit list;
- **prices, units and practice rates**: cleaning ($72 an hour, 2 hours), transport ($45 a trip), garden maintenance ($68 an hour, 1.5 hours), flexible respite ($85 an hour, 3 hours), and the practice rates (Independence 20%, Everyday Living 40%). Dot's case reads them from `SANDBOX_CASES` at load time.

New, in **`src/lib/quarterEndRules.ts`**, flagged at the top of the file **for Finance and policy review**:

1. Carryover is applied to the quarterly budget **including supplements**, and limited to the amount actually unspent.
2. **AT–HM is a separate pool.** An AT–HM item is never drawn from the ongoing quarterly budget, whatever remains.
3. **Transitioned HCP funds** are a separate pool with their own order: for an AT–HM item, unspent HCP funds are drawn before the AT–HM allocation. They never share the ongoing carryover. v1 refuses a case that includes them, rather than giving them the ongoing rule.
4. **Short-term pathway** funds are separate, and not modelled in v1.
5. A booked or proposed service changes a **projection** only: never spent, never claimed.
6. A projected **overspend** is never rolled forward or charged to the participant automatically; only invoiced where they agreed beforehand, under Trilogy Care's process.
7. A **status** per rule set (`current`, `review-required`, `withdrawn`) and its review date, which drive "Review required".

Also new: physiotherapy ($150 a visit) and the platform step ($389) aren't in the Sandbox's price list. Their prices are fictional and say so on the service card.

## The calculation (`quarter-budget-1`)

The PRD's output contract (section 7), from `project()`:

```text
scenarioVersionId, ruleSetId, effectiveDate, modelVersion
actualAvailableCents           current balance, less care management only if the basis says it's still inside
bookedEstimateCents            booked sessions' government-funded share (estimates, never "spent")
proposedEstimateCents          the learner's proposed sessions, likewise
scheduledEstimatedCents        booked + proposed
projectedBalanceCents          actual − scheduled
threshold                      max($1,000, 10% × quarterly budget incl. supplements), with its working
projectedCarryoverCents        min(max(projected, 0), threshold)
projectedAboveThresholdCents   max(0, projected − threshold)
overspendCents                 max(0, −projected): a critical check, never rolled forward
governmentFundingEstimateCents = scheduled
contribution                   known cents, complete?, basis, uncertainty, the lines that need checking
checks[]                       { code, severity, sourceId, result, explanationKey, text }
```

- **Whole cents.** Each session is priced once (units × price) and its contribution rounded once; totals are sums.
- **Care management, once.** The author must say whether the displayed balance already accounts for the care-management allocation (`direct-after-cm`) or still holds some (`gross-before-cm`, deducted once). Blank fails validation, and so does a double deduction.
- **Contributions** appear only with the category's rate, the price and an effective rule. Otherwise "needs checking", never zero; the projection uses the full price meanwhile, the cautious figure.
- **Sessions** a learner proposes are **blocked** (impossible date, supplier not available, AT–HM, unknown service) or **unresolved** (not in the approved care plan, or the participant said no): marked, and kept out of the projection. An unapproved service can be a **review request** instead, which is never a session.
- **Dates** are real: the quarter's start and end, the snapshot ("today"), the days left, and each supplier's open dates. No hard-coded 12-week quarter.

## The Dot scenario

**Illustrative training figures only.** Dot keeps her established facts from the character library: she lives at home and tends her roses, never misses bowls on Thursday mornings, has osteoarthritis in both hands, would rather wait for her regular cleaner Lena than have someone new, and her daughter Fiona worries about the ladder. Fiona is never the one who decides for Dot.

| Display                                | Figure                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Quarter                                | 1 October to 31 December 2026 (92 days); snapshot Friday 4 December, 27 days left                  |
| Quarterly budget                       | $8,000, a fictional practice budget, including supplements (none apply)                            |
| Care management                        | Already accounted for in the direct-service balance                                                |
| Current direct-service balance         | $2,400                                                                                             |
| Booked to 31 December                  | $900 government-funded share ($1,320 full price): Lena's 4 cleans, 6 return trips, 2 garden visits |
| Dot's estimated contributions on those | $420, paid by Dot as delivered, not from the balance                                               |
| Projected balance                      | $1,500                                                                                             |
| Carryover threshold                    | The higher of $1,000 or 10% × $8,000 ($800): $1,000                                                |
| Projected above the threshold          | $500. Not a spending target                                                                        |
| Separate funding                       | No AT–HM allocation, unspent HCP funds or short-term funds in this case (and it says so)           |

What Dot wants (once she's asked): her missed physiotherapy back (openings 15 and 22 December), and the gardener for the high pruning if he can come before Christmas (14 December). She won't have a new cleaner, doesn't want "minding" (respite isn't in her approved plan anyway), and would look at a platform step if it doesn't come out of her care money (an AT–HM item).

**More than one defensible ending**, each played strongly for 15/15 with no flag (tested, and checked by the editor's case check):

| Ending                                              | Projected | Above the threshold |
| --------------------------------------------------- | --------- | ------------------- |
| Physiotherapy rescheduled                           | $1,350.00 | $350.00             |
| Physiotherapy and the gardener                      | $1,288.80 | $288.80             |
| _Retry variation:_ physio full, plan left unchanged | $1,500.00 | $500.00             |
| _Retry variation:_ gardener cancels 21 December     | $1,411.20 | $411.20             |

A **retry** is never the identical case: attempt 2 gets "The physio's books are full" (nothing more can be delivered, so the no-additional-service ending is the right one), attempt 3 "A supplier cancels" (the projection rises; the current balance doesn't, and it isn't money to spend straight away), and so on.

## The learner's path

The budget strip stays on screen throughout: current (actual), booked estimate, any proposed sessions, projected at quarter end (highlighted), the threshold with its working, and the amount above it, each with a definition and its source; then Dot's contribution, the care-management basis and the rule set with its effective date. On a phone it's a two-column grid with every label visible.

1. **Read the picture.** Dot's story and goals; the practice statement and service schedule (computed from the case, so they can't disagree with it), the care plan, the Notice of Decision and the case notes as drawers. The statement and care plan must be opened. Three questions: the projected balance, what the $900 is, and what could carry over.
2. **Check with Dot.** Fiona's email and who decides; choose an approach; then Dot's reply.
3. **Build a possible plan.** Service cards with purpose, approval, price, contribution (or "needs checking"), funding source, supplier and Dot's view. Each open date is a button (never a drag); adding or removing is announced in one sentence with the projection before and after. "Leave the plan unchanged, on purpose" is a real option. Funding lanes show ongoing and AT–HM apart. Choose the equipment route. The decision summary has the projection table.
4. **Explain and record.** Choose an explanation and a next step, and write the reason in your own words (private; any dollar figure in it is checked against the projection).
5. **See the consequences.** The ending, before-and-after projections and the line-by-line table, the rubric in words, any critical error first, every choice with its feedback, Dot's priorities, the debrief, the **Quarterly Budget Check** Job Aid (Save to Favourites), the sources, the versions, and **Try again with a variation**.

The server enforces the order. Each step opens only when the one before is done, and the feedback comes only once the response is submitted.

## Scoring and completion (`budget-rubric-1`)

Five dimensions, 0 to 3 each, from the PRD's section 8: **understands the budget**, **centres the person's goals and choice**, **uses the correct route**, **makes a deliverable plan**, **explains and follows up**. The closing balance is never an input.

**Critical errors** stand above any score and, in assessed mode, prevent a pass: treating an unapproved service as approved; drawing an AT–HM item from ongoing funds; claiming an undelivered service; concealing a known contribution; overriding the participant's decision (a session she said no to). Other codes: current read as available, threshold as target, booked as spent, carry everything, a family request standing in for her choice, a deliverable priority left out, an unapproved reimbursement promised, an unsupported figure.

**Formative by default**: no pass or fail, and the debrief says a score is practice evidence, not performance. **Assessed mode** (an approved programme only) uses the author's pass mark out of 15 with no critical error, logs `assessment_attempted` and, on a pass, `assessment_passed`.

**Completion** needs the statement and care plan opened, the decision, a submitted reason and the **feedback viewed** (`activity_completed` is logged then, and only once). Opening the result, moving a control or refreshing never completes it.

**Attempts.** Each keeps its scenario, rule set, rubric, model and lab versions, and the debrief exactly as given: a later rule or block change never rescores it. A republished course starts a fresh attempt. A resent save, submit or retry never makes a second attempt (a unique attempt number per person, block and course version).

## Events

To `magazine_events`, with person, course version, block, attempt, scenario, rule set, rubric, model, mode, place (`magazine` or `topic:<slug>`) and an idempotency `key`:

`activity_started`, `budget_information_opened`, `budget_projection_viewed`, `budget_plan_changed` (counts only), `funding_route_chosen`, `participant_explanation_submitted` (option ids only), `response_submitted` (ending, score, dimensions, codes, projection), `feedback_viewed`, `activity_completed`, `assessment_attempted`, `assessment_passed`, `retry_started`. **Never the learner's written reason**, and never a figure they typed.

## Authors, reviewers and the register

- **Editor.** Plain fields for the figures and rates (blank rate means "needs checking"), the funding basis, dates, mode and pass mark, the Job Aid; JSON edits for the story, services, schedule, documents and every choice with its feedback. A live "as written" line, and a **case check** that validates the figures (they reconcile; dates in the quarter; care management once; every service with a route and approval state; a displayed contribution has its rate) and plays **every defensible ending** strongly, showing its projection and score. A **reviewer view** lists each consequential feedback line with its rule source. Desktop and phone previews are the editor's own.
- **AI selection rationale** (PRD section 2): problem evidence, theme id, owner, target behaviour, likely barrier, why this block, evidence of practice, work measure, process fix; the author accepts, edits or rejects it. Versioned with the scenario.
- **Publishing.** `budgetLabHardProblems` blocks publishing ("Publish anyway" too) until the case check passes, the rule set is `current`, the sign-off is recorded (owner, Operations/Finance, the Support at Home policy owner, Quality for client-facing language, a learning reviewer for the rubric and accessibility, the approval date), **the rule set the reviewers checked matches the block's** (otherwise "Review required"), and the review date hasn't passed. The demo ships with the sign-off empty.
- **Readers' copy.** No feedback, levels, flags, endings, phrases or debrief until a response is submitted.
- **Totals for authors:** `GET /api/magazine/[id]/budgetlab?stats=1`: attempts, people, submitted, completed, retries, versions; and, with five or more people, scores by dimension, misconception codes, endings, critical errors and passes. Never a reason or a plan.
- **Decision register.** The Problem desk Excel export has a **Budget Decision Labs** sheet: block, course, scenario, rule set and status, placements (Magazine and Topic cards), theme and rationale decision, audience, dates, reviewers, mode, started/submitted/completed/retries, mean by dimension, critical errors, passes, misconception codes and the separately owned work measure. Fewer than five people: counts only. No reason or plan.

## On a Topic card

A card can hold `labRef: { guide, block, why? }` (an additive, optional field on any card). In the Topic editor it's **Practice lab on this card** on an image card, offering only labs in **published** courses (so only a reviewed lab). The player renders `TopicBudgetLab`, which loads the published block's readers' copy from the course (`?embed=1`) and renders the **same component, rules and attempt**: someone who started in the article carries on from the Topic, and events say where. People who can't read the course get a short note instead; anonymous and review-link readers see that a lab sits there.

## Rule changes and withdrawal

Changing a rule set's `status` to `review-required` (or its review date passing, here or on the Sandbox ruleset) marks every lab on it **Review required**: it can't be published, the learner sees a banner, and an **assessed** attempt can't start. `withdrawn` takes it out of use (the API answers 410), so it never stays available as current guidance. Old attempts keep their original rule set and debrief.

## Checked

- **Tests.** `src/lib/quarterBudget.test.ts` (19): the worked example ($2,400 / $900 / $1,500 / $1,000 / $500, $420 contributions); the threshold ($1,000 for $8,000, $1,200 for $12,000, both sides, zero and negative, overspend); care management once and double deduction; AT–HM never in ongoing spend and the transitioned-HCP order without the ongoing rollover; "needs checking" contributions; blocked and unresolved sessions; the no-additional-service ending; two defensible endings with different projections; unwanted spending never passing; critical errors in assessed mode; reason checks; versions; rule status. `src/server/budgetLab.test.ts` (15): publishing and Review required, Dot and Fiona for the character library, readers' copy, step order, server-side blocking, submit and completion, events with no words, retries with variations and no duplicates, old attempts never rescored, assessed pass and critical error, Topic embed and placements, author totals, the register sheet, and no other table touched. The demo article test.
- **In the browser** (signed in as the author on localhost, in a background tab; nothing saved): the editor showed the case check, the live figures and the reviewer view; the editor's Preview played the whole sequence: the gate on step 1, the questions, Dot's reply, adding physiotherapy ($1,500 → $1,350 announced), the extra clean marked unresolved and kept out of the projection, the consequences with the critical error first, the Job Aid's fallback (it isn't approved yet) and the retry with "The physio's books are full".
- **Not checked visually:** the phone layout. A background tab never reveals streamed content, so the preview at phone width couldn't be measured or screenshotted. By design it's a two-column strip with every label visible, wrapping controls of at least 44 pixels, and tables that scroll inside their own box.

## Not yet

- **Scenario variants** beyond the two retry variations: contribution surprise, changed needs (review and reassessment), and transitioned HCP with AT–HM approval. The rules for the HCP order exist (`atHmFunding`); a reviewed case doesn't.
- **AI-phrased feedback.** Feedback is deterministic and approved only. The PRD allows an AI to phrase it from the checked outcomes; not built, and not needed for the block to work.
- **Assessed mode's Question Pool link** (versioned rubric publication and the pool's retry policy): the mode, pass mark and records are here; linking it to the Question Pool's assessment contract isn't.
- **Admin dashboard view** of the totals (they're in the API and the register), item analysis by distractor over time, and the work-measure chart. Work outcomes stay in their own systems.
- **Content issue reports** and withdrawing a single feedback line with an audit record: only whole rule-set withdrawal.
- **Rescheduling a booked session** (moving one of Lena's visits): the learner adds, removes and moves their own proposed sessions; booked ones change only by a variation.
- **The phone layout**, checked by eye (see above).
- **Sign-off.** Everything below needs Trilogy Care's decision before publication.

## For Operations/Finance and the policy owner to approve

1. Every rule in `src/lib/quarterEndRules.ts` (the seven above), and its sources and dates.
2. The carryover threshold's basis: the quarterly budget **including supplements**.
3. That a session draws its **government-funded share** from the direct-service balance, and the participant's contribution is separate (the Budget Sandbox's rule, carried over).
4. Dot's figures: the $8,000 fictional budget, the $2,400 balance, the booked schedule, the "direct-service balance already accounts for care management" basis, the practice contribution rates, and the two new fictional prices (physiotherapy $150, platform step $389).
5. The AT–HM routing feedback, and that an occupational therapist may be needed for the step.
6. The overspend wording, and Trilogy Care's real escalation route for a live case.
7. The **Quarterly Budget Check** Job Aid's steps (`quarterly-budget-check`, in review on a placeholder policy record) and its escalation route.
8. Quality: the client-facing explanation wording. Learning reviewer: the rubric, critical errors and accessibility.
