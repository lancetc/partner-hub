# Aged Care Learning Information Solution (ALIS)

Incident management and the Serious Incident Response Scheme (SIRS) for Trilogy Care's home-care context, built in the Hub from one source in two forms: **short-form Topics** in three Discovery Paths, and **one long-form Magazine course** in three chapters. Everything is a **draft**: Quality and the clinical owner review it before anything is published.

| Part | Discovery Path (id)                                                                                          | Topics  | Magazine chapter                               |
| ---- | ------------------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------- |
| 1    | **SIRS 1: Building your incident management system** (`lp-sirs-1-building-your-incident-management`)         | 1.1–1.5 | Chapter 1, pages 1.1–1.5 and _Chapter 1 check_ |
| 2    | **SIRS 2: Managing an incident from start to finish** (`lp-sirs-2-managing-an-incident-from-start-t`)        | 2.1–2.5 | Chapter 2, pages 2.1–2.5 and _Chapter 2 check_ |
| 3    | **SIRS 3: Recognising and reporting incidents in home care** (`lp-sirs-3-recognising-and-reporting-inciden`) | 3.1–3.9 | Chapter 3, pages 3.1–3.9 and _Chapter 3 check_ |

The Magazine course is "Aged Care Learning Information Solution (ALIS)" (`mag-1bcc1a57b7bc`, slug `aged-care-learning-information-solution-alis`), completion mode _Assessed_.

## Where it lives

| What                                                                                                                                                                                                                | File                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| The one shared source: each module's content, activities and 5 questions; the parts (path and chapter titles); which card, activity and questions each short Topic keeps (`ALIS_TOPIC_CUT`); the path quiz settings | `src/content/alisCourse.ts`, with the modules in `src/content/alis/part1.ts`, `part2.ts`, `part3.ts` |
| Builders: source → short Topic, source → long Magazine page, chapter check pages, practice questions                                                                                                                | `src/lib/alisBuild.ts`                                                                               |
| Creates or updates everything, as drafts, and archives what the first version made                                                                                                                                  | `src/server/alisBuild.ts` (`buildAlis`)                                                              |
| The script                                                                                                                                                                                                          | `scripts/build-alis.ts`                                                                              |
| Tests                                                                                                                                                                                                               | `src/lib/alisBuild.test.ts`, `src/server/alisBuild.test.ts`                                          |

## Re-running

```
npx vite-node --config vitest.config.ts scripts/build-alis.ts
```

It runs as the demo author (jordan) and is idempotent: Topics are found by slug and saved with `saveDraft` (a new one is made with `createLesson` under a title that spells its slug), paths by name (`updateLearningPath`), the Magazine course by slug (`saveGuideDraft`). A published Topic stays live; only its draft changes. Nothing is published or signed off. Edits made in the Topic or Magazine editors are overwritten by the next run, so make lasting changes in the source.

It also archives, once, what the first version of the course made and no longer uses: the single three-chapter path (`lp-aged-care-learning-information-solution`) and the 19 per-module check paths (`lp-alis-check-*`). They're archived with `archiveLearningPath`, not deleted. The Magazine course was kept and updated in place.

## Short form: Topics

Each of the 19 Topics (slugs `alis-p1-introduction-to-the-sirs` … `alis-p3-sirs-in-practice`, unchanged) is 5 to 8 quick cards, about 4 minutes, and under 450 words to read before the quick check (the test holds it to that):

1. **Opening card**: the summary, and the support note on sensitive modules.
2. **In short**: the module in 80 to 140 words, written for the short form (`short.brief` on each module). The Magazine page has the full text.
3. **Try it**: one activity that asks the learner to do something, named in `ALIS_TOPIC_CUT`: a scenario, a sort (its first 3 items, a card each) or a checklist. Read-only activities (flip cards, reveals, steps, tabs) stay in the Magazine. Parts 1.1 to 1.4 had none, so each got a new one (`try-priority`, `try-it`), which the Magazine page holds too.
4. **How sure are you?**: a 1 to 5 confidence rating against the module's `short.confidence` statement. The Magazine page asks the same in its Key points.
5. **Key points**, with the sources line and a link to the Commission's SIRS guidelines.
6. **Quick check**: 2 questions, formative (no assessment mode, no pass mark gate, feedback on each). These are the questions the part's path quiz draws from.

