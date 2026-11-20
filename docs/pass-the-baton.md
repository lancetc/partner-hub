# Pass the Baton

A Magazine block (type `baton`, "Pass the Baton relay"). It walks through a fictional participant's journey from hospital to a confirmed service plan.

At each role's handoff point, the learner decides:

- what to pass on, and what to verify or keep;
- who receives it, how urgently and through which channel;
- who owns the next step, and how receipt is confirmed.

A short preview shows what the next person can do with it.

The goal is a **closed-loop handoff**. Sending isn't done: an unacknowledged handoff stays open until it's followed up. It's a simulation with fictional people and records. Nothing sends a message, assigns work, books a service or changes a record.

## What learners see

- **The journey rail:** the six stages in order, horizontal on a wide screen and stacked on a phone. Each stage's status is in words: "Your turn", "In the story", "On track", "Needs follow-up", "Critical gap" or "Open".
- **The roles:** Care Coordinator, Clinical Nurse, Care Partner, Finance / Invoice Officer, each with its remit. The learner picks one, or the author assigns one, which comes first. Each role starts from the same authored story.
- **The role card:**
  - the situation;
  - what arrived from the previous role, in the authored story;
  - the decision to make;
  - "What you don't know yet";
  - the source items this role can see, each with its status (Confirmed, Reported, Pending or Unknown) and time.
