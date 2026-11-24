# Job Aids, Highlights and Favourites

Built from the PRD *Partner Hub: Job Aids, Highlights and Favourites* (21 November 2026), steps 1 to 6. The Portal cue (step 7) is a proposal only and nothing of it is built. This note records how it works, what it reuses, what was checked, and what is left for Trilogy Care to decide.

Learners: **Work Tools** at `/tools`, **Favourites** at `/favourites`. Owners and authors: **Administration → Content → Job Aids** (`/admin/playbooks`).

**Where Work Tools is in the navigation.** It has no menu item of its own (removed 24 Nov 2026: Favourites covers it). The **Favourites** control in the header and the phone bar opens the Companion Drawer (docs/pocket-playbook.md): Pinned, Recent, Search Work Tools and Favourites, so a pinned tool is two taps away. Work Tools is also the first thing on the Resources page (and the Resources tab is lit up on its pages), in site search and on the Hub home. It isn't in the Learn sheet: Learn is the ways to learn, and Work Tools is for the task at work.

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

The section holds no copy. It reads the aid by reference, so every placement shows the same current approved release, and a withdrawal reaches all of them at once. A course can be published before the aid has an approved release: learners don’t see the section until its first release is approved (the editor’s preview shows where it goes). Only an aid that isn’t in the library stops a course publishing (docs/demo-sign-off.md). Someone whose role may not see the aid gets nothing: no title, no excerpt.

### Favourites

One private list of whole Job Aids and highlighted passages.

- **One action away.** A labelled **Favourites** control in the header on a desktop. On a phone or tablet, a labelled Favourites cell that stays put at the end of the bottom bar while the rest of the row scrolls. It is not in the profile menu. Since the Live Call Pocket Playbook, it opens the Companion Drawer (Pinned, Recent, Search Work Tools and Favourites) over the page, with **All Favourites** for the full list: see [pocket-playbook.md](pocket-playbook.md).
- **On the Hub home**, a small **Your Favourites** panel with the last few items, View all, and Work Tools.
- **The list**: search, **Job Aids** and **Highlights** filters with counts, pinned items first and then the most recently opened. Nothing recommended is mixed in. Rename, pin, remove.
- **After a save**: "Saved to Favourites", with **View Favourites**. The first time, it also says where Favourites is.

A saved **Job Aid** always opens at its current approved release. If that release is newer than the one the person last saw, the item says **Updated** until they open it.

### Highlighting a passage

In a Magazine page, a Job Aid, a **Topic card**, a **news story** or a **Resources entry**, selecting text shows **Save to Favourites** beside the selection. The selection is left alone: nothing handles copying or select-all, and pressing the button doesn't clear it. **Save this section** does the same with nothing to select, for touch, a keyboard or a screen reader:

| Where | Save this section is | What it keeps |
|---|---|---|
| Magazine page | on each section's number line, floated right | the section's first block of text |
| Job Aid | **Save the key step**, beside Save to Favourites | the quick action |
| Topic card | **Save this card**, on the card's label line, floated right | the card's body |
| News story | **Save the opening** beside the byline, and one on each subheading | the first paragraph of that part |
| Resources entry | **Save this entry**, at the foot of the entry | its description and points |

Each passage is anchored to its source, the part of it the words are in, and the version they were saved from:

| Source | Anchor | Version | Who may save, and see it again |
|---|---|---|---|
| Magazine guide | guide, page, block | the edition the reader has | the guide's audience (as reading it) |
| Job Aid | the aid | its approved release | roles the aid is shared with |
| Topic | topic slug, card id | the Topic's published version | anyone who may open the Topic: not deleted, and not a challenge mission that hasn't opened for them (authors excepted) |
| News story | story slug, paragraph (`p3`) | the story's last edit | anyone, while it's published |
| Resources entry | the entry | its "updated" date | anyone |

A Topic read in another language: the server accepts words from the ready translation as well as the English, so a reader's highlight of the text they had in front of them is saved. Save this card keeps the English body.

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

Opening a passage from Favourites lands on the page with a **From your Favourites** panel: the passage, where it stands, and **Back to Favourites**. A Topic passage opens the Topic at its card (`?card=`), with the panel above the card's words.

### The marker on an earlier highlight

