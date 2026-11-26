# Lives in Progress

Built from the owner's PRD *Lives in Progress* (25 November 2026). The Digital Members become people whose lives carry on: a current episode, an audio diary, a story so far, a Story Bank behind them, multi-week arcs that publish on a schedule, and the existing Digital Member chat with memory.

It extends Digital Members (`docs/digital-members.md`) and doesn't replace anything. A member without a story looks and works exactly as before.

- **Admin:** Content → **Lives in Progress** (`/admin/lives`), learning authors only. The report is also linked from People & progress → **Lives in Progress report** (`/admin/lives#report`).
- **Learners:** Community → Digital Members (cards and the profile modal), each person's page (`/community/digital/<id>`), and the homepage card.

## What learners see

**The modal and the page.** A member with an episode that's out opens on their story (`LivesStory.tsx`) instead of the plain profile:

- **The hero:**
  - "Lives in Progress", their name, age and circumstances, and where they live;
  - the current episode's number, title and date, its quotation, a **New episode** badge until they've seen it;
  - **Follow**.
  - The picture fills the right of the hero (on a phone, it sits above the words). It's framed on a focal point: for their portrait, **Where the face is** in the Character Bible; for an episode picture, its own. The navy behind the words fades out before the picture's middle, so nothing covers the face.
- **Tabs:** Latest story · Her/His/Their story so far · About me (the existing profile, unchanged) · Our conversations.
- **The episode:** opening lines, their words, then **In her own words**, the audio diary:
  - The diary uses the Magazine's audio player: waveform, time, speed, replay and transcript.
  - It never autoplays.
  - Until a recording has been made and checked, the learner reads the diary instead.
- **Spend a moment with them:** up to six ways in, chosen per episode. None is required.
  - **Have a conversation** opens the chat with a question in mind.
  - **What would you do?** shows how the person reacts to each response. It's labelled a what-if, and it never changes the story.
  - **Another perspective** is someone from the supporting cast, in their own words.
  - **Reflect** is a question, then the person's own thoughts.
  - **Continue learning** links to a Topic, Magazine course or Discovery Path.
  - Links the reader can't open (unpublished, out of their audience, deleted) are left out.
- **Story so far:** every episode that's out, in order and grouped by arc. Each shows:
  - its thumbnail, number, date and a short description;
  - seen or not, whether there's an audio diary, and what kinds of interaction it has.
  - Opening an earlier one shows it as **an earlier chapter**, with a way back to the latest.
  - The next episode shows only its date and the current episode's teaser. Its title and words never leave the server.
