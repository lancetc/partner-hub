# Invoice X-Ray

Built from the PRD *Excluded Items & Grey-Area Invoice X-Ray Scanner* (20 November 2026). This note records how v1 works, the decisions made, and what is left. It covers the PRD's build steps 2 to 4: the six-line bathroom quote, the split, reasons and scoring, the debrief and explanation, author controls with sign-off, and the hardware and pharmacy fixtures.

In the Magazine editor: **Add a block → Simulate → Invoice X-Ray**.

The block now has a second mode, **quote and invoice review**, built from the PRD *Excluded Item and Grey-Area Quote/Invoice X-Ray* (21 November 2026). It's described in [Quote and invoice review](#quote-and-invoice-review) below. A case without a review section runs exactly as before, and its attempts load as they always did.

## What it is

A Magazine block where a learner reads a fictional quote or receipt line by line, decides what each line is **for this participant**, sees the money split, and explains one disappointing line to the family.

It's a training case. The people, suppliers and prices are made up. Nothing in it creates a claim, payment, reimbursement, supplier approval or message to anyone.

## Four outcomes, not two

As the PRD recommends, there are four outcomes, not "Approved" versus "Co-contribution / Excluded":

| Outcome | Where it goes in the split |
|---|---|
| **Eligible: no contribution** | Eligible, with a $0 contribution |
| **Eligible: contribution applies** | Eligible, split into subsidy and contribution at the case's stated rate |
| **Needs review** | **Pending**. Not approved and not excluded. |
| **Excluded or private** | **Private, if they choose it**. Shown apart from any contribution. |

A contribution is part of an eligible service. A private expense isn't a contribution. The block never puts the two together.

## How it runs

1. **What you're checking against.** The participant, their approvals and agreed work, the document's date and the decision date. It also shows the contribution rate with its category, and says plainly that this case's rate is synthetic, or "rate to be confirmed" if none is set. There's a note on what a quote or a receipt can and can't be.
2. **The document.** It looks like a real quote or receipt. Each line is a button, so the document is also the list of lines for keyboard and screen-reader users. A quote is stamped "Estimate only: not paid, not claimable".
3. **Sort each line**, in a sheet beside the document:
   - the outcome;
   - for an eligible line, the **account** it's funded from (ongoing quarterly services, AT-HM assistive technology, AT-HM home modifications, or another approved pathway);
   - the **reason**, from authored options that include tempting wrong ones ("bathroom work isn't funded", "she has enough left in her budget");
   - for a line that needs review, **what's missing**.
4. **The split** updates as lines are sorted: eligible, subsidy, contribution, private, pending, and anything not yet sorted. It's worked out in whole cents from the line prices and the stated rate. It's labelled "indicative" for a quote and "if confirmed" for a receipt. Screen readers hear one short sentence when it changes.
5. **What happens with the document now.** For example: agree the eligible work and claim after delivery, claim it now, or approve the lot because there's budget left.
6. **Submit.** Every line must be sorted. A critical mistake sends the learner back with why the shortcut fails:
   - a private expense treated as a contribution, or as eligible;
   - AT-HM work put through the quarterly budget;
   - claiming a quote, or reimbursing everything because there's money left.
