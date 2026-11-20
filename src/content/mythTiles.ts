import type { Anchor, MythTileData } from "@/lib/myths";

/*
  The four seed tiles for Myth vs Reality (docs/myth-vs-reality.md), drafted from the PRD. They go into the tile
  library as drafts: none is approved, so none can be shown to learners or copied until its sign-off is recorded
  in the library. The sources name the exact public section; each still needs its internal Trilogy Care policy
  ID and the date someone checked it. The quotes are fictional composites, not real clients.
*/

const guidance = (document: string, section: string, url: string): Anchor => ({
  type: "guidance",
  document,
  section,
  publisher: "Australian Government Department of Health, Disability and Ageing",
  url,
  internalId: "",
  effective: "",
  verifiedOn: "",
});
const NO_SIGN_OFF = { owner: "", quality: "", operations: "", finance: "", clinical: "", communications: "", approvedOn: "" };
const PLACEHOLDERS = ["[Name]", "[Your name]"];
const BUDGETS = "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/individualised-budgets-for-support-at-home-participants";

export const SEED_TILES: { id: string; data: MythTileData }[] = [
  {
    id: "sah-quarterly-carryover",
    data: {
      quote: "Can’t I just roll over all my unused quarterly funds forever?",
      category: "budget",
      audiences: ["partner", "coordinator", "staff"],
      applicability: ["sah_ongoing", "sah_transitioned"],
      answer:
        "Your ongoing Support at Home budget is allocated each quarter. If some of that quarter’s funding is unused, a limited amount can move into the next quarter: up to the higher of $1,000 or 10% of your quarterly budget. Funds carried over from an old Home Care Package are a separate category and follow different rules. We’ll check your statement before quoting your available amount.",
      exception:
        "Someone who moved from a Home Care Package may have separate unspent HCP funds with different rules. Don’t combine those with ordinary quarterly carryover in one blanket answer.",
      checks: [
        "Are they receiving ongoing Support at Home services?",
        "Did they transition from a Home Care Package with separate unspent funds?",
        "What do their current statement and individualised budget show?",
      ],
      familyWording: "",
      anchors: [
        guidance(
          "Individualised budgets for Support at Home participants",
          "Managing unspent funds > Unspent quarterly budget; Unspent Home Care Package funds",
          BUDGETS,
        ),
        guidance(
          "Funding classifications for Support at Home",
          "Unspent HCP funds",
          "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-classifications-for-support-at-home",
        ),
      ],
      message: {
        subject: "Your Support at Home funds between quarters",
        body: "Hi [Name],\n\nThanks for asking about your unused funds. A limited amount of an ongoing Support at Home quarterly budget can carry over to the next quarter. The limit is the higher of $1,000 or 10% of that quarterly budget. If you have unspent funds from a previous Home Care Package, different rules may also apply to those funds. I can go through your latest statement with you and confirm what is available in your case.\n\nKind regards,\n[Your name]",
      },
      placeholders: PLACEHOLDERS,
      copyNote: "Only after you’ve checked their statement. It doesn’t state their balance.",
      funding: true,
      clinical: false,
      aiDraft: false,
      reviewDue: "",
      approval: NO_SIGN_OFF,
    },
  },
  {
    id: "sah-self-management-care-partner",
    data: {
      quote: "If I manage my own care, I don’t need a Care Partner.",
      category: "self-management",
      audiences: ["partner", "coordinator", "staff"],
      applicability: ["sah_ongoing"],
      answer:
        "You can manage parts of your services yourself, like choosing and booking some providers. Your registered provider still provides care management, so you keep a Care Partner. They check in with you, help keep your care plan and budget on track, and step in if your needs change. Together you agree which tasks you’ll handle and which we’ll handle, and we write that down.",
      exception: "",
      checks: ["What self-management arrangements are agreed and written in their care plan?", "Which tasks do they want to take on, or hand back?"],
      familyWording: "",
      anchors: [
        guidance(
          "Self-management by Support at Home participants",
          "About self-management; Mandatory care management",
          "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/self-management-by-support-at-home-participants",
        ),
      ],
      message: {
        subject: "Managing your own services, with your Care Partner",
        body: "Hi [Name],\n\nThanks for your question about managing your own care. You can manage parts of your Support at Home services yourself, and your Care Partner stays involved to help with your care plan, your budget and any changes in what you need. Let’s agree together which tasks you’d like to handle and which we’ll look after, and I’ll make sure that’s written into your care plan.\n\nKind regards,\n[Your name]",
      },
      placeholders: PLACEHOLDERS,
      copyNote: "",
      funding: false,
      clinical: false,
      aiDraft: false,
      reviewDue: "",
      approval: NO_SIGN_OFF,
    },
  },
  {
    id: "sah-self-managed-spending",
    data: {
      quote: "If I’m self-managed, I can use my Support at Home funds for anything I choose.",
      category: "services",
      audiences: ["partner", "coordinator", "staff"],
      applicability: ["sah_ongoing"],
      answer:
        "Self-management gives you more say over parts of your care, like who provides a service and when. The funding still pays for services that fit your assessed needs and the approved service list. You and your Care Partner agree the mix of services in your care plan and budget, so if there’s something you’d like, we can look at whether it fits and how to include it.",
      exception:
        "What’s approved depends on the person’s Notice of Decision and support plan, so the same request can have a different answer for someone else.",
      checks: ["What do their Notice of Decision and support plan say?", "Is the request on the approved service list, and in their care plan and budget?"],
      familyWording: "",
      anchors: [
        guidance(
          "Services under Support at Home",
          "Tailoring approved services; Self-management",
          "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/services-under-support-at-home",
        ),
      ],
      message: {
        subject: "Using your Support at Home funds when you self-manage",
        body: "Hi [Name],\n\nThanks for asking how you can use your funds while you self-manage. You have more choice over parts of your care, and the funding pays for services that match your assessed needs and the approved service list. If there’s something you’d like to add, I’m happy to look at whether it fits and how we could include it in your care plan and budget.\n\nKind regards,\n[Your name]",
      },
      placeholders: PLACEHOLDERS,
      copyNote: "",
      funding: true,
      clinical: false,
      aiDraft: false,
      reviewDue: "",
      approval: NO_SIGN_OFF,
    },
  },
  {
    id: "sah-care-plan-changes",
    data: {
      quote: "Once I sign my care plan, I can’t change it until next year.",
      category: "care-plan",
      audiences: ["partner", "coordinator", "staff"],
      applicability: ["sah_ongoing"],
      answer:
        "Your care plan isn’t locked in. It’s reviewed regularly, and it can be reviewed sooner whenever you ask, when your needs or preferences change, or when a new risk comes up. If the care plan changes, we look at your budget too, so the services and the money still line up. Tell your Care Partner what you’d like to change and we’ll start from there.",
      exception: "",
      checks: ["What would they like to change?", "Who needs to be involved in the review?"],
      familyWording: "",
      anchors: [
        guidance(
          "Care plans for Support at Home participants",
          "Reviewing care plans",
          "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/care-plans-for-support-at-home-participants",
        ),
      ],
      message: {
        subject: "Changing your care plan",
        body: "Hi [Name],\n\nThanks for asking about your care plan. It isn’t locked in until next year: it can be reviewed whenever you ask, or when your needs or preferences change. If we change your care plan, we’ll check your budget too. Let me know what you’d like to change and we can arrange a time to talk it through.\n\nKind regards,\n[Your name]",
      },
      placeholders: PLACEHOLDERS,
      copyNote: "",
      funding: false,
      clinical: false,
      aiDraft: false,
      reviewDue: "",
      approval: NO_SIGN_OFF,
    },
  },
];
