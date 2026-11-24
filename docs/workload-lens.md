# Workload Lens: "Where does a coordinator’s week go?"

A reusable Magazine block (type `workload`) and a demo article. A Care Partner principal follows a fictional coordinator's week, tags what filled it, reads a **week map** from the principal's and the coordinator's side, tests a change on the reviewed rework it touches, and chooses a proportionate next step before reaching for another hire.

It answers *which work is consuming capacity*. It isn't a productivity score, a utilisation target or a clients-per-coordinator figure. It's separate from growth readiness (next month's starts), and from the Hiring Runway lab and Plan my business (staffing, margin and cash over months). A sustained gap links there, by the user's choice.

Source: *Partner Hub PRD: Where does a coordinator’s week go?* (22 November 2026).

## Where things live

| Part | File |
|---|---|
| The model and the shared task taxonomy (pure, deterministic) | `src/lib/workloadLens.ts` |
| The block: case shape, learner state, rubric, parse, readers' copy, publish checks | `src/lib/workloadLab.ts` |
| The reviewed fictional case (Sam's week, Maya's business) | `src/content/workloadCases.ts` |
| Attempts, events, author totals, private team maps | `src/server/workloadLens.ts` |
| Learner API | `src/app/api/magazine/[id]/workload/route.ts` |
| Map my team’s week API | `src/app/api/tools/workload/route.ts` |
| Learner view | `src/components/magazine/WorkloadLensLab.tsx` |
| Editor | `src/components/admin/MagazineWorkloadEdit.tsx` |
| Tables | `WORKLOAD_SCHEMA` in `src/server/db.ts`: `workload_attempts`, `workload_scenarios`, `workload_scenario_versions` |
| Demo article | `coordinatorWeek` in `src/content/magazineDemos.ts` (key `coordinator-week`) |
| Tests | `src/lib/workloadLens.test.ts`, `src/server/workloadLens.test.ts`, `src/content/magazineDemos.test.ts` |

## The taxonomy (`workload-taxonomy-1`)

Every task has **one primary category**, so its time is counted once:

- new-client onboarding;
- planned review and care planning;
- participant or family conversation;
- service change and scheduling;
- supplier coordination;
- incident or clinical escalation;
- documentation and handoff;
- team management and training;
- other work.

Each has a written definition (`CATEGORY_HINTS`), shown to learners and authors. On top of the category, a task carries:

- **planned state**: planned, unplanned or known recurring;
- **causes**, an overlay (more than one may apply): client need changed, missed service, invoice or data correction, unclear handoff, system friction, supplier availability, policy question, no rework cause, unknown;
- **rework status**, set by a person after review, never by the model: reviewed avoidable rework, necessary follow-up, uncertain;
- **duty owner**, a planning label, not a legal determination: partner business, Trilogy Care, supplier, shared, to confirm.

The taxonomy is shared by every Workload Lens and versioned with the model. An article records the version it uses. Adding a category means changing the taxonomy, with a reviewed definition, not the article.

## The model (`workload-lens-1`)

Observed weeks and the forward plan are kept apart. For each observed week `w`:

```text
capacity[w]      = rostered[w] − leave[w] − other unavailability[w]
observed[w]      = Σ hours of each unique, measured task
unclassified[w]  = capacity[w] − observed[w]
reworkTagged[w]  = Σ hours of tasks reviewed as avoidable rework
```

For the coming week:

```text
demand   = recurring + starts × hours per start + known exceptional + team and operational duties + reserve
headroom = capacity − demand
```

**Counted once.** Causes are an overlay. A 45-minute family call about a missed visit is 45 minutes of conversation, and the same 45 minutes shows under "missed service"; the overlay is never added to the total. Every week's categories, and its planned states, each sum exactly to the observed total (`partitionOk`, the double-count check). Duties are tasks when observed and demand when planned; they're never also taken off capacity.

**Unrecorded is not idle.**

- A negative `unclassified` is flagged as overlapping entries or an overrun (working late), never as anyone being unproductive.
- A positive one is time nobody wrote down.

**Blank, not measured and zero are three things.**

- A blank (`null`) duration is an error to fix.
- `"unknown"` ("not measured") is kept out of the hours and counted as a data-quality gap.
- `0` is zero.

**Changes.**

- A change only reduces tasks a person reviewed as avoidable rework, matching its cause and/or category. Moving a duty instead targets tasks whose owner isn't the partner business.
- The amount is the user's own conservative estimate (occurrences × minutes a week), capped at the average observed in those tasks.
- Two changes aimed at the same tasks share them, so together they never claim more than was observed.
- Cover adds capacity. Hiring isn't modelled: it links out.
- Every result is labelled **modelled, not realised**, beside the quality guardrails (overdue reviews, late callbacks, escalations waiting).

**Weeks.**

- One week is labelled an illustration, not a forecast; two or three are "a few"; four or more are "a sample".
- A range is always shown beside an average, and the model never gives a staffing verdict.

**What changed.** `inputChanges` and `resultChanges` say what a change to a tag, duration, count, plan figure or change did. Changing a cause tag says the category totals don't move.

The PRD's fixtures 2 to 7 are unit tests in `src/lib/workloadLens.test.ts`.

## The learner's path

1. **Monday: a planned week.**
   - Ava’s optional transmission, then Maya (her portrait from the character library) and Sam, the situation and the week as planned.
   - The reader can switch between Maya's view (commitments and capacity) and Sam's (interruptions and consequences).
2. **Make a prediction.** Which part of the week will become the constraint, and how many hours are left for the unexpected. It's locked once made and never marked.
3. **The week unfolds.**
   - Five events from Tuesday to Thursday. For each, the reader picks one primary category and any causes. Where asked, they also say whether it needs prompt action or can be rescheduled.
   - A story detail says what it means for the client.
   - "What changed?" explains each re-tag.
4. **The week map.**
   - Maya's view shows hours by category, with unplanned hours and reviewed rework drawn inside each bar. Sam's view shows the week day by day: planned, recurring and unplanned.
   - Each has a table with every figure, and rows open to their tasks and story details.
   - A cause-overlay table and a week-by-week comparison with the range sit below.
5. **Test a change.**
   - The authored changes: fix the discharge handoff, the invoice Job Aid, raise the missed visit with the supplier, four hours' cover, and explore hiring.
   - Each estimate is editable.
   - The plan table shows before and after, modelled.
6. **Friday: decide.** Compare explanations of the week (including the misconception "seven hours of calls means calls must be shortened"), then choose what Maya does next.
7. **Week Review.** What happened next, the rubric, critical flags, your tags beside the reviewed ones, your prediction against the map, the following weeks, and a printable learning Week Review.

The server enforces the order:

- the week opens only after the prediction;
- the debrief comes only once every event is tagged, part of the map is opened, a change is tested, and an explanation and decision are chosen.

**Rubric** (`workload-rubric-1`), each 0–3:

- **diagnosis**: how far the tags matched the reviewed ones (category, key cause and timing), capped by the explanation chosen;
- **evidence**: whether they opened the map, a story detail, a change and the comparison or causes;
- **respectful handling of client needs**;
- **appropriate action**.

It never scores speed, utilisation or hours saved. **Critical flags** stand above any total:

- treating necessary conversation as waste;
- shortening an essential review;
- putting off a prompt escalation;
- aiming for full utilisation;
- turning the map into tracking a person;
- presenting a modelled estimate as realised.

"Map the week again" starts a fresh attempt. Every attempt, first and revised, is kept.

## Map my team’s week

- **Who sees it.** The tab appears only for the business owner and members they've authorised, using the same access as Plan my business (`plannerAccess`).
- **Starting.** It starts **blank**: one week with an aggregate row per category (count × observed average minutes), and a blank plan. It never starts with the story's figures.
- **What it asks for.** Aggregate hours by kind of work and anonymous row labels. It never asks for a named employee, a calendar, messages or a timesheet. The page explains the purpose, who can see a map and how long it's kept, and says to treat a one-person team's figures as a personal record.
- **Saving.**
  - Unsaved entries stay in the page only, never in browser storage.
  - Save creates a new numbered version, and nothing is overwritten.
  - Blanks and "not measured" are saved as they are.
- **The Week Review** holds the period, the sampled weeks and their kind, the work mix, the main sources of pressure, unknowns, the chosen change, its owner, the hours it should affect, the quality guardrails and a review date. It prints alone.
- **Coming back.** On a later version, the previous version's chosen change and expected hours are shown beside the new figures, with "Did it help?".
- **Access checks.** Every read and write is checked on the server: the person must have access, and the scenario must belong to their own business. Anyone else gets 403 or 404, whatever id they try: a member without access, the author/superadmin, or the owner of another business. Tests cover each.
- **Other tools.** Nothing is carried to Plan my business or the Hiring Runway lab automatically; the page links there.

## Telemetry

Events go to `magazine_events`:

- `workload_started`
- `prediction_submitted`
- `event_tagged`
- `map_inspected`
- `detail_opened`
- `change_tried`
- `decision_submitted`
- `workload_completed`
- `retry_started`
- `review_printed`

They carry ids, fictional choices, rubric levels and flags only: no typed words and no hours. The learner's hours guess stays in their own attempt.

Authors get totals from `GET /api/magazine/[id]/workload?stats=1`. Each person's first finished attempt counts. Under 5 people, only counts are shown. Private team maps are never included.

## Publishing

`workloadHardProblems` blocks publishing (and "Publish anyway") until:

- the case check passes:
  - the figures validate and partition exactly;
  - every event names a task in the first week, with feedback, and a timing answer where it asks;
  - there's reviewed rework for a change to test;
  - each change names what it touches and its evidence, and none starts switched on;
  - there's at least one strong, unflagged explanation and decision;
- the sign-off is recorded: owner, Care Coordination operations, Quality/clinical governance, Partnerships, privacy and the pilot group, and the approval date;
- any review-by date hasn't passed.

The demo article ships with the sign-off empty.

The editor also records the **AI selection rationale** (PRD section 10) with the story version:

- the theme and its owner;
- the audience and behaviour;
- why a time map fits;
- what's reused;
- the process fix also needed;
- the linked operational measure.

The author accepts, edits or rejects it.

## Not yet

- **Favourites:** pinning a Week Review to Favourites. The `favourites` kind check would need a new kind and a table rebuild, as for growth readiness.
- **Carrying figures to Hiring Runway or Plan my business:** there's a link, but no prefill. It would need an explicit "take these figures" action and an input contract on the planner.
- **AI Learning Designer:** the block registry contract makes it searchable and recommendable. The rationale lives on the block; there's no designer-side recommendation record yet.
- **Coordinator contributions:** coordinators entering their own observations needs an agreed, visible participation process. Today only the owner or authorised members enter aggregate figures.
- **Integrations:** Portal, CRM or calendar data. Each needs its own data contract, provenance and consent review. Nothing infers time from a meeting title or message count.
- **Review:**
  - The authored durations, the week's events and the duty owners are illustrative. Care Coordination operations, Quality and a pilot group should check them.
  - The character library already has a "Sam": a Trilogy Care team member (a woman in her sixties). So the block registers only Maya with the library, and shows only her portrait. The story editor should give Maya’s coordinator a distinct entry (a surname or an alias) before Sam gets a portrait.
