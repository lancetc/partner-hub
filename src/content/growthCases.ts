import type { IntakeLabData } from "@/lib/growthLab";
import type { Service, Start, Supply } from "@/lib/growthReadiness";

/*
  The reviewed fictional case for "Can we take on the next 10 clients?" (docs/growth-readiness.md). Every person,
  business and figure is invented for practice: none is Trilogy Care pricing, a staffing norm, a clients-per-coordinator
  cap or a recommendation. Priya Raman is a new fictional principal; the story editor checks her against the character
  library before publication.

  The shape of it: ten names on a referral list for February 2027, two of them still enquiries. Jess, one of two
  coordinators, is on leave for two days in Week 2, the week four starts want to begin. Two starts need early-morning
  personal care; one wants a preferred worker whose provider checks are still in progress; one cleaning arrangement
  hasn't been verified for two months. Opening the model shows a coordinator-hours gap in Week 2 that the monthly total
  hides, and a separate morning-service gap.
*/

const AREA = "North Brisbane";
const morning = (id: string): Service => ({
  id,
  service: "Personal care",
  capability: "Certificate III",
  area: AREA,
  window: "Early morning (6–8 am)",
  slotsPerWeek: 5,
});
const daytime = (id: string): Service => ({
  id,
  service: "Personal care",
  capability: "Certificate III",
  area: AREA,
  window: "Weekday daytime",
  slotsPerWeek: 3,
});
const clean = (id: string): Service => ({ id, service: "Cleaning", capability: "Domestic", area: AREA, window: "Weekday", slotsPerWeek: 1 });
const physio = (id: string): Service => ({ id, service: "Physiotherapy", capability: "Allied health", area: AREA, window: "Weekday", slotsPerWeek: 1 });

const start = (
  id: string,
  label: string,
  stage: Start["stage"],
  band: string,
  week: number,
  order: number,
  services: Service[],
  unknowns: string[],
  note: string,
): Start => ({
  id,
  label,
  stage,
  band,
  week,
  order,
  services,
  unknowns,
  note,
});

const supply = (id: string, supplier: string, s: Service, slots: number, status: Supply["status"], verifiedOn: string, weeks: number[] = []): Supply => ({
  id,
  supplier,
  service: s.service,
  capability: s.capability,
  area: s.area,
  window: s.window,
  weeks,
  slots,
  status,
  verifiedOn,
});

