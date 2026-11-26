import type { IconName } from "../Icon";
import { spacedLearningOn } from "@/lib/features";

/** authorOnly: learning authors only. superadminOnly: superadmins only (People and permissions). */
export type AdminLink = { href: string; label: string; icon: IconName; description: string; authorOnly?: boolean; superadminOnly?: boolean };

/** Whether this person sees a link, from /api/me. */
export const linkAllowed = (l: AdminLink, me: { canAuthor?: boolean; isSuperadmin?: boolean } | null | undefined) =>
  (!l.authorOnly || Boolean(me?.canAuthor)) && (!l.superadminOnly || Boolean(me?.isSuperadmin));

/** Every content area, each described once; CONTENT_SECTIONS below puts them in groups by what they're for. */
export const CONTENT_LINKS: AdminLink[] = [
  {
    href: "/admin/lessons",
    label: "Topics",
    icon: "book",
    description: spacedLearningOn() ? "Write, edit and publish topics, and their spaced follow ups." : "Write, edit and publish topics.",
  },
  {
    href: "/admin/topic-intros",
    label: "Topic introductions",
    icon: "play",
    description: "Every topic’s video introduction: scripts, presenters, placeholders and video status, with bulk actions.",
    authorOnly: true,
  },
  {
    href: "/admin/approvals",
    label: "Approvals",
    icon: "circle-check",
    description: "Topics in review: what's waiting on you, and what's due a refresh.",
    authorOnly: true,
  },
  { href: "/admin/news", label: "News", icon: "news", description: "The stories on the homepage, with their pictures.", authorOnly: true },
  { href: "/admin/learning-paths", label: "Discovery Paths", icon: "route", description: "Learning paths: sets of topics in order, assigned to people." },
  {
    href: "/admin/learning-paths/introductions",
    label: "Path introductions",
    icon: "volume",
    description: "Every Discovery Path’s voiced introduction (the Discovery Exciter): scripts, audio, approval and listening, with bulk actions.",
    authorOnly: true,
  },
  {
    href: "/admin/discovery",
    label: "Discovery gaps",
    icon: "search",
    description: "What learners look for in My Discovery and don't find, and the topics they've asked for.",
    authorOnly: true,
  },
  {
    href: "/admin/problems",
    label: "Problem desk",
    icon: "target",
    description: "From a signal to a reasoned response: themes, diagnosis, what’s been tried, the learning plan and whether work changed.",
    authorOnly: true,
  },
  {
    href: "/admin/signal-room",
    label: "Signal Room",
    icon: "gauge",
    description: "One verified theme over time: its signals, the response, what learners did and the work measure, kept apart. Where a review is recorded.",
    authorOnly: true,
  },
  {
    href: "/admin/family-calls",
    label: "Tough Family Calls",
    icon: "phone",
    description:
      "Published family-call practice: participation, the five dimensions with denominators, approved critical patterns, content health and the review queue.",
    authorOnly: true,
  },
  {
    href: "/admin/referral-studio",
    label: "Local Referral Studio",
    icon: "chat",
    description:
      "The referral claim register and the outreach template’s approval, with practice, approved material use and the referral pathway kept apart, and an Excel export.",
    authorOnly: true,
  },
  {
    href: "/admin/hiring-runway",
    label: "Hiring Runway",
    icon: "people",
    description: "The fictional hiring labs’ participation, rubric means and misconceptions, and the Plan capacity tool’s use counts. No partner’s figures.",
    authorOnly: true,
  },
  {
    href: "/admin/challenges",
    label: "Challenges",
    icon: "flag",
    description: "Multi-day competitions: a mission a day, with points and leaderboards.",
    authorOnly: true,
  },
  { href: "/admin/webinars", label: "Webinars", icon: "play", description: "Recordings, their details, and the Webinars page.", authorOnly: true },
  {
    href: "/admin/elearning",
    label: "eLearning",
    icon: "layers",
    description: "SCORM courses from Articulate Rise and Storyline: import, preview, publish.",
    authorOnly: true,
  },
  {
    href: "/admin/magazine",
    label: "Magazine",
    icon: "magazine",
    description: "Longer guides to read at a desk: write and edit them on the page, then publish.",
    authorOnly: true,
  },
  {
    href: "/admin/activities",
    label: "Activity Catalogue",
    icon: "layers",
    description:
      "Every block, simulator, roleplay, calculator, Job Aid and Work Tool: where each is used, whether the AI builder may choose it and why, what needs attention, and the homepage showcase. With an Excel export.",
    authorOnly: true,
  },
  {
    href: "/admin/questions",
    label: "Questions",
    icon: "clipboard",
    description: "The Question Pool: every quiz and practice question, where it’s used, its source and who approved it. Review, flag and export.",
    authorOnly: true,
  },
  {
    href: "/admin/learning-guide",
    label: "Ava’s videos",
    icon: "play",
    description: "Ava, the care coordinator on the road: who she is, her ElevenLabs videos and where each plays, and withdrawing one when guidance changes.",
    authorOnly: true,
  },
  {
    href: "/admin/characters",
    label: "Characters and stories",
    icon: "people",
    description: "The fictional people who return across Topics and courses: their approved story, check-ins, Ava’s transmissions and Story Plans.",
    authorOnly: true,
  },
  {
    href: "/admin/lives",
    label: "Lives in Progress",
    icon: "heart",
    description:
      "The Digital Members’ ongoing stories: Character Bibles, the Story Bank, arcs and scheduled episodes, audio diaries, conversational memory and the report.",
    authorOnly: true,
  },
  {
    href: "/admin/member-chat",
    label: "Digital Member chat",
    icon: "chat",
    description: "Chatting with the fictional people on Community → Digital Members: the switch, limits, who takes chats and extra instructions.",
    authorOnly: true,
  },
  {
    href: "/admin/relay",
    label: "Ava Relay",
    icon: "chat",
    description:
      "Ava’s text relay on Magazine story pages: who used it, what the course’s own activities show, the work measure it answers to, and the Hub’s switch.",
    authorOnly: true,
  },
  {
    href: "/admin/images",
    label: "Image library",
    icon: "image",
    description: "Every picture authors can choose from: add, replace, crop, see where each is used, delete or restore.",
    authorOnly: true,
  },
  { href: "/admin/facts", label: "Facts", icon: "doc", description: "Rates, dates and numbers used across topics.", authorOnly: true },
  {
    href: "/admin/playbooks",
    label: "Job Aids",
    icon: "clipboard",
    description:
      "Work Tools: short, approved tools for a task, with a source, an owner and a review date. Placed in courses and Topics by reference, saved to Favourites.",
    authorOnly: true,
  },
  {
    href: "/admin/pocket-playbook",
    label: "Pocket Playbook",
    icon: "gauge",
    description:
      "The live call tools in the Companion Drawer: source health, what each owner still has to approve, use counts, withdrawal and the review decision.",
    authorOnly: true,
  },
  {
    href: "/admin/mentor-notes",
    label: "Mentor notes",
    icon: "mail",
    description: "Notes to a Younger Me: review contributed notes, approve edits, flag or withdraw cards.",
    authorOnly: true,
  },
  {
    href: "/admin/business-notes",
    label: "Business Field Notes",
    icon: "briefcase",
    description: "The principals-only business edition: story queue, privacy and commercial review, check-ins, moderation, playbook proposals and insights.",
    authorOnly: true,
  },
  {
    href: "/admin/case-threads",
    label: "Case threads",
    icon: "chat",
    description:
      "What Would You Do? case threads: one premoderation queue for the Magazine and Community, reports, endorsements, threads, verified coordinators and insights.",
    authorOnly: true,
  },
  {
    href: "/admin/myths",
    label: "Myth vs Reality",
    icon: "flashcards",
    description: "The client-question tile library: drafts, sign-off, versions, and flags from learners.",
    authorOnly: true,
  },
  {
    href: "/admin/comments",
    label: "Comments",
    icon: "chat",
    description: "What reviewers have said about topic cards, all in one place.",
    authorOnly: true,
  },
  { href: "/admin/content-review", label: "Content review", icon: "eye", description: "What's due for a check, and why.", authorOnly: true },
];

