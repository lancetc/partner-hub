import type { IconName } from "./Icon";

/** `short`: the label under the icon on a phone, where space is tight. */
export const navItems: { href: string; label: string; short?: string; icon: IconName }[] = [
  { href: "/", label: "News", icon: "news" },
  { href: "/learning", label: "Learning", icon: "book" },
  { href: "/paths", label: "Learning paths", short: "Paths", icon: "route" },
  { href: "/challenges", label: "Challenges", icon: "flag" },
  { href: "/journey", label: "Journey map", short: "Journey", icon: "pin" },
  { href: "/resources", label: "Resources", icon: "folder" },
];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/news");
  // A single challenge lives at /challenge/[id].
  if (href === "/challenges") return pathname.startsWith("/challenge");
  // Webinars sit under Resources.
  if (href === "/resources") return pathname.startsWith("/resources") || pathname.startsWith("/webinars");
  return pathname.startsWith(href);
}
