"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api, useApi } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx, formatDate } from "@/lib/format";
import type { policyAcks, policyLinks } from "@/server/policyAcks";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";

/*
  Policy acknowledgements (the owner, Nov 2026): Trilogy Care's policies get updated, and the people they apply to have
  to read them and confirm by a date. Send a request (the policy, its version, what's changed, who it's for, when it's
  due); each person gets an Inbox action and an email (waiting in the outbox until email is connected). Then see, for
  each request, who has confirmed, who has only opened it, and who is overdue.
*/

type Data = ReturnType<typeof policyAcks>;
type Request = Data["requests"][number];
type LinkChoice = ReturnType<typeof policyLinks>[number];
const API = "/api/admin/policies";

export function PolicyAcksAdmin() {
  const { data, error, setData } = useApi<Data>(API);
  const [composing, setComposing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <AdminShell title="Policy acknowledgements">
      <p className="max-w-3xl text-ink-muted">
        When a policy is updated, ask the people it applies to to read it and confirm by a date. They get it in their Inbox (and by email, once email is
        connected). Their confirmation records when, and which version.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!composing && (
          <button type="button" className={btn.primary} onClick={() => setComposing(true)}>
            <Icon name="plus" className="size-4" /> New request
          </button>
        )}
        {note && (
          <p role="status" className="flex items-center gap-1.5 font-semibold text-success">
            <Icon name="circle-check" className="size-5" /> {note}
          </p>
        )}
      </div>
      {composing && data && (
        <NewRequest
          roles={data.roles}
          onCancel={() => setComposing(false)}
          onSent={(d, count) => {
            setData(d);
            setComposing(false);
            setNote(`Sent to ${count} ${count === 1 ? "person" : "people"}.`);
          }}
        />
      )}
      {error && <ErrorNote text={error} />}
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : data.requests.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-muted px-4 py-3">No requests yet. When a policy changes, send one with New request.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {data.requests.map((r) => (
            <RequestCard key={r.id} r={r} onChange={setData} />
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

function NewRequest({ roles, onCancel, onSent }: { roles: Data["roles"]; onCancel: () => void; onSent: (d: Data, count: number) => void }) {
  const { data: links } = useApi<{ links: LinkChoice[] }>(`${API}?view=links`);
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [summary, setSummary] = useState("");
  const [source, setSource] = useState<"hub" | "pdf">("hub");
  const [href, setHref] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  // A week from today, the usual time to read and confirm (set as the form opens).
  const [dueOn, setDueOn] = useState(() => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (links?.links ?? []).filter((l) => !term || `${l.label} ${l.kind} ${l.note}`.toLowerCase().includes(term)).slice(0, 8);
  }, [links, q]);

  const upload = async (file: File) => {
    setProblem(null);
    if (file.type !== "application/pdf") return setProblem("Choose the policy as a PDF.");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("width", "0");
      form.append("height", "0");
      const res = await fetch("/api/admin/uploads", { method: "POST", body: form });
      const out = (await res.json()) as { src?: string; error?: string };
      if (!res.ok || !out.src) throw new Error(out.error ?? "That PDF didn’t upload.");
      setHref(out.src);
      setLinkLabel(file.name);
      if (!title) setTitle(file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That PDF didn’t upload.");
    } finally {
      setUploading(false);
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const before = await api<Data>(API);
      const known = new Set(before.requests.map((r) => r.id));
      const d = await api<Data>(API, { body: { action: "send", title, version, summary, href, linkLabel, roles: chosen, dueOn } });
      onSent(d, d.requests.find((r) => !known.has(r.id))?.total ?? 0);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That didn’t send.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="mt-4 flex flex-col gap-4 rounded-3xl bg-surface p-5 ring-1 ring-line">
      <h2 className="font-serif text-xl font-semibold">New request</h2>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="Policy" hint="As people know it, such as “Invoicing guidance”.">
          <input className={input} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Version" hint="What they’re confirming.">
          <input className={input} value={version} maxLength={40} placeholder="v2.1" onChange={(e) => setVersion(e.target.value)} />
        </Field>
      </div>
      <Field label="What’s changed" hint="One or two sentences. It’s in their Inbox and the email.">
        <textarea className={cx(input, "py-2")} rows={2} maxLength={400} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>

      <fieldset>
        <legend className="text-sm font-semibold">The policy itself</legend>
        <div role="group" className="mt-1 inline-flex rounded-full bg-muted p-0.5">
          {(
            [
              ["hub", "On the Hub"],
              ["pdf", "Upload a PDF"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={source === v}
              onClick={() => setSource(v)}
              className={cx("min-h-9 rounded-full px-4 text-sm font-semibold", source === v ? "bg-surface shadow-sm" : "text-ink-muted")}
            >
              {label}
            </button>
          ))}
        </div>
        {href && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Icon name="check" className="size-4 text-success" /> Linked: <span className="font-semibold">{linkLabel || href}</span>
            <button
              type="button"
              className="font-semibold text-accent underline underline-offset-4"
              onClick={() => {
                setHref("");
                setLinkLabel("");
              }}
            >
              Change
            </button>
          </p>
        )}
        {!href && source === "hub" && (
          <div className="mt-2">
            <input type="search" className={input} value={q} placeholder="Find a News story or Resource" onChange={(e) => setQ(e.target.value)} />
            <ul className="mt-1 flex flex-col gap-0.5">
              {shown.map((l) => (
                <li key={l.href}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-muted"
                    onClick={() => {
                      setHref(l.href);
                      setLinkLabel(l.label);
                      if (!title) setTitle(l.label);
                    }}
                  >
                    <Badge tone={l.policy ? "info" : "neutral"}>{l.kind}</Badge>
                    <span className="min-w-0 flex-1">{l.label}</span>
                    {l.note && <span className="text-xs text-ink-muted">{l.note}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!href && source === "pdf" && (
          <label className={cx(btn.secondary, "mt-2 cursor-pointer")}>
            <Icon name="upload" className="size-4" /> {uploading ? "Uploading…" : "Choose the PDF"}
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">Who it applies to</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {roles.map((r) => (
            <label key={r.value} className="flex min-h-10 items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={chosen.includes(r.value)}
                onChange={(e) => setChosen((c) => (e.target.checked ? [...c, r.value] : c.filter((x) => x !== r.value)))}
              />
              {r.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-ink-muted">None ticked: everyone on the Hub. People who join these roles later get it too, while it’s open.</p>
      </fieldset>

      <Field label="Confirm by" className="w-48">
        <input type="date" className={input} value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
      </Field>

      {problem && <ErrorNote text={problem} />}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btn.primary} disabled={busy || uploading || !href}>
          {busy ? "Sending…" : "Send"}
        </button>
        <button type="button" className={btn.quiet} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RequestCard({ r, onChange }: { r: Request; onChange: (d: Data) => void }) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pct = r.total ? Math.round((r.acknowledged / r.total) * 100) : 0;
  const withdraw = async () => {
    if (
      !(await confirmAction("People who haven’t confirmed yet won’t be asked any more. Confirmations already given stay on record.", {
        title: `Withdraw “${r.title}”?`,
        confirmLabel: "Withdraw",
        danger: true,
      }))
    )
      return;
    setProblem(null);
    try {
      onChange(await api<Data>(API, { body: { action: "withdraw", id: r.id } }));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
    }
  };
  return (
    <li className={cx("rounded-2xl bg-surface p-4 ring-1 ring-line sm:p-5", r.status === "withdrawn" && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-serif text-xl font-semibold">{r.title}</span>
            <Badge tone="neutral">{r.version}</Badge>
            {r.status === "withdrawn" ? <Badge tone="neutral">Withdrawn</Badge> : r.overdue > 0 && <Badge tone="bad">{r.overdue} overdue</Badge>}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {r.forEveryone ? "Everyone" : r.roles.join(", ")} · confirm by {formatDate(`${r.dueOn}T00:00:00Z`)} · sent {formatDate(r.createdAt)} ·{" "}
            <Link href={r.href} className="font-semibold text-accent underline underline-offset-4" target="_blank">
              {r.linkLabel || "the policy"}
            </Link>
          </p>
          {r.summary && <p className="mt-1 text-sm">{r.summary}</p>}
        </div>
        {r.status === "active" && (
          <button type="button" className={btn.quiet} onClick={withdraw}>
            Withdraw
          </button>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span aria-hidden className="block h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-[#0f7a4a]" style={{ width: `${pct}%` }} />
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {r.acknowledged} of {r.total} confirmed
        </span>
      </div>
      <button
        type="button"
        aria-expanded={open}
        className="mt-2 text-sm font-semibold text-accent underline-offset-4 hover:underline"
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide people" : "Who has confirmed"}
      </button>
      {open && (
        <ul className="mt-2 flex flex-col divide-y divide-line rounded-xl ring-1 ring-line">
          {r.people.map((p, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{p.name}</span>
                <span className="text-ink-muted">
                  {" "}
                  · {p.role}
                  {p.organisation ? ` · ${p.organisation}` : ""}
                </span>
              </span>
              {p.ackedAt ? (
                <Badge tone="good">
                  Confirmed {formatDate(p.ackedAt)}
                  {p.version && p.version !== r.version ? ` (${p.version})` : ""}
                </Badge>
              ) : p.overdue ? (
                <Badge tone="bad">Overdue</Badge>
              ) : p.opened ? (
                <Badge tone="info">Opened, not confirmed</Badge>
              ) : (
                <Badge tone="neutral">Not yet</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      {problem && <ErrorNote text={problem} />}
    </li>
  );
}
