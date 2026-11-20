# Document Auditor

Built from the PRD *Contractor Vetting & Invoice Red-Flag Auditor* (19 November 2026). This note records how v1 works, the decisions made, and what's left.

In the Magazine editor: **Add a block → Simulate → Document Auditor**.

## What it is

A Magazine block where a learner investigates a fictional contractor pack or supplier invoice the way they would at work. They inspect the documents, compare them with trusted records, mark specific evidence, and decide **Approve**, **Query** or **Reject current submission**, with a reason and a next action.

It teaches careful verification and proportionate action. It doesn't award points for the most red marks.

There are two modes:

- **Contractor Vetting:** is this pack enough for the proposed service and engagement date?
- **Invoice Red Flags:** which lines reconcile with what's approved, agreed and delivered?

Everything is fictional. Nothing a learner decides approves a supplier, rejects a real invoice or makes a claim, and there's no live "Approve supplier" or "Pay invoice" button anywhere.

## What the learner does

1. **The intro card** shows:
   - the "Practice documents: no real supplier or participant data" notice;
   - their role, the supplier and the participant;
   - the simulated decision date and the engagement (or service) date;
   - the decision to make.
2. **The documents** are tabs. Each field on a document is a button: selecting it places a **numbered marker** and opens **"What did you notice?"**:
   - a category: Expired, Mismatch, Missing, Out of scope, Unverified or Looks correct;
   - a short reason;
   - **Compared with…**: tick the trusted-record fields it was checked against.

   Marked fields show their number and category in words, not just colour. A text-size control enlarges everything.
3. **Missing documents** is a checklist of rows, so an absence has no phantom spot to tap. Some rows are documents that aren't needed for this supplier, so not marking them is part of the skill.
4. **The side rail** shows:
   - the trusted records, each field noting which markers were compared with it;
   - **Rules for this case**, each with its family, text, source link, owner, effective date and review date.
5. **Review as a table** lists every field of every document with a Mark button. A keyboard or screen-reader user can do the whole case this way, with the same result.
6. **Your markers** lists each marker with its reason and comparisons, ready to edit or remove.
7. **The decision rail:** the three decisions, each with what it means, plus the reason and the next action (from the actions the case offers). A live sentence sums up the work so far: "You identified 3 possible issues, compared 2 with another source, and chose Query."
8. **Submit.** Nothing is revealed before this. Submitting needs at least one marker (even "Looks correct"), a category on each, a decision, a reason and a next action.
9. **The debrief:**
   - Five dimensions, rated in words: finding the evidence, comparing sources, reading it correctly, a proportionate decision, a clear next action.
   - A critical shortcut, if one was taken (for example, approving with an expired certificate).
   - The decision memo: their decision and its credit, why, the best decision and why, their next action, and their reason.
   - The findings, grouped as **confirmed failures**, **missing or unclear (needs a query)**, **possible integrity concerns** and **harmless differences**. Each shows found, missed or false positive; whether it was compared with the right record; the plain checks; the explanation; and the rule with its source and effective date.
   - **Not findings in this case:** marks on things the answer key doesn't treat as problems.
   - **One changed fact:** a second decision under a variant, such as an NDIS clearance and a new certificate.
   - **Try again:** a new attempt. After a decision without full credit, the new attempt shows the case's hint.

Practice completion: viewing the debrief after a submitted decision. Nothing is timed, and no number is shown.

## Scoring

The answer key is authored, not generated. Each **finding** points at a document field or a missing-document row, and has:

- the record fields it should be compared with;
- a rule;
- a status: verified, missing, ambiguous or failed;
- a severity: information, query, blocks approval, or escalate;
- the categories that read it correctly;
- an explanation.

Findings come in three kinds:

| Kind | What it is | How it scores |
|---|---|---|
| **A finding** | Not verified, and above information level | Counts towards finding the evidence, comparing and reading it |
| **Worth noticing** | Information level, not verified | Credit if noticed; no penalty if missed |
| **Harmless** | Verified | Flagging it as a problem is a **false positive** |

Marking something that isn't in the answer key, as anything but "Looks correct", is also a false positive.

The dimensions:

- **Finding the evidence:** the share of findings flagged, less 0.2 for each false positive. A false accusation isn't careful checking.
- **Comparing sources:** for findings that need a comparison, whether one of the right records was ticked.
- **Reading it correctly:** whether the category is one the answer key accepts.
- **A proportionate decision:** full, partial or no credit, as the author sets for each decision. A decision with no credit can be marked **critical**.
- **A clear next action:** whether the action is one the author marked right.

A sound Query in a genuinely unclear case gets full credit, as in the cropped-certificate case. Ratings are words: "Strong" (0.8 and above), "Partly there" (0.45 and above), "Worth another look".

## The plain checks

Deterministic functions, not a model, explain the dates and sums in the debrief:

- **Expiry against the engagement date:** "Expired 1 Nov 2026: 30 days before 1 Dec 2026."
- **A document's age on the engagement date:** "3 years and 5 months old". The three-year screening rule itself stays in the rule text, never hard-coded.
- **Units × rate,** and whether the line's own sum adds up.
- **An invoice line against an agreed line:** the difference in units and in rate, with a percentage. A higher price is never an automatic reject: it's only a mismatch against what was agreed.
- **Matching service dates:** "Same service date as 6 Nov 2026."

