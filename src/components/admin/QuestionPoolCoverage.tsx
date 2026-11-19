"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate, formatDateTime } from "@/lib/format";
import { SURFACES } from "@/lib/questionPool";
import type { coverage, listSources } from "@/server/questionPool";
import { Badge, btn, ErrorNote, input } from "./ui";
import { Icon } from "../Icon";

/*
  Coverage: how much of the Hub's questions the pool accounts for, counted rather than assumed. Native
  questions by where they're used, what still needs attention, what isn't covered and why, each
  reconciliation, and imported SCORM courses (whose questions the Hub can't see into). And the sources
  answers rest on.
*/

type Coverage = ReturnType<typeof coverage>;
type Source = ReturnType<typeof listSources>[number];

const COVERAGE = {
  unavailable: { label: "External: question list unavailable", tone: "warn" },
  supplied: { label: "External: question list supplied", tone: "info" },
  reconciled: { label: "External: manually reconciled", tone: "good" },
} as const;

export function PoolCoverage() {
  const { data, error, setData } = useApi<Coverage>("/api/admin/questions/coverage");
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="mt-4 text-ink-muted">Loading…</p>;
  const total = data.bySurface.reduce((n, s) => n + s.placements, 0);
  const approved = data.bySurface.reduce((n, s) => n + s.approved, 0);
  const unreviewed = data.bySurface.reduce((n, s) => n + s.unreviewed, 0);
  const send = async (body: Record<string, unknown>, apply: (out: Record<string, unknown>) => Partial<Coverage>) => {
    setProblem(null);
    try {
      const out = await api<Record<string, unknown>>("/api/admin/questions", { body });
      setData({ ...data, ...apply(out) });
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
      return false;
    }
  };
  return (
    <div className="mt-4 flex flex-col gap-5">
      {problem && <ErrorNote text={problem} />}
      <section aria-labelledby="cov-native" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="cov-native" className="font-serif text-xl font-semibold">
          Native questions, live now
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {total} live uses of questions: {approved} on an approved version
          {unreviewed ? ` (${unreviewed} recorded as approved at set-up and awaiting a first review)` : ""}, {total - approved} not approved.
          {data.cutover && ` The pool was set up ${formatDate(data.cutover)}.`}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead className="border-b border-line">
              <tr>
                {["Used as", "Questions", "Live uses", "On an approved version", "First review due", "Not approved"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-mulish text-xs font-extrabold uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.bySurface.map((s) => (
                <tr key={s.surface} className="border-b border-line last:border-0">
                  <th scope="row" className="px-3 py-2 font-semibold">
                    <Link href={`/admin/questions?surface=${s.surface}&use=live`} className="text-accent hover:underline">
                      {SURFACES[s.surface]}
                    </Link>
                  </th>
                  <td className="px-3 py-2">{s.questions}</td>
                  <td className="px-3 py-2">{s.placements}</td>
                  <td className="px-3 py-2">{s.approved}</td>
                  <td className="px-3 py-2">{s.unreviewed}</td>
                  <td className={cx("px-3 py-2", s.placements - s.approved > 0 && "font-semibold text-danger")}>{s.placements - s.approved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="cov-enforce" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="cov-enforce" className="font-serif text-xl font-semibold">
          Publishing and approval
        </h2>
        <label className="mt-2 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-[var(--color-action)]"
            checked={data.enforce}
            disabled={!data.canEnforce}
            onChange={(e) => void send({ action: "enforce", on: e.target.checked }, (o) => ({ enforce: Boolean(o.enforce) }))}
          />
          <span>
            <span className="font-semibold">Require approval before publishing</span>
            <span className="block text-ink-muted">
              On: a Topic or Magazine course can’t be published while any question in it is new, changed, flagged or retired without an approved version here;
              the publish says which. Off (for the pilot): nothing is held up, and those questions show under Needs review and below.
              {!data.canEnforce && " Only a Hub administrator can change this."}
            </span>
          </span>
        </label>
      </section>

      <section aria-labelledby="cov-exceptions" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="cov-exceptions" className="font-serif text-xl font-semibold">
          Live without an approved version ({data.exceptions.length})
        </h2>
        {data.exceptions.length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">None: every question learners can meet is on an approved version.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
            {data.exceptions.map((e) => (
              <li key={e.id} className="py-2">
                <Link href={`/admin/questions?q=${e.id}&open=${e.id}`} className="font-semibold text-accent hover:underline">
                  {e.id}
                </Link>{" "}
                {e.title} <span className="text-ink-muted">· {e.topic}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="cov-scorm" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="cov-scorm" className="font-serif text-xl font-semibold">
          Imported eLearning (SCORM)
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          The Hub plays these packages and records completion and scores, but it can’t see or edit the questions inside them. Record here how far each one’s
          questions are known: a count is kept only where a list has been supplied or reconciled.
        </p>
        {data.external.length === 0 && <p className="mt-2 text-sm">No eLearning courses have been imported.</p>}
        <ul className="mt-3 flex flex-col gap-3">
          {data.external.map((c) => (
            <li key={c.id} className="rounded-2xl border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{c.title}</span>
                <Badge tone={COVERAGE[c.coverage].tone}>{COVERAGE[c.coverage].label}</Badge>
                <span className="text-ink-muted">
                  {c.standard} · {c.status} · {c.file} · uploaded {formatDate(c.uploadedAt)}
                  {c.uploadedBy ? ` by ${c.uploadedBy}` : ""} · {c.attempts} attempt{c.attempts === 1 ? "" : "s"}
                </span>
                <button type="button" className="ml-auto font-semibold text-accent hover:underline" onClick={() => setEditing(editing === c.id ? null : c.id)}>
                  {editing === c.id ? "Close" : "Edit"}
                </button>
              </div>
              <p className="mt-1 text-ink-muted">
                Owner: {c.owner || "not set"} · Assessment: {c.hasAssessment === "unknown" ? "not known" : c.hasAssessment} · Verified questions:{" "}
                {c.coverage !== "unavailable" && c.questionCount != null ? c.questionCount : "not verified"} · Review:{" "}
                {c.reviewDate ? formatDate(c.reviewDate) : "no date"}
                {c.note ? ` · ${c.note}` : ""}
              </p>
              {editing === c.id && (
                <form
                  className="mt-3 grid gap-3 sm:grid-cols-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    if (await send({ action: "external", courseId: c.id, ...Object.fromEntries(f) }, (o) => ({ external: o.external as Coverage["external"] })))
                      setEditing(null);
                  }}
                >
                  <label className="flex flex-col gap-1 font-semibold">
                    Question list
                    <select name="coverage" defaultValue={c.coverage} className={input}>
                      <option value="unavailable">Unavailable</option>
                      <option value="supplied">Supplied by the vendor or author</option>
                      <option value="reconciled">Manually reconciled against the package</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 font-semibold">
                    Has an assessment
                    <select name="hasAssessment" defaultValue={c.hasAssessment} className={input}>
                      <option value="unknown">Not known</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 font-semibold">
                    Verified question count
                    <input name="questionCount" type="number" min={0} defaultValue={c.questionCount ?? ""} className={input} />
                  </label>
                  <label className="flex flex-col gap-1 font-semibold">
                    Owner
                    <input name="owner" defaultValue={c.owner} className={input} />
                  </label>
                  <label className="flex flex-col gap-1 font-semibold">
                    Review date
                    <input name="reviewDate" type="date" defaultValue={c.reviewDate ?? ""} className={input} />
                  </label>
                  <label className="flex flex-col gap-1 font-semibold">
                    Note (where the list is kept)
                    <input name="note" defaultValue={c.note} className={input} />
                  </label>
                  <button type="submit" className={cx(btn.primary, "self-end justify-self-start")}>
                    Save
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cov-not" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="cov-not" className="font-serif text-xl font-semibold">
          Not in the pool
        </h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {data.notCovered.map((n) => (
            <li key={n.name}>
              <span className="font-semibold">{n.name}</span> <span className="text-ink-muted">({n.where})</span>: {n.why}
            </li>
          ))}
          <li>
            <span className="font-semibold">Polls, insight walls, reflections and ratings</span>: no single right answer, so they aren’t quiz questions.
          </li>
        </ul>
      </section>

      <section aria-labelledby="cov-recon" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="cov-recon" className="font-serif text-xl font-semibold">
          Reconciliations
        </h2>
        <p className="mt-1 text-sm text-ink-muted">Each time the pool was checked against the Hub’s content and something changed (or it was asked for).</p>
        <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
          {data.reconciliations.map((r) => (
            <li key={r.at} className="py-2">
              <span className="font-semibold">{formatDateTime(r.at)}</span>
              {r.cutover && " (set-up)"}: found {r.found.placements} question uses; {r.newQuestions} new questions, {r.newVersions} new versions, {r.withdrawn}{" "}
              withdrawn drafts. Pool then: {r.pool.questions} questions, {r.pool.versions} versions, {r.pool.livePlacements} live uses. Exceptions:{" "}
              {r.exceptions.liveUnapproved} live without approval, {r.exceptions.duplicates} possible duplicates.
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function PoolSources() {
  const { data, error, setData } = useApi<{ facets: { sources: Source[] } }>("/api/admin/questions?page=1");
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Source | "new" | null>(null);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="mt-4 text-ink-muted">Loading…</p>;
  const sources = data.facets.sources;
  const send = async (body: Record<string, unknown>) => {
    setProblem(null);
    try {
      const out = await api<{ sources: Source[]; questions?: number; flagged?: number; live?: number }>("/api/admin/questions", { body });
      setData({ ...data, facets: { ...data.facets, sources: out.sources } });
      return out;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
      return null;
    }
  };
  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-muted">
        The documents answers rest on: an Act, the Code of Conduct, a Trilogy Care policy, a program manual. Link each question to its source in the question’s
        panel. When a source is replaced, mark it superseded: every approved question that cites it is flagged Needs review.
      </p>
      {problem && <ErrorNote text={problem} />}
      {notice && (
        <p role="status" className="rounded-2xl bg-tealtint px-3 py-2 text-sm">
          {notice}
        </p>
      )}
      <button type="button" className={cx(btn.primary, "self-start")} onClick={() => setEditing("new")}>
        <Icon name="plus" className="size-4" /> Add a source
      </button>
      {editing && (
        <form
          className="grid gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget));
            if (await send({ action: "source", ...(editing !== "new" && { id: editing.id }), ...f })) setEditing(null);
          }}
        >
          {(
            [
              ["title", "Title", "Code of Conduct for Aged Care"],
              ["url", "Link or document ID", "https://…"],
              ["authority", "Who issues it", "Aged Care Quality and Safety Commission"],
              ["owner", "Policy owner at Trilogy Care", "Quality and Compliance"],
            ] as const
          ).map(([name, label, hint]) => (
            <label key={name} className="flex flex-col gap-1 text-sm font-semibold">
              {label}
              <input name={name} required={name === "title"} placeholder={hint} defaultValue={editing === "new" ? "" : editing[name]} className={input} />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-sm font-semibold">
            In effect from
            <input name="effective" type="date" defaultValue={editing === "new" ? "" : (editing.effective ?? "")} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Note
            <input name="note" defaultValue={editing === "new" ? "" : editing.note} className={input} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className={btn.primary}>
              Save source
            </button>
            <button type="button" className={btn.quiet} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {sources.length === 0 && !editing && (
        <p className="rounded-3xl bg-surface p-6 text-center text-sm ring-1 ring-line">No sources yet. Add the documents your questions’ answers come from.</p>
      )}
      <ul className="flex flex-col gap-2">
        {sources.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-surface p-3 text-sm ring-1 ring-line">
            <span className="font-semibold">{s.title}</span>
            <Badge tone={s.status === "superseded" ? "bad" : "good"}>{s.status === "superseded" ? "Superseded" : "Current"}</Badge>
            <span className="text-ink-muted">
              {s.authority}
              {s.effective ? ` · from ${formatDate(s.effective)}` : ""}
              {s.owner ? ` · owner: ${s.owner}` : ""}
            </span>
            <Link href={`/admin/questions?source=${s.id}`} className="font-semibold text-accent hover:underline">
              {s.questions} question{s.questions === 1 ? "" : "s"}
            </Link>
            <span className="ml-auto flex gap-2">
              <button type="button" className={btn.quiet} onClick={() => setEditing(s)}>
                Edit
              </button>
              {s.status === "current" && (
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={async () => {
                    const note = window.prompt(
                      `Mark “${s.title}” as superseded? Every approved question that cites it will be flagged Needs review.\n\nWhat replaced it, or why:`,
                    );
                    if (note == null) return;
                    const out = await send({ action: "supersede", id: s.id, note });
                    if (out)
                      setNotice(
                        `Superseded. ${out.questions} question${out.questions === 1 ? "" : "s"} cite it: ${out.flagged} approved version${out.flagged === 1 ? "" : "s"} flagged Needs review, ${out.live} live with learners now.`,
                      );
                  }}
                >
                  Mark superseded
                </button>
              )}
            </span>
            {s.note && <span className="w-full text-ink-muted">{s.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
