import type { BudgetLabData } from "@/lib/budgetLab";
import type { Service } from "@/lib/quarterBudget";
import { QUARTER_RULES } from "@/lib/quarterEndRules";
import { SANDBOX_CASES } from "./sandboxCases";

/*
  Quarterly Budget Decision Lab scenarios (docs/budget-decision-lab.md). ILLUSTRATIVE TRAINING FIGURES ONLY: not a
  client record or an approved Trilogy Care service plan. Each starts as a draft with no sign-off.

  "Dot at quarter end" (the PRD's section 5). Dot keeps her established facts from the character library
  (content/digitalMembers.ts): she lives at home and tends her roses, never misses bowls on Thursday mornings, has
  osteoarthritis in both hands, would rather wait for her regular cleaner Lena than have someone new, and her daughter
  Fiona worries about the ladder she uses for the roses. Fiona is never the one who decides for Dot.

  Prices, units, categories and contribution rates are the Budget Sandbox's (content/sandboxCases.ts), imported rather
  than copied, so the two blocks can't drift apart. Physiotherapy and the platform step aren't in the Sandbox's list:
  their prices are fictional and flagged on the service for Finance to check.

  The figures reconcile exactly: an $8,000 quarterly budget (including supplements, none of which apply), a $2,400
  direct-service balance on Friday 4 December 2026 that already accounts for care management, $900 of booked services
  (their government-funded share; Dot's estimated contributions on them are $420), $1,500 projected, a $1,000
  carryover threshold and $500 projected above it.
*/

const SANDBOX = SANDBOX_CASES[0].data;
const price = (id: string) => {
  const s = SANDBOX.services.find((x) => x.id === id);
  if (!s) throw new Error(`The Budget Sandbox has no service “${id}”.`);
  return { category: s.category, unit: s.unit, unitPriceCents: s.unitPriceCents, kind: s.kind };
};
const FROM_SANDBOX = "The Budget Sandbox’s fictional price list";
const UNSIGNED = { owner: "", operations: "", policy: "", quality: "", learning: "", approvedOn: "", effectiveFrom: "", reviewBy: "", ruleSetReviewed: "" };

