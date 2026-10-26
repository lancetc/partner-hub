"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";

/* Learning paths: a named set of lessons, in order, that an administrator assigns to people. */

type LessonInfo = {
  summary?: string;
  slug: string;
  title: string;
  minutes: number;
  track: string | null;
};
type Person = {
  id: string;
  name: string;
  audience: string;
  service_role: string | null;
  org: string;
};
type PathSummary = {
  id: string;
  name: string;
  description: string;
  audience: string;
  inOrder: boolean;
  allowSkip: boolean;
  lessons: LessonInfo[];
  minutes: number;
  assigned: number;
  finished: number;
  canEdit: boolean;
};
type ListData = {
  paths: PathSummary[];
  people: Person[];
  catalogue: LessonInfo[];
};
type Step = LessonInfo & { completedAt: string | null; locked: boolean };
type Assignment = {
  userId: string;
  name: string;
  org: string;
  dueDate: string | null;
  assignedAt: string;
  steps: Step[];
  completed: number;
  total: number;
  nextSlug: string | null;
  done: boolean;
};
type Detail = {
  id: string;
  name: string;
  description: string;
  audience: string;
  inOrder: boolean;
  allowSkip: boolean;
  lessons: string[];
  canEdit: boolean;
  assignments: Assignment[];
  people: Person[];
  catalogue: LessonInfo[];
};

const trackLabel: Record<string, string> = {
  core: "Everyone",
  partner: "Service partners",
  coordinator: "Coordinators",
  briefing: "Policy briefings",
};
const personLabel = (p: Person) => `${p.org} · ${p.service_role ?? p.audience}`;

