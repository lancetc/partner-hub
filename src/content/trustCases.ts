import type { BudgetFigures, Option, Path, Plan, Signal, Source, Step, TrustData } from "@/lib/trustCheck";
import { QUARTER_RULES } from "@/lib/quarterEndRules";

/*
  The first 28-Day Trust Check case (docs/trust-check.md): Mrs Patel's Week 8, from the PRD's section 7.
  ILLUSTRATIVE AND SYNTHETIC: every record, figure, date, message and supplier answer is invented.

  Characters (all already in the library, so publishing queues no portrait):
  - Mrs Patel keeps her canon: in her late seventies, lives at home, makes her own decisions, and hosts a book group on
    Tuesday afternoons, which is why her Tuesday-morning clean matters (One Day, Five Perspectives; What does a missed
    service cost?). Her cleaning company is Brightway Home Services, which rosters a week ahead (One Day).
  - Asha is her daughter, who helps with appointment changes within the limits Mrs Patel has chosen; her mum's budget
    and health details aren't part of that (One Day). She is never the decision-maker.
  Nobody else is named: the coordinator is "you", the other supplier and the clinical lead are roles. The PRD's
  "Brisbane" isn't used (her other stories place her business elsewhere). New details for the character steward are
  listed in docs/trust-check.md.

  Nothing is signed off: the owner, Care Coordination operations, Quality/complaints, the Support at Home policy and
  budgets owner, Finance/billing, clinical governance, Partnerships, privacy and a learning reviewer review it, and the
  four Trilogy Care procedures are placeholders.
*/

const REVIEW = "2027-05-21";
const CHECKED = "2026-11-21";

const SOURCES: Source[] = [
  {
    id: "budgets",
    title: "Individualised budgets for Support at Home participants",
    url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/individualised-budgets-for-support-at-home-participants",
    owner: "Support at Home policy and Finance",
    checked: CHECKED,
    reviewBy: REVIEW,
    placeholder: false,
  },
  {
    id: "at-hm",
    title: "Assistive Technology and Home Modifications scheme",
    url: "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/assistive-technology-and-home-modifications-at-hm-scheme",
    owner: "Clinical / AT–HM",
    checked: CHECKED,
    reviewBy: REVIEW,
    placeholder: false,
  },
  {
    id: "responsibilities",
    title: "Responsibilities to Support at Home participants",
    url: "https://www.health.gov.au/our-work/support-at-home/responsibilities-of-support-at-home-providers/responsibilities-to-support-at-home-participants",
    owner: "Operations and Quality",
    checked: CHECKED,
    reviewBy: REVIEW,
    placeholder: false,
  },
  {
    id: "statements",
    title: "Monthly statements for Support at Home services",
    url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/monthly-statements-for-support-at-home-services",
    owner: "Finance and Operations",
    checked: CHECKED,
    reviewBy: REVIEW,
    placeholder: false,
  },
  {
    id: "care-plans",
    title: "Care plans for Support at Home participants",
    url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/care-plans-for-support-at-home-participants",
    owner: "Care Coordination",
    checked: CHECKED,
    reviewBy: REVIEW,
    placeholder: false,
  },
  {
    id: "changing",
    title: "Changing Support at Home providers",
    url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/changing-support-at-home-providers",
    owner: "Operations and Quality",
    checked: CHECKED,
    reviewBy: REVIEW,
    placeholder: false,
  },
  {
    id: "mac",
    title: "My Aged Care: Managing your Support at Home services",
    url: "https://www.myagedcare.gov.au/managing-your-support-at-home-services",
    owner: "Care Coordination",
    checked: CHECKED,
    reviewBy: REVIEW,
    placeholder: false,
  },
  {
    id: "acqsc",
    title: "Aged Care Quality and Safety Commission: Support at Home for older people",
    url: "https://www.agedcarequality.gov.au/older-people/support-home",
    owner: "Quality / complaints",
    checked: CHECKED,
    reviewBy: REVIEW,
    placeholder: false,
  },
  {
    id: "tc-escalation",
    title: "Trilogy Care clinical and incident escalation (placeholder)",
    url: "",
    owner: "Clinical governance and Quality",
    checked: "",
    reviewBy: "",
    placeholder: true,
  },
  {
    id: "tc-complaints",
    title: "Trilogy Care feedback and complaints procedure (placeholder)",
    url: "",
    owner: "Quality / complaints",
    checked: "",
    reviewBy: "",
    placeholder: true,
  },
  {
    id: "tc-exit",
    title: "Trilogy Care exit and transfer procedure (placeholder)",
    url: "",
    owner: "Operations and Quality",
    checked: "",
    reviewBy: "",
    placeholder: true,
  },
  {
    id: "tc-booking",
    title: "Trilogy Care booking and supplier escalation (placeholder)",
    url: "",
    owner: "Care Coordination operations and supplier management",
    checked: "",
    reviewBy: "",
    placeholder: true,
  },
];

// ---------------------------------------------------------------------------------------------
// Builders: every field explicit, so a case reads the same as a parsed block
// ---------------------------------------------------------------------------------------------

const opt = (id: string, text: string, feedback: string, x: Partial<Option> = {}): Option => ({
  id,
  text,
  feedback,
  levels: {},
  codes: [],
  reply: "",
  guarded: "",
  sets: [],
  needs: [],
  reveals: "",
  alt: false,
  evidence: [],
  owner: "",
  contactOnly: false,
  key: false,
  only: [],
  notIn: [],
  in: {},
  ...x,
});
const sig = (id: string, title: string, noticed: string, x: Partial<Signal> = {}): Signal => ({
  id,
  phase: "notice",
  checkpoint: "",
  group: "gaps",
  title,
  noticed,
  matters: "",
  alternatives: "",
  verify: "",
  canAct: "",
  source: "",
  updated: "",
  reliability: "verified",
  kind: "",
  visits: [],
  budget: null,
  hidden: false,
  only: [],
  notIn: [],
  ...x,
});
const step = (id: string, phase: Step["phase"], title: string, prompt: string, options: Option[], x: Partial<Step> = {}): Step => ({
  id,
  phase,
  kind: "single",
  title,
  prompt,
  min: 1,
  max: 1,
  signal: "",
  afterPlan: false,
  needsAlt: false,
  revises: "",
  checkpoint: "",
  evidenceStep: "",
  options,
  only: [],
  notIn: [],
  ...x,
});

// The money card: week 8 of 12, a fictional $6,000 quarterly budget. $2,480 (41%) shows as unspent; $180 delivered on
// 12 November hasn't reached the statement; $2,000 is scheduled; the two missed cleans are a $300 service gap.
const MONEY: BudgetFigures = {
  quarterlyCents: 600_000,
  week: 8,
  weeks: 12,
  plannedToDateCents: 400_000,
  deliveredToDateCents: 370_000,
  claimedToDateCents: 352_000,
  pendingClaimsCents: null,
  scheduledRemainderCents: 200_000,
  pausedCents: 0,
  feedUpdated: "Thu 19 Nov, 6:00 am",
};

// ---------------------------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------------------------

