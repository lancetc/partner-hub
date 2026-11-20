"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi, type Me } from "@/lib/api";
import { cx } from "@/lib/format";
import type { RelayReport } from "@/server/relayAdmin";
import { BarList } from "../problems/ProblemCharts";
import { box, dateText, Section, Tile } from "../problems/problemUi";
import { AdminShell, btn, ErrorNote, Field, input } from "../ui";
import { Icon } from "../../Icon";

/*
  Ava Relay for administrators (docs/ava-relay.md): one course, one published version and one date range at a
  time. Three sections that are kept apart on purpose: who used the relay, what learners did in the course's own
  activities, and the work measure the course answers to on the Problem desk. None is evidence for another, and
  nothing here shows what anyone asked.
*/

type Settings = { on: boolean; retentionDays: number };
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "");

export function RelayAdmin() {
  const [guide, setGuide] = useState("");
  const [revision, setRevision] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = new URLSearchParams({ view: "report", ...(guide && { guide }), ...(revision && { revision }), ...(from && { from }), ...(to && { to }) });
  const { data, error } = useApi<RelayReport>(`/api/admin/relay?${q}`);
  const settings = useApi<Settings>("/api/admin/relay?view=settings");
  const me = useApi<Me>("/api/me").data;
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState("");

  const act = async (body: Record<string, unknown>, done: (out: Record<string, string>) => void) => {
    setBusy(true);
    setProblem(null);
    try {
      done(await api<Record<string, string>>("/api/admin/relay", { body }));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work.");
    } finally {
      setBusy(false);
    }
  };

  const c = data?.course;
  const v = c?.version;
  const e = c && "engagement" in c ? c.engagement : undefined;
  const asked = e ? Object.values(e.questions).reduce((a, b) => a + b, 0) : 0;

  return (
    <AdminShell title="Ava Relay">
      <p className="max-w-3xl text-ink-muted">
        A text-only guide on Magazine story pages. Authors switch it on per course and page in the Magazine editor. This page shows how it’s being used, beside
        what the course’s own activities and the work measure show. Using Ava is engagement: it isn’t evidence that someone can make the decision.
      </p>
      {(error || problem) && <ErrorNote text={problem ?? error ?? ""} />}

      <Section title="The Hub">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={cx(box, "flex flex-col gap-3")}>
            <p className="font-semibold">Switch and retention</p>
            {!settings.data ? (
              <p className="text-sm text-ink-muted">Loading…</p>
            ) : (
              <>
                <p className="text-sm">
                  Ava Relay is <strong>{settings.data.on ? "on" : "off"}</strong> for the Hub. Conversations are kept for{" "}
                  <strong>{settings.data.retentionDays} days</strong>, then deleted with their words. Only the learner can read their own conversation back.
                  Reports and the audit record hold no words.
                </p>
                {me?.isSuperadmin ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <button
                      type="button"
                      className={btn.secondary}
                      disabled={busy}
                      onClick={() => void act({ action: "settings", on: !settings.data!.on }, () => settings.reload())}
                    >
                      {settings.data.on ? "Switch off everywhere" : "Switch back on"}
                    </button>
                    <Field label="Keep conversations for (days)" className="w-56">
                      <input
                        className={input}
                        inputMode="numeric"
                        placeholder={String(settings.data.retentionDays)}
                        value={days}
                        onChange={(ev) => setDays(ev.target.value.replace(/\D/g, "").slice(0, 2))}
                      />
                    </Field>
                    <button
                      type="button"
                      className={btn.secondary}
                      disabled={busy || !days || Number(days) < 1 || Number(days) > 90}
                      onClick={() =>
                        void act({ action: "settings", retentionDays: Number(days) }, () => {
                          setDays("");
                          settings.reload();
                        })
                      }
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">A Hub administrator can change these.</p>
                )}
                <p className="text-xs text-ink-muted">
                  Switching off takes effect at once, in every course, without republishing. From 1 to 90 days; a shorter period applies to new conversations.
                </p>
              </>
            )}
          </div>
          <div className={cx(box, "flex flex-col gap-3")}>
            <p className="font-semibold">The pilot course</p>
            <p className="text-sm">
              “Dot and the rose garden”: two fictional pages that follow the Story Plan pilot. Page one has the decision; page two moves a few weeks on. It’s
              added as a draft, for you to read, test and publish.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btn.secondary} disabled={busy} onClick={() => void act({ action: "pilot" }, (out) => setNote(out.id))}>
                <Icon name="plus" className="size-4" /> Add the pilot as a draft
              </button>
              {note && (
                <Link href={`/admin/magazine/${note}`} className="font-semibold text-accent underline">
                  Open it in the editor
                </Link>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Report" hint="Pick the course, the published version and the dates. The numbers below are for exactly that.">
        {!data ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : !data.courses.length ? (
          <p className={cx(box, "text-sm text-ink-muted")}>
            No course has Ava Relay switched on yet. In the Magazine editor, open a course and choose Ava Relay in the sidebar.
          </p>
        ) : (
          <div className={cx(box, "grid gap-3 sm:grid-cols-2 lg:grid-cols-4")}>
            <Field label="Course">
              <select
                className={input}
                value={c?.id ?? ""}
                onChange={(ev) => {
                  setGuide(ev.target.value);
                  setRevision("");
                }}
              >
                {data.courses.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                    {x.published ? "" : " (not published)"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Published version">
              <select className={input} value={v?.id ?? ""} onChange={(ev) => setRevision(ev.target.value)} disabled={!c?.versions.length}>
                {!c?.versions.length && <option value="">None yet</option>}
                {c?.versions.map((x) => (
                  <option key={x.id} value={x.id}>
                    Version {x.number} · {dateText(x.publishedAt)}
                    {x.live ? " · live" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From">
              <input type="date" className={input} value={from || data.range.from} onChange={(ev) => setFrom(ev.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" className={input} value={to || data.range.to} onChange={(ev) => setTo(ev.target.value)} />
            </Field>
          </div>
        )}
      </Section>

      {c && !v && <p className={cx(box, "mt-4 text-sm text-ink-muted")}>“{c.title}” hasn’t been published, so there is nothing to report yet.</p>}

      {c && v && e && "learning" in c && (
        <>
          <p className="mt-4 text-sm text-ink-muted" role="status">
            {c.title} · version {v.number}
            {v.live ? " (live)" : ""} · {dateText(data!.range.from)} to {dateText(data!.range.to)} · Ava is on {v.relayPages} of {v.pages} page
            {v.pages === 1 ? "" : "s"}
            {v.workOffered ? "" : " · Work guidance off"}
          </p>

          <Section
            title="Engagement"
            hint="Who could have opened Ava, who did, and what they asked for. Eligible learners are people who opened a page with Ava on it in these dates. Opening the relay or sending a message is not a learning result."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label="Eligible learners" value={e.eligible} detail="Opened a page with Ava on it" />
              <Tile
                label="Learners who dialled"
                value={e.dialledPeople}
                detail={e.eligible ? `${pct(e.dialledPeople, e.eligible)} of eligible · ${e.dialled} dial${e.dialled === 1 ? "" : "s"}` : `${e.dialled} dials`}
              />
              <Tile label="Learners who asked" value={e.askers} detail={`${asked} question${asked === 1 ? "" : "s"}`} />
              <Tile
                label="Came back another day"
                value={e.returned}
                detail={e.dialledPeople ? `${pct(e.returned, e.dialledPeople)} of those who dialled` : undefined}
              />
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <BarList
                title="Questions by mode"
                unit="questions"
                one="question"
                rows={[
                  { key: "story", label: "In this story", value: e.questions.story ?? 0 },
                  { key: "work", label: "Work guidance", value: e.questions.work ?? 0 },
                ]}
              />
              <BarList
                title="How Ava’s answers were grounded"
                note="A count of answers by where they came from. Not a score."
                unit="answers"
                one="answer"
                rows={e.answers.map((a) => ({ key: a.kind, label: a.label, value: a.n }))}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Tile label="Source links opened" value={e.sourceOpens} />
              <Tile label="Changes of mode" value={e.modeChanges} />
              <Tile
                label="Failed to connect or answer"
                value={e.failed}
                detail={e.dialled ? `Dialled ${e.dialled} times, linked ${e.linked} times` : undefined}
              />
            </div>
            <div className={cx(box, "mt-3 overflow-x-auto")}>
              <table className="w-full min-w-[30rem] text-left text-sm">
                <caption className="sr-only">Ava Relay use by page</caption>
                <thead className="text-ink-muted">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 font-medium">
                      Page with Ava on it
                    </th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                      Learners who opened the page
                    </th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                      Learners who dialled
                    </th>
                    <th scope="col" className="py-1.5 text-right font-medium">
                      Questions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {e.perPage.map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <th scope="row" className="py-1.5 pr-3 font-medium">
                        {p.title}
                      </th>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{p.opened}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{p.dialled}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.questions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Learning"
            hint="What learners did in the course’s own decisions on those pages, as the course scored them. An answer from Ava is never counted as a passed activity, and this is every learner who answered, whether or not they opened Ava."
          >
            {!c.learning.decisions.length ? (
              <p className={cx(box, "text-sm text-ink-muted")}>The pages with Ava on them have no decision question in this version.</p>
            ) : (
              <div className={cx(box, "overflow-x-auto")}>
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <caption className="sr-only">First answers to each decision on pages with Ava</caption>
                  <thead className="text-ink-muted">
                    <tr>
                      <th scope="col" className="py-1.5 pr-3 font-medium">
                        Decision
                      </th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                        Learners who answered
                      </th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                        First answer: best
                      </th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                        Acceptable
                      </th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                        Risky
                      </th>
                      <th scope="col" className="py-1.5 text-right font-medium">
                        Tried again
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.learning.decisions.map((d) => (
                      <tr key={d.blockId} className="border-t border-line">
                        <th scope="row" className="py-1.5 pr-3 font-medium">
                          {d.prompt || "A decision"}
                          <span className="block text-xs font-normal text-ink-muted">{d.page}</span>
                        </th>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{d.answered}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{d.first.best}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{d.first.acceptable}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{d.first.risky}</td>
                        <td className="py-1.5 text-right tabular-nums">{d.retried}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title="Work results"
            hint="The work measure belongs to the response decision on the Problem desk, with its own source, baseline and time lag. It is shown here so the chain can be followed, not because Ava’s use explains it."
          >
            {!c.work ? (
              <p className={cx(box, "text-sm text-ink-muted")}>
                No response decision on the Problem desk points to this course. When a theme’s learning plan starts a course, the link appears here and on the
                theme.
              </p>
            ) : (
              <div className={cx(box, "flex flex-col gap-2 text-sm")}>
                <p>
                  <span className="text-ink-muted">Response decision for: </span>
                  <Link href={`/admin/problems/${c.work.themeId}`} className="font-semibold text-accent underline">
                    {c.work.theme}
                  </Link>
                  <span className="text-ink-muted"> · {c.work.status}</span>
                </p>
                {c.work.desired && (
                  <p>
                    <span className="text-ink-muted">Intended behaviour: </span>
                    {c.work.desired}
                  </p>
                )}
                <p>
                  <span className="text-ink-muted">Work measure: </span>
                  {c.work.measure || "Not chosen yet"}
                  {c.work.definition && <span className="text-ink-muted"> · {c.work.definition}</span>}
                </p>
                <p className="text-ink-muted">
                  {[
                    c.work.owner && `Owner: ${c.work.owner}`,
                    c.work.baseline && `Baseline: ${c.work.baseline}`,
                    c.work.lag && `Expected lag: ${c.work.lag}`,
                    c.work.reviewOn && `Review on ${dateText(c.work.reviewOn)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No owner, baseline or review date recorded yet."}
                </p>
                <p className="text-ink-muted">The current figures and their trend are on the theme, with their denominators.</p>
              </div>
            )}
          </Section>
        </>
      )}
    </AdminShell>
  );
}
