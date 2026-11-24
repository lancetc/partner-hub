import { RULESET as SAH_RULESET } from "@/lib/sahRules";
import type { CalcRuleSet, CalcService, CategoryRow } from "@/lib/quickCalc";
import type { ToolSource } from "@/lib/pocketPlaybook";

/*
  The Quick-Calc's rule sets (docs/pocket-playbook.md, Tool A): reviewed data, effective-dated and versioned. When a
  rule changes, add a rule set (or a dated row); don't edit history, so a past use can be traced to the rules it ran.

  PILOT VALUES, AWAITING FINANCE APPROVAL. The category rows follow the Department's public guidance as the Hub
  already holds it (lib/sahRules, used by While You Wait). The rate ranges, rounding rule and wording are
  placeholders until Trilogy Care Finance approves the method, rounding, category map, record source and language.
  Nothing here is a participant's rate: that only ever comes from their Services Australia notice.
*/

const SOURCES: ToolSource[] = [
  {
    label: "Support at Home participant contributions",
    href: "https://www.health.gov.au/our-work/support-at-home/charging-for-support-at-home-services/support-at-home-participant-contributions",
    section: "Service categories, individual rates, transitioned arrangements and the lifetime cap",
    kind: "programme",
  },
  {
    label: "Schedule of contributions for Support at Home services",
    href: "https://www.health.gov.au/resources/publications/schedule-of-contributions-for-support-at-home-services",
    section: "Effective-dated categories, including personal care from 1 October 2026",
    kind: "programme",
  },
  {
    label: "Prices for Support at Home participants",
    href: "https://www.health.gov.au/our-work/support-at-home/charging-for-support-at-home-services/prices-for-support-at-home-participants",
    section: "Agreed, reasonable and transparent prices",
    kind: "programme",
  },
  {
    label: "Income and assets assessment for Support at Home participants",
    href: "https://www.health.gov.au/our-work/support-at-home/charging-for-support-at-home-services/income-and-assets-assessment-for-support-at-home-participants",
    section: "Interim payments while the assessment is finalised, and reconciliation",
    kind: "programme",
  },
  {
    label: "Funding classifications for Support at Home",
    href: "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-classifications-for-support-at-home",
    section: "Interim funding allocation",
    kind: "programme",
  },
];

const SERVICES: CalcService[] = [
  { id: "gardening", label: "Gardening", unit: "hour", units: "hours", words: ["garden", "gardener", "lawn", "mowing", "yard"] },
  { id: "domestic_assistance", label: "Domestic assistance (cleaning)", unit: "hour", units: "hours", words: ["cleaning", "cleaner", "housework"] },
  { id: "home_maintenance", label: "Home maintenance", unit: "hour", units: "hours", words: ["handyman", "repairs", "gutters"] },
  { id: "meals", label: "Meals", unit: "meal", units: "meals", words: ["food", "meal delivery"] },
  { id: "social_support", label: "Social support", unit: "hour", units: "hours", words: ["outings", "company"] },
  { id: "transport", label: "Transport", unit: "trip", units: "trips", words: ["driving", "appointments"] },
  { id: "respite", label: "Respite", unit: "hour", units: "hours", words: ["carer break"] },
  { id: "personal_care", label: "Personal care", unit: "hour", units: "hours", words: ["showering", "dressing"] },
  { id: "nursing", label: "Nursing", unit: "hour", units: "hours", words: ["wound care"] },
  { id: "allied_health", label: "Allied health (e.g. physiotherapy)", unit: "session", units: "sessions", words: ["physio", "ot", "podiatry"] },
];

/**
  The category map. The rows the Hub already holds (lib/sahRules) come first, unchanged, so the two tools agree;
  the services the Quick-Calc adds follow. Personal care moves to Clinical Supports for services from 1 October 2026.
*/
const ROWS: CategoryRow[] = [
  ...SAH_RULESET.rows.map((r) => ({ service: r.service as string, category: r.category, from: r.from, to: r.to })),
  { service: "gardening", category: "everyday", from: "2025-11-01", to: null },
  { service: "home_maintenance", category: "everyday", from: "2025-11-01", to: null },
  { service: "transport", category: "independence", from: "2025-11-01", to: null },
  { service: "respite", category: "independence", from: "2025-11-01", to: null },
  { service: "allied_health", category: "clinical", from: "2025-11-01", to: null },
];

const PENDING = "Placeholder: awaiting Finance approval.";
const shared = {
  programme: "Support at Home",
  approval: { finance: "", on: "" },
  rounding: { value: "line_half_up_cent" as const, placeholder: true, note: `Each line’s contribution is rounded once, half up, to the cent. ${PENDING}` },
  rateBounds: {
    value: { independence: { min: 5, max: 50 }, everyday: { min: 17.5, max: 80 } },
    placeholder: true,
    note: `Used only to catch a mistyped rate: never shown as an example rate. ${PENDING}`,
  },
  services: SERVICES,
  rows: ROWS,
  sources: SOURCES,
  reviewOn: "2027-04-01",
  interimFunding: {
    value: { share: 60 },
    placeholder: true,
    note: `The Department describes interim funding as 60% of the funding classification, with the rest allocated when available and not backdated. ${PENDING}`,
    say: "While you wait for your full funding, you’ve been allocated interim funding. We can only plan with the amount on your notice now. The rest of your classification comes when it’s allocated, and it isn’t backdated, so I can’t promise a date for it.",
    check: [
      "The participant’s actual notified interim allocation, from their notice or record.",
      "Their prioritisation and when they were notified: don’t work out a start date for the rest.",
      "That the planned services fit the interim amount. The other part of the classification isn’t spendable now.",
      "A contribution figure isn’t a funding figure: the interim allocation is not their contribution rate.",
    ],
  },
  interimContribution: {
    say: "Services Australia hasn’t told us your assessed contribution rate yet. Until then we’ve agreed an interim amount with you. When the rate is confirmed it may apply from your start date, and Finance will reconcile any difference with you: that could be a refund or an extra amount.",
    check: [
      "That there is an agreed interim arrangement, and what it is, from the participant’s agreement.",
      "That the participant has been told the interim amount isn’t their final assessed rate.",
      "Who follows up when the notice arrives, and how the reconciliation is explained.",
    ],
    followUp: "Finance support follows up the reconciliation through the approved Finance process.",
  },
};

/** Every rule set, oldest first. Both are pilot drafts awaiting Finance approval. */
export const QUICK_CALC_RULE_SETS: CalcRuleSet[] = [
  { id: "sah-qc-2025-11", number: 1, effectiveFrom: "2025-11-01", effectiveTo: "2026-09-30", status: "awaiting_finance", ...shared },
  { id: "sah-qc-2026-10", number: 2, effectiveFrom: "2026-10-01", effectiveTo: null, status: "awaiting_finance", ...shared },
];
export const CURRENT_RULE_SET = QUICK_CALC_RULE_SETS[QUICK_CALC_RULE_SETS.length - 1];