const SIGNALS: Signal[] = [
  sig(
    "s-cleans",
    "Two Tuesday cleans not delivered",
    "Brightway Home Services cancelled Mrs Patel’s Tuesday cleans on 10 and 17 November. No replacement was delivered either week.",
    {
      group: "delivery",
      matters: "Her care plan says reliable cleaning lets her keep hosting her book group on Tuesday afternoons.",
      alternatives: "Did she ask to cancel, or was she away? Was another day arranged and delivered?",
      verify: "The supplier’s cancellation records, and whether she still wants Tuesdays.",
      canAct: "The booking and scheduling owner, with the supplier.",
      source: "Booking and delivery record (fictional)",
      updated: "Fri 20 Nov, 4:10 pm",
      visits: [
        { date: "2026-11-10", outcome: "missed", reason: "supplier", note: "Cancelled by the supplier at 7:40 am: worker unwell." },
        { date: "2026-11-17", outcome: "missed", reason: "supplier", note: "Cancelled by the supplier the evening before: roster gap." },
      ],
      notIn: ["pause"],
    },
  ),
  sig(
    "s-cleans-pause",
    "Two Tuesday cleans not delivered",
    "Mrs Patel’s Tuesday cleans on 10 and 17 November didn’t happen. She asked to pause them while she stayed with her sister; the pause was agreed and recorded on 6 November, restarting on Tuesday 24 November.",
    {
      group: "delivery",
      matters: "A gap between planned and delivered services can mean unmet support, or a choice she made.",
      alternatives: "A pause she chose; a hospital stay; a supplier that didn’t come.",
      verify: "The pause note, and that cleaning restarts when she said.",
      canAct: "The booking and scheduling owner.",
      source: "Booking and delivery record (fictional)",
      updated: "Fri 20 Nov, 4:10 pm",
      visits: [
        { date: "2026-11-10", outcome: "missed", reason: "pause", note: "Paused at her request while away." },
        { date: "2026-11-17", outcome: "missed", reason: "pause", note: "Paused at her request while away." },
      ],
      only: ["pause"],
    },
  ),
  sig(
    "s-replacement",
    "A replacement offered at a time she couldn’t use",
    "After the 17 November cancellation, Brightway offered Thursday 19 November at 7 am. Mrs Patel said she couldn’t manage that time, and it wasn’t booked.",
    {
      group: "contractor",
      matters: "A replacement on any day isn’t the same as a solution, and it may come back later.",
      alternatives: "Perhaps no Tuesday worker exists this week; perhaps nobody asked her which times suit her.",
      verify: "Which times and days suit her, and what the supplier can actually confirm.",
      canAct: "The booking and scheduling owner.",
      source: "Booking notes (fictional)",
      updated: "Wed 18 Nov, 11:30 am",
      notIn: ["pause"],
    },
  ),
  sig("s-budget", "About 40% of the quarter’s service budget remains", "The dashboard shows $2,480 of a $6,000 quarterly budget unspent, in week 8 of 12.", {
    group: "money",
    matters: "A large projected balance can mean planned support isn’t reaching her. It can also mean very little.",
    alternatives: "Services not delivered; a delivered service not yet claimed; services she chose to pause; services still scheduled this quarter.",
    verify: "Delivered, claimed, pending and scheduled amounts kept apart, against her plan and goals.",
    canAct: "You, with billing for the figures.",
    source: "Budget dashboard and statement feed (fictional)",
    updated: "Thu 19 Nov, 6:00 am",
    reliability: "stale",
    budget: MONEY,
    notIn: ["pause"],
  }),
  sig(
    "s-budget-pause",
    "About 40% of the quarter’s service budget remains",
    "The dashboard shows $2,480 of a $6,000 quarterly budget unspent, in week 8 of 12.",
    {
      group: "money",
      matters: "A large projected balance can mean planned support isn’t reaching her. It can also mean very little.",
      alternatives: "Services not delivered; a delivered service not yet claimed; services she chose to pause; services still scheduled this quarter.",
      verify: "Delivered, claimed, pending and scheduled amounts kept apart, against her plan and goals.",
      canAct: "You, with billing for the figures.",
      source: "Budget dashboard and statement feed (fictional)",
      updated: "Thu 19 Nov, 6:00 am",
      reliability: "stale",
      budget: { ...MONEY, pausedCents: 30_000 },
      only: ["pause"],
    },
  ),
  sig(
    "s-invoice",
    "An invoice line she doesn’t recognise",
    "Brightway’s November invoice includes “Additional clean, 2 hours, Sat 14 Nov: $150”. Mrs Patel told the front desk nobody came that Saturday.",
    {
      group: "money",
      kind: "billing",
      reliability: "reported",
      matters: "It may be a billing error, a presentation problem or a misunderstanding. Either way, she should know what she’s charged for.",
      alternatives: "A line billed in error; a visit recorded on the wrong date; a real visit she’s forgotten.",
      verify: "The supplier’s record for 14 November, and the line against her agreed services.",
      canAct: "Billing / Finance, who can hold the line while it’s reviewed.",
      source: "Supplier invoice (fictional)",
      updated: "Fri 20 Nov, 2:00 pm",
      notIn: ["pause"],
    },
  ),
  sig(
    "s-asha",
    "A frustrated message from Asha",
    "Voicemail: “It’s Asha, Mrs Patel’s daughter. Mum’s had no cleaner for two weeks and apparently there’s heaps of money left. Can someone send me her budget and sort this out?”",
    {
      group: "supporter",
      reliability: "reported",
      matters: "Asha is worried, and she helps her mum with appointment changes.",
      alternatives: "Asha may not know what her mum wants, or what she agreed Asha can see.",
      verify: "Mrs Patel’s recorded sharing preferences, and what she wants now.",
      canAct: "You, after hearing Mrs Patel.",
      source: "Phone message log (fictional)",
      updated: "Fri 20 Nov, 5:25 pm",
      notIn: ["pause"],
    },
  ),
  sig(
    "s-asha-pause",
    "A message from Asha",
    "Voicemail: “It’s Asha, Mrs Patel’s daughter. Someone told Mum there’s money left over this quarter. Should she be using it? Can you send me the figures?”",
    {
      group: "supporter",
      reliability: "reported",
      matters: "Asha is trying to help, and she helps her mum with appointment changes.",
      alternatives: "Asha may not know about the pause, or what her mum agreed she can see.",
      verify: "Mrs Patel’s recorded sharing preferences, and what she wants.",
      canAct: "You, after hearing Mrs Patel.",
      source: "Phone message log (fictional)",
      updated: "Fri 20 Nov, 5:25 pm",
      only: ["pause"],
    },
  ),
  sig(
    "s-prefs",
    "Her contact and sharing preferences",
    "Mrs Patel prefers a phone call on a weekday morning. She asked that Asha be copied on appointment changes. Her budget, statements and health details stay between her and the provider; she shares them herself.",
    {
      group: "person",
      matters: "She decides who is involved, and what they’re told.",
      alternatives: "Preferences can change.",
      verify: "That they’re still current: ask her.",
      canAct: "You.",
      source: "Client record: contact and sharing preferences (fictional)",
      updated: "Care plan review, Wed 2 Sep",
    },
  ),
  sig(
    "s-plan",
    "Her care plan goal",
    "“Reliable cleaning, so I can keep hosting my book group on Tuesday afternoons.” A weekly two-hour clean, Tuesday mornings, alongside her other agreed services.",
    {
      group: "person",
      matters: "The goal is reliability, not spending.",
      alternatives: "Her goals may have changed since September.",
      verify: "Ask her what matters now.",
      canAct: "You, with the care-plan review process if her needs change.",
      source: "Care plan (fictional)",
      updated: "Care plan review, Wed 2 Sep",
    },
  ),
  // Records the learner can request (one of them).
  sig(
    "s-claims",
    "The claims feed, refreshed",
    "Refreshed on Monday morning: a service delivered on 12 November ($180) hasn’t been claimed yet, so the balance shown is $180 higher than what’s really left.",
    {
      group: "money",
      matters: "A slow claim feed can make a balance look unused when the care happened.",
      alternatives: "More claims may still be on their way.",
      verify: "Nothing more for now: billing confirms the line when it’s processed.",
      canAct: "Billing / Finance.",
      source: "Statement feed (fictional)",
      updated: "Mon 23 Nov, 9:00 am",
      budget: { ...MONEY, pendingClaimsCents: 18_000, feedUpdated: "Mon 23 Nov, 9:00 am" },
      hidden: true,
    },
  ),
  sig(
    "s-claims-pause",
    "The claims feed, refreshed",
    "Refreshed on Monday morning: a service delivered on 12 November ($180) hasn’t been claimed yet, so the balance shown is $180 higher than what’s really left.",
    {
      group: "money",
      matters: "A slow claim feed can make a balance look unused when the care happened.",
      alternatives: "More claims may still be on their way.",
      verify: "Nothing more for now: billing confirms the line when it’s processed.",
      canAct: "Billing / Finance.",
      source: "Statement feed (fictional)",
      updated: "Mon 23 Nov, 9:00 am",
      budget: { ...MONEY, pausedCents: 30_000, pendingClaimsCents: 18_000, feedUpdated: "Mon 23 Nov, 9:00 am" },
      hidden: true,
      only: ["pause"],
    },
  ),
  sig(
    "s-roster",
    "Brightway’s roster for next Tuesday",
    "Brightway won’t know about Tuesday 1 December until Friday’s roster is done. The worker who usually covers Tuesday mornings has left.",
    {
      group: "contractor",
      matters: "Nothing about next Tuesday is confirmed yet.",
      alternatives: "They may find someone; they may not.",
      verify: "Friday’s roster, in writing.",
      canAct: "The booking and scheduling owner.",
      source: "Supplier email (fictional)",
      updated: "Mon 23 Nov, 8:45 am",
      hidden: true,
      notIn: ["pause"],
    },
  ),
  sig(
    "s-history",
    "Earlier contacts",
    "Mrs Patel rang on 11 November about the first missed clean. The note says “will call back”, with no outcome recorded.",
    {
      group: "gaps",
      matters: "A promised call that didn’t happen is its own relationship problem.",
      alternatives: "Someone may have called back and not recorded it.",
      verify: "Ask her, and check other channels.",
      canAct: "You.",
      source: "Contact log (fictional)",
      updated: "Wed 11 Nov, 10:05 am",
      hidden: true,
    },
  ),
  // Day 7 and Day 28 checkpoints.
  sig("c7-booked", "Booking confirmed", "Another approved supplier is booked for Tuesday 1 December, 9 am, confirmed in writing on Friday.", {
    phase: "check",
    checkpoint: "day7",
    group: "followup",
    kind: "booking",
    source: "Booking record (fictional)",
    updated: "Fri 27 Nov, 3:00 pm",
    notIn: ["pause"],
  }),
  sig("c7-sent", "Reminder sent", "A text reminder about Tuesday’s clean went to Mrs Patel on Monday 30 November.", {
    phase: "check",
    checkpoint: "day7",
    group: "followup",
    kind: "booking",
    source: "Messaging log (fictional)",
    updated: "Mon 30 Nov, 9:00 am",
    notIn: ["pause"],
  }),
  sig("c7-delivered", "Delivered", "Tuesday 1 December: clean delivered, 9:05 to 11:00 am.", {
    phase: "check",
    checkpoint: "day7",
    group: "followup",
    kind: "delivery",
    source: "Supplier delivery record (fictional)",
    updated: "Tue 1 Dec, 11:20 am",
    notIn: ["pause"],
  }),
  sig("c7-billing", "Billing", "The 14 November line was billed in error for the cancelled 10 November clean. It’s credited on her next statement.", {
    phase: "check",
    checkpoint: "day7",
    group: "followup",
    kind: "billing",
    source: "Billing review (fictional)",
    updated: "Wed 2 Dec, 10:00 am",
    notIn: ["pause"],
  }),
  sig("c7-person", "Mrs Patel, on the phone", "“She came, she was lovely, and she finished well before my book group. Thank you for explaining that charge.”", {
    phase: "check",
    checkpoint: "day7",
    group: "followup",
    kind: "person",
    reliability: "reported",
    source: "Your call (fictional)",
    updated: "Wed 2 Dec, 10:30 am",
    notIn: ["pause"],
  }),
  sig(
    "c7-clinical",
    "Clinical follow-up",
    "The clinical lead spoke with Mrs Patel on 25 November and arranged an occupational therapist’s home visit. The slip was recorded through the incident process.",
    {
      phase: "check",
      checkpoint: "day7",
      group: "followup",
      source: "Clinical note (fictional)",
      updated: "Wed 25 Nov, 2:00 pm",
      only: ["safety"],
    },
  ),
  sig("c7p-restarted", "Delivered", "Tuesday 24 November: clean delivered, 9:00 to 11:00 am, as planned after her pause.", {
    phase: "check",
    checkpoint: "day7",
    group: "followup",
    kind: "delivery",
    source: "Supplier delivery record (fictional)",
    updated: "Tue 24 Nov, 11:15 am",
    only: ["pause"],
  }),
  sig("c7p-claim", "Billing", "The 12 November claim reached the statement. The balance now matches what was delivered.", {
    phase: "check",
    checkpoint: "day7",
    group: "followup",
    kind: "billing",
    source: "Statement feed (fictional)",
    updated: "Wed 25 Nov, 6:00 am",
    only: ["pause"],
  }),
  sig("c7p-person", "Mrs Patel, on the phone", "“I’m back, and the cleaner came today. I don’t need anything else, thank you. Do tell Asha I’m home.”", {
    phase: "check",
    checkpoint: "day7",
    group: "followup",
    kind: "person",
    reliability: "reported",
    source: "Her call to you (fictional)",
    updated: "Tue 24 Nov, 12:30 pm",
    only: ["pause"],
  }),
  sig("c28-delivered", "Delivered", "Tuesdays 1, 8 and 15 December: each clean delivered by the same worker.", {
    phase: "check",
    checkpoint: "day28",
    group: "followup",
    kind: "delivery",
    source: "Supplier delivery record (fictional)",
    updated: "Tue 15 Dec, 11:10 am",
    notIn: ["pause"],
  }),
  sig("c28-person", "Day 28: Mrs Patel", "“Three Tuesdays in a row now. The book group noticed! And the charge came off my statement.”", {
    phase: "check",
    checkpoint: "day28",
    group: "followup",
    kind: "person",
    reliability: "reported",
    source: "Your Day 28 call (fictional)",
    updated: "Mon 21 Dec, 10:00 am",
    notIn: ["pause", "moves"],
  }),
  sig(
    "c28-move",
    "Day 28: Mrs Patel",
    "“The cleaning’s been fine, dear, thank you. But my friend from book group uses another provider, nearer Asha, and I’ve decided to move to them in the new year. I’ve made up my mind.”",
    {
      phase: "check",
      checkpoint: "day28",
      group: "followup",
      kind: "transfer",
      reliability: "reported",
      source: "Your Day 28 call (fictional)",
      updated: "Mon 21 Dec, 10:00 am",
      only: ["moves"],
    },
  ),
];

