# Budget Sandbox

Built from the PRD *Support at Home Budget & Co-Contribution Sandbox* (19 November 2026). This note records how v1 works, the decisions made, and what's left. It covers the PRD's MVP.

In the Magazine editor: **Add a block → Simulate → Budget Sandbox**.

## What it is

A learner builds a Support at Home care plan for a fictional participant. They see the quarter's cost split into the government-funded share and the participant's contribution, then explain it to the participant. It's planning care *with* a person: their goals stay on screen, and every service has to serve one.

It's practice. The participant, the prices and the contribution rates are fictional, and nothing in it quotes a real fee, decides eligibility or changes a care plan. Every screen says so.

The older **Budget balancer** block is unchanged. It's a simpler activity with no categories or contributions.

## The ruleset

Policy comes from an effective-dated ruleset in code (`RULESETS` in `lib/sandbox.ts`), never from a prompt.

**Support at Home ongoing funding, from 1 July 2026** (review by 20 May 2027):

| Rule | Value |
|---|---|
| Classification 4 | $7,617.13 a quarter, including care management |
| Classification 5 | $10,182.38 a quarter |
| Care management | 10%, reserved before services |
| Carryover cap | The higher of $1,000 or 10% of the quarterly budget, on unspent funds only |
| Clinical Supports | Always 0% contribution |
| Personal care | Independence before 1 October 2026; Clinical Supports from then |

- **Classifications.** Only the two the PRD gives are in it. Others are added when someone reviews them, never guessed, and an author can't choose one that isn't there.
- **Other funding types.** Interim, transitioned, grandfathered and no-worse-off budgets have their own rules. They're refused ("this version doesn't model them") rather than silently given the ongoing ones.
- **Sources.** The ruleset links to the Department's pages on funding classifications, individualised budgets, participant contributions and charging.

## The ledger

A pure function, `computeLedger`, in whole cents. The same function runs on the learner's page, in the editor's preview and on the server.

- **Each service line:** whole occurrences over the quarter × units each time × agreed price, rounded once to the cent. A fortnightly service over 13 weeks is 7 visits, not 6.5.
- **Participant share:** the line × the assessed rate for its category, rounded to the cent. The government-funded share is the rest. Totals are sums of lines.
- **The quarter:** projected over its **whole weeks**. October to December 2026 is 92 days, which is 13 weeks plus a day that isn't counted. The participant panel says so.
- **An unknown rate is a state of its own, never zero.** The line shows "rate to confirm" with no participant or government figure. What's left of the funding becomes a range, and nothing carries over until the rate is known.
- **The funding:** the quarterly amount, less care management, plus any carryover in. Below that come the government-funded use, and what's left or the shortfall.
- **Carryover:** the projected amount that would carry over, the cap, and any unspent amount above the cap.
- **No silent rescue.** The participant's contribution is never treated as extra funding, and the block never assumes they can pay it.

**Reviewed fixtures** (`fixturesPass`) check six things:
- a fictional $100 Independence line at 20% is $100 / $20 / $80;
- personal care is Clinical Supports at 0% after 1 October;
- an unknown rate gives no amount;
- Classification 4 is $7,617.13, with $761.71 care management;
- the carryover cap is $1,000 for Classification 4 and $1,018.24 for Classification 5;
- a fictional budget follows the same rules.

If any fixture fails, nothing can be published.

## Warnings

In words, with a tone label: **Needs changing**, **Talk it through** or **Note**. Never colour alone.

- **A shortfall,** or "may be over", depending on a rate to confirm.
- **A rate to confirm** on a line.
- **A service outside the approved care plan.** It needs a **Mark it for review** action before the plan can be used.
- **A service with no goal** linked to it.
- **A priority goal with nothing in the plan:** "Check with her before leaving it out."
- **Over what she said she can afford:** talk it through, and about hardship support if it applies.
- **Unspent funds over the carryover cap:** "That's not a reason to add care: plan what Margaret needs."

## The learner's screen

1. **Meet the participant.** It stays open while building and shows:
   - her goals in her own words, with "matters most" marked;
   - assessed needs, risks, schedule and affordability;
   - the classification, quarter dates, quarterly amount and care management;
   - each category's rate, with its source ("her assessed notice, fictional").
2. **Build the plan.** Service cards show the category (with the personal-care change noted), the agreed price and unit, the purpose and availability.
   - Adding a service asks which goal or need it's for.
   - Frequency has a number box, steppers and a slider. Hours each time has a number box.
   - Each change is announced in one sentence, for example: "Social support group: this change adds $1,040.00 a quarter in full price, $208.00 estimated contribution and $832.00 government-funded share."
3. **The ledger** sits beside the plan on a wide screen. On a narrow screen, the plan and the costs are two tabs, with **View costs** always there.
4. **Use this plan.** The plan needs:
   - every service linked to a goal;
   - anything unapproved marked for review;
   - the costs looked at. On a wide screen the costs are beside the plan, so they count as looked at.
5. **Explain it to Margaret.** Her question is shown, and the learner writes their answer. **Coach me** is optional.
6. **The debrief:**
   - five dimensions in words (Worth another look, Partly there, Strong): budget reasoning, contribution reasoning, plan fit, governance and communication;
   - the plan beside one reviewed **illustrative** plan ("one reviewed way, not the answer"), and why it looks as it does;
   - her priorities, kept or not;
   - the explanation's checks: each point covered or not, any phrase to avoid, and any dollar figure that isn't in the plan's ledger;
   - a copyable **practice statement**;
   - **Revise this plan** (a new attempt from the same plan; the finished one is kept) or **Start a fresh plan**.

