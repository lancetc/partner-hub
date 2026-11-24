import type { CashBridgeLabData } from "@/lib/cashBridgeLab";
import { BASELINE, DEFINITIONS_VERSION, type CashEvent, type CashInputs, type Hire, type NewClient, type Scenario } from "@/lib/cashBridge";
import { MAYA_INPUTS } from "@/lib/hiringRunway";

/*
  The reviewed fictional case for "Can we fund the next 90 days?" (docs/cash-bridge.md). Every person, business and
  figure is invented for practice: none is a Trilogy Care rate, a real agreement term, a tax rule or a due date.

  It returns to Maya with her established facts from the Hiring Runway lab, the Workload Lens, Local Coverage, the
  Referral Journey and the Service Reliability case: a small Care Partner business in Toowoomba; 35 clients; three
  start each month and about one leaves; $26,720 in the bank and $10,000 kept in reserve; ready to hire a second
  coordinator. Her coordinator isn't named (the library's "Sam" is a Trilogy Care team member). Workers are
  anonymous; clients are "Start 1" to "Start 9".

  The commercial terms aren't copied: the fee, the payment lag, the opening cash and the reserve are read from the
  Hiring Runway's fictional agreement and cash sheet (MAYA_INPUTS), and so is the capacity model. The loaded
  coordinator cost there ($7,550 a month an FTE) is split here into its dated parts: $3,000 gross pay a fortnight,
  $360 super seven days after each payday, and $270 a month of other on-costs (3,000 × 26 ÷ 12 + 360 × 26 ÷ 12 + 270
  = 7,550). The 0.6 FTE hire is 60% of each. The $4,000 one-off hiring cost is split into four dated purchases.

  The 90 days: Tuesday 1 December 2026 to Sunday 28 February 2027, as of Monday 30 November.
*/

const ev = (id: string, label: string, category: CashEvent["category"], date: string, amount: number, more: Partial<CashEvent> = {}): CashEvent => ({
  id,
  label,
  category,
  date,
  amount,
  status: "committed",
  source: "fictional",
  asOf: "2026-11-30",
  uncertain: false,
  discretionary: false,
  essential: false,
  serviceMonth: "",
  overdue: false,
  note: "",
  ...more,
});

const coordinator = (id: string, label: string, share: number, more: Partial<Hire>): Hire => ({
  id,
  label,
  fte: share,
  start: "",
  existing: false,
  committed: false,
  payAnchor: "2026-12-03",
  everyDays: 14,
  basis: "components",
  grossPerPay: 3_000 * share,
  superPerPay: 360 * share,
  superLagDays: 7,
  onCostPerMonth: 270 * share,
  onCostDay: 15,
  loadedPerPay: null,
  source: "fictional",
  ...more,
});

const start = (id: string, label: string, certainty: NewClient["certainty"], date: string): NewClient => ({
  id,
  label,
  certainty,
  start: date,
  source: "fictional",
});

const patch = (p: Partial<Scenario>): Scenario => ({ ...structuredClone(BASELINE), ...p });

