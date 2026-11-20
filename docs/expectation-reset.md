# The Expectation Reset

Built from the PRD *"The Expectation Reset" Community-Powered Timeline Slider* (20 November 2026). This note records how v1 works, the decisions made, and what is left.

In the Magazine editor: **Add a block → Explore → Expectation Reset timeline**.

## What it is

A Magazine block for staying in useful contact with an older person and their family during an uncertain wait for funding. An illustrative story (Arthur, approved and waiting) has **"How I Kept Them Warm"** markers. Opening one shows where the story is, a reviewed check-in script, and up to three moderated peer approaches from the Community, each linking back to its post.

The behaviour it teaches is honest expectations plus helpful follow-up:
- keep the person informed and able to choose;
- look for changed needs;
- give the family a named next contact.

Nothing in it suggests a warmer relationship makes funding come sooner, or that anyone should be steered away from another provider. It's a learning resource. Nothing in it contacts anyone, schedules a call or records a follow-up.

## Two things the PRD assumed, and what v1 does instead

**The PRD assumes a "SaH Journey" with Arthur, and a Community with a moderated post store. Neither exists in the Hub as described.**

- **The Community** is a demonstration page. Its posts are content in `src/content/community.ts`, not a database. It had no moderation states, verified roles or reuse consent.
  - **What v1 does:** the peer approaches are real posts in that Community, in the Coordinators' lounge, so "View discussion" opens the same thread (`/community#post-<id>`).
  - Each post that can be reused carries the PRD's reuse details: verified role, the contributor's consent, approved for learning, stage, roles, review date, "When I used this", the script, the next step, and name-or-role attribution.
  - A new **moderation table** lets an author withdraw a post. It then disappears from the Community feed, the home page and every lesson that refers to it, at once, and can be put back. The post is never copied into the lesson.
- **The "SaH Journey"** in the Hub (`/journey`) is the client journey map: stages and the waits between them, with no Arthur and no months. **v1's block carries its own short illustrative story.** It has story points with fictional months, and markers sit at a point or between two. If a shared Arthur scenario is built later, the block's story can move to it.

## How it works

- **The story.** Story points in order, with "Earlier" and "Later" buttons (and each point clickable) to move through them. The current point is announced. Months are labelled "story month", never as estimates. The Month 4 marker sits **between** Month 3 and Month 5 without becoming a milestone.
- **Markers** are buttons labelled with the month, "How I Kept Them Warm", a subtitle and the theme. Opening one doesn't move the story.
- **The drawer.** On a wide screen it sits beside the story, which stays usable. On a narrower screen it's a full sheet: focus stays inside it, Escape closes it, and "Back to the story" returns focus to the marker. Nothing animates. It contains:
  1. **At this point in the story:** where Arthur is, what's known, what isn't, and what may have changed.
  2. **Try your line** (optional, set per marker): a private first take before the approaches appear. It can be skipped. Only the learner reads it back.
  3. **The reviewed approach,** badged with who reviewed it, the policy id and the approval date, with why it works. **Use this phrase** opens an editable copy, for the person or for the family member.
     - The family version is the script written to stay within what the person has agreed they can be told.
     - Copy stays off until the learner ticks: status checked, next contact agreed, and, for the family version, the person's information-sharing choice checked.
     - Copying sends and records nothing, and the panel says so. If the browser blocks copying, the text is selected instead.
     - A script past its review date (or never reviewed) shows **Under review** and can't be copied.
  4. **If something has changed or is urgent:** the approved escalation pathway for this marker. Never the Community.
  5. **From the Community:** up to three **Peer practice** cards. Each shows:
     - the name and role, or the role only, as the contributor chose;
     - "Verified role", and when it was posted;
     - "When I used this", the script and the next step;
     - its likes and replies in the Community, and its review date;
     - **View discussion**, **Save** and **Flag as out of date**.

     A post describing a free pre-onboarding chat says "Ask whether a pre-onboarding conversation is available", with no promise, unless the author has ticked that Trilogy Care approved the offer and entered its exact scope.
- **Saved phrases** collect at the foot of the block. Working through every marker counts as having done the block.

## Which posts can appear

A post shows for a marker only when **all** of these hold. The filtering happens on the server, on every load, with nothing cached:
- it's in the marker's list;
- it's approved for learning;
- the contributor has consented;
- their role is verified;
- it carries the marker's stage tag and is for one of its roles;
- it's within its review date;
- it isn't withdrawn in the Community.

Cards are ranked by a blend of helpfulness and recency, capped at the marker's maximum. **Votes can't make a post authoritative.** A heavily liked post without consent still doesn't appear, and peer cards never carry a "reviewed" or "policy" badge. The demo includes a post that fails the filter on purpose: "It'll almost certainly be next month", which has no reuse consent.

If no post qualifies, the drawer says "More peer approaches will appear here", or the author's own text. If the Community can't be reached, the reviewed script still teaches the lesson.

## Authors