// ---------------------------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------------------------

const triageOptions = (p: string, scored: boolean): Option[] => [
  opt(
    `${p}-recovery`,
    "Service recovery: concrete missed visits and a disputed charge, with an owner and a follow-up",
    "The record shows two supplier cancellations and a charge she disputes: an accountable response and a follow-up.",
    {
      levels: scored ? { signal: 3 } : {},
      in: {
        pause: {
          levels: scored ? { signal: 1 } : {},
          codes: scored ? ["pauseAsRisk"] : [],
          feedback: "Nothing failed here: the cleans were paused at her request, and the balance is a claim lag and scheduled services. Context, not recovery.",
        },
        safety: {
          levels: scored ? { signal: 2 } : {},
          feedback: "The cleaning still needs recovering, but once she mentioned the slip, that comes first: it’s an immediate escalation, alongside.",
        },
      },
    },
  ),
  opt(
    `${p}-review`,
    "Review with her: something doesn’t match, and the cause isn’t clear yet",
    "Reasonable when the cause is unknown. Ask before prescribing a fix.",
    {
      levels: scored ? { signal: 2 } : {},
    },
  ),
  opt(`${p}-context`, "Context explained: no action needed", "Not here: two supplier cancellations and a disputed line are real problems to fix.", {
    levels: scored ? { signal: 1 } : {},
    in: {
      pause: { levels: scored ? { signal: 3 } : {}, feedback: "Yes. A pause she chose and a claim lag explain the balance. Record it, and don’t pester her." },
    },
  }),
  opt(
    `${p}-immediate`,
    "Immediate escalation: urgent safety or clinical process now",
    "Nothing in the signals is a safety concern. Over-escalating sends a cleaning problem down the wrong path.",
    {
      levels: scored ? { signal: 1 } : {},
      in: {
        safety: {
          levels: scored ? { signal: 3 } : {},
          feedback: "Yes. A slip in the shower is a possible safety concern: the clinical and incident process, today.",
        },
      },
    },
  ),
];

