import type { ReferralLabData } from "@/lib/referralLab";
import { STAGE_MODEL_VERSION, type Contact, type Effort, type EffortRow, type ReferralRecord, type Source } from "@/lib/referralJourney";

/*
  The reviewed fictional case for "Which referrals become active clients?" (docs/referral-journey.md). Every
  relationship, enquiry, date and figure is invented for practice: none is a real Trilogy Care referral source, a
  real practice, hospital or organisation, a conversion benchmark or a staffing norm. The relationships are generic
  labels only ("the GP practice", "the hospital discharge team", "the community organisation"); every enquiry has an
  opaque id (E01) and no name, age, diagnosis or address. The two areas are Maya's fictional suburbs from "Is this
  suburb ready for growth?".

  It returns to Maya, keeping her established facts (content/hiringCases.ts, content/workloadCases.ts,
  content/coverageCases.ts): a small Care Partner business in Toowoomba supporting 35 people; three start each month
  and about one leaves; $26,720 in the bank and $10,000 kept in reserve. Her coordinator isn't named (the library's
  "Sam" is a Trilogy Care team member).

  The April–June cohort, as of 30 September (90-day comparison age and observation point, 5 mature enquiries to rank):
  - The GP practice: 12 enquiries, most before a funding allocation (5 waiting, 2 needing assessment, 1 unknown, 4
    allocated). 4 started (4/12 = 33%), but 3 of the 4 allocated did (75%). Five wait for funding: open, not lost. One
    agreement waits on an early-morning worker. 18 relationship hours: 4.5 h per start.
  - The hospital discharge team: 6 urgent or changing introductions. 4 started, fast (median 11.5 days), with about 7
    hours of onboarding each. One moved to residential care; one chose another provider (the handoff in the story).
  - The community organisation: 5 enquiries, 4 ready to choose. 4 started; 6 relationship hours, 1.5 h per start.
  - An existing client's recommendation: 2 enquiries, too early to rank. One person was mentioned by a pharmacist and
    their family, with no authorised introduction: Unknown or multiple. A pharmacist's mention of a GP enquiry is an
    assist, not a second enquiry.

  The return visit (20 November): allocations arrive, so the GP's April–June cohort reaches 6 of 12 (18 h / 6 = 3 h per
  start), and October's GP enquiries arrive further along after the stage explainer: an early signal, too young to rank.
*/

const contact = (source: Source, on: string, authorised = true): Contact => ({ source, on, authorised });
const enquiry = (id: string, source: Source, enquiredOn: string, over: Partial<ReferralRecord>): ReferralRecord => ({
  id,
  area: "banksia",
  enquiredOn,
  contacts: [contact(source, enquiredOn)],
  attribution: "",
  initialStage: "allocated",
  laterStage: "",
  introducedOn: enquiredOn,
  pathwayOn: "",
  allocatedOn: "",
  agreedOn: "",
  startedOn: "",
  closed: "",
  closedOn: "",
  wait: "",
  exitedOn: "",
  exitReason: "",
  ...over,
});
const effort = (meetings: number, travel: number, materials: number, followUp: number, onboarding: number): Effort => ({
  meetings,
  travel,
  materials,
  followUp,
  onboarding,
  costs: "unknown",
  observed: true,
});
const row = (source: Source, month: string, e: Effort): EffortRow => ({ id: `${source}-${month}`, source, month, effort: e });