The editor has:
- **The person and family:** the person, the family member and relationship, and what the family member may be told.
- **The story:** story points, each with a month, a label and what's happening.
- **Each marker:**
  - label, story month, subtitle and theme;
  - where it sits (at a point, or between two);
  - its stage tag and roles;
  - the story at that point, and the first-take question;
  - the reviewed scripts (to the person and to the family), why it works, reviewer, policy id, approval and review dates;
  - the urgent pathway, and whether learners can copy and save.
- **Posts:** a picker listing every Community post that has reuse details, with **why one won't show** (not approved, no consent, a different stage or role). Ticking or unticking a post never changes the post.
- **The offer and sign-off:** the free-chat approval and its scope, and the source and sign-off.

**The editor's preview can simulate the Community's states**: normal, none qualifying, a post withdrawn, the script past its review date, and the Community unavailable.

**Sign-off can't be waived.** A course with this block can't be published until the content owner, the Care Operations, Quality, Privacy and Communications reviewers, the date and the source version are recorded, and each marker's script has its reviewer and dates. "Publish anyway" doesn't get past it.

**Moderators** (authors) see a "Moderate: withdraw this post" control on each Community post, which needs a reason, and "Put it back" on a withdrawn one. Others don't see withdrawn posts at all.

**Flags and totals:** "Flag as out of date" goes to a queue. Authors get it, with counts of what was opened, read, saved and copied by marker, at `/api/magazine/<course>/reset?stats=1`, and can resolve a flag through the same route. No first takes, no names.

## The starter story

**Arthur and Chloe: waiting for funding.** Story points: Notice of Decision (month 0), still waiting (month 3), still waiting (month 5), funding allocated in this story (month 6). The markers:

| Marker | Where | Subtitle | Theme |
|---|---|---|---|
| Month 3 | At the month 3 point | A useful check-in when the date is still unknown | Contact rhythm |
| Month 4 | Between months 3 and 5 | When the family calls again | Family updates. Includes the PRD's reviewed script, a version for Chloe within Arthur's consent, and a first take. |
| Month 5 | At the month 5 point | When something might have changed | Changed needs |

The scripts say funding isn't allocated yet and promise no date. **They have no reviewer recorded, so they show as under review and can't be copied until Care Operations and Quality review them, and the course can't be published until it's signed off.**

The four Community posts are fictionalised composites written for this. Please have the Community team confirm they're happy for them to sit in the Coordinators' lounge.

## Learning events

Recorded per marker: opened, reviewed approach read, peer card viewed, saved, discussion opened, first take saved, phrase copied, flagged. Each says which marker (and which post, if any), **never the words**. A copy event isn't a message sent or a care-management activity.

## What isn't built

- **A real Community backend.** The Community's posts are still demonstration content. Likes and replies made on the page stay on each person's device, as before. Moderation is the one part now stored on the server.
- **A shared SaH Journey scenario.** The story lives in the block.
- **A screen for the flag queue and totals.** They're available only through the route.
- **Recording a spoken first take.** It's typed.
- **"Save to My Deck"** across the Hub. Saving is within the block.
- **Re-review prompts when a policy or story stage changes.** Review dates and the "under review" state are built; automatic prompts aren't.
- **A route from a lesson's flag to the Community moderator.** Flags on peer posts go to the lesson's queue; the author withdraws the post in the Community if needed.

## What was checked, and what wasn't

- **In the browser** (as Jordan, on a throwaway course, now archived): the story and three markers, Month 4 between Months 3 and 5, and Month 4 opening as a side panel beside the story without moving the story's position. I stopped driving the tab when you clicked in it.
- **Against the live dev server, by API:**
  - each marker's peer cards (Month 4: Tom's contact-rhythm post and the planning chat; the post without consent excluded; the changed-needs post shown by role only);
  - a non-author refused when withdrawing;
  - a withdrawal removing the post from Month 4 at once, and restoring it bringing it back;
  - a flag reaching the authors' queue with counts by marker;
  - the Community page carrying the post's anchor.

  The test data and moderation row are removed.
- **Not checked in the browser:**
  - the first take, the peer cards' layout, "Use this phrase" and its checks, copying and saving;
  - the phone sheet's focus trap and Escape;
  - the Community's withdraw control and the deep-link scroll;
  - the editor and its preview simulations.

  These are covered by type checks and the tests where the logic allows, but no one has looked at them.

## Where the code is

| | |
|---|---|
| `src/lib/reset.ts` | The block's shape, the parser, which posts qualify, staleness, copy checks, progress |
| `src/content/resetCases.ts` | Arthur and Chloe |
| `src/content/community.ts` | The Community posts, now with reuse details, and the four waiting-period posts |
| `src/server/reset.ts` | Community moderation, peer cards, progress, events, flags and totals |
| `src/app/api/magazine/[id]/reset/route.ts`, `src/app/api/community/moderation/route.ts` | The routes |
| `src/components/magazine/ExpectationReset.tsx` | What learners see |
| `src/components/admin/MagazineResetEdit.tsx` | The editor |
| `src/components/community/Community.tsx`, `HomeCommunity.tsx` | Post anchors, hiding withdrawn posts, the moderator control |
| `src/server/reset.test.ts` | Tests |