There's no per-Topic assessment any more. A Topic is complete when its quick check is answered.

## Long form: the Magazine course

One course, three chapters, a page per module with **all** the content and activities, then a chapter check page:

- **Chapters** use the Magazine's new chapter marker (below): each part's first page starts a chapter titled as its Discovery Path, with the part description as the chapter introduction.
- Page titles are the module titles, without numbers (the chapter marker and the page list number them). Each page: _About this module_ (summary, what it covers, the support note), a section per reading block with its activities, Key points, Sources.
- **Long form only**: tools a Topic can't hold. Each chapter has a sequencing or matching activity and the _Suspected SIRS Priority 1: first steps_ Job Aid, and its last module page ends with a private commitment (one thing to do at work). 3.9 has the _safety check refused after a fall_ case thread, and 3.3 a Spot the Hazard scene of possible signs of neglect. Each module page ends with the same confidence check as its Topic.
- **Chapter N check** is an assessment page whose `quiz` block is linked to that part's path quiz.
- **Test myself**: all 95 module questions (5 per module, feedback on every option) are in the course's self-review as **draft** practice questions, with self-review switched **off**. Learners see none until Quality approves them in _Manage questions_ and turns it on.

## How the quizzes work

Each part's path has a path quiz: `{ questions: 5, passMark: 100, attempts: 5 }`.

- **Where the questions come from.** A path quiz (`server/pathQuiz.ts`) pools the quiz-card questions of the path's **published** Topics. `drawQuestions` takes one question per Topic first, visiting Topics in shuffled order, then a second round if more are needed, and asks them in path order with their options shuffled.
  - Parts 1 and 2 (5 Topics, 2 questions each): one question from every Topic, randomly one of its two.
  - Part 3 (9 Topics): one question from each of 5 different Topics, a different 5 on each attempt.
- **Pass mark 100%**: 5/5 passes, 4/5 fails. Five tries; after that an administrator clears the attempts.
- **Passing** records every Topic in the path complete (a path quiz is a test-out).
- **In the Magazine**, each chapter check shows that path's quiz. A learner who has already finished all of a path's Topics counts as having passed that chapter's quiz (the `passed || done` change in `quizStates`), so there's no dead end.
- **Completing the Magazine course** needs every required page finished and **every** linked quiz passed. `completionGap` now requires all of them (`lib/magazineQuizzes.ts`), saying which are left: "Pass all the quizzes first: Chapter 2, Chapter 3." A quiz whose path has gone is left out; a course with one quiz reads as before ("Pass the quiz first.").

Publish the Topics before the Magazine course: until they're published, the path quizzes have no questions and the chapter checks show as not yet available.

## The Magazine chapter marker

A general Magazine feature, used here for ALIS:

- **Data**: an optional `chapter: { title, intro? }` on a page (`Page.chapter` in `lib/magazine.ts`). That page starts a chapter, which runs until the next page that starts one. Pages before the first marker sit outside any chapter. A course without markers has no chapters and is unchanged. `readGuideDoc` keeps the marker, requires a title to publish (max 120 characters) and allows an intro of up to 600.
- **Helpers**: `lib/magazineChapters.ts` (`pageGroups`, `chaptersOf`, `chapterOf`, `chapterLabel`).
- **Reader**:
  - the course overview lists pages under chapter headings (h2 _In this course_ → h3 chapter → h4 page, each chapter a labelled section with its own list);
  - each page shows its chapter label above the title ("Chapter 2 · SIRS 2: …");
  - the page rail groups pages by chapter and marks the one you're in.
- **Editor**: in the course outline, each page has **Start a chapter here**; a page that starts one shows its chapter title and introduction to edit in place, and **Remove chapter**. Duplicating a page doesn't copy its marker; deleting a page that starts a chapter moves the marker to the next page.