/**
  Content, by what each area is for (the owner, Nov 2026): thirty-odd areas in one list were hard to find your way round.
  Every content area belongs to exactly one group (adminNav.test.ts checks).
*/
export const CONTENT_SECTIONS: { title: string; hrefs: string[] }[] = [
  {
    title: "Learning content",
    hrefs: ["/admin/lessons", "/admin/magazine", "/admin/learning-paths", "/admin/challenges", "/admin/webinars", "/admin/elearning", "/admin/news"],
  },
  { title: "Voiced introductions and Ava", hrefs: ["/admin/topic-intros", "/admin/learning-paths/introductions", "/admin/learning-guide", "/admin/relay"] },
  {
    title: "Practice and tools",
    hrefs: [
      "/admin/activities",
      "/admin/family-calls",
      "/admin/referral-studio",
      "/admin/hiring-runway",
      "/admin/playbooks",
      "/admin/pocket-playbook",
      "/admin/myths",
      "/admin/questions",
    ],
  },
  {
    title: "Characters and stories",
    hrefs: ["/admin/characters", "/admin/lives", "/admin/member-chat", "/admin/mentor-notes", "/admin/business-notes", "/admin/case-threads"],
  },
  { title: "Library", hrefs: ["/admin/images", "/admin/facts"] },
  {
    title: "Review and insight",
    hrefs: ["/admin/approvals", "/admin/content-review", "/admin/comments", "/admin/discovery", "/admin/problems", "/admin/signal-room"],
  },
];

