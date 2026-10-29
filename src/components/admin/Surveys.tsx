"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi, type Me } from "@/lib/api";
import { questionTypes, type SurveyQuestion } from "@/content/surveys";
import { cx, formatDate } from "@/lib/format";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";
import { SurveyForm } from "../SurveyForm";
import { confirmAction } from "@/lib/confirm";

/* Surveys: build them, choose where they're asked, read the results. */

type Place = { type: "path" | "lesson"; id: string; title: string };
type SurveyRow = {
  id: string;
  name: string;
  description: string;
  anonymous: boolean;
  required: boolean;
  questions: number;
  usedOn: Place[];
  responses: number;
};
type Attachable = Place & { current: { surveyId: string; surveyName: string } | null };
type Detail = {
  id: string;
  name: string;
  description: string;
  anonymous: boolean;
  required: boolean;
  questions: SurveyQuestion[];
  links: { type: "path" | "lesson"; id: string }[];
  attachable: Attachable[];
  canEdit: boolean;
};
type QuestionResult = SurveyQuestion & {
  answered: number;
  average: number | null;
  counts: { label: string; count: number }[];
  comments?: { text: string; at: string; org: string; name: string | null }[];
};
type Results = {
  id: string;
  name: string;
  anonymous: boolean;
  total: number;
  skipped: number;
  places: { key: string; title: string; type: string; count: number }[];
  questions: QuestionResult[];
};

