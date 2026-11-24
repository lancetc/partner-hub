# Service Reliability Calculator: "What does a missed service cost?"

A reusable Magazine block (type `reliability`, labelled **Service Reliability Calculator**) and a demo article. A Care Partner business owner follows one month of missed services: what happened to each person, who or what started each failure, what it took to repair, how long until the service was actually restored, and whether a specific reliability action should come before another referral push. They then choose:

- **an immediate response** to the person who went without;
- **one reliability action**, compared with **one referral push** over the same horizon.

Care, workload and money are **separate results**. There's no single cost figure, no lifetime client value, no churn score and no verdict. A person's missed support, dignity or trust is never given a dollar value.

It answers _is improving reliability a better immediate investment than generating more leads?_ It isn't a booking, complaints or claims system: it doesn't book a visit, approve or penalise a supplier, record a complaint or decide what's claimable. An individual person's concern, complaint or transfer belongs to the 28-Day Trust Check, which **isn't in the Hub yet** (see "Not yet").

Source: _Partner Hub PRD: What does a missed service cost?_ (22 November 2026).

## Where things live

| Part                                                                               | File                                                                                                                   |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| The event and cost model (pure, deterministic)                                     | `src/lib/serviceReliability.ts`                                                                                        |
| The block: case shape, learner state, rubric, parse, readers' copy, publish checks | `src/lib/reliabilityLab.ts`                                                                                            |
| The reviewed fictional case (Mrs Patel's Tuesdays in Maya's business)              | `src/content/reliabilityCases.ts`                                                                                      |
| Attempts, events, author totals, private Decision Sheets                           | `src/server/serviceReliability.ts`                                                                                     |
| Learner API                                                                        | `src/app/api/magazine/[id]/reliability/route.ts`                                                                       |
| Review my service reliability API                                                  | `src/app/api/tools/reliability/route.ts`                                                                               |
| Learner view                                                                       | `src/components/magazine/ServiceReliabilityLab.tsx`                                                                    |
| Editor                                                                             | `src/components/admin/MagazineReliabilityEdit.tsx`                                                                     |
| Tables                                                                             | `RELIABILITY_SCHEMA` in `src/server/db.ts`: `reliability_attempts`, `reliability_sheets`, `reliability_sheet_versions` |
| Demo article                                                                       | `missedService` in `src/content/magazineDemos.ts` (key `missed-service`)                                               |
| Tests                                                                              | `src/lib/serviceReliability.test.ts`, `src/server/serviceReliability.test.ts`, `src/content/magazineDemos.test.ts`     |

## What's reused, and what isn't

Imported rather than copied:

- **The Workload Lens** (`src/lib/workloadLens.ts`): its work categories, cause tags and duration type. A recovery task has one category, so its time counts once; causes are an overlay that never adds time, exactly as in "Where does a coordinator's week go?".
- **The Referral Journey** (`src/lib/referralJourney.ts`): `rate` (every rate is "num/den = %", and a zero denominator is "insufficient data"), `median` and `daysBetween`.
- **Local Coverage** (`src/lib/suburbCoverage.ts`): the service types, so "cleaning" means the same thing in both calculators.
- **Business access**: `plannerAccess` (`src/server/caseloadPlanner.ts`), the same owner-and-authorised-members rule as the sibling calculators.
- **The block shape** from the sibling calculators: an attempt per learner pinned to the course revision, a debrief only from the server, numbered private versions, a printable sheet using the Hub's `growth-sheet` print rule, and the AI selection rationale on the block.
- **Maya** and **Mrs Patel** from the character library.

Carried across only by a link or the owner's own typing, never an automatic prefill:

- **The "more leads" scenario** (Referral Journey) and **onboarding capacity** (Next 10 Clients): entered by hand in the referral-push fields, with a source label. The story's figures say where they came from.
- **Supply states** (Local Coverage): the article links to "Is this suburb ready for growth?" for approved, confirmed supply. The block doesn't model supply readiness itself; that's the Contractor Network Builder's job.

