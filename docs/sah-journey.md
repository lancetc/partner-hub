# The SaH Journey

A Magazine block (type `journey`) that steps through one fictional Support at Home journey from four points of view: the older person, a family member, the Trilogy Care Coordinator and an independent provider. At two moments the learner decides what to do, and sees how the decision lands for each person.

It's practice. Nothing in it contacts anyone, books anything, refers anyone or reads a real record, and it never gives a wait estimate.

## What it is

- **The scrubber.** Seven milestones in order: application or referral, assessment, support plan and Notice of Decision, the Priority System wait, the funding allocation letter, the first service, and a review. Each shows its fictional story time ("Week 1", "Month 3") with the note **"Fictional case timeline — not an estimate of your wait"** beside it.
- **Four lanes.** At each milestone, one row per person shows what they know. Opening a person's view shows what they know, what matters to them, what they can do now, what they're waiting for, a line in their own words, and **"Who can see this?"**. Every person has a view at every milestone, even when it's "nothing yet".
- **Compare two perspectives.** Any two views side by side on a wide screen, one after the other on a phone.
- **About this point.** What's confirmed and what isn't, a common misunderstanding, who's responsible, and the source.
- **Decision points.** The story pauses at Month 3 (a reported fall while waiting) and Month 5 (funding is allocated, getting ready to start).

Approval, the Notice of Decision, the Priority System, funding allocation and starting services stay separate steps throughout. Nothing calls an allocation a "package assignment", and no story time is a promise.

## How it runs

