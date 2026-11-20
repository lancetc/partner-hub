# Notes to a Younger Me

Oversized playing cards that carry experienced colleagues' judgement to new ones. The front is a moment a new Care Partner or coordinator will recognise; the back is a candid note to a younger self, with a phrase to adapt. It's built from four parts:

- **A Magazine block** (type `mentor`, "Notes to a Younger Me deck") deals three to five cards.
- **Pocket Deck** (`/pocket-deck`) keeps the learner's favourites.
- **"Leave a note behind"** lets a colleague contribute a note.
- **The note library** (Admin, then Mentor notes, at `/admin/mentor-notes`) is where editors review everything before it's dealt.

It's peer wisdom inside a governed experience. A note never replaces the approved policy. A helpful vote, rank or tenure never certifies it.

## What learners see

- **The card:** about 34rem wide, portrait.
  - **Front ("The moment"):** a first-person hook and a fictionalised situation in one to three sentences, with corner badges showing rank and role (A, K, Q or 10, and CP, CC, CLIN or FIN), the card's position, the topic, and "Illustrative card" when the mentor is fictional.
  - **Back ("To a younger me"):** the note, a "Phrase to adapt" with **Copy phrase** and "Adapt this to the person and check the current policy", any related guidance, the signature, and the review label ("Editor-reviewed for learning" or "Policy-owner endorsed").
  - **Actions:** **Helpful** (with its count), **Save to Pocket Deck** and **View discussion** (the card's Community thread).
- **Flipping:** a real 3D turn on the Y-axis. With reduced motion it simply switches.
  - Both faces share one grid cell, so the card is as tall as its longer face and nothing is clipped.
  - Only the visible face is in the accessibility tree and the tab order: the other face is `inert` and `aria-hidden`.
  - **Flip to note** / **Back to the moment** sits below the card, so the card's own actions are never inside the flip control.
  - Focus moves to the new face's heading, and "Card 2 of 4, note side" is announced.
- **"Think, then flip"** (a mode the author chooses): a private "what would you do?" box before flipping, or "Skip and flip". The answer is shown back beside the note.
- **Moving around:** **Previous**, **Next** and numbered card buttons. A horizontal swipe also works, but only past a threshold, never starting on a control, and it never flips, votes or copies. A faint fan of cards behind the active one is decorative and can't be focused.
- **Deal another note** adds the next reviewed card on the topic without repeats, and says when the pool is used up.
- **The reflection** (optional, set by the author) is answered once and kept private.
- **Links** to Pocket Deck, and to "Leave a note for the next person" when the author turns that on.

**Finishing the deck:** the backs of the first dealt cards have been read and, if there's a reflection prompt, it's been answered. Copying and voting are never needed.

## The rules it keeps

- **Only reviewed notes are dealt.** An unreviewed note, even a popular one, can't enter a course. Neither can one flagged for re-review, or withdrawn.
- **Each deck is dealt once per learner and kept stable.** It's ordered by a per-learner seed, so it never reorders mid-lesson.
- **Choosing cards:**
  - **Curated:** the author's cards, in order.
  - **Reviewed pool:** on-topic, for the reader's role, with consent recorded.
  - **Hybrid:** pinned cards first, then the pool.

  The pool is ranked by a blend of helpfulness (dampened, so a few votes don't dominate), freshness and the per-learner seed. It's then spread so no author repeats and badges vary.
- **Helpful votes:** one per person per note, and they can be taken back. They're rate-limited, and there's no down-vote. Votes order the pool; they never endorse a note.
- **Pocket Deck** stores private pointers, not copies. A saved note opens at its newest published version, marked "Recently updated" when it has changed. A withdrawn note shows why it's gone, with a "Remove" option.
- **Flagged for re-review** (a policy changed): the note stays readable with "Being re-reviewed", **Copy phrase** is off (the server refuses a copy too), and it isn't dealt into new decks.
- **Withdrawn:** gone from every deck and from Pocket Deck, with the reason shown.
- **Private things stay private.** First instincts and reflections are visible only to the learner. Learning events count completions, never the words.

## Leaving a note

"Leave a note behind" (on the Pocket Deck page, and linked from a deck when the author allows it) is optional.

- **The form asks for:**
  - the moment;
  - the situation (fictionalised);
  - what you got wrong or found hard, and what you learned;
  - a phrase or action to adapt;
  - what approved guidance supports any rule it mentions;
  - the topic;
  - who may see it;
  - how your name and role appear, and broad experience if you choose.
- **Before you start:** a reminder to fictionalise client details, and to use the operational channel for an active concern.
- **Consent:** to the audience, and to the attribution. Both are required.
- **Identifiers:** text that looks like an email, phone number, ID number or street address is refused.
- **Nothing is posted on anyone's behalf.** Sending it puts it in the editors' queue.

**The workflow:**

1. Draft.
2. Submitted, waiting for review.
3. An editor reviews it (it's then dealt), or edits it, or declines it with a reason.
4. If an editor edited it, the contributor sees the suggested wording and either approves it (it's published) or keeps their own wording (the editor's version is removed, and the audit keeps it).
5. Contributors can withdraw their note at any time, from everywhere.

## For editors (the note library)

Each note shows its state, the published version when that differs, badge and rank, topics, whether it was contributed, consent, and counts (helpful, read, phrase copies). Editors can:

- **Edit:** a contributor's note waits for their OK; a published seed goes back for review.
- **Review:** publishes it to decks, or confirms it's current again after re-review.
- **Record endorsement:** names the policy owner.
- **Flag for re-review:** pauses copying and new deals, with a reason.
- **Withdraw:** removes it everywhere, with a reason shown to anyone who saved it.
- **Decline:** with a reason for the author.

Rank is an editorial motif ("A · Lead mentor", "K/Q · Senior mentor", "10 · Field note"). It's never derived from job title, tenure or votes, and K and Q aren't gender labels.

## For course authors (the deck block)

Title, introduction, topics, audience, how cards are chosen, how many (three to five), learning mode, an optional reflection prompt, whether "Deal another note" is offered, and whether to invite contributions. The editor shows how many reviewed notes match the topics, and lets you pin only reviewed notes.

**The check that can't be waived:** a course can't be published while a pinned or curated card isn't reviewed, or while a pool has fewer reviewed notes on its topics than the deck shows. "Publish anyway" doesn't cover this.

## The seed deck

`src/content/mentorNotes.ts` has five illustrative cards with fictional mentors, across "Setting boundaries" and "Difficult calls" (one also "Asking for help"):

- the gardener and public liability card from the PRD. It doesn't predict an audit bill or promise a funding result, and it says the registered provider keeps responsibility under self-management;
- "every call had to end with the problem fixed";
- silence on the phone;
- giving clients a personal number;
- asking for help early.

They go into the library **waiting for review**, so none is dealt until an editor reviews it. Each has a new Community thread ("Note to a younger me: …", in Start here) for "View discussion". Replace them with approved staff contributions before launch.

## Where it differs from the PRD

- **Helpful votes are kept with the note**, not on the Community post. The Hub's Community keeps likes and replies on the device (it's a demo), so there's no server-side reaction to read from. "View discussion" opens the card's Community thread.
- **A Community outage isn't simulated**, because Community content is built in. Released cards don't depend on it.

## What isn't built

- **Milestone prompts** (six months, a year). They need an approved source of staff milestones.
- **Voice-to-draft.**
- **Staff portraits and illustrations.** Cards are typographic.
- **Sharing a saved card with a colleague.**
- **Separate policy-review and privacy-review steps.** One editor review covers them; endorsement is recorded separately.
- **AI-drafted seed cards.**

## What was checked, and what wasn't

- **In the browser** (as Jordan, with four throwaway "ZZ Test" notes and a throwaway course; the notes, votes, saves, events and audit entries were deleted, and the course archived with its attempts, events and progress removed):
  - the seed notes going into the library waiting for review;
  - adding the block in the editor, with its count of reviewed notes;
  - publishing refused when the topic had no reviewed notes, even with "Publish anyway";
  - the deck dealt and kept stable, with the back face `inert` and `aria-hidden`;
  - "Think, then flip": typing a first instinct, then flipping. Focus moved to "To a younger me", "Card 1 of 3, note side" was announced, and the instinct was shown back;
  - Helpful (count and pressed state) and Save to Pocket Deck;
  - turning the other cards, Deal another note (one more card, then "seen every reviewed note"), and the reflection, which completed the deck;
  - Pocket Deck: the saved note, filters and search; a withdrawn note showing why; the "Leave a note behind" form with its reminder;
  - the note library;
  - no sideways scrolling at phone width.
- **Found and fixed:**
  - The corner badges were dark on the dark front; they're now light there.
  - Writing the route at first replaced the existing "My Notes" route file. It was restored from git before anything else, and the new routes now live under their own names (`/api/magazine/[id]/mentor`, `/api/mentor-notes`, `/api/admin/mentor-notes`).
- **Not checked:**
  - Swiping with a real touch screen.
  - The editors' edit-and-approve flow through the pages (the server side is tested).
  - The editor's course preview.
  - A real screen reader.

## Where the code is

| | |
|---|---|
| `src/lib/notes.ts` | Badges, ranks, topics and states, cleaning and checking a note, the deck block, ranking and dealing, completion |
| `src/content/mentorNotes.ts` | The five seed notes |
| `src/content/community.ts` | The seed notes' Community threads |
| `src/server/notes.ts` | The library, decks, helpful votes, Pocket Deck, contributions, editors' decisions, the publish check |
| `src/app/api/magazine/[id]/mentor/route.ts` | A learner's deck |
| `src/app/api/mentor-notes/route.ts` | Card actions, Pocket Deck and contributions |
| `src/app/api/admin/mentor-notes/route.ts` | The library for editors, and the deck preview |
| `src/components/notes/MentorCard.tsx` | The card |
| `src/components/notes/NoteFields.tsx` | The note's fields, for contributors and editors |
| `src/components/notes/PocketDeck.tsx` and `src/app/pocket-deck/page.tsx` | Pocket Deck and "Leave a note behind" |
| `src/components/magazine/NotesDeck.tsx` | The Magazine block |
| `src/components/admin/MagazineNotesEdit.tsx` | The block editor |
| `src/components/admin/MentorNotesAdmin.tsx` and `src/app/admin/mentor-notes/page.tsx` | The note library |
| `src/server/magazine.ts` | The publish check (`publishGuide`) |
| `src/server/mentorNotes.test.ts` | Tests |
