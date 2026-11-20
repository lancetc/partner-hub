"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { KIND_LABELS, REQUEST_STATES, type RequestState } from "@/lib/discovery";
import type { discoveryGaps } from "@/server/discovery";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";

/*
  Discovery gaps (docs/discovery-paths.md): what learners look for in My Discovery and don't find, the
  Topics and pages they save most, and the topics they've asked for. Aggregates only: no one's paths,
  goals or notes are shown, and a request arrives with the learner's role, not their name.
*/

type Data = ReturnType<typeof discoveryGaps>;
const ROLES: Record<string, string> = { partner: "Care Partners", coordinator: "Care coordinators", staff: "Trilogy Care staff" };
const TONES: Record<RequestState, "neutral" | "good" | "warn" | "bad" | "info"> = {
  new: "warn",
  reviewing: "info",
  planned: "info",
  published: "good",
  declined: "neutral",
};

export function DiscoveryGaps() {
  const { data, error, setData } = useApi<Data>("/api/admin/discovery");
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  if (error)
    return (
      <AdminShell title="Discovery gaps">
        <ErrorNote text={error} />
      </AdminShell>
    );
  if (!data)
    return (
      <AdminShell title="Discovery gaps">
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  const save = async (body: Record<string, unknown>) => {
    setProblem(null);
    try {
      setData(await api<Data>("/api/admin/discovery", { body }));
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
      return false;
    }
  };
  const t = data.totals;
  const waiting = data.requests.filter((r) => r.state === "new").length;
  return (
    <AdminShell title="Discovery gaps">
      <p className="max-w-3xl text-ink-muted">
        In <strong>My Discovery</strong>, learners build their own paths from published Topics and Magazine learning. This page shows where the Hub came up
        short for them. It’s all in aggregate: a learner’s paths, goals and notes are private, and nobody’s are shown here.
      </p>
      {problem && (
        <div className="mt-3">
          <ErrorNote text={problem} />
        </div>
      )}

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "People with a Discovery Path", value: t.people, note: `${t.paths} path${t.paths === 1 ? "" : "s"}, ${t.explored} explored` },
          { label: `Suggestions, last ${data.days} days`, value: t.suggested, note: `${t.accepted} started as offered, ${t.edited} changed first` },
          { label: "Goals with nothing to suggest", value: t.empty, note: `${waiting} topic request${waiting === 1 ? "" : "s"} waiting` },
          { label: "Steps opened", value: t.opened, note: `${t.reviewed} marked “Reviewed for now”, ${t.savedElsewhere} saved from a Topic or page` },
        ].map((s) => (
          <div key={s.label} className="rounded-3xl bg-surface p-4 ring-1 ring-line">
            <dt className="text-sm font-semibold text-ink-muted">{s.label}</dt>
            <dd className="mt-1 font-serif text-3xl font-semibold">{s.value}</dd>
            <dd className="text-sm text-ink-muted">{s.note}</dd>
          </div>
        ))}
      </dl>
      {t.suggestedRemoved > 0 && (
        <p className="mt-2 text-sm text-ink-muted">
          Learners took {t.suggestedRemoved} suggested step{t.suggestedRemoved === 1 ? "" : "s"} out of their paths: a sign a suggestion didn’t fit.
        </p>
      )}

      <section aria-labelledby="dg-requests" className="mt-6 rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="dg-requests" className="font-serif text-xl font-semibold">
          Topics learners have asked for ({data.requests.length})
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Sent by a learner when nothing published fitted their goal. Read each one before using it as a brief, and take out anything that could identify a
          client. New learning still goes through the usual sources, review and publishing: nothing is generated from a request.
        </p>
        {data.requests.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-muted px-4 py-3 text-sm">No requests yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {data.requests.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.goal}</span>
                  <Badge tone={TONES[r.state]}>{REQUEST_STATES[r.state].owner}</Badge>
                  <span className="text-sm text-ink-muted">
                    From one of the {ROLES[r.audience] ?? r.audience} · {formatDate(r.createdAt)}
                  </span>
                </div>
                {r.context && <p className="text-sm">“{r.context}”</p>}
                {(r.note || r.link) && (
                  <p className="text-sm text-ink-muted">
                    {r.note}
                    {r.link && (
                      <>
                        {r.note ? " · " : ""}
                        <Link href={r.link} className="font-semibold text-accent hover:underline">
                          {r.link}
                        </Link>
                      </>
                    )}
                    {r.handledBy && r.handledAt ? ` · ${r.handledBy}, ${formatDate(r.handledAt)}` : ""}
                  </p>
                )}
                {editing === r.id ? (
                  <form
                    className="grid gap-3 rounded-2xl bg-muted p-4 sm:grid-cols-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await save({ id: r.id, ...Object.fromEntries(new FormData(e.currentTarget)) })) setEditing(null);
                    }}
                  >
                    <Field label="What was asked for" hint="Tidy the wording, and take out any client’s name or health details." className="sm:col-span-2">
                      <input name="goal" defaultValue={r.goal} maxLength={300} required className={input} />
                    </Field>
                    <Field label="What they added" className="sm:col-span-2">
                      <textarea name="context" defaultValue={r.context} maxLength={500} className={cx(input, "min-h-16 py-2")} />
                    </Field>
                    <Field label="What’s happening">
                      <select name="state" defaultValue={r.state} className={input}>
                        {(Object.keys(REQUEST_STATES) as RequestState[]).map((s) => (
                          <option key={s} value={s}>
                            {REQUEST_STATES[s].owner}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Link to what was published" hint="A Topic or Magazine page on the Hub, like /topics/its-name. Needed for Published.">
                      <input name="link" defaultValue={r.link ?? ""} className={input} placeholder="/topics/…" />
                    </Field>
                    <Field label="Note for the learner" hint="Shown to them beside their request." className="sm:col-span-2">
                      <input name="note" defaultValue={r.note} maxLength={500} className={input} />
                    </Field>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <button type="submit" className={btn.primary}>
                        Save
                      </button>
                      <button type="button" className={btn.quiet} onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <button type="button" className={btn.secondary} onClick={() => setEditing(r.id)}>
                      Review this request
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dg-empty" className="mt-5 rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="dg-empty" className="font-serif text-xl font-semibold">
          Goals with nothing to suggest
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          From the last {data.days} days, as the key words of the goal, not the goal as typed. A goal appears only once {data.minPeople} or more people have
          asked for something like it, so one person’s question is never shown.
          {data.hidden > 0
            ? ` ${data.hidden} more ${data.hidden === 1 ? "was" : "were"} asked by one person each and ${data.hidden === 1 ? "isn’t" : "aren’t"} listed.`
            : ""}
        </p>
        {data.noResult.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-muted px-4 py-3 text-sm">Nothing to show yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {data.noResult.map((g) => (
              <li key={g.words} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-semibold">{g.words}</span>
                <span className="text-sm text-ink-muted">
                  {g.people} people, {g.times} times · {g.audiences.map((a) => ROLES[a] ?? a).join(", ")} · last {formatDate(g.lastAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {data.words.length > 0 && (
          <>
            <h3 className="mt-4 font-semibold">Words that come up most in those goals</h3>
            <p className="mt-2 flex flex-wrap gap-2">
              {data.words.map((w) => (
                <span key={w.word} className="rounded-full bg-muted px-3 py-1 text-sm">
                  {w.word} <span className="text-ink-muted">· {w.people}</span>
                </span>
              ))}
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="dg-saved" className="mt-5 rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="dg-saved" className="font-serif text-xl font-semibold">
          Saved most
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          The Topics, courses and pages in the most people’s Discovery Paths. A page only appears here if it’s marked “Suitable as a standalone reference” in
          its page settings.
        </p>
        {data.saved.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-muted px-4 py-3 text-sm">Nothing has been saved to a Discovery Path yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="text-ink-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Learning
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Format
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    People
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Useful to revisit
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-semibold">
                    Reviewed for now
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.saved.map((s) => (
                  <tr key={s.key}>
                    <th scope="row" className="py-2 pr-3 font-semibold">
                      {s.title}
                      {s.parent && <span className="block font-normal text-ink-muted">in {s.parent}</span>}
                    </th>
                    <td className="px-3 py-2">{KIND_LABELS[s.kind]}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.people}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.revisit}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{s.reviewed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