The PRD asks for completion to mean a plan built, the ledger looked at, an explanation submitted and the debrief seen. Finishing the plan and the explanation, then reaching the debrief, counts as having done it. **Utilisation is never a criterion**: a plan with funds left over can be strong.

## The explanation checks and the coach

**Deterministic checks.** These always run, and need no model:
- **The author's points,** each matched by its words: personal care is Clinical Supports with no contribution; cleaning is Everyday Living at her assessed rate; her weekly or quarterly amount; contributions are for services as they're delivered; a next step.
- **Phrases to avoid,** like "use it or lose it" or "part-pensioners pay", each with why.
- **Every dollar figure** in the explanation, checked against the plan's ledger: each line's quarterly and weekly figures, both shares, the totals, the funding, the cap. A figure isn't flagged if it's within a dollar of one of those.

**The coach.** It gets the participant's goals, the rates, every ledger line, the totals and the funding as **numbered facts**, plus the learner's explanation, fenced off from its instructions. It returns one to four points, each **citing the facts behind it**. Its answer is refused if:
- it cites a fact that isn't there;
- it states a dollar amount the ledger doesn't have;
- it ranks categories, mentions pension-based rates, or suggests spending to use the budget.

If it fails, or no model is connected, the **rule-based points** stand: the shortfall, missing priorities, unsupported figures, and uncovered explanation points. The block works the same either way.

Each point shows "Based on: …" with the facts it used. The coach is limited to 20 runs an hour per person.

**Checked live** with the real model: its points cited the plan's own figures and Margaret's goals, and it invented no numbers.

## The starter scenario

**Margaret, Classification 4, October to December 2026.** It's a **fictional draft with no sign-off**.

- **The funding** is the real Classification 4 amount from the ruleset.
- **The rates** are 20% Independence and 40% Everyday Living, from a made-up Services Australia notice. They're not inferred from "part-pensioner", which she is.
- **The services:** personal care, nursing, a social group, transport, cleaning, garden maintenance, and flexible respite (which isn't in her approved care plan).
- **With everything at a sensible level,** the plan is **$788.58 over** her funding for services, and her contribution is over the $66 a week she can manage. So the exercise is the trade-off.
- **The reviewed illustrative plan** keeps her two priorities and fits with $62.62 to spare, with her contribution at $845.20 a quarter. It notes that another plan could keep the garden instead.

## Authoring and publishing

The editor covers:
- the starting scenario;
- the funding: an ongoing classification from the ruleset, or a fictional amount clearly labelled; plus carryover in and the quarter dates;
- the participant, goals and assessed rates (blank means "rate to confirm");
- services, prices, units, maximum frequency, a "kind" that follows the ruleset's category change, whether it's approved, and which goals it serves;
- the explanation question, points and phrases to avoid;
- the illustrative plan, with a **live ledger preview**: every line and warning, worked out as learners see them;
- the debrief, and sign-off.

Publishing is blocked (the ordinary way) if:
- a classification isn't in the ruleset;
- the quarter dates are missing, or start before the ruleset takes effect;
- a service's category isn't the one the ruleset gives it for that quarter (personal care entered as Clinical in a July quarter, for example);
- a service has no price or no goal;
- the question is about contributions but a category has no rate;
- the illustrative plan uses an unapproved service.

**"Publish anyway" doesn't cover** these:
- the sign-off: content owner, Support at Home operations, Finance, Quality or policy, and accessibility, with a date;
- a ruleset past its review date;
- failing fixtures.

**What learners' browsers get.** Never the explanation points, the phrases to avoid or the illustrative plan until the debrief. The ledger is always recomputed on the server from the plan's lines.

**Records.** Each attempt keeps the plan, the ruleset id, a hash of the scenario, and the ledger and checks it finished with. Authors get totals: attempts, people, finished, how many planned within funding, and which warnings came up. They never see plans or words. A learner can't see anyone else's plan.

## Checked in the browser

On a throwaway course, since deleted:
- built the "everything" plan through the real controls ($788.58 shortfall, and the affordability and goal warnings);
- an early **Use this plan** was refused (a service with no goal);
- adjusted the plan to fit;
- explained it, with a live coach reply;
- finished, and read the debrief.

Wide and phone layouts were both checked. That found and fixed:
- the ledger's columns running together;
- the goal dropdown and slider overflowing the card at phone width;
- "6.5 visits", now whole visits.

The editor's live ledger preview rendered.

## Not yet

- **Other funding types:** interim, transitioned, grandfathered and no-worse-off, supplements, and legacy Home Care Package funds.
- **Changes during a quarter:** needs changing mid-quarter, a price rise, and planned versus delivered services.
- **A date-aware calendar:** occurrences on real weekdays and public holidays. v1 uses whole weeks.
- **Hardship support** beyond a prompt to talk about it.
- **Dictated explanations:** the explanation is typed.
- **A formal pass threshold:** practice only.
- **Comparing versions:** the learner's two plan versions side by side. v1 keeps both attempts, and compares the learner's plan with the reviewed one.
- **A glossary** for budget terms.
- **AI-generated scenario variants.**
- **Finance's reconciliation:** checking a fixture against an official statement example, and the exact rounding granularity. The PRD requires both before release.
