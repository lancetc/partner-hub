"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { Icon } from "./Icon";

/** Fired after anything in the Inbox changes, so the number in the header catches up. */
export const INBOX_CHANGED = "inbox-changed";

/**
  The Inbox in the header: an in-tray rather than a bell, with how many actions are waiting (in red)
  or, when there are none, how many updates are unread.
*/
export function InboxButton() {
  const pathname = usePathname();
  const { data, reload } = useApi<{ action: number; updates: number; activity: number; total: number }>("/api/inbox/count");
  useEffect(() => {
    window.addEventListener(INBOX_CHANGED, reload);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener(INBOX_CHANGED, reload);
      window.removeEventListener("focus", reload);
    };
  }, [reload]);
  const actions = data?.action ?? 0;
  const unread = (data?.updates ?? 0) + (data?.activity ?? 0);
  const label = `Inbox${actions ? `, ${actions} ${actions === 1 ? "action" : "actions"} to do` : ""}${unread ? `, ${unread} unread` : ""}`;
  return (
    <Link
      href="/inbox"
      aria-label={label}
      title={label}
      aria-current={pathname === "/inbox" ? "page" : undefined}
      className={cx("relative inline-flex size-11 items-center justify-center rounded-full hover:bg-muted", pathname === "/inbox" && "bg-tealtint")}
    >
      <Icon name="inbox" className="size-5" />
      {(actions > 0 || unread > 0) && (
        <span
          aria-hidden
          className={cx(
            "absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full px-1 font-mulish text-[0.68rem] font-extrabold leading-5 ring-2 ring-bg",
            actions ? "bg-[#c7393e] text-white" : "bg-[#3cb8b9] text-[#102a43]",
          )}
        >
          {actions || unread}
        </span>
      )}
    </Link>
  );
}
