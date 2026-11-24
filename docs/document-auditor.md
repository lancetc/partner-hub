# Document Auditor

Built from the PRD _Contractor Vetting & Invoice Red-Flag Auditor_ (19 November 2026). This note records how v1 works, the decisions made, and what's left.

In the Magazine editor: **Add a block → Simulate → Document Auditor**.

## What it is

A Magazine block where a learner investigates a fictional contractor pack or supplier invoice the way they would at work. They inspect the documents, compare them with trusted records, mark specific evidence, and recommend one of four outcomes, with a reason and a next action: **Ready for engagement review**, **Request evidence or clarification**, **Escalate for decision** or **Cannot engage as proposed** (for an invoice: Ready to process, Request a correction or clarification, Escalate, Cannot process as submitted). Its vetting mode can carry a **Contractor Vetting Card** (below).

Before November 2026 the outcomes were Approve, Query and Reject current submission. Those codes are read as Ready, Request evidence and Cannot engage, everywhere: in stored blocks, in attempts and in totals. An older block had no Escalate, so its learners aren't offered one, and its answer-key hash is computed exactly as before.

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
7. **The decision rail:** the outcomes the case offers, each with what it means, plus the reason and the next action (from the actions the case offers). A live sentence sums up the work so far: "You identified 3 possible issues, compared 2 with another source, and chose Request evidence or clarification."
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

| Kind               | What it is                                | How it scores                                                 |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------- |
| **A finding**      | Not verified, and above information level | Counts towards finding the evidence, comparing and reading it |
| **Worth noticing** | Information level, not verified           | Credit if noticed; no penalty if missed                       |
| **Harmless**       | Verified                                  | Flagging it as a problem is a **false positive**              |

Marking something that isn't in the answer key, as anything but "Looks correct", is also a false positive.

The dimensions:

- **Finding the evidence:** the share of findings flagged, less 0.2 for each false positive. A false accusation isn't careful checking.
- **Comparing sources:** for findings that need a comparison, whether one of the right records was ticked.
- **Reading it correctly:** whether the category is one the answer key accepts.
- **A proportionate decision:** full, partial or no credit, as the author sets for each decision. A decision with no credit can be marked **critical**.
- **A clear next action:** whether the action is one the author marked right.

A sound request for evidence in a genuinely unclear case gets full credit, as in the cropped-certificate case. Ratings are words: "Strong" (0.8 and above), "Partly there" (0.45 and above), "Worth another look".

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
   - Request evidence: full credit (both gaps can be corrected). Cannot engage: partial. Escalate: none. Ready: critical. (Before the four outcomes, Reject had full credit; published copies keep what they were published with.)
   - Changed fact: an NDIS clearance and a new certificate, so Ready.
2. **A monthly cleaning invoice.**
   - 3 hours at $72 against an agreed $62 an hour and a 2-hour service log.
   - An "Administration: charge to participant" line (pricing rule).
   - Pet care (service list, 24 Sep 2026; the rule text says there's no blanket gutter exclusion).
   - An earlier invoice with the same 6 Nov date is a question, not fraud.
   - Cannot process as submitted: full. Request a correction: partial. Escalate: none.
   - Changed fact: an agreed $72 rate and a 3-hour log make the line marks false positives, but it's still rejected.
3. **An approvable garden maintenance pack.** An NDIS clearance in place of a police certificate, and a trading name that differs from the legal entity but matches its ABN. Ready: full credit. This makes sure always rejecting isn't rewarded.
4. **A cropped certificate.** The period of insurance can't be seen. Request evidence: full credit. Cannot engage (concluding it's expired): none. Ready: critical.

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

## The Contractor Vetting Card

Built from the PRD _Partner Hub: Contractor Compliance and Rate-Benchmarking Checker_ (21 November 2026), section 18's smallest vertical slice. It **extends this block** rather than adding a new one: a vetting case can carry a `vetting` part, and the editor's starter list opens with **Contractor Vetting Card: Dot's gardener** (a new block starts from it). In the Magazine editor: **Add a block → Simulate → Contractor Vetting Card / Document Auditor**.

