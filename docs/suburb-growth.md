# Local Coverage Comparison: "Is this suburb ready for growth?"

A reusable Magazine block (type `coverage`, labelled **Local Coverage Comparison**) and a demo article. A Care Partner business owner compares what clients need, by **service, capability, place and time window**, with contractor capacity that is **provider approved, suitable, recently confirmed and uncommitted**, across a few local areas. They then make two separate decisions:

- what needs an **immediate** continuity response now;
- where to **build the local supplier network** over the next six to eight weeks.

The result always names a service, a place and a time window ("Personal care, Banksia Rise, Mon–Fri 7 am–9 am: 12 h a week unfilled"), never just a coloured suburb.

It answers _where is usable supply short, and what can't wait_. It isn't an intake forecast: that's growth readiness ("Can we take on the next 10 clients?"). It doesn't approve contractors, send outreach or run onboarding: that belongs to the Contractor Network Builder Work Tool, which **isn't in the Hub yet** (see "Not yet").

Source: _Partner Hub PRD: Is this suburb ready for growth?_ (22 November 2026).

## Where things live

| Part                                                                               | File                                                                                                       |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| The model, the service taxonomy and the supply states (pure, deterministic)        | `src/lib/suburbCoverage.ts`                                                                                |
| The block: case shape, learner state, rubric, parse, readers' copy, publish checks | `src/lib/coverageLab.ts`                                                                                   |
| The reviewed fictional case (Maya's three suburbs)                                 | `src/content/coverageCases.ts`                                                                             |
| Attempts, events, author totals, private plans                                     | `src/server/suburbCoverage.ts`                                                                             |
| Learner API                                                                        | `src/app/api/magazine/[id]/coverage/route.ts`                                                              |
| Plan my local area API                                                             | `src/app/api/tools/coverage/route.ts`                                                                      |
| Learner view                                                                       | `src/components/magazine/LocalCoverageLab.tsx`                                                             |
| Editor                                                                             | `src/components/admin/MagazineCoverageEdit.tsx`                                                            |
| Tables                                                                             | `COVERAGE_SCHEMA` in `src/server/db.ts`: `coverage_attempts`, `coverage_plans`, `coverage_plan_versions`   |
| Demo article                                                                       | `suburbGrowth` in `src/content/magazineDemos.ts` (key `suburb-growth`)                                     |
| Tests                                                                              | `src/lib/suburbCoverage.test.ts`, `src/server/suburbCoverage.test.ts`, `src/content/magazineDemos.test.ts` |

## What's reused, and what isn't

The PRD asks to reuse the Contractor Network Builder's coverage arithmetic, supply states and service taxonomy. That tool doesn't exist in this repo, so they live in `src/lib/suburbCoverage.ts`, versioned as `network-taxonomy-1`. When the Network Builder is built, that file is what it should own; this block should then import from it.

Growth readiness (`src/lib/growthReadiness.ts`) has a smaller supply check: slots per week by service, capability, area and window, with five statuses (confirmed, provisional, booked, expired, unknown) and a stale window. It wasn't extended, because this block needs things that one doesn't model:

- the pipeline states;
- hours within a time window;
- visit length;
- travel between areas;
- a worker counted once at a time across areas;
- backup.

Its vocabulary lines up:

| Growth readiness | Local Coverage                |
| ---------------- | ----------------------------- |
| Confirmed spare  | Approved, confirmed and fresh |
| Provisional      | Provisional                   |
| Already booked   | Already committed             |
| Approval expired | Expired                       |

Both show "Needs confirmation", never green, when a source is stale.

## The taxonomy (`network-taxonomy-1`)

- **Services**, not interchangeable:
  - personal care;
  - domestic assistance (cleaning);
  - nursing;
  - social support;
  - home maintenance and gardening.
- **Capabilities** a visit may need, which the worker must be approved for:
  - medication prompting;
  - manual handling;
  - wound care;
  - dementia experience;
  - a language other than English.
- **Supply states**:
  - candidate, interested, evidence in progress and provider verification are _potential_ supply;
  - provider approved is the only _ready_ state;
  - paused, restricted and expired are _excluded_.
- **Availability** for each window: confirmed and uncommitted, a provisional offer, or already committed.
- **Demand tiers**:
  - confirmed planned;
  - approved, being arranged (a separate near-term band);
  - forecast (low, base and high, never merged);
  - unknown or paused (counted, never assumed zero).

## The model (`suburb-coverage-1`)

For each `service + capability + area + day/time window`, each week of the horizon (eight by default, two to twelve allowed, dated, with a time zone):

```text
committed_unfilled = max(0, confirmed_planned − confirmed_booked)
usable_spare       = provider-approved, suitable hours with current, verified, uncommitted availability
                     in the matching window, after travel, existing commitments and overlap checks
current_gap        = max(0, committed_unfilled − usable_spare)
forecast_gap[case] = max(0, committed_unfilled + forecast[case] − usable_spare)
near_term_gap      = max(0, committed_unfilled + being_arranged − usable_spare)
surplus            = max(0, usable_spare − committed_unfilled)
```

**What counts as usable spare.** A supply window counts for a need only if every check passes, in this order:

1. The same service.
2. Provider approved (not a pipeline state, not excluded).
3. Any capability the need requires.
4. Travels to the area.
5. Free on a matching day, with enough of the window for a **whole visit**. A 1-hour block can't fill a 1.5-hour visit, and spare hours after 10 am never cover a 7 am visit.
6. Confirmed: not provisional, not already committed, and not starting later than that week.
7. Verified within the owner's **freshness rule**.

The rule is a number of days, set and dated by the operational owner. There's no built-in default: a blank rule is an error.

A window holds as many visits a day as fit in it. An aggregate row (several workers) can't be checked worker by worker, so a match from it is labelled **coverage estimate, confirm in scheduling**.

**Counted once.** Each week is allocated in three passes:

1. Committed unfilled need, in the order the needs are listed.
2. The near-term band and the base forecast.
3. What's left, kept as surplus with the first need it serves.

A window already counted for a need in **another area at an overlapping time** is never counted again: one worker can't be in two suburbs at once. The row says which need it was counted for. A window two needs in the same area share is flagged as an estimate.

**Status, in words.**

- **Covered.**
- **Current gap.**
- **Needs confirmation**, when:
  - the demand source is stale;
  - a gap might be closed by supply that only needs re-verifying;
  - or an otherwise covered need has unknown or paused needs.

**Backup, apart from the gap.** Backup is the suitable windows still free after committed need, plus any approved continuity arrangement, set against a **target the accountable Operations/Quality owner sets**. A blank target says "not set"; it isn't invented. A candidate is never a safe backup. `absence(inputs, worker)` shows which current visits an absence would leave, and how much suitable backup covers.

**The two lists.**

- **Act on current service gaps**: every need with a current gap, ordered by when it's needed. There's no score, no clinical judgement, and nothing by margin or funding. Each says a recruitment brief doesn't resolve this week's need.
- **Build the local bench**: needs with a current gap, a base forecast gap or fragile backup, in a stated order (confirmed gap, then forecast gap, then recurrence). Each shows its evidence:
  - unmet units;
  - the forecast range;
  - the weeks it recurs;
  - backups against the target;
  - lead time to recruit and verify;
  - source freshness;
  - unresolved preferences.

  There's no single suburb score. In Plan my local area, the owner can reorder the list with a recorded reason.

**A participant's chosen worker** who is still being checked shows as a _choice to assess_, with its route (the provider's verification and agreement). It is never spare capacity, and never dropped. A candidate's expected onboarding is shown as an uncertain scenario, never a date, and never usable spare.

