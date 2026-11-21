# Learning Designer: the Problem desk

Built from the PRD *AI-Assisted Learning Designer* (November 2026). This note records how the first slice works, the decisions made, and what's left. It covers the PRD's manual loop: **no new AI calls yet**.

In Administration: **Content → Problem desk** (`/admin/problems`). Learning authors only.

> **Since this was written** ([living-cases.md](living-cases.md), 21 November 2026): a contact can be a **repeat contact** as well as a follow-up or a material change; a case can carry a de-identified **party** label; a review records an interpretation, what else could explain it and a next action, and can be a **Process fix**; a decision can be reopened after a review without rewriting it; and the Excel register has five more sheets after the original five. A verified theme can also be read over time in the **Signal Room**.

## What it is

A place to start from what's going wrong at work, not from a course. The trail is:

**signal → problem → target behaviour → barrier → response → learning design → evidence**

A theme groups related, de-identified signals. For each theme an author records what people should do, what's in the way, what already exists, what's been tried, the lightest useful response, and later whether work changed. The response can be a process fix, a portal change, a job aid, a note, or **no learning at all**. A course is never required to close a theme.

The Hub is the learning and improvement layer. It is not the complaints or incident system. It holds short de-identified summaries and a reference back to the real record, and nothing here acknowledges, resolves or closes a real case.

## What's in this slice

| Step | What it does |
|---|---|
| 1. Signals | Linked cases with their dated contacts, counts, a monthly trend, the theme's facts, status, verify, merge, split, false match, history |
| 2. Diagnosis | Situation, who, what they do now, what they should do, barriers with confidence and evidence, unknowns, a working statement |
| 3. Existing content | A catalogue search on the desired behaviour, with what each item covers, what's missing, and the decision |
| 4. What's been tried | Every earlier action and its result, then the actions in the current response, each with an owner |
| 5. Response decision | Problem, audience, behaviour, barrier, learning decision, work measure, baseline, review date, effort, assignment intent; approve |
| 6. Learning plan | Rule-based suggestions from the block registry, each with "Why this block"; accept, swap with a reason, add, reorder, remove; coverage in words |
| 7. Measures | Two aligned charts (work and practice) with dated intervention markers, and the typed-in figures behind them |
| 8. Review | Keep, revise, target differently, withdraw, or close with evidence |

Plus the desk itself (overview measures, issue trend, recurring themes, a safety queue, ungrouped signals), an Excel export, and purpose-based search in the Magazine's **Add a block** picker.

## Counting rules

These are kept apart everywhere: on screen, in charts and in the export.

- A **case** is one unique issue in its source system. The same source and reference can only be linked once; a second attempt says where it already is.
- A **contact event** is one dated contact about a case: the initial report, a follow-up, or a material change. One case with three follow-ups is **one case and four contact events**.
- A **closure** or **reopening** is a change of state, not a contact. A reopening only counts if the case had been closed first.
- A **false match** stays on the theme, greyed, and is left out of every count.
- A **theme** is a person's grouping. It's a *candidate* until someone ticks "I've checked this grouping". Checking a grouping says nothing about cause.
- **Median days to close** is from first report to first closure, for cases that have closed. With none closed it says "Not measured".
- A **rate per 100** needs a denominator. Without one it says "Insufficient data", never a percentage and never zero.
- Under 30 in the denominator (`SMALL_SAMPLE`), a point is drawn hollow and labelled a small sample.

The logic is in `lib/problemDesk.ts` (`countCases`, `trend`, `caseOpen`, `ratePer100`) and is pure, so the page, the export and the tests all use the same code.

## Safeguards

- **Safety themes** sit in their own queue above everything else, and are never ranked below a routine theme because it has more cases. A safety theme can't be merged into a lower-risk one, and can't be set to "Monitor" without saying who has acted.
- **Closing** a theme, or marking it already addressed, needs the evidence in a sentence or two.
- **Access and workflow barriers** are marked as outside what learning can fix. If they're the only barriers, the plan suggests nothing and says why.
- **Approval** of a response needs a problem statement, audience, behaviour, barrier, a learning decision (which can be "No learning item"), a reason, at least one action with an owner, a named work measure, a baseline or a plan to collect one, a review date and an owner. A required assignment also needs its roles and its reason.
- **Changing an approved response** returns it to draft.
- **Learner hours** (people × minutes) are shown before anyone asks for the time.
- A **practice or quiz score** is always described as practice. The page says, wherever scores appear, that it isn't proof work improved, and that two trends moving together don't show one caused the other.
- Nothing is **assigned** from here. The decision records who it was meant for and why.
- **Start the Magazine draft** appears only for an approved decision to create something new. It makes an ordinary draft; the usual review, sign-off and publish gates all still apply.