On a page with passages a person saved before, those words are marked for them, and only for them. The server works out which of their own Favourites are on the page (`GET /api/favourites?marks=<source>&id=…&page=…`, `pageMarks` in `server/favourites.ts`), and the page finds the words again with the same comparison the server uses (`lib/passageMatch.ts`).

- **Only an exact match is marked**: the saved words, word for word, where they were saved or moved within the same source. Punctuation and formatting don't matter; wording does.
- **Not marked**: wording changed or gone (Favourites says **Superseded**), a source that's gone or closed to them (**Unavailable**), and a source published again that they haven't yet checked (**Guidance changed**). After **I've checked the current passage**, it's marked again.
- **How it looks**: a soft gold tint and a dotted underline, drawn over the text with the CSS Custom Highlight API, so the published words are never changed or wrapped. The underline means it isn't colour alone. Its own shades in dark mode, the system's Mark colours in forced-colours mode, and nothing when printed.
- **Keyboard and screen readers**: a labelled **Your highlight** button follows the part of the page the passage is in (read out with the passage). Focusing it lights the words up and offers **Open in Favourites** (the item, outlined) and **Remove**. Clicking the marked words, or selecting inside them, offers the same two. The button isn't printed.
- A browser without the Highlight API gets the buttons and no tint.

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
| Favourites, passages, page marks, Topic placements, search entries, the report | `src/server/favourites.ts` |
| Finding a saved passage in text (server and page alike) | `src/lib/passageMatch.ts` |
| Highlighting, Save this section, the marker | `src/components/favourites/Highlighter.tsx`, `SavedMarks.tsx`, `HighlightArea.tsx` (news, Resources) |
| Reuse check and AI draft | `src/server/aidDraft.ts` |
| Tables (`favourites`, `saved_passages`, `aid_events`, `aid_placements`, `aid_reviews`) | `PLAYBOOK_SCHEMA` in `src/server/db.ts`; a database made before Topics, news and Resources could be highlighted has `saved_passages` rebuilt to allow them (`ensurePassageKinds`, the same copy-and-swap as Favourites holding a tool) |
| Pilot content | `src/content/playbooks.ts` |
| Learner screens | `src/components/playbooks/`, `src/components/favourites/`, `src/app/tools/`, `src/app/favourites/` |
| Owner screens | `src/components/admin/PlaybooksAdmin.tsx`, `JobAidAdmin.tsx`, `MagazinePlaybookEdit.tsx` |
| API | `/api/playbooks`, `/api/favourites`, `/api/admin/playbooks` |

## The pilot

Two Job Aids are added to the library, **in review and unapproved**, on placeholder policy records. They are editorial examples, not operational instruction:

- **Invoice rate check** (checklist, Finance): compare each invoice line with the current agreement, and query a mismatch the approved way.
- **Ask before changing the plan** (conversation prompt, Quality): what to ask before proposing a change, as in Dot's story.

Nothing shows to learners until Operations, Finance and Quality supply the real steps and the owners approve a release. A database seeded before this build gets the new source section added as a new version of its record, with the sections already there left exactly as they are.

Later seeds follow the same pattern: unapproved, with blank approvals, on a placeholder record. The **Hospital-to-Home Handover Check** (`hospital-to-home-handover-check`, a safety-critical checklist for coordinators and Trilogy Care staff) is the canonical aid the 72-Hour Discharge Pivot links from its debrief, with Save to Favourites (docs/discharge-pivot.md). Its two contacts, "Clinical lead for hospital discharges" and "After-hours clinical escalation", are empty placeholders, so no route shows until Trilogy Care enters the real ones. A course can place it before it's approved: learners just don't see it until its first release is. `scripts/seed-job-aids.ts` adds it to a running server's database.

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

### Second pass (24 November 2026): the marker, Topics, news and Resources, Work Tools in the header

