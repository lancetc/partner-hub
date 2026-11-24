# One Day, Five Perspectives

Built from *Partner Hub: One Day, Five Perspectives — Coordinator Journey Map* (PRD). This note records what v1 does, the decisions made, and what's still needed before live publication.

In the Magazine editor: **Add block → Simulate → One Day, Five Perspectives** (`onedaymap`). It starts from Leila's Monday as a draft.

## What it is

A learner follows a **fictional** working Monday with Leila, a Care Coordinator, across three people's stories:
- **Mrs Patel** wants a reliable Tuesday cleaner for her book group;
- **Dot** wants to keep pruning her roses, and her daughter **Fiona** wants the ladder gone;
- **Mr Tan** wants to understand a physio charge.

The day runs in five lanes:
- clients and supporters;
- the coordinator;
- the Care Partner principal (Amira);
- suppliers and workers;
- Trilogy Care staff (supplier onboarding, Quality, Billing).

The learner makes Leila's decisions. At set points they can **play someone else briefly** (Mrs Patel, Asha, Dot, Fiona, Amira, the cleaner, the gardener, the physio, onboarding, Quality, Billing).

**The signature rule:** what the learner learns in a perspective visit isn't known to Leila. The page says so ("You know this as Mrs Patel. Leila doesn't yet"), and a choice that depends on it is refused until Leila is told. That refusal counts against information accuracy. Leila is told when she asks, or when something is properly handed over.

It never books a service, approves a worker, changes a care plan, authorises a charge or reports an incident.

## The day (Leila's Monday)

| Time | Event | What it tests |
|---|---|---|
| 8:30 | Plan the day | Putting every promise on the list with a time |
| 9:10 | Cleaner cancelled; Thursday offered | Asking Mrs Patel what matters before accepting a replacement; Asha's agreed scope |
| 10:30 | Supplier update: Joy is under review, not approved | An honest update with an owner and a time; never promising an unapproved worker |
| 11:00 | Dot's roses | Dot's voice and Fiona's worry, without banning the activity or ignoring the risk |
| 12:15 | Document and hand off | A note with facts, preference, the open risk question, an owner and a date; "I emailed Quality" isn't an outcome |
| 1:30 | Mr Tan's rate question | Separating a past charge from a proposed future rate; routing it to Billing |
| 3:00 | Mrs Patel changes the plan (or, after a promise about Joy, asks about it) | Adapting when the request changes; owning a mistake |
| 4:30 | Close the loop | An honest status for each thread: completed, waiting on a named owner, escalated or callback promised |

The 3 pm event is conditional:
- after an honest morning, Mrs Patel says Thursday is no help and she'd rather wait for next Tuesday;
- after promising Joy, she asks whether Joy is coming, and the learner can correct it.

The case is in `src/content/oneDayCases.ts`. The state it keeps is listed at the top of that file.

**The cast:**
- Mrs Patel, Dot and Fiona are the Hub's recurring characters. Dot's roses, her habit of doing things herself and Fiona's worry follow the Character Library.
- Mr Tan's query follows his Coordinator's Day story.
- Leila, Asha, Amira, Brightway, Sam, Kiran, Priya, Helen and Tom are new fictional seeds, for the Character Library owner to check.

## How it works

`lib/oneDay.ts` is pure and deterministic. The whole state of an attempt is worked out by **replaying** the case with the learner's choices:
- what Leila knows;
- what the learner has seen;
- commitments;
- flags;
- rubric evidence.

So **Retry from here** is just dropping the choices from that event on. The server, the learner's page and the editor's preview run the same replay. No AI decides anything.

**The case's parts:**
- **Facts.** Each says who holds it at the start, what kind of claim it is (fact, what someone wants, what someone believes, a status) and whether it's private.
- **Events.** Each has a time, lane, thread and artefact (message, call, note, email, plan), the facts Leila receives, role lenses, and a decision.
- **Lenses.** Each has *What I know*, *What I want or worry about*, *What I can decide*, *What I need from someone else*, the facts the learner learns as that person, and an optional reply with how it sounds.
- **Options.** An option can need facts Leila must know, tell her facts, set state, create or update commitments, raise critical flags, and score rubric dimensions from 0 to 3.