export function LearningPathList() {
  const { data, error } = useApi<ListData>("/api/admin/learning-paths");
  return (
    <AdminShell title="Learning paths">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-3xl text-ink-muted">
          A learning path is a named set of lessons in order. Build one, then assign it to the people who need it. They’ll see it on their Learning page with
          their progress and what’s next.
        </p>
        <Link href="/admin/learning-paths/new" className={btn.primary}>
          <Icon name="plus" className="size-4" /> New learning path
        </Link>
      </div>
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : !data.paths.length ? (
        <p className="mt-6 rounded-3xl border border-dashed border-line-strong p-6 text-center text-ink-muted">No learning paths yet.</p>
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {data.paths.map((p) => (
            <li key={p.id} className="relative flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5 hover:border-line-strong">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {p.audience && <Badge tone="info">{p.audience}</Badge>}
                  {!p.lessons.length && <Badge tone="warn">Planned: no lessons yet</Badge>}
                  {p.allowSkip && <Badge tone="warn">Testing: skipping allowed</Badge>}
                </div>
                <p className="mt-2 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
                  {p.lessons.length} {p.lessons.length === 1 ? "lesson" : "lessons"} · {p.minutes} min
                  {p.inOrder ? " · in order" : ""}
                </p>
                <h2 className="mt-1 font-serif text-xl font-semibold">
                  <Link href={`/admin/learning-paths/${p.id}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
                    {p.name}
                  </Link>
                </h2>
                {p.description && <p className="mt-1 text-sm text-ink-muted">{p.description}</p>}
              </div>
              <ol className="flex flex-wrap items-center gap-1.5 text-sm">
                {p.lessons.map((l, i) => (
                  <li key={l.slug} className="flex items-center gap-1.5">
                    <span className="rounded-full bg-muted px-2.5 py-1">
                      <span className="font-semibold text-accent">{i + 1}</span> {l.title}
                    </span>
                    {i < p.lessons.length - 1 && <Icon name="arrow-right" className="size-3.5 text-ink-muted" />}
                  </li>
                ))}
              </ol>
              <p className="mt-auto text-sm">
                <strong>{p.assigned}</strong> {p.assigned === 1 ? "person" : "people"} assigned · <strong>{p.finished}</strong> finished
              </p>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

export function LearningPathEditor({ id }: { id?: string }) {
  const isNew = !id;
  const list = useApi<ListData>(isNew ? "/api/admin/learning-paths" : null);
  const detail = useApi<Detail>(id ? `/api/admin/learning-paths/${id}` : null);
  const source = isNew ? list.data : detail.data;
  const loadError = isNew ? list.error : detail.error;
  if (loadError || !source) {
    return (
      <AdminShell title={isNew ? "New learning path" : "Learning path"} back={{ href: "/admin/learning-paths", label: "Learning paths" }}>
        {loadError ? <ErrorNote text={loadError} /> : <p className="text-ink-muted">Loading…</p>}
      </AdminShell>
    );
  }
  return <PathForm id={id} catalogue={source.catalogue} detail={detail.data} reload={detail.reload} />;
}

function PathForm({ id, catalogue, detail, reload }: { id?: string; catalogue: LessonInfo[]; detail: Detail | null; reload: () => void }) {
  const router = useRouter();
  const isNew = !id;
  const [name, setName] = useState(detail?.name ?? "");
  const [description, setDescription] = useState(detail?.description ?? "");
  const [audience, setAudience] = useState(detail?.audience ?? "");
  const [inOrder, setInOrder] = useState(detail?.inOrder ?? true);
  const [allowSkip, setAllowSkip] = useState(detail?.allowSkip ?? false);
  const [picked, setPicked] = useState<string[]>(detail?.lessons ?? []);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const info = (slug: string) => catalogue.find((l) => l.slug === slug);
  const minutes = picked.reduce((n, s) => n + (info(s)?.minutes ?? 0), 0);
  const canEdit = isNew || Boolean(detail?.canEdit);
  const change = (fn: () => void) => {
    fn();
    setDirty(true);
    setNotice(null);
  };
  const move = (i: number, by: number) =>
    change(() =>
      setPicked((p) => {
        const n = [...p];
        [n[i], n[i + by]] = [n[i + by], n[i]];
        return n;
      }),
    );

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = { name, description, audience, inOrder, allowSkip, lessons: picked };
      if (isNew) {
        const r = await api<{ id: string }>("/api/admin/learning-paths", {
          body: payload,
        });
        router.push(`/admin/learning-paths/${r.id}`);
        return;
      }
      await api(`/api/admin/learning-paths/${id}`, {
        method: "PUT",
        body: payload,
      });
      setDirty(false);
      setNotice("Saved. People already assigned see the updated lessons straight away.");
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!window.confirm(`Archive “${name}”? It disappears for the people assigned to it. Their lesson completions are kept.`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/learning-paths/${id}`, { method: "DELETE" });
      router.push("/admin/learning-paths");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <AdminShell title={isNew ? "New learning path" : name || "Learning path"} back={{ href: "/admin/learning-paths", label: "Learning paths" }}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-6">
          <section className="rounded-3xl border border-line bg-surface p-5">
            <h2 className="mb-4 font-serif text-xl font-semibold">About this path</h2>
            <fieldset disabled={!canEdit} className="grid gap-4">
              <Field label="Name" hint="People see this on their Learning page.">
                <input
                  className={input}
                  value={name}
                  onChange={(e) => change(() => setName(e.target.value))}
                  placeholder="For example: Service partner essentials"
                  maxLength={120}
                />
              </Field>
              <Field label="Who it’s for" hint="For example: Care Coordinators, or All staff and partners.">
                <input className={input} value={audience} onChange={(e) => change(() => setAudience(e.target.value))} maxLength={120} />
              </Field>
              <Field label="What it covers (optional)">
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[0.98rem]"
                  value={description}
                  onChange={(e) => change(() => setDescription(e.target.value))}
                  maxLength={500}
                />
              </Field>
              <label className="flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 accent-[var(--action)]"
                  checked={inOrder}
                  onChange={(e) => change(() => setInOrder(e.target.checked))}
                />
                <span>
                  <span className="font-semibold">Complete in order</span>
                  <span className="block text-sm text-ink-muted">Each lesson opens once the one before it is finished.</span>
                </span>
              </label>
              <label className="flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 accent-[var(--action)]"
                  checked={allowSkip}
                  onChange={(e) => change(() => setAllowSkip(e.target.checked))}
                />
                <span>
                  <span className="font-semibold">Allow skipping before audio or video finishes</span>
                  <span className="block text-sm text-ink-muted">
                    For testers. People on this path can continue or swipe on without waiting for audio, video or Required completion. They still answer quizzes
                    and other questions.
                  </span>
                </span>
              </label>
            </fieldset>
          </section>

          {canEdit && (
            <LessonChecklist
              catalogue={catalogue}
              picked={picked}
              onToggle={(slug, on) => change(() => setPicked(on ? [...picked, slug] : picked.filter((s) => s !== slug)))}
            />
          )}

          <section className="rounded-3xl border border-line bg-surface p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl font-semibold">{canEdit ? "2. Put them in order" : "Lessons"}</h2>
              <span className="text-sm text-ink-muted">
                {picked.length} {picked.length === 1 ? "lesson" : "lessons"} · about {minutes} minutes
              </span>
            </div>
            {!picked.length ? (
              <p className="rounded-2xl border border-dashed border-line-strong p-4 text-center text-ink-muted">
                Tick lessons above and they appear here in order.
              </p>
            ) : (
              <ol className="flex flex-col gap-2">
                {picked.map((slug, i) => {
                  const l = info(slug);
                  return (
                    <li key={slug} className="flex items-center gap-3 rounded-2xl bg-muted p-3">
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-action font-mulish text-sm font-extrabold text-on-action">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold leading-snug">{l?.title ?? slug}</span>
                        <span className="text-sm text-ink-muted">
                          {l?.minutes} min · {trackLabel[l?.track ?? ""] ?? ""}
                        </span>
                      </span>
                      {canEdit && (
                        <span className="flex shrink-0 gap-0.5">
                          <button type="button" className={btn.quiet} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${l?.title} earlier`}>
                            <Icon name="arrow-left" className="size-4 rotate-90" />
                          </button>
                          <button
                            type="button"
                            className={btn.quiet}
                            disabled={i === picked.length - 1}
                            onClick={() => move(i, 1)}
                            aria-label={`Move ${l?.title} later`}
                          >
                            <Icon name="arrow-right" className="size-4 rotate-90" />
                          </button>
                          <button
                            type="button"
                            className={btn.quiet}
                            onClick={() => change(() => setPicked(picked.filter((s) => s !== slug)))}
                            aria-label={`Remove ${l?.title}`}
                          >
                            <Icon name="close" className="size-4" />
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {error && <ErrorNote text={error} />}
          {notice && (
            <p role="status" className="rounded-2xl bg-tealtint p-3 text-sm">
              {notice}
            </p>
          )}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn.primary} disabled={busy || (!dirty && !isNew)} onClick={save}>
                {busy ? "Saving…" : isNew ? "Create learning path" : "Save changes"}
              </button>
              {!isNew && (
                <button type="button" className={btn.danger} disabled={busy} onClick={archive}>
                  Archive
                </button>
              )}
            </div>
          )}
          {!canEdit && (
            <p className="text-sm text-ink-muted">Made by another organisation’s administrator or a learning author. You can assign it to your people.</p>
          )}
        </div>

        <aside>
          {isNew ? (
            <div className="rounded-3xl border border-dashed border-line-strong p-5 text-sm text-ink-muted">
              <h2 className="mb-1 font-semibold text-ink">Assign people</h2>
              Create the path first, then assign it to people here.
            </div>
          ) : (
            detail &&
            (detail.lessons.length ? (
              <People detail={detail} onChange={reload} />
            ) : (
              <div className="rounded-3xl border border-dashed border-line-strong p-5 text-sm text-ink-muted">
                <h2 className="mb-1 font-semibold text-ink">Assign people</h2>
                This path is still being planned. Tick at least one lesson and save, then you can assign it.
              </div>
            ))
          )}
        </aside>
      </div>
    </AdminShell>
  );
}

function People({ detail, onChange }: { detail: Detail; onChange: () => void }) {
  const [choosing, setChoosing] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assignedIds = new Set(detail.assignments.map((a) => a.userId));
  const available = detail.people.filter((p) => !assignedIds.has(p.id));

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/learning-paths/${detail.id}/assignments`, { body });
      setChoosing([]);
      setDue("");
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-24">
      <section className="rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-serif text-xl font-semibold">Assigned</h2>
        {!detail.assignments.length ? (
          <p className="mt-2 text-sm text-ink-muted">Nobody yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {detail.assignments.map((a) => {
              const next = a.steps.find((s) => s.slug === a.nextSlug);
              return (
                <li key={a.userId} className="py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{a.name}</p>
                      <p className="text-xs text-ink-muted">{a.org}</p>
                    </div>
                    {a.done ? (
                      <Badge tone="good">Finished</Badge>
                    ) : (
                      a.dueDate && <Badge tone={a.dueDate < new Date().toISOString().slice(0, 10) ? "bad" : "neutral"}>Due {formatDate(a.dueDate)}</Badge>
                    )}
                    <button
                      type="button"
                      className={btn.quiet}
                      disabled={busy}
                      onClick={() => send({ action: "remove", userId: a.userId })}
                      aria-label={`Remove ${a.name}`}
                    >
                      <Icon name="close" className="size-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${a.completed} of ${a.total} lessons done`}>
                      <div
                        className="h-full rounded-full bg-action"
                        style={{
                          width: `${a.total ? (a.completed / a.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-ink-muted">
                      {a.completed}/{a.total}
                    </span>
                  </div>
                  {next && <p className="mt-1 text-xs text-ink-muted">Next: {next.title}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-serif text-xl font-semibold">Assign people</h2>
        {!available.length ? (
          <p className="mt-2 text-sm text-ink-muted">Everyone you can assign already has this path.</p>
        ) : (
          <>
            <ul className="mt-3 flex flex-col gap-1">
              {available.map((p) => (
                <li key={p.id}>
                  <label
                    className={cx("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-muted", choosing.includes(p.id) && "bg-tealtint")}
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--action)]"
                      checked={choosing.includes(p.id)}
                      onChange={(e) => setChoosing(e.target.checked ? [...choosing, p.id] : choosing.filter((x) => x !== p.id))}
                    />
                    <span>
                      <span className="block font-medium">{p.name}</span>
                      <span className="text-xs text-ink-muted">{personLabel(p)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <Field label="Due date (optional)" className="mt-3">
              <input type="date" className={input} value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
            <button
              type="button"
              className={cx(btn.primary, "mt-3 w-full")}
              disabled={busy || !choosing.length}
              onClick={() =>
                send({
                  action: "assign",
                  userIds: choosing,
                  dueDate: due || null,
                })
              }
            >
              Assign {choosing.length ? `${choosing.length} ${choosing.length === 1 ? "person" : "people"}` : ""}
            </button>
          </>
        )}
        {error && (
          <div className="mt-3">
            <ErrorNote text={error} />
          </div>
        )}
      </section>
    </div>
  );
}

/** Every lesson that can go in a path, with a checkbox. Ticking adds it to the end of the order. */
function LessonChecklist({ catalogue, picked, onToggle }: { catalogue: LessonInfo[]; picked: string[]; onToggle: (slug: string, on: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState<string>("all");
  const tracks = [...new Set(catalogue.map((l) => l.track).filter((t): t is string => Boolean(t)))];
  const q = query.trim().toLowerCase();
  const shown = catalogue.filter((l) => (track === "all" || l.track === track) && (!q || `${l.title} ${l.summary ?? ""}`.toLowerCase().includes(q)));
  return (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold">1. Choose lessons</h2>
        <span className="text-sm text-ink-muted">
          {picked.length} of {catalogue.length} ticked
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          className={cx(input, "max-w-xs")}
          placeholder="Search lessons"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search lessons"
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by audience">
          {["all", ...tracks].map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={track === t}
              onClick={() => setTrack(t)}
              className={cx(
                "min-h-9 rounded-full border px-3 text-sm",
                track === t ? "border-action bg-tealtint font-semibold" : "border-line-strong hover:bg-muted",
              )}
            >
              {t === "all" ? "All" : (trackLabel[t] ?? t)}
            </button>
          ))}
        </div>
      </div>
      <ul className="mt-3 flex flex-col divide-y divide-line rounded-2xl border border-line">
        {shown.map((l) => {
          const on = picked.includes(l.slug);
          return (
            <li key={l.slug}>
              <label className={cx("flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-muted", on && "bg-tealtint/60")}>
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-[var(--action)]"
                  checked={on}
                  onChange={(e) => onToggle(l.slug, e.target.checked)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug">{l.title}</span>
                  {l.summary && <span className="block text-sm text-ink-muted">{l.summary}</span>}
                </span>
                <span className="shrink-0 text-right text-xs text-ink-muted">
                  <span className="block font-semibold text-ink">{l.minutes} min</span>
                  {trackLabel[l.track ?? ""] ?? ""}
                </span>
              </label>
            </li>
          );
        })}
        {!shown.length && <li className="p-4 text-center text-sm text-ink-muted">No lessons match.</li>}
      </ul>
    </section>
  );
}