const STEPS: Step[] = [
  // Notice: is this actually a concern?
  step(
    "facts",
    "notice",
    "What do you know for sure?",
    "Choose what the records actually show. Leave out anything you’re inferring.",
    [
      opt(
        "f-missed",
        "Two Tuesday cleans weren’t delivered: the supplier cancelled them",
        "Yes: the delivery record shows it, with the supplier as the reason.",
        {
          levels: { signal: 3 },
          key: true,
          notIn: ["pause"],
        },
      ),
      opt("f-paused", "Two Tuesday cleans were paused at her request while she was away", "Yes: the pause was agreed and recorded, so it isn’t a failure.", {
        levels: { signal: 3 },
        key: true,
        only: ["pause"],
      }),
      opt("f-replacement", "The one replacement offered was at a time she said she couldn’t manage", "Yes: it’s in the booking notes.", {
        levels: { signal: 3 },
        notIn: ["pause"],
      }),
      opt(
        "f-line",
        "Her invoice has a line she says she doesn’t recognise",
        "Yes: that the line exists, and that she doesn’t recognise it, is recorded. Whether it’s wrong isn’t known yet.",
        { levels: { signal: 3 }, notIn: ["pause"] },
      ),
      opt(
        "f-balance",
        "The dashboard shows about 40% of the budget unspent",
        "True, as a dashboard figure: but it’s processed, not current. A claim may be pending, and services are still scheduled.",
        { levels: { signal: 3 } },
      ),
      opt("f-wrong", "The invoice is wrong", "Not yet known. It may be wrong, or recorded on the wrong date. Billing checks it before anyone says so.", {
        levels: { signal: 1 },
        codes: ["inferenceAsFact"],
        notIn: ["pause"],
      }),
      opt("f-leave", "She’s likely to leave", "Nothing here says so. A balance and two missed cleans aren’t a prediction about her.", {
        levels: { signal: 0 },
        codes: ["churnVerdict"],
      }),
      opt("f-asha", "Asha speaks for her mum", "Asha helps with appointments, within limits her mum chose. Her frustration doesn’t speak for Mrs Patel.", {
        levels: { signal: 1, voice: 1 },
        codes: ["familyFirst"],
      }),
    ],
    { kind: "multi", min: 1, max: 6, signal: "evidence_selected" },
  ),
  step(
    "alternatives",
    "notice",
    "What else could explain the balance?",
    "About 40% remains in week 8 of 12. Choose every explanation worth checking.",
    [
      opt("a-missed", "Services that weren’t delivered (the two cleans)", "Yes: the $300 service gap is the two missed cleans.", {
        levels: { signal: 3 },
        alt: true,
        notIn: ["pause"],
      }),
      opt("a-pause", "A pause she asked for", "Worth confirming: here the record says the supplier cancelled, so don’t assume it.", {
        levels: { signal: 2 },
        alt: true,
        in: { pause: { levels: { signal: 3 }, feedback: "Yes: the record shows an agreed pause while she was at her sister’s." } },
      }),
      opt("a-lag", "A delivered service not yet claimed: the feed is days old", "Yes: a slow claim feed makes a balance look unused when the care happened.", {
        levels: { signal: 3 },
        alt: true,
        key: true,
      }),
      opt("a-scheduled", "Services still scheduled for the rest of the quarter", "Yes: four weeks of agreed services account for most of what’s left.", {
        levels: { signal: 3 },
        alt: true,
      }),
      opt("a-leaving", "She doesn’t value the service and is getting ready to leave", "A balance isn’t a validated prediction that someone will leave.", {
        levels: { signal: 0 },
        codes: ["churnVerdict"],
      }),
      opt(
        "a-under",
        "Nothing else: unspent money means she’s being underserviced",
        "Unspent can mean many things. Check delivered, pending and scheduled before deciding.",
        {
          levels: { signal: 1 },
          codes: ["inferenceAsFact"],
        },
      ),
    ],
    { kind: "multi", min: 1, max: 5, signal: "alternative_explanation_selected" },
  ),
  step("artefact", "notice", "Ask for one more record", "You can request one more record before deciding. Which would help most?", [
    opt("r-claims", "The claims feed, refreshed", "It shows a delivered service waiting to be claimed: the balance looked higher than it is.", {
      reveals: "s-claims",
      notIn: ["pause"],
    }),
    opt("r-claims-pause", "The claims feed, refreshed", "It shows a delivered service waiting to be claimed: the balance looked higher than it is.", {
      reveals: "s-claims-pause",
      only: ["pause"],
    }),
    opt("r-roster", "Brightway’s roster for next Tuesday", "It tells you Tuesday isn’t confirmed, before anyone promises it.", {
      reveals: "s-roster",
      notIn: ["pause"],
    }),
    opt("r-history", "Earlier contacts with her", "A “will call back” with no recorded outcome is its own relationship problem.", { reveals: "s-history" }),
    opt("r-none", "Nothing more: I’ll ask her", "Fair: she’s the best source. You’ll still need the figures before explaining the statement."),
  ]),
  step(
    "triage",
    "notice",
    "Your provisional triage",
    "Before you call anyone, what kind of concern does this look like? You can change it once you’ve heard her.",
    triageOptions("t", false),
    { needsAlt: true, signal: "triage_selected" },
  ),
  // Ask: what does the person want?
  step("first-contact", "ask", "Who do you contact first?", "You may need more than one contact. Who comes first?", [
    opt("c-her", "Mrs Patel, by phone on a weekday morning, as her record prefers", "Yes: hear what she wants before anyone plans a fix or sells a service.", {
      levels: { voice: 3 },
      key: true,
    }),
    opt(
      "c-asha",
      "Asha: she left the message and seems to know what’s going on",
      "Asha helps with appointments. Hear Mrs Patel first; her daughter’s worry doesn’t speak for her.",
      {
        levels: { voice: 1 },
        codes: ["familyFirst"],
      },
    ),
    opt(
      "c-supplier",
      "Brightway, to find out what happened",
      "A reasonable first call, if you call Mrs Patel today too. Don’t settle anything with the supplier before she’s had her say.",
      { levels: { voice: 2, cause: 3 }, notIn: ["pause"] },
    ),
    opt(
      "c-billing",
      "Billing, to hold the disputed line while it’s reviewed",
      "Defensible: preserving the line protects her. Call her today, before planning any fix.",
      { levels: { voice: 2, cause: 3 }, notIn: ["pause"] },
    ),
  ]),
  step("opening", "ask", "How do you open the call?", "Mrs Patel answers. What do you say first?", [
    opt(
      "o-heard",
      "Ask how she is, say you’ve seen the missed cleans and the charge, and ask what matters most to her",
      "She was heard, so she told you what matters: reliability and an explanation, not the money.",
      {
        levels: { voice: 3 },
        sets: ["heard"],
        reply:
          "“Thank you for ringing, dear. I don’t care about using every dollar. I just want someone to turn up on Tuesdays, and I want to know what that charge was.”",
        in: {
          pause: {
            reply: "“Oh, I’m fine, thank you. I was at my sister’s for a fortnight, that’s all. The cleaner’s back tomorrow.”",
            feedback: "She was heard, so she told you: a pause she chose, and cleaning restarting tomorrow.",
          },
        },
      },
    ),
    opt(
      "o-budget",
      "Tell her she has money left this quarter, and offer some extra services",
      "It foregrounds spending before you know what’s wrong, and offers services she hasn’t asked for.",
      {
        levels: { voice: 1, policy: 0 },
        codes: ["spendPressure"],
        reply: "“Is this about money? I’d rather just know why nobody came on Tuesday.”",
        in: { pause: { reply: "“I don’t need anything extra, dear. I’ve been away, that’s all.”" } },
      },
    ),
    opt("o-leave", "Ask her straight out whether she’s thinking of leaving", "It puts a prediction in her mouth before you’ve asked what she wants.", {
      levels: { voice: 1 },
      codes: ["churnVerdict"],
      reply: "“Leaving? I hadn’t thought about it. Should I be?”",
    }),
    opt("o-asha", "Tell her Asha rang, worried, and ask whether Asha should handle it", "It hands her decision to her daughter before she’s spoken.", {
      levels: { voice: 1 },
      codes: ["familyFirst"],
      reply: "“Asha worries. I’m quite capable of sorting out my own cleaning, thank you.”",
    }),
  ]),
  step(
    "questions",
    "ask",
    "What do you ask her?",
    "Choose up to three questions.",
    [
      opt("q-tuesday", "What would make Tuesdays work for you?", "This is the heart of it: what a fix has to achieve, in her terms.", {
        levels: { voice: 3, cause: 3 },
        key: true,
        needs: ["heard"],
        reply: "“Someone who turns up before ten. I don’t mind who, as long as they come on Tuesday morning: the book group comes at two.”",
        guarded: "“Just someone who turns up, I suppose.”",
        notIn: ["pause"],
      }),
      opt("q-charge", "Which charge on the statement don’t you recognise?", "Now billing has the line and the date to check.", {
        levels: { cause: 3 },
        key: true,
        needs: ["heard"],
        reply: "“Two hours on Saturday the fourteenth. Nobody came that Saturday. Nobody ever comes on a Saturday.”",
        guarded: "“There’s something on the bill. I’d have to find it.”",
        notIn: ["pause"],
      }),
      opt(
        "q-involve",
        "Who would you like kept in the loop, and about what?",
        "Her preferences, current and in her words: Asha on appointments, the money hers.",
        {
          levels: { voice: 3 },
          key: true,
          reply:
            "“Copy Asha on appointment changes: she drives me to things, so she needs to know. The money is my business. I’ll tell her what I want her to know.”",
        },
      ),
      opt(
        "q-budget",
        "Would you like to use the rest of your budget before the quarter ends?",
        "It puts the money first. If she raises a need, explore it; otherwise the balance is context.",
        {
          levels: { voice: 1, policy: 1 },
          reply: "“I don’t care about using every dollar, dear. Can someone just come on Tuesdays?”",
          in: { pause: { reply: "“I’ve been away, that’s all. I don’t need anything more.”" } },
        },
      ),
      opt("q-home", "How have things been at home otherwise?", "A good open question: it gives her room to raise anything else.", {
        levels: { voice: 3 },
        reply: "“Fine, apart from the cleaning.”",
        in: {
          safety: { reply: "“Well... I slipped getting out of the shower last Wednesday. I didn’t hurt myself much. I haven’t told Asha.”" },
          pause: { reply: "“Lovely, thank you. My sister spoiled me.”" },
        },
      }),
    ],
    { kind: "multi", min: 1, max: 3, signal: "participant_question_asked" },
  ),
  step(
    "safety",
    "ask",
    "Before you hang up, she mentions something",
    "“Before you go: I slipped getting out of the shower last Wednesday. I didn’t hurt myself much, and I haven’t told Asha. Don’t make a fuss.”",
    [
      opt(
        "sf-escalate",
        "Thank her for telling you, check she’s safe now, and escalate it today through the clinical and incident process; tell her what happens next, and keep the cleaning fix going",
        "Yes. A possible safety concern goes to the urgent process now, never into the 28-day queue, and the cleaning still gets fixed.",
        { levels: { cause: 3, policy: 3 }, ending: "escalated", key: true },
      ),
      opt("sf-later", "Note it, and raise it at the Day 28 check", "A slip in the shower can’t wait for the follow-up window.", { codes: ["delayedSafety"] }),
      opt(
        "sf-chair",
        "Offer her a shower chair from her remaining quarterly budget",
        "The chair may help, but it needs a clinical assessment and the AT–HM scheme, not the ongoing budget.",
        { codes: ["atHmFromOngoing", "bypassedReview"] },
      ),
      opt(
        "sf-asha",
        "Ring Asha so she can keep an eye on her mum",
        "Health details aren’t part of what Mrs Patel agreed Asha helps with. Escalate through the process, and ask her whether she wants Asha told.",
        { codes: ["restrictedDisclosure"] },
      ),
    ],
    { only: ["safety"] },
  ),
  step(
    "complaint",
    "ask",
    "She asks about a complaint",
    "“Should I put in a complaint about that charge?”",
    [
      opt(
        "cp-route",
        "Yes, if she’d like to: explain how (with you, Trilogy Care’s feedback team, or the Aged Care Quality and Safety Commission), offer to help lodge it, and say the fix goes ahead either way",
        "Yes. A complaint is her right, the fix doesn’t wait on it, and the two keep separate statuses.",
        { levels: { voice: 3, policy: 3 }, key: true },
      ),
      opt("cp-noneed", "Tell her there’s no need to complain: you’ll sort it out", "However kindly meant, it discourages a complaint.", {
        codes: ["complaintDiscouraged"],
      }),
      opt("cp-wait", "Suggest she waits until the fix has been tried, then decides", "A complaint never has to wait for the provider’s fix.", {
        codes: ["complaintDiscouraged"],
      }),
      opt(
        "cp-retention",
        "Log it as a retention issue instead of a complaint, so it doesn’t count against the business",
        "Downgrading a complaint to improve a dashboard hides it. It belongs in the complaints system, with its own reference and owner.",
        { codes: ["complaintDiscouraged"] },
      ),
    ],
    { notIn: ["pause"] },
  ),
  step(
    "diagnosis",
    "ask",
    "What’s actually wrong?",
    "Having heard her, name the problems to fix. Choose all that apply.",
    [
      opt("d-reliability", "Tuesday cleaning isn’t reliable", "Yes: the supplier’s Tuesday roster is failing her.", {
        levels: { cause: 3 },
        key: true,
        notIn: ["pause"],
      }),
      opt("d-invoice", "An invoice line needs checking and explaining", "Yes: a separate cause, with a separate owner.", {
        levels: { cause: 3 },
        key: true,
        notIn: ["pause"],
      }),
      opt("d-asha", "Asha needs appointment updates, within the scope Mrs Patel set", "Yes: that’s the family communication part, kept to what she agreed.", {
        levels: { cause: 3, voice: 3 },
      }),
      opt("d-safety", "The slip she mentioned needs the clinical process", "Yes: and it comes first.", { levels: { cause: 3 }, only: ["safety"] }),
      opt("d-nothing", "Nothing needs fixing: the pause was hers, and the claim is on its way", "Yes. No concern after verification is a valid outcome.", {
        levels: { cause: 3 },
        key: true,
        only: ["pause"],
      }),
      opt("d-balance", "The unspent balance", "The balance is context, not the problem: pending claims and scheduled services account for most of it.", {
        levels: { cause: 1 },
        codes: ["churnVerdict"],
        in: { pause: { codes: ["pauseAsRisk"] } },
      }),
      opt("d-more", "She needs more services", "She didn’t say so. If her needs change, that’s a care-plan review, not a guess.", {
        levels: { cause: 1 },
        codes: ["inferenceAsFact"],
      }),
    ],
    { kind: "multi", min: 1, max: 4 },
  ),
  step("retriage", "ask", "Your triage now", "Having heard her, what kind of concern is this?", triageOptions("rt", true), {
    revises: "triage",
    signal: "triage_selected",
  }),
  // Act: after the plan is proposed, the unexpected branch.
  step(
    "tuesdays",
    "act",
    "Friday: Brightway can’t commit to Tuesdays",
    "Brightway has lost its Tuesday-morning worker and can’t commit to Tuesdays for the rest of the year. The booking owner has found another approved supplier with a Tuesday 9 am slot from 1 December, not yet confirmed in writing. Brightway can do Thursdays.",
    [
      opt(
        "tu-choice",
        "Call her: say what can’t be promised, offer the other supplier’s Tuesday slot (once it’s confirmed) or Thursdays with Brightway, and ask what she wants, including help comparing providers if she’d like it",
        "Yes: honest about what isn’t confirmed, and her choice.",
        { levels: { voice: 3, action: 3, outcome: 3 }, key: true },
      ),
      opt(
        "tu-thursday",
        "Move her to Thursdays with Brightway, and let her know",
        "Thursday is a real offer, but nobody asked her, and her book group is on Tuesday.",
        {
          levels: { voice: 1, outcome: 2 },
        },
      ),
      opt("tu-sorted", "Tell her Tuesdays are sorted with the new supplier", "The slot isn’t confirmed in writing yet.", { codes: ["unverifiedPromise"] }),
      opt("tu-asha", "Ask Asha to find a cleaner privately", "It hands the provider’s job to her daughter.", { levels: { action: 1 }, codes: ["familyFirst"] }),
    ],
    { afterPlan: true, notIn: ["pause"] },
  ),
  // Check: did the response help?
  step("day7-evidence", "check", "Day 7: what does the record show?", "Choose the records you’d rely on to say whether the fix worked.", [], {
    kind: "evidence",
    min: 1,
    max: 6,
    checkpoint: "day7",
    signal: "evidence_selected",
    notIn: ["pause"],
  }),
  step(
    "day7",
    "check",
    "Day 7: where does it stand?",
    "Say where the case stands, from the records you chose.",
    [
      opt(
        "s7-checking",
        "Checking outcome: the first clean was delivered, she says it helped, and the charge is credited; one more check at Day 28",
        "Yes: delivery and her own view, and one visit isn’t yet a pattern.",
        { levels: { outcome: 3 }, evidence: ["delivery", "person"] },
      ),
      opt(
        "s7-closed",
        "Resolved: the new cleaner is booked and the reminder went out",
        "A booking and a message aren’t resolution: check delivery, and ask her.",
        {
          levels: { outcome: 1 },
          codes: ["noEvidence"],
        },
      ),
      opt(
        "s7-wait",
        "Still open: wait for the next Tuesday before saying anything",
        "Cautious, but you already have delivery and her view. Record what’s known.",
        {
          levels: { outcome: 2 },
        },
      ),
    ],
    { checkpoint: "day7", evidenceStep: "day7-evidence", signal: "outcome_recorded", notIn: ["pause"] },
  ),
  step("day28-evidence", "check", "Day 28: what does the record show?", "Choose the records you’d rely on now.", [], {
    kind: "evidence",
    min: 1,
    max: 6,
    checkpoint: "day28",
    signal: "evidence_selected",
    notIn: ["pause"],
  }),
  step(
    "day28",
    "check",
    "Day 28: did it help?",
    "Say where it stands, from the records you chose.",
    [
      opt(
        "s28-resolved",
        "Resolved with her: three Tuesdays delivered, the charge credited, and she says it’s working",
        "Yes: delivery evidence and her own words, against the goal she set.",
        { levels: { outcome: 3 }, evidence: ["delivery", "person"], ending: "stays" },
      ),
      opt(
        "s28-review",
        "Resolved: ask her for a five-star review while she’s happy",
        "A review isn’t the measure, and asking now turns her recovery into marketing.",
        {
          levels: { outcome: 1 },
          evidence: ["delivery", "person"],
          ending: "stays",
        },
      ),
      opt(
        "s28-open",
        "Keep it open: a month isn’t enough to be sure",
        "Honest, but she’s told you it’s working. Agree when you’ll next check, and close it with her.",
        {
          levels: { outcome: 2 },
          ending: "open",
        },
      ),
    ],
    { checkpoint: "day28", evidenceStep: "day28-evidence", signal: "outcome_recorded", notIn: ["pause", "moves"] },
  ),
  step(
    "day28-move",
    "check",
    "Day 28: she’s made a decision",
    "Say how you respond, from the records you chose.",
    [
      opt(
        "m-support",
        "Thank her, acknowledge her choice, ask what handoff she needs, and start the approved exit and transfer process: continuity until she moves, outstanding services, her final statement and her records",
        "Yes. Her choice is respected and supported. The recovery still counts: she’s leaving with reliable cleaning and an explained statement.",
        { levels: { outcome: 3, voice: 3 }, evidence: ["transfer"], ending: "transfer", key: true },
      ),
      opt("m-voucher", "Offer a discount or a gift voucher if she stays", "An inducement is retention pressure. She may change providers for any reason.", {
        codes: ["retentionPressure"],
      }),
      opt("m-asha", "Ask Asha to talk her round", "It sets her daughter against her decision.", { codes: ["retentionPressure", "familyFirst"] }),
      opt(
        "m-fail",
        "Support the move, and record it as a retention failure against the team",
        "A supported move to the provider she chose isn’t a failure, and recording it as one teaches people to resist the next one.",
        { codes: ["transferAsFailure"], ending: "transfer" },
      ),
      opt("m-delay", "Say a transfer takes a while, and ask her to give Tuesdays another month first", "It makes leaving harder to protect a statistic.", {
        codes: ["retentionPressure"],
      }),
    ],
    { checkpoint: "day28", evidenceStep: "day28-evidence", signal: "transfer_branch_completed", only: ["moves"] },
  ),
  step("p-evidence", "check", "A week on: what does the record show?", "Choose the records you’d rely on.", [], {
    kind: "evidence",
    min: 1,
    max: 6,
    checkpoint: "day7",
    signal: "evidence_selected",
    only: ["pause"],
  }),
  step(
    "p-status",
    "check",
    "A week on: where does it stand?",
    "Say where it stands, from the records you chose.",
    [
      opt(
        "ps-context",
        "No concern after verification: cleaning restarted as she planned and the claim reached the statement. Record the context; no extra calls",
        "Yes: verified, recorded, and she isn’t pestered.",
        { levels: { outcome: 3 }, evidence: ["delivery", "person"], ending: "context", key: true },
      ),
      opt("ps-weekly", "Keep calling weekly, just in case", "She’s told you she’s fine. Repeated “just checking” calls aren’t care.", {
        levels: { outcome: 1 },
        codes: ["pauseAsRisk"],
      }),
      opt("ps-spend", "Suggest she uses the balance before the quarter ends", "Pressure to spend for its own sake.", { codes: ["spendPressure"] }),
    ],
    { checkpoint: "day7", evidenceStep: "p-evidence", signal: "outcome_recorded", only: ["pause"] },
  ),
  // Learn: beyond this case.
  step(
    "improve",
    "learn",
    "Beyond this case",
    "What do you do with what you learned?",
    [
      opt(
        "i-supplier",
        "Raise the Tuesday-morning roster gap with supplier management, and the billing error with Finance, with the dates and the evidence",
        "Yes: a repeat problem leaves the individual case and goes to the owner who can fix it.",
        { levels: { system: 3 }, key: true, notIn: ["pause"] },
      ),
      opt(
        "i-feed",
        "Ask the Portal owner to show pending claims beside the balance, so a lag doesn’t look like underservicing",
        "Yes: a presentation fix that stops the next false alarm.",
        { levels: { system: 3 }, in: { pause: { feedback: "Yes: this is what made her balance look like a problem." } } },
      ),
      opt("i-none", "Nothing: it was one person’s problem", "Two cancellations from one roster and a billing error are worth raising with their owners.", {
        levels: { system: 1 },
        notIn: ["pause"],
      }),
      opt("i-context", "Nothing beyond the context note: there was no problem to fix", "Reasonable. The claim lag is still worth a word to the Portal owner.", {
        levels: { system: 2 },
        only: ["pause"],
      }),
      opt("i-course", "Ask for a training course on cancelled visits", "The roster is a supplier and process problem, not a learning gap.", {
        codes: ["duplicateCourse"],
      }),
      opt(
        "i-tag",
        "Tag her record “churn risk” so the team keeps an eye on her",
        "A label about the person, built from a service problem. Tags describe the problem, never her.",
        {
          codes: ["labelledPerson"],
        },
      ),
    ],
    { signal: "improvement_issue_raised" },
  ),
];

