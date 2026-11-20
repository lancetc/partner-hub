import type { SandboxBlockData } from "@/lib/sandbox";

/*
  Budget Sandbox starter scenarios (docs/budget-sandbox.md). Margaret is fictional, and so are her prices and her
  assessed contribution rates: they come from a made-up Services Australia notice for the arithmetic, not from her
  pension status. Her funding is the real ongoing Classification 4 amount from the ruleset. The scenario starts as
  a draft with no sign-off.

  With every service at its fullest sensible level the plan is over her funding and over what she can afford, so the
  exercise is the trade-off, talked through with her, never "use it or lose it".
*/

const UNSIGNED = { owner: "", operations: "", finance: "", quality: "", accessibility: "", approvedOn: "" };

export const SANDBOX_CASES: { id: string; label: string; data: SandboxBlockData }[] = [
  {
    id: "margaret",
    label: "Margaret, Classification 4 (October to December 2026)",
    data: {
      title: "Margaret’s quarter",
      intro: "Build a care plan with Margaret for October to December, see what it costs and who pays which part, then explain it to her.",
      rulesetId: "sah-ongoing-2026-07",
      funding: { variant: "ongoing", classification: "4", fictionalQuarterlyCents: 1_000_000, startingCarryoverCents: 0 },
      quarter: { start: "2026-10-01", end: "2026-12-31" },
      participant: {
        name: "Margaret",
        about:
          "Margaret, 81, lives alone in her own home and is newly approved for ongoing Support at Home. She’s a part-pensioner. Her fictional Services Australia notice gives her assessed contribution rates.",
        needs: [
          "Standby help to shower safely, three mornings a week",
          "A nurse to review her medications each fortnight",
          "Help with heavier cleaning",
          "Getting to and from her Thursday social group",
        ],
        risks: ["She had a fall in the shower in August.", "She sometimes muddles her tablets."],
        schedule: "Mornings suit her best. Thursday is group day.",
        affordability: "She says she can manage about $66 a week towards her care.",
        affordabilityCents: 85800,
      },
      goals: [
        { id: "group", text: "I want to keep going to my Thursday group. It’s the best part of my week.", priority: true },
        { id: "safe", text: "I want to stay safe in my own home, especially in the shower.", priority: true },
        { id: "tablets", text: "I want my tablets sorted so I don’t get muddled.", priority: false },
        { id: "house", text: "I’d like the house kept the way I like it.", priority: false },
        { id: "garden", text: "My garden matters to me, but I can’t do the heavy work any more.", priority: false },
      ],
      rates: { clinical: 0, independence: 2000, everyday: 4000 },
      services: [
        {
          id: "personal-care",
          name: "Personal care: help to shower",
          purpose: "Standby help and prompting in the shower.",
          kind: "personal-care",
          category: "clinical",
          unit: "hour",
          unitPriceCents: 9000,
          unitsEach: 1,
          maxPerWeek: 7,
          approved: true,
          availability: "Mornings, any weekday.",
          goalIds: ["safe"],
        },
        {
          id: "nursing",
          name: "Nursing: medication review",
          purpose: "A registered nurse reviews her medications and blister pack.",
          kind: "",
          category: "clinical",
          unit: "visit",
          unitPriceCents: 13000,
          unitsEach: 1,
          maxPerWeek: 2,
          approved: true,
          availability: "Fortnightly visits.",
          goalIds: ["tablets", "safe"],
        },
        {
          id: "social-group",
          name: "Social support group",
          purpose: "Her Thursday group at the community centre.",
          kind: "",
          category: "independence",
          unit: "visit",
          unitPriceCents: 8000,
          unitsEach: 1,
          maxPerWeek: 2,
          approved: true,
          availability: "Thursdays, and a Monday group with a waitlist.",
          goalIds: ["group"],
        },
        {
          id: "transport",
          name: "Transport",
          purpose: "Rides to and from the group.",
          kind: "",
          category: "independence",
          unit: "trip",
          unitPriceCents: 4500,
          unitsEach: 1,
          maxPerWeek: 6,
          approved: true,
          availability: "Booked a week ahead.",
          goalIds: ["group"],
        },
        {
          id: "cleaning",
          name: "Domestic assistance: cleaning",
          purpose: "Vacuuming, bathroom and kitchen, changing the bed.",
          kind: "",
          category: "everyday",
          unit: "hour",
          unitPriceCents: 7200,
          unitsEach: 2,
          maxPerWeek: 3,
          approved: true,
          availability: "Weekly or fortnightly.",
          goalIds: ["house", "safe"],
        },
        {
          id: "garden-care",
          name: "Garden maintenance",
          purpose: "Mowing, weeding and clearing the heavy work.",
          kind: "",
          category: "everyday",
          unit: "hour",
          unitPriceCents: 6800,
          unitsEach: 1.5,
          maxPerWeek: 1,
          approved: true,
          availability: "Fortnightly at most.",
          goalIds: ["garden"],
        },
        {
          id: "respite",
          name: "Flexible respite",
          purpose: "Someone to stay with her for a few hours.",
          kind: "",
          category: "independence",
          unit: "hour",
          unitPriceCents: 8500,
          unitsEach: 3,
          maxPerWeek: 2,
          approved: false,
          availability: "Not in her approved care plan.",
          goalIds: ["group"],
        },
      ],
      explain: {
        prompt:
          "Margaret asks why she would contribute to help with cleaning but not to her personal care. Explain her projected weekly and quarterly costs, what is included, and what you will do if the plan no longer fits her needs or finances.",
        checklist: [
          {
            id: "clinical",
            label: "Personal care is Clinical Supports, with no contribution",
            anyOf: ["clinical", "no contribution", "nothing towards", "0%", "don’t pay", "don't pay", "doesn’t cost you", "doesn't cost you"],
          },
          {
            id: "everyday",
            label: "Cleaning is Everyday Living, at her assessed rate",
            anyOf: ["everyday living", "40%", "40 per cent", "assessed rate", "your notice", "services australia"],
          },
          {
            id: "amounts",
            label: "Her weekly or quarterly contribution",
            anyOf: ["a week", "per week", "weekly", "a quarter", "per quarter", "each quarter", "three months"],
          },
          {
            id: "delivered",
            label: "Contributions are for services as they’re delivered",
            anyOf: ["delivered", "when you get", "when you receive", "only pay for", "as you get"],
          },
          {
            id: "next",
            label: "A next step if it stops fitting: review the plan, an updated assessment, or hardship support",
            anyOf: ["review", "reassess", "new assessment", "updated assessment", "hardship", "change the plan", "talk again", "let me know"],
          },
        ],
        avoid: [
          { phrase: "use it or lose it", why: "Unspent funds have their own carryover rule, and care is never added just to use the budget." },
          { phrase: "part-pensioners pay", why: "A pension label doesn’t set a rate: Margaret’s rates come from her assessed notice." },
          { phrase: "less important", why: "The categories set the contribution, not how much a service matters to her." },
          { phrase: "government pays for everything", why: "Most of her services have a contribution at her assessed rate." },
        ],
      },
      illustrative: {
        lines: [
          { serviceId: "personal-care", perWeek: 3, unitsEach: 1, goalId: "safe", review: false },
          { serviceId: "nursing", perWeek: 0.5, unitsEach: 1, goalId: "tablets", review: false },
          { serviceId: "social-group", perWeek: 1, unitsEach: 1, goalId: "group", review: false },
          { serviceId: "transport", perWeek: 2, unitsEach: 1, goalId: "group", review: false },
          { serviceId: "cleaning", perWeek: 0.5, unitsEach: 2, goalId: "house", review: false },
        ],
        why: "One reviewed way, not the answer. It keeps both of the things Margaret said matter most: her shower help three mornings a week, and her Thursday group with transport. Cleaning moves to fortnightly and the garden waits this quarter, which she chose after talking it through (her son offered to help with the lawn). It fits her funding with a little to spare, and her contribution stays under the $66 a week she said she can manage. Another plan could keep the garden and reduce something else, if that’s what she prefers.",
      },
      debrief:
        "A good plan here starts with what Margaret wants and needs, then fits it to the funding with her, not for her. The categories decide what she contributes, not what matters. When a plan doesn’t fit, the options are a conversation, a care plan review, an updated assessment if her needs have changed, or hardship support if her contributions aren’t affordable.",
      approval: UNSIGNED,
    },
  },
];
