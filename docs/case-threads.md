# “What Would You Do?” Community Case Threads

A fictional care coordination dilemma becomes a learning conversation. A learner reads the case, writes a **private first take** (what they’d say, what they’d do next, who needs to know), and only then sees a pinned **Quality-reviewed case note** and a moderated discussion with experienced coordinators. They can mark responses helpful, comment, save a script, reflect and revise, and, if they choose, share their own response for moderation.

The discussion is **one canonical thread per case**: the Magazine block and the Community page show the same posts, votes, comments and moderation state, under the same permissions.

Built from the PRD “Partner Hub: ‘What Would You Do?’ Community Case-Thread Block” (19 November 2026), its section 11 MVP.

## The two MVP cases

`src/content/caseThreadCases.ts`. Both are fictional and say so everywhere.

| Case | Thread id | What it holds to (PRD section 3) |
| --- | --- | --- |
| **A: A worker the client trusts.** Margaret wants Jess, her niece’s friend, to help with showering and dressing. Jess has no documented insurance or suitability checks. | `wwyd-chosen-friend` | Keeps Margaret’s choice; the provider genuinely considers the request and has to assess suitability and the **funded** service arrangement before approving; if it can’t, it records a decision and reasons and explores alternatives. It never says informal help outside that arrangement is prohibited. |
| **B: A safety check refused after a fall.** Graham, 84, slipped two days ago (on the afternoon the floors were mopped) and won’t accept a nurse or GP visit. | `wwyd-refused-check` | Respects his informed choice; checks immediate safety and the emergency pathway; involves the clinical team under policy; records the conversation. It never labels the refusal itself SIRS: incident assessment is the provider’s decision through its incident process. |

Each has four seed responses in different voices that keep the same safety boundary. They’re **fictional seeds**: shown with a first name, “(fictional)”, the voice they’re written in and the “Fictional seed response” label. The badge comes from the seed flag, never from a real account.

The policy version, review date and approvals are **empty** on purpose. The owners record them before either case can be published.

## The learner’s journey

1. **The case:** role, scene, what’s known and deliberately unknown, the aim. “Fictional learning scenario” at the top; “For a live concern, use Trilogy Care’s approved escalation pathway” beside the action area, with the safety cue and a link to `/tools/sirs-first-steps`.
2. **Private first take:** three boxes, a word count against 100–250 words (a guide, not a limit), **Save draft** (kept on the server, so it resumes anywhere), and **Submit privately and compare**. A teaser says how many approved responses are waiting. The submitted take is immutable.
3. **Unlocked:** the first take (collapsed), a private **self-review** checklist, then the **pinned case note**: a separate labelled region with a heavier border, “Editorial guidance, not a community post”, case version, policy and version, approval date, review date, decision boundaries, “A way to say it” and sources. It’s never in the feed.
4. **The discussion,** in four views:
   - **Helpful coordinator responses** (default): seeds and verified coordinators on the current policy. Quality-endorsed examples first, then by helpful votes, then newest.
   - **Other perspectives:** approved responses from everyone else, newest first.
   - **Recent:** everything approved, newest first.
   - **All approved:** everything approved, oldest first, including posts from an earlier policy version (labelled).

   Each response shows who wrote it in words: a fictional seed, “Verified experienced coordinator” (only from a recorded grant), or a first name with an account role marked “not a verified badge”. Then **Peer idea** or **Quality-endorsed example** (with reviewer, date and case version), why coordinators found it useful, any moderator note, edit history, and “N people found this helpful”. Actions: **Mark helpful** (one per person, take it back any time), **Save script**, **Comment or ask**, **Report**.
5. **Reflect, and revise if you like:** “What would you keep or change?”, the PRD’s five-dimension rubric as prompts (never a score), and an optional revised answer. The first take stays as it was.
6. **Share (optional):** choose the first take or the revised answer, see the preview, tick the three checks, **Send for moderation**. Your shared responses show their status and the moderator’s reason; edit (back to moderation, with visible history) or withdraw.
7. **Saved scripts:** private, with author, case version, policy version and date; **Peer idea** or **Quality-endorsed example** with reviewer and date; a “Check before using” warning when the policy has changed, the post is no longer published, or an endorsement was withdrawn.

