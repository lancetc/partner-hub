"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import type { InstrumentItem } from "@/lib/onboarding";
import type { baselineReport, instruments, poolChoices } from "@/server/onboardingDiagnostic";
import { Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";

/*
  Starting-point checks (docs/onboarding.md): for each audience, a short published set of approved Question
  Pool items. Only an approved version can be chosen, the set is published by name, and its owner sees how
  questions were answered as totals, never who answered what.
*/

type Data = ReturnType<typeof instruments>;
type Pool = ReturnType<typeof poolChoices>;
type Baseline = ReturnType<typeof baselineReport>;
type Row = Data["audiences"][number];
type Chosen = InstrumentItem & { stem: string };

export function InstrumentsTab() {
  const { data, error, setData } = useApi<Data>("/api/admin/onboarding?view=instruments");
  const [problem, setProblem] = useState<string | null>(null);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  const send = async (body: Record<string, unknown>) => {
    setProblem(null);
    try {
      setData(await api<Data>("/api/admin/onboarding", { body }));
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
      return false;
    }
  };
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-3xl text-ink-muted">
        <strong>Check your starting point</strong> asks a new person {data.limits.min} to {data.limits.max} reviewed work situations before their learning
        begins, to suggest where to start. It has no pass mark, offers “I’m not sure” on every question, and can’t hold anyone up or count as a test. Questions
        come from the Question Pool; only approved versions can be asked.
      </p>
      {problem && <ErrorNote text={problem} />}
      {data.audiences.map((a) => (
        <Audience key={a.audience} row={a} competencies={data.competencies} limits={data.limits} send={send} />
      ))}
    </div>
  );
}

