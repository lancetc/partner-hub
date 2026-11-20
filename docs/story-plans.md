# Story Plans, recurring characters and voiced check-ins

Built from the PRD *Story Plans, recurring characters and voiced check-ins* (20 November 2026). This note records how the first build works, the decisions made, and what's left. It covers all six of the PRD's build steps. Steps 1 to 5 came first; step 6 (AI proposals and the story report) was added on 21 November 2026 and is described under "AI proposals" and "The story report" below.

In Administration: **Content → Characters and stories** (`/admin/characters`). Learning authors only.

## What it is

A fictional learning case history. A small cast returns across Topics and Magazine courses, so learners see how a person's circumstances and preferences change, and an author plans one coherent story before choosing blocks.

It is separate from any client record, complaint, incident or care plan. Everyone in it is fictional, and every learner-facing surface says so.

Four rules hold everywhere:

- **Shared story changes only by approval.** A character's canon is an approved profile and approved episodes. Nothing a learner does in a practice activity changes it.
- **Story order is not publishing order.** Each episode has a place in the story. An earlier event can be written and published later.
- **A placement pins a version.** A story moment placed on a page shows the exact approved version it was placed with, until an author updates that placement.
- **Engagement is not evidence.** Opening a check-in, playing audio or watching a transmission is never an attempt, a completion or a learning outcome.

## The pieces

| Piece | What it is |
|---|---|
| Character | A person in the photo library, with a story profile beside it: who they are, what matters to them, relationships, approved facts, portrayal notes, visual guide, voice, steward, audience |
| Episode | One event in the shared story: a summary, when it is in the story, who's in it, what's different afterwards |
| Appearance | A link from an episode to the Topic, course, page or other Hub place that tells it |
| Story moment | Something a character says in a Topic or course: one typed, versioned record with five kinds |
| Placement | Where an approved moment sits: on a Topic card, at the top of a Magazine page, or before or after a block |
| Story Plan | The author's plan: purpose, anchor character, perspective, tension, decision, effect, transfer, sources, and ordered beats |

### Story moments

| Kind | What the learner gets |
|---|---|
| Opening transmission | The host sets the scene and states the first decision; a story event cuts it off. With a video, the full end sequence below |
| New information | A few approved lines that change the problem, and what to do next. No stage, no wait |
| Person's response | The person, in their own words. Marked as one possible response in the practice story when it depends on the learner's choice |
| Debrief | What was assumed, what changed, and one action for work |
| Later check-in | A modest **Check in with [name]** cue that opens an update, up to four authored questions, and the character's story so far |

All five render through the same contract in a Topic and in a Magazine page. Only the opening transmission has the end sequence.

## Characters and canon

The existing photo library is unchanged. A story profile sits beside a character's row, so one person has one name, one portrait and one story.

- **Draft and approved.** The draft is free to edit. Approving makes a new numbered, immutable version.
- **Changing approved canon** needs a reason. Before approving, the page lists what changes (facts added, changed or removed; relationships; voice) and **what already tells this story**: every appearance and every placed moment. None of those change by themselves.
- **Steward.** Where the steward is a named Hub user, only they or a superadmin can approve. Where it's a team name, any learning author can, as for the rest of publishing.
- **Audience.** A character can be limited to Care Partners, Care Coordinators or Trilogy Care staff. Outside that audience they aren't suggested, shown or listed.
- **Voice.** One approved synthetic voice per character, kept across episodes. Changing it is a canon change with a reason.

Approving a character does not approve any operational instruction in a course. Those keep their own reviewers.

## A learner's view

### Check in with [name]

Opened from a cue the author placed. It doesn't autoplay, doesn't count towards completion, and closes back to where the learner was (Escape works, and focus returns to the cue).

- **Update**: the approved message, labelled with its in-story time, with a Listen button if a checked recording exists. The text is always visible.
- **Ask**: up to four authored questions, each revealing an approved answer. Nothing is generated when a learner asks. There is no free-text box.
- **View [name]'s story**: who they are, then their appearances in story order.

### History and spoilers

History is read **up to the episode the moment belongs to**. Later appearances are counted and held behind **Show later appearances**, and their titles and summaries aren't sent to the browser until asked for.

An appearance the learner may not open is left out entirely: no title, no summary, no count. Topics follow the challenge lock; courses follow their audience and must be published.

### The opening transmission

One controller (`txNext` in `lib/story.ts`) owns every step, and each timed step is a single timer that's cleared when the step changes or the page goes.