const RECORDS: ReferralRecord[] = [
  // The GP practice: many enquiries, most before a funding allocation.
  enquiry("E01", "gp", "2026-04-03", {
    contacts: [contact("gp", "2026-04-03"), contact("other", "2026-04-12", false)],
    pathwayOn: "2026-04-08",
    agreedOn: "2026-04-18",
    startedOn: "2026-04-24",
    note: "Practice manager: “He has his allocation letter and wants a provider close to home.” A pharmacist mentioned the business to him a week later.",
  }),
  enquiry("E02", "gp", "2026-04-09", { area: "corella", pathwayOn: "2026-04-14", agreedOn: "2026-04-20", startedOn: "2026-04-23" }),
  enquiry("E03", "gp", "2026-05-06", {
    pathwayOn: "2026-05-12",
    agreedOn: "2026-05-22",
    startedOn: "2026-07-08",
    wait: "capacity",
    exitedOn: "2026-08-01",
    exitReason: "died",
    note: "Agreed in May; the early-morning personal care she chose took until July to staff.",
  }),
  enquiry("E04", "gp", "2026-06-04", {
    pathwayOn: "2026-06-10",
    agreedOn: "2026-06-19",
    wait: "capacity",
    note: "Agreement signed; waiting for an early-morning worker in Banksia Rise.",
  }),
  enquiry("E05", "gp", "2026-04-02", {
    area: "corella",
    initialStage: "waiting",
    allocatedOn: "2026-07-30",
    pathwayOn: "2026-08-03",
    agreedOn: "2026-08-12",
    startedOn: "2026-08-18",
    wait: "funding",
  }),
  enquiry("E06", "gp", "2026-04-16", {
    initialStage: "waiting",
    wait: "funding",
    note: "Practice nurse: “She was approved in March and is waiting to hear about her funding. Her daughter asked us who to call.”",
  }),
  enquiry("E07", "gp", "2026-05-05", { area: "corella", initialStage: "waiting", wait: "funding" }),
  enquiry("E08", "gp", "2026-05-20", { initialStage: "waiting", wait: "funding" }),
  enquiry("E09", "gp", "2026-06-11", { area: "corella", initialStage: "waiting", wait: "funding" }),
  enquiry("E10", "gp", "2026-05-13", {
    initialStage: "assessment",
    wait: "assessment",
    note: "GP: “I think he needs more help at home. He hasn’t been assessed yet, and he’s happy for you to call.”",
  }),
  enquiry("E11", "gp", "2026-06-02", { area: "corella", initialStage: "assessment", closed: "notSuitable", closedOn: "2026-07-10" }),
  enquiry("E12", "gp", "2026-06-23", {
    contacts: [contact("gp", "2026-06-23", false)],
    introducedOn: "",
    initialStage: "unknown",
    closed: "noAuthority",
    closedOn: "2026-07-07",
    note: "Practice reception: “A patient’s son picked up your brochure.” No details, and no permission to call.",
  }),
  // The hospital discharge team: fewer, time-sensitive introductions that need substantial coordination.
  enquiry("E13", "hospital", "2026-04-07", {
    area: "corella",
    initialStage: "urgent",
    pathwayOn: "2026-04-08",
    agreedOn: "2026-04-10",
    startedOn: "2026-04-13",
    exitedOn: "2026-05-30",
    exitReason: "residential",
    note: "Discharge nurse: “Going home on Friday after a fall. She needs personal care from the weekend, and she’s agreed to the referral.”",
  }),
  enquiry("E14", "hospital", "2026-04-21", { initialStage: "urgent", pathwayOn: "2026-04-22", agreedOn: "2026-04-28", startedOn: "2026-05-02" }),
  enquiry("E15", "hospital", "2026-05-12", {
    area: "corella",
    initialStage: "changing",
    pathwayOn: "2026-05-15",
    agreedOn: "2026-05-24",
    startedOn: "2026-05-30",
    note: "Discharge planner: “He already has a provider, but after this admission the family want to look at a change.”",
  }),
  enquiry("E16", "hospital", "2026-05-26", { initialStage: "urgent", closed: "residential", closedOn: "2026-06-05" }),
  enquiry("E17", "hospital", "2026-06-08", {
    area: "corella",
    initialStage: "urgent",
    pathwayOn: "2026-06-09",
    agreedOn: "2026-06-16",
    startedOn: "2026-06-20",
    wait: "handoff",
  }),
  enquiry("E18", "hospital", "2026-06-22", {
    initialStage: "urgent",
    pathwayOn: "2026-06-23",
    closed: "choseOther",
    closedOn: "2026-06-26",
    note: "At the handoff she chose the provider her daughter already uses.",
  }),
  // The community organisation: fewer enquiries, mostly ready to choose.
  enquiry("E19", "community", "2026-04-14", {
    introducedOn: "2026-04-15",
    pathwayOn: "2026-04-17",
    agreedOn: "2026-04-28",
    startedOn: "2026-05-06",
    note: "Seniors’ group coordinator: “She has her allocation letter and wants to meet a couple of providers before she decides.”",
  }),
  enquiry("E20", "community", "2026-05-04", {
    area: "corella",
    introducedOn: "2026-05-05",
    pathwayOn: "2026-05-07",
    agreedOn: "2026-05-25",
    startedOn: "2026-06-01",
  }),
  enquiry("E21", "community", "2026-05-18", {
    introducedOn: "2026-05-19",
    pathwayOn: "2026-05-21",
    agreedOn: "2026-05-28",
    startedOn: "2026-07-06",
    wait: "capacity",
  }),
  enquiry("E22", "community", "2026-06-05", {
    area: "corella",
    initialStage: "changing",
    pathwayOn: "2026-06-08",
    agreedOn: "2026-06-12",
    startedOn: "2026-06-15",
  }),
  enquiry("E23", "community", "2026-06-19", {
    initialStage: "waiting",
    introducedOn: "2026-06-22",
    wait: "funding",
    note: "Community worker: “He’s been told he’s approved and is on the waiting list for his funding.”",
  }),
  // An existing client's recommendation: two enquiries, too early to rank.
  enquiry("E24", "client", "2026-05-22", { area: "corella", pathwayOn: "2026-05-25", agreedOn: "2026-06-01", startedOn: "2026-07-03", wait: "choice" }),
  enquiry("E25", "client", "2026-06-26", { wait: "choice" }),
  // Unknown or multiple: a pharmacist and the family both mentioned the business; nobody made an authorised introduction.
  enquiry("E26", "other", "2026-04-28", {
    contacts: [contact("other", "2026-04-28", false), contact("self", "2026-05-02", false)],
    initialStage: "unknown",
    laterStage: "allocated",
    introducedOn: "2026-05-03",
    pathwayOn: "2026-05-06",
    agreedOn: "2026-07-02",
    startedOn: "2026-07-14",
    wait: "funding",
  }),
];

