"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { CALM, outreachDraft, outreachProblems, SCORE_STATUS, STAGE_HINTS, STAGE_ORDER, STAGE_OWNER, ACTORS, STAGES, type Stage } from "@/lib/networkBench";
import { STATUS } from "@/lib/suburbCoverage";
import type { BoardState, demoView, getBoard, toolHome, ToolHomeFull } from "@/server/networkTool";
import { Icon } from "../Icon";
import { AidSection } from "../playbooks/AidSection";

/*
  The Contractor Network Builder Work Tool, as a business owner uses it (docs/network-builder.md). Four views over DEMO
  DATA ONLY: coverage (Local Coverage's model, with its table), the pipeline (the Care Partner moves a card only
  through their own stages; approval, availability and booking are shown locked with their owner), the outreach kit
  (the reviewed template, the role checklist and the Choosing and Checking Your Contractor Job Aid) and the scorecards
  (no single score; small numbers suppressed; a restriction only as its neutral reason). A board saves privately to
  the business, as numbered versions, with a key so a retried save never saves twice.
*/

type Home = ReturnType<typeof toolHome>;
type Board = ReturnType<typeof getBoard>;
type Demo = ReturnType<typeof demoView>;

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-surface p-4 ring-1 ring-line";
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3";
const good = "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const warn = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const bad = "bg-[#fde4e1] text-[#7a1d12] dark:bg-[#3f1712] dark:text-[#ffb4a8]";
const TONE = { good, warn, bad } as const;
const TABS = { coverage: "Coverage", pipeline: "Pipeline", outreach: "Outreach kit", scorecards: "Scorecards" } as const;
type Tab = keyof typeof TABS;

/** A fresh key for one save or event, made when the person acts (never while drawing the page). */
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${performance.now().toString(36).replace(".", "")}`);

export function NetworkBuilderTool() {
  const home = useApi<Home>("/api/tools/network");
  const [tab, setTab] = useState<Tab>("coverage");
  const [state, setState] = useState<BoardState | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [demo, setDemo] = useState<Demo | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const pendingKey = useRef<string | null>(null);
  const opened = useRef(false);

  const h = home.data;
  const access = h && h.access ? (h as ToolHomeFull) : null;
  useEffect(() => {
    if (!access || opened.current) return;
    opened.current = true;
    void api("/api/tools/network", { body: { action: "event", event: "network_builder_opened", idem: newKey() } }).catch(() => undefined);
  }, [access]);

  if (home.error)
    return (
      <p role="alert" className="mt-6">
        {home.error}
      </p>
    );
  if (!h) return <p className="mt-6 text-ink-muted">Loading…</p>;
  if (!access)
    return (
      <div className={cx(box, "mt-6")}>
        <p className="font-semibold">This Work Tool is for Care Partner business owners and the people they authorise.</p>
        <p className="mt-1">{h.notice}</p>
        <p className="mt-2">
          You can practise the decisions with a fictional case:{" "}
          <Link href="/magazine" className="font-semibold text-accent underline underline-offset-2">
            Build Your Local Bench in the Magazine
          </Link>
          .
        </p>
      </div>
    );

  const view = demo ?? access.demo;
  const current: BoardState = state ??
    board?.state ?? { stages: {}, outreach: { profile: "", fields: Object.fromEntries(access.demo.template.fields.map((f) => [f.id, ""])) } };
  const event = (e: string, ref = "") => void api("/api/tools/network", { body: { action: "event", event: e, ref, idem: newKey() } }).catch(() => undefined);

  const change = (next: BoardState) => {
    setState(next);
    pendingKey.current = null;
    setMsg("");
  };
  const moveCard = (id: string, to: Stage) => {
    const next = { ...current, stages: { ...current.stages, [id]: to } };
    change(next);
    // The page can't run the server's rules, so it asks for the board's view by saving only when asked; here it shows the move locally.
    setDemo({
      ...view,
      cards: view.cards.map((c) =>
        c.id === id
          ? {
              ...c,
              stage: to,
              stageLabel: STAGES[to],
              next: STAGE_ORDER[STAGE_ORDER.indexOf(to) + 1] ?? null,
              canMove: false,
              why: "Save the board to check the next step against the rules.",
            }
          : c,
      ),
    });
  };
  const save = async () => {
    setBusy(true);
    setErr("");
    pendingKey.current ??= newKey();
    try {
      const b = await api<Board & { replayed?: boolean; unchanged?: boolean }>("/api/tools/network", {
        body: { id: board?.id, name: name || board?.name, state: current, idem: pendingKey.current },
      });
      setBoard(b);
      setDemo(b.demo);
      setState(null);
      pendingKey.current = null;
      setMsg(b.unchanged ? "Nothing changed since the last version." : `Saved as version ${b.version}. Private to ${access.access.orgName}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn’t save.");
    } finally {
      setBusy(false);
    }
  };
  const open = async (id: string) => {
    setBusy(true);
    try {
      const b = await api<Board>(`/api/tools/network?id=${encodeURIComponent(id)}`);
      setBoard(b);
      setDemo(b.demo);
      setState(null);
      setName(b.name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn’t open.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className={cx(warn, "rounded-2xl px-4 py-3")} role="note">
        <p className="flex items-center gap-2 font-semibold">
          <Icon name="info" className="size-5" /> {access.notice}
        </p>
        <details className="mt-1">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">The data sources it would need</summary>
          <ul className="list-disc pl-5 text-sm">
            {access.dataSources.map((s) => (
              <li key={s.id}>
                {s.label} ({s.owner}): <span className="font-semibold">not connected</span>
              </li>
            ))}
          </ul>
        </details>
      </div>

      <div className={box}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm font-semibold">
            Board name
            <input
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="For example: March morning cover (demo)"
              maxLength={80}
            />
          </label>
          <button type="button" className={primary} disabled={busy || (!board && !name.trim())} onClick={save}>
            {board ? "Save a new version" : "Save the board"}
          </button>
        </div>
        {access.boards.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">Your business’s boards:</span>
            {access.boards.map((b) => (
              <button key={b.id} type="button" className={cx(secondary, "min-h-9 px-3 text-sm")} disabled={busy} onClick={() => open(b.id)}>
                {b.name} (v{b.versions})
              </button>
            ))}
          </p>
        )}
        <p role="status" className="mt-1 text-sm">
          {msg}
        </p>
        {err && (
          <p role="alert" className={cx(bad, "mt-1 rounded-xl px-3 py-2 text-sm")}>
            {err}
          </p>
        )}
      </div>

      <div role="tablist" aria-label="Views" className="flex flex-wrap gap-1 rounded-2xl bg-muted p-1">
        {(Object.keys(TABS) as Tab[]).map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k);
              if (k === "scorecards") event("quality_evidence_reviewed");
              if (k === "pipeline") event("readiness_status_viewed");
            }}
            className={cx("min-h-11 flex-1 rounded-xl px-3 font-semibold", tab === k ? "bg-surface shadow-sm" : "text-ink-muted")}
          >
            {TABS[k]}
          </button>
        ))}
      </div>

      {tab === "coverage" && <CoverageTab view={view} onFilter={(k) => event("gap_filter_changed", k)} />}
      {tab === "pipeline" && <PipelineTab view={view} onMove={moveCard} onOpen={(id) => event("candidate_card_opened", id)} />}
      {tab === "outreach" && <OutreachTab view={view} state={current} onChange={change} event={event} />}
      {tab === "scorecards" && <ScorecardsTab view={view} />}
    </div>
  );
}

