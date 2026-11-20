# Ava Relay in Magazine

Built from the PRD *Partner Hub: Ava Relay in Magazine* (21 November 2026), all six build steps. It extends [Story Plans and recurring characters](story-plans.md). This note records how it works, where it attaches to what the Hub already had, what was checked, and what is left for Trilogy Care to decide.

Authors: **Magazine editor → a page → Ava Relay** in the sidebar. Administrators: **Administration → Content → Ava Relay**.

## What it is

One terminal-style bar near the top of a Magazine page: **Check in with Ava… DIAL**. It is a button that looks like an input. Pressing it tunes for a moment, then opens a dark teal modal whose parts resolve in order: relay header and status, Ava, the two tabs, the context card, her opening message, then the suggested questions and a real text field.

Ava is the fictional recurring practitioner from the Character Library, and an AI guide. She has two modes:

- **In this story.** She helps the learner notice, question, compare perspectives and get ready for the next decision. She doesn't make it for them.
- **Work guidance.** She looks for approved Hub guidance the learner's role may open, and shows its source. If nothing covers the question she says so and gives the route.

Opening Ava changes no score and finishes nothing. Dot, Fiona and the other featured people are not chatbots: their approved check-ins stay as they were.

## Where it attaches to the Hub

| Need | What it uses |
|---|---|
| Placement | `GuideReader` (the Magazine page shell): after the page header, before the first section and before any story moment placed at the top of the page. One per page, keyed to the page, so its context never carries over. |
| Settings and versions | The course document (`GuideDoc.relay`, `Page.relay`, in `lib/relayConfig`). Publishing snapshots the document, so each edition keeps the context it was published with. |
| Who may read | `publishedFor` and `canRead` in `server/magazine`, checked on every message through `relayEdition`. |
| The learner's attempt | `magazine_progress.answers`, read on the server. The page never tells the server what has been answered. |
| Ava and the people she may mention | Approved profile revisions and approved episodes from `server/story` (`relayCanon`). |
| Ava's opening transmission | `story_placements` and `story_events`: she knows the transmission's words once the learner has played or skipped it. |
| Work sources | Live SOP playbooks (`playbooksForRelay`: approved, in effect, not withdrawn or fallen back, shared with the role) and published Topics, resources and webinars through `related` in `server/search`. |
| Routes for a real concern | The course's approved routes, and the playbook contact directory where a route has been entered. |
| The model | The Hub's existing connections: Claude when connected (the same client as the Topic assistant), otherwise OpenAI. `server/relayModel` chooses; the page never names a provider. |
| Privacy and urgency checks | `identifierWarnings` and the urgent patterns the Hub already uses for Ask a Lead. |
| The work measure | The Problem desk's response decision, through `pd_responses.guide_id`. |

New: `lib/relay.ts`, `lib/relayConfig.ts`, `server/relay.ts`, `server/relayModel.ts`, `server/relayAdmin.ts`, `components/relay/AvaRelay.tsx`, `components/admin/MagazineRelay.tsx`, `components/admin/relay/RelayAdmin.tsx`, `content/relayPilot.ts`, and three tables (`relay_sessions`, `relay_turns`, `relay_events`).

## What Ava is told

The model can only give away what it has been given, so the server builds its context from the published page and the learner's own recorded answers.

| | Given to Ava |
|---|---|
| The page | Its text as the learner can see it, and each activity's question and options. |
| Before an attempt | No verdicts and no feedback. A sequencing activity's steps are given out of order, a fill-in-the-blank with its blanks, a branching scenario with its first scene only. |
| After an attempt | What the learner chose and the approved feedback on it. Not the feedback on the answers they didn't choose. |
| Held back | Any block an author ticks under "Hold a block back until the attempt". |
| Earlier pages | A short recap of up to four. |
| Later pages | Nothing. |
| People | The approved profile at the version chosen, and approved episodes up to where the page sits in the story. With no episode chosen, none. |
| Reviewer notes | Never. |

