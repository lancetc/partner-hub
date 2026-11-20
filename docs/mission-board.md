# First 30 Days Mission Board

Built from the PRD *First 30 Days Mission Board* (20 November 2026). This note records how v1 works, the decisions made, and what is left. It covers the PRD's build steps 1 to 3 and most of step 4: the case and its dates, the board, decision points with recovery, the participant view, the statement logic, the close-the-loop step, the debrief, and the authoring and sign-off gate.

In the Magazine editor: **Add a block → Simulate → First 30 Days Mission Board**.

## What it is

A Magazine block where a learner manages the start of a made-up participant's care for 30 days. It's practice for starting someone's care, not a learner-account onboarding module. It teaches sequencing, decisions and communication: what needs to happen next, who owns it, what the participant knows, and what to do when a promise slips.

It's a training record only. Nothing in it rosters a worker, starts care, issues a statement or contacts anyone, and the block says so at the top.

## What the learner sees

- **The participant**: who they are, who may be involved with their consent, the care model (Self Managed or Fully Coordinated, with who sources workers under each), and the learner's role (Care Partner or Care Coordinator).
- **The funding allocation clock**: allocated on its own date, 56 days to have an agreement in place and services started, and the 28-day extension the participant can ask My Aged Care for. It always says that this isn't a notice period: a participant can change provider for any reason, Trilogy Care doesn't require notice, and nobody can be charged an exit amount.
- **The first monthly statement**: the month it covers, its due date (the last day of the next month), and when it's issued in this case. If that's after Day 30, the card says the walkthrough stays open past the end of the case and that a sample isn't the statement. A month with no services still has a statement.
- **A row of dates** for the case's decision points and the close.
- **The board**: tasks in To plan, Waiting on someone, Ready, At risk and Done. Each card shows its owner, its target date and whether that's a government rule, a Trilogy Care target or a date made up for the case, what it comes after, and what it needs. Cards can be dragged between columns, but every move also has a button: a status menu, and up and down buttons for order. A "List by date" view shows the same tasks in date order.
- **What the participant knows**: a separate view showing only what they've actually been told, by the choices made and the words the learner wrote, plus promises not yet kept.

## How a case runs

1. **At each decision point** the learner reads the facts and chooses what they'd do (any number of choices). At some points they also write what they'd say.
2. **A choice marked unsafe or misleading**, or a decision with nothing that's needed, sends them back to look again, with the reason. What they should have chosen isn't given away. The first try is kept on the record.
3. **Once a decision stands**, they see feedback on each choice, anything needed they missed, the made-up consequence of a choice that delays, and four plain statuses: Service readiness, Promises (made, kept, open), Participant informed, and Outstanding risk. Where they wrote a message, they then see an example and a short checklist of what a good message does. Their message isn't marked.
4. **Moving on** to the next point checks the board. A point can have a start gate: Day 7 can't be reached until the agreement and care plan, and the first-week provider, are marked Done.
5. **The board won't mark a task Done** before the tasks it comes after, or before the day it can happen (the real statement walkthrough). A stopped move counts towards the sequencing reading.
6. **Closing the loop**: everything still open, tasks and promises, needs an owner and a date or to be marked resolved, and the next check-in needs a date. An honest "still open, owned, dated" is a good answer.

Work is saved as they go.

## The debrief

- **Five readings in words**: Sequencing, Safe start, Participant choice and consent, Service recovery, and Explaining the budget and statement. Each is "Strong", "Partly there" or "Worth another look", with notes (a needed choice not made, an unsafe first choice that had to be undone, moves the board stopped, how many promises were kept).
- **What happened**, day by day: what they chose, what they chose first if they changed course, what was also needed, the four statuses as they stood that day, their message and the example.
- **Try this moment again** on any day where they changed course or missed something. The retry gets feedback; the record stays as it was.
- **Promises made and kept**, what's still open after Day 30 with its owner and date, the first statement's real dates, and a reviewer's example of a well-closed loop.

**Nothing scores whether the participant stays.** The debrief says so. There is no churn or retention figure anywhere, including the author totals.

A weighted total is kept with each attempt for future reporting. Learners aren't shown it.

## What keeps it honest

- **What marks a choice right stays on the server.** The learner's page gets the facts, the board and the choices' wording. What each choice is worth, its feedback, what the participant hears, the promise it makes, the example messages and the example close are stripped before the course reaches a reader. The server sends what the participant has been told and the promises made, worked out from the full case, after each decision.
- **The rules run in one place** (`src/lib/mission.ts`), shared by the server, the learner's page and the editor's preview. The server re-checks every board move it saves.
- **An attempt records which version of the case it was read against.** A revised case doesn't change a finished attempt.
- **A learner's choices and words are theirs.** Authors can get totals per course (how many finished, how often people changed course, how often the board stopped a move, promises kept and handed on) and never the words.

## Sign-off, and the check that can't be waived

