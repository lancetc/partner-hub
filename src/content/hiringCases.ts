import { MAYA_GROWTH, MAYA_INPUTS, MAYA_OPTIONS, type HiringLabData } from "@/lib/hiringRunway";

/*
  Hiring Runway Decision Lab starter cases (docs/hiring-runway-lab.md). Maya, her business, her agreement and every
  figure are invented. The model inputs reproduce the reference prototype's expected case: the current team crosses the
  85% planning threshold in Month 3; adding 0.6 FTE protects capacity with a lowest cash balance of $18,160; adding 1.0
  FTE also protects capacity but reaches −$1,670. They're story facts, not Trilogy Care pricing, staffing norms or a
  hiring recommendation, and the case starts as a draft with no sign-off.

  The new information (two weeks' leave in Month 4, and the agreement's payment run moving a month later from Month 4)
  is only shown after the learner's first decision. It puts every hiring plan below the reserve for a while, so the
  revision is a real judgement, not a reveal of the right answer.
*/

const UNSIGNED = {
  owner: "",
  finance: "",
  operations: "",
  partnerships: "",
  privacy: "",
  approvedOn: "",
};

export const HIRING_CASES: { id: string; label: string; data: HiringLabData }[] = [
  {
    id: "maya",
    label: "Maya’s next coordinator (35 participants, one coordinator)",
    data: {
      title: "Maya’s next coordinator",
      intro: "Maya’s business is growing faster than her team. Look at the evidence, compare the options, decide, then see what changes.",
      storyVersion: "maya-1",
      assessment: "formative",
      identity: {
        audience: "Independent Care Partner business owners and operators",
        objective: "Compare workload, operating result and cash before committing to a recruitment plan, and set a date to revisit the assumptions.",
        behaviour: "Plan recruitment from weighted workload and cash timing, with an interim plan if pressure comes first.",
        owner: "",
      },
      story: {
        character: "Maya",
        role: "Principal of a small independent Care Partner business (fictional)",
        situation:
          "Maya runs a small Care Partner business with one full-time coordinator, Sam. They support 35 active participants. Three new participants are starting each month and about one leaves, so onboarding and follow-up are piling up: callbacks are taking longer, and Sam has started working late.",
        dilemma: "Do I recruit now, wait, or change the way we work?",
        followUp: "Maya’s story continues four weeks later: did the coordinator join, did callbacks improve, and what did the slower payments do to cash?",
      },
      cards: [
        {
          id: "agreement",
          title: "Maya’s partner agreement (fictional), schedule 2",
          kind: "agreement",
          source: "Maya’s agreement with Trilogy Care, a fictional excerpt",
          establishes: "Her income: a flat monthly amount per active participant, paid a month in arrears. Nothing ties it to a participant’s budget.",
          body: [
            "Partner income: $360 a month for each active participant you coordinate.",
            "Payment: in arrears. Income for a month’s services is paid at the end of the following month.",
            "Already earned: $12,600 for last month’s services arrives in Month 1.",
            "This fee isn’t a share of any participant’s Support at Home budget or of the care-management allocation.",
          ].join("\n"),
          figures: [
            { key: "incomePerClient", value: 360 },
            { key: "paymentLagMonths", value: 1 },
            { key: "openingReceivables", value: 12_600 },
          ],
        },
        {
          id: "workload",
          title: "Sam’s workload diary, a four-week sample",
          kind: "workload",
          source: "Time diary kept by Sam, Maya’s coordinator (fictional)",
          establishes: "Work depends on the mix, not the head count: recurring hours by work band, onboarding, reviews, and Sam’s real available time.",
          body: [
            "Standard work: 20 participants, about 1.5 hours each a month.",
            "Higher work: 10 participants, about 2.5 hours each a month.",
            "Intensive work: 5 participants, about 4 hours each a month.",
            "Each new participant: about 3 hours of onboarding in their first month.",
            "Reviews and escalations: about 6 hours a month across the caseload.",
            "Sam is paid 38 hours a week. After leave about 90% of that time is available, and about 80% of the available time goes on participant work.",
            "Maya’s planning threshold: keep work under 85% of available hours, so there’s room for the unexpected.",
            "Intake lately: 3 new participants a month, and 1 leaves.",
          ].join("\n"),
          figures: [
            { key: "band.standard.count", value: 20 },
            { key: "band.standard.hours", value: 1.5 },
            { key: "band.higher.count", value: 10 },
            { key: "band.higher.hours", value: 2.5 },
            { key: "band.intensive.count", value: 5 },
            { key: "band.intensive.hours", value: 4 },
            { key: "onboardingHours", value: 3 },
            { key: "reviewHours", value: 6 },
            { key: "paidWeeklyHours", value: 38 },
            { key: "availability", value: 0.9 },
            { key: "productive", value: 0.8 },
            { key: "threshold", value: 0.85 },
            { key: "newPerMonth", value: 3 },
            { key: "exitsPerMonth", value: 1 },
          ],
        },
        {
          id: "cash",
          title: "Costs and cash sheet",
          kind: "cash",
          source: "Maya’s monthly cost sheet and bank balance (fictional)",
          establishes: "What a coordinator really costs, what Maya pays herself, and the cash she has and wants to keep.",
          body: [
            "A coordinator FTE, loaded (pay, super and on-costs): $7,550 a month.",
            "Software and travel: $20 a month per participant.",
            "Fixed overhead: $1,250 a month.",
            "Maya’s own pay: $2,500 a month.",
            "Recruiting and setting up a new coordinator: about $4,000, paid when recruitment starts. A new coordinator takes about two months to find and two more to get up to speed, and is paid in full from the day they join.",
            "Cash in the bank today: $26,720. Maya wants to keep at least $10,000 in reserve.",
          ].join("\n"),
          figures: [
            { key: "staffCostPerFte", value: 7_550 },
            { key: "variableCostPerClient", value: 20 },
            { key: "fixedOverhead", value: 1_250 },
            { key: "ownerPay", value: 2_500 },
            { key: "openingCash", value: 26_720 },
            { key: "reserve", value: 10_000 },
          ],
        },
      ],
      inputs: { ...MAYA_INPUTS, currentFte: 1 },
      editable: [
        { key: "newPerMonth", min: 1, max: 6, step: 1 },
        { key: "threshold", min: 0.75, max: 0.95, step: 0.05 },
        { key: "staffCostPerFte", min: 6_500, max: 9_000, step: 50 },
        { key: "paymentLagMonths", min: 0, max: 3, step: 1 },
      ],
      options: MAYA_OPTIONS,
      growth: MAYA_GROWTH,
      actions: {
        temporary: { label: "Temporary capacity: a contract coordinator for 20 hours a month, Months 3 to 5", fromMonth: 3, months: 3, hours: 20, cost: 1_700 },
        pace: { label: "Pace intake: two new participants a month instead of three, from Month 3", fromMonth: 3, extraNew: -1 },
        workflow: {
          label: "Validate a workflow change: 15% fewer recurring hours from Month 3, $2,500 to set up",
          fromMonth: 3,
          share: 0.15,
          setupCost: 2_500,
        },
      },
      event: {
        title: "Two emails in the same week",
        story: [
          "Three weeks after Maya made her plan, two emails arrive.",
          "Sam has two weeks’ carer’s leave approved for Month 4. Maya agreed straight away: Sam’s mother is having surgery.",
          "And the (fictional) agreement administrator writes that the payment run is moving. From Month 4, each payment arrives a month later than before. Nothing is lost, but it comes later.",
        ].join("\n\n"),
        source: "Sam’s leave request, and the fictional agreement administrator’s email",
        adjustments: [
          { kind: "leave", month: 4, hours: 60.8 },
          { kind: "paymentDelay", fromMonth: 4, extraMonths: 1 },
        ],
        changed: [
          "Coordinator time in Month 4: about 61 fewer participant-work hours (two weeks of Sam’s leave).",
          "Payment timing: payments due from Month 4 arrive one month later. Income earned doesn’t change; cash received does.",
        ],
        keywords: ["leave", "sam", "payment", "later", "delay", "receipt", "cash", "reserve"],
      },
      feedback: {
        dimensions: {
          workload: {
            keywords: ["hours", "onboarding", "threshold", "workload", "capacity", "intensive", "review"],
            strong:
              "You worked from hours, not head count. The current team crosses the planning threshold in {none.firstPressure}, because onboarding and the intensive work add up faster than the participant count suggests.",
            partly:
              "You’re close. Check the workload diary: the current team crosses the threshold in {none.firstPressure} once onboarding and intensive work are counted, before the head count looks dramatic.",
            weak: "Have another look at the workload. With onboarding and review work counted, the current team is over the planning threshold from {none.firstPressure}.",
          },
          income: {
            keywords: ["agreement", "360"],
            strong: "You used the fictional agreement’s $360 a month per active participant, and kept it separate from public care-management funding.",
            partly: "You used the agreement’s figure. Open the agreement itself next time: it also says when income is paid, which matters for cash.",
            weak: "Maya’s income comes from her own agreement, not from public Support at Home funding. Care-management funding is pooled at the registered provider; it isn’t her fee.",
          },
          economics: {
            keywords: ["cash", "receipt", "reserve", "payment", "lag", "bank", "operating result", "margin", "salary", "owner"],
            strong:
              "You separated what’s earned from what’s received. Your plan’s lowest cash is {plan.lowestCash} in Month {plan.lowestCashMonth}, against a reserve of {reserve}, and you said how Maya would handle it.",
            partly:
              "Part of the picture. Your plan’s lowest cash is {plan.lowestCash} in Month {plan.lowestCashMonth}, against Maya’s {reserve} reserve. Say how the business gets through that month.",
            weak: "Look at cash, not just the operating result: your plan’s lowest cash is {plan.lowestCash} in Month {plan.lowestCashMonth}. A hire is paid in full from the day they join, before the income catches up.",
          },
          timing: {
            keywords: ["lead", "ramp", "month", "interim", "temporary"],
            strong:
              "Your timing allows for the search and the ramp. Pressure arrives in {none.firstPressure}, so a hire starting now is only just in time, and you covered the gap. Your plan has {plan.monthsAbove} months over the threshold.",
            partly:
              "Your plan leaves {plan.monthsAbove} months over the threshold. With two months to recruit and two to ramp, what covers Maya until the new person is up to speed?",
            weak: "Pressure arrives in {none.firstPressure}, and a hire takes about four months to be fully productive. Without an interim plan, your plan has {plan.monthsAbove} months over the threshold.",
          },
          protection: {
            keywords: ["callback", "follow-up", "follow up", "participant", "staff", "sam", "burnout", "overtime", "monitor", "check", "review"],
            strong: "You protected participants and Sam: you named what you’d watch and how you’d know whether the plan is working.",
            partly: "You thought about protection. Make it concrete: which measure would tell Maya the plan isn’t working, and when would she check?",
            weak: "Name the guardrails: what happens to callbacks and follow-ups while Sam is over capacity, and how would Maya notice?",
          },
          revision: {
            keywords: ["changed", "because", "instead", "keep", "still", "revisit"],
            strong: "You revised with the new information in view: you said what changed and named an assumption to revisit.",
            partly: "You updated the plan. Say plainly what the leave and the slower payments changed, and which assumption Maya should check next.",
            weak: "The new information changes the picture. Say what it changed in your plan, or why your plan still stands, and what Maya should revisit.",
          },
        },
        alternatives: [
          {
            id: "recruit-now",
            label: "Recruit 0.6 FTE now, and monitor",
            plan: { recruit: true, optionId: "add-06", startMonth: 1, temporary: false, pace: false, workflow: false, monitor: true },
            why: "Protects capacity through Sam’s leave. Cash dips below Maya’s reserve from Month 4 while the payments catch up, so she’d confirm the new payment dates with the administrator and agree how to carry the dip before committing.",
          },
          {
            id: "steady",
            label: "Pace intake, add temporary help and test a workflow change; revisit recruitment",
            plan: { recruit: false, optionId: "", startMonth: 1, temporary: true, pace: true, workflow: true, monitor: true },
            why: "Keeps cash above the reserve. Workload still goes over the threshold in two months, and the workflow saving is unproven, so it needs close monitoring and a firm date to decide on recruitment.",
          },
        ],
        nextStep: "Next: the Job Aid on planning a coordinator’s first 90 days, and Maya’s check-in four weeks on.",
      },
      governance: {
        signal: "",
        whySimulation: "A changing business case makes the trade-offs between capacity, margin and cash visible, without anyone exposing their own figures.",
        whyNow: "The gap is judgement under uncertainty, not recall of a policy.",
        alternatives: "Existing leadership content, a Job Aid, process repair, a Portal fix, or direct operational support.",
        evaluation: "Decision quality and misconception trends by rubric dimension, alongside separately owned work measures.",
        measure: "",
        ...UNSIGNED,
        effectiveFrom: "",
        reviewBy: "",
        sources: [
          {
            title: "Ongoing Support at Home classification levels",
            url: "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/ongoing-home-support-classification-levels-assignment",
          },
          {
            title: "Funding for Support at Home care management",
            url: "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-for-support-at-home-care-management",
          },
        ],
      },
    },
  },
];