**What the learner's browser gets:**
- The readers' copy of the block is the frame only: threads, the cast's names and lanes.
- `/api/magazine/[id]/oneday` returns `dayView`: the events that have arrived, the lenses opened, what Leila knows, what only the learner knows, the commitments and, once the day is closed, the debrief.
- Later events, other people's private facts and the honest-status table stay on the server.

## The debrief

- **Critical flags first.** A high total doesn't outweigh one. The flags:
  - promising an unapproved worker or an unconfirmed visit;
  - sharing private budget or health information with someone not authorised;
  - authorising a disputed charge;
  - removing Dot's activity without speaking to her;
  - marking a message sent as a completed outcome;
  - making an approval that isn't the coordinator's;
  - leaving a possible urgent safety issue (reserved; not used in Leila's Monday).
- **The rubric:** seven dimensions (prioritisation, the person's voice, information accuracy, role boundaries, handoff quality, adaptation, follow-through), each 0 to 3 with the events that evidence it. It's out of 21.
- **Four highlights:** a changed request, a good handoff, a preventable delay, and what's still open at 5 pm with its owner.
- **Three aligned timelines:** what happened, what Leila knew and decided, and what others knew but hadn't said (labelled as hidden at the time).
- **Practise next** links, then **Retry from this event** or **Replay the day**. Every attempt is kept.

## Learner interface

- **Desktop:** five lanes on the working-day axis. Each client thread has a name, a colour and a pattern (dots, stripes, waves). The side panel holds the event in focus (its artefact, what's new to Leila, *Play as…*, the decision) or a perspective visit. Below it are *What Leila knows* (with *Only you know* kept apart) and the **commitments rail** (thread, action, owner, due, status).
- **Phones, and the List layout:** a chronological card stack with the lane named on each card.
- Thread focus chips; no timers; nothing moves on by itself.

## Editor

- Title, introduction, the day, version, coordinator, and client threads.
- An **advanced JSON edit** for the cast, facts, starting state, honest statuses and links.
- For each event: time, title and lane, **Earlier / Later** (swaps times with its neighbour), Remove, and an advanced JSON edit of the whole event.
- **Branch test** (`caseProblems`). It catches:
  - a lens revealing what that person doesn't know;
  - a fact Leila needs but can never be told;
  - a conditional event on a state nothing sets;
  - a commitment owner outside the cast;
  - an empty lane;
  - a thread with no honest statuses.

  It also checks that the strongest authored path reaches 4:30 without a flag.
- **Knowledge preview:** what Leila knows at each event, and what's hidden from her on that thread, with who knows it.
- **Sign-off:** owner, story editor, Operations, Quality/clinical, Billing/Finance, supplier onboarding and privacy, approved-on and review-by. Publishing needs a passing branch test and every name; "Publish anyway" doesn't cover it.

## Telemetry

The events go to `magazine_events`:
- `journey_started`
- `event_arrived`
- `role_lens_opened`
- `lens_reply_chosen`
- `decision_made`
- `knowledge_gap_hit`
- `day_closed`
- `event_retried`
- `journey_completed`

They carry ids, flags and levels only. Attempts are in `one_day_attempts`, pinned to the revision, a hash of the case and its version.

Authors get totals from `GET /api/magazine/[id]/oneday?stats=1`: attempts, people and finished days. Each person's first finished day counts. Under 5 people, only counts are shown.

## Not yet

- **AI-varied dialogue** in lenses, and a free-text reply: lenses are authored, one turn.
- **Ava opening the day** as a transmission.
- **The optional discharge-call variant.**
- **An Admin dashboard and Excel export** for the stats.
- **A timeline editor with drag and drop:** events move with Earlier / Later.
- **Story Plan and Character Library links** for each actor: the clients' names go to the library through `charactersInBlock`.
- **Comparing a first and second attempt** side by side.
- **Real turnaround times:** the times are the PRD's authored default, not a claim about real Trilogy Care turnaround times. Operations should check them after shadowing coordinators.