Every case has a **Source and sign-off** section: the policy source and its version, the Care Operations owner, the Supplier Compliance reviewer (worker checks), the Finance reviewer (budget and statement), the Quality or policy reviewer (regulated wording), and the date.

**A course with a Mission Board can't be published until all of those are recorded.** Like Spot the Signal, this is checked separately from the usual publish checks, so **"Publish anyway" does not get past it**.

Publishing is also blocked (the ordinary way) if the dates are out of order, there are fewer than 3 tasks, the tasks' dependencies loop, a decision point has fewer than 3 choices or none that's needed, or the first statement's issue day falls outside the month after Day 0.

## The two starter cases

Both are **fictional drafts with no sign-off recorded**, so neither can be published as it stands.

| Case | What it tests |
|---|---|
| **Mrs Lin: Self Managed** (Care Partner) | The PRD's worked pilot. Funding, choice and referral all on Day 0. A verified provider starts shopping support on Day 7 while her preferred cleaner Lena's checks stall. Day 14 is the PRD's four branches plus two more. Her son may help with scheduling but not see her finances. Her first statement is issued on Day 38, after the case ends. |
| **Mr Haddad: Fully Coordinated** (Care Coordinator) | Funding allocated six days before the referral is accepted. He's away until Day 35, so his first service and safe-start check fall after Day 30. The coordinator gathers what the Care Partner needs rather than setting the budget. He prefers a male worker. His November statement shows no services and still comes, on Day 28. |

**The scripts, dates and answers are mine, drawn from the PRD, and need checking before anyone signs them off.** In particular:
- whether the Day 0 welcome call in Mr Haddad's case meets the care-management activity definition (the case says it does and records it);
- the wording about the pending-check route for new workers (Supplier Compliance should confirm it matches the SOP);
- whether "Trilogy Care doesn't require a notice period" is still current (it's in the clock's note on every case, from `src/lib/mission.ts`).

## For authors

A case has: a title and introduction; the participant, their consent, care model and the learner's role; three dates (funding allocated, provider chosen, referral accepted), the day of the first planned service and the day the first statement is issued; the board's tasks (owner, what it needs, what it comes after, a target counted from one of the anchors and labelled by kind, a "not before" day, a starting status); the decision points (day, facts, tasks they put at risk, tasks that must be done first, and the choices: what each is worth, which reading it shows, feedback, consequence, what the participant hears, a promise it makes or an earlier one it keeps, its effect on the statuses and on the board); an optional message with its checklist and example; the example close; source and sign-off.

Participant names are always made up.

## What isn't built

- **A screen for the author totals.** They're available at `/api/magazine/<course>/mission?stats=1`.
- **A departure branch** (the participant decides to leave). The case doesn't include one; the debrief's wording about leaving is there, and an author can add a decision point for it.
- **Role-specific views of the same case.** The role is set per case; there's no single case that changes with the viewer's role, and no external-partner variant.
- **Marking the written message.** It's compared with the example by the learner, not by a model.
- **AI-drafted cases**, uploaded reference material, policy-change flags on cases, and links to the SaH Journey timeline, While You Wait calculator, Contractor Vetting Auditor and Budget & Co-Contribution Sandbox (none of those blocks exist in the Hub yet).
- **Assessment mode** beyond the publish gate: finishing counts towards the course like any other activity, and that's all.

## What was checked, and what wasn't

Checked in the browser as Jordan on a throwaway course (now archived, with its attempts removed):
- the Mrs Lin case end to end: an unsafe Day 0 choice sent back;
- the board refusing a Done that skipped a dependency;
- the Day 7 gate holding until the arrangement was marked done;
- Lena's task moving to At risk on Day 14;
- a bad first try at Day 14 sent back, then the example message and checklist;
- the participant view;
- the close step refusing gaps, then the debrief with per-day statuses;
- a redo that left the record alone;
- no sideways scrolling at phone width;
- the editor's sections and the palette entry.

Not checked: Mr Haddad's case in the browser (it's covered by tests); the editor's preview mode; editing a case field by field; dragging cards with a real mouse (the drop handler wasn't exercised); a screen reader (structure only: labelled groups, headings, live regions, focus moving to the new day).

## Where the code is

| | |
|---|---|
| `src/lib/mission.ts` | The case's shape, the parser, what readers are sent, dates, the board rules, decisions, scoring, the debrief |
| `src/content/missionCases.ts` | The two starter cases |
| `src/server/mission.ts` | Attempts, saving, decisions, moving on, closing, redo, totals |
| `src/app/api/magazine/[id]/mission/route.ts` | The route |
| `src/components/magazine/MissionBoard.tsx` | What learners see |
| `src/components/admin/MagazineMissionEdit.tsx` | The editor |
| `src/server/magazine.ts` | The sign-off gate (`publishGuide`) and stripping answers (`withoutScenes`) |
| `src/server/mission.test.ts` | Tests |