| Step | What happens |
|---|---|
| Ready | The still, **Play transmission**, **Skip to activity**, and the transcript |
| Opening static | 0.5 s of interference, then the video. Sound starts with the picture |
| Playing | The video, with captions and the normal controls |
| End flash | One 0.3 s pulse of interference over the last frame |
| Frame hides | A 0.2 s fade |
| Empty stage | **3,000 ms**, counted from when the frame has gone. The stage keeps its size. **Skip wait: begin now** is there throughout |
| Poster | The still fades in over 0.5 s, with the learner's role, the instruction, **Begin: …** and **Replay transmission** |
| Begun | Focus moves to the activity it hands over to |

Measured in the browser on a test clip: static 510 ms, flash 317 ms, fade 218 ms, empty stage 3,021 ms, with the stage height unchanged throughout.

- A second `ended` event, or a late timer, changes nothing.
- **Skip** or a **playback failure** goes straight to the instruction and the activity, with no wait.
- **Leaving the tab** during the ending settles on the poster instead of revealing late.
- **Reduced motion**: no static, flash, fade or wait.
- **No video**: the words, the instruction and Begin. A voiced recording can be played if there is one.
- The last frame is copied as the video plays, so the ending never depends on the player holding it. An approved end-frame still can be used instead.

A transmission with a video can't be approved without its still, its captions, and a tick that someone has watched it and the video, captions and still match the script and the same person.

## For authors

### Story Plan

Reached from **New story plan**, or from **Plan a story** on a Problem desk theme's Learning plan step, which prefills only the behaviour, barrier and audience already recorded there. A plan is never a gate.

- **Three ways in**: plan a story, use a short example, or continue without a story. You can switch later.
- **Find a fitting character.** Rules, not a model. Candidates are filtered first (approved, and allowed for the audience), then ranked on how their approved facts, what matters to them and their episodes connect to the behaviour. Each comes with reasons and any tension. A practitioner such as Ava is flagged as a host, not offered as the person it's happening to. An unrelated character is flagged, not dressed up as a fit. **Create a new character** and **No continuing character** are always there, and choosing against the first suggestion asks for a reason.
- **Beats**: person's goal, work situation, complication or clue, learner choice, consequence, another perspective, transfer. Reorder, drop or add. Each beat can name a character, an episode, a learner action, a block, whether it's explanation, practice or assessment, and its story moments.
- **Check continuity** flags: an unapproved or out-of-audience character (the second is blocking), a relationship the approved profile doesn't have, beats running backwards through episodes, an unapproved episode, no learner choice, a choice with no consequence, nothing to transfer, a consequence written as shared history, no named source, an unapproved moment, an opening that isn't first, and a character collecting too many problems. A warning can be fixed or answered with a recorded explanation.
- **Outline.** One step per beat, as Topic cards or Magazine pages. Each block says **why this block here**. Only blocks in the registry are offered. **Start the Magazine draft** makes an ordinary draft with a page per step; nothing is published and the blocks are still yours to add.

### Voice

Recorded from the **approved** script and each approved answer, in the speaker's voice, through the Hub's existing ElevenLabs connection.

- Only an author can start a recording, and it asks first because it's charged. A learner's page never triggers one.
- Only the approved fictional words are sent to the provider.
- Recordings are stored as Hub uploads against the exact version they were made from. A new version starts with none.
- Learners hear nothing until an author ticks **I've listened: every recording matches**. Until then, and if audio is removed or the provider is down, the text does the job.
- Limit: 40 recordings an hour per author. Each run is in the audit log with its character count.

### Placing a moment

Only an approved moment can be placed, and only somewhere that exists. In a Topic, full-screen presenter videos and listening cards have no room beside them and aren't offered. In a Magazine course, a moment goes at the top of a page, or before or after a block.

When a moment gets a new approved version, each placement shows **Update to version n**. Until an author presses it, that page keeps the words and the recording it had.

### AI proposals

A model may draft. It never decides. There are four proposals, each asked for with a button and each shown beside what the author already has:

| Proposal | Where | What it gives |
|---|---|---|
| **A plan from the purpose** | A Story Plan | Who it happens to (only from the characters the rules already connect to the behaviour, or "new", or none), the plan's fields, and three to nine beats, each with its blocks and a "why here". |
| **A second look at continuity** | A Story Plan | Up to eight concerns the rules can miss: a contradiction, something unsupported, an order problem, a changed relationship, the wrong audience, an unanswered beat, repetition, or a learner's branch written as shared story. |
| **A next episode** | A character's Story timeline | A title, summary, in-story time, what changes and who is in it, with each person's "never" line shown beside it. |
| **A script** | A story moment | The five transmission beats, or a check-in's update and two to four questions, or a return moment's words. |