function Audience({
  row,
  competencies,
  limits,
  send,
}: {
  row: Row;
  competencies: Data["competencies"];
  limits: Data["limits"];
  send: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [items, setItems] = useState<Chosen[] | null>(null);
  const [q, setQ] = useState("");
  const pool = useApi<Pool>(items ? `/api/admin/onboarding?view=pool&q=${encodeURIComponent(q)}` : null);
  const [totals, setTotals] = useState(false);
  const shown = row.draft ?? row.active;
  return (
    <section aria-label={row.label} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold">{row.label}</h2>
        <span className="flex flex-wrap gap-2">
          {row.active ? (
            <Badge tone="good">
              Version {row.active.version} published by {row.active.approvedBy}
              {row.active.approvedAt ? `, ${formatDate(row.active.approvedAt)}` : ""}
            </Badge>
          ) : (
            <Badge>No check published: the task isn’t shown to them</Badge>
          )}
          {row.draft && <Badge tone="info">Draft version {row.draft.version}</Badge>}
          <Badge>{row.completed} completed</Badge>
        </span>
      </div>

      {items ? (
        <div className="mt-3 flex flex-col gap-3">
          <ol className="flex flex-col divide-y divide-line">
            {items.map((it, i) => (
              <li key={it.questionId} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 basis-64">{it.stem}</span>
                <select
                  aria-label={`Competency for question ${i + 1}`}
                  className={cx(input, "min-h-10 w-auto")}
                  value={it.competencyId ?? ""}
                  onChange={(e) => setItems(items.map((x) => (x.questionId === it.questionId ? { ...x, competencyId: e.target.value || null } : x)))}
                >
                  <option value="">No competency</option>
                  {competencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={btn.quiet}
                  aria-label={`Remove question ${i + 1}`}
                  onClick={() => setItems(items.filter((x) => x.questionId !== it.questionId))}
                >
                  <Icon name="trash" className="size-4" />
                </button>
              </li>
            ))}
            {items.length === 0 && <li className="py-2 text-ink-muted">No questions chosen yet.</li>}
          </ol>
          <p className="text-sm text-ink-muted">
            {items.length} chosen. Publishing needs {limits.min} to {limits.max}. Tagging a question to a competency sends a labelled baseline to Capability
            Insights; it is never counted as evidence.
          </p>
          <Field label="Add approved questions from the Question Pool">
            <input type="search" className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the question or its topic" />
          </Field>
          {pool.error && <ErrorNote text={pool.error} />}
          <ul className="flex max-h-72 flex-col divide-y divide-line overflow-y-auto text-sm">
            {(pool.data?.questions ?? [])
              .filter((p) => !items.some((x) => x.questionId === p.id))
              .map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 flex-1 basis-64">
                    {p.stem}{" "}
                    <span className="text-ink-muted">
                      · {p.topic || "No topic"} · version {p.version}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={btn.secondary}
                    disabled={items.length >= limits.max}
                    onClick={() => setItems([...items, { questionId: p.id, version: p.version, competencyId: null, stem: p.stem }])}
                  >
                    <Icon name="plus" className="size-4" /> Add
                  </button>
                </li>
              ))}
            {pool.data && pool.data.questions.length === 0 && <li className="py-2 text-ink-muted">No approved question matches.</li>}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btn.primary}
              onClick={async () =>
                (await send({
                  action: "instrument",
                  audience: row.audience,
                  items: items.map(({ questionId, version, competencyId }) => ({ questionId, version, competencyId })),
                })) && setItems(null)
              }
            >
              Save the draft
            </button>
            <button type="button" className={btn.quiet} onClick={() => setItems(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {shown && (
            <ol className="mt-3 list-decimal pl-6">
              {shown.items.map((i) => (
                <li key={i.questionId}>
                  {i.stem}{" "}
                  <span className="text-sm text-ink-muted">
                    · version {i.version}
                    {i.competencyId ? ` · ${competencies.find((c) => c.id === i.competencyId)?.name ?? i.competencyId}` : ""}
                  </span>{" "}
                  {i.stale && <Badge tone="bad">No longer approved: it won’t be asked</Badge>}
                  {!i.stale && i.newer && <Badge tone="warn">A newer version has been approved</Badge>}
                </li>
              ))}
            </ol>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {row.canEdit && (
              <button
                type="button"
                className={btn.secondary}
                onClick={() =>
                  setItems(
                    (shown?.items ?? [])
                      .filter((i) => !i.stale)
                      .map((i) => ({ questionId: i.questionId, version: i.version, competencyId: i.competencyId, stem: i.stem })),
                  )
                }
              >
                <Icon name="pen" className="size-4" /> {row.draft ? "Edit the draft" : row.active ? "Draft the next version" : "Choose the questions"}
              </button>
            )}
            {row.canEdit && row.draft && (
              <button
                type="button"
                className={btn.primary}
                onClick={() => {
                  if (
                    window.confirm(
                      `Publish version ${row.draft!.version} for ${row.label.toLowerCase()}? Your name is recorded. People already part-way through keep the version they started.`,
                    )
                  )
                    void send({ action: "publish", audience: row.audience });
                }}
              >
                Publish version {row.draft.version}
              </button>
            )}
            {row.canEdit && row.active && (
              <button type="button" className={btn.quiet} onClick={() => setTotals(!totals)} aria-expanded={totals}>
                How it’s being answered
              </button>
            )}
          </div>
          {totals && <Totals audience={row.audience} />}
        </>
      )}
    </section>
  );
}

function Totals({ audience }: { audience: string }) {
  const { data, error } = useApi<Baseline>(`/api/admin/onboarding?view=baseline&audience=${audience}`);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="mt-3 text-ink-muted">Loading…</p>;
  if (!data.shown)
    return (
      <p className="mt-3 rounded-2xl bg-muted px-4 py-3 text-sm">
        {data.completed} completed so far. Totals appear once {data.min} people have finished it, so a figure can’t be traced to a person.
      </p>
    );
  return (
    <div className="mt-3 overflow-x-auto">
      <p className="text-sm text-ink-muted">
        Version {data.version}, {data.completed} people, first answers only. One question says little by itself: read these as where to look, not as a measure
        of anyone. No individual’s answers are shown here.
      </p>
      <table className="mt-2 w-full min-w-[34rem] text-left text-sm">
        <thead className="text-ink-muted">
          <tr>
            <th scope="col" className="py-1 pr-2 font-semibold">
              Question
            </th>
            <th scope="col" className="px-2 py-1 text-right font-semibold">
              Reviewed answer
            </th>
            <th scope="col" className="px-2 py-1 text-right font-semibold">
              Another answer
            </th>
            <th scope="col" className="py-1 pl-2 text-right font-semibold">
              I’m not sure
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {data.questions.map((q) => (
            <tr key={q.questionId}>
              <th scope="row" className="py-1.5 pr-2 font-normal">
                {q.stem} <span className="text-ink-muted">· version {q.version}</span>
              </th>
              <td className="px-2 py-1.5 text-right tabular-nums">{q.right}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{q.other}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums">{q.unsure}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.confidence.length > 0 && (
        <p className="mt-2 text-sm">How confident people said they felt: {data.confidence.map((c) => `${c.label} (${c.people})`).join(", ")}.</p>
      )}
    </div>
  );
}
