# Living Cases, Ava Field Notes and Signal Room

Built from the PRD *Partner Hub: Living Cases, Ava Field Notes and Signal Room* (21 November 2026), all four phases. This note records how it works, what it reuses, what was checked, and what is left for Trilogy Care to decide.

- Learners: **Field Notes from Ava** on the Hub home and at `/field-notes`. A return episode is an ordinary Magazine page.
- Authors: **Administration → Content → Characters and stories → Return episodes** (`/admin/characters/returns`).
- Authors and owners: **Administration → Content → Signal Room** (`/admin/signal-room`).

## What it is

A learner meets a fictional person in one case and practises a decision. Later they are invited back to the same person in a changed situation that tests the same judgement. The team can trace why the return was made, what it reused, what learners did, and what happened to a work measure that is kept apart from all of it.

The chain is: **signal → diagnosed problem → response decision → story and block reasons → approved release → practice and later transfer → work measure → review decision**.

Four rules hold everywhere:

- **A learner's answer never changes the shared story.** Feedback on a choice belongs to that learner's attempt.
- **A learner's earlier answer is theirs alone.** It can prompt a private line on their own page. Nobody else is sent it.
- **A note arrives once at most**, is optional, and stays inside the Hub.
- **A score is never shown as proof that work changed.** Reach, practice, assessment and work are separate layers.

## What it reuses

Nothing was built beside something the Hub already had.

| Needed | Already there | What was added |
|---|---|---|
| Signals, cases and contacts | Problem desk | A **repeat contact** kind, a de-identified **party** label, and their counts |
| Response decision, block rationale, measures | Problem desk | Nothing |
| Review | Problem desk reviews | An interpretation, competing explanations, a next action, **Process fix**, and reopening |
| Characters, canon, episodes, history | Story Plans | Nothing. "A morning at the markets" was already an approved episode |
| The page and its activities | Magazine | Nothing: a return adds no page type and no block |
| Ava beside the page | Ava Relay | Nothing. The return page sets its own episode and activity |
| Notifications | The Inbox (one per person per source) | A Field Notes panel and page over the same rows |
| Excel export | The decision register | Five sheets, after the original five |

New: `lib/living.ts`, `lib/livingAssist.ts`, `server/living.ts`, `server/livingEvidence.ts`, `server/livingAssist.ts`, `server/signalRoom.ts`, `content/livingPilot.ts`, and four tables (`story_returns`, `field_notes`, `field_note_deliveries`, `living_events`).

## For learners

### Field Notes from Ava

A quiet inbox of invitations, not a training queue. On the Hub home a panel appears only when there is a note; with none, nothing is shown. `/field-notes` lists them all.

Each note shows why it is here ("Dot has a new decision"), the course, about how long it takes, **Optional**, when the page was published, **Open**, an **Earlier in this story** link when the learner may open it, **Remind me in a week** and **Dismiss**.

- **Who gets one.** Someone who has answered the earlier decision, whose role the note and the course are shared with. The delay (14 days by default) runs from their first answer.
- **How it arrives.** In the Hub only: this panel and one line in the Inbox. No email, SMS or push. There is no scheduler: a note is delivered the next time its person uses the Hub after it falls due.
- **Once.** One delivery row per person per note. Reloading, a second tab or the Inbox opening at the same moment change nothing.
- **A cap.** One Field Note per person in 14 days, across every note. A second waits.
- **Not sent** to someone who has already answered the return, or who can't open its page.
- **The line can be read on a shared screen**, so it never mentions what the person answered. A hook that does is refused at release.
- **Opening** marks it read. It is checked again at that moment: someone else's note looks the same as no note, and a note whose page has gone says so and points to the Magazine.
- **Dismissing or snoozing** is about the note. The page, the person's history and anything completed are untouched.
- **Taken back** when the note or the return is withdrawn, the course is unpublished or archived, or the person's role no longer matches. The Inbox line goes; the record that it once arrived is kept.

### A return page

A return is a published Magazine page linked to an approved episode and an earlier appearance. Above Ava's dial bar it opens with a panel from the approved return:

1. **Where we left [name]**: short, safe to read without the first story.
2. **What's changed**: one approved development.
3. **What you decide**: the role and the decision.

