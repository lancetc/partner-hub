# Learner-created Discovery Paths (My Discovery)

Built from the PRD *Learner-created Discovery Paths* (19 November 2026). This note records how v1 works, the decisions made, and what is left. It covers the PRD's delivery stages 1 to 3: catalogue readiness, the manual path builder, and goal-based suggestions with missing-topic requests.

Learners: **/discovery** (My Discovery) and **/discovery/[id]** (one path). Authors: Admin → Content → **Discovery gaps**.

## What it is

A learner tells the Hub what they want to get better at ("I want to feel more confident checking supplier invoices") and gets a short suggested route through learning that's already published. Or they start with an empty path and add things as they browse. The path is theirs: rename it, reorder it, add notes, pause, archive or delete it. It never replaces assigned training and never awards anything.

## One naming clash to settle

The Hub's top navigation already has **Discovery Paths** (`/paths`): the organisation's learning paths, with enrolment, order and certificates. The PRD calls those "assigned learning paths" and uses "Discovery Path" for the personal ones. v1 keeps both names and separates them in the wording:

- `/paths` is unchanged, with a **My Discovery** panel at the top linking across.
- The personal pages are **My Discovery**, every path card says *A flexible collection you chose for yourself*, and the page says where assigned training lives.

Renaming the existing section (for example to "Learning Paths") would remove the clash properly. That's a product decision, so it hasn't been made here.

## What can go in a path (the catalogue)

One function decides it, `catalogue()` in `server/discovery.ts`, and everything goes through it: suggestions, search, adding a step, and opening one.

| Item | Eligible when |
|---|---|
| **Topic** | In the Topics catalogue (not a spaced follow-up or a challenge mission). |
| **Magazine course** | Published, not archived, and the learner is in its audience. |
| **Magazine page** | Its course is eligible, it's a reading page (not an assessment), and its author ticked **Suitable as a standalone reference**. |

**Suitable as a standalone reference** is new, in the Magazine editor's page settings. It's off by default, so no existing page is offered by itself until an author says it makes sense alone. From a page that isn't standalone, "Add to my Discovery Path" adds the **whole course** and says so.

Each item carries its format, time, summary, its course (for a page), the practice it has (Quick review, a decision, check questions), a Topic's owner and review date, and the learner's own record in it.

## Building and following a path

- **Create a Discovery Path**: a goal in their words (with starter prompts), optionally how new it is to them and whether they have 10, 20 or 40 minutes. Or **Build it myself**. A goal being typed survives a reload.
- **The suggestion**: a title, what it's for, and up to seven steps, each with format, time, source course and **why it's here**. They can leave steps out, then **Start this path**, **Edit the route**, **Try another suggestion** or **Build it myself**.
- **The path page** is both the view and the builder: an ordered list. Each step has **Move up** and **Move down** buttons (nothing needs dragging; focus stays on the button pressed and the move is announced), **Reviewed for now**, **Useful to revisit**, a private **Why I saved this** note, an optional group label (Understand, Practise, Use at work) and Remove.
- **Add steps**: search with format and time filters, or **Suggest more for my goal**.
- **Add to my Discovery Path** on a Topic's start screen and on every Magazine page: choose a path or start a new one with it.
- Every change saves as it's made. If a save fails, the page keeps the change and offers **Try again**; the order is sent as a whole list, so resending is harmless, and adding the same thing twice changes nothing.
- A Topic opened from a path closes back to the path.

## Progress is personal

