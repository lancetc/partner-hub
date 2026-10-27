"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { tokenFor } from "@/lib/facts";
import { cx, formatDate } from "@/lib/format";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";

/*
  Facts library: a rate, date or number written once and used in lessons as {{key}}. Change the
  value here and every lesson shows the new one. Each fact has an owner, a source and a check date.
*/

type Fact = {
  key: string;
  label: string;
  value: string;
  notes: string;
  source: { title: string; url: string } | null;
  owner: string;
  checkBy: string | null;
  updatedAt: string;
  updatedBy: string;
  usedIn: { slug: string; title: string }[];
};
type Form = { key: string; label: string; value: string; notes: string; sourceTitle: string; sourceUrl: string; owner: string; checkBy: string };

const blank: Form = { key: "", label: "", value: "", notes: "", sourceTitle: "", sourceUrl: "", owner: "", checkBy: "" };
const formOf = (f: Fact): Form => ({
  key: f.key,
  label: f.label,
  value: f.value,
  notes: f.notes,
  sourceTitle: f.source?.title ?? "",
  sourceUrl: f.source?.url ?? "",
  owner: f.owner,
  checkBy: f.checkBy ?? "",
});
const keyFrom = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
const daysTo = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);

export function FactsLibrary() {
  const { data, error, reload } = useApi<{ facts: Fact[] }>("/api/admin/facts");
  const [editing, setEditing] = useState<{ form: Form; isNew: boolean } | null>(null);
  return (
    <AdminShell title="Facts">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-3xl text-ink-muted">
          Rates, dates and numbers that appear in lessons. Put a fact’s code, like <code className="rounded bg-muted px-1">{"{{example_rate}}"}</code>, in a
          card’s text and learners see its value. When it changes, update it here once and every lesson is current.
        </p>
        {!editing && (
          <button type="button" className={btn.primary} onClick={() => setEditing({ form: blank, isNew: true })}>
            <Icon name="plus" className="size-4" /> Add a fact
          </button>
        )}
      </div>
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      {editing && (
        <FactForm
          initial={editing.form}
          isNew={editing.isNew}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : !data.facts.length ? (
        <p className="mt-6 rounded-3xl border border-dashed border-line-strong p-6 text-center text-ink-muted">No facts yet.</p>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {data.facts.map((f) => (
            <FactCard key={f.key} fact={f} onEdit={() => setEditing({ form: formOf(f), isNew: false })} onDeleted={reload} />
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

function FactCard({ fact: f, onEdit, onDeleted }: { fact: Fact; onEdit: () => void; onDeleted: () => void }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = f.checkBy ? daysTo(f.checkBy) : null;
  async function remove() {
    const ok = await confirmAction(`“${f.label}” will be removed from the facts library.`, {
      title: "Delete this fact?",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/facts/${f.key}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <li
      id={f.key}
      className="flex scroll-mt-24 flex-col gap-2 rounded-3xl border border-line bg-surface p-5 target:border-accent target:ring-2 target:ring-accent/30"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">{f.label}</h2>
          <p className="font-serif text-2xl font-semibold">{f.value}</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-line-strong px-2.5 py-0.5 font-mono text-xs hover:bg-muted"
          title="Copy the code to paste into a card"
          onClick={async () => {
            await navigator.clipboard?.writeText(tokenFor(f.key)).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? "Copied" : tokenFor(f.key)}
        </button>
      </div>
      {f.notes && <p className="text-sm">{f.notes}</p>}
      <div className="flex flex-wrap gap-1.5">
        {days !== null && (
          <Badge tone={days < 0 ? "bad" : days <= 30 ? "warn" : "neutral"}>
            {days < 0 ? `Check overdue by ${-days} days` : `Check by ${formatDate(f.checkBy!)}`}
          </Badge>
        )}
        {f.owner && <Badge>Owner: {f.owner}</Badge>}
      </div>
      {f.source?.url && (
        <a href={f.source.url} target="_blank" rel="noreferrer" className="text-sm underline">
          {f.source.title}
        </a>
      )}
      <p className="text-sm text-ink-muted">
        {f.usedIn.length ? (
          <>
            Used in{" "}
            {f.usedIn.map((l, i) => (
              <span key={l.slug}>
                {i > 0 && ", "}
                <Link href={`/admin/lessons/${l.slug}/edit`} className="underline">
                  {l.title}
                </Link>
              </span>
            ))}
          </>
        ) : (
          "Not used in any lesson yet."
        )}
      </p>
      <p className="text-xs text-ink-muted">
        Updated {formatDate(f.updatedAt)}
        {f.updatedBy && ` by ${f.updatedBy}`}
      </p>
      {error && <ErrorNote text={error} />}
      <div className="mt-auto flex gap-2 pt-1">
        <button type="button" className={btn.secondary} onClick={onEdit}>
          Edit
        </button>
        <button
          type="button"
          className={btn.quiet}
          onClick={remove}
          disabled={f.usedIn.length > 0}
          title={f.usedIn.length ? "Remove it from lessons first" : undefined}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function FactForm({ initial, isNew, onCancel, onSaved }: { initial: Form; isNew: boolean; onCancel: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>(initial);
  const [keyTouched, setKeyTouched] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Form, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/facts", { body: { ...f, checkBy: f.checkBy || null } });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="mt-6 grid gap-4 rounded-3xl border border-line-strong bg-surface p-5 sm:grid-cols-2">
      <h2 className="font-serif text-xl font-semibold sm:col-span-2">{isNew ? "Add a fact" : `Edit “${initial.label}”`}</h2>
      <Field label="Name">
        <input
          className={input}
          required
          value={f.label}
          placeholder="E.g. Standard hourly rate"
          onChange={(e) => {
            set("label", e.target.value);
            if (!keyTouched) set("key", keyFrom(e.target.value));
          }}
        />
      </Field>
      <Field label="Value" hint="Exactly as learners should see it, e.g. $82.40 or 1 July 2027.">
        <input className={input} required value={f.value} onChange={(e) => set("value", e.target.value)} />
      </Field>
      <Field label="Code" hint={isNew ? "Lowercase letters, numbers and underscores." : "Can’t change once lessons use it."}>
        <input
          className={cx(input, "font-mono")}
          required
          readOnly={!isNew}
          value={f.key}
          onChange={(e) => {
            setKeyTouched(true);
            set("key", e.target.value.toLowerCase());
          }}
        />
      </Field>
      <Field label="Check by" hint="Authors are reminded before this date.">
        <input type="date" className={input} value={f.checkBy} onChange={(e) => set("checkBy", e.target.value)} />
      </Field>
      <Field label="Owner" hint="Who confirms it, e.g. Finance.">
        <input className={input} value={f.owner} onChange={(e) => set("owner", e.target.value)} />
      </Field>
      <Field label="Notes">
        <input className={input} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <Field label="Source title">
        <input className={input} value={f.sourceTitle} onChange={(e) => set("sourceTitle", e.target.value)} />
      </Field>
      <Field label="Source link">
        <input className={input} placeholder="https://" value={f.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value.trim())} />
      </Field>
      {error && (
        <div className="sm:col-span-2">
          <ErrorNote text={error} />
        </div>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className={btn.primary} disabled={busy}>
          {busy ? "Saving…" : isNew ? "Add fact" : "Save changes"}
        </button>
        <button type="button" className={btn.quiet} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