Then, only for the learner it belongs to, **Only you can see this**: a line about their first answer last time ("Last time you began with an offer of help…"). Each line is written by an author for one earlier choice. Nothing is generated. It is dropped if the earlier course is no longer theirs to open. Someone with no earlier answer sees the same page without it.

Also: **Earlier in this story** (optional, when they may open it) and **View [name]'s story**, which lists appearances up to this episode and holds later ones behind a button.

The rest of the page is ordinary blocks. The pilot uses Text, Callout, Compare perspectives, Decision question, Private journal and Confidence check.

## For authors: a return episode

One screen, nine steps. Editing never changes what learners have: they get the copy that was approved until it is approved again or withdrawn.

1. **Start and purpose.** Optionally link a Problem desk theme, which shows its behaviour, barrier, measure and whether the decision is approved. Say whether the return tests transfer or moves the story on.
2. **Who it happens to.** An approved character, or none. Say why they fit.
3. **The two episodes and their pages.** The earlier episode and its decision; the return's episode, page and transfer activity.
4. **The episode**, as separate fields: recap, what changed, role, perspective, decision, what each choice leads to, a proposed next event, next action at work.
5. **A different question.** The two questions side by side, the shared principle, new cues, the different plausible mistake, what counts as transfer and the response criteria. Then a private line for each earlier choice.
6. **Why this block here?** Every block on the page as the Hub has it. The registry says what a learner does with that kind of block, the evidence it produces, what it records and what it can't establish. The author gives the beat, what the learner does, why it fits, an alternative, the source, the reviewer and anything missing.
7. **Episode map.** Six beats, each marked **Shared story**, **This learner's practice** or **At work**. Clicking one shows its blocks, reasons and sources. Not every case has every beat.
8. **Field Note.** Reason, hook, audience, delay, expiry, with the fixed rules stated beside them, and a preview of the note and of the page for a returning learner and a new one.
9. **Review and approve.** What is blocking, what a reviewer should look at, owner and review date.

### What blocks approval

- An unapproved character, or an episode that is still a proposal.
- A return that sits before the episode it returns to.
- **The same question again**: the wording, or the best answer, is almost the first story's.
- An opening that tells a later episode.
- Shared story written as if it followed from a learner's answer.
- A block type the Hub doesn't have. It is marked **Needs implementation**, never passed off as working.
- A block with no reason, or a reason that is only "engaging" or "interactive".
- No owner or review date.

No returning character is allowed. It is something to explain, not something that blocks.

### What approval pins

The return's fields, the character's profile version, both episodes, and a fingerprint of the transfer question. If the course is later published with a different question, the editor says so and learning figures start a new series.

A note can be released only for an approved return whose page is published, with an earlier activity linked, to an audience the course is shared with. Withdrawing a return or a note needs a reason and takes the Inbox line back.

Who may approve: where the character's steward is a named Hub user, them or a superadmin; where it is a team, any learning author. Approving a return does not approve a new event in someone's story, and does not publish the course.

## The Signal Room

A reading view over the Problem desk. Verified themes only. Recording signals, the diagnosis and the response still happens on the desk; a review can be recorded from either.

### Counting

- A **case** is one issue in its source system.
- A **contact** is one dated time someone raised it: the first report, an update, or a repeat contact.
- An **update** (follow-up or material change) is new information on the same case.
- A **repeat contact** is the same party back about an unresolved or recurring issue.
- Neither an update nor a repeat contact is ever another case. One business raising one case three times is **one case, three contacts, two repeat contacts**.
- A separate case from the same business is its own case.
- **Affected parties** are distinct de-identified labels ("Partner business A"). A label that looks like a name's contact detail or a record number is refused. No label is "not recorded", which is not zero.

### What a theme shows

| Section | What it reads |
|---|---|
| Signals | The five counts, cases someone came back about with every dated contact listed, the issue trend, and question types over time |
| The response | Target behaviour, barriers with confidence, the decision and why, content that was checked first, and each return |
| What has been done | Every dated action, release, approval and review, whoever owned it, with other changes in the same period |
| Reach | Who could open the return and who did, by role, and the note's eligible, delivered, opened and dismissed counts |
| Learning evidence | First answers, retries and where people ended, for the first decision and the return, by published version |
| Later transfer | First answers on the return, by whether the person had answered the first decision before |
| Work measure | The owner's typed figures per 100, with definition, owner, baseline, delay and other changes |
| Interpretation and review | The latest review, a form for the next, earlier reviews, and reopening |

