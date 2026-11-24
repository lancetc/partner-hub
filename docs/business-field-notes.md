# Care Partner Business Field Notes

The business edition of [Notes to a Younger Me](notes-to-a-younger-me.md), for verified Care Partner principals (business owners). Each card is one honest business decision: what the situation was, what the principal believed, what they tried, what failed, the trade-off and what they'd tell a newer principal. Each card has one canonical, moderated discussion, links to a related Work Tool, and can gain dated check-in chapters from the same contributor.

It's peer experience, never Trilogy Care policy, a staffing benchmark or a verified business result. Nothing ranks principals, and there are no leaderboards.

Built from the PRD "Partner Hub: Care Partner Mastermind and Business Field Notes" (21 November 2026), phases 1 and 2. Phase 3 (facilitated Mastermind circles, and any audio, recorded or synthetic) is a later phase and isn't built.

## What it extends, and what it adds

Nothing here is a second deck, a second saves system or a second Community. A business card **is** a mentor note.

| Existing part | How it's used |
|---|---|
| The mentor note library (`mentor_notes`, `src/server/notes.ts`, `src/lib/notes.ts`) | Business cards are mentor notes with a `business` context. Same versioning, review states, editor edits that wait for the contributor's OK, flag for re-review, withdraw. |
| The card (`src/components/notes/MentorCard.tsx`) | Renders the business context when it's there: a Field Note number, "Principals only", the stage, era and context, "Before you flip", the believed/tried/failed/trade-off panel, "Try this" and the evidence strip. Same flip, `inert` faces, focus move and announcement. |
| Helpful votes and Pocket Deck (`mentor_note_helpful`, `mentor_note_saves`, `/pocket-deck`) | Unchanged tables. A saved business card in Pocket Deck also shows its thread state, its check-ins and one related tool. |
| The Magazine deck block (`mentor`) | Gains an **Edition**: "Business Field Notes" deals only to principals, only published business cards, and only where the contributor allowed Magazine placement. |
| Business-owner access (`plannerAccess` in `src/server/caseloadPlanner.ts`) | Decides who's a principal: the **owner** of a business in `business_planner_access`. People the owner authorised to plan aren't principals for this. Never a job title. |
| The question gates (`gateQuestion` in `src/lib/playbook.ts`) | Urgency and identifying-detail checks, extended with commercially sensitive terms. |
| The incident Job Aid (`/tools/sirs-first-steps`) | Where a live incident is sent. |
| The Problem desk (`src/server/problemDesk.ts`) | Playbook proposals become Problem desk themes, with each question as a Community case. |
| The Excel writer (`src/server/xlsx.ts`) | The export. |
| The Inbox (`src/server/notifications.ts`) | Check-in notices. Filtered on every read. |
| Search (`src/server/search.ts`) | Principals find published cards. |

**Community.** The Hub's Community feed is demonstration content kept in the browser, and `content/community.ts` is shipped to every browser, so it can't hold principal-only threads. No existing server model fitted: `card_comments` and `wall_posts` belong to lesson cards, and `playbook_gaps` to Job Aid steps. So the canonical thread is new and server-side (`bfn_threads`, one row per card, `UNIQUE (note_id)`, and `bfn_posts`). Community shows the principal-only space as a panel listing those threads, fetched from the server; anyone else gets nothing.

**What's new** (`src/server/businessAccess.ts`, `src/server/businessNotes.ts`, `src/lib/businessNotes.ts`): the thread, posts, reply votes and reports; private first thoughts and check-in plans; dated check-in chapters; the review steps; consent records; moderation events; playbook proposal links; reporting events. The tables are created by `ensureBusinessTables` (not `db.ts`), so a running server picks them up.

## What a principal sees

`/business-notes` (and `/business-notes/<id>` for one card; `?v=` from an old link; `?chapter=` from a notice).

