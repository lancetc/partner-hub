"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { Outcome, Reviewer, Stage } from "@/lib/shadowCoach";
import type { coordinatorView, HireState, ShadowToolHome, Workbench } from "@/server/shadowCoachTool";
import type { ProcessTheme } from "@/content/shadowCoachDemo";
import { Icon } from "../Icon";

/*
  The First 100 Days workbench (docs/shadow-and-coach.md, "The workbench"): demo data only. Each demo hire shows the
  stage's evidence and outstanding checks, approved learning, observations against defined tasks, process issues and
  reviewer requests. Every control is a labelled field; there's no free text, no score and no ranking anywhere.
  "What the coordinator sees" previews her projection: no manager-only items.
*/

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-muted p-4 ring-1 ring-line";
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3";
const warn = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";

type Home = { access: null; notice: string } | ShadowToolHome;
type Hire = ShadowToolHome["demo"]["hires"][number];
type CoordView = ReturnType<typeof coordinatorView>;

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${performance.now().toString(36).replace(".", "")}`);

export function First100DaysTool() {
  const loaded = useApi<Home>("/api/tools/first-100-days");
  const [home, setHome] = useState<ShadowToolHome | null>(null);
  const [draft, setDraft] = useState<Workbench | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [problem, setProblem] = useState("");
  const opened = useRef(false);
  const data = loaded.data;
  if (data && data.access && home === null) {
    setHome(data);
    setDraft(data.state);
  }
  useEffect(() => {
    if (!home || opened.current) return;
    opened.current = true;
    api("/api/tools/first-100-days", { body: { action: "event", event: "first100_opened", idem: newKey() } }).catch(() => undefined);
  }, [home]);

  if (loaded.error)
    return (
      <p role="alert" className="mt-6">
        {loaded.error}
      </p>
    );
  if (!data) return <p className="mt-6 text-ink-muted">Loading…</p>;
  if (!data.access)
    return (
      <div className={cx(box, "mt-6")}>
        <p className="font-semibold">This workbench is for the business owner and the people they’ve authorised.</p>
        <p className="mt-2 text-sm">{data.notice}</p>
      </div>
    );
  if (!home || !draft) return <p className="mt-6 text-ink-muted">Loading…</p>;

  const stateOf = (h: Hire): HireState => draft.hires[h.id] ?? home.hireStates[h.id];
  const edit = (h: Hire, fn: (s: HireState) => HireState) => setDraft({ hires: { ...draft.hires, [h.id]: fn(structuredClone(stateOf(h))) } });
  const dirty = JSON.stringify(draft) !== JSON.stringify(home.state);

  const save = async () => {
    setBusy(true);
    setProblem("");
    try {
      const next = await api<ShadowToolHome & { unchanged?: boolean }>("/api/tools/first-100-days", { body: { state: draft, idem: newKey() } });
      setHome(next);
      setDraft(next.state);
      setMsg(next.unchanged ? "Nothing had changed." : `Saved as version ${next.version}.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-4">
      <p className={cx(warn, "rounded-2xl px-4 py-3 text-sm font-semibold")}>{home.notice}</p>
      <p aria-live="polite" className="sr-only">
        {msg}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">
          Private to {home.access.orgName}.{" "}
          {home.version
            ? `Version ${home.version}, saved by ${home.versions.at(-1)?.savedBy || "someone in your business"}.`
            : "Not saved yet: you’re looking at the demo."}
        </p>
        {home.practice ? (
          <Link href={home.practice.href} className={secondary}>
            <Icon name="people" className="size-4" /> Practise coaching (fictional)
          </Link>
        ) : (
          <span className="text-sm text-ink-muted">The fictional Shadow & Coach practice appears here once it’s published.</span>
        )}
      </div>
      {problem && (
        <p role="alert" className="rounded-xl bg-[#fde4e1] px-3 py-2 text-sm text-[#7a1d12] dark:bg-[#3f1712] dark:text-[#ffb4a8]">
          {problem}
        </p>
      )}
      <ul className="grid gap-4 lg:grid-cols-2">
        {home.demo.hires.map((h) => (
          <li key={h.id}>
            <HireCard home={home} h={h} st={stateOf(h)} edit={(fn) => edit(h, fn)} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={busy || !dirty} onClick={save}>
          Save a new version
        </button>
        <button type="button" className={secondary} disabled={busy || !dirty} onClick={() => setDraft(home.state)}>
          Discard changes
        </button>
      </div>
      <details className={box}>
        <summary className="min-h-11 cursor-pointer font-semibold">Who decides what (a draft for Trilogy Care to approve)</summary>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {home.roleMatrix.map((r) => (
            <li key={r.id}>
              <span className="font-semibold">{r.decision}. </span>
              You may: {r.manager} The accountable pathway: {r.route}{" "}
              <span className="text-ink-muted">({r.approved ? "approved" : "draft, not yet approved"})</span>
            </li>
          ))}
        </ul>
      </details>
      <details className={box}>
        <summary className="min-h-11 cursor-pointer font-semibold">Data sources (none connected)</summary>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {home.dataSources.map((s) => (
            <li key={s.id}>
              {s.label} <span className="text-ink-muted">({s.owner}: not connected, awaiting Trilogy Care’s approval)</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** One demo hire. Exported for the static render checks in the tests. */
export function HireCard({ home, h, st, edit }: { home: ShadowToolHome; h: Hire; st: HireState; edit: (fn: (s: HireState) => HireState) => void }) {
  const [learn, setLearn] = useState("");
  const [obs, setObs] = useState<{ task: string; outcome: Outcome | ""; date: string; shared: boolean }>({ task: "", outcome: "", date: "", shared: false });
  const [theme, setTheme] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [coord, setCoord] = useState<CoordView | null>(null);
  const [coordError, setCoordError] = useState("");
  const stageChecks = home.stageChecks[st.stage];
  const catalogue = home.catalogue;
  return (
    <article className={cx(box, "flex flex-col gap-3 bg-surface")} aria-label={h.label}>
      <div>
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Started {h.started}</p>
        <h2 className="font-serif text-2xl font-semibold">{h.label}</h2>
        <p className="text-sm">{h.role}</p>
        <p className="text-sm">Next meeting: {h.nextMeeting}</p>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Stage
        <select className={field} value={st.stage} onChange={(e) => edit((s) => ({ ...s, stage: e.target.value as Stage }))}>
          {home.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="text-sm font-semibold">Evidence and outstanding checks for this stage</legend>
        {stageChecks.map((c) => (
          <label key={c.id} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={st.checks.includes(c.id)}
              onChange={(e) => edit((s) => ({ ...s, checks: e.target.checked ? [...new Set([...s.checks, c.id])] : s.checks.filter((x) => x !== c.id) }))}
            />
            {c.label} <span className="text-ink-muted">({st.checks.includes(c.id) ? "seen" : "outstanding"})</span>
          </label>
        ))}
        {h.earlier.length > 0 && <p className="text-sm text-ink-muted">Still open from an earlier stage: {h.earlier.map((c) => c.label).join("; ")}.</p>}
      </fieldset>

      <section aria-label="Assigned learning">
        <p className="text-sm font-semibold">Approved learning (simulated assignment)</p>
        <ul className="list-disc pl-5 text-sm">
          {st.learning.map((k) => (
            <li key={k}>
              {catalogue.find((c) => c.key === k)?.label ?? k}{" "}
              <button
                type="button"
                className="min-h-11 px-2 text-accent underline"
                onClick={() => edit((s) => ({ ...s, learning: s.learning.filter((x) => x !== k) }))}
              >
                Remove<span className="sr-only">: {catalogue.find((c) => c.key === k)?.label}</span>
              </button>
            </li>
          ))}
          {!st.learning.length && <li className="list-none text-ink-muted">Nothing assigned.</li>}
        </ul>
        <div className="mt-1 flex flex-wrap gap-2">
          <select
            className={cx(field, "sm:w-80")}
            aria-label={`Assign existing learning to ${h.label}`}
            value={learn}
            onChange={(e) => setLearn(e.target.value)}
          >
            <option value="">Assign existing learning…</option>
            {catalogue.map((c) => (
              <option key={c.key} value={c.key} disabled={c.status !== "current"}>
                {c.label}
                {c.status !== "current" ? " (not approved: needs an author review)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={secondary}
            disabled={!learn}
            onClick={() => {
              edit((s) => ({ ...s, learning: [...new Set([...s.learning, learn])] }));
              setLearn("");
            }}
          >
            Assign
          </button>
        </div>
      </section>

      <section aria-label="Observations">
        <p className="text-sm font-semibold">Observations against defined tasks</p>
        <ul className="list-disc pl-5 text-sm">
          {st.observations.map((o, i) => (
            <li key={`${o.task}-${o.date}-${i}`}>
              {o.date}: {home.tasks.find((t) => t.id === o.task)?.label} — {home.outcomes.find((x) => x.id === o.outcome)?.label}
              {o.shared ? " (shared with her)" : " (manager only)"}
            </li>
          ))}
          {!st.observations.length && <li className="list-none text-ink-muted">No observations recorded.</li>}
        </ul>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <select className={field} aria-label="Defined task" value={obs.task} onChange={(e) => setObs({ ...obs, task: e.target.value })}>
            <option value="">Defined task…</option>
            {home.tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.reviewer ? ` (sign-off needs ${home.reviewers.find((r) => r.id === t.reviewer)?.label})` : ""}
              </option>
            ))}
          </select>
          <select className={field} aria-label="Outcome" value={obs.outcome} onChange={(e) => setObs({ ...obs, outcome: e.target.value as Outcome | "" })}>
            <option value="">Outcome…</option>
            {home.outcomes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <input type="date" className={field} aria-label="Date observed" value={obs.date} onChange={(e) => setObs({ ...obs, date: e.target.value })} />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={obs.shared} onChange={(e) => setObs({ ...obs, shared: e.target.checked })} /> Share with her
          </label>
        </div>
        <button
          type="button"
          className={cx(secondary, "mt-2")}
          disabled={!obs.task || !obs.outcome || !obs.date}
          onClick={() => {
            if (!obs.outcome) return;
            edit((s) => ({ ...s, observations: [...s.observations, { task: obs.task, outcome: obs.outcome as Outcome, date: obs.date, shared: obs.shared }] }));
            setObs({ task: "", outcome: "", date: "", shared: false });
          }}
        >
          Record observation
        </button>
      </section>

      <div className="grid gap-2 sm:grid-cols-2">
        <section aria-label="Process issues">
          <p className="text-sm font-semibold">Process issues (manager only)</p>
          <p className="text-sm">{st.processIssues.map((p) => home.themes.find((t) => t.id === p)?.label).join("; ") || "None raised."}</p>
          <div className="mt-1 flex gap-2">
            <select className={field} aria-label="Process theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="">Raise a process issue…</option>
              {home.themes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={secondary}
              disabled={!theme}
              onClick={() => {
                edit((s) => ({ ...s, processIssues: [...new Set([...s.processIssues, theme as ProcessTheme])] }));
                setTheme("");
              }}
            >
              Raise
            </button>
          </div>
        </section>
        <section aria-label="Reviewer requests">
          <p className="text-sm font-semibold">Reviewer requests (manager only)</p>
          <p className="text-sm">{st.reviewers.map((r) => home.reviewers.find((x) => x.id === r)?.label).join("; ") || "None requested."}</p>
          <div className="mt-1 flex gap-2">
            <select className={field} aria-label="Reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
              <option value="">Request a reviewer…</option>
              {home.reviewers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={secondary}
              disabled={!reviewer}
              onClick={() => {
                edit((s) => ({ ...s, reviewers: [...new Set([...s.reviewers, reviewer as Reviewer])] }));
                setReviewer("");
              }}
            >
              Request
            </button>
          </div>
        </section>
      </div>

      {h.references.map((r) => (
        <p key={r.label} className="text-sm text-ink-muted">
          {r.kind === "qa" ? "QA" : "Incident"} reference (read-only): {r.label}
        </p>
      ))}

      <div>
        <button
          type="button"
          className={secondary}
          onClick={async () => {
            setCoordError("");
            try {
              setCoord(await api<CoordView>(`/api/tools/first-100-days?coordinator=${h.id}`));
              api("/api/tools/first-100-days", { body: { action: "event", event: "coordinator_view_previewed", ref: h.id, idem: newKey() } }).catch(
                () => undefined,
              );
            } catch (e) {
              setCoordError(e instanceof Error ? e.message : "That didn’t load.");
            }
          }}
        >
          <Icon name="eye" className="size-4" /> What she sees (saved version)
        </button>
        {coordError && <p role="alert">{coordError}</p>}
        {coord && (
          <div className="mt-2 rounded-xl bg-bg p-3 text-sm ring-1 ring-line">
            <p className="font-semibold">
              {coord.hire.label} · {coord.hire.stage}
            </p>
            <p className="mt-1 font-semibold">Her plan</p>
            <ul className="list-disc pl-5">
              {coord.learning.map((c) => (
                <li key={c.key}>{c.href ? <Link href={c.href}>{c.label}</Link> : c.label}</li>
              ))}
              {!coord.learning.length && <li className="list-none text-ink-muted">Nothing assigned yet.</li>}
            </ul>
            <p className="mt-1 font-semibold">Feedback shared with her</p>
            <ul className="list-disc pl-5">
              {coord.feedback.map((f, i) => (
                <li key={i}>
                  {f.date}: {f.task} — {f.outcome}
                </li>
              ))}
              {!coord.feedback.length && <li className="list-none text-ink-muted">Nothing shared yet.</li>}
            </ul>
            <p className="mt-1">Next meeting: {coord.nextMeeting}</p>
          </div>
        )}
      </div>
    </article>
  );
}
