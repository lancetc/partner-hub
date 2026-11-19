# Reflect and Apply blocks for Magazine

Built from the PRD *Reflect and Apply blocks for Magazine* (19 November 2026). This note records how v1 works, the decisions made, and what is left for later. The pattern is **Think → Compare → Try → Revisit**.

## The four blocks (Add block → Reflect and apply)

| Block | What the learner does | Pairing |
|---|---|---|
| **Private journal** | Writes a few sentences on a prompt. Autosaves as a draft while typing ("Draft saved"); **Save my note** keeps it in My Notes; **Skip for now** leaves it. Editable later. | A later journal can **revisit** an earlier one: the earlier note is shown beside the new prompt and a separate, dated follow-up is saved. Both are kept. |
| **Compare perspectives** | Opens two or three curated viewpoints, each with its reasoning and what it might miss. None is ranked. **What the guidance says** is a separate panel with its source and reviewer. | Can follow a journal, decision, pulse or action: the learner is invited to answer first, but can always compare without answering. |
| **Pulse check** | One tap on a labelled scale (confidence) or a worded choice (a view). Not scored. | A later pulse **paired** with an earlier one shows "Your view changed from X to Y" (or that it's the same, which is fine). Pairs must use the same labels. |
| **Action note** | Chooses one suggested action or writes their own. Saved to My Notes. | A later action block can **come back** to it: Tried it / Not yet / Adjusted my plan, with an optional private reflection. The same three answers are in My Notes. |

**My Notes** (in the reading rail; beside the reading time on a phone) lists the learner's journal entries and action notes for the course with the page each came from, lets them say how an action went, delete a note, and download their notes as a text file made in the browser.

## Privacy, completion and reporting

- Entries are in `magazine_notes`, one row per learner per block. **Only the learner can read, change or delete their own.** Their copy of the course carries their own notes; no other request returns them.
- The notice learners see: *Only you see this in the Hub. It isn't shown to authors, managers or other learners, and it's never posted or sent to AI. Trilogy Care's system administrators can access stored data if they need to for support or safety.* This wording should be confirmed against the Hub's privacy notice and retention policy before launch.
- Nothing is graded, sent to AI, posted, or exported for anyone else. Events (`journal.saved`, `pulse.answered`, `action.saved`, `action.revisited`, `perspectives.opened`, …) record that something happened, never the words.
- **Authors** get counts per block (saved, skipped, followed up; learners who opened perspectives). No text, no names, and no breakdown of pulse answers, because a small group could be identified.
- **Completion:** none of these is an activity by default, so they never hold up a page. An author can ask for a response on a journal or action note; then saving counts, and so does **Prefer not to write: mark as reviewed**. Length, content and agreement are never checked.
- Notes are kept across editions with the prompt as it read. If a block is later removed, the note stays in My Notes, marked as from a part of the course that has changed. A course republished under an open page asks for a reload; the words stay on the device meanwhile.

## Checks

- **Stops publishing:** a revisit or pair whose earlier block is gone or comes later; a paired pulse with different labels; perspectives following a block that's gone.
- **Suggestions:** vague or duplicate pulse labels; a pair worded differently; a perspective without "what it might miss"; guidance without a source; guidance not flagged for verification; a prompt that seems to ask for a real client's details.
- Guidance is a policy statement: flag the block **Needs verification** so its policy owner signs it off in Review and publish.

## AI course generation

The page generator's block list now includes the four blocks, with the rules: at most one or two per page, only where they serve the page's purpose, each with a note saying why it belongs; never a learner's private response, a made-up first-person account presented as real, or a policy the documents don't state; guidance must be flagged for verification. The author reviews every block before publishing. (The generator needs Claude connected; it was not run end to end here.)

## Not in v1 (as the PRD stages them)

- **Moderated peer sharing** ("Share a perspective", moderation, reporting): perspectives are curated only.
- **Aggregate pulse results**, until a cohort threshold and access policy are agreed.
- **Reminders** for action notes, voice notes, AI coaching.
- **Save a private reflection** from a Quick review.
- A Hub-wide notebook: My Notes is per course.
- A warning in the editor when deleting a block another block looks back at (the publish check catches it).

## Decisions to confirm

- The privacy wording above, the retention period, and who may have operational access.
- Whether "Prefer not to write" is the right alternative when a response is asked for.
