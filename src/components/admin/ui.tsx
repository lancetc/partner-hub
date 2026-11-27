"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useApi, type Me } from "@/lib/api";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { ADMIN_GROUPS, linkAllowed } from "./adminNav";

export const btn = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-45",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-4 font-medium hover:bg-muted disabled:opacity-45",
  quiet:
    "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-muted hover:bg-muted hover:text-ink disabled:opacity-40",
  danger: "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-danger/60 px-4 font-medium hover:bg-danger/10",
};

export const input = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-base";

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

/** The sidebar's groups. Superadmin pages sit in the Superadmin button at the top instead. */
const visible = (me: Me | null | undefined) =>
  ADMIN_GROUPS.map((g) => ({ ...g, links: g.links.filter((l) => linkAllowed(l, me) && !l.superadminOnly) })).filter((g) => g.links.length);

/** The admin page you're on: the longest matching address, so "Path introductions" doesn't also light up "Discovery Paths". */
const currentLink = (pathname: string) =>
  ADMIN_GROUPS.flatMap((g) => g.links)
    .filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`) || pathname.startsWith(`${l.href}#`))
    .sort((a, b) => b.href.length - a.href.length)[0];

const CLOSED_KEY = "tc-admin-nav-closed";

/**
  The admin menu: Overview, Superadmin, a "Find a page" filter, then the groups. Each group folds away with its title;
  which ones are folded is remembered in this browser, and the group holding the page you're on always stays open.
  While something is typed in the filter, every matching page shows, whatever is folded.
*/
function NavLinks({ pathname, me, onPick }: { pathname: string; me?: Me | null; onPick?: () => void }) {
  const [find, setFind] = useState("");
  const [closed, setClosed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? "[]") as unknown;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once in the browser after it loads
      if (Array.isArray(saved)) setClosed(saved.filter((x): x is string => typeof x === "string"));
    } catch {
      // Private browsing: every group starts open.
    }
  }, []);
  const toggle = (title: string) =>
    setClosed((c) => {
      const next = c.includes(title) ? c.filter((t) => t !== title) : [...c, title];
      try {
        localStorage.setItem(CLOSED_KEY, JSON.stringify(next));
      } catch {
        // Not remembered: fine.
      }
      return next;
    });
  const here = currentLink(pathname);
  const q = find.trim().toLowerCase();
  const groups = visible(me)
    // A page matches by its name or description, or by its group's name ("ava" brings the whole "Introductions and Ava").
    .map((g) => ({
      ...g,
      links: q && !g.title.toLowerCase().includes(q) ? g.links.filter((l) => `${l.label} ${l.description}`.toLowerCase().includes(q)) : g.links,
    }))
    .filter((g) => g.links.length);
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
      {me?.isSuperadmin && (
        <Link
          href="/admin/people"
          onClick={onPick}
          aria-current={pathname.startsWith("/admin/people") ? "page" : undefined}
          className={cx(
            "mt-2 flex min-h-11 items-center gap-2.5 rounded-xl px-3 font-semibold transition-colors",
            pathname.startsWith("/admin/people") ? "bg-navy text-white ring-2 ring-gold" : "bg-navy text-white hover:bg-navy-medium",
          )}
        >
          <Icon name="shield" className="size-4 shrink-0 text-gold" />
          <span className="flex flex-col leading-tight">
            Superadmin
            <span className="text-xs font-normal text-white/75">People and permissions</span>
          </span>
        </Link>
      )}
      <label className="mt-3 flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 focus-within:border-action">
        <Icon name="search" className="size-4 shrink-0 text-ink-muted" />
        <span className="sr-only">Find a page</span>
        <input
          type="search"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="Find a page"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-ink-muted"
        />
      </label>
      {q && !groups.length && <p className="mt-3 px-3 text-sm text-ink-muted">Nothing matches “{find.trim()}”.</p>}
      {groups.map((g) => {
        const open = Boolean(q) || !closed.includes(g.title) || g.links.some((l) => l === here);
        const id = `admin-nav-${g.title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
        return (
          <div key={g.title} className="mt-3">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={id}
              onClick={() => toggle(g.title)}
              disabled={Boolean(q)}
              className="flex min-h-9 w-full items-center gap-2 rounded-xl px-3 text-left font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted hover:bg-muted hover:text-ink disabled:hover:bg-transparent"
            >
              <span className="flex-1">{g.title}</span>
              {!q && <Icon name="chevron-down" className={cx("size-3.5 transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />}
            </button>
            {open && (
              <div id={id}>
                {g.links.map((l) => {
                  const active = l === here;
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
            )}
          </div>
        );
      })}
    </>
  );
}

/** Administration frame. Access is enforced by the API; this only hides links. */
export function AdminShell({ title, children, back }: { title: string; children: React.ReactNode; back?: { href: string; label: string } }) {
  const pathname = usePathname();
  const me = useApi<Me>("/api/me").data;
  const [menu, setMenu] = useState(false);
  const current = currentLink(pathname);
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
              <NavLinks pathname={pathname} me={me} />
            </nav>
          </aside>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Administration</p>
            {me && (
              <span className="text-sm text-ink-muted">
                {me.user.name} · {me.isSuperadmin ? "Superadmin" : me.canAuthor ? "Learning author" : "Reports for " + me.org.name}
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
                  <NavLinks pathname={pathname} me={me} onPick={() => setMenu(false)} />
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
    <div role="alert" className="flex gap-2 whitespace-pre-line rounded-2xl border border-danger/60 p-3 text-base">
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