Filters: months, signal channel, learners' role. They live in the address, and permission is checked again when a link is opened.

### Rules it keeps

- **Versions are never joined.** Learning figures are per published version. Versions that asked the same question form one series; a changed question starts another.
- **Small numbers.** Under ten people, the count is shown and the split of answers is not.
- **Groups are not ranked.** People who came back chose to. They are set beside people who came without the first story, with the days between.
- **Eligible is as at today.** The Hub doesn't keep dated role memberships.
- **No measure, no chart.** A theme with no work figures says "No linked work measure yet" and who owns connecting one.
- **Question types** keep four groups at most: this theme, the next largest, other verified themes, and **Unknown** for anything ungrouped or unchecked. Merges and splits are listed with their dates.
- **A person writes the interpretation**: improved, mixed, no observed change, or too early. With what else could explain it, what is uncertain and what happens next. A sentence that reads as a claim about cause is pointed out as it is typed.
- **An earlier review is never rewritten.** A new contact after a review can reopen the decision; the review stays word for word.

### Excel

The decision register gains seven columns at the end of its first sheet and five sheets after the original five: **Signals**, **Returns and notes**, **Block reasons**, **Learning evidence** and **Reviews**. Data notes define every new term.

- Source references are shown to superadmins and **Withheld** for everyone else.
- No case summary, no learner, and nothing a learner typed.
- Under ten people, the split is replaced by "Fewer than 10: not shown".

## AI proposals

A model may draft. It never decides. Claude when it is connected, otherwise the Hub's OpenAI connection. Forty proposals an hour per author, shared with Story Plans.

| Proposal | Where | What holds it in |
|---|---|---|
| The opening and the transfer record | Return editor, step 4 | Each field is read alone. One that tells a later episode, follows a learner's choice, or recites an approved fact word for word is taken out. One that states a rule is flagged as needing a source |
| A Field Note hook | Step 8 | A hook that mentions the learner's answer, or states a rule, is not offered |
| An alternate question | Step 5 | Sent back unless it has one best answer and differs from both the first story's question and the page's present one |
| A description of the figures | Signal Room review | Sent back if it claims cause, or uses a number that isn't on the page |

- **Rules run first.** Where a linked theme's barrier is one learning can't shift, or its decision is "No learning item" or "Reuse as it is", no model is asked and the screen says why.
- **What a model sees.** The author's own fields, approved canon for the people in the two episodes up to the return's episode, the first question as written, and the Hub's block list. For a summary, the aggregate figures only. Never a case, a party, a draft profile or anything a learner answered.
- **Nothing is saved by asking.** A field or a hook lands in the editor unsaved. A question, on confirmation, replaces that one activity in the course's draft; learners keep the published version.
- The audit record says a proposal was asked for and about what, never what it said.

## Events

In `living_events`, apart from attempts and completions: `field_note_eligible`, `field_note_delivered`, `field_note_opened`, `field_note_dismissed`, `field_note_snoozed`, `return_episode_opened`, `character_history_followed`, `transfer_activity_started`, `transfer_response_submitted`.

Each has the person, their role and organisation, the note, return, course and version, when it happened and when it arrived, and a key so a resend counts once. None holds an answer or anything typed. The answer itself stays in the Magazine's own record. A review decision is recorded as the existing `problem.reviewed` audit event.

## The pilot

Everything here is fictional material for editorial approval.

- **Add the Dot return pilot** (Return episodes) adds, as drafts: the one-page course **Dot at the markets**, its return link with reasons for all ten blocks, a Field Note, and Dot's possible response as an unapproved story moment. Nothing is approved, published, released or sent.
- **The question is new.** In the rose garden the plausible mistake was acting on a family member's worry by taking something away. At the markets it is accepting a kind offer that quietly replaces the thing itself.
- **The relay pilot is now one page.** "Dot and the rose garden" no longer has the markets as a second page.
- **Two synthetic Signal Room themes** are added the first time the Signal Room is opened, marked Sample data. One has a case raised three times and a separate case from the same business. The other is a theme whose answer is a Portal change, with no learning item and no story.
- The pilot invents no clinical assessment, rate, entitlement or safety rule. The plan excerpt on the page is fiction, saying only what the approved episode already established.