// ---------------------------------------------------------------------------------------------
// The plan builder
// ---------------------------------------------------------------------------------------------

const PLAN = {
  actions: [
    opt(
      "pa-booking",
      "Ask the booking owner to find a consistent Tuesday-morning cleaner, or an honest alternative, confirmed in writing before anyone tells her",
      "Yes: the reliability fix, owned by the person who can make it happen.",
      { owner: "booking", levels: { action: 3, cause: 3 }, key: true, notIn: ["pause"] },
    ),
    opt("pa-billing", "Send the 14 November line to billing for review, and hold it until it’s checked", "Yes: the invoice fix, separate from the cleaning.", {
      owner: "billing",
      levels: { action: 3, policy: 3 },
      key: true,
      notIn: ["pause"],
    }),
    opt(
      "pa-explain",
      "Explain the statement to her the way she prefers (a phone call), once billing has an answer",
      "Yes: she asked to know what that charge was.",
      {
        owner: "coordinator",
        levels: { voice: 3, policy: 3 },
        notIn: ["pause"],
      },
    ),
    opt(
      "pa-carryover",
      "If she asks about the balance, explain it plainly: pending claims and scheduled services account for most of it, and up to $1,000 can carry over",
      "Yes: accurate, and it takes the pressure off the money.",
      { owner: "coordinator", levels: { policy: 3 }, in: { pause: { feedback: "Yes: the balance was never the problem." } } },
    ),
    opt("pa-record", "Record the context so nobody nudges her about it again", "Useful, but here something does need fixing.", {
      owner: "coordinator",
      levels: { action: 2 },
      in: { pause: { levels: { action: 3, signal: 3 }, feedback: "Yes: no concern after verification, recorded so she isn’t pestered." } },
    }),
    opt(
      "pa-review",
      "If her needs or goals have changed, ask for a care-plan and budget review through the approved process",
      "Right when needs change. Here they haven’t, so it stays ready if needed.",
      { owner: "coordinator", levels: { policy: 3 } },
    ),
    opt(
      "pa-clinical",
      "Keep the clinical lead’s escalation linked to the case, with its own owner and status",
      "Yes: the safety concern keeps its own process.",
      {
        owner: "clinical",
        levels: { cause: 3 },
        only: ["safety"],
      },
    ),
    opt("pa-call", "Call her back", "A call is a step, not a fix.", { owner: "coordinator", levels: { action: 1 }, contactOnly: true }),
    opt("pa-chair", "Offer her a shower chair from the remaining quarterly budget", "Not from the ongoing budget, and not without an assessed need.", {
      codes: ["atHmFromOngoing"],
    }),
    opt("pa-extra", "Book extra visits to use the balance before quarter end", "Services follow her needs and goals, not the balance.", {
      codes: ["spendPressure"],
    }),
    opt("pa-promise", "Tell her a Tuesday cleaner is sorted from next week", "Nothing is confirmed yet.", {
      owner: "coordinator",
      codes: ["unverifiedPromise"],
    }),
    opt("pa-reason", "Tell her the 14th was an extra clean she must have forgotten", "That invents a reason the record doesn’t show.", {
      codes: ["fabricated"],
    }),
    opt("pa-voucher", "Offer a gift voucher as an apology, so she stays", "An inducement isn’t a fix, and it puts retention ahead of her choice.", {
      codes: ["retentionPressure"],
    }),
  ],
  updates: [
    opt("u-friday", "Friday, once Brightway’s roster is done, whatever it says", "Yes: a real date, with news or without it.", {
      levels: { action: 3 },
      notIn: ["pause"],
    }),
    opt("u-confirmed", "When a cleaner is confirmed", "And if nobody is? Give her a date, whatever the news.", { levels: { action: 2 }, notIn: ["pause"] }),
    opt("u-28", "Within 28 days", "That’s the internal window for checking, not a time to tell her something.", { levels: { action: 1 } }),
    opt("u-next", "At her next scheduled contact: no extra call", "Yes: nothing needs an extra call.", { levels: { action: 3 }, only: ["pause"] }),
  ],
  contingencies: [
    opt(
      "k-options",
      "If no Tuesday cleaner is confirmed by Friday, call her with the choices: another supplier on Tuesday, another day with Brightway, or help comparing providers",
      "Yes: the next step is agreed before the first fix can fail.",
      { levels: { action: 3 }, key: true, notIn: ["pause"] },
    ),
    opt("k-keep", "Keep trying until something works", "Without a date and her choices, she waits while nothing changes.", {
      levels: { action: 1 },
      codes: ["noContingency"],
    }),
    opt("k-none", "None needed: Brightway will sort it", "Brightway has already missed twice.", {
      levels: { action: 1 },
      codes: ["noContingency"],
      notIn: ["pause"],
    }),
    opt("k-restart", "If she wants cleaning to restart sooner, the booking owner arranges it", "Yes: proportionate to a pause she chose.", {
      levels: { action: 3 },
      only: ["pause"],
    }),
  ],
  checks: [
    opt(
      "ch-both",
      "After the next two Tuesdays: the delivery records, and ask her whether it helped and whether the charge is explained",
      "Yes: delivery evidence and her own view, against her goal.",
      { levels: { outcome: 3 }, key: true, notIn: ["pause"] },
    ),
    opt("ch-booked", "Close it once the new cleaner is booked", "A booking isn’t delivery, and closing it doesn’t ask her.", {
      levels: { outcome: 1 },
      notIn: ["pause"],
    }),
    opt("ch-survey", "Send her a satisfaction survey", "A score isn’t her view of whether Tuesdays work. Ask her.", { levels: { outcome: 1 } }),
    opt("ch-next", "Confirm at her next scheduled contact that cleaning restarted", "Yes: proportionate, and no extra call.", {
      levels: { outcome: 3 },
      only: ["pause"],
    }),
  ],
};