**Principle:** protect the participant's choice by finding a safe, workable way to engage their preferred worker; if a requirement can't be met, say what the obstacle is, who can resolve it and what choices remain. Training status only: nothing approves a contractor, checks a register, agrees a price or contacts anyone.

### Gap map: what existed, what changed

| PRD asks for                     | Before                                                              | Now                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Four outcomes                    | Approve / Query / Reject current submission                         | Ready for engagement review / Request evidence or clarification / Escalate for decision / Cannot engage as proposed. Old codes mapped on read (`LEGACY_DECISIONS`, `decisionOf`, `migrateResult`); an older block offers no Escalate (`offered: false`)                                                                                                               |
| Per-field states                 | verified / missing / ambiguous / failed                             | `state` on each finding: verified, needs_verification, material_gap, different_rule, price_review, not_applicable, needs_owner_review. The scoring status follows from it (`statusFromState`); older findings read their state from their status                                                                                                                      |
| Learner readings                 | Expired, Mismatch, Missing, Out of scope, Unverified, Looks correct | On a vetting card: No issue, Needs verification, Confirmed gap, Price question, Different rule applies. Older blocks keep their six                                                                                                                                                                                                                                   |
| Separate axes behind the outcome | One decision key                                                    | `vetting.axes`: the PRD's 18 checks, each with a state, note, owner and barrier flag. `vettingOutcome` computes the outcome from them; `READY_NEEDS` lists what must be resolved for Ready                                                                                                                                                                            |
| Business vs worker               | One pack                                                            | The business (ABN, names) and the worker (identity, screening route, status) are separate checks and separate sides in the debrief. An active ABN alone can never make a pack ready (tested)                                                                                                                                                                          |
| Screening alternative            | The garden case accepted an NDIS clearance                          | The old police certificate is `different_rule`; marking it a gap is a false positive with the code `screening_both_required`; asking for a new one is an unnecessary request; the case check refuses a key that treats it as decisive                                                                                                                                 |
| Insurance as policy              | One insurance rule                                                  | Each rule has a `sourceType` (public rule, Trilogy Care policy, supplier contract, price benchmark), shown in the evidence drawer. The case check refuses an insurance finding resting on anything but policy or contract                                                                                                                                             |
| Scope                            | Pet care in an invoice                                              | The gutters in Dot's quote are a correctable `material_gap`; accepting them is `scope_silently_accepted`                                                                                                                                                                                                                                                              |
| Price panel                      | Invoice line arithmetic                                             | `priceView`: supplier lines and cost, the self-managed overhead (at most 10% of the actual third-party cost), the participant price (or "not set yet"), the most it can be, the agreement state, and the benchmark with source, date, region, category, what it measures, comparability and a "review cue, not a cap" sentence, or "insufficient comparison evidence" |
| Corrected pack and renewal       | One changed fact                                                    | `vetting.corrected` and `vetting.renewal`: their own version, what changed (and what was checked before), the checks that change, a new price panel and the reviewed outcome; the renewal adds what must be renewed and whether a new price agreement is needed                                                                                                       |
| Participant explanation          | None                                                                | A message to the participant, "Can the worker start yet?" and a self-check of the five elements; the debrief shows a reviewed example. Saying they can start while a check is open is the critical `promised_start`                                                                                                                                                   |
| Evidence requests                | One next action                                                     | `vetting.requests`: tick what this pack needs; unneeded requests (a new police certificate, workers compensation for a sole worker) count against and carry a code                                                                                                                                                                                                    |
| Job Aid                          | None                                                                | `vetting.jobAid` → the new seed **Choosing and Checking Your Contractor** (`choosing-and-checking-your-contractor`), shown with Save to Favourites in the debrief once approved                                                                                                                                                                                       |
| Events                           | `auditor.started/retry/submitted`                                   | The Hub's common and specialist events, below, with an idempotency key and versions                                                                                                                                                                                                                                                                                   |
| Admin and Excel                  | Totals by API only                                                  | Author totals in the editor; a **Contractor vetting cards** sheet in the Problem desk decision register                                                                                                                                                                                                                                                               |
| Idempotent submit                | A second submit after finishing started a new attempt               | A resent submit returns the finished attempt unchanged; only Try again starts another                                                                                                                                                                                                                                                                                 |