- Each step shows the content's **own** record: Topic completed, Course completed, Page finished, In progress. That record is the authoritative one.
- **Reviewed for now** is the learner's mark on their path. It writes nothing to any completion, quiz, sign-off or certificate table, and they can take it back.
- When every step is reviewed or finished the path reads **Explored**, with a quiet message and no certificate.
- **Updated since you saved this**: a step remembers the version saved or last opened. A Topic's version, a course's edition, or, for a page, the page's own content (so another page's edit doesn't flag it). Opening it clears the flag; earlier activity is kept.
- **Gone or restricted**: the step stays, with the title the learner saved, no link and a plain reason (retired, no longer available to you, or the page isn't offered by itself any more). A replacement is suggested with an **Add it** button; nothing is swapped silently, and nothing new about a restricted item is shown.

## Suggestions and the AI boundary

1. The catalogue is filtered to what this learner may open **before** anything is ranked or sent to a model.
2. **Rules** (always available, `lib/discovery.ts`): the goal's key words against titles, summaries and content. An item needs a title or summary match, or most of the goal's words in its content, and at least half of what the goal is about. A course and its own pages don't both appear: one or two matching pages stand for the course; three or more and the course is the step. Anything well below the best match is dropped rather than used as filler.
3. **AI**, when Claude or OpenAI is connected: the model is given the goal and the eligible items (id, format, time, title, summary) and may only choose and order from them. For each choice it must say whether the item is **directly** about the goal or only in the same area. Only direct items become steps. The reply is checked against the catalogue, and the route's name and purpose are taken from the learner's own goal, never the model's wording.
4. With nothing direct, the answer is **No suitable published learning yet**, with the closest related learning listed separately as exactly that, plus browse links and **Request this topic**.
5. If the model fails or isn't connected, the rule-based route stands.

No learning is generated. A request goes to authors; anything new is written, reviewed and published the usual way.

## Privacy

- A path, its goal and its notes are readable only by their owner. Anyone else's path id is a 404, for authors and administrators too. No manager or report view exists.
- Notes are never sent to AI. The goal is, when AI is connected (the field asks people not to include a client's name or health details).
- The suggestion log keeps the goal's **key words**, not the goal. Events record what happened, never what was written.
- A topic request is sent on purpose by the learner and arrives with their **role, not their name**.

## Discovery gaps (authors)

- **Topics learners have asked for**: review, reword (to take out a client's details), set a state (New, Reviewing, Planned, Published, Declined), add a note and a link to what was published. The learner sees the state, note and link on My Discovery. Changes are audited without the wording.
- **Goals with nothing to suggest**: last 90 days, as key words, shown only once two or more people have asked for something like it. The rest are counted, not shown.
- **Saved most**: Topics, courses and pages in the most people's paths, with how many marked them useful to revisit.
- Totals: people with a path, suggestions offered, started as offered or changed first, steps opened, Reviewed for now, saves from a Topic or page, and suggested steps later removed.

## Data

`discovery_paths`, `discovery_steps`, `discovery_recommendations`, `discovery_requests`, `discovery_events` (`DISCOVERY_SCHEMA` in `server/db.ts`, created on first use). A step holds the content's stable id, the titles as saved, and the versions saved and last opened. Nothing is copied from a Topic or page.

## Not yet

- **Saving from search results and catalogue cards.** Saving is on the content's own screen and in the path's own search.
- **Skills, experience level and prerequisite metadata** on Topics and pages. Matching uses titles, summaries, content, time and the standalone flag. Experience level only weights the format (a Topic or course for someone new, a focused page for a refresh).
- **Featured starter paths** for a role, **sharing** a path as a template, and **reminders**.
- **Offering "Add this page to a path" after a Quick review or action note.**
- **Imported (SCORM) courses** as whole-course steps.
- **Search failures** in the gaps view: site search isn't logged.
- **Changing role from the create form.** The role is shown; it comes from the profile.
- **Retention**: paths stay until the learner deletes them. A learner deleting their path removes its notes; the event log keeps only that it happened.

## Not verified here

- Screen reader behaviour was checked by structure (labels, pressed states, live regions, focus after a move), not with a screen reader.
- The AI step was exercised with OpenAI on a handful of goals. Its "direct or related" judgement should be watched in the pilot, with the "started as offered / changed first / removed" figures as the evidence.