Every answer is held until it is complete and then checked before any of it is shown:

- Tags that don't match something real are removed. `[S1]` is a source, `[F1]` approved feedback, `[C1]` a person's approved story.
- A **work** answer that cites no real source is thrown away and replaced with "I can't verify that from approved Hub guidance, so I won't guess", with the route.
- A **story** answer that repeats one option of an unanswered activity nearly word for word is replaced.
- A **story** answer that reports feedback or a verdict when the learner has answered nothing is replaced with "have a go first".

Some questions never reach a model:

- **Personal details** (a phone number, an email, a street address, a long ID number, a date of birth, "Mrs Smith"). Not sent, not kept; the learner is asked to take them out.
- **A work question no approved source covers.** The honest "can't verify" and the route.

An urgent concern gets "call 000 first" and the route card; a complaint or incident gets the route card. Both say that the chat has reported, submitted and recorded nothing.

## Conversations

- One conversation per learner, course and published version. Each turn records the page, the mode, and whether activities there had been attempted (never the answers).
- Moving to another page keeps the conversation and shows "Now on: …". **New conversation** deletes the old words at once.
- A course that is republished, archived or closed to the learner's audience stops answering on the next message. A new edition gets its own conversation.
- Reopening a conversation re-checks every cited source and person. An answer that leaned on something the learner can no longer open is not shown again.
- Kept for 14 days unless a Hub administrator changes it (1 to 90), then deleted with the words. Only the learner can read their own conversation back.
- Limits: 600 characters a question, 30 questions an hour, 45 seconds an answer. A double click or a resend is answered once.
- The audit record says that an answer was given, in which mode, of what kind, by which provider and model, and which sources at which release. Never what was asked or said.

## For authors

In the Magazine editor's sidebar, **Ava Relay**, then **Ava on this page**:

- **The course:** on or off, whether Work guidance is offered, which approved collections it may search, and approved routes for a real concern.
- **The page:** why Ava is there (with no reason, the page has no bar), on or off, the Story Plan beat, the approved episode the page sits at, the activity her hints are for, the people she may talk about with the facts she may mention, what she can reveal now, after an attempt and not at all, blocks to hold back, her opening line and up to three suggested questions, topics to steer away from, and reviewer notes.
- **Draft with AI:** a proposal for the opening line and questions, with a short rationale. An author accepts, edits or discards it.
- **Preview as a learner:** the real relay on the saved draft, before or after the attempt, with reduced motion, as a chosen role. Nothing asked there is kept or counted.
- **Test questions:** eight likely questions and failure cases, asked before and after the attempt. Read them, then **Mark reviewed**.

A page with Ava on it can't be published until its test answers have been marked reviewed since anything Ava is given last changed. Changing the course's source scope reopens every page. An assessment page has no bar unless an author turns it on there.

## For administrators

**Administration → Ava Relay**:

- **The switch.** Off takes effect at once in every course, without republishing. Hub administrators only.
- **Retention**, in days.
- **The pilot.** "Dot and the rose garden": two fictional pages that follow the Story Plan pilot. Added as a draft, with nothing marked reviewed.
- **The report**, for one course, one published version and one date range, in three sections that are kept apart:
  - *Engagement:* eligible learners (opened a page with Ava on it), who dialled, who asked, who came back another day, questions by mode, how answers were grounded, source links opened, failures, and a table by page.
  - *Learning:* what learners did in the course's own decisions on those pages, as the course scored them. Every learner who answered, whether or not they opened Ava.
  - *Work results:* the Problem desk response decision the course answers to, with its measure, owner, baseline and lag.

No report shows what anyone asked.

## What was checked