The event definitions (outcomes and reasons) live here, versioned as `reliability-definitions-1`, because the 28-Day Trust Check and the Contractor Network Builder that the PRD says own related definitions aren't in the Hub. When they exist, this block should import from them.

## The definitions (`reliability-definitions-1`)

- **Scheduled outcome**: delivered as agreed; delivered late; suitable replacement on the day; not delivered; status unknown. A booking or an invoice never shows delivery.
- **Initiating reason** (kept separate from the outcome, and not settled until verified): supplier or worker cancellation or no-show; provider booking or handoff error; the participant's own cancellation or no-show; agreed pause; illness or hospital; weather or access; unknown or disputed.
- **Misses needing recovery**: supplier, booking, access and unknown. A participant's own cancellation, an agreed pause and a hospital stay don't.
- **Issue groups**: one recurring problem (the Tuesday-morning roster) is one group, shown beside the unique visits it affected. No double count.
- **Restoration window**: the same day, 2 days or 7 days, chosen so exact days and grouped bands (same day, 1–2, 3–7, over 7) always agree.
- **Source labels**: fictional, entered estimate, verified operational, unknown.

## The model (`service-reliability-1`)

```text
scheduled_visits                 = count(distinct agreed scheduled occurrences)
verified_supplier_failure_rate   = verified supplier/worker-initiated missed occurrences / eligible scheduled occurrences
restored_within_window_rate      = misses restored by a suitable delivered visit within the window / misses needing recovery
recovery_hours                   = Σ duration of each unique recovery task
observed_direct_extra_cost       = recovery_hours × entered loaded hourly cost (where entered)
                                   + documented premiums, credits and other direct costs the business bears
modelled_prevented_occurrences   = affected_occurrences × assumed_reduction_share × (horizon / period)
modelled_recovery_hours_released = modelled_prevented_occurrences × observed recovery hours per affected occurrence
modelled_direct_cost_change      = modelled_avoided_extra_cost − intervention_cost
```

**Two input shapes, one model.** The story has individual visit rows (opaque ids V03 to V20) for everything that didn't go as agreed, plus grouped counts of routine visits by week, service and time window. Review my service reliability has grouped counts only. Both go through the same `calculate`.

**Supplier failures are counted only once verified.** An unverified supplier report is shown and kept out of the numerator. A participant's own cancellation and the provider's booking error are in their own lines (`reasonRates`), never in the supplier rate. An unknown or disputed visit stays in the denominator and is named.

**Recovery runs to the restored visit.** A replacement booked but not delivered leaves the visit open, with its age. The median is of restored visits with exact dates only (grouped bands never make one), and open visits are listed beside it, never as zero-day recoveries. Telling the participant is tracked separately.

**Each task counts once.** Hours by category add up to the total (`partitionOk`); hours by cause are an overlay. A visit that took two calls and a billing correction is one visit and three tasks.

**Money.**

- Only recorded or entered amounts. A blank loaded hourly cost is an error; "not assessed" keeps labour out of the money and says so.
- A cost the business doesn't bear is shown apart; one whose bearer or amount isn't known is listed as "not assessed".
- A contractual fee effect needs a verified agreement or finance record, is shown apart, and is never added. No service fee loss is ever assumed.
- `cleanInputs` drops anything not in the model, such as a "lifetime value" or "churn risk" sent by a client.

**Interventions.** An action names the reason or issue group it's aimed at, and only that subset moves, by the owner's own assumption. Every figure carries a trail and is labelled a forecast. The action's own cost and team time are counted. Hours it frees are read either as a labour cost avoided **or** as onboarding capacity (`freedHours`), never both.

**The referral push.** Entered effort, cost, expected enquiries and starts, weeks to the first start, and onboarding hours per start, beside spare onboarding hours. Warnings: open visits a new referral won't resolve; onboarding it can't cover; starts beyond the horizon; figures that are assumptions.

