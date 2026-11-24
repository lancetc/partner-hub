import type { IconName } from "./Icon";

export type NavItem = { href: string; label: string; short?: string; icon: IconName; description?: string };

/**
  The main menu, grouped so it stays short: Learn (a menu of the five ways to learn), the Community, and
  Resources (the journey map, webinars, the glossary, templates and contacts). News is the homepage; the
  header leaves it out because the logo goes there, and the phone bar keeps it.
  `short`: the label under the icon on a phone, where space is tight.
*/
export const navItems: NavItem[] = [
  { href: "/", label: "News", icon: "news" },
  { href: "/community", label: "Community", icon: "people" },
  { href: "/resources", label: "Resources", icon: "folder" },
];

/**
  Work Tools (docs/job-aids.md): the library of Job Aids, for the task in front of you. It has no item in the menus:
  Favourites covers it, and it is also the first thing on the Resources page, in site search and on the Hub home.
*/
export const workToolsItem: NavItem = {
  href: "/tools",
  label: "Work Tools",
  short: "Tools",
  icon: "clipboard",
  description: "Job Aids for your role: short, approved checklists and prompts for a task at work.",
};

/** The header's items after Learn: the Community and Resources. News is the logo. */
export const headerItems: NavItem[] = navItems.filter((item) => item.href !== "/");

/** Whether a menu item is current. Work Tools has no item, so its pages light up Resources, where it lives. */
export const isActiveInBar = (pathname: string, href: string) => isActive(pathname, href) || (href === "/resources" && isActive(pathname, workToolsItem.href));

/**
  A way to learn in the Learn menu: a short tagline, a picture on a coloured tile, and the longer description.
  The picture is an emoji, or "phone" for a drawn phone (Windows draws the phone emoji as a tablet).
*/
export type LearnItem = NavItem & { tagline: string; emoji: string; tile: string };

/**
  The five ways to learn, in the Learn menu, and My Discovery, a learner's own paths. Each has a tagline under
  its name, an emoji on a tile of its own colour (light and dark), and a longer description for screen readers.
  The set paths are Discovery Paths, the same name as their page.
*/
export const learnItems: LearnItem[] = [
  {
    href: "/topics",
    label: "Topics",
    icon: "book",
    tagline: "Quick lessons for busy days",
    emoji: "phone",
    tile: "bg-[#d6efec] dark:bg-[#1d4a4a]",
    description: "Short and practical: 10-minute lessons to fit between visits.",
  },
  {
    href: "/paths",
    label: "Discovery Paths",
    icon: "route",
    tagline: "Follow a guided journey",
    emoji: "🧭",
    tile: "bg-[#e3e9f8] dark:bg-[#27396a]",
    description: "Step by step: topics in order, ending in a certificate.",
  },
  {
    href: "/magazine",
    label: "Magazine",
    icon: "magazine",
    tagline: "Explore ideas in depth",
    emoji: "💻",
    tile: "bg-[#fbe6db] dark:bg-[#5a3a2c]",
    description: "Take your time: articles, in-depth guides and full courses.",
  },
  {
    href: "/play",
    label: "Play",
    icon: "play",
    tagline: "Practise real decisions",
    emoji: "🎮",
    tile: "bg-[#ebe3f7] dark:bg-[#40335f]",
    description: "Learn by doing: games to practise real situations.",
  },
  {
    href: "/challenges",
    label: "Challenges",
    icon: "flag",
    tagline: "Learn together, every day",
    emoji: "🏆",
    tile: "bg-[#f8ecc8] dark:bg-[#574a22]",
    description: "Five-day team competitions, one mission a day.",
  },
  {
    href: "/discovery",
    label: "My Discovery",
    icon: "target",
    tagline: "Make learning your own",
    emoji: "✨",
    tile: "bg-[#dff0ea] dark:bg-[#22493d]",
    description: "Your own path: set a goal and the Hub suggests what to learn.",
  },
];

/** Whether any of the ways to learn is the current page, for the Learn button. */
export const inLearn = (pathname: string) => learnItems.some((item) => isActive(pathname, item.href));

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/news");
  // The games: Neighbourhood Explorer lives at /explorer, Care Conversations under /play.
  if (href === "/play") return pathname.startsWith("/play") || pathname.startsWith("/explorer");
  // The eLearning courses live in Magazine; a course's player is at /elearning/[id].
  if (href === "/magazine") return pathname.startsWith("/magazine") || pathname.startsWith("/elearning");
  // A single challenge is at /challenge/[id].
  if (href === "/challenges") return pathname.startsWith("/challenges") || pathname.startsWith("/challenge/");
  // Webinars and the journey map sit under Resources.
  if (href === "/resources") return ["/resources", "/webinars", "/journey"].some((p) => pathname.startsWith(p));
  return pathname.startsWith(href);
}