The parser also refuses an answer key that contradicts its own dates: a "failed, expired" finding on a certificate whose expiry is on or after the engagement date.

## What keeps it honest

- **The answer key stays on the server.** The learner's page gets the documents, records, rules, checklist and action labels, but none of these:
  - the findings;
  - the decision credit and reasons;
  - which actions are right;
  - the hint;
  - the variant's answer.
- **A submitted attempt is settled.** Later saves are ignored; only the changed-fact answer can be added. Trying again starts a new attempt, so earlier ones are kept.
- **Each attempt records the course edition** and a hash of the documents, rules and answer key it was read against. A changed case can't silently inherit an old attempt's markers: markers anchor to field ids, and the hash shows when the case has changed.
- **Fictional data, checked.** Publishing is refused if any field contains an ABN that passes the real ABN checksum, an email address, a phone number or a street address. The starter cases' ABNs all fail the checksum on purpose; a test checks that the ATO's published ABN passes.
- **Learners' words are theirs.** Authors get totals from `/api/magazine/[course]/auditor?stats=1`: attempts, people, finished, critical shortcuts, the decisions chosen, missed findings and false positives by finding. They never get names or words. There's no leaderboard.

## Sign-off, and the checks that can't be waived

Every case has a **Ruleset and sign-off** section:

- the ruleset, its version and review date;
- the content owner;
- the **Supply Chain or Compliance** reviewer (vetting) or the **Finance or Payments** reviewer (invoices);
- the **Care Operations** and **Quality** reviewers;
- the date.

A course with a Document Auditor can't be published, even with "Publish anyway", until:

- that sign-off is recorded;
- every rule in the case is within its review date;
- nothing in the case looks like a real identifier.

The usual publish checks also need at least one document and one trusted record, a field and value for every field, a rule with an effective date and review date for every finding, at least one full-credit decision, at least one right next action, and the dates.

**Rules stay separate.** Supplier insurance, screening, ongoing verification, service list, contribution category, claims and pricing are separate rule families, each with its own source and dates. That keeps a legacy label (such as an insurance matrix still saying "Independence" for personal care) from being mistaken for the current contribution category.

## The four starter cases

All four are **fictional drafts with no sign-off recorded**. Rule owners read "To be confirmed by Compliance", and the effective dates are placeholders until Compliance confirms the current Trilogy Care requirements.

1. **A sole trader cleaner.**
   - Public liability expired 1 Nov 2026, before the 1 Dec engagement.
   - The police certificate (issued 14 Jun 2023) is over three years old, with no NDIS clearance.
   - Absent professional indemnity and WorkCover are harmless traps (no employees, task-based cleaning).
   - Reject: full credit. Query: partial. Approve: critical.
   - Changed fact: an NDIS clearance and a new certificate, so Approve.
2. **A monthly cleaning invoice.**
   - 3 hours at $72 against an agreed $62 an hour and a 2-hour service log.
   - An "Administration: charge to participant" line (pricing rule).
   - Pet care (service list, 24 Sep 2026; the rule text says there's no blanket gutter exclusion).
   - An earlier invoice with the same 6 Nov date is a question, not fraud.
   - Reject: full. Query: partial.
   - Changed fact: an agreed $72 rate and a 3-hour log make the line marks false positives, but it's still rejected.
3. **An approvable garden maintenance pack.** An NDIS clearance in place of a police certificate, and a trading name that differs from the legal entity but matches its ABN. Approve: full credit. This makes sure always rejecting isn't rewarded.
4. **A cropped certificate.** The period of insurance can't be seen. Query: full credit. Reject (concluding it's expired): none. Approve: critical.

The rule sources are the ones the PRD names: the government's aged care screening requirements, Trilogy Care's supplier insurance requirements, the November 2026 coordinator session, provider payment arrangements, prices for participants, and the 24 September 2026 service list.

## Decisions made for v1

- **Structured documents, not uploaded PDFs.** A document is a set of labelled fictional fields, rendered to look like a document with a "Practice copy" stamp. That makes every marker anchor to a field id, which can't drift under zoom or resizing, and it makes the accessible table the same data as the page.
  - Text size replaces zoom.
  - There's no rotate.
  - There's no OCR or upload scanning, because nothing is uploaded.
- **The case lives in the block**, like the Invoice X-Ray, starting from a starter case the author edits. A course edition freezes it.
- **The changed fact is one decision,** not a full re-audit.
- **No AI coaching yet.** The exercise, the rule-based feedback and the debrief work without it, as the PRD requires.

## What isn't built yet

- Real PDF or image documents with coordinate anchors, redaction and upload scanning.
- AI-assisted drafting of fictional packs and coaching of the written reason. When it comes, it must use the validated findings, never judge a certificate's authenticity from an image, and never invent a threshold.
- An author view of the totals (they're available from the API).
- Placing the block in Topics.
- A Question Pool link for fixed assessment questions.
- A formal pass rubric for credentials.