/** The admin areas, grouped. The sidebar, the phone menu and the overview page all use this list. */
export const ADMIN_GROUPS: { title: string; links: AdminLink[] }[] = [
  ...CONTENT_SECTIONS.map((g) => ({ title: g.title, links: g.hrefs.flatMap((h) => CONTENT_LINKS.filter((l) => l.href === h)) })),
  {
    title: "People & progress",
    links: [
      {
        href: "/admin/people",
        label: "People and permissions",
        icon: "people",
        description: "Everyone in the hub: give access, assign learning paths and topics, and follow their progress.",
        superadminOnly: true,
      },
      { href: "/admin/completions", label: "Completions", icon: "circle-check", description: "Who has finished each topic and path, by topic or by person." },
      {
        href: "/admin/onboarding",
        label: "Onboarding",
        icon: "checklist",
        description: "Setup documents waiting for review, where everyone is up to, and what each role has to do.",
      },
      {
        href: "/admin/capabilities",
        label: "Capability Insights",
        icon: "layers",
        description: "What each role needs people to be able to do, the evidence for it, and where it's missing.",
      },
      {
        href: "/admin/compliance",
        label: "Compliance register",
        icon: "shield",
        description: "Mandatory topics: who is trained, what they showed, and when they need refreshing.",
      },
      { href: "/admin/signoffs", label: "Sign-offs", icon: "pen", description: "Managers confirming people put learning into practice." },
      { href: "/admin/surveys", label: "Surveys", icon: "chat", description: "Feedback after topics and learning paths, and the results." },
      {
        href: "/admin/lives#report",
        label: "Lives in Progress report",
        icon: "heart",
        description: "Voluntary engagement with the Digital Members’ stories: views, listening, follows, conversations and returns. Counts only.",
        authorOnly: true,
      },
    ],
  },
  {
    title: "Communication",
    links: [
      {
        href: "/admin/email",
        label: "Email campaigns",
        icon: "news",
        description: "Monthly updates and newsletters to partners and coordinators.",
        authorOnly: true,
      },
      {
        href: "/admin/policies",
        label: "Policy acknowledgements",
        icon: "check",
        description: "Ask people to read an updated policy and confirm by a date, and see who has.",
        authorOnly: true,
      },
      { href: "/admin/outbox", label: "Notifications", icon: "info", description: "Emails and reminders sent, waiting or failed." },
      // Only while spaced learning is switched on (lib/features).
      ...(spacedLearningOn()
        ? [{ href: "/admin/schedules", label: "Spaced schedules", icon: "calendar" as const, description: "When follow ups go out after a topic." }]
        : []),
    ],
  },
];
