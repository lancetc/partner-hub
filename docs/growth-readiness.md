# Growth readiness: "Can we take on the next 10 clients?"

A reusable Magazine block (type `intake`) and a demo article. A Care Partner tests whether next month's planned starts fit the coordinator team's hours **week by week**, and whether each service a start needs has **confirmed, current, spare** supply. Then they decide what to do and what to tell people.

It's a near-term intake and service-readiness decision. It's separate from the Hiring Runway lab and Plan my business, which forecast recruitment, margin and cash over months. A continuing hours deficit links there.

Source: *Partner Hub PRD: Can we take on the next 10 clients?* (22 November 2026).

## Where things live

| Part | File |
|---|---|
| The model (pure, deterministic) | `src/lib/growthReadiness.ts` |
| The block: case shape, learner state, rubric, parse, readers' copy, publish checks | `src/lib/growthLab.ts` |
| The reviewed fictional case (Priya's February) | `src/content/growthCases.ts` |
| Attempts, events, author totals, private business scenarios | `src/server/growthReadiness.ts` |
| Learner API | `src/app/api/magazine/[id]/intake/route.ts` |
| Use my business API | `src/app/api/tools/intake/route.ts` |
| Learner view | `src/components/magazine/GrowthReadinessLab.tsx` |
| Editor | `src/components/admin/MagazineIntakeEdit.tsx` |
| Tables | `GROWTH_SCHEMA` in `src/server/db.ts`: `intake_attempts`, `growth_scenarios`, `growth_scenario_versions` |
| Demo article | `nextTen` in `src/content/magazineDemos.ts` (key `next-10`) |
| Tests | `src/lib/growthReadiness.test.ts`, `src/server/growthReadiness.test.ts`, `src/content/magazineDemos.test.ts` |

## The model (`growth-readiness-1`)

**Weeks.** The month is split into Monday-to-Sunday calendar weeks, cut to the days inside the month. Partial weeks are kept as they are, so a monthly total can never hide a short week. For each week `w`:

```text
available[w] = Σ coordinators (working[w] − leave[w] − nonClient[w]) − reserve[w] + cover[w]
needed[w]    = existing clients × hours per client (by band) + exceptional[w] + setup[w] + follow-up[w]
headroom[w]  = available[w] − needed[w]
```

- **Partial weeks.** Recurring weekly figures (working hours, non-client duties, existing work per client, visits per week) are scaled by the weekdays inside the month, out of five. Leave, cover, exceptional work and setup are entered in hours for the week and aren't scaled.
- **No double count.** Non-client duties fall only on the days a coordinator works, so leave never takes them off twice.
- **Reserve and cover.** The reserve is a share (0–50%) of the coordinators' own net hours. Approved temporary cover is added after it, in full.
- **Setup and follow-up.** Setup falls in the start week. First-month follow-up is spread by an authored weekly share (default 0 / 50 / 30 / 20%). Any that falls after the month is reported separately.

**Service coverage.** This is matched per service + capability + area + time window + week: slots needed against confirmed spare slots.

- **What counts.** Only `confirmed` supply verified within 30 days of the "as of" date counts.
- **What doesn't.** Provisional offers, expired approvals, stale verifications and unknown status never count. They can only make a start "Needs confirmation".
- **Booked slots** are never reusable. A slot covers one start once.

**Starts.**

- Starts are read in the stated order: week, then the order the owner set. They're never ordered by revenue, funding or ease.
- Each start is one of:
  - **Modelled capacity**;
  - **Constrained**: beyond the hours in a named week, or with no slot;
  - **Needs confirmation**: an expected stage, an open unknown, or only unconfirmed supply;
  - **Enquiry**: kept out of the forecast.
- The model never refuses, defers or moves anyone. Moving a start is offered as a discussion option.

**Overall.** The result is one of three states:

- **Capacity gap**: any short week, any service gap or any constrained start.
- **Needs confirmation**: otherwise, anything unconfirmed.
- **Modelled capacity available**: neither of the above. This is a planning signal, never an approval.

**Blank isn't zero.** `validateInputs` refuses blanks and out-of-range figures. The view keeps the last valid result, labelled, until they're fixed.

**What it reports:**

- the tightest week;
- the findings that matter most (for example "Week 2 is short by 6.4 hours: 4 starts need 25 setup hours that week…");
- `inputChanges` and `resultChanges` for what a change did.

The PRD's five fixtures are unit tests in `src/lib/growthReadiness.test.ts`.

## The learner's path

1. **The Monday call.** Priya's portrait (from the character library), her situation, a family voice, a coordinator's concern, and the referral list.
2. **Make a prediction.** How many starts she could confirm today, and what you'd check first. It's locked once made and never marked on the number.
3. **Map the month.**
   - A week-by-week chart with a table equivalent. Open a week for its breakdown.
   - Every assumption is editable, and every slider has a number field.
4. **Check service coverage.** Each service check opens to show why it isn't covered, and each start shows its status and reasons.
5. **Try a change.** These are authored options:
   - approved cover;
   - verifying a roster;
   - moving a flexible start, if they agree;
   - re-verifying stale supply.

   The page shows "what you changed" and "what it did".
6. **Decide and tell people.** Choose an action and a message.
7. **Debrief and Decision Sheet.** What happened next in the story, the rubric, critical flags, the prediction compared with the model, links, and a printable learning Decision Sheet.

The server enforces the order. The map opens only after the prediction. The debrief comes only once a week, a service gap and a change have been looked at and an action and a message chosen.

**Rubric** (`intake-rubric-1`): evidence used, handling unknowns, participant-centred communication and appropriate escalation, each 0–3.

- Evidence comes from the prediction's useful checks, and whether a week, a service and a change were opened.
- The other dimensions come from the authored levels on the chosen action and message.
- It never scores the predicted count or how many starts were taken on.
- **Critical flags** stand above any total:
  - promising a date before it's confirmed;
  - moving someone without talking to them;
  - choosing by revenue, funding or ease;
  - leaving an urgent need waiting.

"Try another route" starts a fresh attempt. Every attempt is kept.

## Use my business

- **Who sees it.** The tab only appears for the business owner and members they've authorised, using the same access as Plan my business (`plannerAccess`).
- **Starting.** It starts **blank**, for next month in the person's local timezone. It never starts with the story's figures.
- **Saving.**
  - Unsaved entries stay in the page only, never in browser storage.
  - Save creates a new numbered version, and nothing is overwritten.
  - Blanks are saved as blanks, with an "incomplete" snapshot.
  - "Resume my plan" opens the latest scenario, and earlier versions can be opened.
- **The private Growth Decision Sheet** holds next steps (action, owner, due date, status), a review date and notes. It prints alone.
- **Access checks.** Every read and write is checked on the server: the person must have access, and the scenario must belong to their own business. Anyone else gets 403 or 404, whatever id they try. Tests cover a member without access and an owner of another business.
- **What it asks for.** Aggregate figures and anonymous start labels. It never asks for names, diagnoses or addresses.

## Telemetry

Events go to `magazine_events`:

- `intake_started`
- `prediction_submitted`
- `week_inspected`
- `service_inspected`
- `change_tried`
- `decision_submitted`
- `intake_completed`
- `retry_started`
- `sheet_printed`

They carry ids, fictional choices, rubric levels and flags only: no typed words and no figures.

Authors get totals from `GET /api/magazine/[id]/intake?stats=1`. Each person's first finished attempt counts. Under 5 people, only counts are shown. Private business scenarios are never included.

## Publishing

`intakeHardProblems` blocks publishing (and "Publish anyway") until:

- the case check passes:
  - the figures validate;
  - there's a constraint to find;
  - there's at least one strong, unflagged action and message;
  - changes reference real starts and supply;
- the sign-off is recorded: owner, Operations/Quality, Partnerships, policy owner, privacy and the approval date;
- any review-by date hasn't passed.

## Not yet

- **Favourites:** pinning a Decision Sheet to Favourites. The `favourites` kind check would need a new kind and a table rebuild.
- **AI Learning Designer:** a recommendation card for this block. The block registry contract makes it searchable, but there's no recommendation rationale record yet.
- **Contractor Network Builder:** it doesn't exist in the repository, so there's no link to it.
- **Integrations:** Portal, CRM or supplier-scheduling data, an Excel export, and comparing planned with actual starts. Each needs its own data contract and access review.
- **Review:** the authored times, setup hours and supplier patterns are illustrative. Operations/Quality and a pilot group of Care Partner principals should check them.