7. **Explain it to the family.** The family's question is shown. The learner writes four parts: acknowledge what they want, explain the rule, show the split, offer a next step. They can start from a reviewed draft and change it. The explanation is compared with the reviewed points by the words and phrases each point looks for. A phrase that makes it wrong blocks finishing, with why. Examples: "the government won't pay for bathrooms", a promised reimbursement, or calling a private cost a co-contribution.
8. **The debrief.**
   - Five dimensions, each rated in words: line identification, funding path, reason accuracy, the numbers, and explaining it.
   - Each line annotated with the reviewed answer and account, the reason, what's missing, why the shortcut fails, **"What changes the answer?"**, and what it rests on (rule, participant fact, procedure).
   - Their split next to the reviewed split, and what happens now.
   - Their explanation with each point covered or not, and the reviewed script.
   - **One changed fact**: a second try at one line (Mrs Patel's OT prescribes the ramp, so is it eligible now?).

A right outcome with the wrong reason is marked as incomplete. Choosing "Needs review" because a fact really is missing gets full credit. Nothing is timed. No number is shown.

## The arithmetic

- Whole cents throughout. The contribution is the stated rate applied to the lines that carry one, rounded once.
- The pilot reconciles exactly: **$2,080 = $920 eligible + $850 private + $310 pending**, and **$920 = $736 indicative subsidy + $184 indicative contribution** at its synthetic 20%. A test checks this, and the browser showed the same figures.
- With no rate set, a contribution line shows "rate to be confirmed", never a made-up figure (Mrs Wong's case has no rate).
- The editor shows the reviewed split from the prices as you edit, so Finance can check it in place.

## What keeps it honest

- **The answer key stays on the server.** The learner's page gets the document, the outcomes, the reasons and the missing-evidence options, but not:
  - which outcome and account is right;
  - which reasons and evidence count;
  - the feedback and "what changes the answer";
  - the model script and its checks;
  - the right answer to "what happens now".

  The reviewed draft for the explanation is sent only after the lines are submitted.
- **The lines are settled once submitted**; the server ignores later changes to them.
- **An attempt records which version** of the document and answer key it was read against.
- **A learner's choices and words are theirs.** Authors can get totals per course: how many finished, how many made a critical mistake on the first try, how many got the split right, and which lines were most often missed. They never see the words.

## Sign-off, and the check that can't be waived

Every case has a **Ruleset and sign-off** section: the ruleset and its version, the content owner, and the Finance (arithmetic and invoice practice), Care Operations (participant journey and scripts) and Quality or policy (eligibility and dates) reviewers, with the date.

**A course with an Invoice X-Ray can't be published until those are recorded**, and "Publish anyway" doesn't get past it.

Publishing is also blocked (the ordinary way) if:
- there are fewer than three lines;
- a price isn't whole cents;
- an eligible line has no account, or a needs-review line has nothing named as missing;
- a line has no correct reason, or has no rule, "why the shortcut fails" or "what changes the answer";
- "what happens now" doesn't have exactly one right answer;
- the explanation has no line, question, model script or points to look for;
- the dates are missing.

## The three starter cases

All three are **fictional drafts with no sign-off recorded**, and their rates are synthetic teaching figures.

| Case | What it tests |
|---|---|
| **Mrs Patel: bathroom quote** | The PRD's pilot: grab rail and installation, slip-resistant flooring (AT-HM home modifications, 20% synthetic contribution), a decorative tile upgrade and a style-only vanity (private), and an unprescribed ramp (pending). Explain the tile upgrade. Changed fact: the OT prescribes the ramp. |
| **Mr Brennan: hardware receipt** | A paid receipt mixing an agreed safety repair (latch, stair treads, labour) with garden décor and a microwave, plus a night light he bought before anything was agreed (pending). Explain the microwave. |
| **Mrs Wong: pharmacy receipt** | Not everything from a chemist is the same: a dispensed medicine (pharmaceutical system), dressings in her nursing plan (no contribution), a dietitian-recommended supplement not yet in her plan (pending), and two personal purchases. Explain the medicine. No rate is set. |

**The answers, accounts, reasons and scripts are mine, drawn from the PRD, and need checking by Finance, Care Operations and Quality before anyone signs them off.** In particular:
- whether dressings under nursing care are processed as I've shown;
- the funding account and pathway for prescribed nutrition;
- the synthetic rates, which aren't real contribution rates.

## For authors

A case has:
- **The document:** title and introduction, quote or receipt, supplier, number, document and decision dates, the participant, what to check against, the contribution category and synthetic rate.
- **The choices:** the reasons (include tempting wrong ones) and the missing-evidence options.
- **Each line:** description, detail, price, reviewed outcome, account, correct reasons, what's missing, why the shortcut fails, what changes the answer, and what it rests on.
- **The rest:** "what happens now", the explanation (the line, the family's question, the four-part draft, the model script, the points and their words, the phrases to avoid), one changed fact, and the ruleset and sign-off.

Suppliers and people are always made up. Don't use real retail branding.

## What isn't built

- **AI drafting and an uploaded source pack.** Every word and every answer is authored. There's no generated text and no generated figure.
- **Dated contribution rules.** The case carries a decision date, but no rule changes with it yet, for example personal care moving to the clinical category from 1 October 2026. When a line depends on a dated rule, the author sets its answer for the case's date.
- **Flags on cases when a source changes,** and the Question Pool's versioned items. Sign-off is recorded names and a date, as with the other blocks; past attempts keep the version they saw.
- **Reusing the Budget & Co-Contribution Sandbox's calculator.** The Hub's Budget simulator doesn't calculate contributions, so this block has its own small calculation (`splitOf`).
- **A link to a Contractor Vetting & Invoice Red-Flag Auditor.** That block doesn't exist.
- **A spoken explanation.** It's typed.
- **A screen for the author totals.** They're available at `/api/magazine/<course>/xray?stats=1`.
- **Choosing which line to explain.** The PRD says the learner chooses; in v1 the author sets the line, posed as the family's question, so it can be compared with a reviewed script.

## What was checked, and what wasn't

Checked in the browser as Jordan on a throwaway course (now archived, with its attempts removed):
- the quote stamped "Estimate only";
- the tile upgrade sorted as a contribution, sent back with why;
- the split at **$920 / $736 / $184 / $850 / $310 of $2,080**, and the one-sentence announcement;
- the explanation step with the family's question and the draft;
- "the government won't pay for bathrooms" refused with why;
- the draft, edited, accepted;
- the debrief: a critical first try noted, all five dimensions, line 3 annotated with "What changes the answer?";
- the changed-fact retry, wrong then right;
- no sideways scrolling at phone width.

Not checked:
- **The editor wasn't opened in the browser.** The browser pane was hidden by then. It type-checks and lints, and every Magazine editor is built the same way, but no one has looked at it.
- **Moving focus to the line's sheet.** The test pane doesn't run animation frames while its window isn't focused. Focusing the sheet's heading directly works.
- Mr Brennan's and Mrs Wong's cases in the browser (covered by tests), the editor's preview mode, and a real screen reader.

## Where the code is

| | |
|---|---|
| `src/lib/xray.ts` | The case's shape, the parser, what readers are sent, the split in cents, sorting, critical mistakes, the explanation check, scoring, the debrief |
| `src/content/xrayCases.ts` | The three starter cases |
| `src/server/xray.ts` | Attempts, saving, submitting, finishing, totals |
| `src/app/api/magazine/[id]/xray/route.ts` | The route |
| `src/components/magazine/InvoiceXRay.tsx` | What learners see |
| `src/components/admin/MagazineXRayEdit.tsx` | The editor |
| `src/server/magazine.ts` | The sign-off gate (`publishGuide`) and stripping answers (`withoutScenes`) |
| `src/server/xray.test.ts` | Tests |

## Quote and invoice review

A case with a `funding` section runs as the **Quote/Invoice X-Ray**. The design rule:

> “Could this type of thing be funded?” and “Is it approved for this person, through this route, at this price?” are different questions.

### Two modes

- **Quote review** (`phase: "quote"`). The decision is made before anything is agreed or delivered.
- **Invoice review** (`phase: "invoice"` or `"receipt"`). Each line is compared with what was agreed and delivered.

The page says which stage it is. It also says whether a price is a supplier's cost or the participant's price.

### What the learner does

1. **Reads the request.** They see the participant, their message, and the document's role, date and facts. Their goal is behind a button ("Ask what they want it for"). Opening it is recorded.
2. **Inspects each line.**
   - The document has zoom (100/120/140%), and the same lines are in a table. Every line is a button.
   - Selecting a line shows:
     - its stage and price label;
     - for an invoice, the agreed and invoiced units, rate and total, the service date (flagged if it's after the invoice date) and the delivery evidence;
     - for a bundle, an **X-ray** of its parts.
   - The learner can ask four people about the line: the supplier, a clinician or AT–HM adviser, the participant or family, or Finance or the policy owner. Each answer is authored. It narrows what's known; it never decides.
3. **Opens the evidence and the sources.** Public programme sources are labelled apart from Trilogy Care's own. Each shows its passage, reference, version and effective date. A learner can flag a source as out of date or wrong.
4. **Decides each line.** They choose:
   - one of six decisions: Potentially fundable; Check clinical or AT–HM advice; Ask for an itemised quote (on an invoice, "Hold and query the invoice"); Use another funding route; Out of scope for this route; Ready for approved process;
   - a funding route;
   - a reason;
   - for an open line, what's missing and who they'd ask.
5. **Says where the document stands**: pending clarification, proceed with the confirmed lines only, ready, or not through this route. They also choose what happens now. A critical error sends them back with why, as in the classic mode.
6. **Explains it** in four boxes: their goal; what's confirmed and what isn't; price or contribution (optional); the next step and its owner. They choose the source it rests on from the case's sources; it's never typed. Optional feedback on the wording is available (see below).
7. **The debrief.** It shows:
   - the PRD's five dimensions;
   - each line's reviewed decision and accepted alternatives, route, price context and rule;
   - **the checks behind the label**: each axis with its state, the case fact and its owner;
   - the sources with their dates, the bundle's clinical and cosmetic parts, the consequence of getting it wrong, and what changes the answer;
   - their explanation beside the reviewed model response, which is written in the PRD's output contract parts;
   - alternative wording, the complaints route, the changed fact, the **Can this be funded?** Job Aid (with Save to Favourites), and the versions.

### The rules engine

Each line has ten separately authored checks:

- `list_scope`
- `assessed_need`
- `individual_approval`
- `funding_route`
- `clinical_advice`
- `document_detail`
- `price_agreement`
- `delivery_evidence`
- `participant_contribution`
- `source_confidence`

Each check is one of: confirmed, not known yet, not detailed enough, doesn't match, another route, out of scope, needs owner review, or not applicable.

`lineVerdict` computes the decision, in this order:

1. another route;
2. out of scope;
3. unclear or mismatched: ask for detail, or hold and query;
4. advice or list scope unknown: check advice;
5. anything else open: potentially fundable;
6. otherwise: ready.

A missing check is never assumed to pass. An invoice also needs delivery evidence to be ready. A check that needs owner review comes back as `needs_review` and can't be promoted. The author's decision must match what the checks compute.

### Price contexts

These stay separate (`PRICE_CONTEXTS`):

- an ongoing service price;
- a self-managed third-party cost, using the 10% overhead cap from `lib/auditorVetting`;
- an AT–HM item, wraparound or coordination cost;
- a supplier's line to the provider;
- a private purchase;
- not known until itemised.

`DOC_ROLES` distinguishes four documents: a retailer quote, a third-party worker's quote or invoice, a supplier invoice to the provider, and a participant-facing price. Money uses `times` from `lib/sahRules`. Podiatry's contribution category is the Quick-Calc rule set's.

### Scoring

- Pending clarification, when it's warranted, scores **Strong**, with a note saying it was the right call.
- An accepted alternative gets full credit, with a note that the reviewed decision is more specific.
- Each misconception has a code (`FUNDING_CODES`). These are critical:
  - approving because it's on a list;
  - ready with a check open;
  - an unsupported approval or a categorical exclusion;
  - AT–HM through the quarterly budget;
  - a cosmetic extra inside a clinical line;
  - a supplier fee passed to the participant;
  - an unagreed price accepted after delivery;
  - a quote or booking taken as delivery;
  - every chair treated as furniture.
- Calling a supplier's fee line a banned participant fee is a misconception, but not critical.
- Formative is the default. In assessed mode, a pass needs: no critical error on the first try, every line accepted, the right overall result, and a source that supports the explanation.

### Coaching

Coaching runs behind the existing adapter (`askForJson` or `openaiJson`), and only when the author turns on **AI coaching** for the case. It's off in both starter cases.

- The model is given numbered facts only: the goal, the question, the fixed verdict, the missing facts, the explained line's own sources and the reviewed next step. Each point must cite them.
- `coachIssues` rejects a reply that:
  - has approval words for a line that isn't ready, or exclusion words for one that isn't out of scope;
  - has a figure not in the facts;
  - names the service list where the line doesn't rest on it;
  - cites a fact or source that isn't in the list;
  - returns a verdict of its own.
- When there's no model, it fails, or its reply fails the checks, the reviewed feedback (`reviewedCoach`) stands.
- The verdict, the stored decisions and the score never change.

### Events and reporting

These are the Hub's common events, each with an idempotency key and the scenario, rule set, rubric and engine versions, the document mode and role, and the learner's service role:

- `activity_started`, `response_submitted`, `feedback_viewed`, `activity_completed`;
- in assessed mode only, `assessment_attempted` and `assessment_passed`;
- the specialist ones: `document_line_opened`, `source_checked`, `missing_information_requested`, `classification_selected`, `funding_route_selected`, `explanation_submitted`, `source_issue_reported` and `retry_started`.

No event holds the learner's words or the documents' details.

A resent submit or finish returns the attempt as it is, so there's no new try, score, event or attempt. This also fixes the classic mode, where a resent finish used to start a new attempt.

Each finished attempt keeps its result with its versions.

Authors get a **misconception view** in the editor: codes, misses by line type and by route, rule version, correct use of "needs more information", explanation ratings, retries and flagged sources. Breakdowns need five people. The data comes from `/api/magazine/<course>/xray?stats=1`.

The decision register has a **Quote and invoice X-Rays** sheet. It covers versions, sources and dates, placement, theme, audience, reviewers, misconceptions over the denominator, Job Aid saves and the separately owned work measure.

### Governance

The **structural case check** (`fundingProblems`) is never waived, not even by a demo sign-off. It stops publishing when:

- a document line has no review row;
- a decision doesn't follow from its checks;
- a line is marked ready while a check is open;
- an out-of-scope verdict has no source and case fact;
- an AT–HM line rests only on the service list, or is routed through the quarterly budget;
- a fee is classified without the document's role;
- a contribution or price claim has no pricing source or agreement;
- a quote shows delivery evidence;
- an invoice line's arithmetic doesn't hold;
- a bundle's parts don't add up, or a cosmetic part is funded;
- the overall result doesn't follow from the lines;
- the model response cites a source its line doesn't rest on.

The **sign-off gate** (`fundingHardProblems`) sits inside `publishGuide`'s demo wrapper, so a demo sign-off covers it. It needs:

- the content owner, Operations or Finance, Care Operations and Quality;
- the **Support at Home policy owner** and the **AT–HM or clinical reviewer**;
- every source reviewed by its accountable reviewer, and none past its review date.

An assessed case resting on a stale source won't start new attempts.

### First-release cases

Both cases are fictional and unsigned, with synthetic data. Their participants are the X-Ray's library characters, so no new portrait is queued.

| Case | What it tests |
|---|---|
| **Mrs Wong: rise chair quote** (quote review, retailer quote) | A lift-assist recliner is on the AT–HM list but needs a health professional's advice, an approval, her contribution and an agreed price, so it's "Check clinical or AT–HM advice" ("Potentially fundable" is also accepted). Delivery follows the chair. Decorative cushions are out of scope (a private choice). Overall: **pending clarification**. Changed fact: the OT finds the chair unsuitable. |
| **Mr Brennan: podiatry invoice** (invoice review, supplier invoice to the provider, self-managed) | One delivered visit matches and is ready. The "foot care and pedicure package" X-rays into nail care (clinical), polish (cosmetic) and travel (already in the price), so it's held and queried. Line 3 is invoiced as an hour at $160 against an agreed 45-minute visit at $120. The "admin and travel fee" is the supplier's line under an all-inclusive agreement: query it, never pass it on. The 4 December visit is invoiced before it happened. Overall: **pending clarification**. Changed fact: line 3 is reissued correctly. |

They're in the editor's starter-case picker. They're also in the demo article *Can this be funded? A quote and an invoice, line by line* (`content/magazineDemos.ts`, key `quote-invoice-xray`).

The **Can this be funded?** Job Aid is an unapproved seed in `content/playbooks.ts`, on a placeholder policy record (`funding-checks`).

### What Trilogy Care must decide before publishing

- **Policy (Support at Home policy owner):**
  - whether the AT–HM list covers seating that helps a person stand, and that entry's advice or prescription category;
  - the exact exclusion wording for household accessories bought with AT–HM items;
  - whether delivery is an AT–HM wraparound cost;
  - every case's decisions, alternatives and critical errors;
  - the six learner labels and the four overall results.
- **Clinical (AT–HM or clinical reviewer):**
  - when a lift chair needs an OT's or physio's advice, and the "unsuitable chair" variant;
  - whether a podiatrist's nail care for thickened nails is within scope, and how it's documented;
  - the clinical and cosmetic split of the bundle.
- **Pricing (Operations and Finance):**
  - the 10% self-managed overhead and the $132 participant price;
  - the all-inclusive supplier agreement;
  - whether a separate admin or travel line on a supplier invoice is ever allowed under a supplier agreement;
  - AT–HM contributions ("rate to be confirmed") and the Clinical Supports category for podiatry (the Quick-Calc rule set is still awaiting Finance);
  - the invoice query and hold steps (the supplier invoice procedure is a placeholder).
- **Documents (Operations and Finance with Quality):**
  - the four document roles, and what each one's prices mean;
  - whether invoicing a booked visit in advance is ever accepted;
  - the quote and invoice templates that would remove the need for itemisation queries.
- **Complaints route (Quality):** the approved complaints route and wording. Both cases carry a placeholder.
- **Sources:** every source passage is a training extract or summary to verify against the current publication. The two internal sources are placeholders.

### Not built yet

- Retry variants beyond the changed fact.
- AI drafting for authors, and an uploaded source pack.
- Flags on cases, placements and Job Aids when a source changes. Sources carry review dates and stale assessed cases are held, but nothing tracks source changes.
- Question Pool versioning.
- A Topic placement: Magazine only.
- A Problem desk link from a verified theme. The theme ID is a free-text field.
- Live upload or OCR. These are out of scope for v1.

| Code | |
|---|---|
| `src/lib/xrayFunding.ts` | Decisions, axes, roles, price contexts, the engine, the case and sign-off checks, scoring, the debrief and coaching checks |
| `src/content/xrayReviewCases.ts` | The two first-release cases |
| `src/components/magazine/QuoteInvoiceXRay.tsx` | What learners see in review mode |
| `src/components/admin/MagazineXRayFundingEdit.tsx` | The editor's review section and misconception view |
| `src/server/xrayFunding.test.ts` | The PRD's acceptance tests |