What holds it in:

- **It only sees approved canon.** The author's own plan, and approved profiles, facts and episodes for people the plan's audience may meet. No draft profile, no draft episode, no Problem desk case, no source document. A script is given the story only up to the episode its moment sits at.
- **What comes back is read against the Hub's lists** (`lib/storyAssist`). A character with no approved profile, a block the Hub doesn't have, a fact id that isn't real, or a continuing character the rules don't offer is taken out, and the author is told what was taken out.
- **Every proposal shows what it leaned on**: each approved fact, whose it is, and at which profile version. A proposal that cites nothing says so.
- **Work guidance is flagged.** A beat or a line that states a rule is marked as needing an approved source. Fiction is never the source.
- **A consequence always belongs to the learner's own attempt**, whatever the model says.
- **A script may not recite a character's history word for word.** Ten words in a row from an approved fact and the draft is refused: a returning character's past is referred to in a phrase.
- **Nothing is saved by asking.** The author takes a field, a beat or a line at a time. A script lands in the moment's draft and still has to be approved; the approved version learners get, and any recording, don't change. An episode goes into the ordinary form and is saved as a draft, which becomes shared history only when a steward approves it.
- Claude when it's connected, otherwise the Hub's OpenAI connection. Forty proposals an hour per author. The audit record says a proposal was asked for and about what, never what it said.

**Checked live** on the sample plan, Ava's opening and Dot's timeline, through the OpenAI connection, with nothing saved. What that showed:

- The model named an episode as the continuing character. It was taken out and said so, and the screen now shows no proposal for that choice instead of "no continuing character".
- It left citation ids such as `[dot:roses]` inside script lines. Those are now lifted out of every proposed text and counted as citations.
- It twice left out the wording for the Begin button, which failed the whole draft. That wording is now optional.
- It adds small inferences of its own ("the relay van", hands that "slow her down a bit"). The checks can't see those. The author and the steward still have to read every proposal as a draft.

## The story report

**Characters and stories → Story report.** One date range, and three kinds of figure kept in their own sections:

- **Reach and engagement**, by character, by approved episode, and by moment at each approved version (so a revised script can be compared with the one before it). Learners reached are people who were shown a moment, started a transmission or opened a check-in. Also check-ins opened, questions chosen, history opened, links followed, audio played, transmissions started, played to the end and skipped.
- **Learning evidence**: the decisions on the Magazine pages those moments sit on, as the course scored them: learners who answered, their first answer, and who tried again. Every learner, whether or not they opened a check-in. Moments placed in Topics are counted and pointed to Completions.
- **Work results**: each plan that began on the Problem desk, with that theme's own measure, owner, lag and review date.
- **Things to look at**: story links learners can't open, moments placed somewhere that has gone, placements still showing an earlier version, plans with unanswered continuity warnings and a course under way, plans that promise a decision and give no practice at it, characters the rules keep suggesting and authors rarely choose, and check-ins most people open and then choose nothing. For revising a sequence or retiring a check-in; not a score.

A figure resting on fewer than ten learners is marked "few". Counts of people only: no answer a learner gave and nothing they typed. On this machine the report was seen with its empty state only (no moment is placed); its figures are covered by tests.

## Events

Kept in their own table, apart from attempts and completions: `story_check_in_opened`, `story_question_selected`, `story_audio_play_started`, `story_history_opened`, `story_appearance_link_followed`, `story_moment_shown`, `ava_transmission_started`, `ava_transmission_ended`, `ava_transmission_skipped`, `ava_poster_shown`.

Each has the character, moment and version, the content it was in, the learner's audience, when it happened, when it arrived, and a key so a resend records nothing new. An author's preview records nothing.

## The pilot

Added once per Hub, marked **Sample**. It's approved so the pilot can be tried, and it's there to be edited: review each profile before using it with real learners.