- **Tests**: 16 more (1,658 in all; types and lint clean): finding a passage in the page's text (exact, across bold and a line break, a heading then a paragraph, whole words only, changed and missing wording); the marker for its owner only and on its own page, not marked once republished until checked, then marked again, not marked when reworded, archived or removed; a Job Aid's words marked and unmarked on withdrawal; Topic anchors (slug, card, version), words that aren't on the card, a missing card, an older version, an unknown topic or source kind, Save this card, the use event holding no words, changed, superseded and deleted states, and a challenge mission that hasn't opened; news anchors, sections, edits and unpublishing; Resources anchors; the table rebuild keeping what was saved; Work Tools in the header and not in the phone bar.
- **In the browser**, signed in as a coordinator at the machine's network address (so the localhost sign-in was untouched), on a ZZ Test guide, a ZZ Test topic and a ZZ Test Job Aid approved for the walk-through only. All three, the aid's placement and every test favourite were removed afterwards (the guide archived, the topic deleted, the aid's rows deleted from the dev database); the four real Job Aids stayed in review.
  - **A saved passage's states**, from Favourites and on the page. *Current*: listed as is, and marked on the page. *Guidance changed* (published again, words untouched, learners moved to the new edition): flagged in Favourites; the page opened from Favourites with the panel's warning and **I've checked the current passage**, and no marker; after checking, the marker came back over exactly the saved words in the new edition. *Superseded* (reworded): struck through in Favourites and in the panel, with the warning, and no marker. *Unavailable* (archived): no quote anywhere in the item, "Its source isn't available to you any more", and **See what to use instead**.
  - **A Job Aid on a Topic card**: the card showed the styled Work tool section (template, minutes, Use when, the quick action, Why now, Open full Job Aid, Save to Favourites, the approved source line). Save to Favourites became "In your Favourites" with the notice; Open full Job Aid opened the aid.
  - **The marker**: on the guide, the Topic card and the aid. Focusing **Your highlight** showed Open in Favourites and Remove and lit the words; Open in Favourites landed on the item, outlined and focused; Remove asked first, then took the marker away.
  - **Topic highlights**: Save this card saved the body, the passage listed as "From ZZ Test invoice topic · Check each line", and opening it landed on the card with the panel and the marker.
  - **News and Resources** were checked for their parts and buttons only (Save the opening, Save this section on each subheading, Save this entry), with nothing saved on real content; saving there is covered by tests.
  - **Navigation**: at 1024 px the header holds Learn, Community, Resources and "Tools" with room to spare, at 1280 px "Work Tools"; at phone width the bottom bar is unchanged, Resources is current on `/tools`, and nothing scrolls sideways. Save this card is 44 px tall on a phone.
  - Selecting text with the mouse could not be driven in a background tab (the browser gives an empty selection there), so the Save to Favourites button beside a selection, and selecting inside a marked passage, were checked by tests and earlier walk-throughs, not this time.

## Not verified, and limits

- **The Excel sheet** is generated by the same export that is already tested; the new sheet was not opened in Excel.
- **A real phone**, its long-press selection menu, and a screen reader.
- **The marker in print and dark mode** was checked in the stylesheet, not by printing or switching theme in a browser.
- **Third-party SCORM, the Glossary, Myth vs Reality and onboarding pages** can't be highlighted. SCORM runs in its own frame. The Glossary's definitions are a line each and already a search away. Myth vs Reality is a set of cards with replies to copy, where a selection would fight the copy action. Onboarding pages mix guidance with the person's own progress, which isn't published text.
- **On a full Job Aid, "Save the key step" saves the quick action**, which is shown where the aid is placed, not on the aid's own page. Its marker there is the labelled button with the words, and no tint.
- **A selection must sit within one part of the page**: one Magazine block, one Topic card, one paragraph of a story, one Resources entry. Save this section is the alternative.
- **No offline use**, and nothing claims it.
- **Favourites on a phone is in the bottom bar, not the header**: the phone header has no room for a labelled action. On a desktop it is in the header.
- **Work Tools has no slot in the phone bar**: it lives in Resources there. On a desktop it is in the header.

## Decisions for Trilogy Care

1. **The real steps.** The two pilot aids are placeholders. Operations, Finance and Quality own the wording, the source records and the sign-offs.
2. **Live reference or pinned version.** Placements show the aid's current release. If a course must keep showing the release it was published with, that needs a pin on the placement.
3. **Work Tools in the phone bar.** It's in the desktop header now, and in Resources on a phone. Whether it earns a slot of its own on a phone (in place of something else), and whether Favourites should also be in the phone header.
4. **Highlights on Topics, news and Resources** are on now. Whether any Topic, story or entry should be closed to highlighting (a quiz card is already only its heading and body).
5. **Retention.** Favourites and highlights are kept until the person removes them. What happens when someone leaves or changes business isn't decided.
6. **The Saved items page and Pocket Deck.** Left as they were. Folding old bookmarks into Favourites is a separate choice.
7. **The Portal cue.** Not started. It needs the Portal owner's interface and an owner for the operational responsibility.
