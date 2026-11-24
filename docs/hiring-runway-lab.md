# Hiring Runway Decision Lab

Built from *Partner Hub: Hiring Runway Decision Lab block* (21 November 2026), with the calculation contract from *Caseload-to-Margin & Hiring Capacity Calculator* (section 6). This note records what v1 does, the decisions made, and what's still needed before live publication.

In the Magazine editor: **Add block → Simulate → Hiring Runway Decision Lab**. It starts from Maya's case as a draft.

## Lab 2: the decision window (24 November 2026)

Built from *Partner Hub: Care Partner Caseload, Margin and Hiring Runway Simulator* (21 November 2026). That PRD asks for a Care Partner business Work Tool plus a fictional learning block, using one reviewed model. Both already existed (this block, and the Caseload-to-Margin Work Tool, `docs/caseload-margin-calculator.md`), so they were **extended**, not duplicated.

### What changed, against the PRD

| PRD asks for | Before | Now |
| --- | --- | --- |
| A decision **window** with its assumptions, never one exact trigger | One heuristic month for the expected case | `lib/hiringWindow.ts` (`hiring-window-1`): a capacity date for the slower, expected and faster cases; a recruitment start window from each (capacity − lead − ramp + 1), widened by the stated recruitment uncertainty (default ±1 month); the assumptions and unknowns listed with it |
| Capacity, margin and cash side by side | Option cards: months over, lowest cash, operating result | A table for every option: months above the threshold, **contribution margin**, result **before owner remuneration**, operating result (owner pay always included), **break-even month**, lowest cash and the worst case across the three cases, with risks in words |
| Options to compare | Keep, 0.6 FTE, 1.0 FTE, workflow | The same, plus the alternatives the PRD names whenever pressure is forecast (interim capacity, pacing intake, repairing a process, talking with Trilogy Care), each marked as needing judgement |
| Recruitment and ramp | In the model | The window is timed by them; hires are costed from the base case's start-by, so a late pressure date isn't judged on a hire paid from Month 1 |
| Sensitivity ranges | Three growth cases | Plus a one-at-a-time table: one more referral a month, onboarding 50% longer, recurring work 10% heavier, one more exit, two weeks' unplanned leave, a month longer to recruit, payments a month later. Each says what moved |
| Honest uncertainty | "A window under these assumptions" | Plus: a suggestion that can be **Hold and monitor**, **Watch the faster case**, **Plan recruitment**, **Consider beginning recruitment**, **Interim capacity while recruiting** or a plain **Capacity and cash conflict**, with its factors. Revenue unknown stays unknown |
| Quality guardrail despite margin; cash warning despite a profitable hire | Partly | Both are explicit factors (tested) |
| Monthly direct contact as a guardrail only where the agreement assigns it | Not modelled | `contactDuty` on the case (and on a plan): then months above the threshold are a service risk to that contact. Never a claimable-hours figure |
| Classifications 1 to 8 | Work bands only | Optional `classifications` (eight counts), shown as context. They must add up to the caseload and never change hours, income or the window (tested) |
| Events | Lab events | Plus `assumption_changed` (the key, never the value), `scenario_compared` (sensitivity opened) and `source_opened` (calculation basis) |
| Admin and the Excel register | Authors' totals by API | `/admin/hiring-runway` and a **Hiring Runway labs** sheet in the Problem desk decision register (`hiringRegister`): response id, versions, audience, dates, reviewers, participation, rubric means and misconceptions over the denominator, use of the low/high cases, the owned work measure and keep/revise/retarget/withdraw. Under five people: counts only |
| A role-gated link from the lesson to the private tool | Not built | After the debrief, only for someone in `business_planner_access` |

Maya's starter case is now `maya-2`: two new story facts (the caseload's classification mix, 5/9/10/7/4 in classifications 2 to 6, and the agreement giving her business the monthly contact) and a line on the hospital discharge and two complex families. Every figure the model uses is unchanged, so the reviewed fixture holds. Nobody new is named.

### Older cases and attempts

