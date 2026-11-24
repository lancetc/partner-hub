"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { FAMILY_DIMENSIONS, FAMILY_DIM_ORDER, FAMILY_LEVELS } from "@/lib/familyCall";
import type { familyCallsAdmin, reviewDetail } from "@/server/familyCall";
import { AdminShell, Badge, btn, ErrorNote } from "./ui";

/*
  Tough Family Calls for authors and Quality (docs/tough-phone-call.md, "Tough Family Call"): participation with text
  and voice treated alike, rubric levels with their denominators (nothing under five people), critical patterns only
  where a reviewer has approved the threshold, content health, the learning-to-work trace, and the review queue.
  Nobody's words appear here except a flagged moment a reviewer opens, and that access is audited. Nothing reads a
  person's emotional state: the caller's mood is fiction, and isn't reported.
*/

type Report = ReturnType<typeof familyCallsAdmin>;
type Call = Report["calls"][number];
type Detail = ReturnType<typeof reviewDetail>;
const box = "rounded-2xl border border-line bg-surface p-4";
const num = "py-1.5 pr-3 text-right tabular-nums";

export function FamilyCallsAdmin() {
  const { data, error, reload } = useApi<Report>("/api/admin/family-calls");
  return (
    <AdminShell title="Tough Family Calls">
      <p className="max-w-3xl text-ink-muted">
        Published family calls: who took part (typed and spoken alike), how the five dimensions went, which approved critical errors recur, how the content is
        holding up, and the trace from the verified theme to the separately owned work measure. Practice evidence only: it isn’t proof of call quality or a
        reduction in complaints, and it’s never a reading of anyone’s feelings.
      </p>
      {error && <ErrorNote text={error} />}
      {!data ? (
        <p className="mt-4 text-ink-muted">Loading…</p>
      ) : !data.calls.length ? (
        <p className={cx(box, "mt-4")}>No Tough Family Call is published yet. Drafts are in the Magazine editor.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {data.calls.map((c) => (
            <CallCard key={`${c.guideId}:${c.blockId}`} c={c} onChanged={reload} />
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

function CallCard({ c, onChanged }: { c: Call; onChanged: () => void }) {
  const t = c.totals;
  return (
    <li className={box}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{c.title}</h2>
        <Badge tone={c.usable.ok ? "good" : "warn"}>{c.usable.ok ? "In use" : "Paused"}</Badge>
        <Badge>{c.mode === "assessed" ? "Assessed" : "Practice"}</Badge>
        <Badge tone="info">{c.caller === "script" ? "Reviewed script" : "Bounded AI caller"}</Badge>
      </div>
      <p className="text-sm text-ink-muted">
        <Link href={`/admin/magazine/${c.guideId}`} className="underline">
          {c.guide}
        </Link>{" "}
        · {c.scenario} · {c.rubric} · {c.audience}
      </p>

      <h3 className="mt-3 text-sm font-semibold">Participation</h3>
      <p className="text-sm">
        {t.people} {t.people === 1 ? "person" : "people"} started · {t.attempts} attempts · {t.completed} completed · {t.retries} retries · {t.textOnly} typed
        only · {t.withVoice} with voice
      </p>

      <h3 className="mt-3 text-sm font-semibold">The five dimensions (each person’s first submitted attempt)</h3>
      {t.suppressed || !t.levels ? (
        <p className="text-sm text-ink-muted">Fewer than five people have submitted ({t.counted}), so levels aren’t shown.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-1 text-sm">
            <caption className="sr-only">People at each level, by dimension</caption>
            <thead>
              <tr className="text-left">
                <th className="py-1.5 pr-3">Dimension</th>
                {FAMILY_LEVELS.map((l) => (
                  <th key={l} className={num}>
                    {l}
                  </th>
                ))}
                <th className={num}>n</th>
              </tr>
            </thead>
            <tbody>
              {FAMILY_DIM_ORDER.map((d) => (
                <tr key={d} className="border-t border-line">
                  <th className="py-1.5 pr-3 text-left font-normal">{FAMILY_DIMENSIONS[d].label}</th>
                  {t.levels![d].map((n, i) => (
                    <td key={i} className={num}>
                      {n}
                    </td>
                  ))}
                  <td className={num}>{t.counted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!t.suppressed && (
        <p className="mt-1 text-sm">
          Practised: {t.practised} of {t.counted}
          {t.passed !== null ? ` · passed: ${t.passed} of ${t.counted}` : ""} · endings:{" "}
          {Object.entries(t.endings ?? {})
            .map(([k, n]) => `${k} ${n}`)
            .join(", ") || "none yet"}
        </p>
      )}

      <h3 className="mt-3 text-sm font-semibold">Critical decision patterns</h3>
      {t.criticalPatterns === null ? (
        <p className="text-sm text-ink-muted">Not shown under five people.</p>
      ) : (
        <p className="text-sm">
          {Object.entries(t.criticalPatterns)
            .map(([k, n]) => `${k}: ${n} of ${t.counted}`)
            .join(" · ") || "None with an approved threshold."}
          {t.criticalAwaitingApproval ? ` ${t.criticalAwaitingApproval} more kinds await a reviewer’s approval, so they aren’t shown as patterns.` : ""}
        </p>
      )}

      <h3 className="mt-3 text-sm font-semibold">Content health</h3>
      <ul className="list-disc pl-5 text-sm">
        <li>
          Caller fallback rate: {Math.round(t.health.fallbackRate * 100)}% of {t.health.turns} turns used the reviewed script because the AI caller was
          unavailable or strayed.
        </li>
        <li>
          Transcript corrections: {Math.round(t.health.correctionRate * 100)}% of {t.health.voiceTurns} spoken turns.
        </li>
        <li>
          Waiting for review: {t.health.reviewQueue} · results flagged for a person: {t.health.reviewFlags}
        </li>
        <li>Reported problems with the case or a source: {c.health.sourceIssues}</li>
        <li>Sources past review: {c.health.staleSources.length ? c.health.staleSources.join("; ") : "none"}</li>
        <li>
          Character continuity: {c.health.continuity.length ? `${c.health.continuity.length} for the story owner` : "nothing open"}
          {c.health.continuity.length > 0 && (
            <ul className="list-[circle] pl-5">
              {c.health.continuity.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </li>
      </ul>

      <h3 className="mt-3 text-sm font-semibold">Learning to work</h3>
      <dl className="grid gap-x-4 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold">Verified theme</dt>
        <dd>{c.work.theme || "Not linked"}</dd>
        <dt className="font-semibold">Rationale decision</dt>
        <dd>{c.work.decision}</dd>
        <dt className="font-semibold">Work measure</dt>
        <dd>{c.work.measure}</dd>
        <dt className="font-semibold">Job Aid</dt>
        <dd>
          {c.work.jobAid} · in {c.work.favourites} {c.work.favourites === 1 ? "person’s" : "people’s"} Favourites (use, not proof of a good call)
        </dd>
        <dt className="font-semibold">Register decision</dt>
        <dd>{c.work.register}</dd>
      </dl>
      <p className="mt-1 text-xs text-ink-muted">
        Practice results and the work measure are shown apart. A change in complaints isn’t evidence of this training on its own: easier reporting can raise
        recorded complaints.
      </p>

      {c.queue.length > 0 && <Queue c={c} onChanged={onChanged} />}
    </li>
  );
}

function Queue({ c, onChanged }: { c: Call; onChanged: () => void }) {
  const [open, setOpen] = useState<Detail | null>(null);
  const [problem, setProblem] = useState("");
  return (
    <section className="mt-3 rounded-2xl bg-muted p-3">
      <h3 className="text-sm font-semibold">Review queue (assessed attempts)</h3>
      {problem && <ErrorNote text={problem} />}
      <ul className="mt-1 flex flex-col gap-2 text-sm">
        {c.queue.map((q) => (
          <li key={q.attemptId} className="rounded-xl bg-surface p-3">
            <p className="font-semibold">Attempt {q.attemptId}</p>
            <ul className="list-disc pl-5">
              {q.reasons.map((r) => (
                <li key={r.code}>{r.text}</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className={btn.secondary}
                onClick={async () => {
                  try {
                    setOpen(await api<Detail>(`/api/admin/family-calls?review=${encodeURIComponent(q.attemptId)}`));
                  } catch (e) {
                    setProblem(e instanceof Error ? e.message : "That couldn’t be opened.");
                  }
                }}
              >
                Open the flagged evidence (audited)
              </button>
              {(["passed", "not-passed", "formative-only"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={btn.quiet}
                  onClick={async () => {
                    if (!window.confirm(`Record “${d.replace("-", " ")}” for this attempt?`)) return;
                    try {
                      await api("/api/admin/family-calls", { body: { attemptId: q.attemptId, decision: d } });
                      setOpen(null);
                      onChanged();
                    } catch (e) {
                      setProblem(e instanceof Error ? e.message : "That didn’t save.");
                    }
                  }}
                >
                  {d === "passed" ? "Passed" : d === "not-passed" ? "Not passed" : "Formative only"}
                </button>
              ))}
            </div>
            {open?.attemptId === q.attemptId && (
              <div className="mt-2">
                {open.purged && <p className="text-ink-muted">The learner’s words have passed their retention date.</p>}
                <ul className="flex flex-col gap-1">
                  {open.critical.map((x) => (
                    <li key={x.risk}>
                      <span className="font-semibold">
                        {x.text} ({x.by === "model" ? "AI reader only" : "rule"}
                        {x.approved ? "" : ", threshold not approved"}):
                      </span>{" "}
                      {x.turn === null ? x.quote : `reply ${x.turn}, “${x.quote}”`}
                    </li>
                  ))}
                  {open.moments.map((m, i) => (
                    <li key={i}>
                      Reply {m.turn}: “{m.quote}” · {m.behaviour}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