// ---------------------------------------------------------------------------------------------
// Authored paths: played by the case check and shown in the editor's branch preview
// ---------------------------------------------------------------------------------------------

const STRONG_PLAN: Plan = {
  concern: "Someone who turns up on Tuesday mornings, and to know what that charge was",
  actions: ["pa-booking", "pa-billing", "pa-explain"],
  owner: "booking",
  update: "u-friday",
  contingency: "k-options",
  check: "ch-both",
  share: ["appointments"],
  say: "I’m sorry about the two Tuesdays. I can’t promise a cleaner until it’s confirmed, but you’ll hear from me on Friday. If you’d like to make a complaint, I’ll help you lodge it.",
};
const STRONG: Record<string, string[]> = {
  facts: ["f-missed", "f-replacement", "f-line", "f-balance"],
  alternatives: ["a-missed", "a-lag", "a-scheduled"],
  artefact: ["r-claims"],
  triage: ["t-review"],
  "first-contact": ["c-her"],
  opening: ["o-heard"],
  questions: ["q-tuesday", "q-charge", "q-involve"],
  complaint: ["cp-route"],
  diagnosis: ["d-reliability", "d-invoice", "d-asha"],
  retriage: ["rt-recovery"],
  tuesdays: ["tu-choice"],
  "day7-evidence": ["c7-delivered", "c7-person", "c7-billing"],
  day7: ["s7-checking"],
  "day28-evidence": ["c28-delivered", "c28-person"],
  day28: ["s28-resolved"],
  improve: ["i-supplier"],
};
const PATHS: Path[] = [
  {
    id: "strong",
    label: "Hears her first, fixes both causes honestly, verifies with evidence",
    variation: "",
    answers: STRONG,
    plan: STRONG_PLAN,
    expect: "stays",
  },
  {
    id: "moves",
    label: "The same strong recovery, and she chooses to move: supported",
    variation: "moves",
    answers: { ...STRONG, "day28-evidence": ["c28-delivered", "c28-move"], "day28-move": ["m-support"] },
    plan: STRONG_PLAN,
    expect: "transfer",
  },
  {
    id: "pause",
    label: "A pause she chose: verified, recorded, and she isn’t pestered",
    variation: "pause",
    answers: {
      facts: ["f-paused", "f-balance"],
      alternatives: ["a-pause", "a-lag", "a-scheduled"],
      artefact: ["r-claims-pause"],
      triage: ["t-context"],
      "first-contact": ["c-her"],
      opening: ["o-heard"],
      questions: ["q-involve", "q-home"],
      diagnosis: ["d-nothing", "d-asha"],
      retriage: ["rt-context"],
      "p-evidence": ["c7p-restarted", "c7p-person", "c7p-claim"],
      "p-status": ["ps-context"],
      improve: ["i-feed"],
    },
    plan: {
      concern: "Nothing to fix: she was at her sister’s, and cleaning restarts tomorrow",
      actions: ["pa-record", "pa-carryover"],
      owner: "coordinator",
      update: "u-next",
      contingency: "k-restart",
      check: "ch-next",
      share: ["appointments"],
      say: "Welcome home. Nothing needs changing: the balance only looked high while you were away and a claim catches up.",
    },
    expect: "context",
  },
  {
    id: "safety",
    label: "A slip she hadn’t mentioned: escalated today, with the cleaning fix still owned",
    variation: "safety",
    answers: {
      ...STRONG,
      questions: ["q-tuesday", "q-charge", "q-home"],
      safety: ["sf-escalate"],
      diagnosis: ["d-reliability", "d-invoice", "d-safety"],
      retriage: ["rt-immediate"],
      "day7-evidence": ["c7-delivered", "c7-person", "c7-billing", "c7-clinical"],
    },
    plan: { ...STRONG_PLAN, actions: ["pa-booking", "pa-billing", "pa-explain", "pa-clinical"] },
    expect: "escalated",
  },
  {
    id: "shortcut",
    label: "Unsafe shortcut: spends the balance, a shower chair from ongoing funds, Asha told the budget",
    variation: "",
    answers: {
      ...STRONG,
      facts: ["f-leave", "f-balance"],
      alternatives: ["a-leaving", "a-lag"],
      artefact: ["r-none"],
      "first-contact": ["c-asha"],
      opening: ["o-budget"],
      questions: ["q-budget"],
      complaint: ["cp-noneed"],
      diagnosis: ["d-balance", "d-more"],
      tuesdays: ["tu-sorted"],
      "day7-evidence": ["c7-booked", "c7-sent"],
      improve: ["i-tag"],
    },
    plan: {
      concern: "Use the budget before quarter end",
      actions: ["pa-chair", "pa-extra"],
      owner: "family",
      update: "u-28",
      contingency: "k-none",
      check: "ch-booked",
      share: ["appointments", "budget"],
      say: "There’s no need to make a complaint, we’ll sort it.",
    },
    expect: "unsafe",
  },
  {
    id: "pressure",
    label: "She chooses to move, and is pressed to stay",
    variation: "moves",
    answers: { ...STRONG, "day28-evidence": ["c28-delivered", "c28-move"], "day28-move": ["m-voucher"] },
    plan: STRONG_PLAN,
    expect: "unsafe",
  },
];