### Where it lives

| Part                                                                                                   | File                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Field states, the checks (axes), the outcome engine, the price view, codes, parsing and the case check | `src/lib/auditorVetting.ts`                                                                                                              |
| Outcomes, readings, legacy mapping, readers' copy, hash, scoring (`scoreVetting`), debrief             | `src/lib/auditor.ts`                                                                                                                     |
| Dot's gardener                                                                                         | `src/content/vettingCases.ts` (first in `AUDIT_CASES`, `src/content/auditCases.ts`)                                                      |
| Attempts, idempotent submit, events, author totals, the register                                       | `src/server/auditor.ts` (same `auditor_attempts` table: no schema change)                                                                |
| API: `viewed`, `followup` and `signal` actions                                                         | `src/app/api/magazine/[id]/auditor/route.ts`                                                                                             |
| Learner view                                                                                           | `src/components/magazine/DocumentAuditor.tsx`, `src/components/magazine/VettingParts.tsx`                                                |
| Editor (case check, branch preview, AI stub, author totals)                                            | `src/components/admin/MagazineAuditorEdit.tsx`                                                                                           |
| The case check outside the reviewers' gates                                                            | `publishGuide` in `src/server/magazine.ts` (`auditorCaseProblems`)                                                                       |
| Excel sheet                                                                                            | `src/server/problemDesk.ts` ("Contractor vetting cards")                                                                                 |
| Job Aid seed and its placeholder policy record                                                         | `src/content/playbooks.ts`                                                                                                               |
| Demo article                                                                                           | `contractorVetting` in `src/content/magazineDemos.ts` (key `contractor-vetting`)                                                         |
| Tests                                                                                                  | `src/lib/auditorVetting.test.ts`, `src/server/auditorVetting.test.ts`, `src/server/auditor.test.ts`, `src/content/magazineDemos.test.ts` |

### Dot's gardener

Dot keeps her library canon: she tends the roses in her front garden, and the climbing rose over the arch is the one she can't reach from the ground (the gardener does the high pruning, as in the Budget Lab and the Discharge Pivot). The gardener is **W1**, unnamed, so publishing queues no character or portrait (tested). The business is Archway Garden Services Pty Ltd, trading as Archway Gardens; its ABN 45 678 901 234 fails the real checksum.

| Item                    | Clue                                                                             | State                              | What the learner should do                                                    |
| ----------------------- | -------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| Trading name            | "Archway Gardens" on the form, "Archway Garden Care" on the simulated ABN Lookup | Needs verification                 | Confirm it's the same entity; a name difference isn't fraud                   |
| Cover note              | "Our ABN is active and we're fully insured, so I can start"                      | Needs verification                 | An active ABN says nothing about the worker                                   |
| Police certificate      | Issued 3 Mar 2023, over three years old                                          | A different rule applies           | Don't demand a new one beside the clearance                                   |
| NDIS clearance          | "Cleared", to Aug 2029, not yet verified                                         | Needs verification                 | Verify by the approved method; hold the start until then                      |
| Public liability        | Expired 30 Sep 2026; excludes work above 2 metres                                | Material gap (Trilogy Care policy) | Ask for the current one; the limits are policy, not law                       |
| Service description     | Rose pruning, hedges, and "clean the front gutters"                              | Material gap (correctable)         | Separate the tasks; take the gutters out and raise them through the care plan |
| Hourly rate             | $68 against a $58 median (partly comparable: labour only)                        | Price review                       | Ask, and send it to Finance; a median isn't a cap                             |
| Travel, booking/admin   | $35 and $12, unexplained                                                         | Price review / Needs verification  | Ask what they are; never a separate fee to Dot                                |
| Price to Dot, agreement | Not shown; none on file                                                          | Material gap                       | Work out the participant price; agree it in writing first                     |

The checks lead to **Request evidence or clarification**, with the price escalated alongside (Escalate: partial; Ready: critical; Cannot engage: none, an unnecessary rejection). The **corrected pack** (current certificate, names confirmed, clearance verified, gutters out, admin line removed, travel explained, Finance accepted the rate, $225.50 a visit agreed in writing: the $205 supplier cost plus 10%) leads to **Ready for engagement review**. The **renewal** (May 2027: the certificate expires 31 May and the rate rises to $74) leads back to **Request evidence**, with a new price agreement needed before the change.