**Blank, unknown and zero are three things.** A blank number is an error to fix, and the last valid result stays, labelled as a prior result. Unknown or paused needs are counted. Zero is zero.

**What changed.** `inputChanges` and `resultChanges` cover:

- demand, bookings and forecasts;
- supply states, availability and verification;
- the resulting gaps, usable spare, newly usable rows, status and backup.

A forecast change says the current gap doesn't move. A new listing says it isn't capacity until it's approved, available and verified.

The PRD's fixtures 2 to 9 are unit tests with exact figures in `src/lib/suburbCoverage.test.ts`. Fixtures 1, 10 and 11 are in `src/server/suburbCoverage.test.ts`.

## The fictional case

Maya, from the Hiring Runway lab and the Workload Lens, keeps her established facts:

- a small Care Partner business in Toowoomba (her town on the Community Atlas);
- 35 clients; three start each month and about one leaves;
- $26,720 in the bank and $10,000 kept in reserve.

The three suburbs are **fictional**, set around Toowoomba, and labelled so. Contractors are anonymous ("Worker A"), and no client is named. Her coordinator isn't named: the library's "Sam" is a Trilogy Care team member.

| Area          | Need                                                    | Figures                                                                                                                                                                                                                          | Result                                               |
| ------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Banksia Rise  | Personal care, Mon–Fri 7–9 am, 1.5-hour visits          | 18 h planned, 6 booked. Workers A and B approved but free only after 10 am; Candidate C still sending evidence; Worker P chosen by a participant, in provider verification; Worker J paused; Contractor I a cleaner. Six listed. | **12 h current gap**, no backup                      |
| Corella Park  | Cleaning, Mon–Fri 1–4 pm, 2-hour visits                 | 12 h planned, 8 booked (Worker E); Worker D approved with 6 h verified spare; Worker K approved but last verified in September                                                                                                   | **No gap, 2 h surplus**; E's absence would leave 6 h |
| Quandong Hill | Wound-care nursing, Sat–Sun 8–10 am, from this Saturday | 4 h planned, 2 booked (Nurse G); Nurse H has a 2-hour provisional offer                                                                                                                                                          | **2 h current gap**, immediate                       |

