# Caseload-to-Margin & Hiring Capacity Calculator

A Work Tool for an independent Care Partner business: **when to plan recruitment, which capacity option is feasible, and what could happen to service, operating result and cash** as the business grows. It answers with a _planning window under stated assumptions_, never a clients-per-coordinator ratio or a hiring order.

Built from `Partner_Hub_Caseload_to_Margin_Calculator_Implementation_PRD_for_Claude.md` (21 November 2026). Page: `/tools/caseload-margin`.

## Two ways in

|                                 | Who                                                          | What happens                                                                                                                                                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Explore a fictional example** | Anyone signed in                                             | The reference prototype's invented business (35 participants, one coordinator, $360 a participant). Every assumption can be changed. Never saved. The workbook can be downloaded.                                                                                                           |
| **Plan my business**            | The business **owner**, and **members the owner authorises** | Starts blank: caseload, income, costs and cash are empty. Only structural starting estimates (38 paid hours, 90% available, 80% on participant work, 85% threshold, 1-month payment lag, 2-month lead and ramp) are filled in, each marked _Estimated_. Saved only when the person chooses. |

"Care Partner business owner" means an independent operator who employs or engages coordinators, not the Support at Home _care partner_ role.

## Where things live

| Part                                                                                | File                                                                                                       |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| The shared model (also the Hiring Runway Decision Lab's)                            | `src/lib/hiringModel.ts` (`hiring-model-2`)                                                                |
| Fields, plans, provenance, analysis, decision card, "what changed", workbook sheets | `src/lib/caseloadPlanner.ts` (`caseload-planner-1`)                                                        |
| Business access, saved plans and versions, compare, export, events, Favourites      | `src/server/caseloadPlanner.ts`                                                                            |
| Tables                                                                              | `CASELOAD_SCHEMA` in `src/server/db.ts`                                                                    |
| APIs                                                                                | `src/app/api/tools/caseload/` (`route.ts`, `plans/[id]`, `export`)                                         |
| Page                                                                                | `src/app/tools/caseload-margin/page.tsx`, `src/components/tools/CaseloadPlanner.tsx`, `CaseloadCharts.tsx` |
| Work Tools card                                                                     | `src/components/playbooks/WorkTools.tsx`                                                                   |
| Tests                                                                               | `src/lib/caseloadPlanner.test.ts`, `src/server/caseloadPlanner.test.ts`, `src/lib/hiringModel.test.ts`     |

## The model

All monthly, AUD, before GST and tax. Full precision inside; rounded only for display and the workbook.

- **Participants:** last month + new − exits, never below zero. Starts and exits happen once a month; onboarding work falls in the month a participant starts.
- **Required hours:** recurring hours by work band × case complexity × (1 − workflow saving, once it starts) + new participants × onboarding hours + review and escalation hours.
  - Bands are _observed coordination workload_, not clinical labels.
  - If the new participants' mix is left blank, they look like today's caseload (the prototype's blended figure). If it's entered, counts and hours are kept band by band, and exits leave in proportion to the current bands.
- **Available hours:** paid hours a week × 52 ÷ 12 × available share × participant-work share × (current FTE + added FTE × ramp). Leave comes out of _availability_, training and admin out of the _participant-work share_, once each.
- **Utilisation** = required ÷ available. With no available hours and work to do it's **No available capacity**, never a percentage. **Pressure** is required hours above available × the planning threshold (the business's own choice, not a staffing standard).
- **Income:** the agreement's basis, either per active participant a month or a fixed monthly amount. **Blank income is "Revenue unknown"**: capacity still forecasts, while operating result, cash and affordability are hidden and the decision card says so. Public care-management funding is never substituted. Income not marked _Verified_ makes financial figures **illustrative**.
- **Cash:** earned income arrives after the payment lag. Opening receivables are a **schedule** (due in Month 1, 2, 3), each counted once, so a balance can't be counted twice across the lag.
- **A hire:** full loaded cost from the month they join (recruitment start + lead), while capacity ramps. Recruitment and setup are paid once, when recruitment starts.
- **Workflow option:** a hypothetical saving on recurring hours only, from its start month, with a one-off setup the month before. Onboarding and reviews stay. Until the person ticks that it protects required tasks, contact duties and outcomes, it's labelled _Hypothetical_ and never presented as viable.
- **Growth cases:** Expected is the base exactly. Slower and Faster are editable changes to intake, exits and recurring work, shown in words. Switching case or option never changes the base inputs.
- **Planning window:** the prototype's heuristic (first no-hire pressure month − lead − ramp + 1), plus a **simulated check**: the latest recruitment start month that does no worse on months above the threshold than starting in Month 1. When pressure arrives before any hire could join, the card names the interim choices: temporary help, pacing intake, repairing a process, or talking with Trilogy Care.

The reviewed fixture still holds: the no-hire path passes 85% in Month 3; adding 0.6 FTE keeps it under the threshold with lowest cash $18,160; adding 1.0 FTE keeps it under the threshold with lowest cash −$1,670. Those are invented figures, not benchmarks.

Version 2 of the model only _adds_ the optional mix, receivables schedule and fixed income. With them left out, every result is version 1's, so the Hiring Runway lab is unchanged.

## The page

- **Assumptions:** four tabs (Caseload, Work and team, Money, Hiring). Arrow keys move between tabs. Each field shows its unit, and each business figure can be marked **Entered, Estimated or Verified** with a source and an effective date. Tabs show how many fields still need doing.
  - A blank field is never read as zero. If a capacity field is blank or invalid, the field is named and the last result that could be calculated stays on screen.
  - Support at Home classifications 1 to 8 can be recorded but never set hours or income.
- **Results:**
  - four headline figures: participants now, the first no-hire pressure month, the Month 12 operating result and the lowest cash;
  - the **decision card**, which says why, with warnings in text and an icon, beside it rather than under a chart;
  - **What changed** after each edit;
  - intake cases;
  - option cards (months above, lowest cash, 12-month result);
  - the capacity chart, the margin and cash chart, and the monthly audit table. Each chart has a **table view** of the same numbers.
- **Charts:** one y-axis, current team in dashed orange (`#c0562c` / dark `#d4703d`) and the selected option in solid teal (`#00918a` / dark `#2aa8a6`). Colours were checked for colour-vision differences in light and dark. Every line is labelled, months below reserve are marked, and there's a hover and focus tooltip for each month.
- **Phone:** the groups stack, with **Change assumptions** and **Compare options** pinned under the header.

## Privacy and access

- `business_planner_access` holds one owner per business (the demo seeds **Casey Taylor → Taylor Cleaning**) and the members the owner authorises, only from the same organisation. A member can't hand out access; the owner can't remove themselves.
- Every plan, version, comparison, export, grant and plan-mode event is checked **on the server**. Anyone outside the business gets "That plan isn't here" for a plan, whether it exists or not, so a guessed address reveals nothing.
- General coordinators, other partner businesses and Trilogy staff (authors included) have **no access** to a business's plans. Authors see the Work Tools card and the fictional example so they can review the tool.
- Plans hold aggregate counts and figures only: no participant names, care plans, diagnoses, payroll files or bank details. The version note says not to include them.
- **Saving:** a save is a new numbered version; nothing is overwritten. **Duplicate** copies a version into a new plan. **Compare** lists the inputs that differ and both versions' saved headline results. Each version stores its inputs, provenance, model and calculator versions, and its headline results. A version saved under an earlier model says its figures are recalculated.
- **No delete yet.** Plans and versions stay until a retention rule is decided (see below).

## Workbook

`Download Excel workbook` makes a private `.xlsx` on request, from the saved version or from the plan on screen. It has five sheets: **Summary**, **Inputs and provenance**, **Monthly forecast**, **Option comparison**, and **Assumptions and model version**.

- The monthly sheet is built by the same function as the page's audit table (`monthlyRows`), so they reconcile by construction. A test checks every number on the page is in the sheet.
- Figures are number cells, rounded to cents. Text is never a formula.
- Income-based cells say "Revenue unknown" rather than a number when the income is blank.

## Events and reporting

`planner_events` records:

- `business_simulator_opened`
- `scenario_compared`
- `quality_guardrail_seen`
- `cash_warning_seen`
- `scenario_saved`
- `scenario_exported`

Each event has the mode (learn or plan), the person's access role (owner, member, author or learner) and the model version, and **never an input or a result**. `GET /api/tools/caseload?report=1` (authors only) gives counts: eligible businesses, businesses planning, saved plans, and events by type and mode. Any count from 1 to 4 is shown as "fewer than 5", so a small number of businesses can’t be picked out. It never lists a business, a person, income, salary, margin or cash.

## Favourites

The tool can be pinned to Favourites from its first screen by anyone the card is shown to. Favourites gained a `tool` kind. On an older database, `ensureCaseload` rebuilds the `favourites` table once to allow it, keeping every row.

## Planner 2: the decision window and Plan capacity (24 November 2026)

From the Care Partner Caseload, Margin and Hiring Runway Simulator PRD; the details are in `docs/hiring-runway-lab.md` ("Lab 2").

- **Decision window** (`lib/hiringWindow.ts`), on the page after the decision card: the suggestion and why, the likely pressure window across the three cases, the recruitment start window, cash runway with each hire, capacity, contribution margin, before-owner result, operating result, break-even month and lowest cash side by side, the alternatives, the assumptions and unknowns, and a one-at-a-time sensitivity table. It's timed by 0.6 FTE (or 1.0 FTE when that's selected) and doesn't move when you switch case.
- **What changed** now includes the suggestion, the recruitment start window and the months whose capacity verdict moved.
- **Contact guardrail:** "My agreement with Trilogy Care gives my business the monthly direct care-management contact" (Work and team). Off by default; plans saved before planner 2 read as off.
- **Workbook:** the Summary has the window and its factors; the monthly sheet adds contribution margin and the result before owner remuneration (at the end, so earlier columns keep their places); the option sheet adds those totals and the break-even month; the assumptions sheet defines them.
- **Saving is idempotent:** each save carries a key, and a retried save returns the version the first one made. Each version also keeps its decision window (months and a kind, no dollars).
- **Recalculate as a comparison:** a version saved under an earlier model or planner shows "as saved → recalculated now" beside it. Nothing is overwritten.
- **Events:** `scenario_mode_selected`, `assumption_changed` (the field key only), `scenario_compared` (case, option, versions or sensitivity) and `source_opened` join the earlier six. Each has a fixed-list `detail` (anything else is dropped) and an idempotency key. The authors' report adds people who opened the tool and how many used a low/high case or the sensitivity table, small numbers suppressed.
- **Older databases:** `ensurePlanner` adds `business_plan_versions.idem`, `planner_events.detail` and `planner_events.idem` in place, keeping every row.
- **Plan capacity:** a card in the Care Partner business area (`/business-notes`) for someone who may plan the business, with the latest saved plan's name, date and window, never a figure. Everyone else sees nothing.
- **Work Tools search** also finds the tool by "when should I hire", "staffing", "runway" and "plan".
- **Admin:** `/admin/hiring-runway` (authors).