- **An urgent concern** (the Care Partner's stage): it interrupts before the handoff. "Pause: something urgent" must be dealt with first.
- **The handoff builder:**
  - Every fact is sorted with buttons, not by dragging: **Send**, **Verify first** or **Keep in record**.
  - Sending a fact that isn't confirmed shows a warning that it'll arrive labelled as such. That doesn't give the answer away.
  - Then the recipient, urgency, channel, owner of the next step and how receipt is confirmed, plus optional other actions.
  - "Send the simulated handoff" is available once everything is chosen.
- **The preview:** about ten seconds. Three captioned frames ("Arrives", "What they can do with it", "Who has the baton") play a few seconds each, with Pause and "Read outcome". With reduced motion, all three show at once. A transcript has the same words. It shows the next person's ability to act, never a clinical outcome.
- **If it isn't acknowledged:** "It hasn't been acknowledged". The learner chooses a follow-up, which completes the handoff.
- **The debrief:**
  - On track, Needs follow-up or Critical gap, by dimension;
  - "What reached the next person?", "What was still missing?", "Who had the baton?" and "How did Mr Nguyen experience this?";
  - what's worth looking at, and why;
  - what went well;
  - one good way to do it.

  A critical gap asks for "Replay this stage" before the role counts.
- **The relay map:** who had the baton at each stage. Roles the learner played show their latest handoff; the others show the authored story.

## How it's marked

Every result comes from authored rules, never from speed, message length or how many teams were tagged. There's more than one safe way.

- **Facts:** each fact in a stage has its safe placements, and is marked as critical or not. For example, sending "wound care is sorted" as fact is false certainty (critical), and sending the hospital summary or a wound photo to Finance is a critical gap.
- **Choices:** each recipient, urgency, channel, owner, receipt option, action, follow-up and urgent-concern route is "On track", "On track (another safe way)", "Needs follow-up" or "Critical gap". Each has its feedback and what the next person sees because of it. An expected action left out is named as a gap.
- **Receipt:** a handoff is acknowledged only if receipt was asked for properly and, in the story, the recipient responds. Otherwise it's open and needs a follow-up. "Treat it as done" is a critical gap. In Mr Nguyen's story, Finance never replies to the Care Partner, so every Care Partner must follow up.
- **The urgent concern:** it's graded on the immediate route. Noting it for tomorrow, or asking about cost first, is a critical gap however good the rest of the handoff is.
- **Dimensions:** Critical fact fidelity, Recipient and scope, Timeliness and escalation, Ownership and closure, Participant-centred planning, Budget communication. The worst result in a dimension is that dimension's result; the worst overall is the stage's result.
- **Finishing:** play the set number of roles (one, to start) without a critical gap. Every send is kept.
- **Nobody is marked down for another role's handoff.** Each role starts from the authored story, not from what the learner did as another role.

## What keeps it honest

- **The answers aren't sent early.** The learner's copy has no rules, verdicts, consequences, debrief text or good path. Feedback comes from the server, for a handoff they've sent.
- **Changed rules are never silently applied.** Each attempt keeps a hash of the rules. When the rules change, a learner with an earlier attempt is told.
- **Past its review date,** the relay says its guidance may be out of date.
- **Author totals are counts:** sends per stage, and how many were on track, needed follow-up, had a critical gap or were left open. Never which facts or recipients anyone chose.
- **No real information.** It never gives a dressing schedule, a price, a funding result or a clinical outcome, and the editor says never to paste a real discharge summary.

## Sign-off, and the check that can't be waived

A course with this block can't be published until the block records:

- the content owner;
- the Clinical, Care Operations, Finance, Quality and Privacy reviewers;
- the sign-off date;
- the policy or SOP IDs;
- a review date that hasn't passed.

"Publish anyway" doesn't cover this.

## The starter relay

`src/content/batonCases.ts` holds "Mr Nguyen comes home". He's due home tomorrow with a new wound-care need, and the discharge summary hasn't arrived. He wants to keep his Thursday outing, and a nursing service may affect his budget. It has five source items, thirteen fact cards and six stages:

1. Hospital discharge notice (event).
2. Coordinator handoff: route the wound-care need and the missing summary to Clinical, hold the ward clerk's "it's sorted", and own chasing the summary.
3. Clinical review: pass "assessment booked; no dressing plan until then", and keep the "daily dressings" guess out.
4. Care Partner discussion and plan review: escalate the urgent concern first, then give Finance the proposed service and cost question without clinical material. Involve Mr Nguyen, and follow up when Finance doesn't reply.
5. Finance check: send the rate mismatch to the Care Partner and mark the arrangement pending. Never turn a cost query into a clinical refusal.
6. Confirmed service plan and follow-up (event).

The roles, owners, channels, escalation wording and procedure excerpt are scenario placeholders, not Trilogy Care's actual delegation. It has no sign-off.

## For authors

- **The scenario:** title, introduction, the fictional participant, an assigned role (or the learner chooses), and how many roles to play.
- **Roles:** label and remit for each.
- **Source items:** title, kind, time, status, what it says, and who can see it.
- **Fact cards:** the fact, its source, status, privacy class, and who can see it.
- **Each stage:** an event, or a handoff by a role. For a handoff, also:
  - the situation, what arrived, the decision and the unknowns;
  - what this role handed on in the story (shown when someone plays a later role);
  - the facts to sort, each with its safe placements, whether a misplacement is critical, its dimension, feedback and what the next person sees;
  - the choices for recipient, urgency, channel, owner, receipt, other actions and follow-ups, each with how it reads, its dimension, feedback, what the next person sees, and (for expected actions) the gap if it's left out;
  - whether the recipient acknowledges in the story;
  - an optional urgent concern with its routes;
  - how the person experiences a good handoff and a gap;
  - one good way.
- **Sign-off and review.**

While building, the editor warns about a stage with no good owner, a stage with no critical fact, a stage that never reaches a follow-up, and a role with no stage. Publishing is blocked if a role is asked to sort a fact it can't see, a fact has no rule, a choice group has no safe choice, or a stage has no good path.

## What isn't built

- **A map of every reachable outcome.** Authors test each role in the course preview, which works everything out on the page.
- **Free-text messages and rationale.** Handoffs are built from controlled choices.
- **Facilitated team mode,** more scenarios, and AI-drafted variations.
- **Linking to a playbook snippet** after the exercise, and Capability Intelligence signals.
- **The staged review workflow.** Sign-off records each reviewer and a date.
- **A screen for author totals.** They're available through the API (`?stats=1`).

## What was checked, and what wasn't

- **In the browser** (as Jordan, on a throwaway course that's now archived, with its attempts, events and progress removed):
  - adding the block in the editor, with the starter, the sign-off warning and no author warnings;
  - publishing refused without sign-off, even with "Publish anyway", then published;
  - the learner's page carrying none of the rules or debrief;
  - the journey rail and roles;
  - **as the Coordinator:** the role card and sources, the "not confirmed" warning, and sending "wound care is sorted" as fact with no owner. The preview played its three frames, and the debrief showed a critical gap for false certainty, a follow-up for ownership, and one good way. The relay map showed the other roles' authored story;
  - **as the Care Partner:** the urgent concern interrupting before the builder, escalation chosen, and a good handoff to Finance. The preview showed the handoff still open, "Read outcome" skipped ahead, the follow-up was chosen, and the result was On track with the relay complete;
  - focus moving to the preview after sending, and to the follow-up or debrief after it;
  - the stacked journey and no sideways scrolling at phone width;
  - author totals by stage.
- **Not checked:**
  - The Clinical Nurse and Finance roles in the browser (both are covered by tests).
  - The course preview inside the editor.
  - Editing stages and choices in the editor.
  - Reduced motion in a real browser setting, and a real screen reader.

## Where the code is

| | |
|---|---|
| `src/lib/baton.ts` | Roles, facts, stages and choices, the parser, what readers are sent, author warnings, marking, the preview, sending, role choice, the relay map |
| `src/content/batonCases.ts` | Mr Nguyen's relay (a draft) |
| `src/server/baton.ts` | Attempts, role and draft saving, sending and follow-ups, starting again, totals |
| `src/app/api/magazine/[id]/baton/route.ts` | The route |
| `src/components/magazine/BatonRelay.tsx` | What learners see |
| `src/components/admin/MagazineBatonEdit.tsx` | The editor |
| `src/server/magazine.ts` | The sign-off gate (`publishGuide`) and stripping answers (`withoutScenes`) |
| `src/server/baton.test.ts` | Tests |
