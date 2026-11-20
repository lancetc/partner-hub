# Spot the Signal (SIRS and incident red-flag cases)

Built from the PRD *SIRS & Incident Red-Flag Escalation Timer* (20 November 2026). This note records how v1 works, the decisions made, and what is left.

In the Magazine editor: **Add a block → Simulate → Spot the Signal**.

## What it is

A Magazine block where a learner works a made-up case the way a Care Partner would meet it: three ordinary-looking updates arrive, and the concern is only visible when they're read together. The learner finds the lines that matter, connects them, says what they'd do first, gives a provisional view of how the authorised team might assess it, and writes a handover.

It teaches **noticing and escalating**. It does not teach learners to classify or report: every screen that touches classification says that the authorised team assesses it and records why.

It is a training record only. Nothing a learner enters sends an alert, creates an incident or contacts anyone, and the block says so before they start.

## The six steps

| Step | What the learner does |
|---|---|
| 1. Case arrives | Reads who they are in this case and the notice that it's training |
| 2. The three updates | Reads an invoice, a shift note and a voicemail transcript. Marks up to five lines, each as an **observed fact**, a **reported allegation**, a **hypothesis to check**, or a distractor |
| 3. Connect the clues | Links lines from different updates and says in a sentence why they belong together |
| 4. What do you do now? | Chooses first actions from the case's routes. Feedback comes after choosing |
| 5. Provisional assessment | Three questions: is it connected to care, which reportable type (or none), which priority (Priority 1, Priority 2, not established yet, not SIRS reportable on current facts) |
| 6. Handover | Seven fields: what happened in order, exact words, observed versus reported, immediate safety concern, action taken, what still needs finding out, who it went to |

Work is saved as they go, so leaving and coming back picks up in the same place.

### Triage comes before classification

If the first actions include one the author marked **unsafe** (for example "routine note only" or "wait for proof"), or include nothing marked **essential**, the learner can't go on. They're told why in plain words, shown the case's made-up consequence ("Next Thursday, in this made-up timeline…"), and asked to look again. What they should have chosen isn't given away while they're still thinking. The same check runs again when they finish, so the step can't be skipped.

Choosing more than is strictly needed is never a failure.

## The debrief

Shown once the case is finished:

- **Five readings, in words, not numbers**: Detect and connect clues, Evidence quality, Protect and escalate, SIRS reasoning, Handover. Each is "Strong", "Partly there" or "Worth another look", with notes on what was found or missed.
- **What each line was**, and why, for every clue in the case.
- **What each route does** in this case.
- **The reviewed assessment**: the type and priority, next to what the learner said, with the reviewer's explanation and the model handover.
- **The provider's notification window**, as a reference, worked out from the reviewed "became aware" time: within 24 hours for Priority 1, within 30 calendar days for Priority 2. It is always shown with this note: these are the provider's outer limits for notifying the Commission, not how long the learner has. No window is shown when the case isn't reportable or has no confident awareness time.
- The source the case was reviewed against, with its version.

A weighted total (20 / 20 / 30 / 20 / 10, with Protect and escalate weighted most) is kept with the attempt. Learners aren't shown it.

**Speed isn't recorded or scored.** There is no countdown. The "timer" in the PRD's title became the static reference above, because a ticking clock would teach people that the window is theirs to use.

## What keeps the answers honest

- **Answers stay on the server.** The learner's page gets the three updates and the routes' labels. Which lines are clues, what each route is worth, the reviewed type and priority, the model handover and the consequences are stripped before the course is sent to a reader, and only come back in feedback after the decision they bear on.
- **An attempt records which version of the case it was read against.** If the case is revised, a finished attempt is kept as it was and starting again uses the new one.
- **A learner's highlights, reasoning and handover are theirs.** Authors can get totals for a course (how many people missed signals, were more certain than the facts allow, got the care connection wrong, wrote a strong handover, or had to rethink their first actions) and never the words.

## Approval, and the one check that can't be waived

Every case carries a **Source and approvals** section: the guidance it was written against and its version, the content owner, the clinical reviewer, the Quality reviewer and the date.

**A course with a Spot the Signal case can't be published until all of those are recorded.** This is checked separately from the usual publish checks, so **"Publish anyway" does not get past it**. A case that teaches the wrong threshold is worse than no case.

The editor shows a green banner once a case is approved and an amber one until then.

## The three starter cases

New blocks start from one of three cases written from the PRD. All three are **fictional drafts with no approvals recorded**, so none can be published as it stands.

| Case | What it tests | Reviewed answer in the draft |
|---|---|---|
| Money and pressure | A worker, an invoice that's crept up and a client who's gone quiet about money | Financial coercion by a worker, Priority 1 |
| Worrying, but outside the SIRS type | The pressure comes from a family member, not a worker | Not SIRS reportable on current facts. Other action is still required |
| Reportable, without a Priority 1 condition | A gardener overhears a worker belittling a client | Psychological or emotional abuse, Priority 2 |

**These answers are mine, drawn from the PRD, and need checking by Clinical and Quality against the current guidelines before anyone records an approval.** That includes the wording about potential harm not being enough by itself for Priority 1, which the PRD attributes to the October 2026 guidelines.

## For authors

Each case has: a title, a made-up client, who the learner is, an intro; three updates, each split into lines, with the lines that matter marked and explained; when the provider became aware; the routes (each marked essential, helpful, insufficient or unsafe, with feedback and an optional consequence); the reviewed assessment and model handover; source and approvals.

Publishing is blocked (in the ordinary way) if a case has fewer than the three updates, no clues, no essential route, or no reviewed assessment.

Client names are always made up. Never a real client.

## What isn't built

- **A screen for the author totals.** The numbers are available at `/api/magazine/<course>/signal?stats=1`; nothing shows them yet.
- **Uploading the voicemail audio.** The transcript is always shown. Audio plays if a file path is entered by hand; there's no upload button.
- **Extra evidence that arrives mid-case**, and reassessing after it (the PRD's V1.1).
- **Feeding results into the Question Pool or Capability Intelligence.** Finishing a case counts towards the course like any other activity, and that's all.
- **Flagging cases when the guidelines change.** The source version is recorded, and nothing watches it.
- **AI-drafted cases.** Every word is authored.

## What wasn't checked

- Voicemail audio playback (no test file was attached).
- The editor was opened and its sections confirmed in the browser. Editing a case field by field there wasn't walked through.
- Screen-reader behaviour was checked by structure (headings, labels, focus moving to the debrief), not with a screen reader.

## Where the code is

| | |
|---|---|
| `src/lib/signal.ts` | The case's shape, the parser, what readers are sent, scoring, the window |
| `src/content/signalCases.ts` | The three starter cases |
| `src/server/signal.ts` | Attempts, feedback, the debrief, totals |
| `src/app/api/magazine/[id]/signal/route.ts` | The route |
| `src/components/magazine/SignalCase.tsx` | What learners see |
| `src/components/admin/MagazineSignalEdit.tsx` | The editor |
| `src/server/magazine.ts` | The publish gate (`publishGuide`) and stripping answers (`withoutScenes`) |
| `src/server/signal.test.ts` | Tests |
