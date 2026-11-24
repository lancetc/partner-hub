"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx, formatDate } from "@/lib/format";
import { TOOL_ISSUES, type ToolIssue } from "@/lib/pocketPlaybook";
import type { ToolDetail } from "@/server/pocketPlaybook";
import { Icon } from "../Icon";
import { newKey, pocketEvent } from "./pocketApi";
import { QuickCalc } from "./QuickCalc";
import { IncidentPath } from "./IncidentPath";
import { GoldenScripts } from "./GoldenScripts";

/*
  One Pocket tool (docs/pocket-playbook.md), the same in the Companion Drawer and on its own page: the compact
  source and status strip, Pin to dashboard and Save to Favourites, then the tool. A withdrawn tool shows only why
  and the route to use instead, never its old content.
*/

export const day = (d: string) => (d ? formatDate(d) : "");
const TONE = {
  draft: "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
  review_due: "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
  current: "bg-tealtint",
  withdrawn: "bg-muted",
} as const;

/** A contact route as written in the directory: a link when it's a phone, email or web address, otherwise its words. */
export function RouteText({ route, onOpen }: { route: string; onOpen?: () => void }) {
  const href = /^(tel:|mailto:|https:\/\/)/.test(route)
    ? route
    : /^\+?[\d\s()-]{8,}$/.test(route)
      ? `tel:${route.replace(/[^\d+]/g, "")}`
      : /^[^@\s]+@[^@\s]+$/.test(route)
        ? `mailto:${route}`
        : "";
  return href ? (
    <a href={href} onClick={onOpen} className="font-semibold text-accent underline underline-offset-2">
      {route.replace(/^(tel:|mailto:)/, "")}
    </a>
  ) : (
    <span className="font-semibold">{route}</span>
  );
}