const services: Service[] = [
  {
    id: "physio",
    name: "Allied health: physiotherapy",
    purpose: "Hand and balance exercises, so she can keep gardening and doing her own buttons.",
    kind: "",
    category: "clinical",
    unit: "visit",
    unitPriceCents: 15000,
    unitsEach: 1,
    approved: true,
    route: "ongoing",
    supplier: "Her physiotherapist: openings on Tuesday 15 and Tuesday 22 December",
    availability: ["2026-12-15", "2026-12-22"],
    agreed: "yes",
    says: "“I missed her last Monday. I want that one back.”",
    priority: true,
    priceSource: "A fictional price for this case: physiotherapy isn’t in the Budget Sandbox’s list. Finance to check.",
  },
  {
    id: "garden",
    name: "Garden maintenance: heavy work",
    purpose: "Mowing, clearing and the heavy jobs. Dot does her roses herself.",
    ...price("garden-care"),
    unitsEach: 1.5,
    approved: true,
    route: "ongoing",
    supplier: "The gardening contractor: one extra opening, Monday 14 December",
    availability: ["2026-12-14"],
    agreed: "yes",
    says: "“If he can do the high pruning on the back roses before Christmas, good. I do the roses themselves.”",
    priority: false,
    priceSource: FROM_SANDBOX,
  },
  {
    id: "cleaning",
    name: "Domestic assistance: cleaning with Lena",
    purpose: "Lena’s weekly clean: vacuuming, the bathroom, the kitchen and the bed.",
    ...price("cleaning"),
    unitsEach: 2,
    approved: true,
    route: "ongoing",
    supplier: "Lena, her regular cleaner: fully booked until January",
    availability: [],
    agreed: "yes",
    says: "“Lena’s visits stay as they are.”",
    priority: false,
    priceSource: FROM_SANDBOX,
  },
  {
    id: "extra-clean",
    name: "Domestic assistance: an extra clean",
    purpose: "Fiona’s suggestion: a second clean each week before Christmas.",
    ...price("cleaning"),
    unitsEach: 2,
    approved: true,
    route: "ongoing",
    supplier: "A new worker from the cleaning supplier (Lena has no openings)",
    availability: ["2026-12-11", "2026-12-18"],
    agreed: "no",
    says: "“I’m not having someone new in the house. I’ll wait for Lena.”",
    priority: false,
    priceSource: FROM_SANDBOX,
  },
  {
    id: "transport",
    name: "Transport: a return trip",
    purpose: "To the shops on Tuesdays, and to bowls on Thursday mornings until the club’s Christmas break.",
    ...price("transport"),
    unitsEach: 2,
    approved: true,
    route: "ongoing",
    supplier: "The community transport service",
    availability: [],
    agreed: "yes",
    says: "“Bowls is the best part of my week.”",
    priority: false,
    priceSource: FROM_SANDBOX,
  },
  {
    id: "respite",
    name: "Flexible respite: someone with her in the garden",
    purpose: "Fiona’s suggestion: someone to stay while Dot gardens.",
    ...price("respite"),
    unitsEach: 3,
    approved: false,
    route: "ongoing",
    supplier: "The respite provider: openings on Saturday 12 and Saturday 19 December",
    availability: ["2026-12-12", "2026-12-19"],
    agreed: "no",
    says: "“I don’t need minding.”",
    priority: false,
    priceSource: FROM_SANDBOX,
  },
  {
    id: "platform-step",
    name: "Platform step with a handrail",
    purpose: "To replace the ladder Dot uses for the roses.",
    kind: "",
    category: "everyday",
    unit: "item",
    unitPriceCents: 38900,
    unitsEach: 1,
    approved: false,
    route: "at-hm",
    supplier: "Not ordered: an AT–HM item needs its own assessed need, approval and funding route",
    availability: [],
    agreed: "yes",
    says: "“If there’s a proper step that doesn’t come out of my care money, I’d look at it.”",
    priority: false,
    priceSource: "A fictional price for this case. Finance to check.",
  },
];

/** Booked for the days left (5 to 31 December): $900 of government-funded share, and $420 of Dot's estimated contributions. */
const booked: BudgetLabData["booked"] = [
  { id: "b-garden-1", serviceId: "garden", date: "2026-12-07" },
  { id: "b-shop-1", serviceId: "transport", date: "2026-12-08", note: "Shopping, return" },
  { id: "b-clean-1", serviceId: "cleaning", date: "2026-12-09" },
  { id: "b-bowls-1", serviceId: "transport", date: "2026-12-10", note: "Bowls, return" },
  { id: "b-shop-2", serviceId: "transport", date: "2026-12-15", note: "Shopping, return" },
  { id: "b-clean-2", serviceId: "cleaning", date: "2026-12-16" },
  { id: "b-bowls-2", serviceId: "transport", date: "2026-12-17", note: "Bowls, return (the club’s last day before Christmas)" },
  { id: "b-garden-2", serviceId: "garden", date: "2026-12-21" },
  { id: "b-shop-3", serviceId: "transport", date: "2026-12-22", note: "Shopping, return" },
  { id: "b-clean-3", serviceId: "cleaning", date: "2026-12-23" },
  { id: "b-shop-4", serviceId: "transport", date: "2026-12-29", note: "Shopping, return" },
  { id: "b-clean-4", serviceId: "cleaning", date: "2026-12-30" },
];

