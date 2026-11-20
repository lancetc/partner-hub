# Peer benchmark poll

A Magazine block (type `benchmark`, "Peer benchmark poll") built from the Pulse Check PRD. The learner commits to a next step in a fictional grey-area case, then sees how peers chose, beside a reviewed perspective and moderated Community reasoning.

The Hub already had a "Pulse check" block (a one-tap confidence check), so this one has a different name. It's practice: nothing in it contacts anyone, starts a welfare check, or grades anyone against what peers chose.

## What it is

- **The case.** What the learner knows, what they don't know yet, their role in it, and the question.
- **One choice,** with optional confidence (low, medium or high) and an optional sentence of reasoning. **Lock in my decision** makes it final for this version of the case.
- **After the lock, and only then:**
  - **How others chose.** Text tabs for "All eligible respondents" and each cohort. Each option shows a bar plus its percentage and count in words. Below that: `n`, "as of", how often results update, and how many in the group chose the same as you. A note says this is a self-selected training poll, not a survey, and a majority isn't the right answer.
  - **The reviewed perspective,** beside the results: how your choice reads, the reasoning, what to check next, the facts that change the urgency, the fact that tells two defensible steps apart (when there's one), the next step, how every choice reads, and the policy with its version.
  - **Peer reasoning.** Up to two comments the author chose from the case's Community thread, most liked first, labelled "Peer reasoning". "Reviewed and endorsed by …" shows only when a reviewer and date are recorded. Plus a link to the thread.
  - **What fact would make you change your mind?** A private reflection. It never changes the locked decision.

Bars are one neutral colour, and the learner's own choice is marked in words. Nothing is red or green, and nothing animates.

## The rules it keeps

- **Lock first.** Results aren't served until the learner's own decision is locked.
- **One vote per person per version.** Locking again, even twice at once with different choices, returns the first lock and adds nothing. Retaking the course doesn't add a vote either.
- **Authors aren't counted.** Their lock is kept as their own decision, but never tallied. The editor's preview stores nothing.
- **Cohorts come from the verified role.** That's the person's Hub role when they lock, not something they pick. Each role can be in only one cohort, so nobody is counted twice.
- **Small groups are hidden:**
  - A cohort below the threshold shows "Not enough responses to display this group", with no count or percentages.
  - "All" shows only if it's over the threshold, and what it holds beyond the shown cohorts is either nothing or over the threshold too. So a hidden group can't be worked out by subtraction.
  - The threshold is 20 to start, and can't be set below 10. Privacy reviews it.
- **Results come in batches** (every 15 minutes to start). A vote appears only once its batch closes, so one person's answer can't be picked out as it arrives. The learner sees "as of" with the batch time.
- **The key never bends to the vote.** How a choice reads comes from the reviewers. A choice that needs a debrief says so even when most peers chose it. Likes only order the peer reasoning.
- **Versions are never blended.** Votes are tallied under a key made from the author's version number plus a fingerprint of the choices, the cohorts and the policy. Change any of those and a fresh tally starts. Earlier votes are kept apart and never mixed in. (Fixing a typo in a choice starts a fresh tally too.)
- **Past its review date, it pauses.** The reviewed perspective and the results stop showing, and the learner is told why. Their decision is still saved.
- **Nothing private is shared.** Peers and authors see only disclosure-checked totals. The learning event records that a decision was locked, never which one, the confidence, the reason or the reflection.
- **The answers aren't sent early.** The learner's copy of the block has no readings and no perspective. They come from the server after the lock.

## Sign-off, and the check that can't be waived

A course with this block can't be published until the block records:

- the content owner;
- the Care Operations, Clinical, Quality and Privacy reviewers;
- the sign-off date;
- the policy and its version;
- a review date that hasn't passed.

"Publish anyway" doesn't cover this.

## The starter case

`src/content/benchmarkCases.ts` holds "Two missed check-in calls", drafted from the PRD. Mr Patel, who self-manages, hasn't answered two check-in calls. His daughter says he's fine, but she last spoke to him four days ago. The four choices are:

- A: close it on the daughter's word (needs a debrief);
- B: verify contact, retry, check his plan and use the approved pathway with an owner and a time (the reviewed next step);
- C: an immediate welfare check without context (not enough on its own);
- D: wait for next month (needs a debrief).

It never teaches a fixed "two missed calls" rule. It has no sign-off, and the policy is a placeholder until the approved unsuccessful-contact procedure is named.

The Community has a new canonical thread for it, "Fictional case: two missed check-in calls", in the Coordinators' lounge, with four comments. Two of them are chosen as peer reasoning, and neither is endorsed.

## For authors

- **The case:** heading, the learner's role, facts, unknowns, the question, and its version number.
- **Choices,** each with how it reads ("The reviewed next step", "Defensible, with a deciding fact", "Not enough on its own", "Needs a debrief") and its feedback. Also whether to ask for confidence and reasoning.
- **The reviewed perspective and policy.** Includes a switch for when the case needs the approved escalation pathway whatever peers chose.
- **Cohorts and privacy:** up to three cohorts by verified role, the smallest group shown, and how often results update.
- **Community:** the case thread, up to two comments as peer reasoning, and an endorsement (reviewer and date) only when one has actually been given.
- **Sign-off and review.**

The editor shows the current tally key, so an author can see when an edit will start a fresh tally.

## What isn't built

- **A Clinical Leads cohort.** The Hub's verified roles are Care Partner, Care coordinator and Trilogy Care staff. Clinical Lead isn't one yet, so the starter compares Care Partners with Care coordinators. A Clinical Leads cohort needs that role verified first.
- **Follow-up variants** (a new fact, then a second decision), and confidence calibration. The PRD puts both after the first exercise.
- **Assessed mode.** This is formative.
- **The audio version** of the case.
- **Staged review** (Draft, then each reviewer in turn). Sign-off records each reviewer and a date.
- **Exports, and a screen for author totals.** Totals, under the same disclosure rules, are only available through the API (`?stats=1`).
- **Capability Intelligence signals,** and AI-drafted variants.
- **Checking a Community commenter's role is verified.** Comments show the member's role as the Community has it.

## What was checked, and what wasn't

- **In the browser** (as Jordan, on a throwaway course that's now archived; its votes, events, progress and 30 temporary test voters were removed):
  - adding the block in the editor, with the starter case, the sign-off warning and the tally key;
  - publishing refused without sign-off, and with a review date in the past, even with "Publish anyway"; then published;
  - before the lock: no reading, no perspective, no peer reasoning, and results refused;
  - two locks sent at once with different choices: one vote, the first kept;
  - the learner's page carrying no readings or reviewed perspective;
  - with 25 Care Partners and 5 coordinators voting (test users): Care Partners shown with counts, percentages, `n` and "as of"; coordinators "Not enough responses to display this group"; and "All" hidden, because it would reveal the coordinators;
  - the reviewed perspective, how every choice reads, and peer reasoning ordered by likes;
  - the editor's preview: lock disabled until a choice is made, then each simulated state (sample, a small cohort, no responses, results unavailable, past its review date), with nothing sent;
  - no sideways scrolling at phone width.
- **Not checked:**
  - Locking through the form as a learner. Jordan's lock went through the API, and the form was tested in the preview.
  - The reflection being saved through the page. The server side is tested.
  - Keyboard movement between the result tabs with a real keyboard.
  - A real screen reader.
  - A real results-service outage. The preview's simulated state was checked.

## Where the code is

| | |
|---|---|
| `src/lib/benchmark.ts` | The block, the parser, what readers are sent, the tally key, cohorts, disclosure-checked results, batches, peer reasoning, the preview's sample |
| `src/content/benchmarkCases.ts` | The missed check-in case (a draft) |
| `src/content/community.ts` | The case's Community thread (`case-missed-check-in`) |
| `src/server/benchmark.ts` | Locking, reflections, results, author totals |
| `src/app/api/magazine/[id]/benchmark/route.ts` | The route |
| `src/components/magazine/PeerPoll.tsx` | What learners see |
| `src/components/admin/MagazineBenchmarkEdit.tsx` | The editor |
| `src/server/magazine.ts` | The sign-off and review-date gate (`publishGuide`) and stripping answers (`withoutScenes`) |
| `src/server/benchmark.test.ts` | Tests |
