# Referral Journey Calculator: "Which referrals become active clients?"

A reusable Magazine block (type `referral`, labelled **Referral Journey Calculator**) and a demo article. A Care Partner business owner follows the **same arrival cohort** of enquiries, by referral source, from the **stage each person was at when they first made contact**, through authorised introduction, a suitable pathway, the participant's choice and agreement, the first delivered service, and whether they're still active at an observation point. Relationship effort sits beside the starts it led to; case onboarding is kept apart. They then choose:

- **one relationship action** (more attention, a better handoff, or a different expectation);
- **one operational fix**, where the evidence calls for one.

Every rate shows its numerator, denominator, cohort and source ("GP practice, April–June 2026 enquiries: 4/12 = 33%"). There's no best-referrer score and no leaderboard.

It answers _which relationships deserve more attention, a better handoff or a different expectation_. It isn't a referral system: it doesn't contact a referrer, record a live referral or decide eligibility. Pitch practice, approved one-pagers and follow-up drafts belong to the Local Referral Studio Work Tool (`/tools/referral-studio`, docs/local-referral-studio.md). It now exists and reads its stage model from this block's `referral-stages-1`; this block's "Local Referral Studio" placeholder isn't wired to it yet (see "Not yet").

Source: _Partner Hub PRD: Which referrals become active clients?_ (22 November 2026).

## Where things live

