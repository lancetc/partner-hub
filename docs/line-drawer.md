# Where Is the Line?

Built from the PRD *"Where Is the Line?" Self-Managed vs. Clinical Governance Line-Drawer* (20 November 2026). This note records how v1 works, the decisions made, and what is left.

In the Magazine editor: **Add a block → Practise → Where Is the Line?**

## What it is

A deck of self-managed Support at Home requests. For each card the learner chooses:

1. **A lane**:
   - **Participant's choice**: the person decides;
   - **Check and agree first**: something must be checked, assessed, quoted or agreed before a funded arrangement goes ahead;
   - **Cannot authorise as requested**: Trilogy Care can't authorise the funded service, worker or claim as asked, so explain and offer a safe, lawful route.
2. **The governing reason**, from three or four.
3. **A next action**, or what to say.

The mental model: support the person's decision, check what can be funded or arranged, and act on any safety duty.

**"Cannot authorise as requested" never means overruling an informed refusal or controlling how someone lives.** I used the PRD's preferred production wording for the lanes. Its conceptual names (Client's choice, Conditional, Provider veto) are kept for reports.

It's a practice activity. It can't approve funding, roster a worker, create an incident or contact anyone, and finishing it isn't clinical competence. The block says both.

## How it runs

- **Entry:** the short introduction, the three lanes with one-sentence definitions, and "Card 1 of 10 · no time limit".
- **The card:** the request in the person's words, the facts that decide it, and an optional "What do you know?" with more context and the funding context.
- **The lane:** three large buttons. On a wide screen the card can also be dragged onto a lane; dragging is never the only way.
- **Reason and action:** both appear once a lane is chosen. **"Check this card" stays off until all three are chosen**, and they can be changed until then.
- **Feedback,** in words, never by colour or a flash:
  - whether the lane, reason and action each match;
  - the resolved lane and the governing reason;
  - one sentence about the person's choice, and the next step;
  - **"See why"**, with the policy and nuance, other considerations, sources, SOP and escalation contact.

  An answer that needs a debrief (overruling the informed refusal, leaving falls without a response, an unchecked or unengaged worker doing funded work, removing a hobby without agreement) says so, and suggests talking it through with a team leader. It's never a public mark.
- **The line map:**
  - how many cards matched on lane, reason and action, each separately, and how many on all three;
  - a column per lane, showing what the learner placed there and how many the reviewed answers put there;
  - **patterns**: stricter than the facts call for (too many checks or vetoes), or looser (approving before checks);
  - the cards worth talking through;
  - **replay** of each missed card (the first answer stays on the record);
  - **the second pass** on cards with a new fact.

  Completion is counted when the line map is reached; mastery is reported separately.
- **Second pass:**
  - **The lift chair:** "Please charge it to my ordinary quarterly services budget" moves it from *Check and agree first* to *Cannot authorise as requested*.
  - **The gardener:** once he's engaged, checked and priced, it moves from *Check and agree first* to *Participant's choice*.

  The first answer is shown alongside.

## What keeps it honest

- **Answers stay on the server.** The learner's page gets the requests, facts, reasons and actions, but not the lane, accepted reasons and actions, feedback or debrief rules. A card's answer is sent only after its three choices are in.
- **The right lane with the wrong reason is caught.** Reason and action are scored on their own. On a "cannot authorise" card, a bare "Just say no" never gets full credit.
- **Only approved cards within their review date are served.** Cards still in draft, marked "needs review" or past their review date are held back, and the learner sees how many.
- **The order is fixed per attempt** when shuffling is on, so leaving and coming back keeps it.
- **Each attempt keeps a hash of the deck's answer keys**, so a changed key is never silently applied to a past attempt.
- **Authors see accuracy by card** (lane, reason, action, debriefs), how many attempts showed each pattern, and how many finished, at `/api/magazine/<course>/line?stats=1`. There's no leaderboard.

## Sign-off, and the check that can't be waived

Each **card** has:
- its approved sources (at least one);
- an internal SOP reference and an escalation contact;
- its Clinical or Quality approver;
- the policy's effective date and a review date;
- a status: draft, approved or needs review.

The **deck** has the content owner, the Care Partner, Clinical and Quality reviewers, the date, and the policy set and its version.

