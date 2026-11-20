# AI conversational roleplay (free conversation)

Built from the PRD *AI voice-driven de-escalation roleplay* (19 November 2026). This note records how v1 works, the decisions made, and what is left. It covers the PRD's release steps 1 and 2: text roleplay with authored state and rubric, and speech in and out in the same block.

In the Magazine editor: select a **Conversation simulator** block → in its settings, **Let learners say it in their own words**.

## What it is

A second way to do a conversation practice. Instead of choosing response A, B or C, the learner types (or speaks) what they'd say, and a fictional character replies. After a few turns they get a debrief.

It is an extension of the existing conversation block, not a new system. A block set to free conversation **keeps its authored choices**. Learners can switch to them at any time, and they're what's offered if the character can't reply. Existing conversation blocks are unchanged.

## What keeps it safe: almost everything is authored

The author writes the scene, and a person reviews it before it's published:

| Part | What it does |
|---|---|
| Who the learner is, what they're practising, what they'd know | Shown to the learner before they start |
| Who the character is | Their history, preferences and worry. Never shown to learners |
| The opening line | The character's first words |
| **How the scene is going** | A heading and 3 to 6 states, calmest first. The last is reached only by a safety rule |
| **Worth doing in this scene** | At least two. What a good reply does, tagged to listening, respect, communication, context, safety or repair, with an optional example |
| **Unsafe in this scene** | At least one, each with the **caution** a learner reads if they do it |
| **Safety rules** | At least one. Phrases to listen for, what the learner sees instead of a reply, and the escalation guidance for this role |
| The approved guidance | Named and linked in the debrief |

Publishing is blocked until all of these are there. The character's profile, the lists and the safety rules are **never sent to the learner's browser**.

## One turn