const MAYA_90: CashInputs = {
  startDate: "2026-12-01",
  asOf: "2026-11-30",
  openingCash: MAYA_INPUTS.openingCash,
  openingSource: "fictional",
  reserve: MAYA_INPUTS.reserve,
  agreement: {
    label: "Maya’s partner agreement (fictional), schedule 2",
    feePerMonth: MAYA_INPUTS.incomePerClient,
    earning: "monthEnd",
    lagMonths: MAYA_INPUTS.paymentLagMonths,
    payDay: "lastWeekday",
    clearDays: 0,
    source: "fictional",
    asOf: "2026-11-30",
  },
  caseload: { active: 35, exits: ["2026-12-18", "2027-01-22", "2027-02-19"], source: "fictional" },
  clients: [
    start("c1", "Start 1", "agreement", "2026-12-07"),
    start("c2", "Start 2", "agreement", "2026-12-14"),
    // The family asked for an earlier start: moved forward from January.
    start("c3", "Start 3", "agreement", "2026-12-21"),
    start("c4", "Start 4", "allocation", "2027-01-11"),
    start("c5", "Start 5", "agreement", "2027-01-18"),
    start("c6", "Start 6", "enquiry", "2027-01-25"),
    start("c7", "Start 7", "agreement", "2027-02-08"),
    start("c8", "Start 8", "enquiry", "2027-02-15"),
    start("c9", "Start 9", "enquiry", "2027-02-22"),
  ],
  hires: [
    coordinator("h-current", "Current coordinator", 1, { start: "2025-03-03", existing: true, committed: true }),
    coordinator("h-new", "New coordinator (0.6 FTE)", 0.6, { start: "2027-01-04" }),
  ],
  events: [
    ev("rec-nov", "November’s partner fees (35 × $360), already earned", "receivable", "2026-12-31", 12_600, {
      serviceMonth: "2026-11",
      uncertain: true,
      note: "Earned for November; the agreement pays it on the last weekday of December.",
    }),
    ev("ad", "Recruitment advertising and agency fee", "setup", "2026-12-03", 2_000, { note: "Already booked." }),
    ev("laptop", "New coordinator’s laptop and phone", "setup", "2026-12-14", 900, {
      status: "projected",
      discretionary: true,
      essential: true,
      note: "Not ordered yet, but the new coordinator can’t work safely without them.",
    }),
    ev("desk", "Second desk and office fit-out", "setup", "2026-12-14", 700, {
      status: "projected",
      discretionary: true,
      note: "Not ordered yet. The new coordinator can share the existing desk for a few weeks.",
    }),
    ev("induction", "Induction and training course", "setup", "2027-01-04", 400, { essential: true }),
    ev("oh-dec", "Office, insurance and phone", "overhead", "2026-12-05", 1_250),
    ev("oh-jan", "Office, insurance and phone", "overhead", "2027-01-05", 1_250),
    ev("oh-feb", "Office, insurance and phone", "overhead", "2027-02-05", 1_250),
    ev("st-dec", "Software and travel (about $20 a participant)", "overhead", "2026-12-20", 740),
    ev("st-jan", "Software and travel (about $20 a participant)", "overhead", "2027-01-20", 740),
    ev("st-feb", "Software and travel (about $20 a participant)", "overhead", "2027-02-20", 740),
    ev("own-dec", "Maya’s own pay", "owner", "2026-12-28", 2_500),
    ev("own-jan", "Maya’s own pay", "owner", "2027-01-28", 2_500),
    ev("own-feb", "Maya’s own pay", "owner", "2027-02-26", 2_500),
    ev("bas", "October–December BAS: GST and an income tax instalment (her bookkeeper’s figures)", "tax", "2027-02-26", 2_140),
    // Financing: only in the costed overdraft option.
    ev("od-draw", "Overdraft drawn (if the bank approves it)", "draw", "2027-01-27", 6_000, { status: "projected" }),
    ev("od-fee", "Overdraft establishment fee", "financeCost", "2027-01-27", 60, { status: "projected" }),
    ev("od-interest", "Overdraft interest for a month", "financeCost", "2027-02-26", 35, { status: "projected" }),
    ev("od-repay", "Overdraft repaid", "repayment", "2027-02-26", 6_000, { status: "projected" }),
  ],
  statutory: { super: "supplied", payg: "supplied", gst: "supplied", incomeTax: "supplied" },
  credit: { limit: 15_000, committed: false, note: "An overdraft the bank has offered in principle. Not approved, and never cash." },
  capacity: { model: MAYA_INPUTS, rampMonths: 2 },
};

/** The PRD's worked fixture: its own figures, to check the rule. */
const EXAMPLE: CashInputs = {
  startDate: "2026-12-01",
  asOf: "2026-11-30",
  openingCash: 10_000,
  openingSource: "fictional",
  reserve: 4_000,
  agreement: null,
  caseload: { active: 0, exits: [], source: "fictional" },
  clients: [],
  hires: [],
  events: [
    ev("x1in", "Receipt", "otherIncome", "2026-12-01", 2_000, { uncertain: true }),
    ev("x1out", "Payment", "other", "2026-12-01", 5_000),
    ev("x2in", "Receipt", "otherIncome", "2026-12-08", 1_000, { uncertain: true }),
    ev("x2out", "Payment", "other", "2026-12-08", 6_000),
    ev("x3in", "Receipt", "otherIncome", "2026-12-15", 6_000, { uncertain: true }),
    ev("x3out", "Payment", "other", "2026-12-15", 3_000),
  ],
  statutory: { super: "na", payg: "na", gst: "na", incomeTax: "na" },
  credit: { limit: null, committed: false, note: "" },
  capacity: null,
};