export const MRS_PATEL_TRUST: TrustData = {
  title: "Mrs Patel’s Week 8",
  intro:
    "Two missed Tuesday cleans, a charge she doesn’t recognise, a worried daughter and a budget that looks underused. Work out what’s really wrong, ask her what she wants, fix it with the people who own it, and check it helped.",
  scenarioVersion: "patel-week8-1",
  mode: "formative",
  passMark: 15,
  ruleSetId: QUARTER_RULES[0].id,
  windowDays: 28,
  story: {
    setting: "Monday 23 November: week 8 of a 12-week Support at Home quarter.",
    role: "You’re Mrs Patel’s Care Partner. You can coordinate her services and ask the provider’s teams to act; booking, billing, complaints and clinical decisions stay with their owners.",
    situation:
      "Mrs Patel is in her late seventies and lives at home. She hosts a book group on Tuesday afternoons, so her Tuesday-morning clean matters. This morning the dashboard flags her: about 40% of the quarter’s budget unspent. There’s a voicemail from her daughter, Asha, and a note about an invoice.",
    temptation:
      "“We should use the budget before quarter end. Offer a shower chair and extra visits, then ask Asha for a review.” It’s tempting, and it assumes the cause before anyone has asked her.",
  },
  participant: {
    name: "Mrs Patel",
    about: "In her late seventies. Lives at home and hosts a book group on Tuesday afternoons. Makes her own decisions about her services.",
    goal: "Reliable cleaning, so she can keep hosting her book group on Tuesday afternoons.",
  },
  supporter: {
    name: "Asha",
    relation: "daughter",
    status: "Helps her mum with appointment changes, within the limits Mrs Patel has chosen. Not the decision-maker.",
  },
  sharing: [
    {
      id: "appointments",
      label: "Appointment changes: who’s coming, and when",
      allowed: true,
      detail: "Mrs Patel asked that Asha be copied on appointment changes.",
    },
    {
      id: "budget",
      label: "Budget, statements and charges",
      allowed: false,
      detail: "Mrs Patel asked that these stay between her and the provider. She shares them herself.",
    },
    { id: "health", label: "Health details", allowed: false, detail: "Not part of what Mrs Patel has agreed Asha helps with." },
  ],
  signals: SIGNALS,
  minOpen: 3,
  steps: STEPS,
  plan: PLAN,
  variations: [
    { id: "moves", label: "She chooses to move", text: "Some of what happens later is different this time." },
    { id: "pause", label: "A pause she chose", text: "Some of the records are different this time." },
    { id: "safety", label: "A slip she hadn’t mentioned", text: "Something comes up in the conversation this time." },
  ],
  paths: PATHS,
  endings: {
    stays:
      "Three Tuesdays delivered by the same cleaner, the charge credited and explained, and Asha kept up to date on appointments only. Mrs Patel says it’s working. That’s the outcome: suitable care, clear information and her choice, not the balance.",
    transfer:
      "The cleaning was fixed, and she still chose to move, for her own reasons. You supported it: continuity until she goes, her final statement, her records and a respectful handoff. A supported move is a good outcome.",
    context:
      "There was nothing to fix: a pause she chose, and a claim catching up. You verified it, recorded the context so nobody nudges her again, and didn’t pester her.",
    escalated:
      "The slip went to the clinical and incident process the same day, with its own owner, and the cleaning was still fixed. A safety concern never waits for a 28-day check.",
    open: "It isn’t verified yet, and you said so: the next check is agreed with her. Honest and open is better than closed and wrong.",
    unverified: "The case was closed on a booking or a message. Neither shows the clean happened, or that it helped her.",
    unsafe: "A critical error: see the correction below, then try again.",
  },
  debrief:
    "A signal is a reason to look, not a verdict. Mrs Patel’s balance was mostly scheduled services and a claim lag; her real problems were a failing Tuesday roster and a billing error, and she told you so as soon as she was asked. The measure of a good response is suitable care, clear information and genuine choice: she may stay, pause or move.",
  sources: SOURCES,
  jobAid: { snippetId: "trust-check-plan", why: "The check-in questions and the action plan from this case, for real follow-ups." },
  related: [
    { label: "Work Tools", href: "/tools", why: "The 28-Day Trust Check Work Tool and its Job Aid, for business owners and the people they authorise." },
  ],
  rationale: {
    signal: "Illustrative: repeated early cancellations, unexplained statement lines and unanswered calls (to be replaced with a verified Problem desk theme).",
    themeId: "",
    behaviour: "Separate a signal from a prediction, hear the person first, fix each cause with its owner, and verify with evidence.",
    nonLearning:
      "A missing Tuesday worker goes to supplier management; a billing feed that lags goes to the Portal and Finance owners. Neither is a learning gap.",
    whyFit: "A multi-step case lets a learner change their mind when the person reveals a different priority, which a quiz can’t.",
    existing: "Quarterly Budget Decision Lab; What does a missed service cost?; Tough Family Call; the Difficult Family Call Job Aid.",
    reviewer: "",
    measure: "",
    decision: "",
  },
  ai: { dialogue: false },
  approval: {
    owner: "",
    operations: "",
    quality: "",
    policy: "",
    finance: "",
    clinical: "",
    partnerships: "",
    privacy: "",
    learning: "",
    approvedOn: "",
    reviewBy: "",
    scenarioReviewed: "",
  },
};

export const TRUST_CASES: { id: string; label: string; data: TrustData }[] = [{ id: "patel-week8", label: "Mrs Patel’s Week 8", data: MRS_PATEL_TRUST }];