const EFFORT: EffortRow[] = [
  row("gp", "2026-04", effort(2, 1.5, 3, 1.5, 6)),
  row("gp", "2026-05", effort(2, 1.5, 0, 2, 3)),
  row("gp", "2026-06", effort(2, 1, 0, 1.5, 3)),
  row("hospital", "2026-04", effort(1.5, 1, 0.5, 1, 14)),
  row("hospital", "2026-05", effort(1, 0.5, 0, 1, 6)),
  row("hospital", "2026-06", effort(1.5, 0.5, 0.5, 1, 8)),
  row("community", "2026-04", effort(1, 0.5, 0.5, 0.5, 3)),
  row("community", "2026-05", effort(1, 0.5, 0, 0.5, 5)),
  row("community", "2026-06", effort(1, 0.5, 0, 0, 2)),
  row("client", "2026-06", effort(0, 0, 0, 0.5, 2)),
];

const at = (id: string) => RECORDS.find((r) => r.id === id)!;

export const REFERRAL_ACTIVE: ReferralLabData = {
  title: "Which referrals become active clients?",
  intro:
    "Three local relationships, three very different enquiry counts. Before Maya decides where to spend her time, follow the same people from first contact to a first visit, and past it.",
  storyVersion: "referral-active-1",
  stageModelVersion: STAGE_MODEL_VERSION,
  story: {
    character: "Maya",
    role: "Principal of a small independent Care Partner business in Toowoomba (fictional)",
    situation:
      "Maya runs a small Care Partner business in Toowoomba. She supports 35 people; three start each month and about one leaves. She has $26,720 in the bank and keeps $10,000 aside. Since autumn she’s been building three local relationships: a GP practice, a hospital discharge team and a community organisation. It’s the end of September, and she wants to know which deserves more of her time, a better handoff, or a different expectation. Every relationship, enquiry and figure here is fictional.",
    transmission: { who: "Ava, field transmission", text: "What happened between the introduction and the first visit?" },
    relationships: [
      {
        source: "gp",
        label: "The GP practice",
        text: "Maya visits every few weeks and the practice nurse is keen. Plenty of names come through, often for people who haven’t had their funding yet.",
      },
      {
        source: "hospital",
        label: "The hospital discharge team",
        text: "Fewer introductions, and nearly all urgent: someone going home on Friday who needs personal care from the weekend. Each one takes real coordination.",
      },
      {
        source: "community",
        label: "The community organisation",
        text: "A seniors’ group Maya talks to now and then. Only a handful of enquiries, from people who usually already know what they want.",
      },
    ],
    voice: {
      who: "A woman going home from hospital (fictional)",
      text: "My daughter already has someone she trusts, so I chose them. The nurse said that was my call to make, and it was.",
    },
    dilemma: "The GP practice sends the most names. Is that where my time should go?",
  },
  inputs: {
    mode: "records",
    asOf: "2026-09-30",
    timezone: "Australia/Brisbane",
    observationDays: 90,
    matureAge: 90,
    minSample: 5,
    areas: [
      { id: "banksia", name: "Banksia Rise", note: "A fictional suburb around Toowoomba." },
      { id: "corella", name: "Corella Park", note: "A fictional suburb around Toowoomba." },
    ],
    records: RECORDS,
    effort: EFFORT,
    rows: [],
  },
  period: ["2026-04", "2026-05", "2026-06"],
  prediction: {
    prompt:
      "From April to June the GP practice sent 12 enquiries, the hospital discharge team 6 and the community organisation 5. Which relationship produced the most useful growth?",
    options: [
      { id: "gp", text: "The GP practice: it sent the most enquiries", likely: false },
      { id: "hospital", text: "The hospital discharge team: its people need help quickly", likely: false },
      { id: "community", text: "The community organisation: fewer, but they seem ready", likely: true },
      { id: "cant", text: "I can’t tell from enquiry counts alone", likely: true },
    ],
  },
  cards: [
    {
      id: "card-1",
      record: "E06",
      text: at("E06").note!,
      feedback:
        "Approved, waiting for a funding allocation. She can’t start funded services until it arrives, and a GP’s introduction doesn’t change the queue. Waiting isn’t lost.",
    },
    {
      id: "card-2",
      record: "E10",
      text: at("E10").note!,
      feedback:
        "Needs an assessment first. A warm introduction, but several stages from choosing a provider: the time ahead belongs to the assessment process, not the GP.",
    },
    {
      id: "card-3",
      record: "E01",
      text: at("E01").note!,
      feedback: "Allocated and choosing a provider. The pharmacist’s later mention is an assist: he counts once, as the GP practice’s enquiry.",
    },
    {
      id: "card-4",
      record: "E13",
      text: at("E13").note!,
      feedback: "An urgent change at discharge, with her agreement. Time-sensitive and coordination-heavy: the onboarding hours this needs aren’t wasted.",
    },
    {
      id: "card-5",
      record: "E15",
      text: at("E15").note!,
      feedback: "Already receiving care and considering a change. Ready to decide, and the choice of whether to change is his.",
    },
    {
      id: "card-6",
      record: "E12",
      text: at("E12").note!,
      feedback:
        "Unknown. A brochure picked up isn’t an authorised introduction, and nothing says what stage he’s at. Unknown is an honest answer: don’t guess “allocated” because a GP practice was involved.",
    },
    {
      id: "card-7",
      record: "E19",
      text: at("E19").note!,
      feedback: "Allocated and choosing, in her own time. Meeting two providers is her right, not a sign the introduction failed.",
    },
    {
      id: "card-8",
      record: "E23",
      text: at("E23").note!,
      feedback:
        "Approved and waiting for funding, even though he came through the community organisation. The source doesn’t set the stage: the stage at first contact does.",
    },
  ],
  denominator: {
    prompt: "Maya’s June summary says: 3 first services in June and 9 new enquiries in June, “June conversion 33%”. Which reading would you give her?",
    options: [
      {
        id: "cohort",
        text: "That isn’t a conversion rate: one of June’s three starts came from a May enquiry, and most of June’s enquiries had had only days to progress. Follow each month’s enquiries to their own starts: of the 26 April–June enquiries, 14 had started by 30 September and 8 were still open.",
        feedback:
          "Right: a rate needs the same arrival cohort above and below the line. June’s starts and June’s enquiries aren’t the same people, so the 33% says little. 14 of 26 is a cohort figure, and it still says how many are open.",
        levels: { cohort: 3 },
        flags: [],
      },
      {
        id: "calendar",
        text: "33% is fair: it’s June’s starts over June’s enquiries, and it’s the easiest number to track each month.",
        feedback:
          "One of June’s three starts came from a May enquiry, and June’s nine enquiries had had only days to progress. Dividing one month’s starts by another set of people’s enquiries mixes cohorts and can swing wildly from month to month.",
        levels: { cohort: 0 },
        flags: ["mixedCohort"],
      },
      {
        id: "agreed",
        text: "Count agreements instead of first services: they’re signed, so they’re as good as starts, and there are more of them.",
        feedback: "An agreement isn’t a delivered service: one GP agreement from June was still waiting for an early-morning worker at the end of September.",
        levels: { cohort: 1 },
        flags: ["agreementAsStart"],
      },
    ],
  },
  timing: {
    prompt:
      "Six of the GP practice’s April–June enquiries are still open at the end of September, five of them waiting for a government step. How should Maya read them?",
    options: [
      {
        id: "open",
        text: "Open, not lost: four wait for a funding allocation and one for an assessment, which nobody local can speed up. The sixth has an agreement and waits for a worker, which is Maya’s capacity question. Keep them visible with their ages, and check in at agreed points without pressure.",
        feedback:
          "That separates who owns each wait: the government for allocation and assessment, Maya and Operations for the capacity gap. The referrer owns none of it.",
        levels: { open: 3 },
        flags: [],
      },
      {
        id: "lost",
        text: "Lost conversions: after three months, they’re not coming.",
        feedback:
          "A person approved and waiting for funding can’t choose a provider yet. Counting them as lost makes the GP practice look worse for a government wait.",
        levels: { open: 0 },
        flags: ["waitAsLost"],
      },
      {
        id: "blame",
        text: "The GP practice is sending poor referrals: ask them to send only people who already have their funding.",
        feedback:
          "The practice is doing its job when a patient asks about support. A clearer stage explainer can help it set expectations, but the wait isn’t its fault, and asking it to hold people back helps nobody.",
        levels: { open: 1 },
        flags: ["blamedReferrer"],
      },
      {
        id: "promise",
        text: "Tell the families Maya can get them funded sooner because their GP referred them.",
        feedback: "Nobody can promise a place in the funding queue. A referral from a GP doesn’t move it.",
        levels: { open: 0 },
        flags: ["promisedPlace"],
      },
    ],
  },
  choice: {
    prompt: "At one hospital handoff, the woman going home chose the provider her daughter already uses. What does Maya do?",
    options: [
      {
        id: "respect",
        text: "Thank the discharge team, make sure her choice is clear so nothing falls between providers, and record the enquiry as closed: chose another provider.",
        feedback:
          "Choosing a provider is her decision, not the referrer’s sales outcome. Recording it honestly keeps the hospital relationship’s figures true, and the handoff safe.",
        levels: { choice: 3 },
        flags: [],
      },
      {
        id: "persuade",
        text: "Ring her daughter before the agreement is signed, to explain why Maya’s business would be the better choice.",
        feedback: "That’s pressure on a decision she has already made, at a vulnerable moment. Her choice stands.",
        levels: { choice: 0 },
        flags: ["pressure"],
      },
      {
        id: "loss",
        text: "Record it as a lost conversion against the hospital relationship, so the team knows its introductions aren’t converting.",
        feedback:
          "Her choice is a valid outcome, not a failed introduction. Recording it as “chose another provider” is honest and keeps the relationship’s figures fair.",
        levels: { choice: 1 },
        flags: [],
      },
    ],
  },
  revise: {
    prompt: "With the stages, starts, timing, effort and continuity in front of you, which reading would you now give?",
    options: [
      {
        id: "community",
        text: "In these mature cohorts the community organisation looks most efficient: 4 of 5 started, most were ready to choose, about 1.5 relationship hours per start, and all three old enough are still active. It’s a small sample, so it’s a tentative reading, not a ranking.",
        feedback: "Careful and evidenced: the same cohort, effort per start beside the sample size, and honest about how little five enquiries can prove.",
        levels: { cohort: 3, effort: 3 },
        flags: [],
      },
      {
        id: "gp",
        text: "Still the GP practice: 12 enquiries is more than the other two put together.",
        feedback:
          "Volume isn’t value. Most GP enquiries arrived before funding, so they’re slow to start through no fault of the practice; but the count alone doesn’t show useful growth.",
        levels: { cohort: 1, effort: 1 },
        flags: ["volumeAsValue"],
      },
      {
        id: "hospital",
        text: "The hospital relationship costs the most: 28 onboarding hours for 4 starts. Maya should cut back on it.",
        feedback:
          "Urgent discharges need more onboarding. That’s necessary care for a different group, not a failed investment, and it’s kept apart from relationship effort for that reason.",
        levels: { cohort: 2, effort: 0 },
        flags: ["effortAsWaste"],
      },
      {
        id: "wait",
        text: "None of them can be compared until there are a hundred enquiries each, so don’t read anything into it yet.",
        feedback: "Too early to rank isn’t too early to learn: the stage mix, the waits and the effort per start already say what to try next.",
        levels: { cohort: 2, effort: 1 },
        flags: [],
      },
    ],
  },
  dataPoints: {
    prompt: "Which one data point could change that reading?",
    options: [
      {
        id: "funded",
        text: "Whether the GP practice’s waiting enquiries start once their funding arrives: if they do, its stage-matched picture improves.",
        feedback: "A good test: it compares like with like, by stage, in the same cohort.",
        levels: { stage: 3, cohort: 3 },
        flags: [],
      },
      {
        id: "count",
        text: "Next month’s enquiry count from each relationship.",
        feedback: "Another month of counts adds volume, not evidence about which enquiries become active clients.",
        levels: { stage: 1, cohort: 1 },
        flags: [],
      },
      {
        id: "signed",
        text: "How many agreements each relationship produces next quarter.",
        feedback: "Agreements aren’t services. The first delivered service, and whether people stay, are what show useful growth.",
        levels: { stage: 1, cohort: 1 },
        flags: ["agreementAsStart"],
      },
    ],
  },
  relationship: [
    {
      id: "explainer",
      text: "Trial a clearer stage explainer with the GP practice: what stage a patient is at, and when an introduction helps them most. Use the approved material from the Local Referral Studio, and look again with the next cohort.",
      feedback: "It works on the real issue (enquiries arriving before funding) without asking the practice to hold anyone back, and it sets a date to check.",
      outcome: "The practice nurse starts asking where each patient is up to before passing on a name. October’s GP enquiries arrive further along.",
      levels: { action: 3, choice: 3 },
      flags: [],
      next: "studio",
    },
    {
      id: "nurture",
      text: "Nurture the community organisation relationship: a regular check-in and the approved one-pager, without expecting a quota.",
      feedback: "A proportionate way to keep a relationship whose people arrive ready to choose, with no pressure on numbers.",
      outcome: "The seniors’ group invites Maya to a morning tea. A few more people ask about support, in their own time.",
      levels: { action: 3, choice: 3 },
      flags: [],
      next: "studio",
    },
    {
      id: "drop",
      text: "Stop visiting the GP practice: two-thirds of its enquiries haven’t started.",
      feedback: "Most of those people are waiting for funding or an assessment. Dropping the relationship reads a government wait as the practice’s failure.",
      outcome: "Maya stops visiting. Over the next months, the waiting patients get their funding and choose other providers their GP mentions.",
      levels: { action: 0, choice: 2 },
      flags: ["waitAsLost", "blamedReferrer"],
      next: "",
    },
    {
      id: "target",
      text: "Ask the hospital team for a monthly target of introductions who will choose Maya’s business.",
      feedback: "A discharge team introduces people; it doesn’t deliver their choices. A quota pushes towards pressure on vulnerable people at discharge.",
      outcome: "The team is uncomfortable and introductions slow down.",
      levels: { action: 0, choice: 0 },
      flags: ["pressure"],
      next: "",
    },
  ],
  operational: [
    {
      id: "capacity",
      text: "Check whether local service capacity is slowing agreed starts: in Banksia Rise, two agreed starts waited weeks for an early-morning worker and a third is still waiting. Take it to the local coverage review.",
      feedback: "The right operational question: an agreed start waiting for a worker is a supply gap, not a referral problem.",
      outcome: "The coverage review confirms an early-morning personal-care gap in Banksia Rise. A newly approved worker covers it from October.",
      levels: { action: 3 },
      flags: [],
      next: "coverage",
    },
    {
      id: "hire",
      text: "Hire another coordinator straight away so every enquiry is followed up faster.",
      feedback:
        "Coordinator time wasn’t what held these starts: funding allocations and an early-morning worker were. If coordinator capacity were the constraint, the Next 10 Clients calculator is the place to test it.",
      outcome: "The new coordinator is busy with onboarding, but the waiting enquiries still wait for funding.",
      levels: { action: 1 },
      flags: [],
      next: "intake",
    },
    {
      id: "none",
      text: "No operational step: it’s all about the relationships.",
      feedback: "Three agreed starts in Banksia Rise waited on an early-morning worker. That’s an operational fix the relationships can’t make.",
      outcome: "The June agreement in Banksia Rise is still waiting for a worker in October.",
      levels: { action: 1 },
      flags: [],
      next: "",
    },
  ],
  explanations: [
    {
      id: "careful",
      text: "The community relationship produced more first services per hour of relationship work in these mature cohorts. The hospital introductions served a different, urgent group and took more onboarding. GP enquiries often arrived before a funding allocation. Trial a clearer stage explainer with the GP, keep the discharge pathway, and check whether local service capacity is slowing agreed starts.",
      feedback: "That keeps the cohort, the stage mix, effort and capacity apart, and names one relationship action and one operational fix.",
      levels: { cohort: 3, stage: 3, effort: 3 },
      flags: [],
    },
    {
      id: "rank",
      text: "Rank them: the GP practice first (most enquiries), then the hospital, then the community organisation.",
      feedback: "A leaderboard by volume misleads: it ignores the stages people arrive at, the waits nobody local controls, and what each start took.",
      levels: { cohort: 1, stage: 1, effort: 1 },
      flags: ["volumeAsValue"],
    },
    {
      id: "rates",
      text: "Community 80%, hospital 67%, GP 33%: the GP practice is the weakest relationship.",
      feedback:
        "Those overall rates compare unlike groups. By stage, 3 of the GP’s 4 allocated enquiries started, and five more were still waiting for an assessment or funding.",
      levels: { cohort: 2, stage: 1, effort: 1 },
      flags: ["waitAsLost"],
    },
  ],
  update: {
    title: "Seven weeks later",
    text: "It’s 20 November. Funding allocations have arrived for some of the GP practice’s waiting patients, and the early-morning worker Maya needed in Banksia Rise was approved in October. The GP practice has started asking where patients are up to before passing on a name, and October’s enquiries are in.",
    asOf: "2026-11-20",
    period: ["2026-10"],
    records: [
      { ...at("E04"), startedOn: "2026-10-06" },
      { ...at("E06"), laterStage: "allocated", allocatedOn: "2026-10-02", pathwayOn: "2026-10-06", agreedOn: "2026-10-14", startedOn: "2026-10-22" },
      { ...at("E07"), laterStage: "allocated", allocatedOn: "2026-11-02" },
      { ...at("E10"), laterStage: "waiting", wait: "funding" },
      { ...at("E23"), laterStage: "allocated", allocatedOn: "2026-10-15", pathwayOn: "2026-10-16", agreedOn: "2026-10-28", startedOn: "2026-11-05" },
      { ...at("E25"), pathwayOn: "2026-10-05", agreedOn: "2026-10-12", startedOn: "2026-10-20" },
      enquiry("E27", "gp", "2026-10-06", { pathwayOn: "2026-10-09", agreedOn: "2026-10-22", startedOn: "2026-10-29" }),
      enquiry("E28", "gp", "2026-10-09", { area: "corella", pathwayOn: "2026-10-14", agreedOn: "2026-11-10", wait: "intake" }),
      enquiry("E29", "gp", "2026-10-14", { initialStage: "waiting", wait: "funding" }),
      enquiry("E30", "gp", "2026-10-21", { area: "corella", pathwayOn: "2026-10-24", agreedOn: "2026-11-06", startedOn: "2026-11-12" }),
      enquiry("E31", "community", "2026-10-08", { pathwayOn: "2026-10-12", agreedOn: "2026-10-21", startedOn: "2026-10-27" }),
      enquiry("E32", "community", "2026-10-20", { area: "corella", initialStage: "assessment", wait: "assessment" }),
      enquiry("E33", "hospital", "2026-10-16", { initialStage: "urgent", pathwayOn: "2026-10-16", agreedOn: "2026-10-18", startedOn: "2026-10-20" }),
    ],
    effort: [
      row("gp", "2026-10", effort(1, 1, 2, 1, 4)),
      row("community", "2026-10", effort(1, 0.5, 0, 0.5, 2)),
      row("hospital", "2026-10", effort(1, 0.5, 0, 0.5, 6)),
    ],
  },
  followUp: {
    prompt: "What does the return visit show?",
    options: [
      {
        id: "honest",
        text: "The GP practice’s April–June cohort caught up as funding arrived: 6 of 12 have started, about 3 relationship hours per start, and the open ones are still waiting, not lost. October’s GP enquiries arrived further along, an early sign the stage explainer helps, but they’re under 90 days old: too early to rank.",
        feedback:
          "Honest about both cohorts: the older one is maturing, the newer one is an early signal only. That’s the comparison with the prediction the article is after.",
        levels: { open: 3, action: 3 },
        flags: [],
      },
      {
        id: "proved",
        text: "The explainer worked: October’s GP enquiries already convert at 50%, so the GP practice is now the best relationship.",
        feedback: "October’s cohort is a few weeks old and four people strong. It’s an encouraging signal, not a ranking or a final rate.",
        levels: { open: 1, action: 1 },
        flags: ["rankedSmall"],
      },
      {
        id: "same",
        text: "Nothing has changed: the GP practice still converts worse than the community organisation, so stop the explainer.",
        feedback:
          "Six of the GP’s twelve have now started, and the rest are mostly still waiting for funding. Judging the explainer on April–June enquiries, sent before it began, mixes cohorts.",
        levels: { open: 1, action: 1 },
        flags: ["waitAsLost"],
      },
    ],
  },
  debrief:
    "From counts alone the GP practice looked strongest: 12 enquiries against 6 and 5. Following the same April–June cohort tells a different story. Most GP enquiries arrived before a funding allocation: by 30 September, 4 of 12 had started (33%), but 3 of the 4 people already allocated had (75%), and five were still waiting for an assessment or funding: open, not lost, and not the practice’s doing. The hospital discharge team sent urgent introductions: 4 of 6 started, quickly, with about 7 hours of onboarding each, and one woman chose another provider, which was her decision. The community organisation’s 5 enquiries mostly arrived ready to choose: 4 started at about 1.5 relationship hours each, a small sample. Three agreed starts in Banksia Rise waited weeks for an early-morning worker, and one still waits: a capacity question, not a referral one. A careful next step trials a clearer stage explainer with the GP practice, keeps the discharge pathway, nurtures the community relationship and checks local service capacity. This is fictional, illustrative feedback, not a claim about real Trilogy Care referral sources.",
  links: [
    {
      label: "Is this suburb ready for growth?",
      href: "/magazine/is-this-suburb-ready-for-growth",
      why: "When agreed starts wait for a worker or supplier: compare local demand with usable capacity by service, place and time.",
    },
    {
      label: "Can we take on the next 10 clients?",
      href: "/magazine/can-we-take-on-the-next-10-clients",
      why: "When coordinator capacity is the constraint: test next month’s starts against coordinator hours week by week.",
    },
  ],
  studio: {
    label: "Local Referral Studio: pitch practice and the approved one-pager (Work Tools)",
    note: "Placeholder: the Local Referral Studio Work Tool isn’t in the Hub yet. When it is, a relationship action opens its approved stage explainer, one-pager or pitch practice from here. Nothing in this article drafts or sends a message to a referrer.",
  },
  sources: [
    { title: "How the Support at Home program works", url: "https://www.health.gov.au/our-work/support-at-home/about/how-the-support-at-home-program-works" },
    { title: "Connecting with Support at Home providers", url: "https://www.myagedcare.gov.au/connecting-support-at-home-providers" },
  ],
  rationale: {
    theme: "Recurring questions about “lots of referrals but few starts”, an apparently underperforming relationship, and slow handoffs from local referrers.",
    themeOwner: "",
    audience: "Independent Care Partner business owners who develop local referral relationships.",
    behaviour:
      "Compare referral sources by the same arrival cohort and a stated denominator, with the stage at first contact visible; separate funding waits, participant choice, capacity and handoff delays; choose one relationship action and one operational fix.",
    whyFit:
      "The mistake is a judgement about unlike stages and mixed cohorts. A cohort calculator on fictional rows lets a reader see that volume isn’t value, without real referrer or patient data.",
    reuse:
      "Is this suburb ready for growth? for capacity; Can we take on the next 10 clients? for coordinator capacity; the Local Referral Studio (not yet in the Hub) for pitch practice and approved material.",
    systemFix:
      "Funding allocation waits, an unclear authorised-introduction process and supply gaps after agreement are process causes: an article alone won’t fix them.",
    measure:
      "Authorised introductions, time from allocation to first contact, agreement-to-first-service time and starts reaching the observation point, with the learning results beside them; owned by the referral pathway and intake owners.",
    decision: "",
  },
  approval: {
    owner: "",
    pathway: "",
    intake: "",
    partnerships: "",
    operations: "",
    quality: "",
    privacy: "",
    pilot: "",
    approvedOn: "",
    effectiveFrom: "",
    reviewBy: "",
  },
};

export const REFERRAL_CASES: { id: string; label: string; data: ReferralLabData }[] = [
  { id: "referral-active", label: "Maya’s three relationships (fictional, around Toowoomba)", data: REFERRAL_ACTIVE },
];
