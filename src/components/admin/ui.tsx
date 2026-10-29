"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useApi, type Me } from "@/lib/api";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { ADMIN_GROUPS } from "./adminNav";

export const btn = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-45",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-4 font-medium hover:bg-muted disabled:opacity-45",
  quiet:
    "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-muted hover:bg-muted hover:text-ink disabled:opacity-40",
  danger: "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-danger/60 px-4 font-medium hover:bg-danger/10",
};

export const input = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[0.98rem]";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1", className)}>
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mulish text-xs font-bold",
        tone === "good" && "border-success bg-success/10",
        tone === "warn" && "border-gold bg-gold/15",
        tone === "bad" && "border-danger bg-danger/10",
        tone === "info" && "border-navy-medium/40 bg-muted dark:border-line-strong",
        tone === "neutral" && "border-line-strong text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}

export const statusTone = (s: string) =>
  s === "published" || s === "approved" || s === "accepted" || s === "delivered"
    ? "good"
    : s === "in_review" || s === "queued" || s === "sending"
      ? "warn"
      : s === "withdrawn" || s === "failed" || s === "unknown"
        ? "bad"
        : "neutral";

export const statusText: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  superseded: "Superseded",
  withdrawn: "Withdrawn",
  approved: "Approved",
  queued: "Queued",
  sending: "Sending",
  accepted: "Provider accepted",
  delivered: "Delivered (confirmed)",
  failed: "Failed",
  unknown: "Unknown: reconcile",
  not_configured: "Not sent: provider not configured",
  cancelled: "Cancelled",
};

const visible = (canAuthor: boolean | undefined) =>
  ADMIN_GROUPS.map((g) => ({ ...g, links: g.links.filter((l) => !l.authorOnly || canAuthor) })).filter((g) => g.links.length);

function NavLinks({ pathname, canAuthor, onPick }: { pathname: string; canAuthor?: boolean; onPick?: () => void }) {
  return (
    <>
      <Link
        href="/admin"
        onClick={onPick}
        aria-current={pathname === "/admin" ? "page" : undefined}
        className={cx(
          "flex min-h-10 items-center gap-2.5 rounded-xl px-3 font-medium",
          pathname === "/admin" ? "bg-tealtint text-ink" : "text-ink-muted hover:bg-muted hover:text-ink",
        )}
      >
        <Icon name="home" className="size-4 shrink-0" /> Overview
      </Link>
      {visible(canAuthor).map((g) => (
        <div key={g.title} className="mt-4">
          <p className="mb-1 px-3 font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-ink-muted">{g.title}</p>
          {g.links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={onPick}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-10 items-center gap-2.5 rounded-xl px-3 font-medium",
                  active ? "bg-tealtint text-ink" : "text-ink-muted hover:bg-muted hover:text-ink",
                )}
              >
                <Icon name={l.icon} className={cx("size-4 shrink-0", active && "text-action")} /> {l.label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

/** Administration frame. Access is enforced by the API; this only hides links. */
export function AdminShell({ title, children, back }: { title: string; children: React.ReactNode; back?: { href: string; label: string } }) {
  const pathname = usePathname();
  const me = useApi<Me>("/api/me").data;
  const [menu, setMenu] = useState(false);
  const current = ADMIN_GROUPS.flatMap((g) => g.links).find((l) => pathname.startsWith(l.href));
  // Editors (pages with a Back link) keep the whole width; lists and reports have the menu beside them.
  const withMenu = !back;
  return (
    // Admin stays in English even when someone reads the hub in another language: translating text
    // while it's being edited would corrupt it.
    <div translate="no" className={cx("mx-auto px-4 pt-6 sm:px-6 lg:pt-8", withMenu ? "max-w-[90rem]" : "max-w-7xl")}>
      <div className={cx(withMenu && "lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8")}>
        {withMenu && (
          <aside aria-label="Administration" className="hidden lg:block">
            <nav className="sticky top-20 flex flex-col rounded-3xl border border-line bg-surface p-3">
              <NavLinks pathname={pathname} canAuthor={me?.canAuthor} />
            </nav>
          </aside>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Administration</p>
            {me && (
              <span className="text-sm text-ink-muted">
                {me.user.name} · {me.canAuthor ? "Learning author" : "Reports for " + me.org.name}
              </span>
            )}
          </div>
          {withMenu && (
            // Phones and tablets: the same menu behind one button.
            <div className="relative mt-3 lg:hidden">
              <button
                type="button"
                aria-expanded={menu}
                onClick={() => setMenu((m) => !m)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold"
              >
                <Icon name="list" className="size-4" /> Menu
                <span className="font-normal text-ink-muted">· {current?.label ?? "Overview"}</span>
                <Icon name="chevron-down" className={cx("size-4 transition-transform", menu && "rotate-180")} />
              </button>
              {menu && (
                <nav
                  aria-label="Administration"
                  className="absolute left-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-3xl border border-line bg-surface p-3 shadow-xl"
                >
                  <NavLinks pathname={pathname} canAuthor={me?.canAuthor} onPick={() => setMenu(false)} />
                </nav>
              )}
            </div>
          )}
          {back && (
            <Link href={back.href} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink">
              <Icon name="arrow-left" className="size-4" /> {back.label}
            </Link>
          )}
          <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function ErrorNote({ text }: { text: string }) {
  return (
    <div role="alert" className="flex gap-2 whitespace-pre-line rounded-2xl border border-danger/60 p-3 text-[0.95rem]">
      <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-danger" />
      <span>{text}</span>
    </div>
  );
}

export const timezones = [
  "Australia/Brisbane",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Hobart",
  "Australia/Adelaide",
  "Australia/Darwin",
  "Australia/Perth",
];
