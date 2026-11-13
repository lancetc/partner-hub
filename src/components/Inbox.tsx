"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { Icon } from "./Icon";
import { INBOX_CHANGED } from "./InboxButton";

/*
  The Inbox: an action centre and a notification centre in one. Action required holds what needs a
  response and stays until it's done; Updates and Activity are things to read. Opening an item marks
  it read; a notice that needs confirming is only done once confirmed.
*/

type Item = {
  id: number;
  kind: "action" | "update" | "activity";
  category: string;
  priority: "critical" | "high" | "normal";
  title: string;
  body: string;
  href: string | null;
  dueAt: string | null;
  ackRequired: boolean;
  at: string;
  read: boolean;
  ackedAt: string | null;
  done: boolean;
  campaign: string | null;
};
type Box = { action: Item[]; updates: Item[]; activity: Item[]; counts: { action: number; updates: number; activity: number } };

const TABS = [
  { id: "action", label: "Action required", empty: "Nothing needs you right now." },
  { id: "updates", label: "Updates", empty: "You’re up to date." },
  { id: "activity", label: "Activity", empty: "Nothing new from other people yet." },
] as const;
type Tab = (typeof TABS)[number]["id"];

const changed = () => window.dispatchEvent(new Event(INBOX_CHANGED));

function ago(iso: string) {
  const h = (Date.now() - Date.parse(iso)) / 3_600_000;
  if (h < 1) return "Just now";
  if (h < 24) return `${Math.round(h)}h ago`;
  if (h < 48) return "Yesterday";
  return formatDate(iso);
}
function dueLabel(iso: string) {
  const days = Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
  if (days < 0) return { text: `Overdue since ${formatDate(iso)}`, urgent: true };
  if (days === 0) return { text: "Due today", urgent: true };
  return { text: `Due ${formatDate(iso)}${days <= 7 ? ` · ${days} ${days === 1 ? "day" : "days"} left` : ""}`, urgent: days <= 7 };
}