**Finishing** takes exactly four things, recorded on the server: the first take, the case note read (seen on screen, or “I’ve read the case note”), at least one peer approach read (seen on screen or focused), and a reflection. Votes, comments, posting and receiving votes never count. The Magazine’s “engaged” event for the block is refused until the server says it’s finished. It’s recorded as reflective practice, never as an assessment or proof of competence; a scored item belongs in the Question Pool.

### Accessibility

Keyboard and screen reader throughout: real buttons with `aria-pressed` for views, helpful marks and saves; labelled fields; a polite status region for every action; the case note as a labelled region; statuses and labels in words, not colour or icons alone. A **Text-only view** turns the layout into plain text with a native select for sorting. Nothing animates, so reduced motion changes nothing. No sideways scroll at phone width (checked at 375px).

## Safety, privacy and moderation

- **Screening** (`screenCaseText` in `src/lib/caseThread.ts`), on every first take, reflection, share, comment and edit:
  - **Live:** a real person and a risk, a risk happening now, or a plea for help now (“my client fell this morning…”). The incident route is shown, **nothing is stored**, and only the interrupt is counted. “It’s about the fictional case: continue” resends it as fictional. The general question gate’s urgency check isn’t used here: the fall case would trip it on nearly every good answer (“did he hit his head”, “call 000 if…”).
  - **Identifying:** the question gate’s checks (`gateQuestion`: names with titles, dates, case numbers, contact details), after the case’s own fictional names are set aside. “The client” is fine; “my client” counts. A **private** take or reflection with identifying detail is **refused** (nothing saved). A **shared** response or comment is **quarantined**: it waits in the queue with its flags.
- **Premoderation:** every shared response and comment waits for a moderator. Only its author sees it, with its status.
- **Reporting:** a report hides an approved post or comment at once (`HIDE_ON_REPORT`) until a moderator restores, hides or archives it.
- **One queue** (Admin → **Case threads**, `/admin/case-threads`, authors only), whichever page a post came from:
  - **Queue:** waiting, reported (with reasons), escalated, and waiting on the author’s changes.
  - **Published:** endorse or withdraw an endorsement, add a moderator note, hide, archive as outdated, escalate.
  - **Hidden:** restore.
  - **Threads:** pause, reopen, archive, each with a reason shown on the thread.
  - **Verified contributors:** grant the “Verified experienced coordinator” badge against a recorded criterion (coordinators and staff only), or withdraw it with a reason.
  - **Insights.**

  Every decision has a reason where the author needs one, goes in `ct_moderation`, and is audited.
- **Policy change:** publishing a case with a new policy version makes a new case version, withdraws every endorsement (logged), pauses the thread with a visible reason, and marks saved scripts stale. While paused, the case note and first takes still work; the feed shows the reason and can’t be marked as read. A moderator reopens it.
- **Separate scopes:** private attempts (`ct_attempts`), public posts (`ct_posts`, `ct_comments`), saved scripts (`ct_saved`), moderation evidence (`ct_moderation`, `ct_reports`) and analytics (`ct_events`, ids and event names only) are separate tables. Moderators never see private takes or reflections.
- **Rate limits:** helpful votes (60 per 10 minutes), comments (10 per 10 minutes), shares and edits (6 an hour), reports (12 an hour). Votes, saves, comments and shares are idempotent (retry keys; one vote per person per post).

## Access

The thread’s audience is the block’s cohort within the course’s audience (empty is everyone signed in). Every read and action is checked on the server against **the thread**, never the page that embeds it. Anyone outside it gets “not found”: the API, the Community panel (renders nothing) and the Community page (“isn’t available to you”). Both MVP cases are for care coordinators and Trilogy Care staff, so a partner (Sam) sees nothing.

## Authoring

**Add block → Reflect & share → What Would You Do? case thread** (`casethread`). It starts from Case A; **Start from** switches to either case (clearing any sign-off). The editor has the case, its unknowns, safety cue and fictional names; the prompts, word guide, self-review and reflection; the case note with sources; the policy, version and owner; three to six seeds; the thread id and audience; and the approval. Problems are listed live. **Preview** draws the block from the draft with a state picker (before a first take, after, no responses, discussion unavailable, archived) and sends nothing.

**Publishing** needs, even with “Publish anyway”:

- owner, Clinical, Quality and Community owner approval and a date;
- the policy and its version;
- a review date that hasn’t passed;
- the case note with boundaries and sources;
- at least three seeds and the self-review questions;
- no real identifiers;
- the source guardrails (`caseGuardrailProblems`): no blanket ban on informal help, no refusal labelled as an incident.