- A block saved before lab 2 has no classification mix, contact duty, uncertainty band, theme or review decision: each reads as absent (the window still works, with ±1 month). The published "Maya's next coordinator" (`maya-1`) is unchanged and now shows the window.
- An attempt stored before lab 2 has no `views`: it reads as none. Its stored result and versions are never rewritten. An attempt started under an earlier model says its figures are worked out again with the current one (`earlierModel`). Both are tested.
- The model gained `variableCost`, `fixedCost`, `ownerPay`, `contribution` and `operatingBeforeOwner` on each month. Additions only: other costs, operating result and cash are what they were, so `MODEL_VERSION` stays `hiring-model-2`. `LAB_VERSION` is `hiring-lab-2`; the rubric is unchanged (`hiring-rubric-1`), so scores are comparable.
- Publishing also needs the window's reviewed fixture to pass (`windowFixturesPass`, beside `modelFixturesPass`). The classification check is structural (`caseProblems`), so no sign-off can waive it.

## What it is

A learner works through a **fictional** Care Partner business story. Maya has 35 participants and one coordinator, Sam. The learner reads the evidence, compares options across capacity, operating result and cash, commits a plan, and then gets new information. They revise the plan and read a debrief. The block teaches how to justify a hiring decision, not how to find one "right" hire. Completion never depends on choosing the highest margin.

It isn't the private business-planning Work Tool. It never asks for, or stores, a learner's real salary, rates, cash or participants.

## What was in the repository, and what wasn't

**Implemented, and reused here:**
- the Magazine block model and parser (`lib/magazine.ts`);
- the block capability registry used by the Learning Designer (`lib/blockRegistry.ts`);
- the readers' copy, which keeps answers out of the browser (`server/magazine.ts`);
- the "Publish anyway can't waive this" publish gate;
- the activity log (`magazine_events`);
- the character library (`lib/characters.ts`);
- the editor palette, with Preview.

Budget Sandbox (`docs/budget-sandbox.md`) is the closest relative, and this block follows its pattern throughout.

**Not in the repository:**
- **A role-gated link from the debrief to the Work Tool.** The private Caseload-to-Margin Work Tool and its business-owner access now exist (`docs/caseload-margin-calculator.md`), but the debrief doesn't link to it yet.
- **An AI case-suggestion flow for this block.** The block needs no AI at all.
- **An Admin improvement dashboard or an Excel decision-register export for it.** Authors' totals are available from the API (below).

## The calculation core

`lib/hiringModel.ts` is a pure, versioned module (`hiring-model-1`). It has no UI, AI or I/O, so the future Work Tool can use it unchanged. Everything is monthly, AUD, pre-GST and pre-tax, kept at full precision and rounded only for display.

- **Required hours:** active participants × blended recurring hours × growth complexity × (1 − any workflow saving), plus onboarding for each new participant in the month they start, plus monthly reviews and escalations.
- **Available hours:** paid weekly hours × 52 ÷ 12 × availability × productive share, × (current FTE + a hire's FTE × its ramp). Add temporary help, and take away any leave.
- **Capacity pressure:** required hours above available hours × the case's planning threshold. With no available hours and work to do, it shows "No available capacity", never a percentage.
- **A hire:** is paid in full from the month they join (start + recruitment lead), while their capacity ramps over the ramp months. A one-off cost is paid once, in the start month.
- **Income:** active participants × the case's agreement income (a flat amount, the prototype's fixture basis). Public care-management funding is never substituted for it.
- **Cash:** income is received after the payment lag. Opening receivables arrive in each month before the first forecast month's income. A payment delay moves receipts later without losing them.

Simplifications kept from the prototype:
- forecast participants keep today's band mix (one blended hours figure);
- starts and exits happen once a month.

### Maya's fixture

The PRD gives the expected-case results but not every input behind them, and the prototype is private. So the missing inputs were chosen as plausible fictional values, then **calibrated** to reproduce the stated results exactly:

| Input | Value |
|---|---|
| Caseload | 20 standard (1.5 h), 10 higher (2.5 h), 5 intensive (4 h) |
| Intake | 3 new and 1 exit a month |
| Onboarding and reviews | 3 h each new participant; 6 h a month in reviews |
| Coordinator time | 1 FTE; 38 h a week, 90% available, 80% on participant work |
| Planning threshold | 85% |
| Income | $360 a month per active participant, paid 1 month later, with $12,600 opening receivables |
| Loaded coordinator cost | $7,550 a month per FTE |
| Other costs | $20 per participant; $1,250 overhead; $2,500 owner pay |
| Cash | $26,720 opening; $10,000 reserve |
| Hiring | 2-month lead, 2-month ramp, $4,000 one-off |

