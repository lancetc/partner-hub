import type { IconName } from "../Icon";
import { spacedLearningOn } from "@/lib/features";

/** authorOnly: learning authors only. superadminOnly: superadmins only (People and permissions). */
export type AdminLink = { href: string; label: string; icon: IconName; description: string; authorOnly?: boolean; superadminOnly?: boolean };

/** Whether this person sees a link, from /api/me. */
export const linkAllowed = (l: AdminLink, me: { canAuthor?: boolean; isSuperadmin?: boolean } | null | undefined) =>
  (!l.authorOnly || Boolean(me?.canAuthor)) && (!l.superadminOnly || Boolean(me?.isSuperadmin));

/** The admin areas, grouped. The sidebar, the phone menu and the overview page all use this list. */
export const ADMIN_GROUPS: { title: string; links: AdminLink[] }[] = [
  {
    title: "Content",
    links: [
      {
        href: "/admin/lessons",
        label: "Topics",
        icon: "book",
        description: spacedLearningOn() ? "Write, edit and publish topics, and their spaced follow ups." : "Write, edit and publish topics.",
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
        href: "/admin/questions",
        label: "Questions",
        icon: "clipboard",
        description: "The Question Pool: every quiz and practice question, where it’s used, its source and who approved it. Review, flag and export.",
        authorOnly: true,
      },
      {
        href: "/admin/learning-guide",
        label: "AI Learning Guide",
        icon: "play",
        description: "The Hub’s one recorded, scripted AI guide: who it is, everywhere it’s used, and withdrawing a recording when guidance changes.",
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
        description:
          "The principals-only business edition: story queue, privacy and commercial review, check-ins, moderation, playbook proposals and insights.",
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
    ],
  },
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
      { href: "/admin/outbox", label: "Notifications", icon: "info", description: "Emails and reminders sent, waiting or failed." },
      // Only while spaced learning is switched on (lib/features).
      ...(spacedLearningOn()
        ? [{ href: "/admin/schedules", label: "Spaced schedules", icon: "calendar" as const, description: "When follow ups go out after a topic." }]
        : []),
    ],
  },
];
