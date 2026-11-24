import type { MentorNoteData } from "@/lib/notes";
import { cleanBusiness, type BusinessContext, type ChapterData } from "@/lib/businessNotes";

/*
  Development seeds for Care Partner Business Field Notes (docs/business-field-notes.md). Every card, check-in and
  thread post here is a FICTIONAL ILLUSTRATION for building and testing: not a real Care Partner's story, quote,
  testimonial or business result. Replace them with consented, reviewed contributions before launch.

  Character canon, kept consistent:
  - Amira is the Care Partner principal from Leila's Monday (content/oneDayCases.ts). Her card is the PRD's first-hire
    example. It doesn't name the coordinator she hired, and adds nothing about her business that Leila's Monday
    contradicts.
  - Maya is the principal in Toowoomba from the Hiring Runway and Workload Lens (content/hiringCases.ts,
    content/workloadCases.ts): about 35 people, one full-time coordinator. Her card is about noticing workload
    signals, and doesn't say whether she has hired since. Her coordinator isn't named on the card.
  - Tegan is new, and fictional.

  They go into the library waiting for review, like the general seeds, so nothing reaches a principal until an
  editor has run the review steps. Sign-offs are left empty.
*/

const biz = (b: Partial<BusinessContext>): BusinessContext =>
  cleanBusiness({ takesQuestions: true, display: "first", consents: { crossFormat: true }, historical: false, ...b });

const card = (
  x: Omit<MentorNoteData, "illustrative" | "consent" | "policyIds" | "audiences" | "topics" | "badge" | "rank" | "experience" | "communityPostId">,
) =>
  ({
    badge: "CP",
    rank: "10",
    experience: "",
    communityPostId: "",
    policyIds: [],
    audiences: [],
    topics: [],
    ...x,
    illustrative: true,
    consent: { audience: true, attribution: true },
  }) satisfies MentorNoteData;

