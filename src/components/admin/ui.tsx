"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApi, type Me } from "@/lib/api";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";

export const btn = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-45",
  secondary: "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-4 font-medium hover:bg-muted disabled:opacity-45",
  quiet: "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-muted hover:bg-muted hover:text-ink disabled:opacity-40",
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
  s === "published" || s === "approved" || s === "accepted" || s === "delivered" ? "good" : s === "in_review" || s === "queued" || s === "sending" ? "warn" : s === "withdrawn" || s === "failed" || s === "unknown" ? "bad" : "neutral";

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

const tabs: { href: string; label: string; authorOnly?: boolean }[] = [
  { href: "/admin/lessons", label: "Lessons" },
  { href: "/admin/learning-paths", label: "Learning paths" },
  { href: "/admin/webinars", label: "Webinars", authorOnly: true },
  { href: "/admin/email", label: "Email campaigns", authorOnly: true },
  { href: "/admin/surveys", label: "Surveys" },
  { href: "/admin/signoffs", label: "Sign-offs" },
  { href: "/admin/schedules", label: "Spaced schedules" },
  { href: "/admin/outbox", label: "Notifications" },
];

/** Administration frame. Access is enforced by the API; this only hides links. */
export function AdminShell({ title, children, back }: { title: string; children: React.ReactNode; back?: { href: string; label: string } }) {
  const pathname = usePathname();
  const me = useApi<Me>("/api/me").data;
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Administration</p>
        {me && (
          <span className="text-sm text-ink-muted">
            {me.user.name} · {me.canAuthor ? "Learning author" : "Reports for " + me.org.name}
          </span>
        )}
      </div>
      {back && (
        <Link href={back.href} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink">
          <Icon name="arrow-left" className="size-4" /> {back.label}
        </Link>
      )}
      <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {!back && (
        <nav aria-label="Administration" className="mt-4 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
          {tabs.filter((t) => !t.authorOnly || me?.canAuthor).map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cx("-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-4 font-medium", active ? "border-action text-ink" : "border-transparent text-ink-muted hover:text-ink")}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
      <div className="mt-6">{children}</div>
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

export const timezones = ["Australia/Brisbane", "Australia/Sydney", "Australia/Melbourne", "Australia/Hobart", "Australia/Adelaide", "Australia/Darwin", "Australia/Perth"];