### Events

To `magazine_events`, each with `key` (`<attempt>:<event>[:<ref>]`), attempt, answer-key hash, pack, rubric (`vetting-rubric-1` or `auditor-rubric-1`), engine (`auditor-engine-2`), mode and place: `activity_started`, `pack_field_opened`, `source_checked`, `price_breakdown_checked`, `benchmark_context_checked`, `decision_selected`, `screening_route_selected`, `evidence_requested`, `participant_explanation_submitted`, `response_submitted`, `feedback_viewed`, `activity_completed`, `corrected_pack_answered`, `renewal_variant_started`, `renewal_variant_answered`, `source_issue_reported`, `retry_started`, and `assessment_attempted` / `assessment_passed` in assessed mode only. Signals and completion are logged once per attempt. **Every value is an id, a code, a count or a version** (tested): never a learner's words, a document value, an ABN or a price.

### Authoring, publishing and reporting

- **Editor.** Plain fields for the participant's request, price, overhead, agreement, Job Aid, model explanation, consequences and selection rationale; field tags and rule source types; each finding's state, check and misconception codes; JSON edits for workers, checks, the price lines and benchmark, requests, the corrected pack and the renewal. The **case check** and **branch preview** run as you type. A disabled **AI drafting** section says what AI will and won't do. **Learner totals** show in the editor.
- **The case check** (`vettingProblems`), refused even under a demo sign-off: a worker without a role or documents; a benchmark as a gap or barrier; an overhead over 10% or on a non-self-managed arrangement; an agreement without a participant price; a participant price above cost plus 10%; a resolved price check with no price; Ready credit while a check is open, or the engine's outcome without full credit; a follow-up whose outcome doesn't follow; the old police certificate as decisive beside a valid clearance; an insurance finding not resting on policy or contract; a red flag with no rule. Fictional data is checked here too.
- **Sign-off** (inside the demo sign-off wrapper): owner, supplier onboarding or Compliance, **Finance or procurement pricing**, Care Operations and Quality, a date and the ruleset version, and every rule within its review date. The demo ships unsigned.
- **Assessed mode** (formative by default): a pass needs full credit and no critical error; an assessed card whose rule is past its review date can't start new attempts (409).
- **Readers' copy:** the pack, the price, the request labels and the follow-ups' facts; never the findings, checks, credit, reasons, needed requests, model explanation, consequences or reviewed follow-up answers.
- **Totals** (`?stats=1`, and in the editor): started, submitted, completed, retries; with five or more people, outcomes chosen, critical errors, misconception codes, missed and false-positive findings, unnecessary requests and retry improvement; sources learners questioned.
- **Decision register:** a **Contractor vetting cards** sheet: response ID, block, case, kind, block/pack/rule versions, rules and dates, theme and rationale decision, audience, release and review dates, reviewers, mode, Job Aid and how many have it in Favourites, counts, outcomes, misconceptions over their denominator, missed and false-positive findings by check, unnecessary requests, retry improvement, the separately owned work measure, owner, and keep/revise/retarget/withdraw. Aggregate only.

### Checked

