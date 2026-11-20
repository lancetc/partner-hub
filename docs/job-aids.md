# Job Aids, Highlights and Favourites

Built from the PRD *Partner Hub: Job Aids, Highlights and Favourites* (21 November 2026), steps 1 to 6. The Portal cue (step 7) is a proposal only and nothing of it is built. This note records how it works, what it reuses, what was checked, and what is left for Trilogy Care to decide.

Learners: **Work Tools** at `/tools`, **Favourites** at `/favourites`. Owners and authors: **Administration → Content → Job Aids** (`/admin/playbooks`).

## The decision that shaped it

The Hub already had [Live SOP playbooks](live-playbooks.md): short steps from an approved procedure, with versioned releases, an owner, an effective date and a review date, co-approval for safety-critical ones, instant withdrawal to a fallback route, a Magazine block that places one by reference, and Ask a lead. That is most of a Job Aid, so **a playbook is the Hub's Job Aid**. Nothing was built beside it. The existing playbooks, their placements and Ava Relay's citations of them carry on unchanged.

What a Job Aid adds to a playbook:

- **A template** that says how the tool is used and names its step groups: checklist, conversation prompt, decision path, escalation map, handover template, change briefing.
- **"Use when…"**: the task the worker is doing, in their words. A release can't be approved without it.
- **A quick action**: one or two sentences for where the aid is embedded in learning. An optional made-up worked example, links to go to next, and about how long it takes.
- **A link to a Problem desk theme**, when the aid is a response to one.

The Hub also had three personal saved lists. **Favourites replaces the Shift Wallet**: saves made there come across once, as they were. The older Saved items page stays switched off as it was. Pocket Deck (mentor notes) stays its own thing, with a link from Favourites.

## For learners

### Work Tools

The library of official Job Aids for a person's role, at `/tools`. Search by task ("approving an invoice"). No course to open or finish first. Each aid opens at its current approved release, or at its fallback route when it's unavailable. Job Aids are also in site search, and only ever for people whose role may open them. The old `/resources/playbooks` addresses redirect.

### A Job Aid in learning

A **Job Aid** block in a Magazine page, or an aid placed on a Topic card, shows a specially styled section:

- **Work tool**, the title, **Use when**, and the quick action, with nothing to expand.
- For a safety-critical aid, the "do now" steps and the 000 line are always on the page.
- **Why now**, when the author gave a reason for the placement.
- **Open full Job Aid** and **Save to Favourites**.
- Approved source, owner, effective date and release.

The section holds no copy. It reads the aid by reference, so every placement shows the same current approved release, and a withdrawal reaches all of them at once. Someone whose role may not see the aid gets nothing: no title, no excerpt.

### Favourites

One private list of whole Job Aids and highlighted passages.

- **One action away.** A labelled **Favourites** link in the header on a desktop. On a phone or tablet, a labelled Favourites cell that stays put at the end of the bottom bar while the rest of the row scrolls. It is not in the profile menu.
- **On the Hub home**, a small **Your Favourites** panel with the last few items, View all, and Work Tools.
- **The list**: search, **Job Aids** and **Highlights** filters with counts, pinned items first and then the most recently opened. Nothing recommended is mixed in. Rename, pin, remove.
- **After a save**: "Saved to Favourites", with **View Favourites**. The first time, it also says where Favourites is.

A saved **Job Aid** always opens at its current approved release. If that release is newer than the one the person last saw, the item says **Updated** until they open it.

### Highlighting a passage

In a Magazine page or a Job Aid, selecting text shows **Save to Favourites** beside the selection. The selection is left alone: nothing handles copying or select-all, and pressing the button doesn't clear it. **Save this section** under each section heading does the same with nothing to select, for touch, a keyboard or a screen reader.

- A passage is 12 to 600 characters, from one part of the page.
- **Only published text can be saved.** The server checks the words are really in the source as that person reads it. A typed note or a client's details can't be stored as a highlight.
- Saving the same words twice is one save.

