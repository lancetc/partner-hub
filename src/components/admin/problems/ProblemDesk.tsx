"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { LEARNING_DECISIONS, RISK, SOURCES, THEME_STATUS, type Risk, type SourceKind } from "@/lib/problemDesk";
import type { DeskOverview } from "@/server/problemDesk";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "../ui";
import { Icon } from "../../Icon";
import { BarList, LineChart } from "./ProblemCharts";
import { area, box, dateText, riskTone, Section, statusTone, Tile, useAct } from "./problemUi";

/*
  The Problem desk (docs/learning-designer.md): where a learning author starts from a signal, not from a course.
  Themes are human-reviewed groupings of de-identified cases; each leads to a diagnosis, a response decision
  (which may be no learning at all) and, later, evidence of whether work changed.
*/

export function ProblemDesk() {
  const [filter, setFilter] = useState({ status: "", risk: "", from: "", to: "" });
  const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
  const desk = useApi<DeskOverview>(`/api/admin/problems${qs ? `?${qs}` : ""}`);
  const { act, error, busy } = useAct(desk.reload);
  const router = useRouter();
  const [adding, setAdding] = useState<"theme" | "signal" | null>(null);
  const [theme, setTheme] = useState({ title: "", description: "", risk: "routine" as Risk, roles: "", owner: "" });
  const [signal, setSignal] = useState({ source: "complaint" as SourceKind, sourceRef: "", on: "", summary: "", themeId: "" });

  if (desk.error)
    return (
      <AdminShell title="Problem desk">
        <ErrorNote text={desk.error} />
      </AdminShell>
    );
  if (!desk.data)
    return (
      <AdminShell title="Problem desk">
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  const d = desk.data;
  const m = d.measures;
  const anySample = d.themes.some((t) => t.sample);

  return (
    <AdminShell title="Problem desk">
      <p className="max-w-3xl text-ink-muted">
        Start from what’s going wrong, not from a course. Each theme groups related, de-identified signals, then asks what people should do, what’s in the way,
        what’s been tried, and what the lightest useful response is. That can be a process fix, a job aid, a note, or no learning at all.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btn.primary} onClick={() => setAdding(adding === "theme" ? null : "theme")}>
          <Icon name="plus" className="size-4" /> New theme
        </button>
        <button type="button" className={btn.secondary} onClick={() => setAdding(adding === "signal" ? null : "signal")}>
          <Icon name="plus" className="size-4" /> Add a signal
        </button>
        <a className={btn.secondary} href={`/api/admin/problems/export${qs ? `?${qs}` : ""}`}>
          <Icon name="file" className="size-4" /> Export to Excel
        </a>
      </div>
      {error && (
        <div className="mt-3">
          <ErrorNote text={error} />
        </div>
      )}

      {adding === "theme" && (
        <form
          className={cx(box, "mt-4 grid gap-3 sm:grid-cols-2")}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act({ action: "create-theme", ...theme });
            if (r?.id) router.push(`/admin/problems/${String(r.id)}`);
          }}
        >
          <Field label="The theme, in a sentence" hint="What keeps happening, in plain words. No names or identifying details." className="sm:col-span-2">
            <input className={input} value={theme.title} onChange={(e) => setTheme({ ...theme, title: e.target.value })} required minLength={8} />
          </Field>
          <Field label="What’s known so far" className="sm:col-span-2">
            <textarea className={area} value={theme.description} onChange={(e) => setTheme({ ...theme, description: e.target.value })} />
          </Field>
          <Field label="Risk">
            <select className={input} value={theme.risk} onChange={(e) => setTheme({ ...theme, risk: e.target.value as Risk })}>
              {Object.entries(RISK).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Roles affected">
            <input className={input} value={theme.roles} onChange={(e) => setTheme({ ...theme, roles: e.target.value })} />
          </Field>
          <Field label="Owner" hint="The person or team who owns this problem.">
            <input className={input} value={theme.owner} onChange={(e) => setTheme({ ...theme, owner: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <button className={btn.primary} disabled={busy}>
              Create theme
            </button>
          </div>
        </form>
      )}
      {adding === "signal" && (
        <form
          className={cx(box, "mt-4 grid gap-3 sm:grid-cols-2")}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act({ action: "add-case", id: signal.themeId || undefined, ...signal });
            if (r) {
              setSignal({ ...signal, sourceRef: "", summary: "" });
              setAdding(null);
            }
          }}
        >
          <p className="text-sm text-ink-muted sm:col-span-2">
            A signal is a pointer to a record that lives somewhere else. Give its reference and a de-identified summary: no names, no client details. The same
            reference is only ever counted once.
          </p>
          <Field label="Where it came from">
            <select className={input} value={signal.source} onChange={(e) => setSignal({ ...signal, source: e.target.value as SourceKind })}>
              {Object.entries(SOURCES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source reference" hint="The record’s own ID in that system.">
            <input className={input} value={signal.sourceRef} onChange={(e) => setSignal({ ...signal, sourceRef: e.target.value })} required />
          </Field>
          <Field label="First reported">
            <input type="date" className={input} value={signal.on} onChange={(e) => setSignal({ ...signal, on: e.target.value })} required />
          </Field>
          <Field label="Theme" hint="Leave ungrouped if it isn’t clear yet.">
            <select className={input} value={signal.themeId} onChange={(e) => setSignal({ ...signal, themeId: e.target.value })}>
              <option value="">Not grouped yet</option>
              {d.themes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="De-identified summary" className="sm:col-span-2">
            <textarea className={area} value={signal.summary} onChange={(e) => setSignal({ ...signal, summary: e.target.value })} required />
          </Field>
          <div>
            <button className={btn.primary} disabled={busy}>
              Add signal
            </button>
          </div>
        </form>
      )}

      {d.safety.length > 0 && (
        <div role="status" className="mt-6 rounded-2xl border border-danger/60 bg-danger/5 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="alert" className="size-5 text-danger" /> Safety significance: operational action comes first
          </p>
          <p className="mt-1 text-sm text-ink-muted">These are never ranked below a common routine theme, and never wait on a course.</p>
          <ul className="mt-2 flex flex-col gap-1">
            {d.safety.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/problems/${t.id}`} className="font-medium underline underline-offset-2">
                  {t.title}
                </Link>{" "}
                <span className="text-sm text-ink-muted">
                  · {THEME_STATUS[t.status]}
                  {t.owner ? ` · ${t.owner}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Section
        title="Across every theme"
        hint={`As at ${dateText(d.asAt)}. A case is one source record; a follow-up about the same record is a contact, not a new case.`}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Open unique cases" value={m.openCases} detail={`of ${m.cases} linked`} />
          <Tile
            label="Cases with repeat contact"
            value={m.repeatCases}
            detail={m.cases ? `${Math.round((m.repeatCases / m.cases) * 100)}% of ${m.cases} cases` : undefined}
          />
          <Tile label="Reopened cases" value={m.reopened} detail="Closed, then opened again" />
          <Tile
            label="Median days to close"
            value={m.medianDaysToClose}
            detail={m.closedCases ? `${m.closedCases} closed ${m.closedCases === 1 ? "case" : "cases"}` : "No closed cases yet"}
          />
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <LineChart
            title="Issue trend"
            note="New cases, follow-up contacts and reopenings by month. Three separate counts: they are never added together."
            unit="count"
            buckets={d.trend.map((p) => p.bucket)}
            series={[
              { key: "new", name: "New unique cases", slot: 1, values: d.trend.map((p) => p.newCases) },
              { key: "follow", name: "Follow-up contacts", slot: 2, values: d.trend.map((p) => p.followUps) },
              { key: "reopen", name: "Reopened cases", slot: 3, values: d.trend.map((p) => p.reopened) },
            ]}
            empty="No signals in this period."
          />
          <BarList
            title="Recurring themes"
            note="Unique cases per theme. Volume alone doesn’t set priority: risk and whether anything can fix the cause count too."
            unit="cases"
            one="case"
            rows={d.recurring.map((t) => ({
              key: t.id,
              label: t.title,
              value: t.cases,
              href: `/admin/problems/${t.id}`,
              detail: `${RISK[t.risk]}${t.repeatCases ? ` · ${t.repeatCases} with repeat contact` : ""}`,
            }))}
          />
        </div>
      </Section>

      <Section
        title="Themes"
        hint="Safety first, then elevated, then by unique cases. The order is a starting point for the owner, not a score."
        aside={
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Status
              <select className={cx(input, "w-auto")} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
                <option value="">All</option>
                {Object.entries(THEME_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Risk
              <select className={cx(input, "w-auto")} value={filter.risk} onChange={(e) => setFilter({ ...filter, risk: e.target.value })}>
                <option value="">All</option>
                {Object.entries(RISK).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              From
              <input
                type="month"
                className={cx(input, "w-auto")}
                value={filter.from || d.range.from}
                onChange={(e) => setFilter({ ...filter, from: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              To
              <input
                type="month"
                className={cx(input, "w-auto")}
                value={filter.to || d.range.to}
                onChange={(e) => setFilter({ ...filter, to: e.target.value })}
              />
            </label>
          </div>
        }
      >
        {anySample && (
          <p className="mb-3 flex items-start gap-2 rounded-xl bg-muted p-3 text-sm">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" /> Themes marked “Sample” are fictional pilot records, here to show how the desk works. No real
            complaint, incident or person is behind them.
          </p>
        )}
        {!d.themes.length ? (
          <p className={cx(box, "text-ink-muted")}>{d.total ? "No themes match those filters." : "No themes yet. Start one from a signal."}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {d.themes.map((t) => (
              <li key={t.id} className={box}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={riskTone(t.risk)}>{RISK[t.risk]}</Badge>
                  <Badge tone={statusTone(t.status)}>{THEME_STATUS[t.status]}</Badge>
                  {!t.verified && <Badge tone="warn">Candidate: not yet verified</Badge>}
                  {t.sample && <Badge>Sample</Badge>}
                </div>
                <Link href={`/admin/problems/${t.id}`} className="mt-2 block font-serif text-lg font-semibold underline-offset-2 hover:underline">
                  {t.title}
                </Link>
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-ink-muted">Signals</dt>
                    <dd>
                      <span className="font-semibold tabular-nums">{t.counts.cases}</span> unique {t.counts.cases === 1 ? "case" : "cases"} ·{" "}
                      <span className="tabular-nums">{t.counts.contactEvents}</span> {t.counts.contactEvents === 1 ? "contact" : "contacts"}
                      {t.counts.reopened ? ` · ${t.counts.reopened} reopened` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Owner</dt>
                    <dd>{t.owner || "No owner yet"}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Learning decision</dt>
                    <dd>
                      {t.learning ? LEARNING_DECISIONS[t.learning] : "Not decided"}
                      {t.responseStatus === "approved" ? " · approved" : t.responseStatus === "draft" ? " · draft" : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">{t.next ? "Next action" : "Review"}</dt>
                    <dd>
                      {t.next
                        ? `${t.next.title}${t.next.due_date ? ` · due ${dateText(t.next.due_date)}` : ""}`
                        : t.reviewOn
                          ? dateText(t.reviewOn)
                          : "Not set"}
                    </dd>
                  </div>
                </dl>
                {t.priorityNote && <p className="mt-2 text-sm text-ink-muted">{t.priorityNote}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Not grouped yet"
        hint="Signals that haven’t been put with a theme. Grouping is a person’s call: move one where it belongs, or leave it until the pattern is clearer."
      >
        {!d.ungrouped.length ? (
          <p className={cx(box, "text-ink-muted")}>Nothing waiting.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {d.ungrouped.map((c) => (
              <li key={c.id} className={cx(box, "flex flex-wrap items-center gap-3")}>
                <div className="min-w-0 flex-1 basis-72">
                  <p className="text-sm font-semibold">
                    {SOURCES[c.source]} {c.sourceRef}
                    <span className="font-normal text-ink-muted"> · first reported {dateText(c.events[0]?.on ?? "")}</span>
                  </p>
                  <p className="mt-0.5">{c.summary}</p>
                </div>
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Move to a theme
                  <select
                    className={cx(input, "w-64 max-w-full")}
                    value=""
                    disabled={busy}
                    onChange={(e) => e.target.value && act({ action: "move-case", caseId: c.id, themeId: e.target.value })}
                  >
                    <option value="">Choose…</option>
                    {d.themes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AdminShell>
  );
}