## Activity mapping

| Alis activity                                  | Source kind | Topic (when it's the module's Try it)                              | Magazine                                                                |
| ---------------------------------------------- | ----------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Flip cards                                     | `flip`      | Not in Topics (read-only)                                          | `flashcards`                                                            |
| "Select the +" reveals                         | `reveal`    | Not in Topics (read-only)                                          | `accordion`                                                             |
| Numbered carousels, slide sequences, timelines | `steps`     | Not in Topics (read-only)                                          | `process`                                                               |
| Tabs                                           | `tabs`      | Not in Topics (read-only)                                          | `tabs`                                                                  |
| Sorting, "which system?"                       | `sort`      | A decision card for each of the first 3 items                      | `sorting`                                                               |
| Scenarios                                      | `scenario`  | Decision card: the best choice moves on, others stay with feedback | `decision`                                                              |
| Checklists, reflection prompts                 | `checklist` | `checklist` card                                                   | `checklist`                                                             |
| Ordering a process                             | `sequence`  | Not in Topics                                                      | `sequencing`                                                            |
| Matching terms or examples                     | `match`     | Not in Topics                                                      | `matching`                                                              |
| One thing to do at work                        | `commit`    | Not in Topics                                                      | `action` (private)                                                      |
| A Hub Job Aid, by id                           | `jobaid`    | Not in Topics                                                      | `playbook`                                                              |
| A What Would You Do case thread, by id         | `case`      | Not in Topics                                                      | `casethread` (sign-off cleared, to record again)                        |
| A Spot the Hazard scene, by id                 | `hazard`    | Not in Topics                                                      | `hazardscan`                                                            |
| Knowledge check                                | 5 questions | 2 in the formative quick check (and the path quiz pool)            | All 5 as draft Test myself practice; the chapter check is the path quiz |

The Magazine page holds every activity in the module; the Topic holds one of them. The test checks both.

## Content and sources

Written in the Hub's own words from the outline of the Commission's Alis modules. Statutory facts are kept exact: Priority 1 within 24 hours (all details within 5 days), Priority 2 within 30 calendar days; the eight reportable incident types; the six IMS elements; the four components; the seven principles; Act and Rules references as the outline gives them. Every Topic and page credits the Commission's SIRS guidelines and Alis; the Commission's acknowledgement of Country, artwork credit and "Alis" mentor character weren't reused. Part 3 uses the home and community definitions.

Scenario people are fictional and don't clash with the character library. Changes from the outline: Ilse (was Chen), Gwen (was Alex), Callum (Hugh's son), Dario (the cleaner in 3.5), Declan (the worker in 3.7), Owen and Petra (3.8). Derrick in 3.7 is now a bowls-club friend with no link to the provider. The 3.9 storyline was written for the Hub because the outline's slides aren't in the text.

## What needs Quality review

Verify flags on the Magazine blocks hold publishing until signed off; the matching Topic cards that the short Topics keep carry a content check due 15 Dec 2026.

1. Priority criteria and timeframes, wherever stated.
2. The Act and Rules references the outline cites (registration categories; Chapter 4 Part 10 Division 1; s16-5; s16-15, s17-5 and s18 for restrictive practices; s168 privacy).
3. Strengthened Quality Standards Outcome numbers and summaries.
4. The 7-year record retention period.
5. Wording the outline only shows as pictures: warning signs, unexplained-absence risk groups, recording-tool steps, analysis cards, action-plan middle steps, the four improvement areas and Sidney's storyline.
6. Apology and open disclosure wording; the five elements of open disclosure.
7. The 3.7 relationship scenario change.
8. Links: the Commission's site didn't respond when checked. The Alis link points at the Commission's home page.
9. Trilogy Care's Employee Assistance Program wording; the Topic owner ("Quality and Compliance").
10. Approving the 95 draft Test myself questions, if wanted.

## Not done

- Nothing published or signed off, by design. No narration, audio or video; no new pictures.
- The 3 path quizzes allow at most 5 tries (the Hub's limit for path quizzes).
