import type { IconName } from "../Icon";
import { spacedLearningOn } from "@/lib/features";

export type AdminLink = { href: string; label: string; icon: IconName; description: string; authorOnly?: boolean };

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
      { href: "/admin/learning-paths", label: "Learning paths", icon: "route", description: "Sets of topics in order, assigned to people." },
      {
        href: "/admin/challenges",
        label: "Challenges",
        icon: "flag",
        description: "Multi-day competitions: a mission a day, with points and leaderboards.",
        authorOnly: true,
      },
      { href: "/admin/webinars", label: "Webinars", icon: "play", description: "Recordings, their details, and the Webinars page.", authorOnly: true },
      { href: "/admin/facts", label: "Facts", icon: "doc", description: "Rates, dates and numbers used across topics.", authorOnly: true },
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
      { href: "/admin/completions", label: "Completions", icon: "circle-check", description: "Who has finished each topic and path, by topic or by person." },
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
