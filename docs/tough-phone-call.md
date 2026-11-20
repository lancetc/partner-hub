# Tough Phone Call

Built from the PRD *“Tough Phone Call” AI Client & Family Simulator* (19 November 2026). This note records how v1 works, the decisions made, and what's left.

In the Magazine editor: **Add a block → Simulate → Tough Phone Call**.

## What it is

A practice call with a fictional AI caller: a client or a family member with a difficult concern. The learner types or speaks as the Care Partner, uses simulated case tools between replies, and gets a debrief that points to their own words.

It's a **telephone preset of the conversational roleplay engine** ([voice-roleplay.md](voice-roleplay.md)), not a new system. It uses the same:

- scene model (states, good and unsafe moves, safety rules);
- turn pipeline;
- attempts and turns, and their privacy;
- voice handling (speak, check the transcript, send);
- route, limits and author counts.

The phone block adds a **phone case**. It has no choose-a-response version to fall back on.

Nothing in it changes a real invoice, roster, complaint or client record.

## The phone case

| Part | What it does |
|---|---|
| **Caller and client** | Who's on the line, who they say they are, and who the call is about |
| **What the caller may be told** | Authorised, general updates only, or not authorised, with what the check shows. Hidden until the learner uses **Check caller and permissions** |
| **Case tools** | Simulated lookups the learner uses between replies: check permissions, open a record, ask about immediate effects, urgent escalation, record a complaint. Each reveals only its authored facts, once |
| **Restricted words** | Words and numbers that would share a restricted detail, like “itemised” or “260” |
| **Urgent cue** (optional) | What the caller says after a set reply that means the client may be without essential help now, and the escalation tool that must then be used |
| **How each move is rated** | Every good and unsafe move counts towards one of six dimensions, can cite a source, and (for unsafe moves) carries a better way to say it |
| **Policy pack** | Dated sources: title, excerpt, version, effective date, review date. Learners can read them during the call |
| **Sign-off** | Content owner, Care Operations, Quality and Privacy, plus Finance for a billing call, and the date |

## The call

1. **Before:** the title, the caller, who they say they are, the setting, the learner's role, what they know, and roughly how long it takes (4 to 7 minutes). **Answer the call** starts it. Nothing plays by itself.
2. **During:** the transcript and reply box, with **Case tools** beside them. On a narrow screen, the call and the case tools are two labelled tabs, and the call controls stay on the call tab.
   - The case tools show the caller, what they may be told ("Not checked yet" until checked), each tool and what it revealed, and the policy excerpts.
   - **Caller concern** (Easing, Steady, High, Very high) changes only after a reply, in words. It's the made-up scene's state, not a measure of anyone, and never a score.
3. **The urgent cue:** on its authored reply, the caller's own line includes it, word for word, so it can't be reworded or missed. An **Immediate wellbeing check** alert appears, and the escalation tool appears in the case tools. It takes priority over everything routine.
4. **Ending:** after the most replies, when the caller reaches a natural close, on a safety rule, or with **Ask for help** or **Exit practice**.

## What's decided by rule, not by the model

- **The privacy gate.** If the learner says a restricted word before checking permissions, or to a caller not authorised for it, the turn records a disclosure. Being family isn't a blanket right. The caller's concern can always be heard; the details can't be shared until it's clear they may be.
- **The urgent cue.** If the cue was heard and the learner didn't use the escalation tool (or show one of the moves that count), the debrief records a critical miss, however warm the call was.
- **Safety rules** (from the shared engine) stop the call on authored phrases, like medication advice or offering to change a supplier's invoice.
- **What a lookup reveals** is only ever the authored facts.

## The model's part

As in the shared engine, a model reads each reply against the authored lists and writes the caller's next line. Its answer is held to the scene: only the learner's exact words count as evidence, the state moves one step at most, and unknown ids are refused.

For a phone call it's also given, for judging only:
- the case file;
- which records the learner has opened;
- what the caller may be told, and whether it's been checked.

That lets it tag an invented reason or an unsupported promise. It's told that the caller:
- isn't staff;
- can't look anything up;
- never asks the learner's own questions;
- never repeats what's in the case file.

A reason that matches an opened record is accurate, and whether it should have been shared is decided by the privacy gate, not the model.

**Checked live** (see below), the model first had the caller speak like staff, and later echo the learner's questions. Both were fixed by the instructions above, and the caller then stayed in character.

## The debrief

Assembled from the authored wording and the learner's own words. No model writes it.