The expected case then gives:
- current team first over the threshold in **Month 3**;
- 0.6 FTE: no months over, lowest cash **$18,160** (Month 6);
- 1.0 FTE: no months over, lowest cash **−$1,670** (Month 11);
- no hire: highest operating result, never below the reserve, but 10 months over the threshold.

`modelFixturesPass()` checks these figures and the no-capacity state. If it fails, no lab can publish. **Finance should confirm these invented values before publication.**

## The learner's screen

1. **The pressure.** Maya's question and a compact snapshot, with **Explore the options**.
2. **The evidence.** Three authored cards: the fictional agreement, Sam's workload diary, and the costs and cash sheet. Each can be reopened at any time. The agreement card says plainly that public care-management funding isn't Maya's fee.
3. **Explore.**
   - **Growth cases:** slower, expected, or faster and more complex, each with the exact difference described.
   - **What-if edits:** a few of the author's assumptions, within the author's ranges. The panel sits beside the charts on a wide screen and is a closed "Change assumptions" panel on a phone.
   - **The signal:** a sentence built from the calculated values, never an order.
   - **Workload chart:** current team against the selected option, with the threshold.
   - **Option cards:** the four options, each with months over the threshold, lowest cash and 12-month operating result. Service and reserve risks are stated in words.
   - **Money chart:** closing cash (with the reserve) or operating result. It notes that earned and received can differ.
   - **Monthly table:** all 12 months.
4. **Decide.** Combinable actions: start recruitment (which hire, and when), temporary capacity, pace intake, validate a workflow change, monitor. Then which figure they used for income, why, and what evidence would change the plan.
5. **New information.** Shown only after the commit: two weeks of Sam's leave in Month 4, and payments arriving a month later from Month 4. It shows the assumptions that changed, and the first plan before and after: months over, lowest cash, when the reserve is breached, and which months moved. Option cards can be viewed with or without the new information.
6. **Revisit and debrief.** The learner revises (or keeps) the plan and explains why. The debrief then shows:
   - six rubric dimensions in words;
   - any misconceptions;
   - their plan beside the reviewed defensible plans, with each plan's figures;
   - the next step and the follow-up chapter.

   **Try another approach** starts a fresh attempt from the story.

Every chart has a sentence and a table. Risks are in words, not colour alone. Nothing animates figures. All the controls are native buttons, checkboxes, radios and fields, so they work by keyboard.

## The rubric

Authored criteria, structured choices and calculated values decide every rating. There is **no AI score**.

| Dimension | Strong when |
|---|---|
| Workload | The workload diary was opened, a capacity action was taken where the no-hire path breaches the threshold, and the reasoning uses workload words |
| Contractual income | They used the agreement's figure and opened the agreement |
| Economics | They name cash, receipts or the reserve, and the plan's cash doesn't go negative |
| Timing | A hire starts in the planning window (or with interim cover), or a no-hire plan keeps under the threshold |
| Protection | They monitor or protect capacity, and name guardrails |
| Revision | The revision engages with the new information, and they name what would change the plan |

**Misconceptions detected:**
- `public-funding-as-fee`: chose the 10% care-management allocation as the income;
- `ignores-negative-cash`: the plan's cash goes negative and they don't mention it;
- `profit-over-capacity`: no capacity action while the plan is over the threshold.

Feedback text can quote calculated values, such as `{plan.lowestCash}` and `{none.firstPressure}`, so every figure traces to the model.

Different plans pass. The tests show two reviewed plans both scoring strongly: "recruit 0.6 FTE now" and "pace intake with temporary help and a workflow change". They differ by over $20,000 in operating result.

## Authoring and publishing

The editor covers:
- identity, story and version;
- evidence cards, with the figures each states;
- every case input;
- learner-editable ranges;
- options, growth cases and the learner's actions;
- the new information (its story and its changes);
- the rubric wording and words to look for;
- the reviewed plans;
- governance.

A **Check the case** panel reconciles every evidence figure with the model. It shows each option under each growth case, and each reviewed plan before and after the new information. Preview runs the whole learner flow locally.

Publishing is blocked, and "Publish anyway" doesn't cover it, by:
- a missing or invalid input, named field by field;
- an evidence figure that doesn't match the model;
- no available capacity;
- no "keep current team" or hiring option;
- no "expected" growth case;
- missing new information, rubric words or reviewed plan;
- the fixtures failing;
- missing sign-off: content owner, Finance, Operations/Quality, Partnerships and privacy, with the date;
- a review date that has passed.