function CoverageTab({ view, onFilter }: { view: Demo; onFilter: (k: string) => void }) {
  const [area, setArea] = useState("");
  const cells = view.coverage.cells.filter((c) => !area || c.area === area);
  return (
    <div className={box}>
      <h2 className="font-serif text-2xl font-semibold">Demand and coverage (demo)</h2>
      <p className="text-sm text-ink-muted">
        Local Coverage’s model ({view.coverage.modelVersion}), as of {view.asOf}. Illustrative figures. Only provider-approved workers with recently confirmed,
        uncommitted availability in the window count. Interest and evidence in progress never do.
      </p>
      <label className="mt-2 flex max-w-xs flex-col gap-1 text-sm font-semibold">
        Area
        <select
          className={field}
          value={area}
          onChange={(e) => {
            setArea(e.target.value);
            onFilter("area");
          }}
        >
          <option value="">All</option>
          {view.inputs.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="text-left text-ink-muted">Each need slot, hours a week. Forecast is a separate band, never a booking.</caption>
          <thead>
            <tr className="border-b border-line">
              {["Need", "Planned", "Booked", "Unfilled", "Ready capacity", "Gap", "Forecast gap (low–high)"].map((x) => (
                <th key={x} scope="col" className="py-1 pr-2">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => (
              <tr key={c.id} className="border-b border-line align-top">
                <th scope="row" className="py-1 pr-2 font-normal">
                  {c.label}
                  <span className="block text-xs text-ink-muted">
                    {c.source}, verified {c.verifiedOn || "never"}
                  </span>
                </th>
                <td className="py-1 pr-2">{c.planned}</td>
                <td className="py-1 pr-2">{c.booked}</td>
                <td className="py-1 pr-2">{c.unfilled}</td>
                <td className="py-1 pr-2">{c.spare}</td>
                <td className="py-1 pr-2">
                  <span className={cx("rounded-full px-2 py-0.5 font-semibold", TONE[STATUS[c.status].tone])}>
                    {c.gap} · {STATUS[c.status].label}
                  </span>
                </td>
                <td className="py-1">
                  {c.forecastGap.low}–{c.forecastGap.high}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-2 list-disc pl-5 text-sm">
        {view.coverage.findings.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </div>
  );
}

function PipelineTab({ view, onMove, onOpen }: { view: Demo; onMove: (id: string, to: Stage) => void; onOpen: (id: string) => void }) {
  return (
    <div className={box}>
      <h2 className="font-serif text-2xl font-semibold">Network pipeline (demo)</h2>
      <p className="text-sm text-ink-muted">
        One stage at a time. You can record interest, open the role checklist and submit to onboarding. Approval, availability and booking belong to the
        provider and its scheduling: they’re shown here, never set here. Moving a card never changes the coverage: interest isn’t capacity.
      </p>
      <ol className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STAGE_ORDER.map((st) => {
          const here = view.cards.filter((c) => c.stage === st);
          return (
            <li key={st} className="rounded-2xl bg-muted p-3">
              <p className="font-semibold">{STAGES[st]}</p>
              <p className="text-xs text-ink-muted">
                {STAGE_HINTS[st]} Moved here by: {ACTORS[STAGE_OWNER[st]].toLowerCase()}.
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {here.length === 0 && <li className="text-sm text-ink-muted">None</li>}
                {here.map((c) => (
                  <li key={c.id} className="rounded-xl bg-surface p-2 ring-1 ring-line">
                    <details onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onOpen(c.id)}>
                      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                        {c.label}{" "}
                        <span className="text-xs font-normal">
                          · {CALM[c.calm]}
                          {c.hold && ` · ${c.hold}`}
                        </span>
                      </summary>
                      <p className="text-sm">
                        {c.service} · {c.areas.join(", ")}
                      </p>
                      <p className="text-sm">{c.scope}</p>
                      <p className="text-sm">{c.windows.join("; ") || "No availability recorded"}</p>
                      <p className="text-xs text-ink-muted">
                        {c.availability}
                        {c.staleAvailability && ": older than the freshness rule, so unconfirmed (the approval stands)"}
                      </p>
                      {c.evidenceOutcome && <p className="text-xs">Evidence: {c.evidenceOutcome}</p>}
                    </details>
                    {c.next && (
                      <div className="mt-1">
                        <button type="button" className={cx(secondary, "min-h-11 text-sm")} disabled={!c.canMove} onClick={() => onMove(c.id, c.next!)}>
                          Move to “{STAGES[c.next]}”
                        </button>
                        {!c.canMove && c.why && <p className="mt-1 text-xs text-ink-muted">{c.why}</p>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function OutreachTab({
  view,
  state,
  onChange,
  event,
}: {
  view: Demo;
  state: BoardState;
  onChange: (s: BoardState) => void;
  event: (e: string, ref?: string) => void;
}) {
  const o = state.outreach;
  const problems = outreachProblems(view.template, o, view.profiles);
  const draft = o.profile ? outreachDraft(view.template, o, view.profiles) : null;
  const [copied, setCopied] = useState(false);
  return (
    <div className={box}>
      <h2 className="font-serif text-2xl font-semibold">Outreach and onboarding kit</h2>
      <p className="text-sm text-ink-muted">
        Drafts from the reviewed template: you fill in the local details; the claims about approval, work, pay and the relationship are locked. Nothing is sent
        from the Hub. Real evidence goes through the provider’s onboarding system, never here.
      </p>
      <label className="mt-2 flex flex-col gap-1 text-sm font-semibold">
        The role it’s for
        <select
          className={field}
          value={o.profile}
          onChange={(e) => {
            onChange({ ...state, outreach: { ...o, profile: e.target.value } });
            if (e.target.value) event("onboarding_checklist_opened", e.target.value);
          }}
        >
          <option value="">Choose a role</option>
          {view.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {view.template.fields.map((f) => (
        <label key={f.id} className="mt-2 flex flex-col gap-1 text-sm font-semibold">
          {f.label}
          <input
            className={field}
            value={o.fields[f.id] ?? ""}
            maxLength={f.max + 40}
            onChange={(e) => onChange({ ...state, outreach: { ...o, fields: { ...o.fields, [f.id]: e.target.value } } })}
          />
          <span className="font-normal text-ink-muted">{f.hint}</span>
        </label>
      ))}
      {problems.length > 0 && (
        <ul className={cx(warn, "mt-2 list-disc rounded-xl py-2 pl-8 pr-3 text-sm")} role="status">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {draft && (
        <div className="mt-3 rounded-xl border-2 border-dashed border-line-strong p-3 text-sm">
          <p className="font-bold uppercase tracking-wide text-ink-muted">{draft.watermark}</p>
          <p className="mt-2 font-semibold">Subject: {draft.subject}</p>
          <p className="mt-1 whitespace-pre-line">{draft.intro}</p>
          <p className="mt-2 font-semibold">Call guide</p>
          <ol className="list-decimal pl-5">
            {draft.callGuide.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
          <p className="mt-2 font-semibold">Follow-up</p>
          <p>{draft.followUp}</p>
          {draft.checklist && (
            <>
              <p className="mt-2 font-semibold">Onboarding checklist: {draft.profile}</p>
              <ul className="list-disc pl-5">
                {draft.checklist.rows.map((r) => (
                  <li key={r.axis + r.label}>
                    <span className="font-semibold">{r.requirementLabel}:</span> {r.label}. <span className="text-ink-muted">Source: {r.source}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Template {draft.templateVersion} · {draft.approvalState === "approved" ? "approved" : "not yet approved"}. Before anything is sent through an
            approved process: the sender, contact permission, current terms, the approved brand and a person’s review. No automatic sending.
          </p>
          <button
            type="button"
            className={cx(secondary, "mt-2")}
            disabled={problems.length > 0}
            onClick={async () => {
              try {
                await navigator.clipboard?.writeText([`Subject: ${draft.subject}`, draft.intro, draft.watermark].join("\n\n"));
              } catch {
                // A convenience only.
              }
              setCopied(true);
              event("outreach_draft_copied", o.profile);
            }}
          >
            <Icon name="copy" className="size-4" /> Copy the draft
          </button>
          {copied && <p className="mt-1">Copied. It hasn’t been sent, and nothing marks it as sent.</p>}
        </div>
      )}
      <div className="mt-3">
        <AidSection
          snippetId="choosing-and-checking-your-contractor"
          why="The steps for checking a contractor a participant has chosen."
          place="tool:network-builder"
        />
      </div>
      <p className="mt-2 text-sm">
        Practise one onboarding pack:{" "}
        <Link href="/magazine/dots-gardener-checking-a-contractor-shes-chosen" className="font-semibold text-accent underline underline-offset-2">
          the Contractor Vetting Card
        </Link>
        . After a gap:{" "}
        <Link href="/magazine/what-does-a-missed-service-cost" className="font-semibold text-accent underline underline-offset-2">
          What does a missed service cost?
        </Link>
      </p>
    </div>
  );
}

function ScorecardsTab({ view }: { view: Demo }) {
  return (
    <div className={box}>
      <h2 className="font-serif text-2xl font-semibold">Quality scorecards (demo)</h2>
      <p className="text-sm text-ink-muted">
        No total, average or star rating: each dimension shows its counts, period and source. Under five observations, no rate is shown (“limited evidence”,
        which isn’t a poor rating). A restriction shows only its neutral reason; the details stay with Quality. To correct inaccurate information, contact
        supplier onboarding.
      </p>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {view.scorecards.map((s) => (
          <li key={s.id} className="rounded-2xl bg-muted p-3">
            <p className="font-semibold">{s.worker}</p>
            <p className="text-sm text-ink-muted">
              {s.role}. Review owner: {s.reviewOwner}.
            </p>
            <p className="mt-1 flex flex-wrap gap-1">
              {s.statuses.map((x) => (
                <span
                  key={x}
                  className={cx(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    x === "restricted" || x === "actionOpen" ? bad : x === "current" ? good : warn,
                  )}
                >
                  {SCORE_STATUS[x]}
                </span>
              ))}
            </p>
            {s.restriction && <p className={cx(bad, "mt-2 rounded-xl px-3 py-2 text-sm")}>{s.restriction}</p>}
            {s.dims.map((d) => (
              <div key={d.dim} className="mt-2 text-sm">
                <p className="font-semibold">{d.label}</p>
                {d.metrics.map((m) => (
                  <p key={m.id}>
                    {m.label}: <span className="font-semibold">{m.text}</span>{" "}
                    <span className="text-xs text-ink-muted">
                      ({m.period} · {m.source} · reviewed {m.lastReview || "not yet"})
                    </span>
                  </p>
                ))}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