## What was checked

- **Tests**: 43 new (1,272 in all). They cover a note arriving once however often it is asked for, the delay and the cap, role change, withdrawal and archive, the private line being one learner's only, canon unchanged by any answer, approval pinning, the spoiler and same-question checks, repeat-contact counts, versions kept apart, small numbers, review and reopening, export redaction, and every guard on a model's draft.
- **In the browser, on two throwaway courses, since deleted:**
  - The Signal Room list and theme page, with the issue trend and question-types charts drawn and dated changes marked.
  - The return editor: the episode map, a refused approval with its reason, then approval.
  - The note released from the editor after its confirmation.
  - As a coordinator: no panel before answering; after answering the first decision the note appeared on the Hub home and in the Inbox.
  - Opening it landed on the return page with the three-part opening, the private line for the option chosen, and Ava's bar.
  - The transfer question gave its own feedback. Dismissing removed the note and its Inbox line; the page still opened.
  - The Signal Room then showed reach of 1 of 1, the note's counts, and both decisions with the split withheld as fewer than ten.
  - At phone width: no sideways scroll, and every control at least 44 px tall.
- **Five live proposals** through the OpenAI connection: an opening, hooks, two alternate questions and a description of the figures. Taking one field changed only that field.
  - The first alternate question was the page's own question again. That is now refused, with a test.
  - The model echoed the words that described a field as if they were content. Those are now dropped.
  - The opening called spring "some time ago". The checks can't see small inferences like that: an author has to read every draft.
- **Against the server, as an author:** the process-fix theme returned "No story is proposed" with no model asked; a question with two best answers was refused; an accepted question changed only that activity in the draft.

## Not verified, and limits

- **The delay was tested at zero days in the browser.** Fourteen days, the cap and expiry are covered by tests with a moving clock.
- **The Claude provider**: this machine has no Anthropic key.
- **A screen reader and a real phone.**
- **The Excel sheets** are generated by the tested exporter; they were not opened in Excel.
- **A person's response on the return page** (Dot's story moment) was not approved and placed in the browser.
- **The second alternate question, the description of the figures and the last checks** ran against the server, not through the buttons. The proposal panels themselves were seen in the browser for the opening, the hooks and the first question.
- **A chart point shows its figures, not a drill-down.** Each chart has "What this counts" beneath it with the definition, owner and report link.
- **Two changes in the same month** share one marker on a line chart. Both are listed underneath.
- **Only one kind of note is built**: a return, triggered by the earlier decision. The reasons for a guidance change, a rehearsal and a follow-up exist as labels with no trigger behind them.
- **No scheduler.** Someone who doesn't use the Hub doesn't get a note.
- **Membership.** Access is checked by role at every step. A person moving between partner businesses is not modelled.
- **Reach is as at today.** Dated eligibility needs role memberships with dates, which the Hub doesn't keep.
- **Signals are still typed in.** Nothing reads from the complaints, incident, Portal or billing systems.
- **Authors only.** Org admins and learners can't open the Signal Room or the return editor.

## Decisions for Trilogy Care

1. **Who approves a shared story development.** Proposed: the named steward, with Quality and Operations for work claims.
2. **The trigger and the delay.** Built as: answering the first decision, 14 days, in the Hub only.
3. **Whether a return is ever required.** Built as never. Assigning stays a separate decision.
4. **How many notes are reasonable.** Built as one per person in 14 days.
5. **What source-case data enters the Hub.** Built for de-identified summaries, a reference and a party label, typed in.
6. **What counts as a repeat.** Built as a reviewer's classification of a contact. The source system's parent-case link would be better.
7. **The work measure for the Dot pilot.** The sample's is fictional.
8. **Who may open the Signal Room.** Learning authors today. A sponsor or Hub Admin who isn't an author can't.
9. **The pilot's wording**, the response criteria and every line of feedback, for Quality and Operations.
10. **Whether source references belong in the export at all.** Superadmins get them today.
