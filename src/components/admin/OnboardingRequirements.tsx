"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { AUDIENCES, TASK_KINDS, type Audience, type ConfigTask, type TaskKind } from "@/lib/onboarding";
import type { configView } from "@/server/onboarding";
import { Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";

/*
  The requirements matrix (docs/onboarding.md): one list of tasks, each saying who it applies to, rather
  than a separate wizard per audience. It's edited as a draft, previewed for each audience, and released
  by name. Releasing never resets anyone: for each new task the owner says whether it also applies to
  people who are already active.
*/

type View = ReturnType<typeof configView>;
const blank = (): ConfigTask => ({
  id: "",
  kind: "acknowledge",
  scope: "person",
  title: "",
  why: "",
  audiences: [],
  required: true,
  quality: false,
  statement: "",
  asset: "",
  expiryMonths: null,
  minutes: 3,
  existing: true,
  addedAt: null,
});

export function RequirementsTab() {
  const { data, error, setData } = useApi<View>("/api/admin/onboarding?view=requirements");
  const [problem, setProblem] = useState<string | null>(null);
  const [rows, setRows] = useState<ConfigTask[] | null>(null);
  const [note, setNote] = useState("");
  const [forExisting, setForExisting] = useState<string[]>([]);
  const [preview, setPreview] = useState<Audience>("coordinator");
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  const send = async (body: Record<string, unknown>) => {
    setProblem(null);
    try {
      setData(await api<View>("/api/admin/onboarding", { body }));
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
      return false;
    }
  };
  const shown = data.draft ?? data.active;
  const set = (i: number, patch: Partial<ConfigTask>) => setRows(rows!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) => {
    const next = [...rows!];
    const [r] = next.splice(i, 1);
    next.splice(i + by, 0, r);
    setRows(next);
  };
  const route = (shown?.tasks ?? []).filter((t) => !t.audiences.length || t.audiences.includes(preview));
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-3xl text-ink-muted">
        One list of tasks. Each says who it’s for, whether it’s required to start, and who reviews it. Until a version is released, nobody is asked to do
        anything and the setup page shows the welcome it always has.
      </p>
      {problem && <ErrorNote text={problem} />}

      <section aria-labelledby="req-now" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 id="req-now" className="font-serif text-xl font-semibold">
            {data.draft ? `Draft version ${data.draft.version}` : data.active ? `In force: version ${data.active.version}` : "Nothing released yet"}
          </h2>
          <span className="flex flex-wrap gap-2">
            {data.active && (
              <Badge tone="good">
                Version {data.active.version} in force, released by {data.active.approvedBy}
                {data.active.approvedAt ? `, ${formatDate(data.active.approvedAt)}` : ""}
              </Badge>
            )}
            {data.draft && <Badge tone="info">Draft not released</Badge>}
          </span>
        </div>

        {rows ? (
          <div className="mt-3 flex flex-col gap-3">
            {rows.map((r, i) => (
              <fieldset key={i} className="rounded-2xl bg-muted p-4">
                <legend className="sr-only">Task {i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Title" className="lg:col-span-2">
                    <input className={input} value={r.title} maxLength={80} onChange={(e) => set(i, { title: e.target.value })} />
                  </Field>
                  <Field label="Kind" hint={TASK_KINDS[r.kind].text}>
                    <select className={input} value={r.kind} onChange={(e) => set(i, { kind: e.target.value as TaskKind })}>
                      {(Object.keys(TASK_KINDS) as TaskKind[]).map((k) => (
                        <option key={k} value={k}>
                          {TASK_KINDS[k].label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Minutes">
                    <input type="number" min={1} max={120} className={input} value={r.minutes} onChange={(e) => set(i, { minutes: Number(e.target.value) })} />
                  </Field>
                  <Field label="Why it’s needed (shown to the person)" className="sm:col-span-2 lg:col-span-4">
                    <input className={input} value={r.why} maxLength={300} onChange={(e) => set(i, { why: e.target.value })} />
                  </Field>
                  {r.kind === "acknowledge" && (
                    <Field
                      label="The statement they acknowledge"
                      hint="Rewording it later asks everyone to acknowledge again."
                      className="sm:col-span-2 lg:col-span-4"
                    >
                      <textarea
                        className={cx(input, "min-h-24 py-2")}
                        value={r.statement}
                        maxLength={2000}
                        onChange={(e) => set(i, { statement: e.target.value })}
                      />
                    </Field>
                  )}
                  {r.kind === "learning" && (
                    <Field label="The Topic or Magazine course" hint="Done when it’s completed in the usual way." className="sm:col-span-2 lg:col-span-4">
                      <select className={input} value={r.asset} onChange={(e) => set(i, { asset: e.target.value })}>
                        <option value="">Choose…</option>
                        {data.learning.map((l) => (
                          <option key={l.key} value={l.key}>
                            {l.kind === "topic" ? "Topic" : "Course"}: {l.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {r.kind === "document" && (
                    <Field label="Renew every (months)" hint="Empty: an approval doesn’t expire.">
                      <input
                        type="number"
                        min={1}
                        max={120}
                        className={input}
                        value={r.expiryMonths ?? ""}
                        onChange={(e) => set(i, { expiryMonths: e.target.value ? Number(e.target.value) : null })}
                      />
                    </Field>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <span className="font-semibold">For:</span>
                  {(Object.keys(AUDIENCES) as Audience[]).map((a) => (
                    <label key={a} className="inline-flex min-h-9 items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-action)]"
                        checked={r.audiences.includes(a)}
                        onChange={(e) => set(i, { audiences: e.target.checked ? [...r.audiences, a] : r.audiences.filter((x) => x !== a) })}
                      />
                      {AUDIENCES[a]}
                    </label>
                  ))}
                  <span className="text-ink-muted">{r.audiences.length ? "" : "(none ticked: everyone)"}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <label className="inline-flex min-h-9 items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-action)]"
                      checked={r.required}
                      onChange={(e) => set(i, { required: e.target.checked })}
                    />
                    Required to start
                  </label>
                  {(r.kind === "document" || r.kind === "acknowledge") && (
                    <label className="inline-flex min-h-9 items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-action)]"
                        checked={r.scope === "organisation"}
                        onChange={(e) => set(i, { scope: e.target.checked ? "organisation" : "person" })}
                      />
                      Done once by the organisation, for all its people
                    </label>
                  )}
                  {r.kind === "document" && (
                    <label className="inline-flex min-h-9 items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-action)]"
                        checked={r.quality}
                        onChange={(e) => set(i, { quality: e.target.checked })}
                      />
                      Reviewed by Quality
                    </label>
                  )}
                  <span className="ml-auto flex gap-1">
                    <button type="button" className={btn.quiet} disabled={i === 0} aria-label={`Move ${r.title || "task"} up`} onClick={() => move(i, -1)}>
                      <Icon name="arrow-up" className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={btn.quiet}
                      disabled={i === rows.length - 1}
                      aria-label={`Move ${r.title || "task"} down`}
                      onClick={() => move(i, 1)}
                    >
                      <Icon name="arrow-down" className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={btn.quiet}
                      aria-label={`Remove ${r.title || "task"}`}
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    >
                      <Icon name="trash" className="size-4" />
                    </button>
                  </span>
                </div>
                {r.kind === "diagnostic" && (
                  <p className="mt-2 text-sm text-ink-muted">
                    Only shown to people whose role has a published starting-point check. “Required” means doing it, never how it’s answered.
                  </p>
                )}
              </fieldset>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn.secondary} onClick={() => setRows([...rows, blank()])}>
                <Icon name="plus" className="size-4" /> Add a task
              </button>
            </div>
            <Field label="Note on this version">
              <input className={input} value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn.primary} onClick={async () => (await send({ action: "requirements", tasks: rows, note })) && setRows(null)}>
                Save the draft
              </button>
              <button type="button" className={btn.quiet} onClick={() => setRows(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {shown ? (
              <ol className="mt-3 flex flex-col divide-y divide-line">
                {shown.tasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-semibold">{t.title}</span> <span className="text-sm text-ink-muted">{TASK_KINDS[t.kind].label}</span>
                    </span>
                    <span className="flex flex-wrap gap-2 text-sm">
                      <Badge>{t.audiences.length ? t.audiences.map((a) => AUDIENCES[a]).join(", ") : "Everyone"}</Badge>
                      <Badge tone={t.required ? "info" : "neutral"}>{t.required ? "Required" : "Optional"}</Badge>
                      {t.scope === "organisation" && <Badge>Organisation</Badge>}
                      {t.quality && <Badge>Quality reviews</Badge>}
                      {t.expiryMonths && <Badge>Renew every {t.expiryMonths} months</Badge>}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-ink-muted">Add the first tasks to begin.</p>
            )}
            {data.canEdit && (
              <button
                type="button"
                className={cx(btn.secondary, "mt-3")}
                onClick={() => {
                  setRows(
                    shown?.tasks ?? [
                      {
                        ...blank(),
                        kind: "details",
                        title: "Confirm your details",
                        why: "So the Hub has the right name, role and organisation for you.",
                        minutes: 2,
                      },
                    ],
                  );
                  setNote(data.draft?.note ?? "");
                }}
              >
                <Icon name="pen" className="size-4" /> {data.draft ? "Edit the draft" : data.active ? "Draft the next version" : "Start the requirements"}
              </button>
            )}
          </>
        )}
      </section>

      {shown && !rows && (
        <section aria-labelledby="req-preview" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="req-preview" className="font-serif text-xl font-semibold">
              What {AUDIENCES[preview].toLowerCase()} would see
            </h2>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Preview for
              <select className={cx(input, "min-h-10")} value={preview} onChange={(e) => setPreview(e.target.value as Audience)}>
                {(Object.keys(AUDIENCES) as Audience[]).map((a) => (
                  <option key={a} value={a}>
                    {AUDIENCES[a]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ol className="mt-2 list-decimal pl-6">
            <li>Welcome: their role and organisation, with “This isn’t my role or organisation”.</li>
            {route.map((t) => (
              <li key={t.id}>
                {t.title}
                <span className="text-ink-muted">
                  {" "}
                  · {t.required ? "required" : "optional"} · about {t.minutes} min
                  {t.scope === "organisation" ? " · done by their organisation’s administrator" : ""}
                  {t.kind === "document" ? ` · reviewed by ${t.quality ? "Quality" : preview === "staff" ? "People & Culture" : "Partner Operations"}` : ""}
                </span>
              </li>
            ))}
            <li>Review and start.</li>
          </ol>
          <p className="mt-2 text-sm text-ink-muted">
            {route.filter((t) => t.required).length} required, about {route.reduce((n, t) => n + (t.scope === "person" ? t.minutes : 0), 0)} minutes of their
            own tasks. Learning they can’t open, and a starting-point check with nothing published for their role, are left out for them automatically.
          </p>
        </section>
      )}

      {data.draft && data.changes && !rows && data.canEdit && (
        <section aria-labelledby="req-release" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <h2 id="req-release" className="font-serif text-xl font-semibold">
            Release version {data.draft.version}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Nobody’s work is reset. What people have already done for a task stands, and {data.people} {data.people === 1 ? "person is" : "people are"} already
            active.
          </p>
          {data.changes.added.length > 0 && (
            <fieldset className="mt-3">
              <legend className="font-semibold">New tasks: do they also apply to people who are already active?</legend>
              <p className="text-sm text-ink-muted">
                Ticked, an active person gets that one task to do (their account shows “Renewal required” until it’s approved). Unticked, only people who start
                from now on get it.
              </p>
              <div className="mt-1 flex flex-col">
                {data.changes.added.map((t) => (
                  <label key={t.id} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-action)]"
                      checked={forExisting.includes(t.id)}
                      onChange={(e) => setForExisting(e.target.checked ? [...forExisting, t.id] : forExisting.filter((x) => x !== t.id))}
                    />
                    {t.title} <span className="text-sm text-ink-muted">{t.required ? "required" : "optional"}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {data.changes.changed.length > 0 && <p className="mt-2 text-sm">Changed: {data.changes.changed.map((t) => t.title).join(", ")}.</p>}
          {data.changes.removed.length > 0 && (
            <p className="mt-2 text-sm">
              Removed: {data.changes.removed.map((t) => t.title).join(", ")}. What people did for these is kept but no longer asked for.
            </p>
          )}
          <button
            type="button"
            className={cx(btn.primary, "mt-3")}
            onClick={() => {
              if (window.confirm(`Release version ${data.draft!.version}? It applies from now, and your name is recorded as releasing it.`))
                void send({ action: "release", existing: forExisting });
            }}
          >
            Release version {data.draft.version}
          </button>
        </section>
      )}
      {data.history.length > 0 && (
        <p className="text-sm text-ink-muted">Earlier versions kept: {data.history.map((h) => `version ${h.version} (${h.approvedBy})`).join(", ")}.</p>
      )}
    </div>
  );
}
