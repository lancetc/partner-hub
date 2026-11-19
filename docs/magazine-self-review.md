# Self-review ("Test myself") for Magazine courses

Built from the PRD *Self-review quiz for Magazine courses* (19 November 2026). This note records how v1 works and the decisions made while building it.

## What learners get

- A **Test myself** button on every reading page of a course with self-review switched on: at the end of the reading rail on a computer, floating above the tab bar on a phone. It reads **Resume review** while a review is part-way through.
- **Quick review** (a modal dialog; full screen on a phone): **This page** or **Course so far** (reading pages they've opened in this course, plus this one; never a page they haven't reached). The last choice is remembered on that device.
- Up to three questions, one at a time, with a deliberate **Check my answer**. Feedback: *Good call* / *Have another look*, **What to revisit** (the chosen answer's feedback), **What works** (the explanation), the best answer labelled in words, and **See this in the course**, which pauses the review, closes the dialog and goes to the section.
- Closing (Close, Escape, a click outside) pauses. Reviews resume after a refresh or on another device. Answers are saved once: a retry returns the first answer.
- A summary (**Confident on**, **Worth revisiting** with one link back, **Back to the page**, **Try another review**) and **My reviews**, a private history.
- If the course changes under a paused review (a new edition, or its next question retired or edited), the review ends and they're told to start a new one. Past reviews keep the questions as they were asked.

## Kept apart from what counts

- Sessions and answers are in their own tables (`magazine_practice_sessions`, `magazine_practice_responses`). Nothing in page finishes, completions, quizzes, certificates or reports reads them.
- Events go to `magazine_events` as `practice.*` (opened, started, answered, source, paused, resumed, finished). The only other query on that table counts `decision.answered`.
- A learner's copy of the course never includes the questions or answers: `readGuide` drops `doc.review` and sends only how many questions each page has. The server chooses the questions, and a question's answer is only sent once it has been answered.
- Only the learner can read or answer their reviews. Authors see totals per question and for the course (reviews started and finished, learners, visits back to the course), never who answered what.

## Authors

- **Self-review** panel in the editor sidebar: set it up, switch it on, counts, **Manage questions**.
- **Manage questions**: coverage by reading page (approved, drafts, to check, kinds, how many link to a section), per-question editing (kind, question, example for *Spot the issue*, 3 or 4 answers with the best marked and optional feedback on each wrong one, explanation, section, source), **Approve**, **Back to draft**, **Retire**, **Restore**, **Delete** (drafts never approved), and how each question is doing.
- **Draft questions from this page** (Claude, or OpenAI when Claude isn't connected) uses only the page as it is in the draft and the course's uploaded source documents. Every proposal is a draft labelled with where it came from; nothing is served until approved.
- **Preview as a learner** saves and opens the preview, which runs reviews in the browser from the draft's approved questions (even before self-review is switched on), recording nothing.

## Questions and change control

- Questions live in the course document (`doc.review`), so each edition keeps the questions it was published with.
- A question is served only when it is approved, unedited since approval (its version matches), its page is a reading page, its section still exists, and the page hasn't changed much since approval. That uses the same "changed a lot" test as the Audio Guide. Otherwise it shows as a draft or **Check again**.
- Publishing with self-review on is held up when a reading page has no approved question, or a question needs checking because its page changed. Pages with fewer than three are a suggestion; reviews there are honestly shorter. **Publish anyway** skips the checks as before, but unapproved or out-of-date questions are still never served.
- Rotation: unseen questions first, then ones missed a day or more ago, then the rest; the last review's questions only when there's nothing else. When some have been asked before, the summary says questions may repeat.

## Decisions to revisit

- **Who approves**: any author can approve a question, recorded with their name and the date. If questions on aged care, billing or clinical topics need a named subject-matter expert, that can be tied to the existing review roles.
- **Not in v1** (as the PRD's later list): the private journal prompt after a wrong answer, confidence ratings, adaptive selection across courses, spaced reminders, and other question forms.
- **Labels**: *Test myself* and *Quick review*, as the PRD proposes; worth piloting with coordinators.