const FUND_90: CashBridgeLabData = {
  title: "Can we fund the next 90 days?",
  intro:
    "Maya’s caseload plan says hire. Her bank account has its own calendar. Follow her next 90 days date by date: when the money arrives, when the pay runs leave, and what it would take to keep her reserve.",
  storyVersion: "fund-90-1",
  definitionsVersion: DEFINITIONS_VERSION,
  story: {
    character: "Maya",
    role: "Principal of a small independent Care Partner business in Toowoomba (fictional)",
    situation:
      "Maya runs a small Care Partner business in Toowoomba. Her team supports 35 people; three start each month and about one leaves. She has $26,720 in the bank and keeps $10,000 in reserve. After several promising referrals she’s ready to hire a second coordinator, at 0.6 FTE, from Monday 4 January. Two participants are set to start in December, a family has asked to bring their mother’s start forward to 21 December, and another client is approved but still waiting for a funding allocation. It’s Monday 30 November. Every figure here is fictional.",
    transmission: { who: "Ava, field transmission", text: "A full calendar does not tell you when the money clears. Check the next pay date." },
    growth:
      "Maya’s caseload plan from the Hiring Runway looks healthy: with a 0.6 FTE hire her coordinators stay under her 85% planning threshold all year, and the month-end cash never falls below about $18,000. The recruitment ad is booked, and the equipment is in an online cart.",
    reveal:
      "Her bookkeeper sends a dated calendar: fortnightly pay runs every second Thursday, super seven days later, the setup bills, owner pay on the 28th, and the agreement’s remittance on the last weekday of each month for the month before. Some of what Maya has been counting as “income” is a referral, a start, an advice slip or an allocation. Only one kind is cash.",
    slip: "On 2 December, Start 2’s family call: their mother is going into respite and would like to start four weeks later, on 11 January, if that’s all right. Start 4 is approved, but there’s still no funding allocation and no start date anyone can rely on.",
    lowPoint:
      "The calendar reaches the new coordinator’s pay runs, on top of the setup bills. Read the bridge date by date. The weekly view is for reading; the dated ledger finds the low point.",
    choices:
      "Maya can move the hire while it’s still uncommitted, arrange suitable interim cover, stage a discretionary purchase, or ask the bank about a fully costed overdraft. She can’t make a remittance come sooner, and February’s new starts still need a coordinator.",
    checkIn:
      "Wednesday 30 December, Day 30. Start 1 began on time on 7 December. Then the agreement administrator emails: November’s remittance will clear on Friday 8 January, not 31 December.",
    avaReturn: "Replace the estimate with what you now know, then check the next pay date again.",
    dilemma: "Hire on 4 January, or change the plan so every pay run is funded and every agreed start is covered?",
  },
  agreement: {
    title: "Maya’s partner agreement (fictional), schedule 2",
    lines: [
      `Partner income: $${MAYA_INPUTS.incomePerClient} a month for each active participant you coordinate.`,
      "Earning: a participant counts for a month once their first service has been delivered, and if they haven’t left by the last day of the month.",
      "Payment: in arrears. Income for a month’s services is paid on the last weekday of the following month.",
      "A remittance advice is emailed about a week before payment. It isn’t a payment.",
      "This fee isn’t a share of any participant’s Support at Home budget or of the care-management allocation.",
    ],
  },
  margin: [
    "Hiring Runway, expected case, adding 0.6 FTE: no months over the 85% planning threshold.",
    "Lowest month-end cash over 12 months: about $18,160.",
    "Income in that plan: $360 a participant a month, paid a month later, with three starts a month counted from the month they start.",
  ],
  inputs: MAYA_90,
  options: [
    {
      id: "late-receipt",
      label: "December’s fees arrive 14 days late",
      kind: "sensitivity",
      group: "receipt",
      describe: "December’s remittance clears on Friday 12 February instead of Friday 29 January. Nothing is lost: it arrives later.",
      note: "A test, not a prediction. Real remittances can be later, or earlier.",
      patch: patch({ delays: [{ id: "fee-2026-12", days: 14 }] }),
    },
    {
      id: "late-start",
      label: "Start 2 begins four weeks later",
      kind: "sensitivity",
      group: "start",
      describe:
        "Start 2 begins on 11 January instead of 14 December. They don’t count for December’s fee, so that $360 moves from 29 January to 26 February. Payroll doesn’t move.",
      note: "The family’s request is reasonable: plan around it, don’t argue it.",
      patch: patch({ slips: [{ id: "c2", days: 28 }] }),
    },
    {
      id: "stage-desk",
      label: "Order the desk and fit-out in March",
      kind: "action",
      group: "stage",
      describe: "The $700 desk and fit-out moves from 14 December to 1 March, after the window.",
      note: "Discretionary: the new coordinator shares a desk for a few weeks. It’s still a cost, just later.",
      patch: patch({ stage: [{ id: "desk", date: "2027-03-01" }] }),
    },
    {
      id: "stage-laptop",
      label: "Delay the laptop and phone to February",
      kind: "action",
      group: "stage-kit",
      describe: "The $900 laptop and phone moves from 14 December to 1 February.",
      note: "The new coordinator starts on 4 January. Without equipment they can’t work safely with participants’ records.",
      patch: patch({ stage: [{ id: "laptop", date: "2027-02-01" }] }),
    },
    {
      id: "hire-feb",
      label: "Hire from 1 February",
      kind: "action",
      group: "hire",
      describe: "The new coordinator starts on Monday 1 February instead of 4 January: January’s pay runs and super for the role move out.",
      note: "Check the capacity guardrail: January’s starts and onboarding fall on the current coordinator. No fee changes.",
      patch: patch({ hireStarts: [{ id: "h-new", start: "2027-02-01" }] }),
    },
    {
      id: "hire-mar",
      label: "Hire from 1 March",
      kind: "action",
      group: "hire",
      describe: "The new coordinator starts after the window: none of the role’s pay is in these 90 days.",
      note: "February’s three planned starts and their onboarding all fall on one coordinator. Check the guardrail before choosing it.",
      patch: patch({ hireStarts: [{ id: "h-new", start: "2027-03-01" }] }),
    },
    {
      id: "hire-mar-cover",
      label: "Hire from 1 March, with interim cover in February",
      kind: "action",
      group: "hire",
      describe:
        "The new coordinator starts on 1 March. An experienced contract coordinator covers 6 hours a week in February, invoiced $1,680 on 26 February (fictional rate).",
      note: "Cover must be trained and agreed with the participants it supports. Its hours are counted in the capacity check.",
      patch: patch({
        hireStarts: [{ id: "h-new", start: "2027-03-01" }],
        extra: [
          ev("cover-feb", "Interim contract coordinator, February (24 hours)", "cover", "2027-02-26", 1_680, {
            status: "projected",
            essential: true,
          }),
        ],
        extraHours: 24,
      }),
    },
    {
      id: "credit",
      label: "A costed overdraft, if the bank approves it",
      kind: "action",
      group: "credit",
      describe: "$6,000 drawn on 27 January, a $60 fee that day, $35 interest and the $6,000 repaid on 26 February. Shown apart from operating cash.",
      note: "Only if it’s approved. The $15,000 limit offered in principle is never cash, and borrowing doesn’t make the plan cheaper.",
      patch: patch({ financing: true }),
    },
  ],
  mustTest: "late-receipt",
  actuals: {
    text: "Start 1 began on time on 7 December. November’s remittance is confirmed for Friday 8 January, a week later than planned.",
    patch: patch({
      actuals: [
        { id: "rec-nov", date: "2027-01-08", amount: 12_600, status: "committed" },
        { id: "c1", date: "2026-12-07", amount: null },
      ],
    }),
  },
  example: {
    text: "Before the 90 days, check the rule on a small worked example (its own fictional figures): $10,000 opening cash, a $4,000 reserve, three dated pairs of receipts and payments, each receipt settling before the same day’s payment.",
    inputs: EXAMPLE,
    moveId: "x3in",
    moveTo: "2026-12-08",
  },
  prediction: {
    prompt: "Before you see the dates: can Maya cover her pay runs over the next 90 days and keep her $10,000 reserve?",
    options: [
      { id: "yes", text: "Yes: the plan is profitable and month-end cash stays well above $10,000", likely: false },
      { id: "dip", text: "Mostly, but one or two dates may dip below the reserve", likely: true },
      { id: "no", text: "No: the business can’t afford the hire at all", likely: false },
    ],
    hardestPrompt: "Which pay run do you think will be hardest to fund?",
    hardest: [
      { id: "p-dec17", date: "2026-12-17", text: "Thursday 17 December" },
      { id: "p-dec31", date: "2026-12-31", text: "Thursday 31 December" },
      { id: "p-jan14", date: "2027-01-14", text: "Thursday 14 January, the new coordinator’s first" },
      { id: "p-jan28", date: "2027-01-28", text: "Thursday 28 January" },
      { id: "p-feb25", date: "2027-02-25", text: "Thursday 25 February" },
    ],
  },
  cards: [
    {
      id: "c-enquiry",
      title: "A family enquiry",
      text: "Wednesday 2 December: a family rings about coordination for their father (Start 8). They’d like to start in February.",
      date: "2026-12-02",
      answer: { stage: "referral", cash: false },
      feedback: "An enquiry is a lead. There’s no agreement, so there’s no fee and no cash, whatever start date the family hopes for.",
    },
    {
      id: "c-allocation",
      title: "Approved, waiting for allocation",
      text: "Start 4 has been approved for Support at Home, but the funding allocation hasn’t come through. The family hopes for 11 January.",
      date: "",
      answer: { stage: "allocation", cash: false },
      feedback:
        "Waiting for an allocation means nobody can say when services, and so fees, will begin. It isn’t secured cash, so it makes no receipt in the forecast.",
    },
    {
      id: "c-start",
      title: "Start 1’s first service",
      text: "Monday 7 December: Start 1’s first service is delivered.",
      date: "2026-12-07",
      answer: { stage: "start", cash: false },
      feedback: "Work begins, and Maya’s coordinator is busy onboarding. The bank balance doesn’t move: the fee isn’t earned until the end of the month.",
    },
    {
      id: "c-earned",
      title: "December’s fee earned",
      text: "Thursday 31 December: Start 1 is active at the end of the month, so December’s fee is earned under the fictional agreement.",
      date: "2026-12-31",
      answer: { stage: "earned", cash: false },
      feedback: "Earned isn’t received. It belongs in the margin view, not the bank: the agreement pays it on the last weekday of January.",
    },
    {
      id: "c-advice",
      title: "The remittance advice",
      text: "Friday 22 January: an email lists December’s fees for Maya’s business, $13,320, to be paid on 29 January.",
      date: "2027-01-22",
      answer: { stage: "invoiced", cash: false },
      feedback: "An advice is a promise to pay. Counting it now and again when it clears counts the same fee twice.",
    },
    {
      id: "c-cleared",
      title: "December’s fees clear",
      text: "Friday 29 January: $13,320 clears in Maya’s business account.",
      date: "2027-01-29",
      answer: { stage: "received", cash: true },
      feedback: "This is the only date December’s fees change the bank balance.",
    },
    {
      id: "c-payroll",
      title: "Pay run for both coordinators",
      text: "Thursday 28 January: the fortnightly pay run for both coordinators. Maya’s own pay goes out the same day.",
      date: "2027-01-28",
      answer: { stage: "paid", cash: true },
      feedback: "A pay run leaves on its own date, every second Thursday: not at the month-end, and not after the remittance.",
    },
    {
      id: "c-pooled",
      title: "The care-management allocation",
      text: "The 10% care-management allocation for Maya’s participants, pooled at the registered provider’s service delivery branch.",
      date: "",
      answer: { stage: "notIncome", cash: false },
      feedback: "That funding sits with the registered provider. Maya’s income is her own agreement’s fee, never a share of public funding.",
    },
  ],
  slip: {
    prompt: "How should the forecast change for Start 2, and for Start 4?",
    options: [
      {
        id: "move",
        text: "Move Start 2’s first fee to the month they start (paid a month later), keep their onboarding in the plan, and leave Start 4 out of the receipts until there’s an allocation and an agreement.",
        feedback: "Yes. The start moves its earnings and its receipt; payroll doesn’t move, and an allocation that hasn’t come isn’t cash.",
        levels: { timing: 3, sources: 3 },
        flags: [],
      },
      {
        id: "keep",
        text: "Keep Start 2’s December fee: the agreement is signed.",
        feedback: "A signed agreement doesn’t meet the earning condition. They don’t count for December if their first service is in January.",
        levels: { timing: 1, sources: 1 },
        flags: ["notYetEarned"],
      },
      {
        id: "add-waiting",
        text: "Move Start 2, and add Start 4’s fees from January to make up the difference.",
        feedback: "Start 4 is waiting for an allocation. Adding their fees treats a prospect as secured cash.",
        levels: { timing: 1, sources: 0 },
        flags: ["prospectAsCash"],
      },
      {
        id: "drop",
        text: "Take Start 2 out of the forecast altogether, and stop planning their onboarding.",
        feedback: "Cautious on cash, but Start 2 is still coming, in January. Their fee and their onboarding both belong in the plan, on the new dates.",
        levels: { timing: 2, sources: 2, continuity: 1 },
        flags: [],
      },
    ],
  },
  lowPoint: {
    prompt: "Read the bridge. On which date is Maya’s cash lowest?",
    requiredPrompt: "How much cash would Maya need on 1 December to keep $10,000 on every date? (Enter dollars.)",
    options: [
      {
        id: "jan28",
        date: "2027-01-28",
        text: "Thursday 28 January: both pay runs and Maya’s own pay, the day before December’s fees clear",
        feedback: "That’s the dated low point. The week it falls in ends higher, because the remittance clears the next day.",
        levels: { timing: 3 },
        flags: [],
      },
      {
        id: "feb1",
        date: "2027-02-01",
        text: "Monday 1 February: the end of that week on the weekly chart",
        feedback: "The weekly bar shows the balance after December’s fees have cleared. The low point is midweek, on the pay date.",
        levels: { timing: 1 },
        flags: ["weeklyView"],
      },
      {
        id: "jan31",
        date: "2027-01-31",
        text: "Sunday 31 January: the month-end",
        feedback: "Pay runs are fortnightly, on Thursdays. Putting them at the month-end hides the date that matters.",
        levels: { timing: 1 },
        flags: ["monthEndPayroll"],
      },
      {
        id: "dec31",
        date: "2026-12-31",
        text: "Thursday 31 December: a pay run and November’s fees on the same day",
        feedback:
          "That date carries a timing risk: if the pay run cleared before the remittance, the balance would dip. The model labels that intraday check separately. The end-of-day low is later.",
        levels: { timing: 2 },
        flags: [],
      },
    ],
  },
  explanations: [
    {
      id: "dated",
      text: "Cash is lowest on 28 January because two pay runs and owner pay fall the day before December’s fees clear. A 14-day delay takes it below zero, so the plan needs a dated buffer or a later hire, and February’s starts still need a coordinator.",
      feedback: "It names the date, the payments that make it, the receipt it waits on, the sensitivity case and the service constraint.",
      levels: { arithmetic: 3, scenarios: 3, continuity: 3 },
      flags: [],
    },
    {
      id: "margin",
      text: "Over the quarter the business makes money, so cash will be fine.",
      feedback: "Profit over a quarter isn’t cash on a Thursday. The setup bills, super and BAS are real payments on real dates.",
      levels: { arithmetic: 0, scenarios: 1, continuity: 2 },
      flags: ["ignoredBill"],
    },
    {
      id: "advice",
      text: "December’s remittance advice arrives on 22 January, so the money is there before the 28 January pay run.",
      feedback: "An advice isn’t a payment. The money clears on 29 January, the day after the pay run.",
      levels: { arithmetic: 1, scenarios: 1, continuity: 2 },
      flags: ["doubleCount"],
    },
    {
      id: "allocation",
      text: "Start 4’s allocation will come through in January and fill the gap.",
      feedback: "Maybe, but nobody knows when. A forecast can’t rely on it.",
      levels: { arithmetic: 1, scenarios: 1, continuity: 2 },
      flags: ["prospectAsCash"],
    },
  ],
  decisions: [
    {
      id: "hire-feb",
      text: "Move the hire to 1 February while it’s uncommitted, order the desk in March, keep every agreed start covered, and review the confirmed receipts on 8 January.",
      feedback: "A staged hire that the capacity check supports, a discretionary cost moved, service protected and a review date set.",
      outcome:
        "The new coordinator starts on 1 February with a laptop on day one. The current coordinator carries January’s onboarding with Maya’s help, and the guardrail stays under 85%. On 8 January Maya checks the confirmed remittance before the next pay run.",
      levels: { scenarios: 3, continuity: 3, review: 3 },
      flags: [],
    },
    {
      id: "buffer",
      text: "Recruit for 4 January as planned, and put a defined $5,000 cash buffer in place before 28 January (Maya’s own funds, agreed with her accountant), with trained interim cover if the start slips.",
      feedback: "A defined buffer, sized from the dated gap, on a date before the low point, with service protected.",
      outcome:
        "Maya transfers $5,000 on 20 January. The 28 January pay run clears with the reserve intact, and the new coordinator is onboarding Start 5 from week three.",
      levels: { scenarios: 3, continuity: 3, review: 2 },
      flags: [],
    },
    {
      id: "limit",
      text: "Recruit for 4 January and rely on the bank’s $15,000 overdraft limit if it gets tight.",
      feedback:
        "The limit is only offered in principle: it isn’t approved, it isn’t free, and it can be withdrawn. Only a costed, approved facility belongs in the plan.",
      outcome: "On 27 January the bank says the facility needs two more months of statements. The 28 January pay run takes Maya below her reserve.",
      levels: { scenarios: 1, continuity: 2, review: 1 },
      flags: ["freeCredit"],
    },
    {
      id: "pause-starts",
      text: "Push February’s new starts back until the January remittance has cleared.",
      feedback: "Delaying agreed services to fix a cash gap moves the problem onto participants. Cash needs a funding decision, not a service cut.",
      outcome: "Two families are told to wait. One finds another provider.",
      levels: { scenarios: 1, continuity: 0, review: 1 },
      flags: ["cutCare"],
    },
    {
      id: "go",
      text: "Go ahead as planned: the quarter’s margin is positive.",
      feedback: "The dated ledger dips below the reserve and, with a late remittance, below zero. A positive margin doesn’t pay a Thursday pay run.",
      outcome: "On 28 January Maya transfers money from her personal account at the last minute to cover the pay run.",
      levels: { scenarios: 0, continuity: 2, review: 0 },
      flags: ["ignoredBill", "guarantee"],
    },
  ],
  review: {
    prompt: "Day 30: what does Maya do with the new information?",
    options: [
      {
        id: "replace",
        text: "Replace the November estimate with its confirmed date, mark Start 1 as commenced, check the new below-reserve dates and the 28 January pay run again, and book the next check for 22 January.",
        feedback: "Actuals replace estimates deliberately, the result is read again, and the next check is dated before the next low point.",
        levels: { review: 3, sources: 3 },
        flags: [],
      },
      {
        id: "ignore",
        text: "Leave the forecast as it was: a week’s delay doesn’t matter.",
        feedback: "It takes the balance below the reserve for a week, over the New Year pay run. The forecast isn’t a guarantee: update it.",
        levels: { review: 0, sources: 1 },
        flags: ["guarantee"],
      },
      {
        id: "assume",
        text: "Assume every remittance will now be a week late, and change them all without checking.",
        feedback:
          "Cautious, but it replaces one estimate with another. Ask the administrator whether the delay is a one-off, and test the rest as a sensitivity case.",
        levels: { review: 2, sources: 1 },
        flags: [],
      },
    ],
  },
  debrief:
    "In this fictional plan, Maya’s month-end view looks fine, but the dated ledger finds her lowest cash on Thursday 28 January: two pay runs and her own pay leave the day before December’s fees clear. The weekly chart hides it, because that week ends after the remittance. To keep $10,000 on every date she’d need more than the $26,720 she has, and if December’s fees were 14 days late she’d go below zero on a pay date. The answer isn’t to cut a service or count an allocation as cash: it’s a dated decision (stage the hire, a defined buffer, or approved and costed finance), with the capacity check beside it and a date to replace estimates with actuals.",
  followUp:
    "Six weeks later: the new coordinator has started and February’s three planned starts are onboarded. December’s fees cleared on 29 January as advised. Maya now keeps a dated calendar beside her caseload plan, and checks it the day each remittance advice arrives.",
  links: [
    {
      label: "Maya’s next coordinator: when to hire",
      href: "/magazine/mayas-next-coordinator-when-to-hire",
      why: "The Hiring Runway: capacity and unit economics over 12 months. This article owns the dates; that one owns the longer view.",
    },
    {
      label: "Can we take on the next 10 clients?",
      href: "/magazine/can-we-take-on-the-next-10-clients",
      why: "Planned starts and onboarding capacity, week by week. Bring a start date across only by typing it yourself.",
    },
    {
      label: "Which referrals become active clients?",
      href: "/magazine/which-referrals-become-active-clients",
      why: "How long it really takes an enquiry to become a first service: a better basis for your start dates.",
    },
    {
      label: "Caseload-to-Margin & Hiring Capacity (Work Tool)",
      href: "/tools/caseload-margin",
      why: "Plan your own business’s capacity and margin, privately. Nothing is copied into the cash plan.",
    },
  ],
  sources: [
    {
      title: "Provider payment arrangements for Support at Home",
      url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/provider-payment-arrangements-for-support-at-home",
    },
    {
      title: "Funding for Support at Home care management",
      url: "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-for-support-at-home-care-management",
    },
    { title: "Trilogy Care: Fully Coordinated", url: "https://trilogycare.com.au/services/fully-coordinated" },
  ],
  rationale: {
    theme:
      "Partner principals hiring ahead of growth, then meeting a pay run before the first new remittance; repeated questions about when partner fees are paid.",
    themeOwner: "",
    audience:
      "Independent Care Partner business owners who hire coordinators and manage their own operating cash; partner principals and partnership staff using the fictional case.",
    behaviour:
      "Separate earned, invoiced and received income; put payroll, super, setup and tax on their real dates; find the dated low point and the opening cash needed; test a late receipt; choose a funded, service-safe action with a review date.",
    whyFit:
      "The mistake is about dates, not totals: a monthly margin hides a Thursday pay run. A dated calculator inside a story shows it without anyone’s real figures.",
    alternatives:
      "A remittance calendar and a pay-date checklist in onboarding would help too. A finance conversation, not a course, is the right fix for a business that already has a gap.",
    reuse:
      "The Hiring Runway’s fictional agreement, cash sheet and capacity model (lib/hiringModel); Maya’s case facts; the Next 10 Clients and Referral Journey articles by link.",
    measure:
      "Article completions, the share of learners who find the dated low point and test a delayed receipt, and the decision rubric (owned by Partner Enablement); private plans are never included.",
    decision: "",
  },
  approval: {
    owner: "",
    finance: "",
    operations: "",
    quality: "",
    partnerships: "",
    privacy: "",
    partnerReps: "",
    approvedOn: "",
    effectiveFrom: "",
    reviewBy: "",
  },
};

export const CASH_BRIDGE_CASES: { id: string; label: string; data: CashBridgeLabData }[] = [
  { id: "fund-90", label: "Maya’s next 90 days (a 0.6 FTE hire, 1 December to 28 February)", data: FUND_90 },
];

/** The fictional case, as the tests read it. */
export const CASH_BRIDGE_CASE = FUND_90;
/** The PRD's worked fixture, as the case carries it. */
export const WORKED_EXAMPLE = EXAMPLE;
