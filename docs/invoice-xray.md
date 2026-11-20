# Invoice X-Ray

Built from the PRD *Excluded Items & Grey-Area Invoice X-Ray Scanner* (20 November 2026). This note records how v1 works, the decisions made, and what is left. It covers the PRD's build steps 2 to 4: the six-line bathroom quote, the split, reasons and scoring, the debrief and explanation, author controls with sign-off, and the hardware and pharmacy fixtures.

In the Magazine editor: **Add a block → Simulate → Invoice X-Ray**.

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