A saved passage keeps the words as published when it was saved. **Every time it is listed or opened it is read against the source again:**

| What it finds | What the learner sees |
|---|---|
| The same edition | The passage, as current. |
| Published again, passage still there | **Guidance changed since you saved this**, until they press "I've checked the current passage". |
| Published again, wording gone | The old words struck through and marked **Superseded**, with a link to the current version. |
| Archived, unpublished, withdrawn, or no longer shared with their role | **Unavailable**. The words are not shown. |

Opening a passage from Favourites lands on the page with a **From your Favourites** panel: the passage, where it stands, and **Back to Favourites**.

## For owners and authors

In **Job Aids** (the playbook library, renamed):

- **Settings**: kind of tool, Use when, minutes, links, and everything a playbook already had (risk, owner, audiences, source section, fallback, contacts).
- **New Job Aid** checks first for aids that already cover the task and suggests **reuse**, **revise** or **new**. Rules, not a model.
- **Draft the steps from the source**: a model reads the aid's bound source section and nothing else, and proposes steps, a quick action and an example, with what the source doesn't say and what a process fix might still be needed. It can't add a rule, approve or publish. The draft goes into the release editor, where every sign-off is still needed.
- **Placements**: Work Tools always; Magazine through the Job Aid block, with a "why it belongs here"; a Topic card chosen here.
- **Use** in the last 30 days, and the **decision at review**: keep, revise, retarget, withdraw or close, with what it rests on.
- **How Job Aids are being used**: every aid in a date range.

In the Magazine editor, the block is now **Job Aid**, with **Create a Job Aid from this section**: a new draft in the library that the block then points to. It shows nothing to learners, and the course can't be published with it, until its release is approved.

On a **Problem desk** theme, **Start a Job Aid** makes a draft linked to the theme, and the theme lists its aids with their use in the same dates. The **Excel decision register** has a new **Job Aids** sheet: aid, release, placements, audience, owner, use with its denominator, and the review decision.

## What use is evidence of

Events: `job_aid_viewed`, `job_aid_opened_from_placement`, `job_aid_favourited`, `job_aid_unfavourited`, `passage_selection_saved`, `favourites_opened`, `saved_item_opened`, `current_source_opened`, `job_aid_update_seen`, `job_aid_issue_reported`. Each has the person, their role, the aid and release, and a key so a resend counts once. **No selected text is ever in an event.**

Reports show eligible audience, people who opened an aid, opens from a placement, saves, returns from Favourites, source links opened, updates seen and issues reported, by aid and release. A figure resting on fewer than ten people is marked. This is **adoption evidence**: saving or opening a tool is never a completion, a pass or a work result. No report or export shows anyone's highlights, labels or list.

## Rules it keeps

- **One aid, one approved release, everywhere.** A placement binds to the aid, not to a copy, and shows whatever release is current. This is the live-reference rule the Hub already had for playbooks. A course's page text is still snapshotted at publication; the aid inside it is not.
- **Nothing shows until it's approved**, and a course can't be published with an aid that has no approved release.
- **Withdrawal is immediate**: the steps go from Work Tools, every placement and every Favourite, and the fallback route shows instead.
- **Access is checked at save and again at every list, open and link.** A role change hides an aid from Favourites, including its name.
- **Favourites are private.** A label can't hold a phone number, an email, a street address or a long ID number.
- **A failed save says so** and leaves the button as it was. Nothing is marked saved that wasn't.

## Where things live

| What | Where |
|---|---|
| Templates, fields, events, release checks | `src/lib/playbook.ts` |
| Aids, releases, whole-aid saves, events | `src/server/playbooks.ts` |
| Favourites, passages, Topic placements, search entries, the report | `src/server/favourites.ts` |
| Reuse check and AI draft | `src/server/aidDraft.ts` |
| Tables (`favourites`, `saved_passages`, `aid_events`, `aid_placements`, `aid_reviews`) | `PLAYBOOK_SCHEMA` in `src/server/db.ts` |
| Pilot content | `src/content/playbooks.ts` |
| Learner screens | `src/components/playbooks/`, `src/components/favourites/`, `src/app/tools/`, `src/app/favourites/` |
| Owner screens | `src/components/admin/PlaybooksAdmin.tsx`, `JobAidAdmin.tsx`, `MagazinePlaybookEdit.tsx` |
| API | `/api/playbooks`, `/api/favourites`, `/api/admin/playbooks` |

