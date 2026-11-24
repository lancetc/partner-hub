import type { ReliabilityLabData } from "@/lib/reliabilityLab";
import { DEFINITIONS_VERSION, type CountRow, type Occurrence, type RecoveryTask } from "@/lib/serviceReliability";

/*
  The reviewed fictional case for "What does a missed service cost?" (docs/service-reliability.md). Every person,
  business, supplier and figure is invented for practice: none is a Trilogy Care rate, a supplier's real record, a
  claim rule or a cancellation policy.

  It returns to Maya, keeping her established facts from the Hiring Runway lab, the Workload Lens, Local Coverage and
  the Referral Journey: a small Care Partner business in Toowoomba; 35 clients; three start each month and about one
  leaves; $26,720 in the bank and $10,000 kept in reserve. Her coordinator isn't named (the library's "Sam" is a
  Trilogy Care team member). Workers and suppliers are anonymous.

  Mrs Patel is the Hub's recurring participant: she lives at home and is planning a bathroom upgrade (her Digital
  Member introduction). Her Tuesday cleaning and the book group she hosts on Tuesday afternoons come from One Day,
  Five Perspectives; they're this story's situation, nothing more. Other clients are opaque visit ids only.

  The month: Monday 5 October to Sunday 1 November 2026, as of Tuesday 3 November. 100 cleaning and personal-care
  visits were scheduled. Eleven didn't go as agreed: five verified supplier misses (four of them the same supplier's
  Tuesday-morning cleaning roster), two participants' own cancellations, one booking error, one late visit, one
  same-day replacement, and one disputed visit. Recovery took 6.5 unique hours (6 of them on the Tuesday issue), with
  one task not measured. Mrs Patel's first missed Tuesday was restored on day 4; her second is still open on day 7,
  with a replacement booked that didn't arrive. A GP campaign is planned for December.
*/

const v = (id: string, date: string, more: Partial<Occurrence>): Occurrence => ({
  id,
  date,
  service: "domestic",
  window: "morning",
  essential: false,
  outcome: "delivered",
  reason: "",
  verified: false,
  issue: "",
  contacted: "",
  booked: "",
  restored: "",
  updated: "",
  owner: "",
  preference: "",
  who: "",
  evidence: "",
  evidenceOn: "",
  source: "fictional",
  ...more,
});

/** The month's routine visits, delivered as agreed: grouped counts by week, service and time window. */
const routine = (week: number, service: CountRow["service"], window: CountRow["window"], delivered: number): CountRow => ({
  id: `w${week + 1}-${service}-${window}`,
  label: "",
  service,
  window,
  week,
  delivered,
  late: 0,
  replaced: 0,
  unknown: 0,
  missed: { supplier: 0, booking: 0, participant: 0, pause: 0, health: 0, access: 0, unknown: 0 },
  unverified: 0,
  restored: { d0: 0, d1_2: 0, d3_7: 0, d8: 0 },
  booked: 0,
  unresolved: 0,
  essentialOpen: 0,
  repeatIssues: 0,
  source: "fictional",
});

const t = (
  id: string,
  label: string,
  occurrence: string,
  category: RecoveryTask["category"],
  minutes: RecoveryTask["minutes"],
  more: Partial<RecoveryTask> = {},
): RecoveryTask => ({
  id,
  label,
  category,
  causes: ["missedService"],
  occurrence,
  issue: "",
  reason: "",
  week: null,
  count: 1,
  minutes,
  ...more,
});

const SUPPLIER = { outcome: "missed", reason: "supplier", verified: true } as const;
const TUESDAY = { ...SUPPLIER, issue: "tuesday-clean" } as const;