On publish the thread is registered (`caseThreadsAfterPublish`). The **first course to publish a thread id owns it**; another course using the same id embeds the canonical thread as it is (its own copy of the case is ignored). A material change by the owning course makes a new case version; learners’ attempts keep the version they saw. Readers’ copies of the block carry no case note, self-review or seeds (`caseThreadForReaders`).

No portraits are queued for case people (`lib/characters.ts`): they’re first names in a text scene, and publishing them would start paid image generation.

## The demo article

“What would you do? Two conversations about choice” (`src/content/magazineDemos.ts`, key `what-would-you-do`): framing, a callout that it isn’t a reporting system, then both cases. The page asks for every activity, so finishing it means finishing both cases. It’s a draft created by `scripts/seed-magazine-demos.ts`, and it can’t be published until each case’s owners record their approval, policy version and review date.

## Reuse plan: what was reused, and what wasn’t

| Existing part | How it’s used |
| --- | --- |
| Business Field Notes’ canonical thread (`bfn_threads`, `bfn_posts`, `server/businessNotes.ts`) | **The pattern, not the tables.** Its thread and posts are keyed to a mentor note and its versions, chapters, consent records and principal-only access; its labels (contributor, approved guidance, owner review) don’t fit a case. Extracting a shared core would mean reworking a 1,500-line module built days ago and its 20 tests. So this is a parallel model built the same way: lazily ensured tables in the module, one row per thread, server-side access on every call, idempotent actions, a moderation log, screening, a Community panel, and a removal path for clean-up. Business Field Notes is untouched and its tests pass. |
| The Insight Wall (`server/walls.ts`) | “Share, then see others”: the server never sends the discussion before a first take. |
| The decision block, the peer benchmark poll | Commit before you see others; a reviewed perspective kept apart from peer views. |
| `gateQuestion` (`lib/playbook.ts`) and `identifierWarnings` (`lib/redpen.ts`) | Identifying-detail screening, with the case’s fictional names set aside. Its urgency check is replaced by a live-situation check (above). |
| The incident Job Aid (`/tools/sirs-first-steps`) | Where a live matter is sent. |
| The Magazine block wiring (as for the calculator blocks) | `lib/magazine.ts` (type, label, parser, minutes), `lib/blockRegistry.ts` (+test), `lib/characters.ts` (explicitly no portraits), `server/magazine.ts` (readers’ copy, activity list, publish check, registration, the finished-on-the-server guard), the editor, `MagazineCaseThreadEdit.tsx`, `MagazineInteractiveEdit.tsx`, `InteractiveBlocks.tsx`. |
| Community (`components/community/Community.tsx`) | A **Case threads** panel beside the Business Field Notes panel, and `/community/cases/<id>` for one thread. The demo feed (`content/community.ts`) is unchanged. |
| Favourites (`server/favourites.ts`) | **Not used.** Its kinds are fixed by a CHECK constraint (Job Aids, passages, tools), so a new kind needs a table rebuild, and another change is landing there. Saved scripts need case and policy versions and stale checks anyway, so they’re in `ct_saved` and listed with each case and in the Community panel. A Favourites entry pointing at them is a follow-up. |
| Question Pool and Capability Intelligence | Completion is reflective practice. The registry contract says `evidence: completed`, `scoring: self`. Nothing here writes a competency or a score. |
| BFN’s small-group suppression (`suppress`, `cellText`) | Insights show 1 to 4 people as “fewer than 5”. |

## Where the code is

| | |
| --- | --- |
| `src/lib/caseThread.ts` | Fields, parser, readers’ copy, publish checks, guardrails, screening, feed ranking, completion, labels |
| `src/content/caseThreadCases.ts` | Cases A and B |
| `src/server/caseThreads.ts` | Tables, registration, access, the learner view and actions, the moderation queue and decisions, insights, removal |
| `src/app/api/case-threads/route.ts` | Learners (the block and Community alike) |
| `src/app/api/admin/case-threads/route.ts` | Moderators and insights |
| `src/components/caseThreads/CaseThread.tsx`, `CaseFeed.tsx` | The one UI, used by the block and the Community page |
| `src/components/caseThreads/CaseThreadsPanel.tsx` | The Community panel |
| `src/app/community/cases/[id]/page.tsx` | One thread in Community |
| `src/components/admin/CaseThreadsAdmin.tsx`, `src/app/admin/case-threads/page.tsx` | The moderation queue |
| `src/components/admin/MagazineCaseThreadEdit.tsx` | The block editor |
| `src/server/caseThreads.test.ts` | The acceptance criteria |