export function PocketTool({
  id,
  place,
  script,
  onOpenTool,
  onChanged,
}: {
  id: string;
  place: string;
  /** A Golden Script to open at. */
  script?: string;
  /** In the drawer, a related tool opens in place of this one. On a page, it's a link. */
  onOpenTool?: (id: string) => void;
  /** A pin or save changed, so the drawer's lists can be read again. */
  onChanged?: () => void;
}) {
  const loaded = useApi<ToolDetail>(`/api/pocket?tool=${encodeURIComponent(id)}`);
  const d = loaded.data;
  const sent = useRef("");
  useEffect(() => {
    if (!d || sent.current === id) return;
    sent.current = id;
    void api("/api/pocket", { body: { action: "opened", id, place, key: newKey("open") } }).catch(() => undefined);
  }, [d, id, place]);

  if (loaded.error)
    return (
      <p role="alert" className="mt-4">
        {loaded.error}
      </p>
    );
  if (!d) return <p className="mt-4 text-ink-muted">Loading…</p>;
  const t = d.tool;
  return (
    <article aria-labelledby={`tool-${t.id}`} className="pb-8">
      <StatusStrip d={d} />
      <h2 id={`tool-${t.id}`} tabIndex={-1} data-tool-heading className="mt-3 font-serif text-2xl font-semibold leading-tight outline-none sm:text-3xl">
        {t.title}
      </h2>
      {t.state === "withdrawn" ? (
        <Withdrawn d={d} />
      ) : (
        <>
          <p className="mt-1">
            <span className="font-semibold">Use when:</span> {t.task}
          </p>
          <PinControls d={d} onChanged={() => (loaded.reload(), onChanged?.())} />
          {d.updatedSincePinned && (
            <p role="status" className="mt-3 rounded-2xl bg-tealtint px-3 py-2 text-sm font-semibold">
              Updated since you pinned this: this is version {t.version}, the current one.
            </p>
          )}
          <div className="mt-4">
            {t.family === "calculator" && <QuickCalc toolId={t.id} place={place} contact={d.contact} />}
            {t.family === "escalation" && d.incident && <IncidentPath toolId={t.id} place={place} incident={d.incident} related={d.related} />}
            {t.family === "script" && <GoldenScripts scripts={d.scripts} place={place} open={script} onOpenTool={onOpenTool} />}
          </div>
          {d.related.length > 0 && t.family !== "escalation" && (
            <section aria-labelledby={`related-${t.id}`} className="mt-6 border-t border-line pt-4">
              <h3 id={`related-${t.id}`} className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
                Related Job Aids
              </h3>
              <ul className="mt-2 flex flex-col gap-1">
                {d.related.map((r) => (
                  <li key={r.id}>
                    <Link href={r.href} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline underline-offset-2">
                      {r.title}
                      {r.state === "unavailable" && <span className="font-normal text-ink-muted">(not yet released: shows its fallback route)</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </article>
  );
}

/** Owner, source, dates and status, kept in view while scrolling: what a coordinator checks before relying on a tool. */
function StatusStrip({ d }: { d: ToolDetail }) {
  const t = d.tool;
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const report = (issue: ToolIssue) => {
    pocketEvent({ event: "tool_issue_reported", toolId: t.id, issue });
    setReported(true);
    setReporting(false);
  };
  return (
    <>
      {/* One line stays in view while scrolling: the status, the version, the owner and the next review. */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-line bg-bg/95 px-4 py-2 text-xs backdrop-blur sm:text-sm">
        <p className="flex min-w-0 items-center gap-x-2">
          <span className={cx("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-bold", TONE[t.state])}>
            <Icon name={t.state === "current" ? "circle-check" : "alert"} className="size-3.5" /> {t.statusLabel}
          </span>
          <span className="shrink-0">v{t.version}</span>
          <span aria-hidden>·</span>
          <span className="min-w-0 truncate">
            <span className="text-ink-muted">Owner</span> {t.owner}
          </span>
        </p>
      </div>
      <div className="mt-2 text-xs sm:text-sm">
        <p className="flex flex-wrap gap-x-2 gap-y-1 text-ink-muted">
          <span>Effective {t.effectiveOn ? day(t.effectiveOn) : "not yet: awaiting approval"}</span>
          <span aria-hidden>·</span>
          <span>Reviewed {t.reviewedOn ? day(t.reviewedOn) : "not yet"}</span>
          <span aria-hidden>·</span>
          <span>Next review {t.nextReview ? day(t.nextReview) : "not set"}</span>
        </p>
        <p className="flex flex-wrap items-center gap-x-3">
          {t.sources.map((s) =>
            s.href ? (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => pocketEvent({ event: "source_opened", toolId: t.id })}
                className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent underline underline-offset-2"
              >
                Source: {s.label} <Icon name="external" className="size-3.5" />
              </a>
            ) : (
              <span key={s.label} className="inline-flex min-h-11 items-center text-ink-muted">
                Source: {s.label}
              </span>
            ),
          )}
          {!reported ? (
            <button
              type="button"
              aria-expanded={reporting}
              onClick={() => setReporting(!reporting)}
              className="inline-flex min-h-11 items-center gap-1 font-semibold underline underline-offset-2"
            >
              <Icon name="flag" className="size-3.5" /> Report an issue
            </button>
          ) : (
            <span role="status" className="inline-flex min-h-11 items-center font-semibold">
              Thanks: the owner sees it. For anything urgent, use the route in the tool.
            </span>
          )}
        </p>
        {reporting && (
          <div role="group" aria-label="What’s the issue?" className="mt-1 flex flex-wrap gap-2">
            {(Object.keys(TOOL_ISSUES) as ToolIssue[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => report(k)}
                className="min-h-11 rounded-full border border-line-strong bg-surface px-3 font-semibold hover:bg-muted"
              >
                {TOOL_ISSUES[k]}
              </button>
            ))}
          </div>
        )}
        {t.state === "draft" && (
          <p className="mt-1 rounded-xl bg-[#fff1cc] px-3 py-2 font-semibold text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]">
            Pilot draft, not approved guidance. Awaiting {t.awaiting}
          </p>
        )}
      </div>
    </>
  );
}

function PinControls({ d, onChanged }: { d: ToolDetail; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const act = async (body: Record<string, unknown>, done: (r: { first?: boolean }) => string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ first?: boolean }>("/api/pocket", { body });
      setNote(done(r));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const btn = (on: boolean) =>
    cx(
      "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-semibold disabled:opacity-50",
      on ? "border-action bg-tealtint" : "border-line-strong bg-surface hover:bg-muted",
    );
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={d.pinned}
          disabled={busy}
          className={btn(d.pinned)}
          onClick={() =>
            act({ action: "pin", kind: "tool", id: d.tool.id, on: !d.pinned }, (r) =>
              d.pinned
                ? "Unpinned. It’s still in your Favourites."
                : r.first
                  ? "Pinned. Pinned tools are at the top of Favourites (the Favourites button in the header) and on your Hub home."
                  : "Pinned to your dashboard.",
            )
          }
        >
          <Icon name="pin" className="size-4" /> {d.pinned ? "Pinned to dashboard" : "Pin to dashboard"}
        </button>
        <button
          type="button"
          aria-pressed={d.saved}
          disabled={busy}
          className={btn(d.saved)}
          onClick={async () => {
            if (
              d.saved &&
              !(await confirmAction("This tool is removed from your Favourites, and unpinned. It stays in Work Tools.", { confirmLabel: "Remove" }))
            )
              return;
            void act({ action: "save", id: d.tool.id, on: !d.saved }, () => (d.saved ? "Removed from your Favourites." : "Saved to Favourites."));
          }}
        >
          <Icon name={d.saved ? "bookmark-filled" : "bookmark"} className="size-4" /> {d.saved ? "In your Favourites" : "Save to Favourites"}
        </button>
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm">
        {note}
      </p>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Withdrawn({ d }: { d: ToolDetail }) {
  const t = d.tool;
  return (
    <div className="mt-3 rounded-2xl border border-line-strong bg-muted p-4">
      <p className="font-semibold">This tool has been withdrawn{t.withdrawnReason ? `: ${t.withdrawnReason}` : "."}</p>
      <p className="mt-2">{t.fallback.text}</p>
      {d.contact && (
        <p className="mt-2">
          {d.contact.label}: {d.contact.route ? <RouteText route={d.contact.route} /> : <span className="text-ink-muted">route not set up yet</span>}
        </p>
      )}
      {t.replacement && (
        <Link
          href={t.replacement.startsWith("/") ? t.replacement : "/tools"}
          className="mt-3 inline-flex min-h-11 items-center gap-1 font-semibold text-accent underline"
        >
          Use the replacement <Icon name="arrow-right" className="size-4" />
        </Link>
      )}
    </div>
  );
}