export const NEXT_TEN: IntakeLabData = {
  title: "Can we take on the next 10 clients?",
  intro:
    "Ten possible starts next month. Predict how many you could honestly confirm, find the week and the service that limit you, try a change, then decide what to tell people.",
  storyVersion: "next-10-1",
  story: {
    character: "Priya Raman",
    role: "Principal of a small Care Partner business in North Brisbane (fictional)",
    situation:
      "It’s Monday 25 January. Priya runs a small Care Partner business with two coordinators, Jess and Ben, supporting 31 people. Her referral list for February has ten names on it. Some have agreed plans; some are still enquiries. One is coming home from hospital in the second week. Two need personal care early in the morning, and one wants to keep a worker she trusts, whose provider checks aren’t finished yet.",
    voice: {
      who: "The daughter of a client coming home from hospital (Start B)",
      text: "Dad’s home on the 9th. Can someone be there in the mornings from the first day? That’s what worries me.",
    },
    concern: {
      who: "Jess, coordinator",
      text: "I’m off on the Thursday and Friday of the second week, and four of these want to start that week. Setting them up properly takes time.",
    },
    dilemma: "Ten names on the list. How many can I honestly confirm today, and what do I tell everyone else?",
  },
  inputs: {
    month: "2027-02",
    asOf: "2027-01-25",
    staleDays: 30,
    reservePct: 10,
    followUpSpread: [0, 0.5, 0.3, 0.2],
    bands: [
      { id: "routine", label: "Routine", count: 20, hoursPerWeek: 0.5, setupHours: 4, followUpHours: 2 },
      { id: "higher", label: "Higher-work", count: 8, hoursPerWeek: 1, setupHours: 7, followUpHours: 4 },
      { id: "intensive", label: "Intensive", count: 3, hoursPerWeek: 1.5, setupHours: 10, followUpHours: 6 },
    ],
    coordinators: [
      { id: "jess", name: "Jess", hoursPerWeek: 38, nonClientPerWeek: 6, leave: [0, 15.2, 0, 0] },
      { id: "ben", name: "Ben", hoursPerWeek: 38, nonClientPerWeek: 6, leave: [0, 0, 0, 0] },
    ],
    exceptional: [2, 4, 2, 2],
    cover: [0, 0, 0, 0],
    starts: [
      start("a", "Start A", "ready", "routine", 0, 1, [clean("a1")], [], "Weekly cleaning; plan and agreement in place."),
      start(
        "b",
        "Start B",
        "ready",
        "higher",
        1,
        1,
        [morning("b1")],
        [],
        "Coming home from hospital on the 9th; early-morning personal care from the first day.",
      ),
      start("c", "Start C", "ready", "routine", 1, 2, [clean("c1")], [], "Weekly cleaning."),
      start(
        "d",
        "Start D",
        "expected",
        "intensive",
        1,
        3,
        [morning("d1")],
        ["the service agreement isn’t signed yet"],
        "Early-morning personal care; several calls to set up equipment.",
      ),
      start("e", "Start E", "ready", "routine", 1, 4, [clean("e1")], [], "Weekly cleaning; flexible about the start date."),
      start("f", "Start F", "enquiry", "routine", 0, 1, [], [], "An enquiry: no plan yet."),
      start(
        "g",
        "Start G",
        "ready",
        "higher",
        2,
        1,
        [daytime("g1")],
        ["her preferred worker’s provider checks are still in progress"],
        "Wants to keep a worker she already knows.",
      ),
      start("h", "Start H", "enquiry", "routine", 2, 2, [], [], "A provisional referral."),
      start("i", "Start I", "ready", "routine", 3, 1, [clean("i1")], [], "Weekly cleaning."),
      start(
        "j",
        "Start J",
        "expected",
        "higher",
        3,
        2,
        [physio("j1")],
        ["the new physiotherapist’s price isn’t confirmed"],
        "Weekly physiotherapy after a fall.",
      ),
    ],
    supply: [
      supply("np-am", "Northside Personal Care", morning("x"), 5, "confirmed", "2027-01-20"),
      supply("sun-am", "Sunrise Care Workers", morning("x"), 5, "provisional", "2027-01-22"),
      supply("np-am-booked", "Northside Personal Care (second worker)", morning("x"), 5, "booked", "2027-01-20"),
      supply("pref-day", "Start G’s preferred worker", daytime("x"), 3, "provisional", "2027-01-19"),
      supply("bright", "Brightside Cleaning", clean("x"), 3, "confirmed", "2027-01-18"),
      supply("tidy", "Tidy Homes", clean("x"), 2, "confirmed", "2026-11-30"),
      supply("move-well", "MoveWell Physio", physio("x"), 2, "confirmed", "2027-01-21"),
    ],
  },
  prediction: {
    prompt: "Before you open the numbers: how many of the ten could Priya responsibly confirm today? And what would you need to check first?",
    checks: [
      { id: "agreements", text: "Which starts have their agreement and plan in place", useful: true },
      { id: "weeks", text: "Coordinator hours week by week, including Jess’s leave", useful: true },
      { id: "services", text: "Whether each service has a confirmed worker for the right area and time", useful: true },
      { id: "effort", text: "What each new client’s first weeks of work involve", useful: true },
      { id: "funding", text: "How much funding the ten clients would bring", useful: false },
      { id: "ratio", text: "How many clients a coordinator usually has", useful: false },
      { id: "easiest", text: "Which clients would be quickest to set up", useful: false },
    ],
  },
  changes: [
    {
      id: "cover",
      label: "Approved casual coordinator: 8 hours in Week 2",
      detail: "A coordinator Priya has used before can do 8 hours of setup work while Jess is on leave. It’s been approved through the usual process.",
      change: { kind: "cover", week: 1, hours: 8 },
    },
    {
      id: "verify",
      label: "Sunrise Care Workers confirm the early-morning roster",
      detail: "Priya calls Sunrise. They confirm, in writing, five early-morning visits a week from Week 2, and their approval is current.",
      change: { kind: "verify", supply: "sun-am", verifiedOn: "2027-01-27" },
    },
    {
      id: "move-e",
      label: "Start E begins in Week 3 instead, if they agree",
      detail: "Start E said they’re flexible. Moving them is a conversation to have with them, not something the model decides.",
      change: { kind: "move", start: "e", week: 2 },
    },
    {
      id: "verify-tidy",
      label: "Tidy Homes re-confirm their cleaning slots",
      detail: "Tidy Homes haven’t been checked since November. A call confirms two current slots a week.",
      change: { kind: "verify", supply: "tidy", verifiedOn: "2027-01-26" },
    },
  ],
  decisions: [
    {
      id: "plan",
      text: "Confirm the starts the model supports; agree the Week 2 plan with the approved cover; ask Sunrise to confirm the morning roster in writing by Wednesday (Priya owns it); tell Trilogy Care which starts are pending and why, and use the escalation process if Start B needs support sooner.",
      feedback:
        "A defensible plan: it confirms what’s supported, names an owner and a date for each open question, and keeps the escalation route open for the person coming home from hospital.",
      levels: { unknowns: 3, escalation: 3, communication: 3 },
      flags: [],
    },
    {
      id: "all-ten",
      text: "Accept all ten now; the team will find the hours as they go.",
      feedback:
        "Ten names isn’t ten starts. Two are enquiries, Week 2 is short of hours, and one morning roster isn’t confirmed. Promising them all now sets people up for a late or missed start.",
      levels: { unknowns: 0, escalation: 0, communication: 1 },
      flags: ["promised"],
    },
    {
      id: "defer-intensive",
      text: "Defer the intensive start to next month to keep February simple.",
      feedback:
        "It picks someone to wait because their needs are greater, without talking to them. Moving a start is a conversation with the participant and the agreed process, not a way to make the numbers easier.",
      levels: { unknowns: 1, escalation: 1, communication: 0 },
      flags: ["noParticipant", "ranked"],
    },
    {
      id: "hold-all",
      text: "Hold every start until all ten are fully confirmed.",
      feedback:
        "Careful, but it delays people whose starts are ready and supported, including someone coming home from hospital. Confirm what you can and own the rest.",
      levels: { unknowns: 2, escalation: 1, communication: 1 },
      flags: [],
    },
  ],
  messages: [
    {
      id: "honest",
      to: "Start D’s family",
      text: "We’re working towards a start in the week of 8 February. The early-morning carer has been offered but isn’t confirmed yet, and the agreement still needs signing. I’ll call you by Wednesday with a confirmed date. If your mum needs help sooner, tell me today and we’ll arrange it through Trilogy Care’s process.",
      feedback: "Honest about what’s confirmed and what isn’t, with a date to hear back and a route if things can’t wait.",
      outcome:
        "Start D’s son calls back on Wednesday. Sunrise has confirmed the mornings, the agreement is signed, and his mother starts on the 10th. He says the call on Monday was what made it work: he knew what to expect.",
      levels: { communication: 3, unknowns: 3, escalation: 3 },
      flags: [],
    },
    {
      id: "all-set",
      to: "Start D’s family",
      text: "Great news, you’re all set to start on Monday 8 February!",
      feedback: "It promises a date before the carer and the agreement are confirmed.",
      outcome:
        "On the 8th, nobody arrives at 7 am. Sunrise hadn’t confirmed the roster. Start D’s son rings Priya, upset, and she spends the morning finding cover she could have arranged a week earlier.",
      levels: { communication: 1, unknowns: 0, escalation: 0 },
      flags: ["promised"],
    },
    {
      id: "decline",
      to: "Start D’s family",
      text: "Sorry, we can’t take your mum on this month. Try us again in March.",
      feedback: "It closes the door without exploring options, asking what matters to them, or using the agreed process to find another way.",
      outcome: "The family looks elsewhere. Two days later, Sunrise confirms the mornings Priya needed.",
      levels: { communication: 0, unknowns: 1, escalation: 1 },
      flags: ["noParticipant"],
    },
    {
      id: "tc-update",
      to: "Trilogy Care",
      text: "Week 2 is over capacity, so we’re not taking new starts until March.",
      feedback:
        "It flags the pressure, which is good, but it turns a one-week gap into a month-long refusal and doesn’t say which starts are pending or who owns what.",
      outcome: "Trilogy Care asks which starts are affected and what’s needed. Priya has to go back through the list to answer.",
      levels: { communication: 1, unknowns: 1, escalation: 2 },
      flags: [],
    },
  ],
  debrief:
    "Ten names became eight possible starts once the enquiries were set aside. Over February the team has hours to spare, but Week 2 doesn’t: Jess’s leave and four setups land together. Separately, one early-morning roster was only an offer, a preferred worker’s checks weren’t finished, and one cleaning arrangement hadn’t been verified since November. Approved cover fixes the hours; only a confirmed roster fixes the mornings. A good answer confirms what’s supported, owns each open question with a date, and tells people the truth about what isn’t confirmed yet.",
  links: [
    {
      label: "Maya’s next coordinator: when to hire",
      href: "/magazine/mayas-next-coordinator-when-to-hire",
      why: "If the hours are short month after month rather than in one week, it’s a recruitment question. Work it through in the Hiring Runway lab.",
    },
    {
      label: "Plan my business (Work Tools)",
      href: "/tools/caseload-margin",
      why: "For owners: capacity, margin and cash over months, with your own figures.",
    },
  ],
  sources: [
    {
      title: "Funding for Support at Home care management",
      url: "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-for-support-at-home-care-management",
    },
    {
      title: "Services under Support at Home",
      url: "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/services-under-support-at-home",
    },
    {
      title: "Service agreements for Support at Home",
      url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/service-agreements-for-support-at-home",
    },
    { title: "Trilogy Care: Fully Coordinated Care", url: "https://trilogycare.com.au/services/fully-coordinated" },
  ],
  approval: { owner: "", operations: "", partnerships: "", policy: "", privacy: "", approvedOn: "", reviewBy: "" },
};

export const GROWTH_CASES: { id: string; label: string; data: IntakeLabData }[] = [
  { id: "next-10", label: "Priya’s February (ten possible starts, North Brisbane)", data: NEXT_TEN },
];