1. **Safety first, by rule.** The reply is checked against the scene's safety phrases. A match stops the scene and shows the authored response and guidance. No model is asked, so nothing can be improvised.
2. **Otherwise a model reads the reply** against the authored lists and proposes: which good moves and unsafe moves it shows (each with the learner's exact words), the next state, a one-line caption, and the character's next line.
3. **Its answer is held to the scene.** An id that isn't in the lists is refused. A quote the learner didn't actually say is dropped. The state moves **one step at most** and never into the last state. A line with a link, or that mentions AI, scores or instructions, isn't used. Extra fields are refused.
4. **The turn is stored**, and that is the record.

The learner's reply is fenced in the prompt and treated only as what they said to the character. The model is told it heard no voice and must say nothing about tone, accent, pace or volume.

A conversation ends when the character brings it to a close after the fewest replies, at the most replies, on a safety rule, when the learner chooses **Ask for help**, or when they exit.

## How the scene is going

A labelled row of states with the current one marked in words, and a caption after each reply ("Ruth feels heard, but is still worried about getting home"). It changes only after a turn. It carries a line saying it is a made-up scene's state, not a measure of a real person's distress and not a score. An author can hide it while the learner talks; the reply-by-reply timeline is then shown in the debrief.

Quiet is not the goal. A respectful reply can leave the character unsettled, and an unsafe one can calm them.

## The debrief

It is **assembled, not generated**: the author's wording plus the learner's own words as evidence. No model writes it, so it can't invent guidance.

- What you did: up to two things, each with the line you said.
- Something to try next time: one thing you didn't do, with the author's example as "one way, not a script for every person".
- Something to be careful of: every unsafe move, with the authored caution, **even if the scene calmed**.
- A safety rule's label and escalation guidance, if one fired.
- "It couldn't tell what you were doing from the words alone" for turns where that was so.
- The approved guidance, and **Try again**, **Compare with the choose-a-response version**, **Delete this conversation**.

There is no score, grade, pass mark or ranking. "Ask for help" is an outcome with its own wording, not a failure.

## Voice

- **Off by default for the whole Hub.** A superadmin switches it on from the block's settings, with a confirmation that says what it means. A scene's author also has to allow it. Until both are true, learners type.
- **Speaking**: the learner presses **Speak instead**, records up to a minute, and the recording is sent to OpenAI to be turned into text. **The Hub does not keep the audio.** The text appears in the reply box to check and fix; only what's in the box is sent. If they corrected it, what was heard is kept beside what they sent, marked as superseded.
- **Listening**: each character line has a **Listen** button, and there's an opt-in "Read replies aloud". Nothing plays by itself. Every line is always on the page as text.
- Nothing about how someone sounds is assessed. Typing is fully equivalent.

## What's recorded, and who can see it

- A learner's conversation is readable **only by them**. They can delete an attempt and everything they said in it.
- Authors get counts per block: attempts, people, finished, each outcome, turns, how many were spoken, how many transcripts were corrected, debriefs read. No words.
- Events record that a turn happened and how it was entered, never what was said.
- Each attempt keeps the edition, the model used and a hash of the scene it ran against. Editing a scene doesn't rewrite an attempt; a new edition starts fresh.
- **Practised, not passed.** Reaching an end and reading the debrief marks the block done for the page, like any other activity. It records no completion, quiz pass or capability evidence.

## Authors: trying a scene

The block's settings have **Try a reply**: type what a learner might say and see the character's line, how the state moved and why, what was tagged with which words, and whether a safety rule fired. The editor's **Preview** runs the whole conversation against the scene as written. Neither stores anything.

## Limits

- A reply is up to 600 characters. 120 turns an hour per person, 90 recordings an hour.
- If the model can't answer, the turn isn't stored, the turns already made are kept, and the learner can retry, or switch to choosing from responses. A retried turn can't be counted twice.

## Not yet

- **Topic cards.** Free conversation is a Magazine block only.
- **The two pilot scenes.** No scene is written or published. The scene model supports both (the family-complaint one would use a different heading and states), but the content, especially the safety guidance, has to come from Quality.
- **AI-drafted scenes** from a prompt or uploaded documents.
- **Saved test transcripts** and comparing versions of a scene; a reviewed evaluation set to re-run when the scene or model changes.
- **A character voice per scene.** The spoken line uses the Hub's Alloy voice.
- **A handoff to Capability Insights.** Nothing is sent. It would be a "practised" signal at most.
- **Retention.** Conversations stay until the learner deletes them; there's no schedule.
- **Redacting** a client's name typed by mistake. The notice asks people not to.
- **Response-time targets.** Text replies took about one to three seconds in a check here; nothing is measured or reported.
- **Manager or reviewer access to a transcript.** There is none, by design, until an approved purpose is defined.

## Decisions still with Trilogy Care's owners

The PRD lists these; v1's position on each:

| Decision | v1 |
|---|---|
| Voice provider and its review | OpenAI, because it's what the Hub is connected to. Voice stays off until someone switches it on |
| Transcript and audio retention | Audio is never stored. Transcripts are kept until the learner deletes them |
| Care protocol source | Entirely the author's: the safety guidance and cautions are whatever is written into the scene |
| Mode | Formative only. No pass mark |
| Individual reporting | Counts only |

## Not verified here

- Checked live on a throwaway course with the real model: a respectful reply (credited with the learner's exact words, state eased one step), a false promise (cautioned), a prompt-injection attempt (ignored in character, reported as unclear) and a safety phrase (stopped in under a tenth of a second without the model). The course is archived and its conversations removed.
- **Speaking a reply was not tried**: it needs a microphone, and voice is switched off. The recording limits, the switch and the refusals are tested; the transcription call itself is not.
- The spoken character line returned audio; it wasn't listened to.
- Screen reader behaviour was checked by structure (a log region, a polite caption, focus moved to the debrief, states marked in words), not with a screen reader.
- No Subject-matter, Quality or lived-experience review has happened. The PRD requires all three before a scene reaches learners.