export function Inbox() {
  const { data, error, setData } = useApi<Box>("/api/inbox");
  const [tab, setTab] = useState<Tab>("action");
  const [open, setOpen] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function act(body: Record<string, unknown>) {
    setProblem(null);
    try {
      setData(await api<Box>("/api/inbox", { body }));
      changed();
    } catch (e) {
      setProblem((e as Error).message);
    }
  }
  function toggle(item: Item) {
    const next = open === item.id ? null : item.id;
    setOpen(next);
    if (next !== null && !item.read) void act({ action: "read", id: item.id });
  }

  const list = data ? (tab === "action" ? data.action : tab === "updates" ? data.updates : data.activity) : [];
  const counts = data?.counts ?? { action: 0, updates: 0, activity: 0 };

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-1 text-ink-muted">What needs you, what’s new, and what other people did. One place, instead of more email.</p>
        </div>
        <Link href="/settings#email" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
          <Icon name="sliders" className="size-4" /> Notification settings
        </Link>
      </div>

      <div role="tablist" aria-label="Inbox" className="mt-6 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)]">
        {TABS.map((t) => {
          const n = counts[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setOpen(null);
              }}
              className={cx(
                "inline-flex min-h-12 shrink-0 items-center gap-2 border-b-[3px] px-4 font-semibold",
                tab === t.id ? "border-[#008282] text-ink dark:border-[#3cb8b9]" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {t.label}
              {n > 0 && (
                <span
                  className={cx(
                    "rounded-full px-2 font-mulish text-xs font-extrabold leading-5",
                    t.id === "action" ? "bg-[#c7393e] text-white" : "bg-[#3cb8b9] text-[#102a43]",
                  )}
                >
                  {n}
                  <span className="sr-only"> {t.id === "action" ? "to do" : "unread"}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="pt-5">
        {error && <p className="text-danger">{error}</p>}
        {problem && (
          <p role="alert" className="mb-3 text-sm font-semibold text-danger">
            {problem}
          </p>
        )}
        {!data ? (
          <p className="text-ink-muted">Loading…</p>
        ) : (
          <>
            {tab !== "action" && list.some((i) => !i.read) && (
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => act({ action: "read_all", kind: tab === "updates" ? "update" : "activity" })}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-muted hover:bg-muted hover:text-ink"
                >
                  <Icon name="check" className="size-4" /> Mark all as read
                </button>
              </div>
            )}
            {list.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-line p-8 text-center text-ink-muted">{TABS.find((t) => t.id === tab)!.empty}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {list.map((item) => (
                  <InboxRow key={item.id} item={item} open={open === item.id} onToggle={() => toggle(item)} act={act} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <DeliveryRules />
    </div>
  );
}

function InboxRow({ item, open, onToggle, act }: { item: Item; open: boolean; onToggle: () => void; act: (b: Record<string, unknown>) => Promise<void> }) {
  const tone = toneOf(item);
  const due = item.dueAt && !item.done ? dueLabel(item.dueAt) : null;
  const outstanding = item.kind === "action" ? !item.done : !item.read;
  return (
    <li className={cx("overflow-hidden rounded-3xl border", tone.box, item.done && "opacity-75")}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/60 sm:p-5">
        <span aria-hidden className={cx("relative grid size-11 shrink-0 place-items-center rounded-2xl", tone.icon)}>
          <Icon name={tone.glyph} className="size-5" />
          {outstanding && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-[#c7393e] ring-2 ring-surface" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mulish font-extrabold uppercase tracking-[0.12em] text-ink-muted">{item.category}</span>
            {item.priority === "critical" && !item.done && <span className="rounded-full bg-[#c7393e] px-2 py-0.5 font-bold text-white">Critical</span>}
            {item.done && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 font-bold">
                <Icon name="check" className="size-3" /> {item.ackedAt ? `Confirmed ${formatDate(item.ackedAt)}` : "Done"}
              </span>
            )}
          </span>
          <span className={cx("mt-1 block text-lg leading-snug", outstanding ? "font-semibold" : "font-medium")}>{item.title}</span>
          {!open && item.body && <span className="mt-0.5 line-clamp-1 block text-sm text-ink-muted">{item.body}</span>}
          <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span>{ago(item.at)}</span>
            {due && <span className={cx("font-semibold", due.urgent && "text-[#c7393e] dark:text-[#ff9ea2]")}>{due.text}</span>}
          </span>
        </span>
        <Icon name="chevron-down" className={cx("mt-1 size-5 shrink-0 text-ink-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && <Details item={item} act={act} />}
    </li>
  );
}

function Details({ item, act }: { item: Item; act: (b: Record<string, unknown>) => Promise<void> }) {
  const email = useApi<{ html: string }>(item.campaign ? `/api/inbox/email?campaign=${encodeURIComponent(item.campaign)}` : null);
  const [busy, setBusy] = useState(false);
  const run = async (b: Record<string, unknown>) => {
    setBusy(true);
    await act(b);
    setBusy(false);
  };
  return (
    <div className="border-t border-black/5 bg-surface/70 px-4 pb-5 pt-4 sm:px-5 sm:pl-[4.6rem] dark:border-white/10">
      {item.body && <p>{item.body}</p>}
      {item.campaign &&
        (email.data ? (
          <iframe title={item.title} srcDoc={email.data.html} sandbox="" className="mt-3 h-[28rem] w-full rounded-2xl border border-line bg-white" />
        ) : (
          <p className="mt-3 text-sm text-ink-muted">{email.error ?? "Loading the email…"}</p>
        ))}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {item.href && (
          <Link href={item.href} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted">
            {item.kind === "action" && !item.ackRequired ? "Go to it" : "Open"} <Icon name="arrow-right" className="size-4" />
          </Link>
        )}
        {item.ackRequired && !item.ackedAt && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run({ action: "ack", id: item.id })}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#008282] px-5 font-semibold text-white hover:bg-[#006b6b] disabled:opacity-60"
          >
            <Icon name="check" className="size-4" /> I’ve read and understood this
          </button>
        )}
        {item.kind === "action" && !item.ackRequired && !item.done && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run({ action: "done", id: item.id })}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 font-semibold text-ink-muted hover:bg-muted hover:text-ink"
          >
            Mark as done
          </button>
        )}
      </div>
      {item.ackRequired && !item.ackedAt && (
        <p className="mt-2 text-xs text-ink-muted">Your confirmation is recorded with the date and the version of this notice.</p>
      )}
    </div>
  );
}

/** Each kind of notice in its own brand colour: critical red, actions amber, updates teal, activity purple. Done items go plain. */
function toneOf(item: Item): { box: string; icon: string; glyph: Parameters<typeof Icon>[0]["name"] } {
  if (item.done) return { box: "border-line bg-surface", icon: "bg-muted text-ink-muted", glyph: "check" };
  if (item.priority === "critical") return { box: "border-[#c7393e]/40 bg-[#c7393e]/[0.07]", icon: "bg-[#c7393e] text-white", glyph: "alert" };
  if (item.kind === "action") return { box: "border-[#fab53d]/50 bg-[#fab53d]/10", icon: "bg-[#fab53d] text-[#102a43]", glyph: item.ackRequired ? "check" : "flag" };
  if (item.kind === "update")
    return {
      box: "border-[#3cb8b9]/40 bg-[#3cb8b9]/10",
      icon: "bg-[#008282] text-white",
      glyph: /webinar|event/i.test(item.category) ? "calendar" : /learning/i.test(item.category) ? "book" : "news",
    };
  return {
    box: "border-[#7a4fa3]/30 bg-[#7a4fa3]/[0.07]",
    icon: "bg-[#7a4fa3] text-white",
    glyph: /achievement|badge/i.test(item.category) ? "star" : "chat",
  };
}

/** How the hub tells people things: the delivery rules, so nobody wonders why something came by email. */
function DeliveryRules() {
  const rows = [
    ["Critical operational change", "Inbox and email. Some ask you to confirm you’ve read them.", "Always"],
    ["Mandatory training due", "Inbox, with reminders before it’s due", "Always"],
    ["Webinar and event reminders", "Inbox, and email before the event", "Email optional"],
    ["New learning and news", "A weekly digest email", "Email optional"],
    ["Community replies", "Inbox; email if you choose", "Email optional"],
    ["Game achievements", "Inbox only", "No email"],
  ];
  return (
    <details className="mt-10 rounded-3xl border border-line bg-surface p-5">
      <summary className="cursor-pointer font-semibold">How the Partner Hub lets you know</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-2 pr-4 font-semibold">What</th>
              <th className="py-2 pr-4 font-semibold">How</th>
              <th className="py-2 font-semibold">Your choice</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([what, how, choice]) => (
              <tr key={what} className="border-t border-line">
                <td className="py-2.5 pr-4 font-medium">{what}</td>
                <td className="py-2.5 pr-4">{how}</td>
                <td className="py-2.5 text-ink-muted">{choice}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-ink-muted">
        No push notifications. Change your email choices in{" "}
        <Link href="/settings#email" className="font-semibold text-accent hover:underline">
          Profile and settings
        </Link>
        .
      </p>
    </details>
  );
}