1. The learner moves along the scrubber by clicking a milestone, using the arrow keys (and Home and End) on it, or the Previous and Next buttons. Going back is always open. Moving past a decision point waits until it's decided.
2. At each milestone they open each person's view. A milestone counts as explored once all four views are open, and the scrubber shows "Explored N of 7".
3. At a decision point, the facts come in layers:
   - what's known;
   - then **What would you check?**;
   - then **Plan your response**: actions grouped by area (each saying who'd do it), and one thing to say to the person or family member.
4. **Feedback, in words:**
   - **"This plan stands"**, or **"Look again: part of this plan needs a debrief"**;
   - each choice that needs a debrief, and why;
   - what's missing, area by area;
   - for each sound choice, what it does and what happens in the story;
   - how each part of the story is affected (safety, Arthur's choice and privacy, status accuracy, family understanding, provider readiness, follow-up ownership);
   - once the plan stands, the reviewed response.
5. **Trying again** reopens the plan with the last try filled in. Every try is kept, and the first is never erased.
6. **"See the whole journey"** (at the last milestone) finishes once every view at the core milestones is open and both decisions stand. If anything's left, it says what. The debrief shows:
   - a map of what each person knew and was waiting for at each milestone;
   - each part of the story rated "Strong", "Partly there" or "Worth another look", with notes when a first try needed a debrief;
   - each decision's first and last try, with the reviewed response.
7. Where the learner is and which views they've opened save as they go, so they come back to the same milestone. Decisions save only through a try.

Nothing animates, and nothing is timed. Focus moves to an opened view, to each layer of a decision as it's revealed, and to the feedback.

## What keeps it honest

- **A promise can't succeed.** A plan stands only when nothing in it needs a debrief, and that includes what's said. Telling Chloe "his funding will definitely start next month", or Arthur "your services start Monday: it's all confirmed", means looking again.
- **Safety comes first and separately.** In the fall branch, the immediate safety check is its own area, apart from recording the change and a Support Plan Review, interim supports, and communication. "Chloe says it was minor, so no check is needed" needs a debrief.
- **Interim options stay conditional.** Checking CHSP and checking whether SaH interim funding has been allocated are separate checks. "Tell them CHSP is automatically available", "ask for Arthur to be moved up the queue" and "book the contractor now and backdate the payment" each need a debrief.
- **Onboarding involves Arthur.** The handover to the Care Partner (who builds the care plan and individualised budget with Arthur) is needed. Leaving the plan to Chloe, or confirming the provider's recurring roster before the agreement and care plan, each need a debrief.
- **The answers aren't sent to learners.** Their copy of the block has no roles, feedback, consequences, gaps, good-response flags or reviewed responses. Feedback comes from the server, and only for a try they've made.
- **Changed guidance is never silently applied.** Each attempt keeps a hash of the decision keys. If an author changes them, a learner with an attempt in progress is told, and their earlier tries are read against the current guidance.
- **Author totals are counts.** For each decision point: how many tries, how many stood, how many had something needing a debrief. Plus how many finished. No names, and none of the learner's choices.

## Sign-off, and the check that can't be waived

A course with this block can't be published until the block records:

- the content owner;
- the Care Operations, Clinical (the fall branch), Quality or policy, Privacy (family and provider access) and Communications reviewers;
- the sign-off date;
- the source and its version.

"Publish anyway" doesn't cover this.

## The starter journey

`src/content/journeyCases.ts` holds Arthur's journey, drafted from the PRD's storyboard:

- **Arthur**, 82, who wants to keep making his own decisions;
- **Chloe**, his daughter, who Arthur has agreed can help with calls and get general updates (detailed health and financial information needs his say-so);
- **a Trilogy Care Coordinator**;
- **an independent provider**, who needs a confirmed scope and start before committing a roster.

It has no sign-off. The pathway labels, the fall branch and its escalation wording, the CHSP and interim funding conditions, Chloe's access and every line of family-facing copy are drafts until the reviewers have checked them.

## For authors

- **The journey:** title, introduction, the time note, the four people (names and a line about each), and what the family member may be told.
- **Each milestone,** which can be reordered:
  - label, story time and status;
  - what it means, what's confirmed, what's not known yet, a misconception to prevent, who's responsible, and a source with its link;
  - whether learners must open all four views there before finishing;
  - each person's view: what they know, what matters, what they can do, what they're waiting for, a line in their words, and who can see it.
- **Each decision point:**
  - its title and the milestone it happens at;
  - what's known and what to check;
  - areas, each with what's missing if nothing needed is chosen;
  - options, each with who'd do it, its role ("Needed here", "Helpful", "Not enough on its own", "A path to debrief"), the part of the story it affects, its feedback and what happens in the story;
  - things to say, each marked good or not, with feedback;
  - the reviewed response.
- **Source and sign-off.**

Each area needs an option that's needed, each decision point needs a path to debrief and a good response, and every milestone needs all four views.

## What isn't built

- **More decision points.** The PRD's Notice of Decision and care plan meeting moments are in the story as milestones, not as decisions. The block allows up to four.
- **Other pathways** (an existing CHSP participant, a reassessment), and branching where a decision changes later milestones. A decision changes the feedback and the story's consequences, not which milestones follow.
- **SOP IDs, effective and next-review dates,** and the staged review workflow. Sign-off records the reviewers and a date.
- **Flagging for review when a source changes.** Attempts keep a hash of the decision keys, not the source version.
- **A scored-course mode** that requires no critical errors after retry. This is practice.
- **Learners' written rationale.** Decisions are choices, not free text.
- **Links to related blocks** (SOP-to-Playbook, Myth vs Reality, the Budget Sandbox, Pass the Baton).
- **Persona tabs on a phone.** On a phone the four people's views stack under each other, one milestone at a time.
- **A screen for author totals.** They're only available through the API (`?stats=1`).

## What was checked, and what wasn't

- **In the browser** (as Jordan, on a throwaway course that's now archived, with its attempts, events and progress removed):
  - adding the block in the editor, with the starter journey and the sign-off warning;
  - publishing refused without sign-off, even with "Publish anyway", and going through once it was recorded;
  - the learner's page carrying none of the decision keys, feedback or reviewed responses;
  - the scrubber, time note, lanes and an opened view, with views autosaving;
  - the fall decision's layers, a try with "it was minor" and a promised date needing a debrief (with focus on the feedback), then the reviewed plan standing with its consequences and reviewed response;
  - the onboarding decision (through the API) needing a debrief with the roster and "starts Monday", then standing;
  - finishing refused with what's left, then the debrief's map, ratings and first and last tries;
  - starting again;
  - author totals;
  - the editor's preview: a decision worked out in the page, with nothing sent;
  - no sideways scrolling at phone width.
- **Not checked:**
  - Arrow keys on the scrubber, and comparing two views, with a real keyboard and mouse.
  - Editing milestones and decision points in the editor.
  - A real screen reader.

## Where the code is

| | |
|---|---|
| `src/lib/journey.ts` | The people, milestones, decision points, the parser, what readers are sent, trying a decision, finishing, ratings and the debrief |
| `src/content/journeyCases.ts` | Arthur's journey (a draft) |
| `src/server/journey.ts` | Attempts, saving, tries, finishing, starting again, totals |
| `src/app/api/magazine/[id]/journey/route.ts` | The route |
| `src/components/magazine/SahJourney.tsx` | What learners see |
| `src/components/admin/MagazineJourneyEdit.tsx` | The editor |
| `src/server/magazine.ts` | The sign-off gate (`publishGuide`) and stripping answers (`withoutScenes`) |
| `src/server/journey.test.ts` | Tests |