- **Our conversations:** what the character remembers about this learner, in plain words. They can:
  - start a chat;
  - forget one conversation;
  - clear everything (it asks first, and it can't be undone).

**Homepage card.** Same size and place as before. For someone with a story it shows:
- "Lives in Progress", with **New** until it's seen;
- the episode's quotation;
- "New voice message · 32 seconds" when there's a checked recording, otherwise the episode number and title;
- **Continue her story**, or once seen, **Catch up with Mrs Alvarez**.

The card picks someone with a new episode first, otherwise usually someone with a story, and sometimes anyone, so every face still gets a turn.

**Community cards** carry a "Lives in Progress · Ep 03" label, and **New**.

**Placeholders.** An episode picture marked as a placeholder (a stand-in from the image library, which may show someone else) is never shown to learners. They see the character's own portrait instead. Only an author previewing sees the stand-in, labelled "Placeholder picture".

**Follow and notifications.** Following someone sends each new episode to the learner's Inbox ("Lives in Progress", one notice per episode), unless they switch notifications off for that person. Nothing is emailed.

## The chat, with memory

The existing Digital Member chat (`server/memberChat.ts`, `MemberChat.tsx`) is extended, not replaced. For a member with a Lives in Progress story (an approved Bible or an episode out), the brief gains four layers (`storyBrief` in `lib/livesInProgress.ts`):

1. **Identity:** the *approved* Character Bible. A draft is never used, and the authors' "still to reconcile" note is never sent.
2. **Narrative:** the published episodes up to the one being viewed. Each comes with what the character now knows or feels, and what changed.
   - Never an unpublished, scheduled or later episode.
   - A learner can't ask for one by id; only an author previewing can.
3. **Relationship:** this learner's own earlier chats with this character, newest first (six by default).
   - With none, the AI is told this is their first conversation and never to suggest otherwise.
   - "Start fresh" leaves them out.
4. **Current episode:** the episode on screen. An earlier one is "an earlier chapter": the character knows nothing after it, and only memories from that point or before are included.

Extra fixed rules (`LIVES_RULES`) come after the house rules:
- be a person, not a tutor;
- no exposition, don't praise every answer, it's fine to disagree;
- treat what-ifs as what-ifs;
- send clinical, regulatory, funding or policy questions to Ask Trilogy or Topics.

The house rules and the settings in Admin → Digital Member chat apply as before.

**What a chat is remembered as** (`rememberChat`, `rememberConversation`). The browser sends a conversation id with each message, and the server keeps one memory row per conversation:
- topics that came up, from a fixed list for that person (their supporting cast, their interests, everyday topics);
- up to three of the learner's questions and two of their suggestions.

What's never kept:
- phone numbers, email addresses, links and long numbers (they're scrubbed);
- any sentence about "my client" or a real person;
- the transcript;
- the AI's replies, so nothing the AI made up can become a "memory".

A "What would you do?" choice is remembered as a what-if, never as something that happened.

**Shared story vs individual chats.** Nothing a learner does changes an arc, an episode or a Bible. Conversations and decisions live in their own tables. The tests check that the episode rows are byte-for-byte the same after chats and choices.

## For authors (Admin → Lives in Progress)

| Tab | What's there |
|---|---|
| Characters | Every Digital Member with their Bible's state. The **Character Bible**: identity, personal history, personality, daily life, care context, media identity, where the facts come from, and "still to reconcile". Media identity covers the portrait and where the face is, reference and lifestyle pictures, the voice (ElevenLabs or OpenAI, from the Hub's voice list), delivery notes and the visual guide. Save a draft; **Approve** makes a numbered version. Changing an approved Bible lists what changes and needs a reason. A member with no Bible starts from their existing introduction, so nothing is lost. The **supporting cast** is edited here too. |
| Story Bank | The **Life Event Bank**: 44 starter events across all twelve categories, with category, profiles it suits, emotional impact, themes, complications, cast, resolutions and sensitivity. Search, add, edit, archive. Also every member's supporting cast. |
| Story Arcs | List and timeline (weeks across, arcs down) views. Each **arc** has its title, summary, starting circumstances, theme, cast, learning opportunities, behaviour change, planned episodes (any length), dates, schedule, resolution, life events and primary storyline. Arcs go draft → in review → approved, can be archived, and can be **duplicated** (episodes copied as undated drafts). Changing an approved arc sends it back to draft. **Worth checking** lists the rules-based consistency check. |
| Episodes | Inside an arc, an episode has its title, date and time, summary, the learner's opening lines, first person, card quotation and diary script. It also has what the character knows afterwards, outcomes, a teaser, pictures (with focal point, alt text, a placeholder tick and "what the real picture should show"), cast, learning links and the interactions. **Status:** draft → in review → approved → scheduled → published, or archived. Review and approval need the basics in place. Scheduling needs an approved arc and a future time. **Publish now** is there for an approved episode. Changing an approved or scheduled episode sends it back to draft. A published one can be corrected with a reason, which is audited. Reorder with the arrows (not across a published one). Only drafts can be deleted. |
| AI Story Assistant | Suggests a new arc from a brief (theme, duration, objectives, behaviour change, operational issue, cast, tone, number of episodes), drafts an episode, writes first-person dialogue and a diary, writes an image prompt from the visual guide, or reviews an arc. A review covers inconsistencies, authenticity, competencies, other perspectives, missed learning and balance. See "The assistant" below. |
| Conversational memory | How memory works; counts of memories and learners (never content); settings; and the exact brief the AI gets for any character at any episode (with your own memories, nobody else's). |
| Report | Counts only, for 7, 30, 90 or 365 days. See "The report" below. |
| Preview | Homepage card, then the story page in a phone-sized or desktop frame, at any episode including drafts. It covers the modal content, timeline, diary, conversations and a historical chat. Nothing is counted in preview. A chat from the preview is a real chat. |

**The assistant** reads the approved Bible, the cast, earlier arcs, published episodes, the Life Event Bank and the Hub's published learning titles. It doesn't see capability gaps: none are wired in yet. Cast members or life events it invents are taken out and the author is told. Nothing is saved until the author presses "Save as a draft arc" or "Put into the episode as a draft". It never schedules or publishes. It uses Claude when connected, otherwise OpenAI. Forty suggestions an hour per author; the audit says what was asked for, never what came back.

**The report** covers:
- story opens and the people who opened them;
- episode views and viewers;
- audio started and finished, diaries read;
- followers;
- conversations (from the chat's own log), and how many started from a story;
- interactions and linked learning opened;
- returning learners (two or more days) and the median days between visits;
- continuation from each episode to the next;
- people caught up on each arc;
- what-if choices as counts, not scores.

It says plainly that all of this is voluntary and isn't evidence of changed practice.

### Audio diaries

Recorded from the approved (or scheduled, or published) episode's diary, in the voice approved in the Character Bible, through the Hub's existing narration (`server/tts.ts`: ElevenLabs, or an OpenAI voice with the Bible's delivery notes).

- **Authors only.** A learner's page never records anything.
- **It asks first.** The first press returns the estimate (characters, and US dollars for OpenAI or ElevenLabs credits). Only "Record now" makes it.
- No voice in the Bible means no recording, so every episode sounds like the same person.
- The file is kept as a Hub upload, and the narration disk cache means the same words in the same voice are never paid for twice.
- Learners hear it only after an author ticks **I've listened**. If the diary script changes afterwards, the recording stops playing until it's made again.
- Forty recordings an hour per author. Each one is audited with its character count and estimate.

## Scheduled publishing

`publishDueEpisodes` publishes every scheduled episode whose time has passed. It runs:
- on every learner read (the story, the cards, the chat);
- every 15 minutes from the background worker (`server/worker.ts`).

It audits `lives.episode_published` (actor `scheduler`) and sends the followers' Inbox notices. It also deletes memories past their keeping date.

## Tables

All are created by `ensureLives` (`server/livesInProgress.ts`) with `CREATE TABLE IF NOT EXISTS`. No existing table changes, so there's no migration to run and nothing to back out.

| Table | Holds |
|---|---|
| `lip_bibles` | One row per member: the working draft, the approved copy, version, who approved it and when |
| `lip_bible_versions` | Every approved version, with its reason |
| `lip_cast` | Supporting cast, per member |
| `lip_life_events` | The Life Event Bank |
| `lip_arcs` | Arcs: the arc's fields as JSON, status, primary flag, author and approver |
| `lip_episodes` | Episodes: number, publish time, status, the episode's fields as JSON, the diary recording, review note, approval and publication |
| `lip_views` | Which episodes each learner has seen (first, last, count) |
| `lip_follows` | Who follows whom, and whether they want Inbox notices |
| `lip_memories` | Relationship memory: per learner, per member, per conversation. Holds the summary, details, episode, when, and when it expires |
| `lip_decisions` | Each learner's latest "What would you do?" choice per interaction |
| `lip_activity` | What learners did, for the report (kind, episode, voluntary, when). Life Moments use the `moment_*` kinds, with the moment's id in `detail` |
| `lip_moments` | Life Moments: member, arc and episode (optional), category, status, shared at, happens at, expires at, featured, priority, order, the moment's fields as JSON, and the voice message recording |
| `lip_moment_views` | Which moments each learner has seen |

Settings live in `settings` under `lives_in_progress`. One-off seeds are recorded as `lives_events_seed`, `lives_demo_seed` and `lives_moments_seed`.

Every author change is audited as `lives.*`: `bible_saved`, `bible_approved`, `arc_status`, `episode_status`, `episode_corrected`, `diary_recorded`, `assist`, `settings` and so on. A learner clearing their memory is audited as `lives.memory_cleared`, with the count only.

## Configuration

| Setting | Default | |
|---|---|---|
| `HUB_LIVES_DEMO` | Off on servers; on for `next dev` | `1` seeds the demo stories; `0` stops them on a dev server |
| Memory on or off | On | Admin → Lives in Progress → Conversational memory |
| Keep memories for | 180 days | 7 to 730. Shortening it applies to what's already kept |
| Memories given to the AI | 6 | The newest |
| Follow sends Inbox notices | On | The learner can turn it off per person |

The chat itself (on or off, who, limits, reply length, extra instructions) stays in Admin → Digital Member chat.

## Files

- `src/lib/livesInProgress.ts`: shapes, states, tidy-up, and the pure rules: what's out, what the character knows, what a chat is remembered as, the brief layers, and the consistency check.
- `src/content/livesInProgress.ts`: the Life Event Bank, and the demo Bibles, cast and arcs.
- `src/server/livesInProgress.ts`: tables, seeding, scheduled publishing, the learner's story, cards, activity, memory and chat context.
- `src/server/livesAuthoring.ts`: the admin overview, Bibles, actions, audio diaries, cost estimates and the report.
- `src/server/livesAssist.ts`: the AI Story Assistant.
- `src/components/community/LivesStory.tsx`: the learner's story (modal and page).
- `src/components/admin/LivesAdmin.tsx`, `LivesArcs.tsx`: the admin page.
- Routes:
  - `/api/community/lives/[id]` (GET the story, POST what the learner did);
  - `/api/community/lives/[id]/memory` (GET, DELETE);
  - `/api/admin/lives` (GET overview, `?bible=`, `?report=1`, `?estimate=1`; POST actions);
  - `/api/admin/lives/audio`;
  - `/api/admin/lives/assist`.
- Changed:
  - `server/memberChat.ts` (story layers, memory);
  - `MemberChat.tsx` (episode context, earlier-chapter note, memory note and Start fresh);
  - `DigitalMemberProfile.tsx` (the modal opens the story; `ProfileBody` reused as About me);
  - `HomePersona.tsx`, `DigitalMembers.tsx` (cards);
  - the Digital Members routes (story card, `lives` flag);
  - `server/worker.ts`;
  - `adminNav.ts`;
  - `app/community/digital/[id]/page.tsx` (story, `?episode=`, author `?preview=1`).
- Tests: `src/server/livesInProgress.test.ts`, `src/lib/livesInProgress.test.ts`.

## Demonstration content (demo Hubs only)

Seeded once, on a local development server or with `HUB_LIVES_DEMO=1`, never on Trilogy Care's servers otherwise. Everything is marked "Demo" in admin.

| Member | Arc | Episodes |
|---|---|---|
| Mrs Alvarez | The Garden Is Still Mine (6 weeks) | The PRD's six. 1–3 out, 4–6 scheduled weekly |
| Margaret Alder | In My Own Words (6 weeks) | 1–3 out, 4–5 scheduled, 6 approved but not scheduled |
| Mr Okafor | Steady On (7 weeks) | 1–4 out, 5 scheduled, 6 in review, 7 draft |

Dates are set from the day the demo is seeded: the current episode an hour before, the others a week apart. So on a demo Hub the scheduled ones really do publish each week.

- Each member has an approved Bible built from what the Hub already says about them, with new details listed under "still to reconcile".
- **Voices** (chosen by the owner on 25 November 2026, OpenAI `gpt-4o-mini-tts` with the Bible's delivery notes; one voice per person for diaries and voice messages alike):
  - Mrs Alvarez: Sage, as an 82-year-old woman from Mildura;
  - Margaret Alder: Shimmer, as a woman in her mid-eighties from Port Macquarie;
  - Mr Okafor: Onyx, as a man in his early eighties in Adelaide.
- **No audio is recorded by the seed.** An author records each diary and voice message from admin (it shows the cost first), then ticks that they’ve listened. On the dev Hub, the 17 demo diaries and 5 voice messages were recorded on 25 November 2026 with the owner’s approval (about US$0.09), and are reused from the cache.
- Episode pictures are **placeholders** from the image library, each with a description of the real picture. Learners see the character's portrait in their place.
- The Life Event Bank is seeded on every Hub. It's authoring material that learners never see.

**What learners would see in production:** nothing new until an author approves a Bible or publishes an episode. Members without a story keep the existing profile modal and card. To launch, an author needs to:
1. approve a Bible (and voice);
2. approve an arc;
3. move episodes through review to scheduled;
4. record and check the diaries, if wanted.

## Known limits

- Memories are rules-based (topics and the learner's own questions), not an AI summary. That's deliberate: nothing the AI said can become a "fact".
- The assistant doesn't yet read capability gaps or approved policy sources.
- Pictures can't be generated from here. The "what the real picture should show" note is for whoever makes them.
- "Voluntary vs mandatory" in the report: nothing in Lives in Progress can be assigned, so everything is voluntary.

## Life Moments: "Meanwhile, in their lives…"

Built from the owner's PRD *Meanwhile, in their lives…* (25 November 2026). Small moments from the Digital Members' days between episodes, in a horizontal row on the homepage. It's part of Lives in Progress, not a separate system:
- a moment belongs to a member, and optionally to an arc and the episode it follows;
- it can come from the Life Event Bank;
- it goes through the same states as an episode;
- its voice message uses the voice approved in the Character Bible;
- its numbers are in the same report.

### Where learners see it

- **On the homepage, directly under Your Favourites** (the owner's placement, not under the hero as the PRD says). Same container, corners, padding and theme as Favourites.
  - The heading: "Lives in Progress" with a small pulsing dot (still for anyone who prefers reduced motion), **Meanwhile, in their lives…**, and "Little moments from the people we support."
  - **Desktop:** five cards across (four on a laptop, three on a tablet), with arrows and **See all moments**.
  - **Phone:** one card with a peek of the next, swiped, with scroll snapping and no arrows.
  - It never scrolls or rotates by itself. The row is keyboard-scrollable.
- **Each card** shows:
  - a short picture: their portrait framed on their face, unless the moment has its own picture, and never a placeholder;
  - the category (icon and label), **New** until they've seen it, their name and an honest time;
  - a two-line headline, and their words or a line about it;
  - one main action and at most one quiet link.
- **What a card leads to:**
  - Most cards open their story in the same modal as everywhere else, at the episode the moment belongs to.
  - Some start a conversation with a first line ready ("Ask how she's feeling", "Send your congratulations"). This is the existing chat, with memory.
- **Voice messages:**
  - With a checked recording, the card's picture becomes the reduced IntroPlayer: Play, time, progress and transcript.
  - It never autoplays, and it's one sound at a time on the page (`lib/onePlayer`).
  - Without a recording, **Read her message** shows the words.
- **New chapters:** each person's latest episode appears as a "New chapter" card for two weeks. It's made from the episode itself, so there's nothing to keep in step.
- **See all:** `/community/moments` lists every moment that's out, newest first.
- A line under the row says the people and moments are fictional.

### Honest times

`momentWhen` (`lib/lifeMoments.ts`) uses only the real time a moment went out, in the reader's time zone:
- "Within the last hour", "This morning", "2 hours ago", "Earlier today";
- "Yesterday", "Earlier this week", "Last Friday", "Last week", then the date.

Something still to happen says "Coming up on Saturday" from its event date, and leaves the row the day after. Nothing is ever dated "just now" to look busy. A moment that isn't out has no label at all.

### Order, for each reader

Each reader's row is ordered (`momentFeed`) roughly as follows:
1. featured moments, in the order authors set;
2. each person's newest episode if the reader hasn't seen it;
3. recent moments;
4. people they follow;
5. people they've talked with;
6. things coming up;
7. people they haven't met.

Things they've seen drop back. No one person appears twice in a row where there's a choice, or more than three times.

**The relationship line.** "You last talked with Mrs Alvarez about Isabel. Here's what's new." It appears once per person, only on news since that conversation, and only from that learner's own stored memory (the topics). It never says the learner caused anything.

### The chat

Moments that are out are part of what the character knows ("Lately…", the six newest). An earlier chapter sees only moments from before it. Scheduled and draft moments are never in it.

### For authors (Admin → Lives in Progress → Life Moments)

- **Filters:** All, Drafts, Awaiting approval, Scheduled, Published, Archived; character, category and arc.
- **List and calendar.** The calendar shows six weeks, with each day's moments and the episodes going out that day.
- **The editor**, with the homepage card beside it:
  - category and Life Event Bank entry;
  - headline, a line about it, their own words, and the voice message script;
  - when it's shared, when it happens (for upcoming events), when it leaves the row, priority and featured;
  - arc and "follows episode";
  - the button (open their story, or start a conversation with a first line) and its words;
  - picture, focal point and placeholder;
  - "what the real picture should show" and "what it rests on".
- **States:** the same as episodes. A moment that follows an episode **can't be scheduled or shared before that episode is out**, or it would give the story away. Changing an approved or scheduled moment sends it back to draft; correcting a published one needs a reason.
- **Featured** moments can be put in order. Only drafts can be deleted.
- **Voice messages** use the same recording path as diaries:
  - the member's approved voice and delivery notes;
  - the cost is shown first, and nothing is made without "Record now";
  - the file is cached and kept as an upload;
  - learners hear it only after an author ticks they've listened.
- **AI Story Assistant:**
  - **Suggest** fills one moment's words from the Bible, what's published and a note.
  - **Propose a fortnight** suggests one to four weeks of moments across the chosen people, at the configured cadence. It knows only the dates of episodes still to come, never what happens in them. Unknown people or life events are taken out. Ticked proposals become drafts.
- **Categories and cadence:** the twelve built-in categories, plus any the author adds (label and icon). Cadence is about 1 to 5 moments a day across everyone (default 2), used by the fortnight proposals.
- **Report** (in the Report tab): cards seen, people, stories opened, messages played and finished, messages read, conversations started and people coming back on another day, plus the same by category. All of it is voluntary and none of it is evidence of changed practice.

### Demo content

32 moments seeded with the demo arcs (`content/lifeMoments.ts`): 12 for Mrs Alvarez, 10 for Margaret Alder and 10 for Mr Okafor. They're a mix of published, scheduled, approved, in review and draft. Five are voice messages ready to record.

Every moment is dated from its arc's current episode, so story-linked moments always come after their episode. A test checks this.

New details are listed in `RECONCILE`:
- Mrs Alvarez: her husband's label on the first rose.
- Margaret Alder: knitting, the photographs, jasmine, forty-one Christmas cards, and Dana's birthday (in review).
- Mr Okafor: his mother's kitchen radio, and a grandson finishing school (draft).

The PRD's examples (Robert's 85th birthday; Margaret's grandson with groceries) aren't used, because they contradict or aren't in canon.

### Files

- New:
  - `src/lib/lifeMoments.ts`, `src/content/lifeMoments.ts`, `src/server/lifeMoments.ts` (+ test);
  - `src/components/community/LifeMoments.tsx`, `src/components/admin/LivesMomentsAdmin.tsx`;
  - `src/app/community/moments/page.tsx`;
  - routes: `/api/community/moments` (GET feed, `?all=1`; POST seen, open, play), `/api/admin/lives/moments` (GET, `?report=1`, `?estimate=1`; POST actions) and `/api/admin/lives/moments/audio`.
- Changed:
  - `app/page.tsx` (the row under Favourites);
  - `lib/livesInProgress.ts` (settings, activity kinds, the chat's "Lately" layer);
  - `server/livesInProgress.ts` (tables, scheduled moments publish with episodes, the chat sees moments);
  - `server/livesAssist.ts` (moment and fortnight proposals);
  - `DigitalMemberProfile.tsx` (the modal opens at an episode);
  - `LivesAdmin.tsx` (the tab and the report).

## The Living Calendar

Built from the owner's PRD *Living Calendar* (25 November 2026): the Digital Members' lives by the day, on **Community → Living Calendar** (`/community#calendar`), a tab beside Digital Members. The homepage row's **Explore the Living Calendar →** goes straight there.

It's a chronological view over Lives in Progress, not a separate events store. One Life Moment is one record, wherever it appears: the homepage row, the calendar, the modal, the chat and the report.

### What's on it

Each day shows:
- **Shared moments**, on the day they happen (their fictional date, `eventAt`, or else the day they were shared).
- **Episodes**, on the day they came out, with the diary's player if there is one.
- **Coming up:**
  - A moment still to come appears only if an author ticked "show ahead", and only as its **teaser** ("Mrs Alvarez turns 83", "Dana is coming for Christmas lunch").
  - Its headline, words, outcome and recording stay on the server until it's shared.
  - An episode that's due shows as "A new chapter in Mrs Alvarez's story", without its title.
- **Routines** (new table `lip_routines`): the usual shape of the week, from the Character Bible ("Isabel visits every Sunday at 12 pm").
  - A past occurrence is shown as **Usual routine**, never as something that happened.
  - If a shared moment comes from that routine on that day, the moment shows instead.
  - Routines can be weekly, fortnightly, monthly (a date, or the second Friday) or annual, with start and end dates, single-day exceptions and cancellations, and pauses with a reason ("While his hip heals").

Every rule is applied on the server (`livingCalendar` in `server/livingCalendar.ts`), in the reader's time zone.

**Shared events.** A moment or routine can include other Digital Members (`alsoMembers`). It's one record, shown on each person's calendar with all their portraits.

### The page

- **Header:** "Lives in Progress", "Living Calendar", the subtitle and supporting copy, and the fictional disclaimer.
- **Who:** Everyone, People I follow, or any number of people (portraits, names, and a quiet colour dot per person). With one person chosen, the heading reads "A month in the life of …".
- **What:**
  - All moments, Everyday life, Voice messages, Celebrations, Story developments, Upcoming events, Unseen updates.
  - Filters stay as you change month, and in this browser next time (`localStorage`, wrapped in try/catch).
- **The month:**
  - Monday first, with previous, next and **Today**. Today is marked and selected when the page opens.
  - On wide screens a cell shows up to two entries (colour dot, icon, title, an unread dot) then "+ n more". On a phone it shows dots, with the day's detail below the calendar.
  - Desktop splits about 70/30 between the calendar and the day panel.
- **Keyboard and screen readers:**
  - The grid is one tab stop. Arrow keys move a day or a week, Home and End go to the start or end of the week, Page Up and Page Down change the month, and Enter or Space chooses the day.
  - Every day has a full label ("Wednesday 25 November, today: 3 moments, Mrs Alvarez, Margaret Alder"), and focus is visible.
- **The day panel:** each event shows who (portraits), what kind, the time, the title, the words and the quote. It then offers one of:
  - a voice message or diary in the shared `VoicePlayer`, with the transcript;
  - "Continue her story" (the modal, at the episode);
  - a conversation with a first line ready.
  - An empty day says "A quiet day in their lives." Nothing is invented to fill it.

### Voice players (owner feedback)

On cards and in the day panel, a recording plays from `VoicePlayer` (`LifeMoments.tsx`). It uses IntroPlayer's new `posterControls="below"`: the picture stays clear of controls, with Play, label, time and the live caption in a row underneath. The Discovery Path poster keeps the default (`"overlay"`).

The Play button's accessible name now follows the `label`: "Play Mr Okafor's message, 0:22", "Play Mrs Alvarez's diary". The default stays "Play the introduction".

It's still one sound at a time on the page, and it never autoplays.

### For authors (Admin → Lives in Progress → Life Moments)

- **Calendar view:** a month with every moment in any state, episodes and routine days.
  - Click **+** on a day to add a moment there.
  - Drag a moment that isn't shared yet to another day (`moment.reschedule`). It keeps its times. It can't move before the episode it follows, and a scheduled one can't move into the past.
- **Review of the month** (rules, not a model): the same headline twice for one person, more than two moments for one person on one day, a moment before the episode it follows, a moment from a routine on a day the routine doesn't happen, and care well above its target. The month's **balance** shows against the targets.
- **Routines:** add, edit, approve, archive, delete drafts. Changing an approved routine sends it back for approval. Approval needs a name, a start, its days and where it comes from in the Bible.
- **Propose a fortnight or a month** ("Generate a month"):
  - Covers the chosen people, with a number of voice messages.
  - The prompt includes their routines, the season (late November to February is summer) and the balance targets.
  - Everything becomes drafts.
- **Categories and cadence** also holds the **editorial balance** (everyday and routines 35%, relationships 25%, celebrations 15%, story and reflections 15%, care 10%, all configurable) and the serendipity settings below.
- **Six new built-in categories** for the PRD's event types: Personal milestone, Family visit, Hobby or interest, Appointment, Community activity and Quiet moment.

### A little serendipity

The owner's principle. It applies to proposals and the demo; publishing is always at the scheduled time.

- **Who decides timing:** `spreadSchedule` (`lib/livingCalendar.ts`) gives each proposed moment its day and time. The model only supplies the words.
- **Uneven days:**
  - up to `maxPerDay` on a day (default 3);
  - about `quietDays`% of days with nothing (default 15%);
  - nobody on two days running unless allowed.
- **Times by kind:** birthdays and celebrations in the morning, reflections and quiet moments in the evening, voice messages in the afternoon, story developments on weekdays only. Minutes vary.
- **Deterministic:** the same people and dates always give the same schedule, so it's testable and doesn't change on reload. The settings live in Categories and cadence.
- **The demo** is spread the same way: uneven days, varied times, quiet days (a test checks this).
- **The feed** shows a moment only once its scheduled time has passed. Times stay honest.
- **Notifications** (`notifyDaily`):
  - At most **one per learner per person per day**, in their own time zone. A second thing that day updates the same Inbox notice ("Mrs Alvarez: 2 new things today").
  - Only for episodes, voice messages, celebrations and milestones (birthdays), and upcoming events an author marks.
  - Never for everyday moments, and only for followers who kept notifications on.

### The chat

The brief now also has:
- **"Your usual week"**: their approved routines, noting that a particular day only happened if it's in their story;
- **"Coming up"**: the next 60 days' approved teasers, with the instruction "you don't know how they'll go, so don't say".

Looking back at an earlier chapter leaves out what's coming. Nothing a learner says changes the calendar.

### Report

The Report tab has a Living Calendar section: visits, people, days explored, filters used, events opened, and people coming back another day. Voice plays, conversations and follows from the calendar count with Life Moments. All of it is voluntary.

### Demo content

Seeded once on a demo Hub (keys `lives_calendar_seed` and `lives_calendar_moments_seed`), marked Demo, from October to the end of January.

- **Six routines**, two per person:
  - Mrs Alvarez: Isabel's Sunday visit, and Kylie on Tuesdays.
  - Margaret Alder: Dana's Sunday call, and cleaning every second Thursday.
  - Mr Okafor: Emeka on Sundays, and the library van on the first Saturday of the month, paused while his hip heals.
- **16 more moments:** October's everyday life before the arcs, then Christmas and New Year, a doctor's check-up, a birthday, a knitting group, a library talk and a heatwave. Upcoming ones are shown ahead by their teasers only.
- **Quiet days** are left quiet.
- **No shared multi-member demo event:** the three live in Mildura, Port Macquarie and Adelaide (Community Atlas). The feature is tested instead.
- **New details are listed in `CALENDAR_RECONCILE`.**

### Files

- New:
  - `src/lib/livingCalendar.ts` (+ test), `src/content/livingCalendar.ts`, `src/server/livingCalendar.ts` (+ test);
  - `src/components/community/LivingCalendar.tsx`, `src/components/admin/LivesCalendarAdmin.tsx`;
  - routes `/api/community/calendar` and `/api/admin/lives/calendar`.
- Changed:
  - `Community.tsx` (the tab);
  - `LifeMoments.tsx` (the calendar link, `VoicePlayer`, the voice card);
  - `IntroPlayer.tsx` (`posterControls`, and the Play label);
  - `lib/lifeMoments.ts` (categories; time, shared members, cast, show-ahead teaser, notify, routine);
  - `lib/livesInProgress.ts` (balance and variety settings, calendar activity kinds, the chat's routines and coming-up);
  - `server/livesInProgress.ts` (`lip_routines`, daily notifications, chat);
  - `server/lifeMoments.ts` (reschedule, add-on-a-day, reusable demo seeding);
  - `server/livesAssist.ts` (month mode, serendipity);
  - `LivesMomentsAdmin.tsx`, `LivesAdmin.tsx`.

## Check in: People I follow

Built from the owner's brief *Check in* (25 November 2026): a light way to see how someone you follow is getting on, without going to Community, opening a profile and starting a chat.

### Where and what

- **On the homepage, beside Your Favourites** (the owner's layout): two separate containers in one row, People I follow on the left and Favourites on the right.
  - On wide screens they're half each and the same height; on narrow screens they stack, People I follow first.
  - Expanding a catch-up grows its own container, and the row grows with it.
  - Only shown when the learner follows someone. If they follow nobody, it shows nothing and Favourites takes the full width (a column is made only for what's shown).
  - "Meanwhile, in their lives…" comes after the row.
- **"People I follow"** and "Take a moment to check in." There's one compact card per person, showing:
  - their portrait and name;
  - a line from their life, which is (in order of preference) the newest shared moment from the last week, an approved upcoming teaser ("Coming up: …"), their current story, or their tagline;
  - "Last conversation · 3 days ago" or "You haven't spoken yet";
  - **Check in** (or **Say hello** if they've never spoken).
- **The catch-up opens in place.** No modal, no page change, no big chat window. Focus moves to the person's name, and **Finish catch-up** closes it and returns focus to the card's button. It shows:
  - the character's opening line;
  - the conversation;
  - "Not sure what to say?" chips, and a message box;
  - "Fictional character · Conversation memory on".
- It works on a phone (the card takes the full width) and with a keyboard.

### It's the member chat, not a new chatbot

- **The endpoint:** messages go to the existing `/api/community/digital-members/chat` with `mode: "checkin"`, so the house rules, limits, settings, four-layer memory, the Living Calendar's routines and coming-up, and the report all apply as before.
- **The opening line** (`checkInOpener`, `lib/checkIn.ts`) is written by the Hub, never the model, and worked out again on the server for the AI (the browser can't supply it):
  - With no stored conversation: "Hello! I don't think we've met before. I'm Mrs Alvarez. It's nice of you to say hello."
  - With one: "Hello again! Last time we were talking about Isabel." (the topic the learner's own memory holds), plus their own words from a moment shared since. A quote that would need context ("She brought a cake…") is left out.
  - The conversation in progress is never counted as "last time".
- **Starters** (`checkInStarters`): up to four, from the current arc ("How are you feeling about everything at the moment?"), a recent moment (good news, a voice message, a visit), the learner's own memory ("Any news about Isabel?"), an approved upcoming teaser, and the Bible's interests ("Tell me about your roses."). After that, the reply's own three follow-ups.
- **Natural endings** (`CHECKIN_RULES`): replies are short and warm. After about four, the character may close in their own way (something to get on with; they'll let you know how something goes), but they keep talking if the learner does.
  - No guilt about time away.
  - Never suggests they rely on, wait for or need the learner.
  - Mentions an earlier chat only if it's in memory.
- **No points, no streaks.** Nothing is marked as learning. The report counts catch-ups opened (`checkin_open`) alongside the other voluntary activity.

### Spoken replies (off by default)

The "Hear it" control is under each of the character's replies. It's disabled, with "Spoken replies are off on this Hub", until an author ticks **Check in: learners can hear a character's replies spoken** in Admin → Lives in Progress → Conversational memory.

When it's on:
- Each reply is a **live, paid** speech request in the character's approved voice and delivery notes: about **US$0.005 for a 300-character reply** with OpenAI `gpt-4o-mini-tts` (US$15 per million characters, to verify). The narration cache means the same words are never paid for twice.
- **Guards** (`checkInVoice`):
  - the learner must follow that person;
  - the words must be one of that character's recent replies to that learner (kept in memory on the server by hash), so the endpoint can't be used to read out anything else;
  - 900 characters at most;
  - 30 an hour per learner.
- It plays only when pressed, and one sound at a time on the page (`lib/onePlayer`).

### Files

- New:
  - `src/lib/checkIn.ts`, `src/server/checkIn.ts` (+ test);
  - `src/components/community/CheckIn.tsx`;
  - routes `/api/community/check-in` (GET the cards, POST "opened") and `/api/community/check-in/voice` (POST, MP3).
- Changed:
  - `server/memberChat.ts` (`mode: "checkin"`: the Hub's opener, `CHECKIN_RULES`, replies remembered for the voice check);
  - `lib/livesInProgress.ts` (the `checkInVoice` setting, off by default, and the `checkin_open` and `checkin_voice` kinds);
  - `app/page.tsx`;
  - `LivesAdmin.tsx` (the setting);
  - the chat route (passes `mode`).

## The narrative ecosystem: the admin overview

At the top of Admin → Lives in Progress (`/admin/lives`), the six parts appear as connected cards, in order, with a quiet line joining each to the next:

1. **Character Bible**: who they are.
2. **Living Calendar**: what they're doing.
3. **Life Moments**: what's happening in their lives.
4. **Story Arcs**: how their lives evolve.
5. **Conversational Memory**: what we've spoken about.
6. **Check In**: how we maintain a connection.

Each card is a labelled region with a real heading. It has live counts from the tables (`livesOverview`, `server/livesOverview.ts`, served at `/api/admin/lives?overview=1`), a **Needs attention** box when something's waiting, and a button into its tab.

| Card | Counts | Needs attention |
|---|---|---|
| Character Bible | Approved; drafts or changes waiting; still-to-reconcile notes | "Bill: no approved Bible" (anyone with stories, moments or routines but no approved Bible); Bibles with changes waiting |
| Living Calendar | Routines active and paused (a pause covering today); events this month (moments by their date, plus episodes); routine days this month | Routines waiting for approval; the month's review (duplicates, crowded days, spoilers, routine clashes, too much care) |
| Life Moments | Scheduled; published this week; awaiting approval | "2 moments awaiting approval"; voice messages not recorded or checked |
| Story Arcs | Active arcs; episodes due in the next week (and which) | Episodes in review; the consistency check's flags per episode ("Okafor ep 06: teaser gives away the next episode's title") |
| Conversational Memory | Learners with memories; memories kept; how long they're kept | Memory switched off |
| Check In | Learners following someone; follows; check-ins opened this week | Spoken replies switched on (each one is paid) |

Below the cards, **"Who has what set up"** is a row per character with anyone in Lives in Progress. A tick (or "Not set up yet" for screen readers) means, in turn:
- an approved Bible;
- an approved routine;
- a moment shared or scheduled;
- an active arc;
- at least one learner's memories;
- at least one follower.

It's all counts: nothing anyone said is read or shown. Cards stack on phones, sit two across on tablets and three across on wide screens, in light and dark themes.
