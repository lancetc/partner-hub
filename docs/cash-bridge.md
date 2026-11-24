# 90-Day Cash Bridge: "Can we fund the next 90 days?"

A reusable Magazine block (type `cashbridge`, labelled **90-Day Cash Bridge**) and a demo article. A Care Partner business owner follows Maya's next 90 days date by date: when fees are earned, advised and actually received; when pay runs, super, setup bills, owner pay and tax leave; where the bank balance is lowest; how much opening cash keeps the reserve; and what a late receipt, a moved start or a moved hire does. They choose a funded, service-safe action and replace estimates with actuals at Day 30.

It's a planning and learning tool, not a credit, hiring, pricing, claims or accounting decision. A forecast shortfall is a prompt for a human funding and operational decision, never an instruction to withhold an agreed service.

Source: _Partner Hub PRD: Can we fund the next 90 days?_ (22 November 2026).

## Where things live

| Part                                                                                          | File                                                                                                                                       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| The dated ledger (pure, deterministic, `cash-bridge-1`), comparison, "what changed", workbook | `src/lib/cashBridge.ts`                                                                                                                    |
| The block: case shape, learner state, rubric, parse, readers' copy, publish checks            | `src/lib/cashBridgeLab.ts`                                                                                                                 |
| The reviewed fictional case (Maya's next 90 days) and the PRD's worked fixture                | `src/content/cashBridgeCases.ts`                                                                                                           |
| Attempts, events, author totals, private 90-Day Cash Plans, audit, the workbook               | `src/server/cashBridge.ts`                                                                                                                 |
| Learner API                                                                                   | `src/app/api/magazine/[id]/cashbridge/route.ts`                                                                                            |
| Plan my next 90 days API, and the workbook                                                    | `src/app/api/tools/cashbridge/route.ts`, `src/app/api/tools/cashbridge/export/route.ts`                                                    |
| Learner view                                                                                  | `src/components/magazine/CashBridgeLab.tsx`                                                                                                |
| Editor                                                                                        | `src/components/admin/MagazineCashBridgeEdit.tsx`                                                                                          |
| Tables                                                                                        | `CASH_BRIDGE_SCHEMA` in `src/server/db.ts`: `cashbridge_attempts`, `cashbridge_plans`, `cashbridge_plan_versions`, `cashbridge_plan_audit` |
| Demo article                                                                                  | `fund90` in `src/content/magazineDemos.ts` (key `fund-90`)                                                                                 |
| Tests                                                                                         | `src/lib/cashBridge.test.ts`, `src/server/cashBridge.test.ts`, `src/content/magazineDemos.test.ts`                                         |

Wired in like the sibling calculators: `blockRegistry.ts` (contract), `magazine.ts` (type, label, parse, simulation list, reading time), `characters.ts` (Maya), `server/magazine.ts` (readers' copy, activity list, publish check), the editor palette and editor, and `InteractiveBlocks.tsx`.

## What's reused, and what isn't

Imported rather than copied:

- **The Hiring Runway's fictional agreement and cash sheet** (`MAYA_INPUTS` in `src/lib/hiringRunway.ts`): the $360 fee per participant a month, the one-month payment lag, $26,720 opening cash and the $10,000 reserve. A test fails if they drift apart.
- **The Hiring Runway capacity model** (`blendedHours` and `hoursPerFte` from `src/lib/hiringModel.ts`, on `MAYA_INPUTS`) for the capacity guardrail. Moving the hire date moves its pay events and updates this guardrail; it never makes a fee.
- **The Excel writer** (`src/server/xlsx.ts`), the same one the Caseload-to-Margin tool, the capability export and the question pool export use. No new dependency.
- **Business access**: `plannerAccess` (`src/server/caseloadPlanner.ts`), the owner-and-authorised-members rule the siblings use.
- **The block shape** from the sibling calculators (Service Reliability most closely): an attempt per learner pinned to the course revision, the debrief only from the server, numbered private versions, a printable sheet using the `growth-sheet` print rule, and the AI selection rationale on the block.

Linked only, by the reader's own choice, never prefilled: _Maya's next coordinator: when to hire_ (Hiring Runway), _Can we take on the next 10 clients?_ (`intake`), _Which referrals become active clients?_ (`referral`) and the Caseload-to-Margin Work Tool.

No sibling model was changed.

### Mismatches recorded, not "fixed"

- **Monthly view vs dated ledger.** The Hiring Runway's expected case with a 0.6 FTE hire never lets month-end cash fall below about $18,160. The dated ledger finds $5,814 on Thursday 28 January. They answer different questions: the monthly model pays staff once a month, starts clients once a month (all forecast starts earn from the month they start, secured or not), and lands opening receivables "in Month 1" without a date. The article uses that difference as its lesson, and the story says so.
- **Income timing.** The Hiring Runway's agreement says fees are paid "at the end of the following month". This article's excerpt makes that precise for a dated ledger: paid on the **last weekday** of the following month, earned for participants whose first service has been delivered and who haven't left by the month's last day. Finance and the agreement owner should confirm both before publication.
- **Who earns.** The Hiring Runway forecasts three new participants earning every month. Here only starts with a signed agreement (planned) or a commencement earn; enquiries and allocations don't. The capacity guardrail, by contrast, plans for every dated start, secured or not.
- **Payroll split.** The Hiring Runway's loaded $7,550 a month per FTE is split here into dated parts invented for the case: $3,000 gross pay a fortnight (tax withheld set aside on payday), $360 super seven days after payday, and $270 a month of other on-costs on the 15th. They add back to $7,550 exactly (a test checks). The $4,000 one-off hiring cost is split into four dated purchases.
- **Hire timing.** The Hiring Runway's hire joins in relative Month 3; this story places the 0.6 FTE hire on Monday 4 January. Ramp is two months, as in `MAYA_OPTIONS`.
- **The coordinator.** The Hiring Runway names Maya's coordinator "Sam" (a library clash with a Trilogy Care team member). Here she's "the current coordinator", unnamed.
- **The worked fixture.** The PRD's fixture ($10,000 opening, $4,000 reserve, 1, 8 and 15 December) isn't Maya's case. It's carried as the block's separate worked example, shown in the low-point beat, and the case check refuses a case whose example stops teaching the rule.

## The model (`cash-bridge-1`, definitions `cash-definitions-1`)

```text
dates            = 90 consecutive Australia/Brisbane dates including start_date
opening          = bank cash at the start of start_date
net[d]           = receipts settling on d − outflows due or paid on d
cumulative[d]    = Σ net from start_date to d
closing[d]       = opening + cumulative[d]
low              = min(opening, every closing[d]), on the earliest date it happens
required         = reserve + max(0, −min(0, every cumulative[d]))
additional       = max(0, required − opening)            (before any separately modelled financing)
intraday[d]      = closing[d−1] − outflows[d]             (conservative check, labelled separately)
```

- Dates are `YYYY-MM-DD` strings, with arithmetic on UTC midnights; `brisbaneDate` gives today's date in Brisbane. Money is whole cents inside; a part fortnight is pro-rated to the cent ($1,800 × 11 ÷ 14 = $1,414.29).
- 13 display buckets of seven dates (the last six). Every bucket keeps its own lowest date, but the low point always comes from the dated ledger. `chartLow` and `tableDays` read the same days, so the chart marker and the dated table agree.
- **Receipts** move cash only on their settlement date. Earned fees are a separate learning line (`earned`). A partner fee is generated only from an agreement for participants who meet its earning condition. There's no field for public Support at Home funding or the care-management allocation.
- **Never twice:** an existing receivable for a month the agreement also pays is an error; a loaded payroll cost beside its components is an error; financing enters only when selected and complete (draw, fees or interest, repayment), shown apart, with the amount still owed; a credit limit is never cash.
- **Scenarios** move only what's marked uncertain: a receipt's settlement (`delays`), an unstarted client (`slips`), an uncommitted hire (`hireStarts`), a discretionary purchase (`stage`; staging one that supports agreed service is a **conflict**), added cover (`extra`, `extraHours`), financing, and Day 30 `actuals` (only by a deliberate update). Anything else is refused and named.
- **Blank, unknown and zero:** blank is an error (the page keeps the last valid result, labelled); "unknown" is kept out and named; zero is zero. Unknown opening cash still gives the required opening cash, but not the gap.
- **Limitations:** unknown fee terms, unknown opening cash, an unanswered or omitted statutory item, or an unknown amount or date make the result "insufficient information for a reliable cash requirement", with the partial arithmetic beside it.
- **Result cards** (PRD section 7): cash low point (with actual/projected basis and the intraday check), cash needed, why it happens (largest kinds of payment to the low date, receipts not yet cleared), payroll and obligations, the comparison, and confidence (actual versus projected receipts, the most sensitive payment dates tested 14 days later).

### Fixtures (unit tests with exact figures)

`src/lib/cashBridge.test.ts`:

- the PRD fixture: **$2,000 low on 8 December, $12,000 required, $2,000 gap**; with the $6,000 receipt on 8 December, **$5,000 low, $9,000 required, $0 gap**, and the conservative intraday check ($1,000 on 8 December) separately labelled;
- a **midweek payroll low** (Thursday 3 December) while the end-of-week balance stays above the reserve, with chart and table on the same date;
- the opening instant counting; 90 dates and 13 buckets (the last six); Brisbane's date at a UTC evening;
- fees only on settlement and never from an enquiry or an allocation; no agreement means no fee and an unreliable result;
- double counting refused; blank, unknown and zero apart; credit limits never cash; financing only when costed;
- a pro-rated first pay to the cent; a moved hire moving pay but no fee; delays and staging only where allowed.

`src/server/cashBridge.test.ts` covers Maya's case (below), the publish gate, the readers' copy, the order, the rubric and flags, telemetry, the workbook and private-plan access.

## The fictional case

Maya keeps her established facts: a small Care Partner business in Toowoomba; 35 clients; three start each month and about one leaves; $26,720 in the bank and $10,000 kept in reserve; ready to hire a second coordinator (0.6 FTE, from 4 January). Clients are "Start 1" to "Start 9"; coordinators are roles. Tuesday 1 December 2026 to Sunday 28 February 2027.

| What           | Figures                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Receipts       | November's fees $12,600 on 31 December; December's $13,320 (37 participants) on 29 January; January's $13,320 on 26 February                                            |
| Starts         | Three dated starts a month: five with agreements, one waiting for an allocation, three enquiries (no receipts)                                                          |
| Low point      | **$5,814 on Thursday 28 January** (two pay runs and owner pay, the day before December's fees clear). That week ends at $19,134, above the reserve                      |
| Needed         | **$30,906** at the start to keep $10,000; **$4,186** more than Maya has                                                                                                 |
| Intraday check | $8,640 on 31 December and $1,320 on 26 February, if same-day payments cleared first (labelled separately)                                                               |
| Late receipt   | December's fees 14 days late: below zero (−$812) on Thursday 11 February                                                                                                |
| Options        | Desk in March ($3,486 gap); hire from 1 February ($640 gap, capacity fine); hire from 1 March (February over 85%); with interim cover (fine); costed overdraft ($0 gap) |
| Day 30         | November's remittance confirmed for 8 January; Start 1 commenced on time: 10 dates below the reserve                                                                    |

Every date, amount, payroll setting and tax figure is fictional. Finance should confirm them before publication.

## The learner's path

1. **Growth looks healthy.** Maya, Ava's optional line ("A full calendar does not tell you when the money clears. Check the next pay date."), the monthly view, the agreement excerpt. A first guess: can she cover the pay runs, and which is hardest? Locked once made, never marked.
2. **The timing reveal.** Eight pieces of evidence to place: stage (referral, allocation, start, earned, advice, received, paid, not the partner's money) and whether the bank balance moves. They're shown on a timeline.
3. **A start moves.** Start 2's family asks for four weeks later; Start 4 has no allocation. The earned line shows each month's fee and payment date; the slip can be switched on. Then how to treat it.
4. **The cash low point.** The worked example (the PRD fixture, with its settle-earlier toggle), then the bridge without its low marker. Open weeks and dates; read the low date and say what opening cash is needed. Locked, then the marker and result cards appear.
5. **Choices with consequences.** Sensitivity cases (late receipt: required; late start) and actions (stage the desk; delay the laptop, a conflict; hire in February or March; interim cover; a costed overdraft), one per kind. Result cards, the bridge, the capacity guardrail and the comparison table. A decision and an explanation.
6. **Day 30 check-in.** Ava returns (optional). The actuals are applied only when the learner chooses. Then what Maya does with them.
7. **Funding Decision Sheet** (the debrief): what happened next, the rubric and flags, the evidence card by card, readings beside the ledger, the learning 90-Day Funding Decision Sheet (printable), links, and the fictional workbook.

The server enforces the order: the evidence after the first guess, the choices after the low-point reading, the debrief only once every card is placed, the moved start answered, a week or date opened, the late-receipt case and at least two cases or options tested, a decision and explanation chosen, the actuals applied and the Day 30 question answered.

**Rubric** (`cash-bridge-rubric-1`), each 0 to 3: timing, arithmetic interpretation, source quality, scenario comparison, service continuity, review plan. It never scores the cheapest option.

**Flags:** **critical**, above any score: closing the gap by withholding or delaying agreed essential service. Then: counting a fee when invoiced and again when received; the pooled 10% as partner income; payroll at month-end; the low point from the weekly chart; ignoring a known payment because the margin is positive; moving the hire without opening the capacity check; a prospect awaiting allocation as cash; a fee before its earning condition; a credit limit as free or approved; the forecast as a guarantee.

"Look again" starts a fresh attempt. Every attempt is kept.

## Plan my next 90 days

- **Who sees it.** Only the business owner and members they've authorised, through `plannerAccess`. The article is complete without it.
- **Starting.** Blank: no opening cash, reserve, fee, caseload, starts, coordinators or events, and every statutory item unanswered. Never the story's figures, never another business's.
- **What it asks for.** Opening cash and its source, reserve, credit limit (shown, never cash); the agreement's fee, lag, pay day, observed clearing days and source; participants earning now and exit dates; planned starts by certainty and date; coordinators (existing or proposed, committed or not, FTE, start, a pay date, frequency, gross/super/on-costs or one loaded figure); other dated receipts and payments with status, source, "date could move", "not committed" and "supports agreed service"; statutory items supplied, left out or not applicable. No bank connection, no uploads, no names.
- **Saving.** Unsaved entries stay in the page only. Save makes a new numbered version; nothing is overwritten; blanks stay blanks. The server replaces start and coordinator labels with generic ones and drops anything the model doesn't know.
- **The 90-Day Funding Decision Sheet** holds the chosen option and its broad kind, cash required, known versus estimated receipts and the next critical pay date (from the result), unresolved facts, the service constraint, the accountable owner (a role) and the follow-up date. It prints alone.
- **Coming back.** "What changed since last time?" compares the version before: start dates, coordinators, the next pay date, receipts, outflows, the low date, the gap and days below the reserve. Forecasts become actuals only when the owner saves them.
- **The workbook** (`.xlsx`, through `src/server/xlsx.ts`): Assumptions, Dated receipts, Dated outflows, Daily balance, Weekly view, Scenario comparison, and Definitions and data sources. Calculated values (not formulas), each rule written out; creation date, timezone, omitted categories and a conspicuous **FICTIONAL EXAMPLE** or **PRIVATE BUSINESS PLAN** label. A test checks its low date, balances and required opening cash against the page. A private plan's comparison is the baseline, its largest expected receipt 14 days later and its first planned start four weeks later.
- **Access checks and audit.** Every read, save and export checks the person and that the plan belongs to their business; anyone else gets 403 or 404, whatever id they try (tests cover a member without access, the author/superadmin and another business's owner). Reads, saves and exports are recorded in `cashbridge_plan_audit` (who, what, which version, when: never figures).

## Telemetry

To `magazine_events`: `cashbridge_started`, `prediction_submitted`, `card_placed` (stage and matches), `start_answered`, `week_opened`, `date_opened`, `view_opened`, `example_tried`, `low_answered` (matched, and whether a figure was given and close: never the figure), `sensitivity_tested`, `option_tried`, `actuals_applied`, `review_answered`, `decision_submitted`, `cashbridge_completed`, `retry_started`, `sheet_printed`, `workbook_exported`, and `plan_saved`/`plan_updated` (version number and broad scenario kind only).

They carry ids, fictional choices, matches, flags, rubric levels and versions: no typed words, no amounts, nothing from a private plan. Authors get totals from `GET /api/magazine/[id]/cashbridge?stats=1`: each person's first finished attempt; under 5 people only counts.

## Publishing

`cashBridgeHardProblems` blocks publishing (and "Publish anyway") until the case check passes (figures validate and are all fictional; statutory items answered; an unsecured start; a capacity model; a delayed-receipt and a slipped-start case, two actions and a moved hire; Day 30 actuals; a worked example that still teaches the rule; earned, invoiced and received evidence with feedback; a strong unflagged answer to each question; outcomes on decisions; a baseline that dips below the reserve **midweek**, with a reading that names the ledger's low date; a reliable forecast; every option calculating), the sign-off is recorded (owner, Finance and the partner commercial agreement owner, Care Coordination Operations, Quality, Partnerships, privacy, partner business representatives, approval date; effective and review dates beside them) and the review date hasn't passed.

The demo article ships with the sign-off empty. The editor records the AI selection rationale (problem evidence → target behaviour → why this block → alternatives or process fixes → content to reuse → owner → linked outcomes), which the author accepts, edits or rejects.

## Not yet

- **Favourites, the dashboard and Job Aids.** Pinning a private plan, or saving the Decision Sheet as a private Job Aid, needs a new `favourites` kind and a table rebuild, as for the sibling calculators. The sheet prints instead.
- **AI.** No AI explanation of a computed bridge, no AI-drafted feedback, and no AI Learning Designer recommendation record; the rationale lives on the block. Fixed text everywhere.
- **Integrations.** No finance or payroll import; private mode is manual entry. An approved read-only, business-scoped source would need its own contract and review.
- **Capacity in private mode.** Not checked here: the page points to the Caseload-to-Margin Work Tool. Moving a private hire's date doesn't pass it to that tool or to Next 10 Clients.
- **Private scenarios.** Private plans compare three standard cases; the owner moves dates by editing. Actions as toggles (stage, move a hire, cover, finance) are in the story only. There's no separate "estimated worst-receipt" case beyond the 14-day test and the sensitive-dates list.
- **Workbook formulas.** The workbook carries documented values, not live formulas (the shared writer writes values only).
- **Calendar.** "Last weekday" ignores Queensland public holidays. Ledger events on a date have no settlement order beyond "receipts first", with the intraday check beside it.
- **Admin dashboard and evaluation.** No aggregate admin dashboard beyond the authors' totals, and no consented comparison of predicted and actual low points.
- **Links back.** Nothing in the Hiring Runway, Next 10 Clients or Referral articles links here yet.
- **Review.** The earning condition, payment day, payroll split, super timing, BAS figures and overdraft terms are illustrative. Finance, the agreement owner, Operations and Quality should check them.