- **Dot.** Her facts are the ones the Hub already tells about her: the roses (Door Explorer), bowls on Thursday mornings, her cleaner Lena and her daughter Fiona (A Coordinator's Day), and her hands and buttons (Red Pen). No voice yet.
- **Fiona**, Dot's daughter.
- **Ava**, a fictional care coordination practitioner and the stories' host, with the PRD's proposed history: the Outback Relay, the Mrs Bell library request, the notebook headed "What did I miss?". Voice: Claire, the Hub's default Australian narrator.
- **Episodes**: Thursday without Lena; The library request; Dot and the roses; A morning at the markets; and a proposed draft, An invoice that looks right.
- **Moments**: Ava's opening, what Fiona actually fears, Dot's response, Ava's notebook, and a later check-in with Dot with three questions.
- **A Story Plan**: "Dot and the roses: ask before you suggest".

Nothing is placed in any real Topic or course. Ava's three moments have recordings waiting to be listened to and ticked.

## Where things live

| What | Where |
|---|---|
| Types, canon rules, transmission controller, suggestions, continuity, outline | `src/lib/story.ts` |
| Reading, actions, voice, learner history, events, seeding | `src/server/story.ts` |
| Tables | `STORY_SCHEMA` in `src/server/db.ts` |
| Pilot content | `src/content/storyPilot.ts` |
| Learner components | `src/components/story/StoryMoments.tsx` |
| Admin screens | `src/components/admin/story/`, `src/app/admin/characters/` |
| AI proposals: what a reply may contain | `src/lib/storyAssist.ts` |
| AI proposals: what a model is shown | `src/server/storyAssist.ts` |
| Proposal review screens | `src/components/admin/story/StoryProposals.tsx` |
| The story report | `src/server/storyReport.ts`, `src/components/admin/story/StoryReportView.tsx` |
| API | `src/app/api/admin/story/route.ts`, `src/app/api/story/route.ts` |
| Hook-ups | `GuideReader.tsx` (Magazine), `LessonPlayer.tsx` (Topic) |

### The PRD's records, and what they became

| PRD record | Here |
|---|---|
| `character` | The existing `characters` row, plus `character_profiles` |
| `character_revision` | `character_revisions` |
| `story_episode` | `story_episodes` |
| `story_plan` | `story_plans` |
| `character_appearance` | `story_appearances` |
| `character_check_in`, `story_moment`, `ava_transmission` | One table, `story_moments`, with `story_moment_revisions` |
| `voice_asset` | The `audio` on a moment revision, pointing at Hub uploads |
| `story_interaction_event` | `story_events` |
| (placement) | `story_placements` |

No second content, assessment or complaint system: courses, Topics, uploads, the voice connection, audiences and the audit log are the Hub's own.

## Decisions for Trilogy Care

| Decision | What's in place | Whose call |
|---|---|---|
| Is Ava's Outback Relay history final? | Editable sample canon | Partner Enablement and the editorial owner |
| Is Ava the same person as the Topic presenter called Ava? | Not decided. The existing presenter introduces herself as a synthetic presenter; this Ava is a fictional practitioner. Flagged in her portrayal notes | Product and content owner |
| Is Ava the AI Learning Guide? | Kept separate. The Guide is one openly-AI host set by a superadmin; Ava is a character with a history | Product and content owner |
| Which voices and licence? | Ava uses the Hub's default narrator voice. Confirm provider terms before real use | Platform, procurement and content owner |
| Dot's voice | None chosen. Nothing on the account suits an older Australian woman without caricature | Content owner |
| Who stewards each character? | "Partner Enablement" as a team | Partner Enablement and Quality |
| May a character be based on a real client? | Fictional or reviewed composite only | Privacy and Quality |

## Not built yet

- **Proposals inside the Topic and Magazine editors.** They are in the Story Plan, moment and character screens. The editors' own assistant doesn't know about Story Plans.
- **A proposal for a whole new character profile.** An author still writes a new person by hand.
- **Changes within a field.** A proposal is taken or left a field, a beat or a line at a time; there is no word-by-word diff.
- **Topic evidence in the report.** Learning evidence is the Magazine's decisions. A Topic's answers stay in Completions.
- **A way for a learner to say a check-in was confusing.** The report infers it from check-ins opened with no question chosen.
- **Ava's video.** No transmission video exists. The player, the editor and the checks are ready for an approved clip, still and captions.
- **Building a Topic from a plan.** The Topic outline is shown to write from; only a Magazine draft can be started from it.
- **The Story Plan step inside the Topic and Magazine editors.** Plans are reached from Characters and stories and from the Problem desk.
- **Moments in the middle of a Topic card's flow.** A moment sits on a card; it can't wait for that card's decision to be made.
- **A background queue for recordings.** They're made while the author waits, a few seconds each.
- **Portraits for Dot, Fiona and Ava.** Generate them from Character photos when you want them.
- **Open conversation with a character.** A separate product decision, as the PRD says.