- **Desktop:** a fan of up to five cards (real buttons with names; the tilt is decoration), the active card, and its discussion beside it.
- **Phone:** one card at a time, then an explicit **View discussion** step.
- **Text view:** every card in full, with no flipping.
- **Filters:** collection (Starting out, Growing a team, Running the business, The story continues), decision theme, business stage, Work Tool, and search. Cards are in editorial order, never by votes, client count or revenue.
- **The card:** "Think, then flip" is always on: a private first thought ("What would I try in my business, and what would I need to know?"), or skip. The thought is shown back on the note side.
- **Fictional seeds** say so on both faces, in the fan, in the text view and in the signature.
- **Evidence strip:** peer experience, contributor-reported facts ("approximate"), version, reviewed date, "Historical story" when a rule has changed, and any current approved guidance. Never "Trilogy approved" on a story.
- **Open a related tool:** one click to an available tool. Unbuilt tools are labelled "Planned Work Tool: not built yet".
- **Check in later (private):** one small action, a date, and whether to be told about a check-in.
- **The story continues:** dated check-ins below the original card, which stays as it was. A correction is marked as one.
- **Version history,** and a notice when an old link points at an earlier version.

### The discussion

- **Ask the contributor** (about the card or a check-in), or **Reply**. The UI never promises a reply. A contributor can say they're not taking questions.
- **Before anything is posted,** three questions, with **Edit it** or **I've checked: post it**. The server refuses a post without them.
- **Screening** (`screenText`), in order:
  1. **Live incident** ("fell this morning", "right now"…): not posted, nothing stored. The incident route is shown, and it says no incident report has been lodged.
  2. **Identifying detail** (names, dates, contact details, "my client"…) or **commercially sensitive terms** (current or future prices, rates, margins, pay offers, agreeing terms, client or supplier lists, splitting territory, coordinating bids): **held**. The author sees why and can edit (it's screened again) or withdraw it. Nobody else sees it. Moderators are told.
  3. Otherwise posted.
- **Labels:** Contributor experience, Peer perspective, Approved Trilogy guidance (only an editor, only with a current source), Needs owner review, Outdated or withdrawn.
- **Order:** approved guidance first, always; then pinned; then the contributor; then "with an owner"; then peers by helpful votes and recency; outdated last. Votes only order peers among themselves.
- **Answered** means the contributor replied, approved guidance was added, or the asker marked a reply helpful.
- **Helpful** and **Report** on other people's replies. Both are one per person.
- A retry with the same key never makes a second post.

## Contributing

`/business-notes/contribute`. Optional. Contributing, or not, changes nothing about anyone's learning.

- **Two paths:** guided questions, or free writing that an editor shapes (the contributor approves every word).
- **The fields:** the moment, the decision, what they believed, tried, what failed, the trade-off, the note, one thing to try, collection, stage, theme, service model, rough timeframe, broad context, related tools, and anything that must stay private (editors only: never shown, quoted or exported).
- **Attribution:** full name, first name and a business label, or "A Care Partner principal".
- **Audience:** verified principals. A wider version would be a separate adaptation.
- **Separate consents**, all off by default: text and audience, attribution, portrait, recorded voice, synthetic voice, Magazine placement, notification or webinar mention, later follow-up contact. Each submission and change is a consent record.
- **Preview:** the card, and where it would appear.
- **The pipeline:** private draft → submitted (after the three questions; screen flags go to the editors) → an editor's substantive edit waits for the contributor (**Approve this wording** or **Keep my wording**) → confirmed, back with the editors → editorial review → privacy and commercial check → subject-matter check (when the card mentions a rule or the screen raised something) → published → re-review, updated or withdrawn.
- **Narrowing a consent** (turning one off) takes effect on every version at once. Widening one needs a new submission.
- **Withdrawing** removes the card from the deck, Pocket Deck (which says why), search, Magazine decks and the Inbox, and closes its thread. The audit keeps the record.
- **Check-ins:** the contributor writes a dated chapter on their published card. It's reviewed before anyone sees it; followers are then told.

## For editors

Admin → **Business Field Notes** (`/admin/business-notes`, authors only). The general Mentor notes library doesn't list business cards, and its review can't publish one.

1. **Story queue:** every card with its state, consent, screen flags, private notes and free writing, a placement preview, **Edit wording** and **Decline**.
2. **Review:** each step with **Pass** or **Raise a concern**, recorded against the editor, then **Publish to principals**. Sign-offs are never pre-filled.
3. **Cards and chapters:** threads, review-due dates, tools, stale-content checks (a rule changed, a tool unavailable, re-review, review due), version history. Publish or withdraw check-ins; add a seed's check-in; flag; withdraw.
4. **Community:**
   - held posts (**Post it** or **Don't post**, with a reason for the author);
   - reported posts (**Hide**, keeping the record, or **Mark outdated**);
   - unanswered questions (**Add approved guidance** with a source, or **Send to an owner**, which adds a visible "Needs owner review" note);
   - threads (**Pause**, **Close** with a replacement source, **Reopen**);
   - hidden posts (**Restore**).
5. **Playbook proposals:** unanswered questions grouped by theme. **Propose a playbook** needs the existing Job Aids, tools and policy checked first, and goes on the Problem desk as a theme with each question as a Community case (the card's title, never the question's words). Then the owner's decision.
6. **Insights:**
   - eligible principals, reach and the front → flip → thread → tool → thought funnel;
   - participation by the card's stage, and over time;
   - conversation and moderation counts;
   - editorial health.

   Groups of 1 to 4 people show as "fewer than 5". **Download Excel** has the PRD's eight sheets, with numerator, denominator, source, version, extraction time and data quality. No post text, private words, client or worker details or individual business performance. The export is audited.

## Principal-only, at every surface

Checked on the server, not on the page. Anyone who isn't a principal gets "not found":

- the deck, a card and every action (`/api/business-notes`);
- the direct URL (the page holds no card content);
- the Community space panel, Work Tools and Pocket Deck links (they render nothing);
- search (`businessSearchDocs`);
- Pocket Deck resolution (the general route refuses a business card too);
- Magazine business decks (a short "for business owners" message, no card ids);
- the Inbox (filtered on every read: principals only, published cards only);
- the editors' reports and export (authors only).

Notices never carry the card's words.

## The fictional seeds

`src/content/businessNotes.ts`. They're **fictional illustrations** for development, and say so everywhere. Replace them with consented, reviewed contributions before launch.

1. **Amira, first hire** (the PRD's sample), with the eight-week check-in and the illustrative Q&A. Amira is the principal from Leila's Monday. The card doesn't name the coordinator she hired.
2. **Maya, workload signals.** Maya runs a business in Toowoomba with about 35 people and one full-time coordinator (Hiring Runway, Workload Lens). The card names neither the coordinator nor whether she has hired since.
3. **Tegan, referrals before cover.** A lesson that slowed growth. Tegan is new.

They're seeded waiting for review. In the dev database they were reviewed (by Jordan) and published so Casey can browse them.

## Not built

- **Phase 3:** facilitated Mastermind circles, the "What we learned" summary, events integration, and any audio (recorded or synthetic). No AI voice is made.
- **AI help for contributors** (structuring a draft, headlines, interview questions, thread summaries). Not wired: there's no paid AI call anywhere here.
- **Tools that don't exist yet:** First 100 Days Shadow & Coach, Local Referral Studio, Contractor Network Builder, 28-Day Trust Check. They're labelled placeholders. Of the existing calculator articles, only those published and open to the reader are offered (in the dev database, Hiring Runway).
- **Invited interviews** (the editor-led route), and adapting an existing Community post (it would need the author's permission and doesn't exist server-side anyway).
- **A separate "detailed moderation export"** for a separately authorised role.
- **Work-outcome measures** (coordinator capacity, coverage and so on). They need an authorised data source.
- **An appeal flow** beyond editing a held post or asking again.
- **Moderation service levels.**
- **Notification preferences.** Only readers who saved or follow a card are told about a check-in. There's no separate preference setting.

## Decisions Trilogy Care must confirm (PRD section 20)

These gate real contributions and cross-business discussion:

1. **Who's a principal.** Today: the business owner in business-owner access. Authorised planners don't count. (Partnerships/IT)
2. **Story rights.** Today: text and audience by opt-in; portrait, audio and synthetic voice off. (Community/Privacy/Brand)
3. **The commercial discussion standard,** and who reviews held posts that can't be settled. (Commercial-policy/legal)
4. **Who answers programme and clinical questions** with approved guidance, and their service levels. (Quality/Operations)
5. **"50+ clients" style claims.** Today: contributor-reported and approximate unless verified with consent. (Partnerships)
6. **Mastermind circles.** Not built. (Community/Partnerships)
7. **Audio.** Not built. (Brand/Privacy/Platform)
8. **Linking to operational outcomes.** Aggregate only, with a baseline and denominator. (Analytics/Partner Enablement)

## Where the code is

| | |
|---|---|
| `src/lib/businessNotes.ts` | Taxonomy, tools, consents, screening, labels and order, chapters, review steps, events, suppression |
| `src/lib/notes.ts` | The note's `business` context, `visibleTo` for principals, the deck block's edition |
| `src/content/businessNotes.ts` | The fictional seeds, check-in and Q&A |
| `src/server/businessAccess.ts` | Who's a principal, the tables, tool resolution, Pocket Deck extras, Inbox filtering |
| `src/server/businessNotes.ts` | The deck, card, thread, actions, contributions, editors' library and decisions, proposals, insights, export, search docs |
| `src/server/notes.ts` | Principal checks in decks, saves, votes and Pocket Deck; the general library leaves business cards out |
| `src/app/api/business-notes/route.ts` | Readers and contributors |
| `src/app/api/admin/business-notes/route.ts`, `…/export/route.ts` | Editors, insights, export |
| `src/app/business-notes/…` | The deck, one card, contribute |
| `src/app/admin/business-notes/page.tsx` | Editors |
| `src/components/business/*` | Deck, thread, contribute, header, the principal-only link |
| `src/components/admin/BusinessNotesAdmin.tsx` | The six admin tabs |
| `src/server/businessNotes.test.ts` | Tests |

## What was checked

- **Tests** (`src/server/businessNotes.test.ts`, 20):
  - principal-only through the deck, a card, actions, search, Community, Pocket Deck, Magazine decks, the Inbox and the export;
  - one canonical thread;
  - consent records, narrowing and withdrawal;
  - approved guidance above a popular peer reply;
  - commercial, territory and identifying posts held, and an incident routed with nothing stored;
  - stale versions and re-review;
  - idempotent saves, votes, reply votes, questions and events;
  - the export without raw text;
  - proposals on the Problem desk.
- **On the dev server:**
  - as Jordan (author), the review steps and publishing of the three seeds and Amira's check-in;
  - as Casey (business owner):
    - the deck, flipping with a first thought (focus moved, "Card 1 of 3, note side" announced);
    - saving, a held question with its reason, a clean question and the urgent route;
    - the check-in and the text view;
    - opening Hiring Runway;
    - Pocket Deck;
    - a phone-width layout with no sideways scroll;
  - as Sam (partner, not the owner), the "for business owners" message and nothing else;
  - the admin tabs and the export;
  - a throwaway "ZZ Test" contribution through draft, the pre-submit refusal, an editor's edit, the contributor's approval, the review steps, publishing, narrowing a consent and withdrawal.

  Test posts, the test annotation, the ZZ Test note and the test events were removed afterwards.
