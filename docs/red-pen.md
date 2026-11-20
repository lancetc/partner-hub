# Red Pen

A Magazine block (type `redpen`, "Red Pen critique") for documentation practice. A fictional case brief sits beside a flawed **care plan goal** or **progress note** on a clipboard. The learner:

1. marks lines with a virtual red pen, saying why;
2. rewrites the document;
3. makes any separate escalation decision the case needs;
4. submits privately.

They then see feedback, and only then a reviewed rewrite from a senior colleague.

The goal is sound judgement in documentation, not finding banned words. A documented diagnosis stays; the same word used as an unsupported inference doesn't. It's synthetic training content: nothing creates or changes a care record, and nothing the learner writes is posted anywhere.

## What learners see

- **Case facts:** a pinned briefing card beside the clipboard on a wide screen, open at the top on a phone. It holds:
  - the learner's role in the case and the brief;
  - "What you know" (each fact with "Insert into my rewrite");
  - "What is unknown";
  - the policy excerpt.
- **The clipboard:** the flawed document, numbered line by line, on a paper-like card. For each line:
  - **Mark with Red Pen** opens a reason ("Judgement or label", "Unsupported inference", "Person's goal missing", "Action not evidenced", "Too vague to guide care", "Risk or follow-up unclear", "Privacy issue", "Check the source"), a sentence on why, and optional replacement text.
  - A marked line is underlined and labelled in words ("Red pen: Action not evidenced"), never by colour alone.
  - Marks can be changed or removed.
  - An unmarked line has "Leaving it because…", so feedback can tell a deliberate choice from an oversight.
- **Your rewrite:** the whole goal or note in plain text, with "Start from my replacements" and "Start from the original". Gaps the case doesn't fill can be left as "[confirm actual time]".
- **A separate decision**, when the case needs one: an escalation question. Rewriting the note can't fulfil it, and submitting waits until it's answered.
- **Check your work:** two unmarked prompts. "I haven't added anything the case didn't tell me." "I haven't removed a safety-relevant fact."
- **Submit critique:** private. The draft autosaves until then.

**After submitting:**

- **The result:** "Learning pass", "Not yet: revise and resubmit" or "Critical gap: revise and resubmit".
- **Each dimension's result** (Strong, Needs revision or Critical gap) with why: Fact fidelity, Person's voice and dignity, Document purpose, Specificity and usefulness, Escalation judgement, Editing rationale.
- **Line by line:** what you marked, how it reads, why, and one way to put it.
- **Your rewrite and escalation:** what the checks found. A note says the checks look for authored words and phrases, so if one seems to have misread the wording, review it with a lead.
- **Revise and resubmit:** starts from the last submission. Every submission is kept, and the first is never changed.
- **Compare with the reviewed rewrite:**
  - who reviewed it, with their role and date, labelled "Peer perspective", and "Policy endorsed" only when it is;
  - "one defensible version, not the only one";
  - **Side by side** has a divider that moves with the arrow keys and announces the split;
  - **One after another** goes Original → Your version → Reviewed rewrite, with word differences marked in text ("+" and "−", and "added" and "only in yours" for screen readers);
  - the reviewer's margin notes, and another defensible phrasing.
- **Which change would you carry into your next note?** A private reflection.
- **Discuss the wording:** a link to the case's Community thread. The attempt isn't posted there.

## How it's marked

All marking is authored and deterministic, with no AI. It's never based on similarity to the reviewed rewrite or the number of marks.

- **Each document line** is set as one of:
  - **marked**: a problem, with the reasons that fit;
  - **kept**: accurate, such as the documented osteoarthritis;
  - **either**.

  Missing a problem, or giving the wrong reason, is "Needs revision" for editing rationale. Marking a line that should be kept says so.
- **Checks on the rewrite:** words it must **avoid** ("RN notified", "helped him back into bed", "non-compliant") or must **include** one of ("after lunch", "can't stand", "review"). Each check has a dimension and a severity: Needs revision or Critical gap. Matching ignores case and treats curly and straight apostrophes the same.
- **Escalation:** the right step, Needs revision or Critical gap. No decision is a Critical gap.
- **A learning pass** means no critical gap, and no more than the author's limit of "Needs revision" dimensions (two to start). Inventing an action or missing an urgent escalation never passes.

## What keeps it honest

- **The answers aren't sent early.** The learner's copy has none of what each line should be, the checks, the escalation key or the reviewed rewrite. They come from the server after the first submission.
- **Changed rubrics are never silently applied.** Each attempt keeps a hash of the lines, checks, escalation key and reviewed rewrite. When any of them change, the learner is told.
- **Past its review date**, the "Policy endorsed" label is retired and the learner is told the case is being reviewed.
- **No real identifiers.** Text that looks like an email address, phone number, long ID number or street address blocks publishing, and "Publish anyway" doesn't cover it. The editor warns while you write.
- **Author totals are counts:** submissions, passes, first-try passes, comparisons opened, and each dimension's results. Never the learner's words or marks.

