import type { IconName } from "./Icon";

/**
  The Community first, then in the order people use them: learn (Topics, then Discovery Paths: the learning paths, then eLearn: the
  Articulate courses), put it into practice
  (the Play games), and look things up (Resources, which holds the journey map, webinars, the glossary and
  Challenges). News is the homepage; the header leaves it out because the logo goes there.
  `short`: the label under the icon on a phone, where space is tight.
*/
export const navItems: { href: string; label: string; short?: string; icon: IconName }[] = [
  { href: "/", label: "News", icon: "news" },
  { href: "/community", label: "Community", icon: "people" },
  { href: "/topics", label: "Topics", icon: "book" },
  { href: "/paths", label: "Discovery Paths", short: "Discovery", icon: "route" },
  { href: "/elearning", label: "eLearn", icon: "monitor" },
  { href: "/play", label: "Play", icon: "home" },
  { href: "/resources", label: "Resources", icon: "folder" },
];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/news");
  // The games: Neighbourhood Explorer lives at /explorer, Care Conversations under /play.
  if (href === "/play") return pathname.startsWith("/play") || pathname.startsWith("/explorer");
  // Webinars, the journey map and Challenges (with a single challenge at /challenge/[id]) sit under Resources.
  if (href === "/resources")
    return ["/resources", "/webinars", "/journey", "/challenges", "/challenge/"].some((p) => pathname.startsWith(p));
  return pathname.startsWith(href);
}