## The pilot

Two Job Aids are added to the library, **in review and unapproved**, on placeholder policy records. They are editorial examples, not operational instruction:

- **Invoice rate check** (checklist, Finance): compare each invoice line with the current agreement, and query a mismatch the approved way.
- **Ask before changing the plan** (conversation prompt, Quality): what to ask before proposing a change, as in Dot's story.

Nothing shows to learners until Operations, Finance and Quality supply the real steps and the owners approve a release. A database seeded before this build gets the new source section added as a new version of its record, with the sections already there left exactly as they are.

## What was checked

- **Tests**: 13 new (1,229 in all): templates and the trigger rule, role access in Work Tools and search, one save however often it's pressed, privacy between people, update, withdrawn and role-changed states, highlight rules and every source state, section-save, Topic placement, event idempotency, the report's denominators and that no quote is in it, and the seeding of an older database.
- **In the browser, on a throwaway aid and guide, since deleted:**
  - Work Tools listed the aid for a coordinator, with search.
  - The full aid showed Use when, the grouped steps, the example and links. A double press on Save made one favourite.
  - The Magazine page showed the styled section with the quick action and "Why now", and reflected the save made on the full aid.
  - Selecting a sentence showed Save to Favourites beside it with the selection kept; saving showed the quote, its source, View Favourites and Rename.
  - At phone width, Favourites was labelled and pinned in the bottom bar, opened in one tap, and had no sideways scroll; buttons were at least 44 px tall.
  - Opening the passage from Favourites landed on the page with the From your Favourites panel.
  - The owner screen had the new fields, placements and review, and the use figures matched what had been done.
  - One AI draft, through the OpenAI connection, kept to the source section. It filed one ordinary step under "If this is different", which is the kind of thing an author has to catch.

## Not verified, and limits

- **The changed, superseded and unavailable states of a passage** are covered by tests. They were not walked through in the browser.
- **A Job Aid on a Topic card** is covered by tests and compiles in the player. It was not viewed in the browser.
- **The Excel sheet** is generated by the same export that is already tested; the new sheet was not opened in Excel.
- **A real phone**, its long-press selection menu, and a screen reader.
- **Highlight surfaces** are Magazine pages and guides and a Job Aid's own words. Topics, news, resources and third-party SCORM are not.
- **A selection must sit within one block of the page.** A sentence that runs across two blocks can't be saved as one passage; Save this section is the alternative.
- **No marker on the page for an earlier highlight.** The PRD allows one; it isn't built.
- **No offline use**, and nothing claims it.
- **Favourites on a phone is in the bottom bar, not the header**: the phone header has no room for a labelled action. On a desktop it is in the header.
- **Work Tools has no slot in the main navigation**: the bar is full at seven. It is reached from Resources, the Hub home, Favourites and search.

## Decisions for Trilogy Care

1. **The real steps.** The two pilot aids are placeholders. Operations, Finance and Quality own the wording, the source records and the sign-offs.
2. **Live reference or pinned version.** Placements show the aid's current release. If a course must keep showing the release it was published with, that needs a pin on the placement.
3. **Where Work Tools sits in the navigation**, and whether Favourites should also be in the phone header.
4. **Whether Topics and other content should allow highlights.**
5. **Retention.** Favourites and highlights are kept until the person removes them. What happens when someone leaves or changes business isn't decided.
6. **The Saved items page and Pocket Deck.** Left as they were. Folding old bookmarks into Favourites is a separate choice.
7. **The Portal cue.** Not started. It needs the Portal owner's interface and an owner for the operational responsibility.