- **Tests:** 44 new (1,202 in all). They cover the state machine, what Ava is and isn't told before and after an attempt and on a second page, sources by role, effect date and collection, answers that never reach a model, conversations that can't be reached by another learner or by guessing an id, expiry, the publish check, and a report with no words in it.
- **In the browser, on a throwaway course, with live answers through the Hub's OpenAI connection** (Claude isn't connected on this machine):
  - Exactly one bar, a real button, after the page introduction and before the first section, on desktop and at phone width with no sideways scroll.
  - The bar tuned for about 730 ms on screen, the six parts resolved about 235 ms apart, and "SIGNAL LINKED" appeared at about 1.9 s with the composer focused. A double click opened one dialog and made one connection. The tuning timer has since been trimmed from 650 to 600 ms to land inside the PRD's 600 to 700 ms; that change was not measured again.
  - With reduced motion: open and complete in 14 ms, no sweep and no pulse.
  - Escape and Close returned focus to the bar and restored page scroll.
  - Before the decision Ava declined to choose and offered a question to consider; after it she explained the approved feedback on the chosen answer.
  - On the second page the conversation carried on under "Now on: A morning at the markets", with that page's context, people and suggested questions.
  - Work guidance cited two published Topics with links to the cards that cover the question. A made-up address and phone number were not sent.
  - With the relay switched off: "NO SIGNAL", a plain message, Retry and Continue reading. Retry linked once it was switched back on.
- The throwaway course, its conversation and its events were deleted afterwards, and the switch is back at its default.

## What the live test showed, and the limits

- **Hints lean towards the best answer.** Ava never names or chooses an option before an attempt, but on the pilot page her hint ("what do the roses mean to Dot?") is close to what the best option says, because that question is the page's stated purpose. The PRD's own example does the same. An author who wants a cooler hint should word the page's reason for Ava more loosely.
- **The checks on an answer are a backstop, not a proof.** Earlier in testing the model pointed at an option, and once claimed "approved feedback" that didn't exist. The rules were tightened and two checks added for exactly those cases. A cleverly worded giveaway could still get through; the test questions and review exist for that reason.
- **AI drafting can be wrong about its own sources.** One draft said "Dot's called" when Fiona had, and marked it as on the page. Those marks are labelled as the model's own account, with a warning to read the line against the page.
- **Work guidance is only as good as the approved sources.** The sample Live SOP playbooks are still awaiting approval, so nothing cites them yet, and nothing on the Hub covers "choice and risk". "Find the relevant guidance" on the pilot page correctly answers that it can't verify.
- **Personal details are detected by pattern.** Obvious identifiers are caught. A bare first name is not, so Ava is also told to remind people and answer in general terms.
- **Dates in the report are UTC days**, as on the Problem desk.
- **Not verified:** answers through Claude (not connected here), a screen reader, a real phone with its keyboard, and the relay beside a real Ava video (none exists yet; the rule is tested).

## Decisions for Trilogy Care

1. **Which model answers learners.** It works on the OpenAI connection today. If Claude is preferred, add the key on the server and it takes over; `RELAY_PROVIDER` pins one.
2. **What counts as an approved work source.** Today: Live SOP playbooks, published Topics, the Resources library and webinars, chosen per course. Whether Topics are authoritative enough for work answers is a Quality call.
3. **The approved routes.** The playbook contact directory has no routes entered, so Ava gives the general one ("your Trilogy Care contact or care coordinator") unless a course lists its own.
4. **Retention.** 14 days is a starting point, not a policy.
5. **Who signs off a page.** "Mark reviewed" records the author who read the test answers. If Quality or policy owners must sign off pages with work claims, that needs a named reviewer step.
6. **Whether Ava and the Topic presenter called Ava are the same person.** Still open from the Story Plan build.
7. **The pilot's wording.** Dot's page and Ava's opening lines are a draft for editorial review.

## Not built

- A sticky or compact bar for long pages (the PRD leaves this for after testing).
- A link from a Problem desk theme straight to this report. The report links to the theme, and the theme links to its course.
- Uploading a document into the conversation.
- A reviewer step separate from the author, and a diff of relay settings between editions.
- Comparing learners who used Ava with those who didn't. Left out on purpose: it invites a causal reading the data can't support.
- Voice, in either direction. Out of scope in the PRD.
