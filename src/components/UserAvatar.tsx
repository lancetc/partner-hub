"use client";

import { cx } from "@/lib/format";

/** Someone's profile picture, or their initials when they haven't added one. */
export function UserAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "··";
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a small square picture from this hub's own avatar endpoint
    <img src={src} alt="" className={cx("rounded-full object-cover", className)} />
  ) : (
    <span aria-hidden className={cx("grid place-items-center rounded-full bg-navy font-mulish font-bold text-white dark:bg-teal-bright dark:text-navy", className)}>
      {initials}
    </span>
  );
}
