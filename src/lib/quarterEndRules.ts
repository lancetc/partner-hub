import { RULESETS, ruleSet as sandboxRuleSet, type RuleSet } from "./sandbox";

/*
  ===========================================================================================
  FOR FINANCE AND POLICY REVIEW: quarter-end budget rules (docs/budget-decision-lab.md)
  ===========================================================================================

  The Quarterly Budget Decision Lab needs a few rules the Budget Sandbox's ruleset (lib/sandbox, RULESETS) doesn't
  have. They live here, apart, so Trilogy Care Operations/Finance and the accountable Support at Home policy owner can
  review exactly these and nothing else. Everything the two blocks share is imported from the Sandbox's ruleset, never
  copied: the care-management percentage, the carryover minimum and percentage, the contribution categories and the
  personal-care category change on 1 October 2026.

  What this file adds (each one an assumption until reviewed against the current programme manual and Trilogy Care's
  own process):

  1. Carryover is applied to the quarterly budget INCLUDING SUPPLEMENTS, and limited to the amount actually unspent.
     A projected carryover uses estimated services and is labelled a projection.
  2. Ongoing funding and AT–HM funding are separate pools. An AT–HM item is never drawn from the ongoing quarterly
     budget, whatever balance remains; it needs its own assessed need, approval, funding route and item conditions.
  3. A transitioned HCP participant's unspent HCP funds are a separate pool with their own order: for an AT–HM item they
     are drawn before the allocated AT–HM funding. They never share the ongoing carryover rule. v1 scenarios don't
     include them; a case that did is refused rather than given the ongoing rule.
  4. Short-term pathway balances are separate again, and not modelled in v1.
  5. A booked or proposed service changes a projection only. Nothing here records a service as spent or claimed.
  6. A projected overspend is never rolled into the next quarter or charged to the participant automatically.

  Sources were checked on 21 November 2026 (the PRD's section 15). These are design inputs: Trilogy Care's owners must
  confirm them, and the rule set's status, before anyone publishes scored learning on them.
*/

export type QuarterRuleStatus = "current" | "review-required" | "withdrawn";

export type QuarterRuleSet = {
  id: string;
  label: string;
  /** The Budget Sandbox ruleset this extends, for the shared figures. */
  baseRulesetId: string;
  effectiveFrom: string;
  checkedOn: string;
  reviewBy: string;
  /**
    Set by a developer when a source or rule changes: "review-required" marks every block on it Review required (it
    can't be published, and an assessed attempt can't start), "withdrawn" takes it out of use. Old attempts keep the
    rule set they were taken under.
  */
  status: QuarterRuleStatus;
  statusNote: string;
  carryover: { basis: "quarterly budget including supplements"; limitedToUnspent: true };
  pools: {
    /** AT–HM is its own pool: never the ongoing budget. */
    atHmSeparate: true;
    /** For an AT–HM item, a transitioned participant's unspent HCP funds come first, then the AT–HM allocation. */
    atHmDrawOrder: ("hcp-unspent" | "at-hm-allocation")[];
    hcpModelled: false;
    shortTermModelled: false;
  };
  overspend: { rollForward: false; autoCharge: false; note: string };
  sources: { id: string; title: string; url: string }[];
};

export const QUARTER_RULES: QuarterRuleSet[] = [
  {
    id: "sah-quarter-end-2026-11",
    label: "Support at Home quarter-end budget rules (checked 21 November 2026, for review)",
    baseRulesetId: "sah-ongoing-2026-07",
    effectiveFrom: "2026-07-01",
    checkedOn: "2026-11-21",
    reviewBy: "2027-05-20",
    status: "current",
    statusNote: "",
    carryover: { basis: "quarterly budget including supplements", limitedToUnspent: true },
    pools: { atHmSeparate: true, atHmDrawOrder: ["hcp-unspent", "at-hm-allocation"], hcpModelled: false, shortTermModelled: false },
    overspend: {
      rollForward: false,
      autoCharge: false,
      note: "A projected overspend needs a proper operational response under Trilogy Care’s approved process. It isn’t rolled into the next quarter, and the participant is only invoiced where they agreed beforehand.",
    },
    sources: [
      {
        id: "budgets",
        title: "Individualised budgets for Support at Home participants",
        url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/individualised-budgets-for-support-at-home-participants",
      },
      {
        id: "care-plans",
        title: "Care plans for Support at Home participants",
        url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/care-plans-for-support-at-home-participants",
      },
      {
        id: "at-hm",
        title: "Assistive Technology and Home Modifications scheme",
        url: "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/assistive-technology-and-home-modifications-at-hm-scheme",
      },
      {
        id: "charging",
        title: "Charging for Support at Home services",
        url: "https://www.health.gov.au/our-work/support-at-home/charging-for-support-at-home-services",
      },
      {
        id: "payments",
        title: "Provider payment arrangements for Support at Home",
        url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/provider-payment-arrangements-for-support-at-home",
      },
      {
        id: "manual",
        title: "Support at Home program manual: a guide for registered providers",
        url: "https://www.health.gov.au/resources/publications/support-at-home-program-manual-a-guide-for-registered-providers",
      },
    ],
  },
];

export const quarterRules = (id: string, list: QuarterRuleSet[] = QUARTER_RULES) => list.find((r) => r.id === id);

/** The Budget Sandbox ruleset a quarter rule set builds on: the shared care-management and carryover figures. */
export const baseRules = (q: QuarterRuleSet): RuleSet => sandboxRuleSet(q.baseRulesetId) ?? RULESETS[0];

/**
  Whether blocks on this rule set can be used: withdrawn, review required (by status, or a passed review date here or on
  the Sandbox ruleset it builds on), or current.
*/
export function ruleStatus(id: string, today: string, list: QuarterRuleSet[] = QUARTER_RULES): QuarterRuleStatus {
  const q = quarterRules(id, list);
  if (!q || q.status === "withdrawn") return "withdrawn";
  if (q.status === "review-required" || q.reviewBy < today || baseRules(q).reviewBy < today) return "review-required";
  return "current";
}

export const sourceTitle = (q: QuarterRuleSet, id: string) => q.sources.find((s) => s.id === id)?.title ?? "";
