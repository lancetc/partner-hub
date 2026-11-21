"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { BARRIERS, LENSES, type Barrier } from "@/lib/blockRegistry";
import {
  CONFIDENCE,
  CONSIDERATIONS,
  EVENT_KINDS,
  LEARNING_DECISIONS,
  RISK,
  SOURCES,
  THEME_STATUS,
  type Confidence,
  type Diagnosis,
  type EventKind,
  type Risk,
  type SourceKind,
  type ThemeStatus,
} from "@/lib/problemDesk";
import type { ThemeDetail } from "@/server/problemDesk";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "../ui";
import { Icon } from "../../Icon";
import { LineChart } from "./ProblemCharts";
import { DecisionTab, MeasuresTab, PlanTab, ResponsesTab, ReviewTab } from "./ProblemThemeParts";
import { area, box, dateText, riskTone, Section, statusTone, Tile, useAct, type Act } from "./problemUi";

/*
  One theme, along its trail (docs/learning-designer.md): the signals, the diagnosis, what already exists, what's
  been tried, the response decision, the learning plan with its reasons, the measures and the review. Each step
  can be saved on its own, and none of them has to end in a course.
*/

const TABS = {
  signals: "Signals",
  diagnosis: "Diagnosis",
  content: "Existing content",
  responses: "What’s been tried",
  decision: "Response decision",
  plan: "Learning plan",
  measures: "Measures",
  review: "Review",
} as const;
type Tab = keyof typeof TABS;
export type TabProps = { d: ThemeDetail; act: Act; busy: boolean };

const HISTORY: Record<string, string> = {
  created: "Theme created",
  risk: "Risk changed",
  status: "Status changed",
  verified: "Grouping verified",
  unverified: "Verification removed",
  "case-added": "Case linked",
  "case-moved-out": "Case moved out",
  "case-moved-in": "Case moved in",
  "false-match": "Marked a false match",
  "match-restored": "Match restored",
  "merged-into": "Merged into",
  "merged-from": "Merged from",
  split: "Split",
  "diagnosis-verified": "Diagnosis confirmed",
  "diagnosis-reopened": "Diagnosis reopened",
  "response-reopened": "Response back to draft",
  "response-approved": "Response approved",
  "course-started": "Magazine draft started",
  reviewed: "Reviewed",
};