## The block registry

`lib/blockRegistry.ts` holds one contract for each of the Magazine's 49 block types. A test fails if a block is added to the Magazine without one.

Each contract says: what the learner does, phrases an author might search by, which barriers it can address, when it's a poor fit, what the author must supply, the evidence it produces, how it's completed and scored, who signs it off, and roughly how long it takes.

**Evidence levels** are never inferred from each other: *Accessed*, *Completed*, *Practised with feedback*, *Met an approved assessment criterion*. Only the Quiz (from the Question Pool) is "assessed".

**Barriers** follow a simple capability / opportunity / motivation lens:

| Lens | Barriers | Learning can help |
|---|---|---|
| Capability | Knowledge, skill, judgement, attention | Yes |
| Motivation | Confidence, priorities, habit | Yes |
| Opportunity | No cue at the point of work | Yes |
| Opportunity | Access; workflow | **No**: needs a system or process change |

### Recommendations

`recommend(brief)` is rules over the registry, not a model. It:

1. Returns nothing, with the reason, when no learnable barrier has been diagnosed.
2. Scores each block on the barriers it addresses (known counts more than suspected), how well its purpose matches the behaviour and signal, and whether it fits the time.
3. Picks at most one block for each step: *see the situation*, *inspect or decide with feedback*, *apply at work*, and (only if a criterion must be met) *show it against a criterion*.
4. Trims from the end until it fits the time, always keeping the practice step.
5. Gives each step a rationale: the behaviour, the barrier and how sure anyone is, what the learner does, the evidence produced, what the author must supply, whether the time is proportionate, and what isn't certain.

An author can accept a step, swap it for an alternative or any other implemented block (with a short reason, which is kept), add one, reorder or remove. "Suggest again" replaces only the untouched suggestions.

`coverage()` describes the plan in words: what's practised, what's only explained, what's not addressed, what's outside learning, repeated activity types, a missing source, no feedback anywhere, and total minutes against the plan.

### In the Magazine editor

The **Add a block** search now also matches on what the learner does. "spot a wrong rate on an invoice" finds Document Auditor, Spot the mistake and Spot the Signal, each with its purpose, evidence level and time.

## Charts

Hand-drawn SVG (`components/admin/problems/ProblemCharts.tsx`), no chart library.

- **Issue trend**: new unique cases, follow-up contacts and reopenings by month, as three separate series. They are never stacked or added.
- **Recurring themes**: unique cases per theme, as bars with the number written out.
- **Measures**: the work measure and the practice measure as two charts on the same months, each with its own scale. There is never a second y-axis. Numbered dashed lines mark dated actions, listed under the chart.
- A month nobody measured is a gap in the line, not a zero.
- Each series has its own colour **and** marker shape, a legend, a tooltip, and the same figures as a table under the chart.
- The three series colours were checked for colour-blind separation on the Hub's light and dark surfaces. They sit just under 3:1 contrast on the dark navy, which is why the shapes, legend and table are always there.

## Excel export

**Export to Excel** on the desk downloads `Problem desk decision register YYYY-MM-DD.xlsx`, respecting the current filters, using the Hub's own workbook writer.

| Sheet | Contents |
|---|---|
| Decision register | One row per theme: status, risk, counts, denominator, roles, behaviour, barrier, response, learning decision, hours, owner, review date, measure, baseline, latest figure, link |
| Previous responses | Every action, before and after: type, owner, audience, asset, intent, status, result, interpretation, snapshot, report link |
| Learning design | Each plan step: block, behaviour, barrier, rationale, inputs, evidence type, review status, sign-off |
| Trend data | Monthly series in long form, with metric type and data-as-at |
| Data notes | Who exported, when, filters, and every definition above |

