"use client";

import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { AuditorBlock } from "@/lib/magazine";
import {
  ACTIONS,
  AUDITOR_NOTICE,
  buildDebrief,
  CATEGORIES,
  CATEGORY_ORDER,
  DECISION_ORDER,
  DECISIONS,
  emptyState,
  MODES,
  RULE_FAMILIES,
  scoreAuditor,
  showDate,
  submitProblems,
  summary,
  type AuditDebrief,
  type AuditDoc,
  type AuditState,
  type Category,
  type Decision,
  type Mark,
  type NextAction,
} from "@/lib/auditor";
import type { auditorState } from "@/server/auditor";
import { Icon } from "../Icon";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  Document Auditor (docs/document-auditor.md). Each field on a document is a button: select it to place a numbered
  marker and say what you noticed, comparing it with the trusted records beside it. A missing document is a row in
  the checklist, with no phantom spot to tap. "Review as a table" lists every field, so the whole case can be done
  by keyboard or screen reader with the same result. Nothing is revealed until the decision is submitted.

  In the editor's preview it runs against the block as written (answer key included) and stores nothing.
*/

type Loaded = ReturnType<typeof auditorState>;
type Target = { fieldId: string; missingId: string };
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const input = "min-h-11 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-base";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const good = "rounded-2xl bg-[#e3f4ea] p-4 text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const bad = "rounded-2xl bg-[#fde2e0] p-4 text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]";
const ZOOM = ["text-base", "text-lg", "text-xl"] as const;
const errorText = (e: unknown, d: string) => (e instanceof Error ? e.message : d);
const sameTarget = (m: Target, t: Target) => (t.fieldId ? m.fieldId === t.fieldId : m.missingId === t.missingId);

export function DocumentAuditor({ block: b, ctx }: { block: AuditorBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/auditor`;
  const loaded = useApi<Loaded>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<AuditState | null>(ctx.preview ? emptyState() : null);
  const [debrief, setDebrief] = useState<AuditDebrief | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [docId, setDocId] = useState(b.docs.find((d) => d.kind === "document")?.id ?? "");
  const [open, setOpen] = useState<Target | null>(null);
  const [table, setTable] = useState(false);
  const [zoom, setZoom] = useState(0);
  const dirty = useRef(false);
  const top = useRef<HTMLDivElement>(null);
  const engaged = useRef(false);

  if (!ctx.preview && loaded.data && s === null) {
    setS(loaded.data.state);
    setDebrief(loaded.data.debrief);
    setHint(loaded.data.hint);
  }
  useEffect(() => {
    if (ctx.preview || !s || !dirty.current || s.stage === 1) return;
    const t = setTimeout(() => {
      dirty.current = false;
      api(url, { body: { blockId: b.id, state: s } }).catch(() => undefined);
    }, 600);
    return () => clearTimeout(t);
  }, [s, ctx.preview, url, b.id]);
  // Viewing the debrief finishes the activity.
  useEffect(() => {
    if (!debrief || engaged.current) return;
    engaged.current = true;
    ctx.engaged(b.id);
  }, [debrief, ctx, b.id]);

  if (!ctx.preview && loaded.error)
    return (
      <Shell b={b}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  if (!s)
    return (
      <Shell b={b}>
        <p className="text-ink-muted">Loading…</p>
      </Shell>
    );

  const change = (fn: (prev: AuditState) => Partial<AuditState>) => {
    dirty.current = true;
    setS((prev) => (prev ? { ...prev, ...fn(prev) } : prev));
  };
  const markOf = (t: Target) => s.marks.find((m) => sameTarget(m, t));
  const numberOf = (t: Target) => s.marks.findIndex((m) => sameTarget(m, t)) + 1;
  const saveMark = (t: Target, patch: Partial<Mark>) =>
    change((prev) => {
      const has = prev.marks.find((m) => sameTarget(m, t));
      if (has) return { marks: prev.marks.map((m) => (m === has ? { ...m, ...patch } : m)) };
      const id = `m${Date.now().toString(36)}`;
      return { marks: [...prev.marks, { id, fieldId: t.fieldId, missingId: t.missingId, category: "", note: "", compared: [], ...patch }] };
    });
  const removeMark = (t: Target) => {
    change((prev) => ({ marks: prev.marks.filter((m) => !sameTarget(m, t)) }));
    setOpen(null);
  };
  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
    } catch (e) {
      setProblem(errorText(e, "That didn’t send. Your work is still here."));
    } finally {
      setBusy(false);
    }
  };
  const focusTop = () => requestAnimationFrame(() => top.current?.focus());
  const submit = () =>
    run(async () => {
      const problems = submitProblems(s);
      if (problems.length) throw new Error(`Not yet. ${problems.join(" ")}`);
      if (ctx.preview) {
        const done = { ...s, stage: 1 as const };
        setS(done);
        setDebrief(buildDebrief(b, done, scoreAuditor(b, done)));
      } else {
        const out = await api<Loaded>(url, { body: { action: "submit", blockId: b.id, state: s } });
        dirty.current = false;
        setS(out.state);
        setDebrief(out.debrief);
        setHint(null);
        ctx.activity(b.id, { outcome: out.state.decision || "submitted" });
      }
      setOpen(null);
      focusTop();
    });
  const answerVariant = (d: Decision) =>
    run(async () => {
      if (ctx.preview) {
        const next = { ...s, variant: d };
        setS(next);
        setDebrief(buildDebrief(b, next, scoreAuditor(b, next)));
      } else {
        const out = await api<Loaded>(url, { body: { action: "variant", blockId: b.id, variant: d } });
        setS(out.state);
        setDebrief(out.debrief);
      }
    });
  const restart = () =>
    run(async () => {
      if (ctx.preview) {
        setS(emptyState());
        setHint(b.hint || null);
      } else {
        const out = await api<Loaded>(url, { body: { action: "restart", blockId: b.id } });
        setS(out.state);
        setHint(out.hint);
      }
      setDebrief(null);
      engaged.current = false;
      focusTop();
    });

  const docs = b.docs.filter((d) => d.kind === "document");
  const records = b.docs.filter((d) => d.kind === "record");
  const doc = docs.find((d) => d.id === docId) ?? docs[0];
  const panel = (t: Target) =>
    open && sameTarget(open, t) ? (
      <MarkPanel
        records={records}
        mark={markOf(t)}
        number={numberOf(t) || s.marks.length + 1}
        missing={Boolean(t.missingId)}
        onSave={(patch) => saveMark(t, patch)}
        onRemove={() => removeMark(t)}
        onClose={() => setOpen(null)}
      />
    ) : null;

  return (
    <Shell b={b}>
      <div ref={top} tabIndex={-1} className="outline-none">
        <Intro b={b} />
        {hint && !debrief && (
          <p className={cx(warn, "mt-3")} role="note">
            <span className="font-semibold">A hint for this try: </span>
            {hint}
          </p>
        )}
        {debrief ? (
          <Debrief b={b} d={debrief} busy={busy} onVariant={answerVariant} onRestart={restart} />
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Text size</span>
              {ZOOM.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={cx(secondary, "min-h-10 px-3", zoom === i && "border-action bg-tealtint")}
                  aria-pressed={zoom === i}
                  onClick={() => setZoom(i)}
                >
                  <span className={ZOOM[i]}>A</span>
                  <span className="sr-only">{["Standard", "Larger", "Largest"][i]} text</span>
                </button>
              ))}
              <button type="button" className={cx(secondary, "min-h-10")} aria-pressed={table} onClick={() => setTable(!table)}>
                <Icon name="list" className="size-4" /> {table ? "Show the documents" : "Review as a table"}
              </button>
            </div>

            <div className={cx("mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]", ZOOM[zoom])}>
              <div className="min-w-0">
                {table ? (
                  <FieldTable docs={docs} markOf={markOf} numberOf={numberOf} open={open} setOpen={setOpen} panel={panel} />
                ) : (
                  <>
                    <div role="tablist" aria-label="Documents" className="flex flex-wrap gap-2">
                      {docs.map((d) => {
                        const n = d.fields.filter((f) => markOf({ fieldId: f.id, missingId: "" })).length;
                        return (
                          <button
                            key={d.id}
                            type="button"
                            role="tab"
                            aria-selected={d.id === doc.id}
                            className={cx(secondary, "min-h-10 text-sm", d.id === doc.id && "border-action bg-tealtint")}
                            onClick={() => (setDocId(d.id), setOpen(null))}
                          >
                            <Icon name="doc" className="size-4" /> {d.title}
                            {n > 0 && <span className="rounded-full bg-action px-2 text-xs text-on-action">{n}</span>}
                          </button>
                        );
                      })}
                    </div>
                    <DocumentPage doc={doc} markOf={markOf} numberOf={numberOf} open={open} setOpen={setOpen} panel={panel} />
                  </>
                )}
                <section aria-labelledby={`${b.id}-missing`} className={cx(box, "mt-4")}>
                  <h4 id={`${b.id}-missing`} className="font-semibold">
                    Missing documents
                  </h4>
                  <p className="text-sm text-ink-muted">
                    Mark a document that should be in the pack but isn’t. Not every document is needed for every supplier.
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {b.missing.map((m) => {
                      const t = { fieldId: "", missingId: m.id };
                      const has = markOf(t);
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            className={cx(
                              "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left ring-1",
                              has ? "bg-tealtint ring-action" : "ring-line hover:bg-muted",
                            )}
                            aria-expanded={Boolean(open && sameTarget(open, t))}
                            onClick={() => setOpen(open && sameTarget(open, t) ? null : t)}
                          >
                            {has ? <Marker n={numberOf(t)} /> : <Icon name="plus" className="size-4 shrink-0" />}
                            <span className="flex-1">
                              {m.label}
                              {m.note && <span className="block text-sm text-ink-muted">{m.note}</span>}
                            </span>
                            {has && <span className="text-sm font-semibold">{has.category ? CATEGORIES[has.category] : "Say what you noticed"}</span>}
                          </button>
                          {panel(t)}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </div>
              <aside className="flex min-w-0 flex-col gap-3" aria-label="Trusted records and rules">
                {records.map((r) => (
                  <section key={r.id} className={box} aria-label={r.title}>
                    <h4 className="flex items-center gap-2 font-semibold">
                      <Icon name="shield" className="size-4 text-accent" /> {r.title}
                    </h4>
                    {r.subtitle && <p className="text-sm text-ink-muted">{r.subtitle}</p>}
                    <dl className="mt-2 flex flex-col gap-2">
                      {r.fields.map((f) => {
                        const by = s.marks.map((m, i) => (m.compared.includes(f.id) ? i + 1 : 0)).filter(Boolean);
                        return (
                          <div key={f.id}>
                            <dt className="text-sm font-semibold">{f.label}</dt>
                            <dd>{f.value}</dd>
                            {by.length > 0 && <dd className="text-sm text-accent">Compared with marker {by.join(", ")}</dd>}
                          </div>
                        );
                      })}
                    </dl>
                  </section>
                ))}
                <Rules b={b} />
              </aside>
            </div>

            <Markers
              b={b}
              s={s}
              onEdit={(t) => (t.fieldId && setDocId(b.docs.find((d) => d.fields.some((f) => f.id === t.fieldId))?.id ?? docId), setOpen(t))}
            />
            <DecisionRail b={b} s={s} change={change} />
            {problem && (
              <p role="alert" className={cx(warn, "mt-3")}>
                {problem}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className={primary} disabled={busy} onClick={() => void submit()}>
                Submit my decision
              </button>
              <span className="text-sm text-ink-muted" aria-live="polite">
                {summary(s)}
              </span>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

function Shell({ b, children }: { b: AuditorBlock; children: React.ReactNode }) {
  return (
    <section aria-label={`Document Auditor: ${b.title}`} className="w-full rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="shield" className="size-5" /> Document Auditor · {MODES[b.mode]}
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Intro({ b }: { b: AuditorBlock }) {
  return (
    <div>
      {b.intro && <p className="text-lg">{b.intro}</p>}
      <p className="mt-3 inline-flex items-start gap-2 rounded-xl border-2 border-dashed border-line-strong px-3 py-2 text-sm font-semibold">
        <Icon name="info" className="mt-0.5 size-4 shrink-0" /> {AUDITOR_NOTICE}
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-semibold text-ink-muted">Your role</dt>
          <dd>{b.context.role}</dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-ink-muted">Supplier</dt>
          <dd>{b.context.supplier}</dd>
        </div>
        {b.context.participant && (
          <div>
            <dt className="text-sm font-semibold text-ink-muted">Participant</dt>
            <dd>{b.context.participant}</dd>
          </div>
        )}
        <div>
          <dt className="text-sm font-semibold text-ink-muted">Dates</dt>
          <dd>
            Today in this case: {showDate(b.decisionDate)}. {b.mode === "contractor_vetting" ? "Proposed engagement" : "Service date"}:{" "}
            {showDate(b.engagementDate)}.
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm font-semibold text-ink-muted">The decision to make</dt>
          <dd className="font-semibold">{b.context.task}</dd>
        </div>
      </dl>
    </div>
  );
}

function Marker({ n }: { n: number }) {
  return (
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-action text-sm font-bold text-on-action ring-2 ring-surface">
      {n}
    </span>
  );
}

type FieldProps = {
  markOf: (t: Target) => Mark | undefined;
  numberOf: (t: Target) => number;
  open: Target | null;
  setOpen: (t: Target | null) => void;
  panel: (t: Target) => React.ReactNode;
};

/** A document as a page: each field is a button, with its marker number and what you noticed beside it. */
function DocumentPage({ doc, markOf, numberOf, open, setOpen, panel }: { doc: AuditDoc } & FieldProps) {
  return (
    <div role="tabpanel" aria-label={doc.title} className="relative mt-3 overflow-hidden rounded-2xl border border-line-strong bg-surface p-4 shadow-sm sm:p-6">
      <p
        aria-hidden
        className="pointer-events-none absolute right-3 top-3 rotate-6 rounded border-2 border-[#b3261e]/50 px-2 text-xs font-extrabold uppercase tracking-widest text-[#b3261e]/70"
      >
        Practice copy
      </p>
      <h4 className="font-serif text-xl font-semibold">{doc.title}</h4>
      {doc.subtitle && <p className="text-sm text-ink-muted">{doc.subtitle}</p>}
      <ul className="mt-3 flex flex-col gap-1.5">
        {doc.fields.map((f) => {
          const t = { fieldId: f.id, missingId: "" };
          const m = markOf(t);
          const isOpen = Boolean(open && sameTarget(open, t));
          return (
            <li key={f.id}>
              <button
                type="button"
                aria-expanded={isOpen}
                className={cx(
                  "flex min-h-11 w-full items-start gap-3 rounded-xl px-3 py-2 text-left ring-1 transition",
                  m ? "bg-tealtint ring-2 ring-action" : "ring-line hover:bg-muted",
                  f.line && "font-mono text-[0.95em]",
                )}
                onClick={() => setOpen(isOpen ? null : t)}
              >
                {m ? <Marker n={numberOf(t)} /> : <span className="size-7 shrink-0" aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink-muted">{f.label}</span>
                  <span className="block">{f.value}</span>
                </span>
                <span className="sr-only">
                  {m ? `Marker ${numberOf(t)}: ${m.category ? CATEGORIES[m.category] : "not described yet"}. Edit.` : "Mark this field."}
                </span>
                {m?.category && (
                  <span className="hidden shrink-0 self-center text-sm font-semibold sm:block" aria-hidden>
                    {CATEGORIES[m.category]}
                  </span>
                )}
              </button>
              {panel(t)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Every document field in one table: the same task, by keyboard and screen reader. */
function FieldTable({ docs, markOf, numberOf, open, setOpen, panel }: { docs: AuditDoc[] } & FieldProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Every field on every document, with your markers</caption>
        <thead>
          <tr className="border-b border-line-strong text-sm">
            <th scope="col" className="py-2 pr-3">
              Document
            </th>
            <th scope="col" className="py-2 pr-3">
              Field
            </th>
            <th scope="col" className="py-2 pr-3">
              Value
            </th>
            <th scope="col" className="py-2">
              Your marker
            </th>
          </tr>
        </thead>
        <tbody>
          {docs.flatMap((d) =>
            d.fields.map((f) => {
              const t = { fieldId: f.id, missingId: "" };
              const m = markOf(t);
              const isOpen = Boolean(open && sameTarget(open, t));
              return [
                <tr key={f.id} className="border-b border-line align-top">
                  <td className="py-2 pr-3 text-sm">{d.title}</td>
                  <th scope="row" className="py-2 pr-3 text-sm font-semibold">
                    {f.label}
                  </th>
                  <td className="py-2 pr-3">{f.value}</td>
                  <td className="py-2">
                    <button type="button" className={cx(secondary, "min-h-10 text-sm")} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t)}>
                      {m ? `Marker ${numberOf(t)}: ${m.category ? CATEGORIES[m.category] : "describe"}` : "Mark"}
                      <span className="sr-only"> {f.label}</span>
                    </button>
                  </td>
                </tr>,
                isOpen ? (
                  <tr key={`${f.id}-panel`}>
                    <td colSpan={4}>{panel(t)}</td>
                  </tr>
                ) : null,
              ];
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}

/** "What did you notice?": a category, a short reason, and the records it was compared with. Nothing here says whether it's right. */
function MarkPanel({
  records,
  mark,
  number,
  missing,
  onSave,
  onRemove,
  onClose,
}: {
  records: AuditDoc[];
  mark: Mark | undefined;
  number: number;
  missing: boolean;
  onSave: (patch: Partial<Mark>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const cat = mark?.category ?? "";
  const compared = mark?.compared ?? [];
  return (
    <div className="mt-2 rounded-2xl border-2 border-action bg-surface p-4">
      <h5 ref={heading} tabIndex={-1} className="flex items-center gap-2 font-semibold outline-none">
        <Marker n={number} /> What did you notice?
      </h5>
      <fieldset className="mt-2">
        <legend className="sr-only">Category</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_ORDER.filter((c) => !missing || c === "missing" || c === "looks_correct").map((c: Category) => (
            <label
              key={c}
              className={cx(
                "flex min-h-10 items-center gap-2 rounded-full px-3 text-sm ring-1",
                cat === c ? "bg-tealtint font-semibold ring-action" : "ring-line",
              )}
            >
              <input type="radio" className="size-4" checked={cat === c} onChange={() => onSave({ category: c })} />
              {missing && c === "looks_correct" ? "Not needed here" : CATEGORIES[c]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 flex flex-col gap-1">
        <span className="text-sm font-semibold">Why (a short reason)</span>
        <input className={input} maxLength={300} value={mark?.note ?? ""} onChange={(e) => onSave({ note: e.target.value })} />
      </label>
      {records.length > 0 && (
        <fieldset className="mt-3">
          <legend className="text-sm font-semibold">Compared with…</legend>
          {records.map((r) => (
            <div key={r.id} className="mt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{r.title}</p>
              {r.fields.map((f) => (
                <label key={f.id} className="flex min-h-10 items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0"
                    checked={compared.includes(f.id)}
                    onChange={() => onSave({ compared: compared.includes(f.id) ? compared.filter((x) => x !== f.id) : [...compared, f.id] })}
                  />
                  <span>
                    <span className="font-semibold">{f.label}:</span> {f.value}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={secondary} onClick={onClose}>
          <Icon name="check" className="size-4" /> Done
        </button>
        {mark && (
          <button type="button" className={secondary} onClick={onRemove}>
            <Icon name="trash" className="size-4" /> Remove marker
          </button>
        )}
      </div>
    </div>
  );
}

function Rules({ b }: { b: AuditorBlock }) {
  return (
    <section className={box} aria-label="Rules for this case">
      <h4 className="font-semibold">Rules for this case</h4>
      <ul className="mt-2 flex flex-col gap-2">
        {b.rules.map((r) => (
          <li key={r.id}>
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                {r.title} <span className="font-normal text-ink-muted">· {RULE_FAMILIES[r.family]}</span>
              </summary>
              <p className="mt-1 text-sm">{r.text}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">
                    {r.source}
                  </a>
                ) : (
                  r.source
                )}
                {" · "}effective {showDate(r.effectiveFrom)} · review by {showDate(r.reviewBy)}
                {r.owner ? ` · ${r.owner}` : ""}
              </p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Markers({ b, s, onEdit }: { b: AuditorBlock; s: AuditState; onEdit: (t: Target) => void }) {
  if (!s.marks.length) return null;
  const label = (m: Mark) => {
    if (m.missingId) return `Missing: ${b.missing.find((x) => x.id === m.missingId)?.label ?? ""}`;
    for (const d of b.docs) {
      const f = d.fields.find((x) => x.id === m.fieldId);
      if (f) return `${d.title}: ${f.label}`;
    }
    return "";
  };
  const recordLabel = (id: string) => b.docs.flatMap((d) => d.fields).find((f) => f.id === id)?.label ?? id;
  return (
    <section className={cx(box, "mt-4")} aria-label="Your markers">
      <h4 className="font-semibold">Your markers</h4>
      <ol className="mt-2 flex flex-col gap-2">
        {s.marks.map((m, i) => (
          <li key={m.id} className="flex items-start gap-3">
            <Marker n={i + 1} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {label(m)} · {m.category ? CATEGORIES[m.category] : "not described yet"}
              </p>
              {m.note && <p className="text-sm">{m.note}</p>}
              {m.compared.length > 0 && <p className="text-sm text-ink-muted">Compared with {m.compared.map(recordLabel).join(", ")}</p>}
            </div>
            <button type="button" className={cx(secondary, "min-h-10 text-sm")} onClick={() => onEdit({ fieldId: m.fieldId, missingId: m.missingId })}>
              <Icon name="pen" className="size-4" /> Edit <span className="sr-only">marker {i + 1}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DecisionRail({ b, s, change }: { b: AuditorBlock; s: AuditState; change: (fn: (prev: AuditState) => Partial<AuditState>) => void }) {
  return (
    <section className="mt-4 rounded-2xl border-2 border-line-strong p-4" aria-label="Your decision">
      <fieldset>
        <legend className="font-semibold">Your decision on this submission</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {DECISION_ORDER.map((k) => (
            <label
              key={k}
              className={cx(
                "flex cursor-pointer flex-col gap-1 rounded-2xl p-3 ring-1",
                s.decision === k ? "bg-tealtint ring-2 ring-action" : "ring-line hover:bg-muted",
              )}
            >
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name={`${b.id}-decision`} className="size-5" checked={s.decision === k} onChange={() => change(() => ({ decision: k }))} />
                {DECISIONS[k].label}
              </span>
              <span className="text-sm text-ink-muted">{DECISIONS[k].text}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 flex flex-col gap-1">
        <span className="font-semibold">Why: the evidence and the rule</span>
        <textarea className={cx(input, "min-h-20")} maxLength={1200} value={s.rationale} onChange={(e) => change(() => ({ rationale: e.target.value }))} />
      </label>
      <label className="mt-3 flex flex-col gap-1">
        <span className="font-semibold">Next action</span>
        <select className={input} value={s.action} onChange={(e) => change(() => ({ action: e.target.value as NextAction | "" }))}>
          <option value="">Choose…</option>
          {b.actions.map((a) => (
            <option key={a.id} value={a.id}>
              {ACTIONS[a.id]}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

const CREDIT = { full: "Full credit", partial: "Partly right", none: "Not this time" } as const;
const GROUPS = [
  { id: "confirmed", title: "Confirmed failures", text: "Clearly expired, out of scope or contradicted by the records." },
  { id: "clarify", title: "Missing or unclear: needs a query", text: "Something that can’t be established from this pack yet." },
  { id: "integrity", title: "Possible integrity concerns", text: "Supported by evidence, but not decided from one page. Escalate; don’t accuse." },
  { id: "harmless", title: "Harmless differences", text: "Things that look like problems but aren’t, under this case’s rules." },
] as const;

function Debrief({
  b,
  d,
  busy,
  onVariant,
  onRestart,
}: {
  b: AuditorBlock;
  d: AuditDebrief;
  busy: boolean;
  onVariant: (x: Decision) => void;
  onRestart: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <h4 className="font-serif text-xl font-semibold">Debrief</h4>
      <p className="text-lg">{d.summary}</p>
      <ul className="grid gap-2 sm:grid-cols-5" aria-label="How it went">
        {d.dims.map((x) => (
          <li key={x.id} className={box}>
            <p className="text-sm text-ink-muted">{x.label}</p>
            <p className="font-semibold">{x.rating ?? "Not needed in this case"}</p>
          </li>
        ))}
      </ul>
      {d.decision.critical && (
        <div className={bad} role="alert">
          <p className="font-semibold">A critical shortcut</p>
          <p className="mt-1">{d.decision.critical}</p>
        </div>
      )}
      <section className={d.decision.credit === "full" ? good : d.decision.credit === "partial" ? warn : bad} aria-label="Decision memo">
        <p className="font-semibold">
          You chose {d.decision.yours}: {CREDIT[d.decision.credit]}
        </p>
        {!d.decision.critical && <p className="mt-1">{d.decision.why}</p>}
        {d.decision.credit !== "full" &&
          d.decision.best.map((x) => (
            <p key={x.label} className="mt-2">
              <span className="font-semibold">{x.label}:</span> {x.why}
            </p>
          ))}
        <p className="mt-2 text-sm">
          Next action: {d.action.yours} ({d.action.right ? "a sound next step" : "not the best next step"}). {d.action.why}
        </p>
        {!d.action.right && d.action.best.length > 0 && <p className="mt-1 text-sm">Better: {d.action.best.map((x) => x.label).join("; ")}.</p>}
        <p className="mt-2 text-sm">Your reason: “{d.decision.rationale}”</p>
      </section>

      {GROUPS.map((g) => {
        const items = d.items.filter((i) => i.group === g.id);
        if (!items.length) return null;
        return (
          <section key={g.id} aria-label={g.title}>
            <h5 className="font-semibold">{g.title}</h5>
            <p className="text-sm text-ink-muted">{g.text}</p>
            <ul className="mt-2 flex flex-col gap-2">
              {items.map((i) => (
                <li key={i.id} className={box}>
                  <p className="font-semibold">{i.what}</p>
                  <p className="mt-1 flex flex-wrap gap-2 text-sm">
                    <Verdict i={i} />
                    <span className="text-ink-muted">
                      {i.status} · {i.severity}
                    </span>
                  </p>
                  {i.yourNote && <p className="mt-1 text-sm">Your reason: “{i.yourNote}”</p>}
                  {i.compared !== null && (
                    <p className="mt-1 text-sm">
                      {i.compared ? "You compared it with the right record." : `Compare it with: ${i.expectedCompared.join("; ")}.`}
                      {i.yourCompared.length > 0 && !i.compared ? ` You compared it with ${i.yourCompared.join(", ")}.` : ""}
                    </p>
                  )}
                  {i.checks.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-sm">
                      {i.checks.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2">{i.explain}</p>
                  {i.rule && (
                    <p className="mt-2 text-xs text-ink-muted">
                      Rule: {i.rule.title} ·{" "}
                      {i.rule.url ? (
                        <a href={i.rule.url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">
                          {i.rule.source}
                        </a>
                      ) : (
                        i.rule.source
                      )}{" "}
                      · effective {showDate(i.rule.effectiveFrom)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {d.extra.length > 0 && (
        <section aria-label="Not findings in this case">
          <h5 className="font-semibold">Not findings in this case</h5>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {d.extra.map((x) => (
              <li key={x.markId}>
                {x.what}: you marked it {x.category}. Nothing in this case’s rules makes it a problem, so it counts as a false positive.
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.variant && (
        <section className={box} aria-label="One changed fact">
          <h5 className="font-semibold">One changed fact</h5>
          <p className="mt-1">{d.variant.fact}</p>
          {d.variant.answered ? (
            <p className={cx(d.variant.right ? good : warn, "mt-2")}>
              <span className="font-semibold">
                {d.variant.right ? "Yes: " : "The reviewed answer: "}
                {d.variant.decision}.
              </span>{" "}
              {d.variant.why}
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {DECISION_ORDER.map((k) => (
                <button key={k} type="button" className={secondary} disabled={busy} onClick={() => onVariant(k)}>
                  {DECISIONS[k].label}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      <div>
        <button type="button" className={secondary} disabled={busy} onClick={onRestart}>
          <Icon name="refresh" className="size-4" /> Try again
        </button>
        <p className="mt-2 text-xs text-ink-muted">
          {b.source.title}
          {b.source.version ? `, ${b.source.version}` : ""}. A practice case: nothing here approves a supplier or pays an invoice.
        </p>
      </div>
    </div>
  );
}

function Verdict({ i }: { i: AuditDebrief["items"][number] }) {
  const t =
    i.group === "harmless"
      ? i.falsePositive
        ? { text: `False positive: you marked it ${i.category ? CATEGORIES[i.category] : ""}`, icon: "close" as const }
        : i.marked
          ? { text: "You left it alone", icon: "check" as const }
          : { text: "Not marked: fine", icon: "check" as const }
      : !i.finding
        ? i.marked
          ? { text: "You noticed it", icon: "check" as const }
          : { text: "Worth noticing", icon: "info" as const }
        : i.found
          ? i.readRight
            ? { text: `Found: ${i.category ? CATEGORIES[i.category] : ""}`, icon: "check" as const }
            : { text: `Found, but read as ${i.category ? CATEGORIES[i.category] : ""} (better: ${i.categories.join(" or ")})`, icon: "alert" as const }
          : { text: "Missed", icon: "close" as const };
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      <Icon name={t.icon} className="size-4" /> {t.text}
    </span>
  );
}