## Sign-off, and the check that can't be waived

A course with this block can't be published until the block records:

- the content owner;
- the Clinical, Quality and Privacy reviewers;
- the sign-off date;
- the policy IDs;
- a review date that hasn't passed.

"Publish anyway" doesn't cover this.

## The starter cases

`src/content/redpenCases.ts` has three fictional cases, drafted from the PRD. None has sign-off.

- **Dot's dressing goal (care plan):** "non-compliant" and "takes too long" to remove, and an unagreed "staff will dress her" that's a critical gap if kept. Her documented osteoarthritis is the line to keep.
- **Mrs Nguyen's shower (progress note):** "confused and aggressive" is an unsupported inference (critical), "refused" loses her words ("after lunch"), and "RN notified" records an action that never happened (critical).
- **Mr Okafor on the floor (progress note):** "minor fall", "fine but a bit sore" and "helped him back into bed" (he wasn't moved: critical). There's a separate escalation decision: the urgent escalation procedure, not the next team meeting.

Each has a reviewed rewrite with margin notes, from a placeholder "Senior Clinical Lead (example)". The policy excerpts are placeholders for the approved Trilogy Care documentation and escalation policies.

The Community has a new fictional thread for each case, in the Coordinators' lounge, each with a moderator note about not describing real clients.

## For authors

- **The basics:** title, mode (care plan goal or progress note), introduction.
- **The case:** the learner's role, brief, facts (every fact the reviewed rewrite uses must be here), what's unknown, and the policy excerpt.
- **The document, line by line:** the text, what it should be (marked, kept or either), the reasons that fit, its dimension, feedback, and a suggested replacement.
- **Checks on the rewrite:** must avoid or must include one of, the phrases, dimension, severity and feedback.
- **An optional escalation decision:** the question and options, each with how it reads and feedback.
- **The reviewed rewrite:** the text, reviewer and role, date, whether it's policy endorsed, margin notes, and other defensible phrasings.
- **Passing, discussion and sign-off:** how many "Needs revision" dimensions still pass, the Community thread, the reviewers, date, review date, policy IDs and the standards it draws on.

## What isn't built

- **Selecting part of a line.** Marking is by whole line, which is also the keyboard and screen-reader route.
- **AI feedback** on the reasoning.
- **Sharing a revised response to the Community.** There's only the link to the thread.
- **"Try another case"** within the block. Each block holds one case; put more cases in more blocks.
- **The staged review workflow,** and a screen for author totals (they're available through the API, `?stats=1`).
- **Skills and Capability Intelligence signals.**

## What was checked, and what wasn't

- **In the browser** (as Jordan, on a throwaway course with Mr Okafor's case, now archived, with its attempts, events and progress removed):
  - adding the block in the editor, and switching to Mr Okafor's case;
  - publishing refused without sign-off, even with "Publish anyway", and then published;
  - the learner's page carrying none of the rubric or the reviewed rewrite;
  - marking a line with the red pen (focus moving to the reason choice, and the mark labelled in words);
  - a first submission that kept "helped him back into bed" and chose the team meeting: Critical gap for fact fidelity and escalation, with each unmarked line named and the check note shown;
  - the comparison with "Peer perspective", the divider moved with arrow keys, and the one-after-another view with word differences and margin notes;
  - revising (starting from the last submission), marking the other lines and choosing the urgent escalation: Learning pass, with the first submission kept;
  - focus moving to the feedback after submitting and to the critique when revising;
  - the case thread link;
  - author totals;
  - no sideways scrolling at phone width.
- **Found and fixed while checking:**
  - Text that looks like a phone number was only blocked by a check "Publish anyway" could waive. It's now part of the gate that can't be waived, with a test. Before the fix, the throwaway course had briefly published a version containing a made-up phone number. That version stays in the archived course's history.
  - The word differences read as alternating single words. They're now grouped into phrases.
  - After a second submission, focus was lost.
- **Not checked:**
  - Dot's and Mrs Nguyen's cases in the browser (both are covered by tests).
  - The editor's course preview, and editing lines and checks in the editor.
  - A real screen reader.

## Where the code is

| | |
|---|---|
| `src/lib/redpen.ts` | Modes, reasons and dimensions, the parser, the identifier check, what readers are sent, marking, submitting, the word differences |
| `src/content/redpenCases.ts` | The three starter cases (drafts) |
| `src/content/community.ts` | The case threads (`case-dot-buttons`, `case-shower-after-lunch`, `case-floor-hip`) |
| `src/server/redpen.ts` | Attempts, drafts, submissions, reflections, totals |
| `src/app/api/magazine/[id]/redpen/route.ts` | The route |
| `src/components/magazine/RedPen.tsx` | What learners see |
| `src/components/admin/MagazineRedPenEdit.tsx` | The editor |
| `src/server/magazine.ts` | The sign-off and identifier gates (`publishGuide`) and stripping answers (`withoutScenes`) |
| `src/server/redpen.test.ts` | Tests |