- **Practised** or **Needs another attempt**: a formative recommendation, not a pass mark. A critical issue or any unsafe move means "Needs another attempt". So does leaving part-way, or a rated dimension below Effective.
- **How the call ended**, which is never "the caller calmed down":
  - **Clarified, and a next step agreed**
  - **Escalated, with the client's needs protected**
  - **The caller is still concerned, and their complaint is recorded**
  - **Unsafe or unresolved**
- **Critical issues**, with the reply and words.
- **Six things a good call does:**
  - De-escalation and listening
  - Empathy and dignity
  - Fact-finding and policy accuracy
  - Safety and urgency
  - Privacy and agency
  - Ownership and follow-up

  Each shows a rating in words and as a number out of 3 (Not demonstrated, Emerging, Effective, Strong), the replies that showed it or need care, and something to try. An unsafe move caps a dimension at Emerging, and a critical issue makes it "Critical issue". **Insufficient evidence** is shown when the call didn't test a dimension (privacy, with a caller who's fully authorised; safety, in a call with no urgent cue and nothing said about it). It's never counted as zero.
- **The call, line by line**: each reply, the case tools used before it, and each highlighted phrase with "In this simulated call, this showed…", an alternative for anything unsafe, and its source.
- **Rewrite a line**: pick a reply, write it another way, and see how it reads at that point in the call. Five per call. It isn't added to the call, and nothing but a count is stored.
- **Try the call again** and **Delete this call**.

## The two pilot scenes

Both are **fictional drafts with no sign-off**, so they can't be published until reviewed.

- **The declined gardener invoice** (billing). Karen says she's Mr Hale's daughter. She's cleared for general updates only, so the itemisation reason and the amount are restricted. The care plan shows self-management doesn't end Trilogy Care's responsibility as provider.
- **The contractor didn't arrive** (service). Michelle, Mrs Duffy's authorised representative, calls about a missed personal care visit. After the first reply she says her mum hasn't had her morning tablets and is alone. That's the urgent cue. **The escalation route in this scene is a placeholder** until Care Operations supplies the approved one.

Their sources are the public pages the PRD names (Outcome 2.6b, Outcome 1.4, the Statement of Rights, Trilogy Care's feedback and billing pages, and the Department's self-management page), with placeholder effective dates. The complaints source says its timeframes are outer limits, never a reason to delay urgent safety action.

**Ids.** Every id in a course must be unique, so adding, copying or replacing a scene gives all of its ids a fresh suffix.

## Publishing

The block can't be published, and "Publish anyway" doesn't cover it, until:

- the sign-off is recorded (Finance too, for a billing call);
- every source is before its review date.

The usual checks also apply: the scene's states, moves, unsafe moves and safety rules; a permissions tool; facts for every tool; a dimension for every move; and an escalation tool for an urgent cue.

**What learners' browsers get.** Never the caller's profile, the rubric, the safety rules, what a tool reveals, what the caller may be told, the restricted words or the urgent cue. Revealed facts come from the server as each tool is used.

## Checked live

Checked on a throwaway course with the real model, then deleted:
- the invoice call: a sound opening, then a disclosure before checking, a payment promise, and a next step;
- the no-show call: the urgent cue arriving on reply 1, the escalation tool, and a sound finish.

What was seen:
- the privacy gate fired;
- the false promise was capped;
- privacy was "Insufficient evidence" with an authorised caller;
- the ending was "Escalated";
- the narrow-screen tabs and urgent alert worked;
- the editor rendered.

**The live model mis-tagged three things.** "I'll call you back by one" was read as promising an arrival time. A complaint offered after the client was helped was read as leading with the complaints process. A reason taken from the opened invoice was read as a guess.

The scenes' unsafe moves now say plainly where the line is. This is exactly what the PRD's pilot quality gate is for: a reviewed set of sample transcripts, re-run when a scene or the model changes, still needs building.

Speaking a reply wasn't tried: voice is off for the Hub, and it needs a microphone.

## Not yet

- **A reviewed evaluation set** of sample transcripts, re-run before release. The PRD's pilot gate lists the cases.
- **Topics.** The block is Magazine-only.
- **AI-drafted scenes** from a prompt or approved documents.
- **The approved internal workflows.** The caller-verification, escalation, replacement-visit and complaint-recording workflows aren't real yet, and the no-show route is a placeholder.
- **A character voice per scene.** The spoken line uses the Hub's voice.
- **Reporting beyond counts.** Authors get the shared engine's counts. There's no report of learning gaps by dimension yet.
- **Retention.** Calls stay until the learner deletes them.