The story update, three weeks later:

- Candidate C is approved, with 6 early-morning hours, so Banksia Rise's gap falls to 6 h, not zero.
- Worker M is approved but free only from 11 am.
- Candidate N is interested and hasn't started checks.
- Worker P is still in verification.

## The learner's path

1. **The apparent opportunity.**
   - Ava's optional transmission, then Maya and the situation.
   - The schematic map with each area's _listed_ contractor count (the tempting view), and a table with the same figures.
   - A short client voice.
2. **Make a prediction.** Which area is ready for more starts. It's locked once made and never marked.
3. **What clients need.**
   - Choose an area on the map (or filter by area, service, or day and time) to see each need's tiers: confirmed, booked, being arranged, the forecast range, and unknown or paused.
   - Each need shows its needed-from date, preference state, source and verified date.
4. **What is usable.**
   - Tag eight supply cards as _usable now_, _potential after verification_, _unavailable_ or _already committed_, each read against one need.
   - Then the **coverage comparison** opens:
     - the map with statuses;
     - a row per need, with a bar (booked, covered by spare, current gap, and the being-arranged or forecast band when that filter is chosen);
     - filters for service, area, day and time, week, demand tier and supplier readiness;
     - a table with every figure.
   - Opening a row shows why, what would change it, who acts, each supply row's reading, the participant's choice, backup and the evidence.
5. **The fragile plan.** What Worker E's absence would do (a table), and the participant's chosen Worker P and their route.
6. **Two decisions.**
   - With both lists beside them, choose an immediate action and a network priority, then the evidence behind them.
   - Misconceptions offered include:
     - "six contractors listed, so it's ready";
     - "A and B have 14 spare hours";
     - "drop Worker P".
7. **Follow-up.**
   - The story update, what changed, and the comparison after it.
   - Did outreach create usable capacity?
   - Keep or revise the network priority.
8. **Local Coverage Brief** (the debrief).
   - What happened next, the rubric and critical flags.
   - Each card beside the model's reading, and the prediction.
   - The case, the Network Builder placeholder, the links, and a printable learning brief.

The server enforces the order:

- the detail opens only after the prediction;
- the debrief comes only once these are all done:
  - an area and a coverage row are opened;
  - every card is tagged;
  - the absence is looked at;
  - both decisions and the evidence are chosen;
  - the follow-up is answered.

**Rubric** (`coverage-rubric-1`), each 0–3:

- **demand tier**;
- **supply status**: card tags against the model's reading;
- **time and location fit**: the cards whose reading turns on service, capability, area, time or a window already counted elsewhere;
- **backup reasoning**: capped at 1 if the absence wasn't looked at;
- **honest communication**;
- **follow-through**: the revised priority counts if changed.

It never scores how many clients are accepted or workers recruited. **Critical flags** stand above any total:

- leaving a current gap waiting for recruitment;
- counting a candidate or an unverified worker as capacity;
- counting spare hours at the wrong time, place or service;
- discarding a participant's chosen worker;
- promising a service date from outreach or an unconfirmed offer;
- treating a contractor count or a green map as capacity;
- letting margin or funding decide whose care gets attention.

Some are raised by the tags themselves: a pipeline card tagged usable, a mismatched card tagged usable, or the chosen worker tagged unavailable.

"Look again" starts a fresh attempt. Every attempt, first and revised, is kept.

## Plan my local area

- **Who sees it.** The tab appears only for the business owner and members they've authorised, using the same access as Plan my business (`plannerAccess`).
- **Starting.** It starts **blank**: one area, one need and one aggregate supply row, with today's date. It never starts with the story's figures.
- **What it asks for.**
  - Aggregate, anonymous rows: hours or visits a week by service, area and window; supply rows labelled "Agency row 1" or "Worker A".
  - Never a participant's name, address, diagnosis or care plan, or a contractor's contact details.
  - The page says to widen an area if one or two clients could be identified.