export const DOT_QUARTER_END: BudgetLabData = {
  title: "Dot at quarter end",
  intro:
    "It’s Friday 4 December. Dot has a sizeable balance, her daughter wants more help added, and Dot has her own ideas. Work out what’s really there, check with her, and plan what she wants.",
  scenarioVersion: "dot-quarter-end-1",
  ruleSetId: QUARTER_RULES[0].id,
  story: {
    participant: "Dot",
    about:
      "Dot lives at home with support from Trilogy Care. The roses in her front garden are her pride, and she never misses bowls on Thursday mornings. Osteoarthritis in both hands makes small jobs slow, and she’d still rather do them herself. She likes her regular cleaner, Lena, and would rather wait for her than have someone new.",
    decisionMaker:
      "Dot makes her own decisions. Fiona, her daughter, is close and is kept informed with Dot’s agreement. She isn’t a registered supporter, and her suggestions inform the conversation without deciding anything for Dot.",
    supporter: {
      name: "Fiona",
      relation: "daughter",
      request:
        "“Mum’s got $2,400 sitting there. Can’t we get her an extra clean before Christmas, or someone with her when she’s out in the garden? And she needs a proper step instead of that ladder.”",
    },
    goals: [
      { id: "roses", text: "I want to keep looking after my roses myself.", priority: true },
      { id: "hands", text: "I want my hands to keep working, so I can do my own buttons and the garden.", priority: true },
      { id: "lena", text: "I like the house the way Lena does it.", priority: false },
      { id: "out", text: "Bowls on Thursdays, and the shops on Tuesdays.", priority: false },
    ],
    reply:
      "“My hands are worse in the cold, and the physio helps. I missed her last Monday because the bowls club moved its Christmas lunch, and I want that one back. The high pruning on the back roses is getting beyond me: if the gardener can do the high bits before Christmas, good, but I do the roses myself. I’m not having a new cleaner. I’ll wait for Lena. And I don’t need minding. If there’s a proper step that doesn’t come out of my care money, I’d look at it. Fiona means well.”",
    equipment: "Fiona asks for a platform step with a handrail, to replace the ladder Dot uses for the roses.",
  },
  figures: {
    classificationLabel: "Fictional practice budget",
    quarterlyBudgetCents: 800_000,
    supplementsCents: 0,
    basis: "direct-after-cm",
    careManagementDeductedCents: 0,
    currentBalanceCents: 240_000,
    quarter: { start: "2026-10-01", end: "2026-12-31" },
    snapshot: "2026-12-04",
    pools: { atHmCents: null, hcpUnspentCents: null, shortTermCents: null },
  },
  rates: { ...SANDBOX.rates },
  ratesBasis:
    "Dot’s fictional assessed notice: Independence 20%, Everyday Living 40% (the Budget Sandbox’s practice rates). Clinical Supports are 0%, including physiotherapy. Effective for this quarter, from 1 October 2026.",
  services,
  booked,
  documents: [
    {
      id: "careplan",
      title: "Care plan excerpt (agreed with Dot on 1 October 2026)",
      kind: "careplan",
      body: [
        "**Goals, in Dot’s words:** “I want to keep looking after my roses myself.” “I want my hands to keep working, so I can do my own buttons and the garden.” “I like the house the way Lena does it.” “Bowls on Thursdays, and the shops on Tuesdays.”",
        "**Approved services:** domestic assistance (cleaning), weekly; transport to the shops and to bowls; garden maintenance (heavy work), fortnightly; physiotherapy, fortnightly to 31 December, for hand and balance exercises.",
        "**Not in the plan:** respite or someone staying with Dot; daily check-ins.",
        "**Contributions:** Independence 20%, Everyday Living 40%, from Dot’s fictional assessed notice. Clinical Supports, including physiotherapy, are 0%.",
        "**Decisions:** Dot makes her own decisions. Fiona is her daughter and is kept informed with Dot’s agreement; she isn’t a registered supporter.",
      ].join("\n\n"),
    },
    {
      id: "notice",
      title: "Notice of Decision excerpt (fictional)",
      kind: "notice",
      body: [
        "**Ongoing Support at Home services.** A fictional practice budget of $8,000 a quarter, including any supplements (none apply in this case).",
        "**Assessed needs:** domestic assistance, transport, garden maintenance (heavy work) and allied health (physiotherapy).",
        "**Assistive technology and home modifications (AT–HM):** none approved. An AT–HM item needs its own assessed need, approval and funding route.",
      ].join("\n\n"),
    },
    {
      id: "notes",
      title: "Case notes",
      kind: "notes",
      body: [
        "**Monday 30 November:** Dot missed her physiotherapy appointment (the bowls club moved its Christmas lunch). She asked to reschedule when we next talk.",
        "**Thursday 3 December:** an email from Fiona: “Mum’s got $2,400 sitting there. Can’t we get her an extra clean before Christmas, or someone with her when she’s out in the garden? And she needs a proper step instead of that ladder.”",
      ].join("\n\n"),
    },
  ],
  read: [
    {
      id: "projected",
      prompt: "If every booked session happens as estimated, what will {name}’s direct-service balance be at the end of the quarter?",
      options: [
        {
          id: "current",
          text: "{current}",
          feedback: "{current} is the current balance. It doesn’t yet take off the {booked} of services already booked for the rest of the quarter.",
          levels: { budget: 1 },
          flags: ["currentAsAvailable"],
        },
        {
          id: "projected",
          text: "{projected}",
          feedback:
            "Right: {current} now, less the {booked} booked estimate, is {projected} projected. It’s a projection, and it changes if a session doesn’t happen.",
          levels: { budget: 3 },
          flags: [],
        },
        { id: "threshold", text: "{threshold}", feedback: "{threshold} is the carryover threshold, not a balance.", levels: { budget: 1 }, flags: [] },
        {
          id: "above",
          text: "{above}",
          feedback: "{above} is the projected amount above the carryover threshold. It isn’t a balance, and it isn’t a spending target.",
          levels: { budget: 0 },
          flags: ["thresholdAsTarget"],
        },
      ],
    },
    {
      id: "booked",
      prompt: "What is the {booked} on the statement?",
      options: [
        {
          id: "estimate",
          text: "Agreed services booked for the rest of the quarter: an estimate until they’re delivered",
          feedback: "Right. A booking changes the projection only. Nothing is spent or claimed until a service is delivered.",
          levels: { budget: 3 },
          flags: [],
        },
        {
          id: "claimed",
          text: "Services already delivered and claimed",
          feedback: "Not yet: these are bookings. Claims follow delivery, and any booking can still change.",
          levels: { budget: 0 },
          flags: ["bookedAsSpent"],
        },
        {
          id: "target",
          text: "An amount Dot needs to spend before the quarter ends",
          feedback: "There’s no amount anyone needs to spend. The {booked} is what’s already agreed and booked.",
          levels: { budget: 0 },
          flags: ["thresholdAsTarget"],
        },
      ],
    },
    {
      id: "carry",
      prompt: "How much of the projected balance could carry into the next quarter?",
      options: [
        {
          id: "threshold",
          text: "Up to {threshold}: the higher of {minimum} or {percent} of her {budget} quarterly budget, and only what’s actually unspent",
          feedback:
            "Right. The threshold is {threshold} here, limited to what’s actually unspent. About {above} is projected above it: that’s information to explain, not a target.",
          levels: { budget: 3 },
          flags: [],
        },
        {
          id: "all",
          text: "All of it",
          feedback: "Unspent ongoing funds carry over only up to the threshold: here {threshold}.",
          levels: { budget: 0 },
          flags: ["carryAll"],
        },
        {
          id: "percent",
          text: "{percentOf}: {percent} of her quarterly budget",
          feedback: "The rule is the higher of {minimum} or {percent} ({percentOf}): here {threshold}.",
          levels: { budget: 1 },
          flags: [],
        },
        {
          id: "none",
          text: "Nothing: unspent money is lost at the end of the quarter",
          feedback: "Up to {threshold} carries over automatically. “Use it or lose it” isn’t the rule, and it isn’t a reason to add care.",
          levels: { budget: 0 },
          flags: ["thresholdAsTarget"],
        },
      ],
    },
  ],
  conversation: {
    id: "conversation",
    prompt: "How will you check with Dot?",
    options: [
      {
        id: "ask-dot",
        text: "Call Dot. Ask how her hands and the garden are going and what she’d like before Christmas, mention Fiona’s ideas, and ask whether she’d like Fiona there.",
        feedback: "You started with Dot: what matters to her, then what she’d like. Fiona’s ideas are part of the conversation, and Dot decides who’s in it.",
        levels: { choice: 3 },
        flags: [],
      },
      {
        id: "reply-fiona",
        text: "Reply to Fiona with what could be added, since she asked, then let Dot know.",
        feedback: "Fiona’s worry is real, but she isn’t Dot’s registered supporter and she doesn’t decide for her. Start with Dot.",
        levels: { choice: 1 },
        flags: ["familyDecides"],
      },
      {
        id: "spend-it",
        text: "Tell Dot she has {above} to use before it’s lost, and suggest services to use it on.",
        feedback: "That puts the balance first and Dot second, and it isn’t the rule: up to {threshold} carries over. Ask what she wants.",
        levels: { choice: 0 },
        flags: ["thresholdAsTarget"],
      },
    ],
  },
  equipment: {
    id: "equipment",
    prompt: "Fiona asks for a platform step with a handrail to replace Dot’s ladder, and Dot would look at one. How will you route it?",
    options: [
      {
        id: "at-hm",
        text: "Refer it to the AT–HM pathway: check the assessed need (it may need an occupational therapist), the approval and the funding route before anything is ordered.",
        feedback:
          "Right. AT–HM is separate from the ongoing quarterly budget, with its own approval and funding route. Money left in the quarter doesn’t change that.",
        levels: { route: 3 },
        flags: [],
      },
      {
        id: "ongoing",
        text: "Buy it from her ongoing balance, since there’s money above the threshold.",
        feedback:
          "An AT–HM item can’t be bought from the ongoing quarterly budget because money remains. The engine won’t add it, and in a real case it would need the AT–HM route.",
        levels: { route: 0 },
        flags: ["atHmFromOngoing"],
      },
      {
        id: "reimburse",
        text: "Tell Fiona to buy it now and it can be reimbursed later.",
        feedback: "Nobody has approved a reimbursement. Check the need and route first, so Dot and Fiona aren’t left out of pocket.",
        levels: { route: 1 },
        flags: ["unapprovedPromise"],
      },
    ],
  },
  explanation: {
    id: "explanation",
    prompt: "How would you explain the plan to Dot?",
    options: [
      {
        id: "plain",
        text: "“Your balance is {current} now. If everything booked happens, about {projected} will be left. Up to {threshold} of that carries into the new year; anything above it probably won’t, and that’s all right, because we only add what you want. You pay your share of each service as it’s delivered, and we’ll look at your January statement together.”",
        feedback: "Plain words, current and projected kept apart, the carryover rule, her contribution and what’s uncertain, and a date to check.",
        levels: { explain: 3, budget: 3, deliverable: 3, choice: 3 },
        flags: [],
      },
      {
        id: "lose-it",
        text: "“You’ve got about {above} to use before 31 December or you’ll lose it, so we’ve booked a few extra things.”",
        feedback: "That makes the balance the reason for care. Explain the threshold, and add only what Dot wants.",
        levels: { explain: 0 },
        flags: ["thresholdAsTarget"],
      },
      {
        id: "covered",
        text: "“It’s all covered by your package, so there’s nothing for you to pay.”",
        feedback:
          "Not true: cleaning, garden work and transport have contributions at her assessed rates. A known contribution is explained before she agrees, never left out.",
        levels: { explain: 0 },
        flags: ["concealContribution"],
      },
      {
        id: "paid",
        text: "“Your balance is {projected} now that December’s services are paid for.”",
        feedback: "December’s services aren’t delivered or paid for yet. {projected} is a projection; the current balance is {current}.",
        levels: { explain: 1, budget: 1 },
        flags: ["bookedAsSpent"],
      },
    ],
  },
  nextStep: {
    id: "next",
    prompt: "What will you record, and what’s the next check?",
    options: [
      {
        id: "record",
        text: "Record what Dot agreed and why, the estimate and her contributions, what she still wants next quarter, and a date to check the January statement with her.",
        feedback: "That’s a documented decision with a follow-up: what was agreed, what was estimated, and when you’ll check it happened.",
        levels: { explain: 3, deliverable: 3, route: 3 },
        flags: [],
      },
      {
        id: "claim",
        text: "Claim December’s booked services now, so the statement is accurate.",
        feedback: "A service is claimed after it’s delivered, never before. Bookings stay bookings.",
        levels: { explain: 0, deliverable: 0 },
        flags: ["claimUndelivered"],
      },
      {
        id: "move-all",
        text: "Ask Finance to move the whole projected balance into next quarter.",
        feedback: "Carryover happens automatically up to the threshold. Nobody moves the whole balance.",
        levels: { explain: 1, route: 1 },
        flags: ["carryAll"],
      },
      {
        id: "review",
        text: "Request a full care plan review now.",
        feedback: "A review is the route when needs change. Dot’s haven’t: she wants her physio back. If something changes when you talk, a review is right.",
        levels: { explain: 2, route: 1 },
        flags: [],
      },
    ],
  },
  avoid: [
    {
      phrase: "use it or lose it",
      why: "Up to the threshold carries over automatically, and care is never added to use a balance.",
      flag: "thresholdAsTarget",
    },
    { phrase: "spend the rest", why: "There’s no amount to spend: plan what she wants.", flag: "thresholdAsTarget" },
    { phrase: "already claimed", why: "Booked services aren’t claimed until they’re delivered.", flag: "bookedAsSpent" },
  ],
  endings: {
    added:
      "You added sessions to Dot’s plan. Her projected balance is {projected}: up to {threshold} is likely to carry over and about {above} is above that. When the plan is what she wants and can have, that’s fine: the amount above the threshold is never a reason to add more.",
    review:
      "You requested a care plan review. That’s the route when needs change; it doesn’t change the projection until a reviewed plan is agreed. Record why, and what Dot wants meanwhile.",
    unchanged:
      "You left the plan as it is. When nothing more is wanted or can be delivered, that’s a defensible ending: explain that about {above} may not carry over, record why, and plan the next quarter with her.",
  },
  twists: [
    {
      id: "physio-full",
      label: "The physio’s books are full",
      text: "The physiotherapist rang: no openings before 31 December. The first is Wednesday 6 January, in the next quarter.",
      cancel: [],
      availability: { physio: [] },
    },
    {
      id: "garden-cancelled",
      label: "A supplier cancels",
      text: "The gardening contractor has cancelled Monday 21 December and has no other December dates. Dot’s current balance hasn’t changed; her projected balance goes up by that visit’s estimate. That isn’t money to spend straight away.",
      cancel: ["b-garden-2"],
      availability: { garden: [] },
    },
  ],
  debrief:
    "The right answer is a plan Dot understands and agrees with, within the funding and service rules. A low closing balance isn’t an outcome in itself. The current balance is what’s there now; the projection is what it may be; the carryover threshold says what moves to next quarter. AT–HM has its own route. And Dot decides, with Fiona informed.",
  assessment: { mode: "formative", passMark: 11 },
  jobAid: {
    snippetId: "quarterly-budget-check",
    why: "For a real participant near quarter end: the current budget, care plan and statement, current versus projected, and the approved next step.",
  },
  sources: QUARTER_RULES[0].sources.map((s) => ({ title: s.title, url: s.url })),
  rationale: {
    theme: "Repeated coordinator questions about projected quarter-end balances, grouped and verified by an owner.",
    themeId: "",
    themeOwner: "",
    behaviour:
      "Reconcile delivered and planned services, ask the participant what matters, check approval and contributions, then explain the plan and document the decision.",
    barrier:
      "A current balance is mistaken for discretionary spending; AT–HM is treated as part of the ongoing budget; or a family request displaces the person’s own preference. Hypotheses until checked.",
    whyFit:
      "A changing budget and several plausible choices need repeated decisions with visible consequences. Static guidance alone can’t show the effect of scheduled services and different funding routes.",
    evidence:
      "The learner selects actions, identifies funding routes, explains a choice, views feedback and retries an altered case. A score is practice evidence, not proof of real-world performance.",
    measure:
      "A separately owned measure, such as verified budget-plan rework or contribution enquiries per 100 relevant cases, with a baseline, denominator and review date. Not inferred from completion.",
    systemFix:
      "If the issue is an inaccessible statement, an incorrect Portal figure, an unclear price or a delayed supplier booking, that needs a process fix too.",
    decision: "",
  },
  approval: UNSIGNED,
};

export const BUDGET_LAB_CASES: { id: string; label: string; data: BudgetLabData }[] = [
  { id: "dot", label: "Dot at quarter end (October to December 2026)", data: DOT_QUARTER_END },
];