export function SurveyList() {
  const me = useApi<Me>("/api/me").data;
  const { data, error } = useApi<{ surveys: SurveyRow[] }>("/api/admin/surveys");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(template: "module" | "blank") {
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/admin/surveys", { body: { template } });
      router.push(`/admin/surveys/${r.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Surveys">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-3xl text-ink-muted">
          Ask people what they thought when they finish a learning path, or a single topic. Surveys appear straight after the completion screen, and anything
          skipped waits on their Learning page.
        </p>
        {me?.canAuthor && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.primary} disabled={busy} onClick={() => create("module")}>
              <Icon name="plus" className="size-4" /> New from module feedback template
            </button>
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => create("blank")}>
              Blank survey
            </button>
          </div>
        )}
      </div>
      {(error || err) && (
        <div className="mt-4">
          <ErrorNote text={(error || err)!} />
        </div>
      )}
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {data.surveys.map((s) => (
            <li key={s.id} className="relative flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5 hover:border-line-strong">
              <div className="flex flex-wrap gap-2">
                <Badge tone={s.anonymous ? "info" : "neutral"}>{s.anonymous ? "Anonymous" : "Named"}</Badge>
                <Badge tone={s.required ? "warn" : "neutral"}>{s.required ? "Required" : "Optional"}</Badge>
                {!s.usedOn.length && <Badge tone="warn">Not asked anywhere yet</Badge>}
              </div>
              <div>
                <h2 className="font-serif text-xl font-semibold">
                  <Link href={`/admin/surveys/${s.id}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
                    {s.name}
                  </Link>
                </h2>
                {s.description && <p className="mt-1 text-sm text-ink-muted">{s.description}</p>}
              </div>
              {s.usedOn.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 text-sm">
                  {s.usedOn.map((u) => (
                    <li key={`${u.type}:${u.id}`} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                      <Icon name={u.type === "path" ? "route" : "book"} className="size-3.5 text-accent" /> {u.title}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-auto text-sm">
                {s.questions} questions · <strong>{s.responses}</strong> {s.responses === 1 ? "response" : "responses"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

export function SurveyEditor({ id }: { id: string }) {
  const detail = useApi<Detail>(`/api/admin/surveys/${id}`);
  if (detail.error || !detail.data) {
    return (
      <AdminShell title="Survey" back={{ href: "/admin/surveys", label: "Surveys" }}>
        {detail.error ? <ErrorNote text={detail.error} /> : <p className="text-ink-muted">Loading…</p>}
      </AdminShell>
    );
  }
  return <SurveyWorkspace detail={detail.data} reload={detail.reload} />;
}

const TABS = [
  { id: "questions", label: "Questions" },
  { id: "where", label: "Where it’s asked" },
  { id: "results", label: "Results" },
] as const;

function SurveyWorkspace({ detail, reload }: { detail: Detail; reload: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>(detail.links.length ? "results" : "questions");
  const [name, setName] = useState(detail.name);
  return (
    <AdminShell title={name || "Survey"} back={{ href: "/admin/surveys", label: "Surveys" }}>
      <div role="tablist" aria-label="Survey" className="mb-6 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "-mb-px inline-flex min-h-11 items-center border-b-2 px-4 font-medium",
              tab === t.id ? "border-action text-ink" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.id === "where" && <span className="ml-2 rounded-full bg-muted px-2 text-xs">{detail.links.length}</span>}
          </button>
        ))}
      </div>
      {tab === "questions" && <QuestionsTab detail={detail} onName={setName} reload={reload} />}
      {tab === "where" && <WhereTab detail={detail} reload={reload} />}
      {tab === "results" && <ResultsTab id={detail.id} />}
    </AdminShell>
  );
}

function QuestionsTab({ detail, onName, reload }: { detail: Detail; onName: (n: string) => void; reload: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(detail.name);
  const [description, setDescription] = useState(detail.description);
  const [anonymous, setAnonymous] = useState(detail.anonymous);
  const [required, setRequired] = useState(detail.required);
  const [questions, setQuestions] = useState<SurveyQuestion[]>(detail.questions);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const can = detail.canEdit;

  const change = (fn: () => void) => {
    fn();
    setDirty(true);
    setNotice(null);
  };
  const setQ = (i: number, patch: Partial<SurveyQuestion>) =>
    change(() => setQuestions((qs) => qs.map((q, j) => (j === i ? ({ ...q, ...patch } as SurveyQuestion) : q))));
  const move = (i: number, by: number) =>
    change(() =>
      setQuestions((qs) => {
        const n = [...qs];
        [n[i], n[i + by]] = [n[i + by], n[i]];
        return n;
      }),
    );
  const add = (type: SurveyQuestion["type"]) => {
    let n = questions.length + 1;
    while (questions.some((x) => x.id === `q${n}`)) n++;
    const id = `q${n}`;
    const q: SurveyQuestion =
      type === "choice"
        ? { id, type, prompt: "", required: false, options: ["", ""] }
        : ({ id, type, prompt: "", required: type !== "text" } as SurveyQuestion);
    change(() => setQuestions((qs) => [...qs, q]));
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/surveys/${detail.id}`, { method: "PUT", body: { name, description, anonymous, required, questions } });
      setDirty(false);
      onName(name);
      setNotice("Saved. New answers use these questions.");
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!(await confirmAction("It stops being asked everywhere. Answers already given are kept.", { title: `Archive “${name}”?`, confirmLabel: "Archive" })))
      return;
    setBusy(true);
    try {
      await api(`/api/admin/surveys/${detail.id}`, { method: "DELETE" });
      router.push("/admin/surveys");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex flex-col gap-6">
        <fieldset disabled={!can} className="contents">
          <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5">
            <Field label="Survey name">
              <input className={input} value={name} onChange={(e) => change(() => setName(e.target.value))} maxLength={120} />
            </Field>
            <Field label="Short description (optional)" hint="Shown above the questions.">
              <input className={input} value={description} onChange={(e) => change(() => setDescription(e.target.value))} maxLength={300} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-3 rounded-2xl border border-line-strong p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 accent-[var(--action)]"
                  checked={anonymous}
                  onChange={(e) => change(() => setAnonymous(e.target.checked))}
                />
                <span>
                  <span className="font-semibold">Anonymous</span>
                  <span className="block text-sm text-ink-muted">Answers are stored without names. People are told before they answer.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-line-strong p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 accent-[var(--action)]"
                  checked={required}
                  onChange={(e) => change(() => setRequired(e.target.checked))}
                />
                <span>
                  <span className="font-semibold">Required</span>
                  <span className="block text-sm text-ink-muted">No “Not now” button. Unanswered surveys stay on their Learning page.</span>
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-surface p-5">
            <h2 className="mb-4 font-serif text-xl font-semibold">Questions</h2>
            <ol className="flex flex-col gap-3">
              {questions.map((q, i) => {
                const t = questionTypes.find((x) => x.type === q.type);
                return (
                  <li key={q.id} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-action font-mulish text-xs font-extrabold text-on-action">
                        {i + 1}
                      </span>
                      <span className="text-sm font-semibold text-ink-muted">{t?.label}</span>
                      <span className="ml-auto flex gap-0.5">
                        <button type="button" className={btn.quiet} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move question up">
                          <Icon name="arrow-left" className="size-4 rotate-90" />
                        </button>
                        <button
                          type="button"
                          className={btn.quiet}
                          disabled={i === questions.length - 1}
                          onClick={() => move(i, 1)}
                          aria-label="Move question down"
                        >
                          <Icon name="arrow-right" className="size-4 rotate-90" />
                        </button>
                        <button
                          type="button"
                          className={btn.quiet}
                          onClick={() => change(() => setQuestions(questions.filter((_, j) => j !== i)))}
                          aria-label="Delete question"
                        >
                          <Icon name="close" className="size-4" />
                        </button>
                      </span>
                    </div>
                    <input
                      className={input}
                      value={q.prompt}
                      placeholder="Question wording"
                      onChange={(e) => setQ(i, { prompt: e.target.value })}
                      aria-label={`Question ${i + 1} wording`}
                    />
                    {q.type === "choice" && (
                      <div className="flex flex-col gap-1.5 pl-2">
                        {q.options.map((o, j) => (
                          <div key={j} className="flex items-center gap-2">
                            <span className="size-4 shrink-0 rounded-full border-2 border-line-strong" aria-hidden />
                            <input
                              className={input}
                              value={o}
                              placeholder={`Option ${j + 1}`}
                              onChange={(e) => setQ(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })}
                              aria-label={`Option ${j + 1}`}
                            />
                            <button
                              type="button"
                              className={btn.quiet}
                              disabled={q.options.length <= 2}
                              onClick={() => setQ(i, { options: q.options.filter((_, k) => k !== j) })}
                              aria-label="Remove option"
                            >
                              <Icon name="minus" className="size-4" />
                            </button>
                          </div>
                        ))}
                        <button type="button" className={cx(btn.quiet, "self-start")} onClick={() => setQ(i, { options: [...q.options, ""] })}>
                          <Icon name="plus" className="size-4" /> Add option
                        </button>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--action)]"
                        checked={q.required}
                        onChange={(e) => setQ(i, { required: e.target.checked })}
                      />
                      Must be answered
                    </label>
                  </li>
                );
              })}
            </ol>
            {can && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-2 text-sm font-semibold">Add a question</p>
                <div className="flex flex-wrap gap-2">
                  {questionTypes.map((t) => (
                    <button key={t.type} type="button" className={btn.secondary} onClick={() => add(t.type)} title={t.hint}>
                      <Icon name="plus" className="size-4" /> {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </fieldset>

        {error && <ErrorNote text={error} />}
        {notice && (
          <p role="status" className="rounded-2xl bg-tealtint p-3 text-sm">
            {notice}
          </p>
        )}
        {can ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.primary} disabled={busy || !dirty} onClick={save}>
              {busy ? "Saving…" : "Save survey"}
            </button>
            <button type="button" className={btn.danger} disabled={busy} onClick={archive}>
              Archive
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Learning authors build surveys. You can read the results for your organisation.</p>
        )}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-2 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">What learners see</p>
        <SurveyForm
          key={JSON.stringify(questions)}
          survey={{ id: "preview", name, description, anonymous, required, questions }}
          context="You finished Welcome to Trilogy Care"
          onSkip={() => {}}
          preview
        />
      </aside>
    </div>
  );
}

function WhereTab({ detail, reload }: { detail: Detail; reload: () => void }) {
  const [picked, setPicked] = useState(new Set(detail.links.map((l) => `${l.type}:${l.id}`)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const original = new Set(detail.links.map((l) => `${l.type}:${l.id}`));
  const dirty = picked.size !== original.size || [...picked].some((k) => !original.has(k));
  const moving = detail.attachable.filter((a) => picked.has(`${a.type}:${a.id}`) && a.current && a.current.surveyId !== detail.id);

  const toggle = (k: string, on: boolean) => {
    const n = new Set(picked);
    if (on) n.add(k);
    else n.delete(k);
    setPicked(n);
    setNotice(null);
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const targets = [...picked].map((k) => {
        const [type, id] = k.split(":");
        return { type, id };
      });
      await api(`/api/admin/surveys/${detail.id}/links`, { method: "PUT", body: { targets } });
      setNotice("Saved. People who finish these from now on are asked this survey.");
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const group = (type: "path" | "lesson", title: string, hint: string) => (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{hint}</p>
      <ul className="mt-3 flex flex-col divide-y divide-line rounded-2xl border border-line">
        {detail.attachable
          .filter((a) => a.type === type)
          .map((a) => {
            const k = `${a.type}:${a.id}`;
            const on = picked.has(k);
            const other = a.current && a.current.surveyId !== detail.id ? a.current : null;
            return (
              <li key={k}>
                <label className={cx("flex cursor-pointer items-center gap-3 px-3 py-3 hover:bg-muted", on && "bg-tealtint/60")}>
                  <input
                    type="checkbox"
                    disabled={!detail.canEdit}
                    className="size-5 shrink-0 accent-[var(--action)]"
                    checked={on}
                    onChange={(e) => toggle(k, e.target.checked)}
                  />
                  <span className="min-w-0 flex-1 font-medium">{a.title}</span>
                  {other && <span className="shrink-0 text-xs text-ink-muted">Now asks “{other.surveyName}”</span>}
                </label>
              </li>
            );
          })}
      </ul>
    </section>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {group("path", "When someone finishes a learning path", "Asked once they’ve completed every topic in the path. This is the module survey.")}
      {group("lesson", "When someone finishes a single topic", "Optional. Asked on that topic’s completion screen.")}
      {moving.length > 0 && (
        <p className="rounded-2xl border-2 border-dashed border-gold p-3 text-sm">
          Each place asks one survey. Saving moves {moving.map((m) => `“${m.title}”`).join(", ")} to this survey.
        </p>
      )}
      <p className="text-sm text-ink-muted">Only people who finish after you save are asked, so nobody gets a survey about work they did months ago.</p>
      {error && <ErrorNote text={error} />}
      {notice && (
        <p role="status" className="rounded-2xl bg-tealtint p-3 text-sm">
          {notice}
        </p>
      )}
      {detail.canEdit && (
        <button type="button" className={cx(btn.primary, "self-start")} disabled={busy || !dirty} onClick={save}>
          {busy ? "Saving…" : "Save where it’s asked"}
        </button>
      )}
    </div>
  );
}

function ResultsTab({ id }: { id: string }) {
  const [place, setPlace] = useState("");
  const { data, error } = useApi<Results>(`/api/admin/surveys/${id}/results${place ? `?place=${encodeURIComponent(place)}` : ""}`);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <dl className="flex gap-6">
          <div>
            <dt className="text-sm text-ink-muted">Responses</dt>
            <dd className="font-serif text-3xl font-semibold">{data.total}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">Skipped</dt>
            <dd className="font-serif text-3xl font-semibold">{data.skipped}</dd>
          </div>
        </dl>
        {data.places.length > 1 && (
          <Field label="Where">
            <select className={input} value={place} onChange={(e) => setPlace(e.target.value)}>
              <option value="">Everywhere</option>
              {data.places.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.title} ({p.count})
                </option>
              ))}
            </select>
          </Field>
        )}
        <a href={`/api/admin/surveys/${id}/export`} className={cx(btn.secondary, "ml-auto")} download>
          <Icon name="file" className="size-4" /> Export CSV
        </a>
      </div>
      {!data.total ? (
        <p className="rounded-3xl border border-dashed border-line-strong p-6 text-center text-ink-muted">No answers yet. They appear here as people finish.</p>
      ) : (
        <ol className="grid gap-4 lg:grid-cols-2">
          {data.questions.map((q, i) => {
            const max = Math.max(1, ...q.counts.map((c) => c.count));
            return (
              <li key={q.id} className={cx("rounded-3xl border border-line bg-surface p-5", q.type === "text" && "lg:col-span-2")}>
                <p className="text-sm text-ink-muted">
                  {i + 1}. {questionTypes.find((t) => t.type === q.type)?.label} · {q.answered} answered
                </p>
                <h3 className="mt-1 font-semibold leading-snug">{q.prompt}</h3>
                {q.average !== null && (
                  <p className="mt-2">
                    <span className="font-serif text-3xl font-semibold">{q.average}</span> <span className="text-ink-muted">out of 5 on average</span>
                  </p>
                )}
                {q.counts.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {q.counts.map((c) => (
                      <li key={c.label} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2 text-sm">
                        <span className="truncate text-ink-muted">{c.label}</span>
                        <span className="h-3 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-action" style={{ width: `${(c.count / max) * 100}%` }} />
                        </span>
                        <span className="text-right font-semibold">{c.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {q.comments && (
                  <ul className="mt-3 flex flex-col gap-2">
                    {q.comments.length ? (
                      q.comments.map((c, j) => (
                        <li key={j} className="rounded-2xl bg-muted p-3">
                          <p>“{c.text}”</p>
                          <p className="mt-1 text-xs text-ink-muted">
                            {c.name ? `${c.name} · ` : ""}
                            {c.org} · {formatDate(c.at)}
                          </p>
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-ink-muted">No comments yet.</li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {data.anonymous && <p className="text-sm text-ink-muted">This survey is anonymous, so answers show the organisation but not the person.</p>}
    </div>
  );
}
