"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { AdminShell, Badge, btn, ErrorNote, input } from "./ui";
import { Icon } from "../Icon";

/* What needs checking so lessons stay accurate: dated checks, learner reports and suggestions. */

type Item = {
  key: string;
  kind: "lesson" | "card" | "fact";
  title: string;
  context?: string;
  slug?: string;
  cardId?: string;
  factKey?: string;
  due: string;
  days: number;
  note?: string;
  owner?: string;
  source?: { title: string; url: string };
};
type Report = { id: number; slug: string; cardId: string; text: string; by: string; at: string; lesson: string; card: string };
type Suggestion = { slug: string; lesson: string; cardId: string; title: string; found: string[] };
type Review = { today: string; overdue: Item[]; due: Item[]; ok: Item[]; reports: Report[]; suggestions: Suggestion[] };

const editLink = (slug: string, cardId?: string) => `/admin/lessons/${slug}/edit${cardId ? `?card=${encodeURIComponent(cardId)}` : ""}`;
const linkFor = (i: Item) => (i.kind === "fact" ? `/admin/facts#${i.factKey}` : editLink(i.slug!, i.cardId));
const kindLabel = { lesson: "Lesson review", card: "Card", fact: "Fact" };

export function ContentReview() {
  const { data, error, reload } = useApi<Review>("/api/admin/content-review");
  const [showOk, setShowOk] = useState(false);
  return (
    <AdminShell title="Content review">
      <p className="max-w-3xl text-ink-muted">
        Rates, dates and rules change. Everything with a check date is listed here, with what learners have reported. Authors get an email two weeks before a
        check is due and again once it’s overdue.
      </p>
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Overdue", data.overdue.length, "bad"],
                ["Due in 30 days", data.due.length, "warn"],
                ["Learner reports", data.reports.length, "info"],
                ["Up to date", data.ok.length, "good"],
              ] as const
            ).map(([label, n, tone]) => (
              <div key={label} className="rounded-2xl border border-line bg-surface p-4">
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className={cx("font-serif text-3xl font-semibold", n > 0 && tone === "bad" && "text-danger")}>{n}</dd>
              </div>
            ))}
          </dl>

          <Section title="Overdue" empty="Nothing overdue.">
            {data.overdue.map((i) => (
              <ItemRow key={i.key} item={i} />
            ))}
          </Section>
          <Section title="Due in the next 30 days" empty="Nothing due soon.">
            {data.due.map((i) => (
              <ItemRow key={i.key} item={i} />
            ))}
          </Section>
          <Section title="Reported by learners" empty="No open reports.">
            {data.reports.map((r) => (
              <ReportRow key={r.id} report={r} onDone={reload} />
            ))}
          </Section>
          <Section
            title="Suggested check dates"
            hint="These cards mention an amount, date, percentage or law, but have no check date and use no shared fact."
            empty="No suggestions."
          >
            {data.suggestions.map((s) => (
              <li key={`${s.slug}:${s.cardId}`} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{s.title}</span> <span className="text-ink-muted">· {s.lesson}</span>
                  <span className="block text-sm text-ink-muted">Mentions {s.found.join(", ")}</span>
                </span>
                <Link href={editLink(s.slug, s.cardId)} className={btn.secondary}>
                  Open card
                </Link>
              </li>
            ))}
          </Section>
          <div>
            <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setShowOk((o) => !o)} aria-expanded={showOk}>
              {showOk ? "Hide" : "Show"} {data.ok.length} up-to-date {data.ok.length === 1 ? "item" : "items"}
            </button>
            {showOk && (
              <ul className="mt-2 divide-y divide-line rounded-3xl border border-line bg-surface px-4">
                {data.ok.map((i) => (
                  <ItemRow key={i.key} item={i} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Section({ title, hint, empty, children }: { title: string; hint?: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      {children.length ? (
        <ul className="mt-2 divide-y divide-line rounded-3xl border border-line bg-surface px-4">{children}</ul>
      ) : (
        <p className="mt-2 rounded-3xl border border-dashed border-line-strong p-4 text-center text-sm text-ink-muted">{empty}</p>
      )}
    </section>
  );
}

function ItemRow({ item: i }: { item: Item }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <Badge>{kindLabel[i.kind]}</Badge>
          <span className="font-semibold">{i.title}</span>
          {i.context && <span className="text-ink-muted">· {i.context}</span>}
        </span>
        <span className="mt-0.5 block text-sm text-ink-muted">
          <span className={cx(i.days < 0 && "font-semibold text-danger")}>
            {i.days < 0 ? `${-i.days} days overdue` : i.days === 0 ? "Due today" : `Due ${formatDate(i.due)} (in ${i.days} days)`}
          </span>
          {i.note && ` · ${i.note}`}
          {i.owner && ` · Owner: ${i.owner}`}
          {i.source?.url && (
            <>
              {" · "}
              <a href={i.source.url} target="_blank" rel="noreferrer" className="underline">
                {i.source.title || "Source"}
              </a>
            </>
          )}
        </span>
      </span>
      <Link href={linkFor(i)} className={btn.secondary}>
        {i.kind === "fact" ? "Open fact" : i.kind === "card" ? "Open card" : "Open lesson"}
      </Link>
    </li>
  );
}

function ReportRow({ report: r, onDone }: { report: Report; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function resolve() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/reports/${r.id}`, { body: { resolution: note } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="font-semibold">{r.card}</span> <span className="text-ink-muted">· {r.lesson}</span>
          <span className="mt-1 flex gap-1.5 text-sm">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>
              “{r.text}”{" "}
              <span className="text-ink-muted">
                — {r.by}, {formatDate(r.at)}
              </span>
            </span>
          </span>
        </span>
        <Link href={editLink(r.slug, r.cardId)} className={btn.secondary}>
          Open card
        </Link>
        {!open && (
          <button type="button" className={btn.quiet} onClick={() => setOpen(true)}>
            Mark dealt with
          </button>
        )}
      </div>
      {open && (
        <div className="flex flex-wrap gap-2">
          <input
            className={cx(input, "flex-1")}
            placeholder="What you did (optional), e.g. Fixed the rate"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="button" className={btn.primary} onClick={resolve} disabled={busy}>
            {busy ? "Saving…" : "Done"}
          </button>
          <button type="button" className={btn.quiet} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      )}
      {error && <ErrorNote text={error} />}
    </li>
  );
}