export const MISSED_SERVICE: ReliabilityLabData = {
  title: "What does a missed service cost?",
  intro:
    "Mrs Patel’s cleaner didn’t come before her book group. Follow one month of missed services in Maya’s business: what happened to each person, what it took to repair, and whether fixing reliability should come before another referral push.",
  storyVersion: "missed-service-1",
  definitionsVersion: DEFINITIONS_VERSION,
  story: {
    character: "Maya",
    role: "Principal of a small independent Care Partner business in Toowoomba (fictional)",
    participant: "Mrs Patel",
    situation:
      "Maya runs a small Care Partner business in Toowoomba. Her team supports 35 people; three start each month and about one leaves. She has $26,720 in the bank and keeps $10,000 in reserve. Enquiries from her GP practice are rising, and she’s planned a campaign to visit six more GP practices in December. Then a Tuesday goes wrong for Mrs Patel, who lives at home (she’s also planning a bathroom upgrade, a separate conversation), and Maya finds her coordinator has been repairing similar failures for other clients all month.",
    transmission: { who: "Ava, field transmission", text: "A missed visit isn’t one event. Let’s follow what it set off, and who carried it." },
    tuesday:
      "Tuesday 20 October, 9.30 am. Mrs Patel’s cleaner was due at 9. Her book group meets at her home at 2 pm, as it does every Tuesday, and she’s been looking forward to it all week. Nobody has come and nobody has called. She rings Maya’s coordinator: she’s not hurt, she’s embarrassed, and she wants to know whether to cancel her friends.",
    repeat:
      "A replacement cleaner came on Saturday 24 October, and Mrs Patel said it was fine, though it wasn’t Tuesday. Then on Tuesday 27 October the same slot failed again. This time she agreed to a Thursday replacement, booked for the 29th. The replacement didn’t arrive. On 3 November her 27 October clean still hasn’t happened.",
    investment:
      "Maya can spend the same planning effort on a verified backup for Tuesday-morning cleaning, or on the GP campaign she’d planned for December. Her coordinator has about 2 hours a month to spare for onboarding after this month’s three starts.",
    later:
      "Four weeks after Maya chose, she calls Mrs Patel to ask how Tuesdays have been. In the same week, another client, whose visits were never missed, tells the coordinator she’s moving to a provider her daughter already uses, nearer to her daughter’s home.",
    voice: "“Two Tuesdays now, the same lovely woman, on time. I stopped warning the girls I might have to cancel.”",
    dilemma: "Should Maya fix reliability first, or bring in more enquiries?",
  },
  inputs: {
    period: { start: "2026-10-05", weeks: 4, asOf: "2026-11-03" },
    scope: "Cleaning and personal-care visits Maya’s business arranges",
    windowDays: 2,
    hourly: 40,
    occurrences: [
      v("V03", "2026-10-07", {
        service: "personalCare",
        window: "early",
        essential: true,
        outcome: "late",
        reason: "supplier",
        verified: true,
        evidence: "The worker arrived 50 minutes late: the supplier’s timesheet and the client agree.",
        evidenceOn: "2026-10-07",
      }),
      v("V05", "2026-10-13", {
        window: "afternoon",
        outcome: "missed",
        reason: "participant",
        verified: true,
        preference: "Next week as usual",
        evidence: "The client rang the day before to cancel: her sister was visiting.",
        evidenceOn: "2026-10-12",
      }),
      v("V08", "2026-10-15", {
        service: "personalCare",
        essential: true,
        outcome: "missed",
        reason: "booking",
        verified: true,
        contacted: "2026-10-15",
        restored: "2026-10-15",
        updated: "2026-10-15",
        owner: "Coordinator",
        evidence: "A roster change was written up as Friday in the handoff note, so the worker went on Friday. The coordinator arranged an afternoon visit.",
        evidenceOn: "2026-10-15",
      }),
      v("V10", "2026-10-20", {
        ...TUESDAY,
        who: "Mrs Patel",
        contacted: "2026-10-20",
        booked: "2026-10-21",
        restored: "2026-10-24",
        updated: "2026-10-20",
        owner: "Coordinator",
        preference: "Tuesday before book group, or the weekend",
        evidence: "The supplier confirmed the worker was double-booked and nobody called. A replacement came on Saturday 24 October.",
        evidenceOn: "2026-10-20",
      }),
      v("V11", "2026-10-20", {
        ...TUESDAY,
        contacted: "2026-10-20",
        restored: "2026-10-21",
        updated: "2026-10-20",
        owner: "Coordinator",
        evidence: "The same supplier, the same morning: no worker. Restored the next day at short notice.",
        evidenceOn: "2026-10-20",
      }),
      v("V12", "2026-10-22", {
        outcome: "missed",
        reason: "participant",
        verified: true,
        evidence: "The client wasn’t home: she’d gone to a family lunch and forgot to say. The worker waited and called.",
        evidenceOn: "2026-10-22",
      }),
      v("V14", "2026-10-26", {
        service: "personalCare",
        window: "early",
        essential: true,
        outcome: "replaced",
        reason: "supplier",
        verified: true,
        evidence: "The worker called in sick at 6 am; the supplier sent another approved worker, who arrived at 7.30, inside the agreed window.",
        evidenceOn: "2026-10-26",
      }),
      v("V15", "2026-10-27", {
        ...TUESDAY,
        who: "Mrs Patel",
        contacted: "2026-10-27",
        booked: "2026-10-29",
        updated: "2026-10-27",
        owner: "Coordinator",
        preference: "A dependable Tuesday; Thursday this once",
        evidence: "The Tuesday slot failed again. A Thursday replacement was booked for 29 October; nobody arrived.",
        evidenceOn: "2026-10-29",
      }),
      v("V16", "2026-10-27", {
        ...TUESDAY,
        contacted: "2026-10-27",
        updated: "2026-10-28",
        owner: "Coordinator",
        preference: "Wait for a Tuesday she can rely on",
        evidence: "The same Tuesday roster, the same morning. The client would rather wait for a Tuesday than take another day.",
        evidenceOn: "2026-10-27",
      }),
      v("V18", "2026-10-29", {
        service: "personalCare",
        window: "afternoon",
        essential: true,
        outcome: "unknown",
        reason: "unknown",
        evidence: "The supplier’s app shows the visit as done; the client says nobody came. Under review with the supplier.",
        evidenceOn: "2026-10-30",
      }),
      v("V20", "2026-10-30", {
        ...SUPPLIER,
        service: "personalCare",
        window: "afternoon",
        essential: true,
        contacted: "2026-10-30",
        restored: "2026-10-30",
        updated: "2026-10-30",
        owner: "Coordinator, through the escalation process",
        evidence: "No worker for the afternoon visit that includes lunch and a medication prompt. The client lives alone. A worker came that evening.",
        evidenceOn: "2026-10-30",
      }),
    ],
    rows: [
      routine(0, "domestic", "morning", 9),
      routine(0, "domestic", "afternoon", 3),
      routine(0, "personalCare", "early", 5),
      routine(0, "personalCare", "morning", 3),
      routine(0, "personalCare", "afternoon", 2),
      routine(1, "domestic", "morning", 10),
      routine(1, "domestic", "afternoon", 2),
      routine(1, "personalCare", "early", 6),
      routine(1, "personalCare", "morning", 2),
      routine(1, "personalCare", "afternoon", 2),
      routine(2, "domestic", "morning", 7),
      routine(2, "domestic", "afternoon", 3),
      routine(2, "personalCare", "early", 6),
      routine(2, "personalCare", "morning", 3),
      routine(2, "personalCare", "afternoon", 2),
      routine(3, "domestic", "morning", 6),
      routine(3, "domestic", "afternoon", 3),
      routine(3, "personalCare", "early", 5),
      routine(3, "personalCare", "morning", 3),
      routine(3, "personalCare", "afternoon", 7),
    ],
    issues: [
      {
        id: "tuesday-clean",
        label: "Tuesday-morning cleaning from one supplier",
        note: "The same supplier’s Tuesday roster: one worker covering too many early visits, with no backup.",
      },
    ],
    tasks: [
      t("v10-call", "Call with Mrs Patel about the missed clean", "V10", "conversation", 30),
      t("v10-supplier", "Supplier follow-up", "V10", "supplier", 20, { causes: ["missedService", "supplierAvailability"] }),
      t("v10-replace", "Searching for and booking a replacement", "V10", "change", 40, { causes: ["missedService", "supplierAvailability"] }),
      t("v11-call", "Call with the client", "V11", "conversation", 20),
      t("v11-supplier", "Supplier follow-up", "V11", "supplier", 20, { causes: ["missedService", "supplierAvailability"] }),
      t("v11-rebook", "Rebooking at short notice", "V11", "change", 30),
      t("v11-invoice", "Correcting an invoice that charged for the missed clean", "V11", "supplier", 20, { causes: ["missedService", "invoiceCorrection"] }),
      t("v15-call", "Call with Mrs Patel: Tuesday failed again", "V15", "conversation", 25),
      t("v15-book", "Booking the Thursday replacement", "V15", "change", 25),
      t("v15-chase", "Chasing the replacement that didn’t arrive", "V15", "supplier", 25, { causes: ["missedService", "supplierAvailability"] }),
      t("v15-update", "Updating Mrs Patel", "V15", "conversation", 15),
      t("v16-call", "Call with the client", "V16", "conversation", 30),
      t("v16-supplier", "Supplier follow-up", "V16", "supplier", 30, { causes: ["missedService", "supplierAvailability"] }),
      t("v16-roster", "Trying to rework the Tuesday roster", "V16", "change", 30, { causes: ["missedService", "supplierAvailability"] }),
      t("v08-rebook", "Rebooking after the handoff error", "V08", "change", 30, { causes: ["unclearHandoff"] }),
      t("v20-supplier", "Supplier call during the escalation (not timed)", "V20", "supplier", "unknown"),
    ],
    costs: [
      {
        id: "v10-premium",
        label: "Weekend replacement premium (Mrs Patel’s Saturday clean)",
        kind: "premium",
        amount: 25,
        bears: "yes",
        occurrence: "V10",
        issue: "tuesday-clean",
        reason: "",
        source: "fictional",
      },
      {
        id: "v11-premium",
        label: "Short-notice replacement premium",
        kind: "premium",
        amount: 25,
        bears: "yes",
        occurrence: "V11",
        issue: "tuesday-clean",
        reason: "",
        source: "fictional",
      },
      {
        id: "goodwill",
        label: "A goodwill credit discussed for a Tuesday client",
        kind: "credit",
        amount: 30,
        bears: "unknown",
        occurrence: "V16",
        issue: "tuesday-clean",
        reason: "",
        source: "fictional",
      },
    ],
    interventions: [
      {
        id: "backup",
        label: "A verified backup cleaner for Tuesday mornings",
        kind: "backup",
        reason: "supplier",
        issue: "tuesday-clean",
        affected: null,
        reduction: 0.75,
        oneOff: 200,
        recurring: 50,
        hours: 0.5,
        starts: "2026-11-10",
        owner: "Maya, with supplier management",
        evidence:
          "Missed Tuesday cleans and recovery hours over the next four weeks beside this month’s, and whether Tuesday clients say the day is dependable.",
        active: false,
      },
      {
        id: "confirm",
        label: "Confirm next week’s rosters with the supplier by Friday noon",
        kind: "confirmation",
        reason: "supplier",
        issue: "",
        affected: null,
        reduction: 0.4,
        oneOff: 0,
        recurring: 0,
        hours: 2,
        starts: "2026-11-06",
        owner: "Maya’s coordinator",
        evidence: "Supplier misses with no notice, over the next four weeks.",
        active: false,
      },
      {
        id: "handoff",
        label: "Name who updates the visit in every roster-change handoff",
        kind: "handoff",
        reason: "booking",
        issue: "",
        affected: null,
        reduction: 1,
        oneOff: 0,
        recurring: 0,
        hours: 0.25,
        starts: "2026-11-06",
        owner: "Maya",
        evidence: "Booking errors after roster changes, over the next two months.",
        active: false,
      },
    ],
    freedHours: "labour",
    horizonWeeks: 12,
    leads: {
      active: true,
      label: "Visit six more GP practices in December",
      effortHours: 10,
      cost: 200,
      enquiries: 6,
      starts: 2,
      firstStartWeeks: 10,
      onboardingPerStart: 4,
      source: "fictional",
      note: "From Maya’s GP cohort in “Which referrals become active clients?”: about a third of enquiries started, many after waiting for a funding allocation. Onboarding at about 4 hours a start, as in her coordinator’s plan.",
    },
    onboardingHours: 6,
    updateTarget: 1,
    comparison: { label: "The four weeks before (7 September to 4 October)", scheduled: 98, supplierMissed: 1 },
  },
  response: {
    prompt: "Mrs Patel is on the phone. What does her coordinator do first?",
    options: [
      {
        id: "listen",
        text: "Check she’s all right, ask what matters about today and what she’d like (another time today, the weekend, or next Tuesday), say what will be checked and by when, and ask the supplier what happened to the visit.",
        feedback:
          "Her need comes first, in her own terms: a clean before her friends arrive. It checks her wellbeing, offers a real choice and a time to expect the next call, and asks the supplier for the facts before anyone is blamed.",
        levels: { person: 3, followThrough: 3 },
        flags: [],
      },
      {
        id: "any",
        text: "Book any cleaner who can come this week and tell her it’s sorted.",
        feedback:
          "A booking isn’t a clean, and ‘any day this week’ misses why Tuesday matters. Ask what she wants before deciding what ‘sorted’ means, and don’t call it sorted until someone has actually come.",
        levels: { person: 1, followThrough: 1 },
        flags: ["bookedAsDelivered"],
      },
      {
        id: "wait",
        text: "Note it in the log; Maya is reviewing all the missed visits at the end of the month.",
        feedback: "The month’s analysis can wait; Mrs Patel can’t. Her immediate need is answered now, whatever the pattern turns out to be.",
        levels: { person: 0, followThrough: 0 },
        flags: ["waited"],
      },
      {
        id: "blame",
        text: "Tell the supplier the worker shouldn’t come to Mrs Patel again.",
        feedback:
          "Nobody knows yet why the worker didn’t come. Acting against a worker on one unverified report isn’t fair, and it doesn’t get Mrs Patel a clean.",
        levels: { person: 1, followThrough: 1 },
        flags: ["blameWorker"],
      },
    ],
  },
  prediction: {
    prompt: "Before you look at the log: what will the month’s missed visits mostly have cost?",
    countPrompt: "How many of the month’s 100 visits do you think were missed because of the supplier?",
    options: [
      { id: "time", text: "Mostly the coordinator’s time, and people going without", likely: true },
      { id: "premiums", text: "Mostly replacement premiums and credits", likely: false },
      { id: "revenue", text: "Mostly lost fees", likely: false },
      { id: "unsure", text: "I can’t tell until the causes are sorted", likely: true },
    ],
  },
  cards: [
    {
      id: "c-patel",
      title: "Tue 20 Oct, cleaning: Mrs Patel",
      text: "No cleaner at 9 am, and no call. The supplier says the worker was double-booked across two clients that morning.",
      evidence: "The supplier’s email, 20 October",
      occurrence: "V10",
      askUrgent: false,
      answer: { choice: "supplier", urgent: null },
      feedback: "A verified supplier failure: the supplier’s own record confirms it. It counts once in the supplier rate, however many calls followed.",
    },
    {
      id: "c-sister",
      title: "Tue 13 Oct, cleaning: a client’s cancellation",
      text: "The client rang on Monday to cancel her Tuesday afternoon clean: her sister was visiting.",
      evidence: "The coordinator’s call log, 12 October",
      occurrence: "V05",
      askUrgent: false,
      answer: { choice: "participant", urgent: null },
      feedback:
        "The participant’s own choice. Different rules apply to participant cancellations under Support at Home, and Finance and the policy owner decide what’s chargeable. It isn’t a supplier failure, and it stays visible in its own line.",
    },
    {
      id: "c-handoff",
      title: "Thu 15 Oct, personal care: the wrong day",
      text: "After a roster change, the handoff note said Friday. The worker went on Friday; nobody came on Thursday.",
      evidence: "The handoff note and the supplier’s roster",
      occurrence: "V08",
      askUrgent: false,
      answer: { choice: "booking", urgent: null },
      feedback: "The provider’s own booking error, not the supplier’s. It belongs to the business’s handoff process, so it’s a different fix.",
    },
    {
      id: "c-lunch",
      title: "Thu 22 Oct, cleaning: nobody home",
      text: "The worker arrived on time and waited. The client had gone to a family lunch and forgotten to say.",
      evidence: "The worker’s call to the coordinator, and the client’s apology",
      occurrence: "V12",
      askUrgent: false,
      answer: { choice: "participant", urgent: null },
      feedback: "A participant no-show: the supplier turned up. Counting it as a supplier failure would blame the supplier for something it did right.",
    },
    {
      id: "c-sick",
      title: "Mon 26 Oct, personal care: a sick worker",
      text: "The worker called in sick at 6 am. The supplier sent another approved worker, who arrived at 7.30, inside the agreed window.",
      evidence: "The supplier’s timesheet; the client confirmed",
      occurrence: "V14",
      askUrgent: false,
      answer: { choice: "delivered", urgent: null },
      feedback:
        "A suitable replacement on the day: the visit was delivered. The reason is still recorded, so a pattern of sick calls would show, but it isn’t a missed visit.",
    },
    {
      id: "c-disputed",
      title: "Thu 29 Oct, personal care: did it happen?",
      text: "The supplier’s app shows the visit as completed. The client says nobody came.",
      evidence: "The supplier’s app and the client’s call, 30 October",
      occurrence: "V18",
      askUrgent: false,
      answer: { choice: "unknown", urgent: null },
      feedback:
        "Disputed: keep it visible as unknown, in the denominator, until it’s resolved through the accountable process. Don’t assume it happened because an app says so, and don’t blame the worker on one account.",
    },
    {
      id: "c-lunchtime",
      title: "Fri 30 Oct, personal care: no one at lunchtime",
      text: "1 pm: no worker for the afternoon visit. It includes lunch and a medication prompt, and the client lives alone. The supplier confirms there’s no worker free until this evening.",
      evidence: "The supplier’s call, 30 October",
      occurrence: "V20",
      askUrgent: true,
      answer: { choice: "supplier", urgent: true },
      feedback:
        "A verified supplier failure, and essential support: lunch and a medication prompt for someone who lives alone. Check she’s safe and use the approved escalation process now. That never waits for the month’s figures.",
    },
    {
      id: "c-invoice",
      title: "Mon 2 Nov: the supplier’s invoice",
      text: "The cleaning supplier’s October invoice includes a line for Mrs Patel’s clean on 20 October.",
      evidence: "The supplier’s invoice, received 2 November",
      occurrence: "",
      askUrgent: false,
      answer: { choice: "notEvidence", urgent: null },
      feedback: "An invoice doesn’t show a visit happened. Her 20 October clean was missed; the line needs correcting, and the visit stays a missed visit.",
    },
  ],
  log: {
    prompt:
      "Here’s what Maya’s coordinator recorded about Mrs Patel’s Tuesdays and one other client’s. Some lines record the same piece of work twice: a call in the phone log and again in a case note, say. Tick each line that is its own task.",
    entries: [
      {
        id: "e1",
        text: "Phone log, Tue 20 Oct, 9.40 am: called Mrs Patel about this morning’s clean (30 min)",
        minutes: 30,
        task: "v10-call",
        duplicate: false,
        feedback: "Its own task: the call.",
      },
      {
        id: "e2",
        text: "Case note, Tue 20 Oct: spoke with Mrs Patel; she’d like Tuesday, or the weekend if not (30 min)",
        minutes: 30,
        task: "v10-call",
        duplicate: true,
        feedback: "The same call, written up. Counting it again would double its 30 minutes.",
      },
      {
        id: "e3",
        text: "Phone log, Tue 20 Oct, 10.15 am: rang the supplier about Mrs Patel’s clean (20 min)",
        minutes: 20,
        task: "v10-supplier",
        duplicate: false,
        feedback: "Its own task: supplier follow-up.",
      },
      {
        id: "e4",
        text: "Phone log, Wed 21 Oct: searched for a replacement cleaner and booked Saturday (40 min)",
        minutes: 40,
        task: "v10-replace",
        duplicate: false,
        feedback: "Its own task: the replacement search.",
      },
      {
        id: "e5",
        text: "Diary: “Replacement search for Mrs Patel” (40 min)",
        minutes: 40,
        task: "v10-replace",
        duplicate: true,
        feedback: "The diary block for the same search. A task enters the total once.",
      },
      {
        id: "e6",
        text: "Phone log, Wed 21 Oct: corrected the supplier’s invoice, which charged for another client’s missed clean (20 min)",
        minutes: 20,
        task: "v11-invoice",
        duplicate: false,
        feedback: "Its own task: a billing correction. Its rework tag (an invoice correction) doesn’t add time: it’s an overlay.",
      },
      {
        id: "e7",
        text: "Email to the supplier: query about the same invoice line (20 min)",
        minutes: 20,
        task: "v11-invoice",
        duplicate: true,
        feedback: "Part of the same correction, already counted.",
      },
      {
        id: "e8",
        text: "Phone log, Tue 27 Oct: called Mrs Patel; Tuesday failed again, and she accepted Thursday this once (25 min)",
        minutes: 25,
        task: "v15-call",
        duplicate: false,
        feedback: "Its own task, on a different visit: the repeat.",
      },
    ],
  },
  repeat: {
    prompt: "Mrs Patel’s second Tuesday failed, and the Thursday replacement didn’t arrive. What does that tell Maya?",
    options: [
      {
        id: "pattern",
        text: "The Saturday replacement restored one visit, but the Tuesday slot isn’t reliable. It’s a recurring issue with one supplier’s Tuesday roster, four visits in two weeks, and the 27 October clean is still unresolved until someone actually comes.",
        feedback:
          "Right: one recovery isn’t durable reliability. Four visits are one recurring issue, counted as four visits and one issue group, and the open visit keeps its age (7 days) rather than counting as restored.",
        levels: { arithmetic: 3, person: 3 },
        flags: [],
      },
      {
        id: "booked",
        text: "It’s handled: a replacement was booked for Thursday.",
        feedback: "A booking isn’t a clean. Nobody came on Thursday, so the visit is still unresolved on day 7.",
        levels: { arithmetic: 0, person: 1 },
        flags: ["bookedAsDelivered"],
      },
      {
        id: "worker",
        text: "The Tuesday worker is unreliable and should be removed.",
        feedback:
          "The supplier’s own record says the worker was double-booked: a rostering problem. Correction goes through supplier management, not a judgement about one worker.",
        levels: { arithmetic: 1, person: 1 },
        flags: ["blameWorker"],
      },
      {
        id: "fussy",
        text: "Mrs Patel is hard to help: she keeps turning down other days.",
        feedback: "Tuesday matters because of her book group. Her preference is the goal the service is for, not the problem.",
        levels: { arithmetic: 1, person: 0 },
        flags: [],
      },
    ],
  },
  explanations: [
    {
      id: "tradeoff",
      text: "Five of 100 visits were verified supplier misses (5%); the cancellations, the booking error and the disputed visit are separate. The backup is aimed at four of them, and if it prevents three a month, it could free about 4.5 recovery hours and $217.50 in direct costs a month: a forecast to test. Two visits are still open, and more referrals won’t fix them.",
      feedback:
        "Clear and honest: the denominator, the separate causes, the subset the action affects, the assumption, and what money can’t show. It keeps the open visits and the person in view.",
      levels: { classification: 3, arithmetic: 3, assumptions: 3 },
      flags: [],
    },
    {
      id: "eight",
      text: "Eight of 100 visits were missed by the supplier, so 8%.",
      feedback:
        "Eight visits were missed, but two were the participants’ own cancellations and one was the business’s booking error. The verified supplier rate is 5/100 = 5%.",
      levels: { classification: 0, arithmetic: 1, assumptions: 1 },
      flags: ["allSupplier"],
    },
    {
      id: "money",
      text: "The backup costs $350 over three months and avoids about $650 by the model, so it’s the better investment.",
      feedback:
        "The money is part of it, and it’s a forecast. ‘Better’ also depends on Mrs Patel getting her Tuesdays back and the two open visits being restored, which the dollars don’t show.",
      levels: { classification: 2, arithmetic: 2, assumptions: 1 },
      flags: ["profitOverService"],
    },
    {
      id: "lifetime",
      text: "Each client we keep is worth about $3,000 a year, so the backup pays for itself many times over.",
      feedback:
        "A guessed lifetime value isn’t an observed cost, and it puts a price on a person staying. Keep to what was recorded, and keep care apart from money.",
      levels: { classification: 2, arithmetic: 0, assumptions: 0 },
      flags: ["lifetimeValue"],
    },
  ],
  decisions: [
    {
      id: "reliability",
      text: "Restore the two open Tuesday cleans now. Arrange a verified backup for Tuesday mornings through supplier management, hold the GP campaign until the backup has run for four weeks, and review on 8 December: missed Tuesdays, recovery hours, and whether Mrs Patel says Tuesdays are dependable.",
      feedback:
        "Proportionate and checkable: the people waiting come first, the action targets the recurring cause, an owner and a review date are set, and the campaign waits until the team can start new clients well.",
      outcome:
        "Both open cleans happen that week. The backup starts on 10 November. Over the next four weeks one Tuesday wobbles, and the backup covers it the same morning. The coordinator spends about an hour on Tuesday problems instead of six. Maya books the GP visits for January.",
      levels: { person: 3, followThrough: 3, assumptions: 3 },
      flags: [],
    },
    {
      id: "campaign",
      text: "Run the GP campaign in December as planned: more clients will cover the cost of the missed visits.",
      feedback: "New referrals don’t restore Mrs Patel’s Tuesday, and onboarding two more people needs hours the team spends repairing visits.",
      outcome:
        "December’s visits bring four enquiries. The Tuesday roster fails twice more. One new client’s first week starts with a missed visit, and Mrs Patel cancels her book group.",
      levels: { person: 0, followThrough: 1, assumptions: 1 },
      flags: ["profitOverService"],
    },
    {
      id: "both",
      text: "Do both in December: the backup and the campaign.",
      feedback:
        "The backup is right, but its effect is still a forecast, and the team has about 6 hours of spare onboarding over three months against 8 the starts would need.",
      outcome: "The backup helps, but the coordinator is stretched between repairs and new starts, and one start is delayed by two weeks.",
      levels: { person: 2, followThrough: 2, assumptions: 1 },
      flags: [],
    },
    {
      id: "double",
      text: "Count the 4.5 freed hours as $180 of labour saved, and use the same hours to onboard more GP referrals.",
      feedback: "The same hours can be a labour cost avoided or onboarding capacity, not both. Choose one reading and say which.",
      outcome: "The plan counts the hours twice. When the backup prevents fewer misses than hoped, there’s neither the saving nor the capacity.",
      levels: { person: 2, followThrough: 1, assumptions: 0 },
      flags: ["doubleCount"],
    },
  ],
  later: {
    prompt: "Four weeks on. How does Maya read what she hears?",
    options: [
      {
        id: "measure",
        text: "Record Mrs Patel’s own words as the outcome, compare missed Tuesdays and recovery hours with the baseline month, and support the other client’s move through the provider’s transfer process.",
        feedback:
          "The person’s own view is the outcome that matters, checked against the figures. And a person choosing another provider is supported, not argued with: a safe transfer can be the right outcome.",
        levels: { person: 3, followThrough: 3 },
        flags: [],
      },
      {
        id: "save",
        text: "Count the other client’s move as a failed save, and call her to change her mind.",
        feedback: "Her visits were never missed, and it’s her choice. Pressure to stay isn’t service recovery.",
        levels: { person: 0, followThrough: 1 },
        flags: ["transferFailure"],
      },
      {
        id: "done",
        text: "Mark the backup a success: it was set up on time.",
        feedback: "Setting it up isn’t evidence it worked. Compare the next month with this one, and ask the people it was for.",
        levels: { person: 1, followThrough: 1 },
        flags: ["realised"],
      },
    ],
  },
  debrief:
    "In this fictional month, 5 of 100 scheduled visits (5%) were verified supplier misses. Two participants’ own cancellations, one booking error and one disputed visit stayed visible in their own lines, not in the supplier rate. Four of the five were one recurring problem with a supplier’s Tuesday-morning roster, and they took about 6 of the 6.5 hours of unique recovery work. Mrs Patel’s first missed Tuesday was restored on day 4; her second was still open on day 7, with a replacement booked that never came. A verified backup is the first operational action; what it may save in hours and money is a forecast to test. The team had little onboarding capacity until the gap was fixed.",
  followUp:
    "Four weeks after the backup started, missed Tuesday cleans are down from four to one, and that one was covered the same morning. Recovery work on Tuesdays fell from about 6 hours to about 1. Mrs Patel says Tuesdays are dependable again. The client who moved to another provider is settled with them, and the handoff went smoothly. Maya books her GP visits for January, with onboarding hours set aside.",
  placeholders: {
    trustCheck:
      "Next step for an individual person’s concern: the 28-Day Trust Check (Work Tools) · placeholder: not in the Hub yet. A real case is handled in the Operations and Quality systems, never in this calculator.",
    networkBuilder:
      "Next step for supplier readiness and quality: the Contractor Network Builder (Work Tools) · placeholder: not in the Hub yet. Until then, “Is this suburb ready for growth?” shows local supply.",
  },
  links: [
    {
      label: "Which referrals become active clients?",
      href: "/magazine/which-referrals-become-active-clients",
      why: "Maya’s GP practice cohort: what a referral push might bring, and how long starts take.",
    },
    {
      label: "Can we take on the next 10 clients?",
      href: "/magazine/can-we-take-on-the-next-10-clients",
      why: "Onboarding capacity week by week, before seeking more starts.",
    },
    {
      label: "Where does a coordinator’s week go?",
      href: "/magazine/where-does-a-coordinators-week-go",
      why: "The same work categories and cause tags, across the whole week.",
    },
    {
      label: "Is this suburb ready for growth?",
      href: "/magazine/is-this-suburb-ready-for-growth",
      why: "Approved, confirmed supplier capacity by service and time window.",
    },
  ],
  sources: [
    {
      title: "Support at Home service cancellations and no-shows",
      url: "https://www.health.gov.au/resources/publications/support-at-home-service-cancellations-and-no-shows",
    },
    {
      title: "Provider payment arrangements for Support at Home",
      url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/provider-payment-arrangements-for-support-at-home",
    },
    { title: "Managing Support at Home services", url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services" },
  ],
  rationale: {
    theme: "Repeat supplier no-shows and coordinator rework, with growth plans going ahead before service reliability is understood.",
    themeOwner: "",
    audience: "Care Partner business owners who manage coordinators and local supplier networks; coordinators and supplier managers using the fictional case.",
    behaviour:
      "Verify the cause of each missed visit, protect the person first, measure recovery to the restored service, count recovery work once, and compare a reliability action with a referral push on care, hours and money separately.",
    whyFit:
      "The decision turns on arithmetic that’s easy to get wrong (denominators, double counting, booked versus delivered) and on keeping a person’s missed support apart from money. A calculator inside a story shows both without real data.",
    reuse:
      "The Workload Lens’s categories and cause tags; the Referral Journey’s rates; Local Coverage’s service types; Maya’s referral and growth-readiness articles for the comparison.",
    systemFix: "A supplier’s Tuesday roster with no backup is an operational and supplier-management problem: learning alone won’t fix it.",
    measure:
      "Verified missed visits per 100 scheduled, time to restored service including open cases, repeat issue themes, recovery hours and participant-reported resolution, owned by Operations.",
    decision: "",
  },
  approval: {
    owner: "",
    operations: "",
    quality: "",
    clinical: "",
    supplier: "",
    finance: "",
    policy: "",
    partnerships: "",
    privacy: "",
    approvedOn: "",
    effectiveFrom: "",
    reviewBy: "",
  },
};

export const RELIABILITY_CASES: { id: string; label: string; data: ReliabilityLabData }[] = [
  { id: "missed-service", label: "Mrs Patel’s Tuesdays (Maya’s business, 100 visits in four weeks)", data: MISSED_SERVICE },
];

/** The fictional case, as the model tests read it. */
export const RELIABILITY_CASE = MISSED_SERVICE;
