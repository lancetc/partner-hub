# Myth vs Reality

Questions participants and families often ask, each on a tile:

- the question, in the speaker's own words;
- an answer staff can say in about 30 seconds;
- the exception that changes the answer;
- what to check for this person;
- the exact source;
- an approved email reply staff can review and copy.

The Hub never sends anything.

There's a Magazine block (type `myths`, "Myth vs Reality tiles") and a Resources page (`/resources/myths`). Both show tiles from one canonical library, which authors manage at Admin, then Myth vs Reality (`/admin/myths`).

## What learners see

- **The front:** "You might hear", the question in a speech-mark treatment, and a topic tag. It's a button, with its expanded state announced. It says "Flip for a clear answer", or "Open answer" on a phone.
- **The back,** shown instead of the front, never both. Everything is together, so the caveat is never behind another click:
  - "Here's how it works";
  - "Important exception";
  - "Check for this person";
  - the family-member wording, when there is one;
  - the sources (document → section, type, publisher, internal policy ID, when checked);
  - the next review date and the version.

  A short turn plays unless reduced motion is on. It's decorative: the answer just appears without it.
- **"How would you say it?"** (learning mode, optional): one sentence in their own words, not saved, then the approved reply.
- **"Send to Client"** opens a preview:
  - the checks for this person, and when copying is allowed;
  - the subject and email, editable on the page only;
  - a reminder to replace any placeholder (`[Name]`, `[Your name]`) still there.

  **Copy email text** shows **"Copied, not sent. Paste it into your email to send it yourself."** If the clipboard refuses, the whole text appears selected, with "Try again".
- **"Useful",** and **"Wording looks out of date"** with a note. The note goes to the library's review queue, not to anyone outside.

On the Resources page: search by the phrase someone used, filter by topic and by audience, quick-reference mode (no practice step).

## The rules it keeps

- **One library, no drifting copies.** A course block holds only tile IDs. A course and the Resources page both show each tile's current approved version.
- **Approved versions are never edited.** Editing an approved tile starts a new draft version, and learners keep seeing the approved one. When the draft is approved, the old version is retired (kept in the history, not deleted). Events record which version someone used.
- **Learners never see drafts.** An author previewing a course sees drafts, marked "Draft", and nothing can be copied from them.
- **Under review means no copying.** An approved tile past its review date, or one an author has put under review (a policy change, say), shows "Under review", and its email can't be copied. The server refuses the copy too.
- **A copy is not a send.** Events are "opened", "source", "practice", "copied" and "copy-failed". There's no "sent", and nothing is recorded as client contact. No participant names, addresses or edited message text are stored.
- **Completion:** opening the set number of tiles. Copying isn't needed.

## Approval

A draft can't be approved until it has:

- the question and the answer;
- who it's for, and which programs it applies to;
- one to three checks for this person;
- at least one exact source: the document, the section or clause, a link (https) or internal policy ID, and when it was checked. Legislation must name its section;
- the email subject and body, using only approved placeholders;
- a next review date in the future;
- if it was AI-drafted, confirmation that a person has checked it;
- sign-off from the claim owner, Policy or Quality, Care Operations and Communications, plus Finance when it covers funding or fees, and Clinical when it makes clinical claims. Also the sign-off date.

The editor shows what's still missing as you go, and the answer's word count against the 60–85-word aim.

A course with this block can't be published while any of its tiles has no approved version or is under review. "Publish anyway" doesn't cover this.

## The seed tiles

`src/content/mythTiles.ts` holds the PRD's four questions. They go into the library as drafts the first time it's used:

- **quarterly carryover:** the limit (the higher of $1,000 or 10% of the quarterly budget), kept apart from unspent Home Care Package funds, and never a balance;
- **self-management:** the provider still provides care management, and the division of tasks is agreed;
- **self-managed spending:** services still fit assessed needs and the approved service list;
- **changing a care plan:** it can be reviewed sooner, and a change prompts a budget review.

Each answer is 64 to 67 words. Each source names the public section from the PRD. None is approved: each still needs its internal policy ID, the date someone checked the source, a review date and its sign-off. Until then, they don't appear in Resources or in a course.

## What isn't built

- **The audio reading,** translation, and any CRM or email sending.
- **Watching source pages for changes,** or checking links. A review date and "Put under review" stand in.
- **The staged workflow** (each reviewer in turn). Approval records each reviewer's name and a date.
- **Audience-specific views.** Resources shows every approved tile, with a filter by audience.
- **AI drafting.** There's only the "AI-drafted, not yet checked" switch, which blocks approval.
- **Linking to the Budget Sandbox,** the Question Pool or other blocks.

## What was checked, and what wasn't

- **In the browser** (as Jordan, with a throwaway "ZZ Test" tile and course; the tile, its events and audit entries, and the course's events and progress were removed, and the course archived):
  - the library listing the four seed drafts, each with what's needed before approval;
  - approving a seed refused, with the missing source, review date and sign-off listed;
  - the Resources card and page showing only the approved tile;
  - opening it: the back shown instead of the front, with focus on "Here's how it works", and the exception, checks and exact sources all shown at once;
  - "Send to Client": the checks, the editable email, the placeholder reminder, and "Copied, not sent" after copying;
  - a refused clipboard: the text shown selected, with "Try again", and no false "Copied";
  - a course with an unapproved seed tile refused at publish, even with "Publish anyway", then published with only the approved tile;
  - putting the tile under review: the course shows "Under review", the preview won't copy, and the server refuses a copy;
  - "How would you say it?" (typing straight into the box), then the approved reply;
  - opening the set number of tiles counting the block as done;
  - the block editor showing each tile's library status;
  - "Open answer" and no sideways scrolling at phone width;
  - author counts of opens, copies and failed copies.
- **Not checked:**
  - Writing and saving a tile through the library's editor form (approval and saving were done through the API).
  - "Useful" and "out of date" flags through the page, and resolving them (the server side is tested).
  - A real screen reader.

The copy test put the test email text on the clipboard of the machine running the browser.

## Where the code is

| | |
|---|---|
| `src/lib/myths.ts` | The tile, its approval checks, under-review state, search, cleaning stored data, and the block's settings |
| `src/content/mythTiles.ts` | The four seed tiles (drafts) |
| `src/server/myths.ts` | The library: versions, saving, approval, pausing, what learners get, events, flags, counts |
| `src/app/api/myths/route.ts` | Tiles and events for learners |
| `src/app/api/admin/myths/route.ts` | The library for authors |
| `src/components/myths/MythTile.tsx` | One tile: front, back, practice, the email preview and copying, flags |
| `src/components/myths/MythResource.tsx` and `src/app/resources/myths/page.tsx` | The Resources page |
| `src/components/magazine/MythTilesBlock.tsx` | The Magazine block |
| `src/components/admin/MagazineMythEdit.tsx` | The block editor |
| `src/components/admin/MythLibrary.tsx` and `src/app/admin/myths/page.tsx` | The library admin |
| `src/server/magazine.ts` | The publish gate (`publishGuide`) |
| `src/server/myths.test.ts` | Tests |
