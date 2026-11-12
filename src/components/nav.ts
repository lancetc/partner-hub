import type { IconName } from "./Icon";

/**
  The Community first, then in the order people use them: learn (topics, then paths), put it into practice
  (the Play game), and look things up (Resources, which holds the journey map, challenges, webinars, the
  glossary and Care Conversations). News is the homepage; the header leaves it out because the logo goes there.
  `short`: the label under the icon on a phone, where space is tight.
*/
export const navItems: { href: string; label: string; short?: string; icon: IconName }[] = [
  { href: "/", label: "News", icon: "news" },
  { href: "/community", label: "Community", icon: "people" },
  { href: "/learning", label: "Learning", icon: "book" },
  { href: "/paths", label: "Learning paths", short: "Paths", icon: "route" },
  { href: "/play", label: "Play", icon: "home" },
  { href: "/resources", label: "Resources", icon: "folder" },
];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/news");
  // The games: Neighbourhood Explorer lives at /explorer, Care Conversations under /play.
  if (href === "/play") return pathname.startsWith("/play") || pathname.startsWith("/explorer");
  // Webinars, the journey map and challenges (and a single challenge, at /challenge/[id]) sit under Resources.
  if (href === "/resources")
    return pathname.startsWith("/resources") || pathname.startsWith("/webinars") || pathname.startsWith("/journey") || pathname.startsWith("/challenge");
  return pathname.startsWith(href);
}
