# Brief: Care Coordination draft lessons

You are writing draft micro-lessons for the Trilogy Care **Partner Hub**, a 7taps-style learning platform. Each lesson is a plain JavaScript data file in `drafts/lessons/`, in the same format the lesson editor saves. Lessons load as **unpublished drafts** for Trilogy staff to review.

## Read first
- `drafts/lessons/lib.mjs`: helpers (`text`, `roleplay`, `consequence`, `recovery`, `art`, `bg`, `words`, `tiles`, `chips`, `none`, `PHOTOS`) and the shared verified `FACTS`.
- `drafts/lessons/facts-trilogy.mjs`: Trilogy-specific placeholder names (see "Trilogy specifics" below).
- Two finished examples to match in quality and shape: `drafts/lessons/1-legislative-framework.mjs` and `drafts/lessons/7-support-at-home-funding.mjs`.
- Card types and fields: `src/content/lessons.ts` (types `Card`, `Base`, `Option`, `QuizQuestion`, `Lesson`).

## Audience and model
- Learners are **care coordinators** who partner with Trilogy Care. They coordinate clients' care day to day in their community. Trilogy Care is the **registered provider**: it holds provider registration and financial and clinical governance. The "relationship triangle" is client (at the top), coordinator and Trilogy Care.
- Clients are older Australians on **Support at Home** (started 1 November 2025). Use `{{sah_start}}` etc. from FACTS rather than typing dates or amounts.
- Australian English. Plain, warm, direct. Short sentences. Second person ("you"). No jargon without explaining it.

## Lesson shape (every lesson)
1. **Hook**: a real moment from coordination work (a named fictional client or situation), with `narration`.
2. **First instinct**: a `poll`, `rating` or `wall` (no right answer).
3. **Show and explain**: 2 to 4 short content cards (`text` with `keyPoints` tiles or chips, a `source` link for any rule or fact, `narration` on the main ones).
4. **Role Play**: branching `decision` cards **2 to 3 levels deep**. Pattern: a choice → poorer choice leads to a `consequence` card → a recovery `roleplay` or back to retry; the better choice (`correct: true`) leads to the next, harder `roleplay`. One option per card may use `stay: true` with `feedback`. Every `decision` must have exactly one or more `correct: true` options and each option either `next` or `stay` + `feedback`. End branches in a `recovery` card, then a feedback card.
5. **Feedback**: "what good looked like" `text` card with tiles.
6. **Apply**: a `written` card (AI-checked; 3 criteria, `guidance`, `example`, `showExample: true`) or a `checklist`, or a `response` reflection. Vary across your lessons.
7. **Quick check**: a `quiz` with 3 questions (this is the completion card; `completion: { type: "quiz", cardId: "check", ... }`).
8. **Wrap**: a `rating` (confidence), a `resources` card (official links), and a `summary` (5 points, one practical `action`, `references`, `cta: "Finish lesson"`).

Typically 18 to 23 cards. Use a variety of card types across your lessons where they fit the purpose. Don't use `hotspot` cards; they've been retired. Use `checklist` for routines, `listen` for a story told aloud, `calculator` only for "minutes × hourly price" budget illustrations.

## Lesson file rules
- File name: `<chapter>-<n>-<slug>.mjs`, e.g. `04-1-dignity-choice-informed-consent.mjs`. The chapter prefix is two digits.
- **`slug` must be exactly the slug you were given.** It replaces an existing empty placeholder draft that's already linked into the Care Coordination learning path.
- `title`: the topic title as given. `track: "coordinator"`. `version: "0.1"`. `minutes`: 8 to 10. `owner: "<team> (draft)"`. `reviewDate: "2027-04-30"`. `assignment: { required: false }`.
- `theme`: `rhythm` (Brand rhythm), the house style for every lesson. The others (`classic`, `softTeal`, `navy`, `warm`, `rhythmNavy`) only if asked.
- Cover `visual`: `{ variant, tone, icon, alt, photo? }` using `PHOTOS` from lib (reuse is fine).
- Icons (card art and keyPoints) must be one of: clock, shield, heart, leaf, chat, home, spark, doc, people, sun, route, book.
- `beats`: names for the lesson's sections; every card's `beat` is an index into it, and every beat must have at least one card.
- Every non-summary, non-decision card needs `next`. Every card must be reachable from `start`.

## Accuracy (important)
- **Never invent Trilogy processes, names, phone numbers or policies.** For Trilogy-specific names use the placeholder fact tokens in `facts-trilogy.mjs` (e.g. `{{tc_contact_partnership}}`, `{{tc_incident_form}}`, `{{tc_portal}}`). Describe Trilogy processes in general, sensible terms ("tell your Partnership Manager the same day") rather than inventing steps. If you need another Trilogy-specific name, add it to **your own** facts file (below) with the same "Placeholder: confirm" notes and an early `checkBy`.
- **Regulatory facts must be verified** against official sources (health.gov.au, myagedcare.gov.au, agedcarequality.gov.au, legislation.gov.au). Fetch pages with `curl -s -m 30 -A "Mozilla/5.0" <url>` and read the text, or use WebFetch. Only link URLs you've confirmed return 200. Put changeable values (amounts, dates, timeframes, phone numbers) in facts, with `source`, `sourceTitle`, `owner` and a `checkBy` date.
- New facts go in **your own** file `drafts/lessons/facts-<chapter>.mjs` exporting `export const FACTS = [ ... ]` (same shape as lib.mjs FACTS). Don't edit `lib.mjs`, `load.mjs`, or other writers' files. Reuse existing fact keys where they fit (check lib.mjs, facts-*.mjs, and the hub's facts).
- Add a `check` (`{ by, note, source }`) on cards whose content may date.
- Fictional clients and illustrative amounts must be clearly fictional/illustrative.

## Checking
- Run `export PATH="$HOME/.local/node/current/bin:$PATH"; node drafts/load.mjs --check <your chapter prefix>-` from the `partner-hub` folder, e.g. `node drafts/load.mjs --check 04-`. Fix every ✗ until your files pass. It reports cards, role play depth and interactive count.
- **Do not** run `load.mjs` without `--check` (the lead loads everything at the end). Don't start servers, touch the database, or edit anything outside your own lesson and facts files.

## Report back
For each lesson: file name, cards, role play depth, card types used, and a one-line summary of the Role Play. Then list every fact you added and any assumption a Trilogy reviewer must confirm.