**The comparison card** (`comparisonCard`) answers four questions: what needs fixing now, what may change if we invest in reliability, what another referral push would require from the same team, and which facts still need confirmation. It gives no verdict.

**Blank, unknown and zero are three things.** A blank is an error, and the page keeps the last valid result, labelled. "Unknown" (a cost, a task's minutes) is kept out of the arithmetic and named. Zero is zero.

The PRD's fixtures 2 to 8 are unit tests with exact figures in `src/lib/serviceReliability.test.ts`:

- 5/100 = 5%, with 2 participant cancellations and 1 booking error visible but not in the numerator;
- 6 hours and $240, then $290 with two $25 premiums the partner bears (and $240 if it doesn't);
- 4.5 modelled hours and $217.50 modelled avoided cost, labelled a forecast (and $37.50 with the hours read as onboarding capacity instead);
- a day-4 restoration and a day-7 open visit with separate statuses;
- a booked replacement that doesn't clear the visit, and a participant's cancellation that isn't a supplier no-show;
- one visit with three tasks counted once, with a rework tag that adds nothing;
- a $200 action and a $200 referral push with no verdict and no lifetime value.

Fixtures 1, 9, 10 and 11 are in `src/server/serviceReliability.test.ts`.

## The fictional case

**Maya** keeps her established facts from the Hiring Runway lab, the Workload Lens, Local Coverage and the Referral Journey:

- a small Care Partner business in Toowoomba;
- 35 clients; three start each month and about one leaves;
- $26,720 in the bank and $10,000 kept in reserve.

Her coordinator isn't named (the library's "Sam" is a Trilogy Care team member). Workers and the supplier are anonymous. Other clients are opaque visit ids.

**Mrs Patel** keeps her established facts: she lives at home and is planning a bathroom upgrade (her Digital Member introduction). Her Tuesday cleaning and the book group she hosts on Tuesday afternoons are this story's situation; they come from Leila's Monday in One Day, Five Perspectives. There's no approved story canon for her in `character_profiles` yet. Her family isn't mentioned, because her two introductions differ (a son who does the paperwork; a daughter, Asha, in Leila's Monday).

Monday 5 October to Sunday 1 November 2026, as of Tuesday 3 November: 100 scheduled cleaning and personal-care visits.

| What          | Figures                                                                                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not as agreed | 11 visits: 5 verified supplier misses (4 of them one supplier's Tuesday-morning roster), 2 participants' own cancellations, 1 booking error, 1 late, 1 same-day replacement, 1 disputed                                                  |
| Supplier rate | 5/100 = 5% (the four weeks before: 1/98 = 1%)                                                                                                                                                                                            |
| Recovery      | Restored within 2 days: 3/6 = 50%. Mrs Patel's 20 October clean restored on day 4; her 27 October clean open on day 7, with a Thursday replacement booked that didn't arrive; another Tuesday client open on day 7 by her own preference |
| Work          | 6.5 hours of unique recovery tasks (6 on the Tuesday issue); one task not measured                                                                                                                                                       |
| Money         | $40 an hour (fictional) × 6.5 h = $260 + $50 premiums = $310; a $30 goodwill credit not assessed                                                                                                                                         |
| The backup    | Aimed at the 4 Tuesday misses, assuming 75%: over 12 weeks, 9 fewer misses, 13.5 hours and $652.50 (forecast), for $350 and 1.5 hours of team time                                                                                       |
| The GP push   | 10 hours and $200 for about 6 enquiries and 2 starts, the first in about 10 weeks; 8 onboarding hours needed against 6 spare                                                                                                             |

## The learner's path

One story beat at a time, with the current result (care, coordinator work, direct cost) beside it from the third beat on.

1. **The empty Tuesday.** Maya, the situation, Ava's optional line, and Mrs Patel's missed clean. Choose the immediate response.
2. **Your first guess.** How many supplier misses, and what they mostly cost. Locked once made, never marked.
3. **More than one incident.** Eight log cards to classify: a verified supplier failure, two participants' own cancellations, a booking error, a same-day replacement, a disputed visit, an urgent essential visit (with "does it need the escalation process now?") and an invoice that isn't evidence of delivery.
4. **The repair work.** Eight lines of the coordinator's records; three repeat a task already counted. Then the month's unique tasks by category, with the cause overlay.
5. **The repeat.** The reliability timeline (weeks, each visit a keyboard button, with a table view): open a visit to see its evidence, date, status and why it counts. The recovery table. Then what the repeat tells Maya.
6. **The competing investment.** The cost trail; test reliability actions with your own assumption; choose how freed hours are read; open the referral push; read the comparison card; choose a decision and an explanation.
7. **The later check.** Mrs Patel's own words, and another client choosing a provider nearer her daughter. Choose how Maya reads it.
8. **Decision Sheet** (the debrief): what happened next, the rubric and flags, the log and repair work line by line, the first guess beside the month, the return visit, the learning Reliability Decision Sheet, the placeholders and links.

The server enforces the order: the log opens only after the response and the first guess; the debrief comes only once every card is classified, every line marked, a visit opened, the repeat answered, an action tested, the referral push opened, a decision, an explanation and the later check chosen.

**Rubric** (`reliability-rubric-1`), each 0–3: cause classification, client-centred response, arithmetic interpretation, honest assumptions, follow-through. It never scores a profitable answer or retention.

**Flags:**

- **critical**, above any score: not sending an urgent safety concern to the escalation process (the client-centred dimension drops to 0 and the debrief says it isn't safe practice yet);
- counting a cancellation or booking error as a supplier failure;
- treating a booking or an invoice as care delivered;
- treating a person choosing another provider as a failed recovery;
- adding a guessed lifetime client value;
- counting the same hours as labour saved and as revenue;
- treating a profitable answer as enough while a visit is unresolved;
- blaming a worker on an uninvestigated report;
- declaring a modelled effect realised;
- making the person wait on the analysis.

"Look again" starts a fresh attempt. Every attempt is kept.

## Review my service reliability

- **Who sees it.** The tab appears only for the business owner and members they've authorised, through `plannerAccess`. The article is complete without it.
- **Starting.** It starts **blank**: two rows (cleaning and personal care, mornings), four task rows, no costs and no actions. Never the story's figures.
- **What it asks for.** Counts by service and time window for a four- or eight-week period: outcomes, misses by reason, unverified supplier misses, recovery by band, booked-not-delivered, unresolved, essential open, recurring issue groups; unique recovery tasks by category and reason; direct costs with who bears them and their source; actions with their assumptions; an optional referral push and spare onboarding hours; an optional comparison period. Never a name, address, diagnosis, complaint text, worker allegation or fee term.
- **Saving.** Unsaved entries stay in the page only, never in browser storage. Save creates a new numbered version; nothing is overwritten; blanks stay blanks. The server forces aggregate inputs: individual visit rows and links to them are dropped, whatever is sent.
- **The Decision Sheet** holds the period, event definitions, observed counts, open visits, recovery hours, verified and estimated costs, the assumptions tested, the chosen action, the accountable owner, the review date, the client-outcome measure, unknowns and notes. It prints alone.
- **Coming back.** A later version shows last time's action and expected effect beside the new figures, and asks what happened and what participants say. An action isn't marked a success because it was created.
- **Access checks.** Every read and write is checked on the server: the person must have access, and the sheet must belong to their own business. Anyone else gets 403 or 404, whatever id they try: a member without access, the author/superadmin, or the owner of another business. Tests cover each.

## Telemetry

Events go to `magazine_events`:

- `reliability_started`, `response_chosen`, `prediction_submitted` (the cost choice only)
- `card_classified` (with whether it matched, and the urgency answer)
- `tasks_marked` (how many lines matched, never minutes)
- `occurrence_opened` (a fictional visit id), `view_opened`
- `intervention_tried`, `assumption_revised` (which action, never the value)
- `repeat_answered` (with whether the answer was flagged)
- `decision_submitted`, `later_answered`, `reliability_completed`
- `retry_started`, `sheet_printed`
- `sheet_saved`, `sheet_returned` (a private sheet saved from the article: the version number only)

They carry ids, fictional choices, matches, flags, rubric levels and the block, story, model and rubric versions only: no typed words, no figures, no assumptions and nothing from a private sheet.

Authors get totals from `GET /api/magazine/[id]/reliability?stats=1`: each person's first finished attempt counts; under 5 people only counts are shown; private sheets are never included.

## Publishing

`reliabilityHardProblems` blocks publishing (and "Publish anyway") until:

- the case check passes:
  - the month validates, has individual fictional visit rows, a verified supplier miss, a recurring issue, and both a restored and an open visit;
  - the log has a supplier failure, a participant's cancellation, a booking error and an entry where escalation comes first, each with feedback;
  - the repair work has at least one repeat line, and every line names a real task;
  - each question and choice list has a strong, unflagged answer; every decision has an outcome;
  - every action starts switched off and names its evidence; there's a referral push, the participant's own words and the Trust Check placeholder;
- the sign-off is recorded: the owner, Care Coordination Operations, Quality/complaints, clinical governance, supplier management, Finance, the policy owner, Partnerships, privacy, and the approval date (effective and review dates beside it);
- any review-by date hasn't passed.

The demo article ships with the sign-off empty. The editor also records the **AI selection rationale** (PRD section 11): the problem evidence and its owner, audience, target behaviour, why a calculation and a story fit, content to reuse, an Operations or supplier fix needed, and the linked scored outcomes and operational data. The author accepts, edits or rejects it.

## Not yet

- **The 28-Day Trust Check Work Tool** doesn't exist in this repo. The block's `placeholders.trustCheck` shows "Next step for an individual person's concern: the 28-Day Trust Check (Work Tools) · placeholder: not in the Hub yet" in the first beat's note, the debrief and the private tab. There's no link. A fictional chart point opens the visit's evidence, not Mrs Patel's Trust Check story.
- **The Contractor Network Builder Work Tool** doesn't exist either. `placeholders.networkBuilder` shows a labelled placeholder and points to "Is this suburb ready for growth?" for supply in the meantime. The supplier-status definitions it would own aren't modelled here.
- **Links back from the sibling articles.** This block links to the referral, next-10, coordinator-week and suburb articles; nothing links back yet.
- **Favourites:** pinning a Decision Sheet needs a new `favourites` kind and a table rebuild, as for the sibling calculators.
- **Integrations:** read-only booking, delivery, supplier, issue and finance signals need data contracts, owners, permissions, refresh, correction and retention rules. Today the private mode is manual aggregate counts only. Exact fee calculations and the operational Excel export (Definitions, Scheduled and delivered, Cause mix, Time to recovery, Repeat issues, Recovery effort, Interventions and outcomes) wait for the same.
- **Admin dashboard and small-cell suppression across businesses:** not built. The authors' totals cover learning only, suppressed under 5 people.
- **AI explanation and the AI Learning Designer:** no AI paraphrase of results, and no recommendation record; the rationale lives on the block.
- **Character canon:** Mrs Patel's book group and Tuesday cleaning come from Leila's Monday, where her Care Partner principal is Amira and her coordinator Leila. Here her principal is Maya. The character editor should reconcile the two storylines (or recast the principal) before both are published.
- **Review:** the case's dates, hours, $40 rate, premiums, 75% assumption and 2-day window are illustrative. Operations, Quality, supplier management, Finance and the policy owner should check them, and set real rules, before anyone uses Review my service reliability for decisions.