| Part                                                                               | File                                                                                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The cohort model and the stage model (pure, deterministic)                         | `src/lib/referralJourney.ts`                                                                                 |
| The block: case shape, learner state, rubric, parse, readers' copy, publish checks | `src/lib/referralLab.ts`                                                                                     |
| The reviewed fictional case (Maya's three relationships)                           | `src/content/referralCases.ts`                                                                               |
| Attempts, events, author totals, private Relationship Reviews                      | `src/server/referralJourney.ts`                                                                              |
| Learner API                                                                        | `src/app/api/magazine/[id]/referral/route.ts`                                                                |
| Review my relationships API                                                        | `src/app/api/tools/referral/route.ts`                                                                        |
| Learner view                                                                       | `src/components/magazine/ReferralJourneyLab.tsx`                                                             |
| Editor                                                                             | `src/components/admin/MagazineReferralEdit.tsx`                                                              |
| Tables                                                                             | `REFERRAL_SCHEMA` in `src/server/db.ts`: `referral_attempts`, `referral_reviews`, `referral_review_versions` |
| Demo article                                                                       | `referralActive` in `src/content/magazineDemos.ts` (key `referral-active`)                                   |
| Tests                                                                              | `src/lib/referralJourney.test.ts`, `src/server/referralJourney.test.ts`, `src/content/magazineDemos.test.ts` |

## What's reused, and what isn't

The PRD asks to build from the Local Referral Studio's approved stage model and claim register. That Work Tool doesn't exist in this repo, so the stage model lives in `src/lib/referralJourney.ts`, versioned as `referral-stages-1`. When the Studio is built, that's what it should own; this block should then import from it.

Reused as they are:

- **Business access**: `plannerAccess` (`src/server/caseloadPlanner.ts`), the same owner-and-authorised-members rule as Plan my business, Plan my local area and the Workload Lens.
- **The block shape**: the sibling calculators (growth readiness, the Workload Lens and Local Coverage): an attempt per learner pinned to the course revision, a debrief only from the server, numbered private versions, a printable sheet using the Hub's `growth-sheet` print rule, and the AI selection rationale on the block.
- **Maya**, from the character library, and her two fictional suburbs from "Is this suburb ready for growth?".

## The stage model (`referral-stages-1`)

- **Stage at first contact** (stored apart from any later update, and never inferred from who referred):
  - unknown (counted, never guessed);
  - needs assessment;
  - approved, waiting for allocation;
  - allocated, choosing a provider;
  - receiving care, considering a change;
  - urgent change.
- **Events**, each with a written definition shown to learners and authors:
  - **enquiry**: a distinct person or authorised supporter asks, or a professional raises an enquiry with authority. A handout download or page view isn't one;
  - **authorised introduction**: permission to contact through the approved process. A meeting with a GP practice is relationship activity, not an introduction;
  - **suitable pathway**: considered through the authorised intake process. A lead score never decides eligibility;
  - **agreement**: the participant chooses the provider and enters the agreement. Not a service;
  - **first service**: the first delivered, agreed service;
  - **active at the observation point**: still receiving the arrangement at 30, 60 or 90 days.
- **Sources**: GP practice, hospital discharge team, allied health, community organisation, existing-client recommendation, self or family, another professional, and **unknown or multiple** (a valid answer).
- **Closed reasons**: chose another provider and decided not to go ahead (both the person's choice), not a suitable pathway now, no authority or couldn't be reached, moved to residential care, died, another reason, not recorded.
- **Exit reasons**: died, residential care, moved away, changed provider (their choice), a service issue (worth reviewing), another reason, not recorded.
- **Waits and who owns them**: an assessment and a funding allocation (the government), the person's own timing (the participant), intake work (the Care Partner), service capacity (Operations and the supplier network), a delayed handoff (the referrer and intake together).

## The model (`referral-journey-1`)

For a source and a set of enquiry months (the arrival cohort):

```text
authorised_introduction_rate = authorised_introductions / distinct_enquiries
agreement_rate               = agreements / distinct_enquiries_in_same_arrival_cohort
service_start_rate           = first_services / distinct_enquiries_in_same_arrival_cohort
stage_matched_start_rate     = first_services_from_selected_initial_stage
                               / distinct_enquiries_from_that_initial_stage_in_the_same_cohort
effort_hours_per_start       = recorded_relationship_effort_hours / first_services_in_the_same_cohort
active_at_N_rate             = active_at_day_N / starts_with_at_least_N_days_of_observation
```

**A zero denominator is "insufficient data"**, never 0 % or infinity.

**Same arrival cohort.** A start is counted in the month the enquiry arrived. `calendarMonth` shows the tempting calendar view ("3 starts and 9 enquiries in June") and says how many of the month's starts came from earlier enquiries; it never gives a rate.

**One person counts once.** Each enquiry carries every known contact. The primary source is, in order:

1. a reviewed attribution, if one is recorded;
2. the first authorised introduction;
3. the one source every contact came from;
4. otherwise **unknown or multiple**.

Other contacts are **assists**: a pharmacist who mentions a GP's patient is an assist, never a second enquiry or a second conversion. The same opaque id twice is a validation error ("merge the rows").

**Open isn't failure.**

- An enquiry younger than the **comparison age** (90 days in the case) is open, not yet mature, and says so.
- A person waiting for a funding allocation is open, not lost, and the caution says it isn't the referrer's doing.
- Still-open enquiries are listed with their ages and who owns the wait. None is dropped.

**Time to first service** is a distribution:

- With exact dates (the fictional rows): the median and range among those who started, the started denominator, the open enquiries with their ages, and, for anyone who waited for funding, the days before and after the allocation ("not known" where the allocation date isn't recorded).
- From grouped bands (manual cohorts: 0–14, 15–30, 31–60, over 60 days, unknown): the bands only. **No exact median is ever made from bands.**

**Effort.**

- Relationship effort is meetings, travel and outreach, preparing approved material, and follow-up, and the page says which were included.
- Case onboarding is shown beside it, per start, and never added.
- Direct costs appear only if entered. Hours are never turned into money or profit.

**Continuity** divides those still active at day N by the starts at least N days old. Exits before day N are shown by reason; a death or a move to residential care isn't a failed referral.

**Too early to rank.**

- A source with fewer mature enquiries than the owner's threshold (5 in the case; no built-in default, a blank is an error) says "too early to rank" and what it can still show.
- When the sources' starting-stage mixes differ (a 30-point gap in the share ready to choose), the comparison says to compare stage-matched rates.
- `comparable` never puts a small source against a large one. There's no ranking at all.

**Blank, unknown and zero are three things.**

- A blank count is an error to fix, and the last valid result stays, labelled as a prior result.
- "Unknown" (relationship hours not recorded, first services not recorded by stage) is kept out of the arithmetic and named.
- Zero is zero. "Set this row's blanks to 0" exists, but only as the owner's own click.

**Counts stay inside the cohort.** Validation stops:

- stages, steps, or started plus open plus closed adding to more than the distinct enquiries;
- more first services than agreements;
- first services by stage beyond that stage's enquiries;
- timing bands beyond the starts;
- mature starts beyond total starts, and active beyond mature starts;
- exits beyond the mature starts that weren't active.

**What changed.** `inputChanges` and `resultChanges` cover:

- allocations arriving, agreements and starts, counted in their own cohort;
- later stage updates (the first-contact stage stays);
- exits;
- the resulting rates, effort per start and continuity, and a source becoming comparable.

The PRD's fixtures 2 to 9 are unit tests with exact figures in `src/lib/referralJourney.test.ts`:

- 6/12 = 50 % against 6/8 = 75 %;
- 4/5 = 80 %;
- 3 hours per start;
- a median of 21 days;
- one person counted once, with an assist;
- no calendar-month rate;
- two mature enquiries too early to rank against 50;
- blank, unknown and zero.

Fixtures 1, 10 and 11 are in `src/server/referralJourney.test.ts`.

## The fictional case

Maya, from the Hiring Runway lab, the Workload Lens and Local Coverage, keeps her established facts:

- a small Care Partner business in Toowoomba;
- 35 clients; three start each month and about one leaves;
- $26,720 in the bank and $10,000 kept in reserve.

Her three relationships are **generic labels only**: "the GP practice", "the hospital discharge team" and "the community organisation". Every enquiry has an opaque id (E01 to E33) and no name, age, diagnosis or address. The two areas are her fictional suburbs, Banksia Rise and Corella Park. Her coordinator isn't named: the library's "Sam" is a Trilogy Care team member.

April–June 2026 enquiries, as of 30 September (comparison age and observation point 90 days, 5 mature enquiries to rank):

| Relationship             | Enquiries and stage at first contact                                               | First services                                                                                          | Effort and continuity                                                           |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| GP practice              | 12: 4 allocated, 5 waiting for funding, 2 needing assessment, 1 unknown            | 4/12 = 33 %, but allocated 3/4 = 75 %; 5 waiting on government steps, 1 agreed and waiting for a worker | 18 h: 4.5 h per start; 2 of 4 starts old enough, both active                    |
| Hospital discharge team  | 6: 5 urgent, 1 considering a change                                                | 4/6 = 67 %, median 11.5 days; 1 to residential care, 1 chose another provider                           | 10 h: 2.5 h per start; onboarding 7 h per start (kept apart); 3/4 = 75 % active |
| Community organisation   | 5: 3 allocated, 1 considering a change, 1 waiting                                  | 4/5 = 80 %                                                                                              | 6 h: 1.5 h per start; 3/3 = 100 % active                                        |
| Existing-client referral | 2                                                                                  | 1/2, **too early to rank**                                                                              |                                                                                 |
| Unknown or multiple      | 1 (a pharmacist and the family mentioned the business; no authorised introduction) | 1/1                                                                                                     | A pharmacist's later mention of a GP patient is an assist                       |

Three agreed starts in Banksia Rise waited for an early-morning worker: a capacity question, which links to "Is this suburb ready for growth?".

**The return visit** (20 November):

- Funding arrives for some of the GP's waiting patients, and the early-morning worker is approved.
- The GP's April–June cohort reaches 6/12, at 18 h / 6 = 3 h per start; 4 starts are old enough for 90 days.
- October's GP enquiries arrive further along (3 of 4 allocated) after the stage explainer: an early signal, under 90 days old, **too early to rank**.

## The learner's path

1. **Three relationships.** Maya, the situation and the three relationships with **enquiry counts only**.
2. **Make a prediction.** Which relationship produced the most useful growth. It's locked once made and never marked.
3. **The stage cards.** Eight introductions as they arrived, sorted by the stage at first contact. Then each relationship's stage mix, in a table.
4. **The cohort funnel.**
   - Choose one source at a time (buttons; a phone shows one source with no tiny targets) to see its funnel, open and closed reasons, and stage-matched first services.
   - Filter by cohort month, stage at first contact and service area.
   - A table compares every source with numerators and denominators.
   - The calendar-month trap, worked out, then the denominator question.
5. **Time to start.**
   - Ava's optional question: _"What happened between the introduction and the first visit?"_
   - The distribution, the before-and-after-allocation table, and the open enquiries with their ages and who owns each wait. Then a question on reading them.
   - The older person's voice at one handoff (she chose the provider her daughter already uses), and a question on what Maya does.
6. **Effort and continuity.** Add relationship and onboarding effort; review who is active at 90 days, with the mature denominator and exits by reason.
7. **Choose the next move.**
   - The compact comparison, with any "too early to rank" and stage-mix warnings, and the prediction beside it.
   - A revised reading, one data point that could change it, one relationship action, one operational step and a conclusion.
   - Misconceptions offered include:
     - "June's starts over June's enquiries";
     - "the people waiting for funding are lost";
     - "count agreements, they're as good as starts";
     - "the GP sends the most, so it's best";
     - "the hospital's onboarding is wasted".
8. **Return visit.**
   - The same cohort later, and the newer October cohort, with what changed.
   - A question on what it shows.
   - The learner may try a different relationship action; the first answer is kept for the feedback.
9. **Relationship Review** (the debrief).
   - What happened next, the rubric and critical flags.
   - Each card beside its stage, and the prediction.
   - The case, the Local Referral Studio placeholder, the links, and a printable learning Relationship Review.

The server enforces the order:

- the cards open only after the prediction;
- the debrief comes only once all of these are done:
  - every card is sorted;
  - a funnel, the timing, effort and continuity are opened;
  - the denominator, timing and handoff questions are answered;
  - the revised reading, data point, both actions and the conclusion are chosen;
  - the return visit is answered.

**Rubric** (`referral-rubric-1`), each 0–3:

- **consistent cohort and denominator**;
- **correct pathway stage**: the card sorts against the stage at first contact;
- **open and delayed records**;
- **effort and case-mix context**;
- **participant choice**;
- **a sensible next action**: the changed action counts if one is tried after the return visit.

It never scores the number of introductions or pressure to convert. **Critical flags** stand above any total:

- dividing one period's starts by another period's enquiries;
- counting a person waiting for funding as lost;
- treating an agreement as a delivered service;
- judging a relationship by its enquiry count alone;
- assuming a funding stage from who referred (raised by the card sorts too);
- pressing a person to choose or start against their decision;
- blaming a referrer for a government wait or a capacity gap;
- ranking a sample too small or too young;
- treating necessary onboarding as wasted effort;
- promising a funding place or immediate service because of who referred.

"Look again" starts a fresh attempt. Every attempt, first and revised, is kept.

## Review my relationships

- **Who sees it.** The tab appears only for the business owner and members they've authorised, using `plannerAccess`. The article is complete without it, and nothing in the score needs it.
- **Starting.** It starts **blank**: one cohort row with today's month, a 90-day comparison age and observation point, and no ranking threshold. It never starts with the story's figures.
- **What it asks for.**
  - A **source-by-enquiry-month grid**: counts, never individual rows (the server forces this, whatever is sent).
  - Each row has:
    - the source, month, an optional area and an optional private label ("GP practice A");
    - the stage mix (unknown included);
    - progress, the same cohort at every step: introductions, suitable pathway, agreements, first services, still open, closed, and broad closed reasons;
    - first services by stage at first contact (or "unknown");
    - the timing bands;
    - starts old enough for the observation point, still active, and exit reasons;
    - effort: relationship parts and onboarding, each a number or "unknown"; direct costs only if chosen; whether the time was observed;
    - data quality: manual or checked against the CRM or Portal, the extraction date, and possible duplicates.
  - Never a person's name, a practice's or hospital's name, or clinical information. The page says live referral and consent records stay in the CRM or Portal, and to combine months if a row has only one or two people.
- **What it shows.** The same comparison, explorer (funnel, timing, effort, continuity, each one source at a time with a table) and warnings as the story.
- **Saving.**
  - Unsaved entries stay in the page only, never in browser storage.
  - Save creates a new numbered version, and nothing is overwritten.
  - Blanks and unknowns are saved as they are.
- **The Relationship Review** holds:
  - the cohorts reviewed;
  - the key figures (computed);
  - evidence and unknowns;
  - one relationship action and its owner;
  - one operational action, if needed, and its owner;
  - where the action leads: the Local Referral Studio placeholder, "Is this suburb ready for growth?" or "Can we take on the next 10 clients?";
  - a review date and notes.

  It prints alone. The article never sends a message.

- **Coming back.** A later version shows what changed since the version before, and last time's planned actions with "Did it change what happened to the next cohort?".
- **Access checks.** Every read and write is checked on the server: the person must have access, and the review must belong to their own business. Anyone else gets 403 or 404, whatever id they try: a member without access, the author/superadmin, or the owner of another business. Tests cover each.

## Telemetry

Events go to `magazine_events`:

- `referral_started`
- `prediction_submitted` (the initial source choice)
- `stage_classified` (with whether it matched)
- `funnel_opened`, `view_opened`, `filter_used`
- `denominator_answered`, `timing_answered`, `choice_answered` (with whether the answer was flagged: the denominator error)
- `decision_submitted` (the revised reading and the actions)
- `followup_answered` (with whether the action changed)
- `referral_completed`
- `retry_started`
- `review_printed`
- `review_saved`, `review_returned` (private review creation and return, from an article: the version number only)

They carry ids, fictional choices, matches, flags, rubric levels and the block, story, model and rubric versions only: no typed words, no counts, no source labels and no notes.

Authors get totals from `GET /api/magazine/[id]/referral?stats=1`:

- each person's first finished attempt counts;
- the totals include the predictions, revised readings, actions, misread cards and how many tried another action;
- under 5 people, only counts are shown;
- private reviews are never included.

## Publishing

`referralHardProblems` blocks publishing (and "Publish anyway") until:

- the case check passes:
  - the enquiries validate, before and after the return visit, and the case uses de-identified rows;
  - at least two relationships have enquiries in the period, and they differ in starting stage or someone waits for funding;
  - some starts are old enough for continuity;
  - the cards name real enquiries, have text and feedback, and span at least three stages;
  - there's the older person's voice, a return visit and a Studio next step;
  - each question and choice list has at least one strong, unflagged answer;
- the sign-off is recorded:
  - the owner;
  - the referral pathway owner and the intake owner (stage and event definitions);
  - Partnerships (relationship language);
  - Care Partner Operations;
  - Quality (urgent handoffs);
  - privacy (private mode);
  - the pilot group;
  - the approval date (the effective date is recorded beside it);
- any review-by date hasn't passed.

The demo article ships with the sign-off empty.

The editor also records the **AI selection rationale** (PRD section 10) with the story version:

- the verified problem and its owner;
- the audience and target behaviour;
- why a cohort calculator fits;
- related content to reuse;
- a non-learning process cause to investigate;
- the linked scored results and operational data.

The author accepts, edits or rejects it.

## Not yet

- **The Local Referral Studio Work Tool** doesn't exist in this repo. Each of these is a clearly labelled placeholder, or not built:
  - **The handoff to its pitch practice, stage explainer and one-pager.** The block's `studio` field shows "Next step: Local Referral Studio: pitch practice and the approved one-pager (Work Tools) · placeholder" in the debrief and the Relationship Review. Relationship actions carry `next: "studio"`, shown as "(placeholder: not in the Hub yet)". There's no link.
  - **The shared stage model and claim register.** The stage model lives here as `referral-stages-1` until the Studio owns it. There's no claim register: the block's wording is reviewed through its own sign-off.
- **Links back from the sibling articles.** This block links to "Is this suburb ready for growth?" and "Can we take on the next 10 clients?", but nothing links back. That needs a link in their cases or articles.
- **Favourites:** pinning a Relationship Review. The `favourites` kind check would need a new kind and a table rebuild, as for the sibling calculators.
- **Integrations:** read-only CRM or Portal data (opaque ids, exact dates, deduplication), which needs a data contract, consent and authority checks, and the intake and Portal owners to define the authoritative "first service" event. Today the private mode is manual aggregate cohorts only. Excel export and detailed effort attribution wait for the same.
- **Cross-business reporting and small-cell suppression.** There's no organisational dashboard; the authors' totals cover learning only, suppressed under 5 people.
- **AI explanation and the AI Learning Designer:** no AI paraphrase of results is built, and the designer has no recommendation record; the rationale lives on the block.
- **Review:** the case's dates, stages, hours and the 90-day and 5-enquiry rules are illustrative. The referral pathway and intake owners, Partnerships and Quality should check them, and set real rules before anyone uses Review my relationships for decisions.