## What was checked

- **Tests** (`src/server/caseThreads.test.ts`, 23), by acceptance criterion:
  1. Nothing of the note, self-review or seeds before a first take; drafts resume; the first take is immutable and private.
  2. One thread, posts and votes from the block and Community; a second course embeds without a new version; a partner gets “not found” everywhere.
  3. Votes order peers but never endorse; endorsement is a moderator’s, with reviewer, date and version; feed ranking by view; votes are one per person and can be taken back.
  4. Finishing never needs posting, votes or comments; the Magazine block is finished only on the server’s record; sharing needs the checks and waits for a moderator.
  5. A report hides at once, is queued with its reason, and decisions are logged and audited; declined comments are shown only to their author, with the reason.
  6. Identifying detail refused in a private take; a live matter interrupted with nothing stored; a shared post with a name quarantined with its flag.
  7. and 8. Both cases pass the guardrails, and the guardrails catch a blanket ban and a refusal labelled SIRS.
  9. Saved scripts keep author and versions, show endorsement, and go stale after a policy change, which also withdraws endorsements and pauses the thread.
  10. The accessibility contract; verified badges only from a grant; insights without anyone’s words, with small-group suppression.

  Also `magazineDemos.test.ts` (both cases in the article; only the owners’ sign-off, policy version and review date hold it back) and `blockRegistry.test.ts` (searchable).
- **On the dev server** (a throwaway “ZZ Test case thread” course and thread id `zz-test-refused-check`, removed and archived afterwards):
  - publishing without sign-off refused, with the three reasons; with test sign-off, published and registered with four seeds;
  - Sam (partner) got “not found”; Riley’s live-sounding take was interrupted;
  - in the browser as Riley: the case, first take, case note, feed, a helpful mark, a saved script, the reflection and “Finished”, the text-only view, the Community panel and the Magazine page showing the same thread (and the Magazine block marked done on the server);
  - a shared response through the moderation queue to “Other perspectives”;
  - no sideways scroll at 375px.
  - The admin page was checked through its API only: the browser’s demo sign-in wasn’t switched to an author.

## Not built

- **AI feedback** on a reflection (PRD section 8) isn’t wired: no paid AI call anywhere here. The rubric is shown as prompts.
- **Notifications:** none, not even opt-in or digest. Authors see moderation decisions on their own posts in the block.
- **Cursor pagination** is an offset cursor, 20 at a time: fine for a pilot, not for very large threads.
- **Saved scripts in Favourites** (see the reuse plan).
- **An edit-request round trip for seeds,** and a moderator editing a learner’s words: moderators ask the author for changes instead.
- **Archiving a thread when its home course is archived** is shown, not stored: the thread reads as archived while the course is.
- **Preview of an embedded (non-owning) placement** shows the block’s own copy, not the canonical case.
- **Moderation service levels and staffing** (PRD section 7) and an escalation workflow beyond the “Escalated” state.
- **Learner-reported confidence** (a PRD measure) isn’t asked.

## Decisions for Trilogy Care owners (PRD section 12)

These still apply:

1. **Who counts as a verified experienced coordinator, and how badges are assigned.** Today: a moderator grants it against a recorded criterion, coordinators and staff only. (Community / People & Culture)
2. **Case approval, policy review cadence, and what makes an endorsed answer.** Today: owner, Clinical, Quality and Community owner approve each case note; a moderator endorses a post after review. (Clinical / Quality / Learning)
3. **Internal and external audience, and whether supplier coordinators can post.** Today: both cases are for care coordinators and Trilogy Care staff; partners can’t see them. (Community / Privacy / IT)
4. **Moderation staffing, queue targets, and escalation for live client disclosures.** Today: one queue for authors, an “Escalated” state, no service levels. (Community / Quality)
5. **What counts as completion, and whether this block can be in mandatory paths.** Today: first take, case note, one peer approach and a reflection, as reflective practice; the demo page needs both cases. (Learning / Quality)
6. **Script-save expiry, notification digest, and retention of private and public responses.** Today: saved scripts never expire (they warn when stale); no notifications; no retention rules. (Product / Privacy / Community)