export function ProblemTheme({ id }: { id: string }) {
  const theme = useApi<ThemeDetail>(`/api/admin/problems?theme=${encodeURIComponent(id)}`);
  const { act, error, busy } = useAct(theme.reload);
  const [tab, setTab] = useState<Tab>("signals");
  const back = { href: "/admin/problems", label: "Problem desk" };

  if (theme.error)
    return (
      <AdminShell title="Problem desk" back={back}>
        <ErrorNote text={theme.error} />
      </AdminShell>
    );
  if (!theme.data)
    return (
      <AdminShell title="Problem desk" back={back}>
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  const d = theme.data;
  const t = d.theme;
  const p = { d, act, busy };
  const done: Record<Tab, boolean> = {
    signals: t.verified,
    diagnosis: d.diagnosis.verified,
    content: d.checks.length > 0,
    responses: d.actions.length > 0,
    decision: d.response.status === "approved",
    plan: d.plan.steps.some((s) => s.status === "accepted"),
    measures: d.metrics.length > 0,
    review: d.reviews.length > 0,
  };

  return (
    <AdminShell title={t.title} back={back}>
      <div className="-mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={riskTone(t.risk)}>{RISK[t.risk]}</Badge>
        <Badge tone={statusTone(t.status)}>{THEME_STATUS[t.status]}</Badge>
        {t.verified ? <Badge tone="good">Grouping verified</Badge> : <Badge tone="warn">Candidate: not yet verified</Badge>}
        {t.sample && <Badge>Sample data</Badge>}
        {t.owner && <span className="text-sm text-ink-muted">Owner: {t.owner}</span>}
        {t.verified && (
          <a
            href={`/admin/signal-room/${t.id}`}
            className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-accent underline underline-offset-2"
          >
            <Icon name="gauge" className="size-4" /> See it over time in the Signal Room
          </a>
        )}
      </div>
      {t.mergedInto && (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm">
          This theme was merged into{" "}
          <a className="font-medium underline" href={`/admin/problems/${t.mergedInto}`}>
            another theme
          </a>
          . Its history is kept here.
        </p>
      )}
      {t.risk === "safety" && (
        <p role="status" className="mt-3 flex items-start gap-2 rounded-2xl border border-danger/60 bg-danger/5 p-3 text-sm">
          <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-danger" />
          <span>
            <strong>Safety significance.</strong> The operational response belongs to the incident and clinical owners and comes first. Nothing here
            acknowledges, resolves or closes the real record, and learning never stands in for the fix.
          </span>
        </p>
      )}

      <div role="tablist" aria-label="Steps" className="mt-5 flex gap-1 overflow-x-auto border-b border-line pb-px">
        {(Object.keys(TABS) as Tab[]).map((k, i) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`pd-tab-${k}`}
            aria-selected={tab === k}
            aria-controls="pd-panel"
            onClick={() => setTab(k)}
            className={cx(
              "flex min-h-11 shrink-0 items-center gap-1.5 rounded-t-xl border-b-2 px-3 text-sm font-semibold",
              tab === k ? "border-action bg-tealtint text-ink" : "border-transparent text-ink-muted hover:bg-muted hover:text-ink",
            )}
          >
            <span className="tabular-nums text-ink-muted">{i + 1}</span> {TABS[k]}
            {done[k] && <Icon name="check" className="size-3.5 text-success" aria-label="done" />}
          </button>
        ))}
      </div>
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      <div role="tabpanel" id="pd-panel" aria-labelledby={`pd-tab-${tab}`} className="mt-6">
        {tab === "signals" && <SignalsTab {...p} />}
        {tab === "diagnosis" && <DiagnosisTab key={JSON.stringify(d.diagnosis)} {...p} />}
        {tab === "content" && <ContentTab {...p} />}
        {tab === "responses" && <ResponsesTab {...p} />}
        {tab === "decision" && <DecisionTab key={JSON.stringify(d.response.data)} {...p} />}
        {tab === "plan" && <PlanTab {...p} />}
        {tab === "measures" && <MeasuresTab {...p} />}
        {tab === "review" && <ReviewTab {...p} />}
      </div>
    </AdminShell>
  );
}

// ---------------------------------------------------------------------------------------------
// 1. Signals
// ---------------------------------------------------------------------------------------------