## Records, telemetry and privacy

- **Attempts** (`hiring_lab_attempts`) are pinned to the course revision, a hash of the case, and the story, model and rubric versions. Publishing a changed case starts new attempts; old ones keep their versions. An assessed lab records each person's first finished attempt; retries are practice.
- **The order is enforced on the server.** The new information is sent only after a committed first decision. The rubric, reviewed plans and debrief are sent only after the revision. None of them is in the learner's copy of the course.
- **Activity events** use an attempt id and versions:
  - `hiring_lab_started`, `evidence_opened`, `option_compared`, `growth_case_changed`;
  - `initial_decision_submitted`, `event_revealed`, `revised_decision_submitted`;
  - `rubric_feedback_viewed` (once per attempt), `retry_started`, `hiring_lab_completed`.

  They carry fictional choices (actions, hire, month, income choice), rubric levels and misconception codes, **never typed explanations or real figures**. What-if edits are held to the author's ranges, and anything else sent is dropped.
- **Authors' totals:** `GET /api/magazine/<id>/hiring?stats=1` gives attempts, people, decided, finished and the counted denominator, with the rubric levels and misconceptions. Under 5 people, the breakdown is suppressed.

## Checked live

On a throwaway "ZZ Test" course, since deleted:
- added the block from the palette;
- the check panel reproduced the reference figures;
- published after sign-off;
- read the story;
- explored the options (the cards matched the fixture);
- an empty commit was refused, naming each missing piece;
- committed a plan;
- the new information appeared, with before and after;
- a reload resumed at the same stage;
- revised, and read the debrief;
- Try another approach started Attempt 2 with the new information hidden again.

At phone width nothing overflowed, and the option cards stacked. That found and fixed:
- the four option cards crammed into one row;
- a variable named `window` that crashed the lab;
- the feedback-read event logged on every reload.

## Decisions still needed for live publication

- **Finance:** the fixture's invented values and the calculation definitions (earned versus received, loaded cost, opening receivables, pre-GST basis).
- **Operations/Quality:** the workload bands and hours, the 85% threshold as an educational assumption, and the guardrail wording in the feedback.
- **Partnerships:** the "Care Partner business owner" label and role (not the Support at Home "care partner"), the fictional agreement wording, and who may see the future Work Tool link.
- **Privacy/security:** confirm the events and the authors' totals carry nothing private; retention for attempts.
- **Product:** a partner-business-owner role and the Work Tool, before the post-debrief link can exist; whether an Admin improvement view and Excel decision register are wanted for this block. (Lab 2 built both, and the link, on the existing `business_planner_access` grant.)

Added by lab 2 (the window), before partners rely on real figures:

- **Finance:** contribution margin (recruitment in staff cost; temporary help as a variable cost), "before owner remuneration", the break-even definition, costing a hire from the base case's start-by, and the cash and tax basis.
- **Operations/Quality:** the ±1 month recruitment uncertainty, the seven sensitivity steps and their sizes, the suggestion kinds and their wording, and whether the monthly direct contact is the partner's duty under each agreement variant.
- **Partnerships:** which agreement variants assign the monthly contact, the "Plan capacity" label, the "Hiring Runway Simulator" picker name (the block is still labelled "Hiring Runway Decision Lab"), and who counts as an eligible owner (today one seeded grant).
- **Privacy/security:** the fixed-list event details, retention of saved versions and their windows, and whether audited Trilogy support access is wanted.
- **Partner pilot:** whether the window, sensitivity steps and alternatives match how owners decide.

## Not yet

- AI explanations of the window ("why did it move?"): none built; everything works without AI.
- Forecast-versus-actual on the partner dashboard, and sharing a scenario with a relationship manager.
- `source_issue_reported`: there's no source register for the tool's assumptions yet.
- A per-band classification forecast in the lab (classifications are context only, as the PRD says).
- AI suggestions for case narratives, events or explanations. The block works without them, as required.
- Band-by-band forecasting in this block. The model supports it since `hiring-model-2` (the Work Tool uses it), but the block keeps the prototype's blended figure.
- The follow-up chapter (Maya four weeks on), as a linked block.