- **Tests:** `src/lib/auditorVetting.test.ts` (32) and `src/server/auditorVetting.test.ts` (12), by acceptance criterion: an ABN alone never makes a pack ready; the screening alternative isn't penalised and demanding both is; insurance rests on policy; the gutters aren't silently accepted; an above-median price is a question, never a breach, and "insufficient comparison evidence" when it can't be compared; supplier and participant prices kept apart and checked; no Ready with any required check open; a barrier is Cannot engage and refusing a correctable pack is an unnecessary rejection; a promised start is critical; the corrected pack and renewal; the readers' copy carries no key; older blocks parse, hash and load as before (from the database too); idempotent submits, completion and signals; events carry no free text; publishing refuses a self-contradicting case even with Publish anyway; stale assessed cards hold; totals suppressed under five; the register. The existing auditor tests were moved to the new codes. The full suite passes.
- **On the running server:** a throwaway "ZZ Test vetting card" course (signed with placeholder names, archived afterwards): the API as a coordinator (signals once each, a bad reference refused, an early submit refused with every missing part, an idempotent resubmit, completion, the corrected pack, totals suppressed, 403 for a non-author); then a background Browser tab at 375 pixels: marking a field, the five readings, the accessible table (all 21 fields), a missing row, the price panel and benchmark, the recommendation, requests and message, submit, the debrief, the corrected pack and the renewal, with no horizontal scroll and no control under 44 pixels (summaries were raised to 44 after this check); at 1280 pixels: the two-column pack, four outcome columns, five rating tiles, the attempt resuming after reload, and Try again. The editor showed the demo draft's case check passing and its branch preview. No character was queued.
- **Not checked by eye:** screenshots (a background tab doesn't paint; the streamed page needed `requestAnimationFrame` shimmed, and controls were driven by DOM events rather than pointer clicks), a screen reader, the editor's Preview of the card, and the Job Aid in the debrief (unapproved, so learners correctly don't see it).

### Not yet

- **The renewal as its own attempt.** It's a follow-up inside the attempt, with its own pack version in the event and the debrief; a fresh, fully re-audited renewal pack would need its own documents.
- **Retakes that change a material fact** (a suspended clearance, a different insurer): Try again repeats the same pack.
- **Topic placement** by reference, and a **Signal Room** link for the work measure.
- **AI drafting:** a disabled stub; no paid call.
- **Source-change flagging across placements** (beyond rules' review dates holding publishing and assessed attempts).
- **A form editor** for the checks, requests and follow-ups (JSON edits, with the live check).

### For Trilogy Care to decide before release (PRD section 16)

**Supplier onboarding / Operations**

1. Who can move a participant-chosen worker from "complete pack" to engagement, and what a complete pack is.
2. How start, hold and correction are communicated, and to whom.

**Quality / worker screening**

3. The accepted method for verifying an NDIS clearance and a police certificate, and who checks current status.
4. How worker identity is matched across documents, and the recheck and change-notification process (the renewal says "recheck its status as the screening procedure says").

**Procurement / Finance**

5. Which internal price comparison is used by service and region (the $58 median is a fictional training benchmark).
6. Who can accept an above-benchmark quote, and what explanation they need.
7. How supplier surcharges (travel, booking/admin) are handled under the contract, and which lines count as "the actual third-party service cost" for the 10% overhead.
8. How the final participant price is calculated and recorded (the case uses supplier cost plus 10%).

**Policy / Legal**

9. Which public rules and internal requirements apply to a sole trader, an organisation or associated provider, and each service type.
10. When an arrangement "cannot proceed as proposed" (the barrier flag), and who decides.
11. Every public-rule statement in the seven rules (checked 21 Nov 2026), including the 10% overhead cap and the no-separate-fee rule.

**Insurance / contracts**

12. Insurance type, cover, named insured, activity scope, minimum limit, expiry and permitted remediation by role and service. Replace the fictional training policy (`r-v-insurance`) and the placeholder "Participant-chosen contractors" policy record.

**Participant experience**

13. Wording for a correctable delay or a refusal, the alternative-worker choice, the complaint route and the agreed follow-up time (the model message says "I'll ring you on Friday").

**Hub / privacy**

14. Who can see a training pack, how long attempt data (including the private message to the participant) is kept, the source review cadence, and whether later integration with real supplier systems is authorised.

**Owners and reviewers to name:** the rule owners (all "To be confirmed by the owner"), the Job Aid's steps and approvals, the work measure (packs returned for missing evidence, time from complete submission to engagement, preventable start delays, renewal lapses caught, pricing queries or choice complaints, with a baseline, denominator and review date), and whether any programme needs assessed mode.

**Character canon** (for the story owner): new details in this case are that Dot's gardener is a company's sole director ("W1", unnamed), that his base is a 45-minute drive away, that he had offered to clean her front gutters, that Dot wants him to start on 4 December, that she self-manages her garden maintenance, and the renewal's May 2027 rate change. Fiona isn't in this case.
