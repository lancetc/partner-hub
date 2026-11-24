# Contractor Network Builder and Quality Scorecard

From the PRD “Partner Hub: Contractor Network Builder and Quality Scorecard” (21 November 2026). This release is the PRD's phase 1 vertical slice plus a Work Tool shell:

1. **Build Your Local Bench**, a fictional Magazine block (`network`), end to end: the North Brisbane early-morning gap, learner flow, server attempts, author editor, publish gates, author totals, the decision-register sheet and a seeded demo draft.
2. **The Contractor Network Builder Work Tool** (`/tools/network-builder`), a role-restricted shell over **demo data only**. It reads no real participant, contractor, onboarding, scheduling, rate or quality record, and won't until Trilogy Care approves those data sources (the page and `DATA_SOURCES` say so, source by source).

Interest is not approval, and approval is not availability. Nothing here approves a contractor, checks a real register, sends a message, books a service or changes a supplier record. No AI is called: AI drafting is a disabled stub (`ai.drafting: false`).

## What it reuses (and doesn't duplicate)

| Need                              | Reused from                                                                                                      | How                                                                                                                                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demand, supply and coverage       | Local Coverage Comparison (`coverage`, `src/lib/suburbCoverage.ts`, `network-taxonomy-1`, docs/suburb-growth.md) | A need slot is a `DemandCell`, a contractor is a `SupplyRow`, and `calculate` decides what counts. Its supply states are the pipeline's first five. Interest, evidence and verification are never capacity; stale availability isn't either. |
| Evidence and screening states     | Contractor Vetting Card (`auditor`, `src/lib/auditorVetting.ts`, docs/document-auditor.md)                       | Each card's evidence is the Vetting Card's `Axes` with its `FIELD_STATES`; `vettingOutcome` decides whether every required check is resolved. An ABN and an insurance certificate can never make a card approved.                            |
| Service reliability after a gap   | Service Reliability Calculator (`reliability`)                                                                   | Linked from the debrief and the outreach kit (“What does a missed service cost?”), not copied.                                                                                                                                               |
| The outreach kit's checking steps | Job Aid “Choosing and Checking Your Contractor” (`src/content/playbooks.ts`)                                     | Placed by reference with `AidSection` in the outreach step, the debrief and the Work Tool, with its Save to Favourites. `playbooks.ts` is unchanged.                                                                                         |
| Role restriction                  | `plannerAccess` (`src/server/caseloadPlanner.ts`)                                                                | The Work Tool's every read and write. Anyone else gets `{ access: null, notice }` and nothing more.                                                                                                                                          |
| Block pattern                     | 72-Hour Discharge Pivot (`discharge`, `src/lib/dischargePivot.ts`)                                               | Frozen attempts, a pure engine replayed on the server and in the editor's preview, readers' copy, idempotent moves, retry variations, suppressed totals, register sheet.                                                                     |
| The recurring character           | Priya Raman (already in the character library, from `src/content/growthCases.ts`)                                | No new named person: participants are “Participant 1–3”, workers “Worker A” etc., so publishing queues no portrait.                                                                                                                          |

## The pipeline

`candidate → contacted / interested → evidence in progress → provider verification → provider approved for scope → availability confirmed → booked / active`, with **paused**, **restricted by authorised owner** and **expired** as holds beside the stages (`src/lib/networkBench.ts`, `canAdvance`).

- One stage at a time; a stage can't be skipped.
- Only the stage's owner moves a card into it: the Care Partner records interest, opens the role checklist and submits to onboarding; the provider's authorised onboarding owner approves; the provider's scheduling confirms availability and bookings.
- Into verification: every core item (`CORE_EVIDENCE`) has been sent and nothing is a correctable gap. Into approval: every required Vetting Card check resolved, a named scope and a current end date. Into availability: a recent, dated confirmation.
- Stale availability (older than the owner's freshness rule) shows as “approved, availability unconfirmed”; the approval itself is untouched.

## The quality scorecard

Six dimensions (reliability, service fit, experience and communication, billing accuracy, safety and quality follow-up, continuity). Each metric shows its numerator, denominator, period, source, last review and what's missing or excluded (participant-requested cancellations aren't counted against the worker). There is **no total, average or star rating** anywhere. Under five observations (`SMALL_N`), no rate is shown: “limited evidence”, which isn't a poor rating. Statuses can coexist: current and observed, limited evidence, review due, quality action open, restricted by authorised owner, unavailable, expired check. A provider-owned restriction reaches a Care Partner only as its neutral reason and next step; `qualityDetail` never leaves the server.

## The fictional block: Build Your Local Bench

