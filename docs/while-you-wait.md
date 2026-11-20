# While You Wait

Built from the PRD *"While You Wait": SaH Bridging & Contribution Calculator* (19 November 2026). This note records how v1 works, the decisions made, and what is left.

There are two separate parts:
- **Practice:** a Magazine block. In the editor: **Add a block → Simulate → While You Wait calculator**.
- **Live call:** a staff tool at **`/tools/while-you-wait`**. **It's off until a superadmin releases it** with the five approvals the PRD requires.

## What it does

It answers a family's practical question: *what help can we arrange while we wait, what could it cost, and what changes when Support at Home funding is available?* It shows three panels side by side (stacked on a phone), each saying where its figures come from:

- **A. Subsidised interim support (CHSP):** its own program, with its own states.
  - The states are: potential option (check eligibility), referral confirmed with the provider or fee pending, provider available with a quoted contribution, not available, or already receiving.
  - A figure appears only when the referral, provider and contribution are all confirmed. Otherwise it says **"Cost to confirm with the CHSP provider"**, never an invented low fee.
  - Interim Support at Home funding gets its own small note, only when that stage is recorded. The two are never merged.
- **B. Private bridge:** **exact only for a complete, valid quote**, meaning:
  - a price for every planned service;
  - a known visit minimum and visit charge;
  - surcharges confirmed;
  - availability confirmed;
  - in date.

  Otherwise it says **"Quote needed"** and lists every reason. When exact, it itemises each visit and the weekly total "for this quoted pattern". Totals for 4, 8 and 12 weeks are labelled "If private visits continue for this many weeks" and count the actual scheduled visits from the start date, so a mid-week start isn't a rounded multiple. It always says private visits keep their private price and aren't reimbursed or backdated.
- **C. What changes under funded Support at Home:**
  - **Status and dates:** the stage, a confirmed allocation date (only from an allocated stage) and a confirmed funded-service start date (only once services have commenced). Otherwise: **"Start date not confirmed. We can plan now and update this when funding, agreements and service arrangements are confirmed."** **The wait slider never becomes a date.**
  - **Category and contribution:** each funded service gets its category by date, from the ruleset. Clinical Supports have no contribution, and **personal care is in Clinical Supports from 1 October 2026, for funded services only**. Independence and Everyday Living need the participant's **verified** rate; without it, "Rate to confirm" and a link to My Aged Care's costs and contributions page.
  - **Pension and legacy:** pension status shows as an explanation, never a rate. Legacy "no worse off" status is flagged.

Badges on every figure: **Scenario**, **Government estimate (dated)**, **Provider quote** (with its expiry), **Confirmed allocation**, **Confirmed service start**, **To confirm**. They're words, never colour alone.

"Everything as a table" shows every input, figure and source in one plain table. Totals are announced to screen readers in one short sentence. Every slider has a number field and step buttons.

## The arithmetic

All in whole cents, deterministic, with no language model involved:
- A visit is the price × the hours (at least the visit minimum), plus the visit charge.
- A week is the sum over the planned visit days.
- A scenario total is the sum of the visits that fall in those dates.
- A funded contribution is the provider's price × hours × visits, × the verified rate, rounded once. It's shown as "a projection, not an invoice".

The PRD's worked example reconciles: $70 an hour for two hours of cleaning and $90 for an hour of personal care is **$230 a week, $920 for four full weeks**. Adding a second cleaning day recalculates to $370.

## Shared contribution rules

The PRD asks to reuse the Budget & Co-Contribution Sandbox's contribution logic. **The Hub's Budget simulator only adds up service costs; it has no contribution rules or dated categories.** So this block adds a small shared module, `src/lib/sahRules.ts`:
- the dated category table (the ruleset), with its version (2026-10-01), source and review date;
- the cents helpers;
- the date helpers.

A ruleset past its review date shows a warning that figures can't be client-ready. The Budget simulator and the Invoice X-Ray could use the same module later.

## Practice mode

The starter scenario is **Arthur and Chloe**, everything fictional and labelled "Scenario only". Chloe asks whether Trilogy can start privately next Monday and whether costs "flip over automatically in six weeks". The setup:
- **Quote:** $70 and $90 an hour.
- **CHSP:** cleaning, to check.
- **Rates:** Arthur is a part pensioner, with no verified notice.
- **Dates:** no allocation or start date.

- **What the learner can change:** the service pattern (hours and days), the start date and the wait scenario. **The quote, CHSP branch, rates and stage are the author's**, and the server enforces that, so a learner can't make the scenario say something it doesn't.
- **The summary:** the learner writes a family summary, optionally starting from the template, and checks it. It's compared with the reviewed points (where Arthur is, the quote as a quote, the start date not confirmed, private visits keep their price, CHSP being checked, the next step) and phrases to avoid ("automatically", "in six weeks", "will start on", "will be reimbursed", "backdated", "free personal care"). The reviewed model summary is shown after.
- **What's recorded:** only counts, never the words.