**A course with this block can't be published until every card is approved and the deck is signed off.** "Publish anyway" doesn't get past it.

The parser also checks that every card has its governing reason, at least one accepted action, its explanation and a source.

## The draft deck

The PRD's ten cards, in its order (shuffled for each learner):

| # | Request | Draft lane |
|---|---|---|
| 1 | Cleaner on Thursday instead of Tuesday | Participant's choice |
| 2 | "I don't want a nursing review" (two falls, no red flags) | Participant's choice, with the falls duty |
| 3 | Keep tending the roses | Participant's choice |
| 4 | The neighbour's 19-year-old son for gardening | Check and agree first |
| 5 | A $1,200 lift chair from a retailer | Check and agree first |
| 6 | Two more personal care visits | Check and agree first |
| 7 | Physio's new rate | Check and agree first |
| 8 | Gardener's insurance expired | Cannot authorise as requested |
| 9 | Ask the cleaner to clear the gutters | Cannot authorise as requested (the worker and task, not gutters) |
| 10 | Pay a neighbour cash, receipts later | Cannot authorise as requested |

**All ten are drafts.** They show in the editor and preview, but aren't served to learners and can't be published until Clinical and Quality sign off each answer against current policy. The reasons, distractors and actions are mine, drawn from the PRD's examples. The SOP references and escalation contacts are blank for Trilogy Care to fill in.

## For authors

- **The deck:** title, introduction (with a word count against the 80-word guide), who the learner is, and whether to shuffle.
- **Each card,** which can be reordered:
  - the request, facts, "what do you know" and funding context;
  - the reviewed lane;
  - reasons, with one governing and any others "also accepted" (for when a case genuinely supports two);
  - next actions, ticked right or not;
  - the sentence about the person's choice, the next step, "see why" and other considerations;
  - which lanes or actions need a debrief, and why;
  - the second-pass fact and its lane;
  - sources, SOP, escalation, approver, status, and the effective and review dates.

If a case could support more than one answer, add a deciding fact or accept more than one reason. Don't mark a defensible clinical judgement wrong because the case is underspecified.

## What isn't built

- **The canonical question pool.** Cards live in the block. The case record keeps the PRD's fields, so it can move to a shared pool later.
- **Assessed mode.** This is practice: an answer is revealed after each card.
- **AI drafting** from uploaded sources.
- **Flags when a source changes.** Review dates hold stale cards back; nothing yet watches sources.
- **The accessibility checker and a mobile preview switch** in the editor.
- **A screen for the author totals.** They're only available through the API.
- **Reporting by role or cohort.** Totals are by card.

## What was checked, and what wasn't

- **In the browser** (as Jordan, on a throwaway copy of the deck with every card approved, now archived with its attempts removed):
  - "Check this card" off until all three are chosen;
  - all ten cards answered, with feedback in words;
  - the informed-refusal veto raising its debrief;
  - the gutter card's right lane with the wrong reason caught;
  - the line map's counts and the over-control pattern;
  - the lift chair's second pass moving to "Cannot authorise as requested";
  - a missed card replayed;
  - author totals by card;
  - no console errors;
  - no sideways scrolling at phone width, with the lanes stacked.
- **Not checked:**
  - **The editor wasn't opened in the browser.** The pane was hidden by then.
  - **Focus moving to the reason step and the feedback.** The test pane doesn't run animation frames while it isn't painting; the code uses the same pattern as the other blocks.
  - Dragging a card with a real mouse.
  - A real screen reader.

## Where the code is

| | |
|---|---|
| `src/lib/line.ts` | Lanes, the case record, the parser, what readers are sent, serving rules, answering, replay, second pass, the line map |
| `src/content/lineCases.ts` | The ten draft cards |
| `src/server/line.ts` | Attempts, answering, finishing, replays and second pass, totals |
| `src/app/api/magazine/[id]/line/route.ts` | The route |
| `src/components/magazine/LineDrawer.tsx` | What learners see |
| `src/components/admin/MagazineLineEdit.tsx` | The editor |
| `src/server/magazine.ts` | The sign-off gate (`publishGuide`) and stripping answers (`withoutScenes`) |
| `src/server/line.test.ts` | Tests |
