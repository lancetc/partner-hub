# Question Pool

Built from the PRD *Question Pool and quiz quality assurance* (19 November 2026). This note records how v1 works, the decisions made while building it, and what is not built yet. Admin → Content → **Questions**.

## What the discovery found

| Where questions live | How they are stored | In the pool |
|---|---|---|
| Topic quiz cards | In each Topic's content (code for built-in Topics, the database for authored ones). No id or version of their own. | Yes |
| Topic decision cards (where an option is marked the better choice) | As above | Yes |
| Learning-path quizzes and test-outs | **No questions of their own**: they draw quiz cards from the path's published Topics. | Through the Topic cards |
| Challenges | Draw from Topic quiz and decision cards | Through the Topic cards |
| Magazine decision questions | In the course document, per edition | Yes |
| Magazine self-review (Test myself) | In the course document, approved per question in the course | Yes |
| Follow-ups (spaced practice) | Their own versioned table | Yes |
| The Coordinator's Day, Neighbourhood Explorer | In the app's code; progress stays on the learner's device | No: listed under Coverage |
| Magazine sorting, sequencing, matching, fill-the-gap; polls, walls, reflections | Not single-answer scored questions | No, by design |
| SCORM packages | Opaque to the Hub. Question-level data, when a package sends it, is kept raw and never read. | Package-level coverage record |

## How it works

- **Reconciliation, not relocation.** Questions are still written where they are used. `syncPool` reads every one into a single shape and gives it a stable id (`Q-00001`), a **version** for its exact wording, answers and feedback (a content hash, so any change is a new version and old versions are never edited), and a **placement** pinned to that version and to the release it went out in (Topic version, Magazine edition, follow-up version). It runs when the pool is opened (at most once a minute), after every publish, and on **Reconcile now**. It never touches a learner's record.
- **Set-up (cutover).** The first run recorded everything already live as *approved*, marked **First review due**, because learners were already meeting it. Nothing was silently called reviewed: these have their own view and are confirmed one at a time.
- **After set-up**, a wording the pool has not approved is a **draft**. Drafts in unpublished Topics and courses show in **Needs review** before they are published. A draft wording that is edited again or removed is withdrawn automatically.
- **Review** is per version: Draft → In review → Approved → Needs review or Retired. Reviewers (subject-matter, Quality and Compliance, the Hub owner) and Hub administrators approve; a plain author cannot. A **high-risk** question needs Quality and Compliance or the Hub owner, someone other than the version's author, and a recorded source. Marking an approved question high-risk, or changing its source, sends it back to Needs review. There is no bulk approval.
- **Sources** are a list of documents. Marking one **superseded** flags every approved question citing it and reports how many are live.
- **Self-review questions** are approved in their course (Manage questions); the pool mirrors that. One in a published edition is only *live* when self-review is on and the question is approved and current. **Flagging or retiring one in the pool stops it being asked at once.**
- **Publishing.** With **Require approval before publishing** on (Coverage tab, Hub administrators), a Topic or Magazine course cannot be published while any question in it lacks an approved version; the error names each one. It is **off** for the pilot: nothing is held up, and such questions appear under Needs review and *Live without an approved version*.
- **Item signals** are totals of first answers, kept apart for assessed, knowledge-check and practice use. Under 10 answers no rate is shown.
- **Export Excel** is a real `.xlsx` (written by `server/xlsx.ts`, no library): Read me, Questions, Options and feedback, Placements, Review history, External SCORM. It follows the table's filters and sorting. Answer keys are only for reviewers and Hub administrators (checked again at export), the file is then named and marked confidential, and every export is written to the audit log. Every cell is text; nothing about learners is included.
- **SCORM coverage** records, per imported course, whether its question list is unavailable, supplied or manually reconciled, whether it has an assessment, an owner and a review date. A question count is kept only when the list is supplied or reconciled.

## Not built yet (the PRD asks for these)

1. **Add from Question Pool** in the quiz editors, and true reuse (one question placed in several quizzes by reference). Today a question copied into a second Topic is a second pool question; **Possible duplicates** finds these.
2. **Attempts pinned to question versions.** Self-review sessions already store the exact version asked. Topic completions record the Topic version. **Learning-path quiz attempts store only references to Topic cards and are re-read from the live Topic when scored**, so an old attempt is not tied to the wording it was asked with. This is the largest remaining gap against acceptance criterion 1.
3. Random-pool rules with enough-eligible-questions checks, and audience matching in the publish check.
4. A read-only **Questions used** panel inside the Topic and course editors.
5. Learner or reviewer **reported issues** as a queue.
6. Staged Excel import, QTI, similarity-based duplicate suggestions (the PRD's "later" list).

## Decisions to confirm

- Existing live questions were approved at set-up and flagged for first review, rather than blocked.
- Publishing is not blocked by default; the setting makes it strict.
- Any reviewer role approves standard questions; high-risk needs Quality and Compliance or the Hub owner and a second person.