It's a review and handover snapshot, not the source of truth. It contains de-identified summaries and aggregates only: no named learners, no case narratives, no answer keys. Unknowns read "Not measured", "Not known" or "Insufficient data". Each export is written to the audit log.

## Where things live

| What | Where |
|---|---|
| Counting rules, statuses, response checks | `src/lib/problemDesk.ts` |
| Block contracts, recommend, coverage | `src/lib/blockRegistry.ts` |
| Reading, actions, export, seeding | `src/server/problemDesk.ts` |
| Tables (`pd_*`) | `PROBLEM_SCHEMA` in `src/server/db.ts` |
| Fictional pilot | `src/content/problemPilot.ts` |
| API | `src/app/api/admin/problems/route.ts`, `.../export/route.ts` |
| Pages | `src/app/admin/problems/`, `src/components/admin/problems/` |

### Source of truth

| Thing | Owned by | What the Hub holds |
|---|---|---|
| Complaint, incident, billing record | Its own system | Reference, de-identified summary, dated contacts |
| Eligible denominator | The data owner | A number someone typed, with where it came from |
| Work measure | The data owner's report | Monthly numerator and denominator, typed in, dated |
| Practice measure | The Hub's learning records | For now, also typed in (see gaps) |
| Topic completions | The Hub | A link to the Topic's existing report |
| Theme, diagnosis, decision, plan, review | The Problem desk | Everything |

### Who can do what

| | Learning author | Org admin | Learner |
|---|---|---|---|
| See the desk, a theme, the export | Yes | No | No |
| Create or change anything | Yes | No | No |

Every reader and action calls `requireAuthor`. Care Partner businesses never see the desk.

### Audit events

`problem.response_approved`, `problem.reviewed`, `problem.exported`, plus `magazine.created` when a draft is started. Each theme also keeps its own readable history (created, risk, status, verified, cases added or moved, false matches, merges, splits, diagnosis confirmed, response approved or reopened, reviewed).

## The pilot

Three fictional themes are added once per Hub, marked **Sample**:

- **Invoices approved at rates that differ from the agreement** (elevated, plan response). Six cases and a false match; one case with three follow-ups; one closed, reopened and closed again. Two things tried before: a Topic update (*mixed*: "Many learners choose the correct response in practice; invoice rework has not yet fallen.") and an email (*no observed change*). A draft response with three actions, and five months of work figures beside three of practice figures.
- **A visit continued after a client's fall without a report** (safety, immediate operational action). One case, sitting above the others.
- **Questions about travel charges on invoices** (routine, already addressed). Closed out without a course.

Plus two ungrouped signals. Deleting a sample theme doesn't bring it back.

## Decisions

- **Rules before models.** The PRD puts the manual loop first. Every suggestion can be traced to a contract and a diagnosed barrier, and an author can see exactly why.
- **Considerations, not a score.** The queue order is safety, then elevated, then unique cases. "Why it sits where it does" is a sentence the owner writes.
- **One response per theme.** Past attempts are actions marked "tried before"; a new decision after a review edits the same response and re-approves it.
- **Typed-in measures.** The Hub doesn't compute the work measure, and nothing here reads from another system.
- **Hub paths or https only** for links out; anything else is dropped.

## Not built yet

- **AI assistance**: clustering signals into candidate themes, drafting a diagnosis, drafting content from the plan. Each would produce a labelled suggestion for a person to accept.
- **Imports** from the complaints, incident or billing systems, and from the Hub's own "Report a problem".
- **Practice measures from the Hub's records**: first-attempt results per block, read rather than typed.
- **A Magazine course report**, so a course can have a scored-outcomes link the way a Topic does. Until then a course action reads "No linked report yet".
- **Eligibility and assignment**: role memberships with dates, an eligibility snapshot, an audience preview with learner-load, and assigning from an approved decision.
- **A shared event vocabulary** across blocks, so evidence levels are recorded the same way everywhere.
- **Source-change impact**: flagging plans and courses when an approved source changes.
- **Building the plan into the draft**: the Magazine draft starts empty; the plan's blocks aren't placed in it yet.
- **Notifications** for review dates coming due.