Case: `src/content/networkCases.ts` (`north-brisbane-morning-1`). The PRD named two real suburbs; the case uses two invented ones in North Brisbane (Paperbark Rise, Lilly Pilly Heights) so no figure reads as a claim about a real place.

- 18 h a week of personal care before 9 am, 6 booked: **12 unfilled**, and **no ready capacity**: Workers A and B are approved but free after 10 am, Worker C says “I can start Monday” with checks unverified, Worker P is Participant 3's chosen worker who has just called, and Gardener G is approved, free early, and a gardener. The map's headline (“Five contractors nearby”) is true and misleading.
- Decisions: diagnose (measure, four figures, who counts as ready), protect the people waiting, respect the chosen worker, screen Worker C's offer, draft a brief from the reviewed template, see the reveal three weeks on (Worker C approved for 4 h in one suburb; Worker E approved for 6 h but won't travel; Worker P in verification: **4 h remain**), plan the rest, then review Worker C's scorecard.
- Branches (retry variations and the editor's preview): the chosen worker approved; the chosen arrangement can't proceed; stale availability; no suitable supplier; a quality concern with a provider restriction.
- Rubric: seven dimensions, 0–3 each (gap diagnosis, supply reasoning, participant choice and honesty, provider safeguards, outreach precision, quality judgement, follow-through). Critical flags (an unverified start, readiness from a claim, an ignored choice, a promised start, out-of-scope cover, participant details in outreach, a hidden restriction, a public blacklist) make the ending “unsafe” and prevent a pass, whatever the total. Valid endings: phased start, central supply support, the chosen worker approved, the arrangement can't proceed (explained). “Fill the map green” is never valid.
- Order on the server: a card opened and a diagnosis before any decision; the brief before the reveal; the reveal before planning the rest; the scorecard last. The model's coverage result is sent only after the learner's own diagnosis; feedback, levels, codes and endings only in the debrief.
- Events (`magazine_events`, all marked `fictional: true`): `network_builder_opened`, `candidate_card_opened`, `gap_reviewed`, `decision_made`, `participant_choice_branch_selected`, `contingency_selected`, `outreach_draft_generated`/`_edited`, `outreach_draft_copied` (with `sent: false`), `onboarding_checklist_opened`, `readiness_status_viewed`, `quality_evidence_reviewed`, `response_submitted`, `feedback_viewed`, `activity_completed`, `retry_started`. Never the outreach text or any typed words.
- Publishing: `caseProblems` runs before the demo sign-off wrapper (a case that contradicts itself is never published); `benchSignOffProblems` runs inside it (owner, Operations, supplier onboarding, Quality/screening, Partnerships, Finance, privacy and learning reviewer, the scenario version reviewed, reviewed checklist profiles and an approved outreach template).
- Authors: totals at `/api/magazine/[id]/network?stats=1`; the Problem Desk register's “Network Builder” sheet. Fewer than five people: counts only.

Demo draft: “Build your local bench: who can be there at 7 am?” in `src/content/magazineDemos.ts` (key `network-bench`), with every sign-off empty.

## The Work Tool shell

`/tools/network-builder` (`src/server/networkTool.ts`, `src/content/networkDemo.ts`, `/api/tools/network`). Four views: coverage (Local Coverage's model and table), pipeline (the Care Partner's own moves only; the provider's stages shown locked, with their owner), outreach kit (template, role checklist, Job Aid; copy never sends) and scorecards. A board saves privately to the business as numbered versions; a save carries a key, so a retry never saves twice, and an unchanged board makes no new version. The Work Tools page shows its card only to people with planner access.

Demo data deliberately includes a worker free in two areas at once (counted once), stale availability, an expired check, a provider restriction and pipeline cards that never change coverage.

## Not built yet (PRD phases 2 and 3)

- Admin scenario builder beyond the block editor's JSON fields; claim/source register and versioned requirement-profile configuration; outreach template approval workflow.
- The private **manual aggregate** planning inside the Work Tool (Local Coverage's “Plan my local area” already does this for coverage) and pinning the tool to Favourites/dashboard.
- Aggregate admin dashboard and the Excel export with the PRD's nine sheets.
- Any real data connection (demand, scheduling, onboarding status, evidence expiry, rates, quality, referral forecasts), auto-matching, sending or onboarding write-back.
- A Topic card placement of the block by reference.

## Decisions Trilogy Care must confirm

See the PRD's section 20. In this build the defaults are: fictional practice and demo data only; no supplier approval in the Hub; profiles marked `needs owner review` where a value is missing; a fictional 14-day availability freshness rule; separate confirmed, being-arranged and forecast demand; draft-only outreach with no sending; restricted scorecard indicators with no single score; and price questions routed to the Vetting Card and the provider's process.
