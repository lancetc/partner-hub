import type { BridgeBlockData } from "@/lib/bridge";

/*
  The practice scenario for "While You Wait" (docs/while-you-wait.md): Arthur and his daughter Chloe, drafted
  from the PRD. Every rate, date and quote is fictional and labelled so: these aren't Trilogy Care prices or
  anyone's contribution. No sign-off is recorded, so a course using it can't be published until Operations,
  Finance, Quality, Privacy and Communications have reviewed it.
*/

const arthur: BridgeBlockData = {
  title: "While you wait: Arthur and Chloe",
  intro:
    "Chloe wants to know what can happen now, what it could cost, and what changes when funding comes through. Explore the options, then write her a summary.",
  person: {
    name: "Arthur",
    about: "Approved for ongoing Support at Home and waiting in the Priority System. He’s agreed Chloe can help arrange his services.",
  },
  caller: { name: "Chloe", relation: "daughter", authorised: true },
  ask: "Can Trilogy start privately next Monday? And do the costs just flip over automatically in six weeks?",
  today: "2026-11-20",
  scenario: {
    mode: "practice",
    allocationDate: "",
    serviceStartDate: "",
    urgent: false,
    stage: "approved_priority",
    stageSource: { source: "Notice of Decision (fictional)", checkedBy: "", checkedAt: "2026-11-20" },
    estimate: { text: "A published estimate for his priority, shown here only as a dated guide.", asAt: "2026-11-01" },
    needs: [
      { id: "need-clean", service: "domestic_assistance", hoursPerVisit: 2, days: [2] },
      { id: "need-care", service: "personal_care", hoursPerVisit: 1, days: [0] },
    ],
    start: "2026-11-23",
    waitWeeks: 6,
    periods: [4, 8, 12],
    quote: {
      status: "fictional",
      issuer: "Fictional practice quote",
      version: "practice-1",
      validUntil: "2026-12-31",
      prices: { domestic_assistance: 7000, personal_care: 9000 },
      minimumHours: 1,
      travelCents: 0,
      surchargesKnown: true,
      available: true,
    },
    chsp: { referral: "to_check", provider: "unknown", contributionCents: null, services: ["domestic_assistance"] },
    pension: "part",
    cshc: "unknown",
    legacy: "no",
    rates: { verified: false, independence: null, everyday: null, source: "", effectiveOn: "" },
    sahPrices: { domestic_assistance: 7000, personal_care: 9000 },
  },
  checklist: [
    {
      id: "br-c-status",
      label: "Says where Arthur is: approved and waiting for funding",
      anyOf: ["approved", "priority system", "waiting for funding", "seeking services"],
    },
    { id: "br-c-quote", label: "Gives the private cost as a quote for this pattern, not a promise", anyOf: ["$230", "quote", "quoted", "itemised"] },
    {
      id: "br-c-date",
      label: "Says the funded start date isn’t confirmed",
      anyOf: ["not confirmed", "isn't confirmed", "don't know when", "no confirmed date", "can't confirm"],
    },
    {
      id: "br-c-private",
      label: "Says private visits keep their private price",
      anyOf: ["private price", "keep their", "won't be reimbursed", "not reimbursed", "aren't reimbursed"],
    },
    { id: "br-c-chsp", label: "Mentions checking CHSP without promising a fee", anyOf: ["chsp", "home support programme", "home support program"] },
    { id: "br-c-next", label: "Names the next step and when", anyOf: ["next step", "by ", "follow up", "i'll call", "we'll call"] },
  ],
  avoid: [
    { phrase: "automatically", why: "Nothing flips over automatically. Funded services need an allocation, an agreement, a care plan and a start date." },
    { phrase: "in six weeks", why: "Six weeks is a planning scenario, not a date anyone can promise." },
    { phrase: "will start on", why: "Don’t give a funded start date until it’s confirmed." },
    { phrase: "will be reimbursed", why: "Private visits aren’t reimbursed or backdated by later funding." },
    { phrase: "backdated", why: "Private visits aren’t reimbursed or backdated by later funding." },
    { phrase: "free personal care", why: "The 0% rule is for approved, funded personal care only. Private personal care keeps its quoted price." },
  ],
  model:
    "Hi Chloe,\n\nThanks for talking through Arthur’s support needs. Arthur is approved for ongoing Support at Home and is waiting in the Priority System for funding to be allocated. We’re checking whether Commonwealth Home Support Programme cleaning is available, and what that provider would ask him to contribute; that isn’t confirmed yet.\n\nA private arrangement can start next Monday: two hours of cleaning on Wednesdays and one hour of personal care on Mondays, quoted at $230 a week, valid until 31 December (scenario only). The date funded Support at Home services could begin isn’t confirmed, and private visits keep their private price: they aren’t reimbursed when funding starts.\n\nOur next step is to confirm the CHSP referral and call you by Wednesday. Please let us know if Arthur’s needs or safety change in the meantime.\n\nKind regards,\n[Worker]",
  source: { title: "", version: "" },
  approval: { owner: "", operations: "", finance: "", quality: "", privacy: "", communications: "", approvedOn: "" },
};

export const BRIDGE_CASES = [
  { id: "arthur", name: "Arthur and Chloe: while they wait", teaches: "A private quote, a CHSP check and an unconfirmed funding date", data: arthur },
] as const;