export const BUSINESS_SEEDS: { id: string; data: MentorNoteData; chapters: ChapterData[] }[] = [
  {
    id: "bfn-amira-first-hire",
    data: card({
      hook: "“I hired a coordinator and still ended every day answering the calls.”",
      scenario:
        "Amira had enough work to justify another person. She thought the hire alone would create capacity. In the first month, every difficult decision still came back to her.",
      note: "I was counting the clients I had, not the decisions only I knew how to make. I wrote down the recurring exceptions, gave the new coordinator a clear escalation route and observed two real handovers. It took longer than I expected. The lesson was to give someone a workable scope and support, then check how the work actually flows.",
      phrase: "Identify one decision you still take back from a new hire, define the handover and observe the next two occurrences.",
      authorName: "Amira (fictional)",
      authorRole: "Care Partner principal",
      policyNote: "",
      business: biz({
        number: 1,
        collection: "starting",
        stage: "first_hire",
        theme: "first-hire",
        serviceModel: "home",
        era: "Her first coordinator hire",
        context: "A home-based Care Partner business",
        decision: "Her first coordinator had started, and every hard decision still came back to her. What should change first?",
        choice: "Would you add another hire, change the handover, or slow new intake while you investigate?",
        believed: "That a second person would create capacity on their own, as soon as they started.",
        tried: "Writing down the recurring exceptions, agreeing a clear escalation route, and observing two real handovers.",
        failed: "A shared inbox with no decision owner. Telling the coordinator to “use initiative” without agreeing when to escalate.",
        tradeoff: "Observing handovers took her time in the very month she was short of it, and new intake slowed a little while they sorted it out.",
        claims: [{ text: "Enough work to justify another person", basis: "reported", source: "" }],
        toolIds: ["hiring-runway", "first-100-days"],
        businessLabel: "fictional illustration",
      }),
    }),
    chapters: [
      {
        title: "Eight weeks later",
        dated: "2026-09-07",
        whatChanged:
          "The callbacks improved, but the new coordinator still waited for me on invoice exceptions. We revised the escalation guide and shadowed one statement call together.",
        nowThink: "I would now plan that support before the hire starts.",
        correction: false,
        correctionNote: "",
      },
    ],
  },
  {
    id: "bfn-maya-workload-signals",
    data: card({
      hook: "“I thought my coordinator would tell me when the load was too much.”",
      scenario:
        "Maya’s business supports about 35 people with one full-time coordinator. Callbacks were taking longer and her coordinator had started working late, but nobody had said the week was full.",
      note: "I waited to be told, and the people who work hardest are often the last to say so. Now I look at the signals myself: callbacks, late finishes, rework. Then I sit down with my coordinator and look at where the week actually goes before I decide anything.",
      phrase: "Pick one signal you can see without asking (callback times, late finishes or rework) and look at it with your coordinator this week.",
      authorName: "Maya (fictional)",
      authorRole: "Care Partner principal",
      policyNote: "",
      business: biz({
        number: 2,
        collection: "team",
        stage: "growing",
        theme: "delegation",
        serviceModel: "",
        era: "With one full-time coordinator",
        context: "Regional Queensland",
        decision: "The signs of an overloaded week were there, but nobody had raised it. Whose job was it to notice?",
        choice: "Would you ask how the week feels, look at where the hours go, or start recruiting now?",
        believed: "That a capable coordinator would raise it the moment the workload became too much.",
        tried:
          "Looking at callback times and late finishes, then going through a typical week together to see which hours were planned work and which were rework.",
        failed: "Asking “are you OK for time?” in passing. The answer was always yes.",
        tradeoff: "Looking properly took an afternoon they didn’t feel they had, and it raised a hiring question she wasn’t ready to answer.",
        claims: [{ text: "About 35 people supported with one full-time coordinator (approximate)", basis: "reported", source: "" }],
        toolIds: ["workload", "hiring-runway", "intake"],
        businessLabel: "fictional illustration",
      }),
    }),
    chapters: [],
  },
  {
    id: "bfn-tegan-referrals-before-cover",
    data: card({
      hook: "“I said yes to a referral push before I had the contractors to cover it.”",
      scenario:
        "Tegan’s local relationships were finally working: a GP practice and a community group started sending referrals. Her contractor bench in the area was thin, and two new starts waited longer than she’d said they would.",
      note: "I measured success by referrals, and the people waiting measured it by the first visit. I asked the referrers to slow down while I built cover, and I told families honestly how long a start would take. Growing a little later was better than disappointing people early.",
      phrase: "Before you accept the next referral in a new area, check you could cover the first two weeks of visits.",
      authorName: "Tegan (fictional)",
      authorRole: "Care Partner principal",
      policyNote: "",
      business: biz({
        number: 3,
        collection: "running",
        stage: "growing",
        theme: "not-growing",
        serviceModel: "home",
        era: "Her third year in business",
        context: "A home-based business growing into a new area",
        decision: "Referrals were arriving faster than she could cover the visits. Keep saying yes, or slow down?",
        choice: "Would you keep the referrals coming, pause them, or build cover first?",
        believed: "That more referrals were always good news, and cover would follow.",
        tried: "Checking contractor coverage in the area before taking more referrals, and telling referrers when she could and couldn’t start someone well.",
        failed: "Promising start dates from the referral, not from confirmed cover.",
        tradeoff: "Slowing referrals felt like turning work away, and one referrer went elsewhere for a while.",
        claims: [{ text: "Two new starts waited longer than expected", basis: "reported", source: "" }],
        toolIds: ["coverage", "contractor-network", "referral"],
        businessLabel: "fictional illustration",
      }),
    }),
    chapters: [],
  },
];

/** The illustrative Q&A on Amira's card, from the PRD: a question, the fictional contributor's answer and a peer with a different model. */
export const BUSINESS_SEED_POSTS: { noteId: string; key: string; parent: string; label: "question" | "contributor" | "peer"; by: string; body: string }[] = [
  {
    noteId: "bfn-amira-first-hire",
    key: "q1",
    parent: "",
    label: "question",
    by: "A principal (fictional example)",
    body: "How did you decide which decisions to delegate first?",
  },
  {
    noteId: "bfn-amira-first-hire",
    key: "a1",
    parent: "q1",
    label: "contributor",
    by: "Amira (fictional)",
    body: "I started with the ones that came back to me most often and had a clear right answer once you knew the steps, like rescheduling a service. The judgement calls I kept for longer, and we did those together first.",
  },
  {
    noteId: "bfn-amira-first-hire",
    key: "a2",
    parent: "q1",
    label: "peer",
    by: "Another principal (fictional example)",
    body: "We run from a small local hub, so we did it the other way round: the coordinator took the in-person conversations first and I kept the phone exceptions. It depends where the decisions arrive.",
  },
];
