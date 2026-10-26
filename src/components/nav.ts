import type { IconName } from "./Icon";

export const navItems: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "News", icon: "news" },
  { href: "/learning", label: "Learning", icon: "book" },
  { href: "/webinars", label: "Webinars", icon: "play" },
  { href: "/onboarding", label: "My onboarding", icon: "list" },
  { href: "/resources", label: "Resources", icon: "folder" },
];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/news");
  return pathname.startsWith(href);
}