The model summary and checks stay on the server until the learner checks theirs.

## Live call

- **Who:** Trilogy Care staff and coordinators. External partners can't use it.
- **When:** only once released. **A superadmin releases it on the page by naming the Support at Home Operations, Finance, Quality, Privacy and Communications approvers.** It can be withdrawn the same way.
- **Nothing is saved.** Inputs live only in the open page, and **Clear everything** empties it.
- **Context:** the stage, with its source and who checked it when; confirmed allocation and start dates only for the stages that have them; and an urgent-concern switch that points to the escalation pathway instead of pricing.
- **Services:** service, hours and visit days, the earliest private start, the wait scenario, and an optional dated official estimate.
- **Private quote:** issuer, quote id, validity, prices, visit minimum, visit charge, surcharges and availability.
- **CHSP:** referral, provider capacity and the provider's quoted contribution, as separate inputs.
- **Contributions:** pension, Commonwealth Seniors Health Card, legacy, and rates only when "I have the participant's Services Australia notice in front of me" is ticked, with its effective date and the funded prices.
- **Family summary:** a preview built only from what's been verified.
  - **Until "I've verified the recipient is the participant, or someone they've authorised" is ticked, it's a general explanation with no personal financial or care details.**
  - An unverified stage reads "We're confirming the current status."
  - It can be edited, then copied. The page says "Copied, not sent". If the browser blocks copying, the text is selected instead.
  - A copy is recorded in the audit log as copied (who, when, and whether the recipient was authorised), never as sent, and without the words.

## Sign-off

The practice block needs the content owner, the Support at Home Operations, Finance, Quality, Privacy and Communications reviewers, the date, and the source and version. **"Publish anyway" doesn't get past it.** The publish checks also require at least one service with visit days, the caller's question, summary points with their words, a model summary and the "as at" date.

## What isn't built

- **A read-only integration** for status, notices and quotes. Live entries are manual.
- **A saved quote with a stable id and audit history.** The live tool deliberately saves nothing.
- **Effective-dated private rate configuration.** Quotes are entered per call.
- **A source-status dashboard** and automatic invalidation of templates when a rule changes. The ruleset has a review date that warns, and nothing yet blocks copying a live summary when it's stale.
- **Links into the SaH Journey timeline and SOP snippets.** No shared journey stages exist; the stages are this block's own.
- **Product measures** (quote conversion, CHSP checks completed). Practice records summary check counts; live records copies.
- **A navigation link to the live tool.** It's reached by its address.

## What was checked, and what wasn't

Checked in the browser as Jordan, on a throwaway course now archived, with its data removed.

- **Practice:**
  - the three panels (CHSP "Potential option" with no fee, $230 a week, 4 / 8 / 12 weeks at $920 / $1,840 / $2,760, personal care at 0% funded with cleaning "Rate to confirm", "Start date not confirmed", the part-pensioner note);
  - adding a cleaning day recalculating to $370;
  - a summary with "automatically" and "in six weeks" caught;
  - the template covering every point;
  - the model shown after;
  - no console errors.
- **Live:**
  - "not released" for everyone until released;
  - after a temporary release: "Quote needed" with every reason;
  - a verified quote turning exact;
  - an expired quote dropping back to "Quote needed";
  - the summary staying general until the recipient was verified, then including the quote;
  - copy falling back to selected text when the browser blocked the clipboard;
  - the copy recorded in the audit log as "authorised", without the words.

  The release, its audit entries and the setting were removed afterwards, so it's **not released** now.
- **Not checked:**
  - the editor (not opened in the browser);
  - clipboard copy in a browser that allows it;
  - phone width;
  - a real screen reader.

## Where the code is

| | |
|---|---|
| `src/lib/sahRules.ts` | Dated contribution categories (the ruleset), cents and dates: shared |
| `src/lib/bridge.ts` | Stages, the three panels, the family summary, the practice block's parser, the summary check |
| `src/content/bridgeCases.ts` | Arthur and Chloe |
| `src/server/bridge.ts` | Practice progress and checks; the live tool's access, release and copy record |
| `src/app/api/magazine/[id]/bridge/route.ts`, `src/app/api/tools/bridge/route.ts` | The routes |
| `src/app/tools/while-you-wait/page.tsx` | The live-call page |
| `src/components/magazine/WhileYouWait.tsx` | The calculator, the practice block and the live tool |
| `src/components/admin/MagazineBridgeEdit.tsx` | The editor |
| `src/server/bridge.test.ts` | Tests |