- **What it shows.** The same map, comparison, lists and table as the story, plus:
  - the owner's own order for the network priorities, each position with a recorded reason;
  - the Network Builder placeholder.
- **Saving.**
  - Unsaved entries stay in the page only, never in browser storage.
  - Save creates a new numbered version, and nothing is overwritten.
  - Blanks are saved as blanks.
- **The Local Coverage Brief** holds:
  - the planning period (dates and time zone);
  - the top service-time-area gaps;
  - the immediate continuity actions;
  - the network priorities with any reasons;
  - each source and its verified date, and the freshness rule and who set it;
  - assumptions;
  - the participant-choice issue (status and route only);
  - an owner and a review date.

  It prints alone.

- **Coming back.** A later version shows what changed since the version before: demand, bookings, newly usable capacity, backups and remaining gaps. A contractor added to the list doesn't count as an improvement until they're approved, available and verified.
- **Access checks.** Every read and write is checked on the server: the person must have access, and the plan must belong to their own business. Anyone else gets 403 or 404, whatever id they try: a member without access, the author/superadmin, or the owner of another business. Tests cover each.

## Telemetry

Events go to `magazine_events`:

- `coverage_started`
- `prediction_submitted`
- `area_opened`
- `filter_used`
- `card_tagged` (with whether it matched the model's reading)
- `row_opened`
- `absence_viewed`
- `decision_submitted`
- `followup_answered` (with whether the priority was revised)
- `coverage_completed`
- `retry_started`
- `brief_printed`

They carry ids, fictional choices, matches, rubric levels and flags only: no typed words, no hours and no area figures.

Authors get totals from `GET /api/magazine/[id]/coverage?stats=1`:

- each person's first finished attempt counts;
- the totals include which cards were misread (repeated confusion about candidate versus verified capacity, say) and how many revised their priority;
- under 5 people, only counts are shown;
- private plans are never included.

## Publishing

`coverageHardProblems` blocks publishing (and "Publish anyway") until:

- the case check passes:
  - the figures validate, before and after the story update;
  - there's a current gap to act on, and some cover to set it against;
  - the cards name real rows and needs, have feedback, and span at least three readings;
  - the absent worker has bookings;
  - there's a story update and a next step;
  - each choice list has at least one strong, unflagged answer;
- the sign-off is recorded: owner, Care Partner Operations, supplier onboarding, Quality/clinical governance, Partnerships, the policy owner, privacy and the pilot group, and the approval date;
- any review-by date hasn't passed.

The demo article ships with the sign-off empty.

The editor also records the **AI selection rationale** (PRD section 11) with the story version:

- the verified problem and its owner;
- the audience and target behaviour;
- why a multi-area comparison fits;
- related content to reuse;
- alternative process actions;
- the linked operational measure.

The author accepts, edits or rejects it.

## Not yet

- **The Contractor Network Builder Work Tool** doesn't exist in this repo. Each of these is a clearly labelled placeholder, or not built:
  - **The handoff.** The block's `handoff` field shows a labelled placeholder ("Next step: Contractor Network Builder (Work Tools) · placeholder") in the debrief and in Plan my local area. There's no authorised handoff of an aggregate gap reference, and no link.
  - **The shared taxonomy and calculation.** These live here as `network-taxonomy-1` until the Network Builder owns them.
  - **Its North Brisbane morning case.** That case doesn't exist, so the story uses fictional suburbs around Toowoomba instead.
- **Link from "Can we take on the next 10 clients?"** when its supplier coverage is constrained. This block links there, but nothing links back: it would need a link in `content/growthCases.ts` (and the published article), or a conditional link in the growth readiness block.
- **Favourites:** pinning a Local Coverage Brief. The `favourites` kind check would need a new kind and a table rebuild, as for growth readiness and the Workload Lens.
- **Integrations:** Portal, CRM, scheduling or supplier-onboarding data. Each needs a field owner, permission scope, sync interval, source timestamp and correction route. Today every figure is entered by hand, in aggregate.
- **Small-cell suppression on the map** is guidance on the page (widen the area), not enforced by the model.
- **AI explanation and the AI Learning Designer:** no AI paraphrase of results is built, and the designer has no recommendation record; the rationale lives on the block.
- **Review:** the case's figures, the 30-day freshness rule and the backup targets are illustrative. Operations, supplier onboarding and Quality should check them, and set real rules before anyone uses Plan my local area for decisions.