function SignalsTab({ d, act, busy }: TabProps) {
  const t = d.theme;
  const [facts, setFacts] = useState({
    title: t.title,
    description: t.description,
    risk: t.risk,
    roles: t.roles,
    segment: t.segment,
    denominator: t.denominator === null ? "" : String(t.denominator),
    denominatorNote: t.denominatorNote,
    owner: t.owner,
    priorityNote: t.priorityNote,
  });
  const [status, setStatus] = useState<{ status: ThemeStatus; note: string }>({ status: t.status, note: "" });
  const [newCase, setNewCase] = useState({ source: "complaint" as SourceKind, sourceRef: "", on: "", summary: "", party: "" });
  const [event, setEvent] = useState<{ caseId: string; kind: EventKind; on: string; note: string } | null>(null);
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [split, setSplit] = useState("");
  const [merge, setMerge] = useState({ into: "", reason: "" });
  const c = d.counts;

  return (
    <>
      <Section
        title="What the signals show"
        hint="A case is one source record. Follow-ups about the same record are contacts on that case: they show how persistent it is, without making the problem look bigger."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile label="Unique cases" value={c.cases} detail={`${c.open} open as at ${dateText(d.asAt)}`} />
          <Tile label="Contact events" value={c.contactEvents} detail={`${c.followUps} follow-ups`} />
          <Tile label="Reopened cases" value={c.reopened} />
          <Tile label="Median days to close" value={c.medianDaysToClose} detail={c.closedCases ? `${c.closedCases} closed` : "None closed yet"} />
          <Tile label="Eligible denominator" value={t.denominator} detail={t.denominatorNote || (t.denominator === null ? "Ask the data owner" : undefined)} />
        </div>
        <div className="mt-3">
          <LineChart
            title="Issue trend for this theme"
            note="By month. Small numbers: read the direction, not the decimals."
            unit="count"
            buckets={d.trend.map((x) => x.bucket)}
            series={[
              { key: "new", name: "New unique cases", slot: 1, values: d.trend.map((x) => x.newCases) },
              { key: "follow", name: "Follow-up contacts", slot: 2, values: d.trend.map((x) => x.followUps) },
              { key: "reopen", name: "Reopened cases", slot: 3, values: d.trend.map((x) => x.reopened) },
            ]}
            markers={d.actions.filter((a) => a.on && a.status === "done").map((a) => ({ bucket: a.on.slice(0, 7), label: a.title }))}
            empty="No signals in the last twelve months."
          />
        </div>
      </Section>

      <Section
        title="Linked cases"
        hint="De-identified summaries and references only. The complaint, incident or billing system keeps the real record, and decides who can read it."
      >
        <ul className="flex flex-col gap-3">
          {d.cases.map((k) => (
            <li key={k.id} className={cx(box, k.falseMatch && "opacity-70")}>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={picked.includes(k.id)}
                    onChange={(e) => setPicked(e.target.checked ? [...picked, k.id] : picked.filter((x) => x !== k.id))}
                  />
                  {SOURCES[k.source]} {k.sourceRef}
                </label>
                {k.party && <Badge>{k.party}</Badge>}
                {k.falseMatch ? (
                  <Badge tone="warn">False match: not counted</Badge>
                ) : (
                  <Badge tone={k.open ? "info" : "neutral"}>{k.open ? "Open" : "Closed"}</Badge>
                )}
                {k.link && (
                  <a href={k.link} className="text-sm underline" target="_blank" rel="noreferrer">
                    Source record
                  </a>
                )}
              </div>
              <p className="mt-1">{k.summary}</p>
              <ol className="mt-2 flex flex-col gap-1 border-l-2 border-line pl-3 text-sm">
                {k.events.map((e) => (
                  <li key={e.id}>
                    <span className="font-semibold">{dateText(e.on)}</span> · {EVENT_KINDS[e.kind]}
                    {e.note && <span className="text-ink-muted"> · {e.note}</span>}
                  </li>
                ))}
              </ol>
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  className={btn.quiet}
                  onClick={() => setEvent(event?.caseId === k.id ? null : { caseId: k.id, kind: "update", on: d.asAt, note: "" })}
                >
                  <Icon name="plus" className="size-4" /> Follow-up or change
                </button>
                <button type="button" className={btn.quiet} disabled={busy} onClick={() => act({ action: "false-match", caseId: k.id, on: !k.falseMatch })}>
                  {k.falseMatch ? "Restore the match" : "Not this theme (false match)"}
                </button>
                <button type="button" className={btn.quiet} disabled={busy} onClick={() => act({ action: "move-case", caseId: k.id, themeId: "" })}>
                  Ungroup
                </button>
              </div>
              {event?.caseId === k.id && (
                <form
                  className="mt-2 grid gap-2 rounded-xl bg-muted p-3 sm:grid-cols-[12rem_11rem_1fr_auto]"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await act({ action: "add-event", ...event })) setEvent(null);
                  }}
                >
                  <select
                    aria-label="What happened"
                    className={input}
                    value={event.kind}
                    onChange={(e) => setEvent({ ...event, kind: e.target.value as EventKind })}
                  >
                    {(["update", "change", "repeat", "close", "reopen"] as EventKind[]).map((x) => (
                      <option key={x} value={x}>
                        {EVENT_KINDS[x]}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Date"
                    type="date"
                    className={input}
                    value={event.on}
                    onChange={(e) => setEvent({ ...event, on: e.target.value })}
                    required
                  />
                  <input
                    aria-label="Note"
                    className={input}
                    placeholder="De-identified note"
                    value={event.note}
                    onChange={(e) => setEvent({ ...event, note: e.target.value })}
                  />
                  <button className={btn.secondary} disabled={busy}>
                    Record
                  </button>
                </form>
              )}
            </li>
          ))}
          {!d.cases.length && <li className={cx(box, "text-ink-muted")}>No cases linked yet.</li>}
        </ul>

        {picked.length > 0 && (
          <form
            className={cx(box, "mt-3 flex flex-wrap items-end gap-3")}
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await act({ action: "split", id: t.id, title: split, caseIds: picked });
              if (r?.id) router.push(`/admin/problems/${String(r.id)}`);
            }}
          >
            <Field
              label={`Split ${picked.length} ${picked.length === 1 ? "case" : "cases"} into a new theme`}
              hint="For when these turn out to be a different problem."
              className="min-w-0 flex-1 basis-80"
            >
              <input
                className={input}
                value={split}
                onChange={(e) => setSplit(e.target.value)}
                placeholder="The new theme, in a sentence"
                required
                minLength={8}
              />
            </Field>
            <button className={btn.secondary} disabled={busy}>
              Split
            </button>
          </form>
        )}

        <form
          className={cx(box, "mt-3 grid gap-3 sm:grid-cols-[12rem_1fr_11rem]")}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: "add-case", id: t.id, themeId: t.id, ...newCase })) setNewCase({ ...newCase, sourceRef: "", summary: "", party: "" });
          }}
        >
          <p className="font-semibold sm:col-span-3">Link another case</p>
          <select
            aria-label="Source"
            className={input}
            value={newCase.source}
            onChange={(e) => setNewCase({ ...newCase, source: e.target.value as SourceKind })}
          >
            {Object.entries(SOURCES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            aria-label="Source reference"
            className={input}
            placeholder="Source reference"
            value={newCase.sourceRef}
            onChange={(e) => setNewCase({ ...newCase, sourceRef: e.target.value })}
            required
          />
          <input
            aria-label="First reported"
            type="date"
            className={input}
            value={newCase.on}
            onChange={(e) => setNewCase({ ...newCase, on: e.target.value })}
            required
          />
          <input
            aria-label="Who it concerns, de-identified"
            className={cx(input, "sm:col-span-3")}
            placeholder="Who it concerns, de-identified (for example: Partner business A). Optional"
            value={newCase.party}
            onChange={(e) => setNewCase({ ...newCase, party: e.target.value })}
          />
          <textarea
            aria-label="De-identified summary"
            className={cx(area, "sm:col-span-3")}
            placeholder="De-identified summary: no names or client details"
            value={newCase.summary}
            onChange={(e) => setNewCase({ ...newCase, summary: e.target.value })}
            required
          />
          <div className="sm:col-span-3">
            <button className={btn.secondary} disabled={busy}>
              Link case
            </button>
          </div>
        </form>
      </Section>

      <Section title="The theme" hint="A grouping is a candidate until someone who knows the work has checked it. Checking it doesn’t say what caused it.">
        <form
          className={cx(box, "grid gap-3 sm:grid-cols-2")}
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: "save-theme", id: t.id, ...facts });
          }}
        >
          <Field label="Theme" className="sm:col-span-2">
            <input className={input} value={facts.title} onChange={(e) => setFacts({ ...facts, title: e.target.value })} required />
          </Field>
          <Field label="What’s known" className="sm:col-span-2">
            <textarea className={area} value={facts.description} onChange={(e) => setFacts({ ...facts, description: e.target.value })} />
          </Field>
          <Field label="Risk">
            <select className={input} value={facts.risk} onChange={(e) => setFacts({ ...facts, risk: e.target.value as Risk })}>
              {Object.entries(RISK).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Owner">
            <input className={input} value={facts.owner} onChange={(e) => setFacts({ ...facts, owner: e.target.value })} />
          </Field>
          <Field label="Roles affected">
            <input className={input} value={facts.roles} onChange={(e) => setFacts({ ...facts, roles: e.target.value })} />
          </Field>
          <Field label="Segment" hint="Team, region, provider type or tenure, if it’s concentrated.">
            <input className={input} value={facts.segment} onChange={(e) => setFacts({ ...facts, segment: e.target.value })} />
          </Field>
          <Field label="Eligible denominator" hint="How many people or transactions could have had this problem. Leave empty if nobody knows yet.">
            <input className={input} inputMode="numeric" value={facts.denominator} onChange={(e) => setFacts({ ...facts, denominator: e.target.value })} />
          </Field>
          <Field label="Where that number comes from">
            <input className={input} value={facts.denominatorNote} onChange={(e) => setFacts({ ...facts, denominatorNote: e.target.value })} />
          </Field>
          <Field
            label="Why it sits where it does in the queue"
            hint={`Weigh, don’t add up: ${Object.values(CONSIDERATIONS).join(", ").toLowerCase()}.`}
            className="sm:col-span-2"
          >
            <textarea className={area} value={facts.priorityNote} onChange={(e) => setFacts({ ...facts, priorityNote: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button className={btn.primary} disabled={busy}>
              Save
            </button>
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => act({ action: "verify", id: t.id, on: !t.verified })}>
              {t.verified ? "Mark as a candidate again" : "I’ve checked this grouping"}
            </button>
          </div>
        </form>

        <form
          className={cx(box, "mt-3 grid gap-3 sm:grid-cols-[16rem_1fr_auto]")}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: "set-status", id: t.id, ...status })) setStatus({ ...status, note: "" });
          }}
        >
          <Field label="Status">
            <select className={input} value={status.status} onChange={(e) => setStatus({ ...status, status: e.target.value as ThemeStatus })}>
              {Object.entries(THEME_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Why"
            hint="Closing, or saying it’s already addressed, needs the evidence in a sentence or two. A course is never required to close a theme."
          >
            <input className={input} value={status.note} onChange={(e) => setStatus({ ...status, note: e.target.value })} />
          </Field>
          <div className="flex items-start pt-6">
            <button className={btn.secondary} disabled={busy}>
              Set status
            </button>
          </div>
          {t.statusNote && <p className="text-sm text-ink-muted sm:col-span-3">Current note: {t.statusNote}</p>}
        </form>

        {d.otherThemes.length > 0 && (
          <form
            className={cx(box, "mt-3 grid gap-3 sm:grid-cols-[18rem_1fr_auto]")}
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await act({ action: "merge", id: t.id, ...merge });
              if (r?.id) router.push(`/admin/problems/${String(r.id)}`);
            }}
          >
            <Field label="Merge into another theme">
              <select className={input} value={merge.into} onChange={(e) => setMerge({ ...merge, into: e.target.value })} required>
                <option value="">Choose…</option>
                {d.otherThemes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Why these are the same problem">
              <input className={input} value={merge.reason} onChange={(e) => setMerge({ ...merge, reason: e.target.value })} required minLength={10} />
            </Field>
            <div className="flex items-start pt-6">
              <button className={btn.secondary} disabled={busy}>
                Merge
              </button>
            </div>
          </form>
        )}
      </Section>

      <Section title="History">
        <ol className={cx(box, "flex flex-col gap-1.5 text-sm")}>
          {d.history.map((h, i) => (
            <li key={i}>
              <span className="font-semibold">{HISTORY[h.action] ?? h.action}</span>
              {h.detail && <span> · {h.detail}</span>}
              <span className="text-ink-muted">
                {" "}
                · {h.actor} · {dateText(h.at)}
              </span>
            </li>
          ))}
          {!d.history.length && <li className="text-ink-muted">Nothing recorded yet.</li>}
        </ol>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// 2. Diagnosis
// ---------------------------------------------------------------------------------------------

function DiagnosisTab({ d, act, busy }: TabProps) {
  const [g, setG] = useState<Diagnosis>(d.diagnosis);
  const setBarrier = (i: number, patch: Partial<Diagnosis["barriers"][number]>) =>
    setG({ ...g, barriers: g.barriers.map((b, n) => (n === i ? { ...b, ...patch } : b)) });
  const notLearnable = g.barriers.filter((b) => !BARRIERS[b.barrier].learnable);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void act({ action: "save-diagnosis", id: d.theme.id, diagnosis: g });
      }}
    >
      <Section
        title="What should people do, and what’s in the way?"
        hint="Start with the behaviour, not the topic. Until someone who does or runs the work has confirmed it, this is a hypothesis to test."
      >
        {d.statement && (
          <p className="mb-3 rounded-2xl bg-tealtint p-4 font-serif text-lg leading-snug">
            {d.statement}
            {!d.diagnosis.verified && (
              <span className="mt-1 block font-sans text-sm text-ink-muted">Working hypothesis: not yet confirmed with the people who do the work.</span>
            )}
          </p>
        )}
        <div className={cx(box, "grid gap-3 sm:grid-cols-2")}>
          <Field label="Work situation" hint="When and where it happens.">
            <input className={input} value={g.situation} onChange={(e) => setG({ ...g, situation: e.target.value })} />
          </Field>
          <Field label="Who">
            <input className={input} value={g.role} onChange={(e) => setG({ ...g, role: e.target.value })} />
          </Field>
          <Field label="What they do now" hint="The observed action or omission.">
            <textarea className={area} value={g.observed} onChange={(e) => setG({ ...g, observed: e.target.value })} />
          </Field>
          <Field label="What they should do" hint="One specific, safe action someone could watch them do.">
            <textarea className={area} value={g.desired} onChange={(e) => setG({ ...g, desired: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section
        title="Barriers"
        hint="Capability, opportunity or motivation: what’s making the right action hard? Mark how sure anyone is. The first one listed is treated as the main barrier."
        aside={
          <button
            type="button"
            className={btn.secondary}
            onClick={() =>
              setG({
                ...g,
                barriers: [
                  ...g.barriers,
                  { id: `b${Date.now().toString(36)}`, barrier: "knowledge", text: "", evidence: "", confidence: "suspected", validator: "" },
                ],
              })
            }
          >
            <Icon name="plus" className="size-4" /> Add a barrier
          </button>
        }
      >
        <ul className="flex flex-col gap-3">
          {g.barriers.map((b, i) => (
            <li key={b.id} className={cx(box, "grid gap-3 sm:grid-cols-2")}>
              <Field label="Kind of barrier" hint={LENSES[BARRIERS[b.barrier].lens]}>
                <select className={input} value={b.barrier} onChange={(e) => setBarrier(i, { barrier: e.target.value as Barrier })}>
                  {(Object.keys(LENSES) as (keyof typeof LENSES)[]).map((lens) => (
                    <optgroup key={lens} label={LENSES[lens]}>
                      {(Object.keys(BARRIERS) as Barrier[])
                        .filter((k) => BARRIERS[k].lens === lens)
                        .map((k) => (
                          <option key={k} value={k}>
                            {BARRIERS[k].label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label="How sure">
                <select className={input} value={b.confidence} onChange={(e) => setBarrier(i, { confidence: e.target.value as Confidence })}>
                  {Object.entries(CONFIDENCE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="In this case" className="sm:col-span-2">
                <input className={input} value={b.text} onChange={(e) => setBarrier(i, { text: e.target.value })} />
              </Field>
              <Field label="Evidence" hint="What points to it. “None yet” is a fair answer.">
                <input className={input} value={b.evidence} onChange={(e) => setBarrier(i, { evidence: e.target.value })} />
              </Field>
              <Field label="Who can confirm it">
                <input className={input} value={b.validator} onChange={(e) => setBarrier(i, { validator: e.target.value })} />
              </Field>
              {!BARRIERS[b.barrier].learnable && (
                <p className="flex items-start gap-2 rounded-xl bg-gold/15 p-3 text-sm sm:col-span-2">
                  <Icon name="info" className="mt-0.5 size-4 shrink-0" /> Learning can’t remove this one. It needs a change to the system, the process or what
                  people can get to.
                </p>
              )}
              <div className="sm:col-span-2">
                <button type="button" className={btn.quiet} onClick={() => setG({ ...g, barriers: g.barriers.filter((_, n) => n !== i) })}>
                  <Icon name="trash" className="size-4" /> Remove
                </button>
              </div>
            </li>
          ))}
          {!g.barriers.length && (
            <li className={cx(box, "text-ink-muted")}>No barriers recorded. If nobody knows yet, say so below and find out before deciding on a response.</li>
          )}
        </ul>
        {notLearnable.length > 0 && notLearnable.length === g.barriers.length && (
          <p className="mt-3 rounded-xl bg-gold/15 p-3 text-sm">
            Every barrier here is about access or workflow. This is one to fix in the system or the process: training would add load without removing the cause.
          </p>
        )}
      </Section>

      <Section title="What isn’t known">
        <div className={cx(box, "grid gap-3 sm:grid-cols-2")}>
          <Field label="Still unknown" hint="What would change the response if it turned out differently.">
            <textarea className={area} value={g.unknowns} onChange={(e) => setG({ ...g, unknowns: e.target.value })} />
          </Field>
          <Field label="Checked with" hint="Who does or runs this work and has looked at it.">
            <textarea className={area} value={g.checkedWith} onChange={(e) => setG({ ...g, checkedWith: e.target.value })} />
          </Field>
          <label className="flex items-start gap-2 sm:col-span-2">
            <input type="checkbox" className="mt-1 size-4" checked={g.verified} onChange={(e) => setG({ ...g, verified: e.target.checked })} />
            <span>
              <span className="font-semibold">An operational expert has confirmed the work situation.</span>
              <span className="block text-sm text-ink-muted">Until this is ticked, everything downstream is shown as built on a hypothesis.</span>
            </span>
          </label>
        </div>
        <div className="mt-3">
          <button className={btn.primary} disabled={busy}>
            Save diagnosis
          </button>
        </div>
      </Section>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// 3. Existing content
// ---------------------------------------------------------------------------------------------

function ContentTab({ d, act, busy }: TabProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [check, setCheck] = useState({ shared: "", missing: "", decision: "" });
  const checked = (kind: string, ref: string) => d.checks.find((c) => c.kind === kind && c.ref === ref);

  return (
    <>
      <Section
        title="What the Hub already has"
        hint={`Searched for “${d.diagnosis.desired || d.theme.title}”. Look before building: reusing or revising something people already know is usually lighter than a new course.`}
      >
        <ul className="flex flex-col gap-3">
          {d.matches.map((m) => {
            const key = `${m.kind}:${m.ref}`;
            const had = checked(m.kind, m.ref);
            return (
              <li key={key} className={box}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{m.kind === "topic" ? "Topic" : m.kind === "course" ? "Magazine course" : "Course page"}</Badge>
                  {had?.decision && <Badge tone="good">{LEARNING_DECISIONS[had.decision]}</Badge>}
                </div>
                <p className="mt-1 font-semibold">{m.title}</p>
                {m.summary && <p className="text-sm text-ink-muted">{m.summary}</p>}
                {had && (had.shared || had.missing) && (
                  <p className="mt-1 text-sm">
                    {had.shared && <>Covers: {had.shared}. </>}
                    {had.missing && <>Missing: {had.missing}.</>}
                  </p>
                )}
                <button
                  type="button"
                  className={cx(btn.quiet, "mt-1")}
                  onClick={() => {
                    setOpen(open === key ? null : key);
                    setCheck({ shared: had?.shared ?? "", missing: had?.missing ?? "", decision: had?.decision ?? "" });
                  }}
                >
                  {had ? "Change what I found" : "Record what I found"}
                </button>
                {open === key && (
                  <form
                    className="mt-2 grid gap-3 rounded-xl bg-muted p-3 sm:grid-cols-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await act({ action: "check-content", id: d.theme.id, kind: m.kind, ref: m.ref, title: m.title, ...check })) setOpen(null);
                    }}
                  >
                    <Field label="What it already covers">
                      <input className={input} value={check.shared} onChange={(e) => setCheck({ ...check, shared: e.target.value })} />
                    </Field>
                    <Field label="What’s missing for this problem">
                      <input className={input} value={check.missing} onChange={(e) => setCheck({ ...check, missing: e.target.value })} />
                    </Field>
                    <Field label="So">
                      <select className={input} value={check.decision} onChange={(e) => setCheck({ ...check, decision: e.target.value })}>
                        <option value="">Not decided</option>
                        {Object.entries(LEARNING_DECISIONS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="flex items-end">
                      <button className={btn.secondary} disabled={busy}>
                        Save
                      </button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
          {!d.matches.length && (
            <li className={cx(box, "text-ink-muted")}>
              Nothing in the catalogue matches. That’s worth knowing, but it isn’t a reason on its own to build something.
            </li>
          )}
        </ul>
      </Section>
      {d.checks.filter((c) => !d.matches.some((m) => m.kind === c.kind && m.ref === c.ref)).length > 0 && (
        <Section title="Checked earlier">
          <ul className="flex flex-col gap-2">
            {d.checks
              .filter((c) => !d.matches.some((m) => m.kind === c.kind && m.ref === c.ref))
              .map((c) => (
                <li key={c.id} className={cx(box, "text-sm")}>
                  <span className="font-semibold">{c.title}</span>
                  {c.decision && <> · {LEARNING_DECISIONS[c.decision]}</>}
                  {c.shared && <> · covers {c.shared}</>}
                  {c.missing && <> · missing {c.missing}</>}
                </li>
              ))}
          </ul>
        </Section>
      )}
    </>
  );
}