## Decisions Trilogy Care needs to own

1. **Finance:**
   - the income bases to support (per participant, fixed monthly, others in the agreement variants);
   - eligibility, start and stop rules and payment timing;
   - what "loaded coordinator cost" includes;
   - the GST and tax treatment;
   - the workbook's definitions.
2. **Partnerships:**
   - how a business owner is identified and verified (the demo seeds one by hand);
   - whether an owner can transfer ownership;
   - the agreement variants the income basis must map.
3. **Operations and Quality:**
   - the work-band definitions and typical hours to suggest;
   - the onboarding and review estimates;
   - the minimum contact duties that are a separate quality guardrail;
   - what counts as "checked" for a workflow saving.
4. **Privacy and security:**
   - where plans are stored, and the retention and deletion rules (there's no delete yet);
   - whether audited Trilogy support access should exist, and how it's logged;
   - whether any AI explanation may see figures. None is built: the tool works entirely without AI.
5. **Publishing:** sign-off of the fictional example's figures before they're placed in learning content.

## What remains fictional or unverified

- Every figure in the fictional example: the business, the $360 income, the costs and the cash.
- The starting estimates in a new plan (38 hours, 90%, 80%, 85%, lags, lead and ramp). They're labelled _Estimated_, to be replaced.
- The demo owner grant (Casey, Taylor Cleaning).
- The model itself is unreviewed by Finance, Partnerships or Quality. A pilot with Care Partner owners should come before any live financial release.

This tool executes nothing: no payroll, recruitment, participant assignment or contract change.
