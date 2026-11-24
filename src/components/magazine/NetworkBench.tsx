"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { NetworkBlock } from "@/lib/magazine";
import {
  applyMove,
  benchView,
  BENCH_VERSION,
  buildDebrief,
  CALM,
  emptyState,
  LEVELS,
  MEASURES,
  MoveError,
  RUBRIC_VERSION,
  RULES_VERSION,
  SCORE_STATUS,
  STAGE_HINTS,
  submitProblems,
  variationFor,
  type BenchState,
  type BenchView,
  type CardView,
  type Calm,
  type Debrief,
  type Diagnosis,
  type Measure,
  type Move,
} from "@/lib/networkBench";
import { dateLabel, STATUS, type CoverageResult } from "@/lib/suburbCoverage";
import type { NetworkView } from "@/server/networkBench";
import { Icon, type IconName } from "../Icon";
import { AidSection } from "../playbooks/AidSection";

/*
  Build Your Local Bench, as learners use it (docs/network-builder.md). On a wide screen: the map and coverage at the
  left, the service-slot and contractor cards in the centre, and the decision panel at the right. On a phone, one
  pane at a time, chosen with a labelled switch. The map is never the only way in: every figure it shows is in the
  table beside it, and every decision is a labelled button or field, never a drag.

  The page holds only what the server sends: the case's figures, the cards, and each decision when its turn comes.
  The model's coverage result arrives after the learner's own diagnosis. In the editor's preview it runs the same
  engine locally against the block as written, and stores nothing.
*/

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const good = "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const warn = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const bad = "bg-[#fde4e1] text-[#7a1d12] dark:bg-[#3f1712] dark:text-[#ffb4a8]";
const plain = "bg-muted text-ink";
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3";

const CALM_LOOK: Record<Calm, { icon: IconName; cls: string }> = {
  confirmed: { icon: "check", cls: good },
  verify: { icon: "clock", cls: warn },
  unavailable: { icon: "minus", cls: plain },
  restricted: { icon: "lock", cls: bad },
};
const TONE = { good, warn, bad } as const;
const CELL_ICON = { covered: "check", gap: "alert", confirm: "clock" } as const;

type Body = Record<string, unknown>;
type Call = (body: Body) => Promise<NetworkView>;

/** The editor's preview: the same engine, computed locally from the block as written. Nothing is stored. */
function previewEngine(b: NetworkBlock, variation: string) {
  let attemptNo = 0;
  let s: BenchState | null = null;
  let debrief: Debrief | null = null;
  let status: NetworkView["status"] = "new";
  const toView = (): NetworkView => ({
    attemptId: s ? `preview-${attemptNo}` : null,
    attemptNo,
    status,
    view: s ? benchView(b, s) : null,
    debrief,
    attempts: attemptNo,
    versions: { bench: BENCH_VERSION, rubric: RUBRIC_VERSION, rules: RULES_VERSION, scenario: b.scenarioVersion },
    earlierScenario: false,
  });
  const begin = (v: string) => {
    attemptNo += 1;
    s = emptyState(v);
    debrief = null;
    status = "active";
  };
  const call: Call = async (body) => {
    try {
      if (body.action === "start" && status === "new") begin(variation);
      else if (body.action === "retry" && status !== "active") begin(variationFor(b, attemptNo + 1));
      else if (body.action === "viewed" && status === "submitted") status = "completed";
      else if (body.action === "submit" && s && status === "active") {
        const problems = submitProblems(b, s);
        if (problems.length) throw new Error(problems[0]);
        debrief = buildDebrief(b, s);
        status = "submitted";
      } else if (body.move && s && status === "active") s = applyMove(b, s, body.move as Move);
    } catch (e) {
      throw new Error(e instanceof MoveError || e instanceof Error ? e.message : "That didn’t work.");
    }
    return toView();
  };
  return { call, view: toView };
}

export function NetworkBench({
  block: b,
  guideId,
  preview = false,
  place = "magazine",
  onFinished,
}: {
  block: NetworkBlock;
  guideId: string;
  preview?: boolean;
  place?: string;
  onFinished?: (d: Debrief) => void;
}) {
  const url = `/api/magazine/${guideId}/network`;
  const loaded = useApi<NetworkView>(preview ? null : `${url}?block=${b.id}`);
  const [pVariation, setPVariation] = useState("");
  const [engine, setEngine] = useState(() => (preview ? previewEngine(b, "") : null));
  const [v, setV] = useState<NetworkView | null>(preview ? (engine?.view() ?? null) : null);
  if (!preview && loaded.data && v === null) setV(loaded.data);

  const call = useCallback<Call>(
    async (body) => (engine ? engine.call(body) : api<NetworkView>(url, { body: { blockId: b.id, place, ...body } })),
    [engine, url, b.id, place],
  );

  return (
    <section
      className="flex w-full min-w-0 flex-col gap-4 rounded-3xl border border-line-strong bg-surface p-4 shadow-sm sm:p-6"
      aria-label={`Build Your Local Bench: ${b.title}`}
    >
      <div>
        <p className="mb-1 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
          <Icon name="people" className="size-5" /> Build Your Local Bench
        </p>
        <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
        {b.intro && <p className="mt-1 text-ink-muted">{b.intro}</p>}
        <p className="mt-2 inline-flex flex-wrap gap-x-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold">
          <span>Practice</span>
          <span aria-hidden>·</span>
          <span>A fictional case</span>
          <span aria-hidden>·</span>
          <span>Nothing is approved, sent or booked</span>
        </p>
      </div>
      {preview && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-dashed border-line-strong p-3 text-sm">
          <p className="w-full font-semibold">Preview (nothing is saved). It runs the same engine as the server, on the block as written.</p>
          <label className="flex flex-col gap-1">
            Branch
            <select
              className="min-h-11 rounded-xl border border-line-strong bg-surface px-2"
              value={pVariation}
              onChange={(e) => {
                setPVariation(e.target.value);
                const next = previewEngine(b, e.target.value);
                setEngine(next);
                setV(next.view());
              }}
            >
              <option value="">As written</option>
              {b.variations.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {!preview && loaded.error ? (
        <p role="alert">{loaded.error}</p>
      ) : !v ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <Attempt key={v.attemptId ?? "new"} b={b} v={v} setV={setV} call={call} preview={preview} guideId={guideId} place={place} onFinished={onFinished} />
      )}
    </section>
  );
}

function Attempt({
  b,
  v,
  setV,
  call,
  preview,
  guideId,
  place,
  onFinished,
}: {
  b: NetworkBlock;
  v: NetworkView;
  setV: (v: NetworkView) => void;
  call: Call;
  preview: boolean;
  guideId: string;
  place: string;
  onFinished?: (d: Debrief) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [pane, setPane] = useState<"map" | "cards" | "decide">("decide");
  const viewed = useRef(false);

  useEffect(() => {
    if (!v.debrief || viewed.current || v.status !== "submitted") return;
    viewed.current = true;
    const d = v.debrief;
    call({ action: "viewed" })
      .then((next) => {
        setV(next);
        onFinished?.(d);
      })
      .catch(() => undefined);
  }, [v.debrief, v.status, call, setV, onFinished]);

  const run = async (body: Body, announce = "") => {
    setBusy(true);
    setProblem(null);
    try {
      const next = await call(body);
      setSaid(announce);
      setV(next);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const move = (m: Move, announce = "") => run({ move: m }, announce);

  if (v.status === "new")
    return (
      <div className={box}>
        <p className="font-semibold">{b.story.character}</p>
        <p className="text-sm text-ink-muted">{b.story.role}</p>
        <p className="mt-2">{b.story.situation}</p>
        {b.story.dilemma && <p className="mt-2 font-semibold">“{b.story.dilemma}”</p>}
        <p className="mt-3 text-sm text-ink-muted">
          About 20 minutes. Every person, suburb, worker and figure is invented. You can stop and come back: it resumes where you left off.
        </p>
        <button type="button" className={cx(primary, "mt-3")} disabled={busy} onClick={() => run({ action: "start" }, "The case is open.")}>
          Start the case
        </button>
        {problem && (
          <p role="alert" className={cx(bad, "mt-2 rounded-xl px-3 py-2 text-sm")}>
            {problem}
          </p>
        )}
      </div>
    );

  if (v.status !== "active" && v.debrief)
    return (
      <DebriefView
        b={b}
        d={v.debrief}
        v={v}
        busy={busy}
        preview={preview}
        guideId={guideId}
        place={place}
        onRetry={() => run({ action: "retry", from: v.attemptId }, "A new attempt has started.")}
      />
    );
  const view = v.view;
  if (!view) return <p className="text-ink-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
      {problem && (
        <p role="alert" className={cx(bad, "rounded-xl px-3 py-2 text-sm")}>
          {problem}
        </p>
      )}
      <div role="group" aria-label="Show" className="flex gap-1 rounded-full bg-muted p-1 lg:hidden">
        {(
          [
            ["decide", "Decide"],
            ["map", "Map and gap"],
            ["cards", "Cards"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={pane === k}
            onClick={() => setPane(k)}
            className={cx("min-h-11 flex-1 rounded-full px-2 text-sm font-semibold", pane === k ? "bg-surface shadow-sm" : "text-ink-muted")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1.1fr)]">
        <div className={cx("min-w-0", pane === "map" ? "block" : "hidden", "lg:block")}>
          <MapPane view={view} />
        </div>
        <div className={cx("min-w-0", pane === "cards" ? "block" : "hidden", "lg:block")}>
          <CardsPane view={view} busy={busy} onOpen={(id) => move({ do: "open", card: id })} />
        </div>
        <div className={cx("min-w-0", pane === "decide" ? "block" : "hidden", "lg:block")}>
          <DecidePane
            view={view}
            busy={busy}
            move={move}
            onSubmit={() => run({ action: "submit" }, "Submitted. The debrief is below.")}
            guideId={guideId}
            place={place}
            preview={preview}
            b={b}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The map, with its table
// ---------------------------------------------------------------------------------------------

function MapPane({ view }: { view: BenchView }) {
  const result = view.after ?? view.before;
  const listed = view.cards.length;
  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-serif text-xl font-semibold">The map</h4>
      <p className={cx("inline-flex items-center gap-2 self-start rounded-full px-3 py-1 font-semibold", result ? plain : good)}>
        <Icon name={result ? "info" : "people"} className="size-4" />
        {result ? `${listed} listed · ${readyCount(result)} counted as ready for the gap` : view.headline || `${listed} contractors nearby`}
      </p>
      <svg viewBox="0 0 100 70" role="img" aria-labelledby="nb-map-title" className="w-full rounded-2xl bg-tealtint ring-1 ring-line">
        <title id="nb-map-title">{`A schematic map of ${view.map.areas.map((a) => a.name).join(" and ")}. The table below holds everything it shows.`}</title>
        {view.map.areas.map((a) => {
          const cell = result?.areas.find((x) => x.id === a.id);
          return (
            <g key={a.id}>
              <circle cx={a.x} cy={a.y * 0.7 + 4} r={11} className="fill-surface stroke-line-strong" strokeWidth={0.6} />
              <text x={a.x} y={a.y * 0.7 + 2} textAnchor="middle" className="fill-ink" fontSize={3.2} fontWeight={700}>
                {a.name}
              </text>
              <text x={a.x} y={a.y * 0.7 + 6.5} textAnchor="middle" className="fill-ink" fontSize={2.8}>
                {cell ? `${STATUS[cell.status].label}${cell.gapHours ? `: ${cell.gapHours} h` : ""}` : `${a.listed} listed`}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="text-left text-ink-muted">Each need slot, a week (as of {view.after ? "the reveal" : dateLabel(view.map.asOf)})</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-1 pr-2">
                Need
              </th>
              <th scope="col" className="py-1 pr-2">
                Planned
              </th>
              <th scope="col" className="py-1 pr-2">
                Booked
              </th>
              {result && (
                <th scope="col" className="py-1">
                  Still open
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {view.map.needs.map((n) => {
              const c = result?.cells.find((x) => x.id === n.id);
              return (
                <tr key={n.id} className="border-b border-line align-top">
                  <th scope="row" className="py-1 pr-2 font-normal">
                    <span className="font-semibold">{n.area}</span>
                    <br />
                    {n.service}, {n.window}
                    {n.note && <span className="block text-xs text-ink-muted">{n.note}</span>}
                    <span className="block text-xs text-ink-muted">
                      {n.source}, verified {n.verifiedOn ? dateLabel(n.verifiedOn) : "never"}
                    </span>
                  </th>
                  <td className="py-1 pr-2">{n.planned ?? "?"} h</td>
                  <td className="py-1 pr-2">{n.booked ?? "?"} h</td>
                  {result && <td className="py-1">{c ? <CellStatus c={c} /> : "—"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {view.map.needs.some((n) => (n.forecast.base ?? 0) > 0) && (
        <p className="text-sm text-ink-muted">
          Forecast, shown apart:{" "}
          {view.map.needs
            .filter((n) => (n.forecast.high ?? 0) > 0)
            .map((n) => `${n.area} ${n.forecast.low ?? 0}–${n.forecast.high ?? 0} h`)
            .join("; ")}
          . A scenario range, never counted as a booking or a gap.
        </p>
      )}
      {result && <Confirmed result={result} />}
    </div>
  );
}

const readyCount = (r: CoverageResult) => new Set(r.cells.flatMap((c) => c.supply.filter((x) => x.use === "usable" && x.hours > 0).map((x) => x.id))).size;

function CellStatus({ c }: { c: CoverageResult["cells"][number] }) {
  const s = STATUS[c.status];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", TONE[s.tone])}>
      <Icon name={CELL_ICON[c.status]} className="size-3.5" />
      {c.gap} h · {s.label}
    </span>
  );
}

function Confirmed({ result }: { result: CoverageResult }) {
  return (
    <details className={box} open>
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">What is actually confirmed?</summary>
      {result.cells.map((c) => (
        <div key={c.id} className="mt-2">
          <p className="font-semibold">{c.label}</p>
          <p className="text-sm">
            {c.planned} h planned − {c.booked} h booked = {c.unfilled} h unfilled. Ready capacity counted: {c.spare} h. Gap: {c.gap} h.
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {c.supply.map((x) => (
              <li key={x.id}>
                <span className="font-semibold">{x.use === "usable" ? "Counts" : "Doesn’t count"}:</span> {x.reason}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="mt-2 text-xs text-ink-muted">
        Local Coverage model {result.modelVersion} · {result.taxonomyVersion}. Illustrative figures.
      </p>
    </details>
  );
}

// ---------------------------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------------------------

function CardsPane({ view, busy, onOpen }: { view: BenchView; busy: boolean; onOpen: (id: string) => void }) {
  const [service, setService] = useState("");
  const [area, setArea] = useState("");
  const [early, setEarly] = useState(false);
  const shown = view.cards.filter(
    (c) =>
      (!service || c.service === service) && (!area || c.areas.includes(area)) && (!early || c.windows.some((w) => /\b([5-8](?::\d\d)?|6:30) am\b/.test(w))),
  );
  const services = [...new Set(view.cards.map((c) => c.service))];
  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-serif text-xl font-semibold">Contractor cards</h4>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Service
          <select className={field} value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">Any</option>
            {services.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Area
          <select className={field} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Any</option>
            {view.map.areas.map((a) => (
              <option key={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm font-semibold">
          <input type="checkbox" className="size-5" checked={early} onChange={(e) => setEarly(e.target.checked)} /> Free before 9 am
        </label>
      </div>
      <p className="text-sm text-ink-muted" role="status">
        {shown.length} of {view.cards.length} shown
      </p>
      <ul className="flex flex-col gap-2">
        {shown.map((c) => (
          <li key={c.id}>
            <Card c={c} open={view.opened.includes(c.id)} busy={busy} onOpen={() => onOpen(c.id)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({ c, open, busy, onOpen }: { c: CardView; open: boolean; busy: boolean; onOpen: () => void }) {
  const [shown, setShown] = useState(open);
  const id = useId();
  const look = CALM_LOOK[c.calm];
  return (
    <div className={box}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {c.label}
            {c.preferred && <span className="ml-2 rounded-full bg-tealtint px-2 py-0.5 text-xs font-semibold">A participant’s choice</span>}
          </p>
          <p className="text-sm text-ink-muted">
            {c.service} · {c.areas.join(", ")}
          </p>
        </div>
        <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", look.cls)}>
          <Icon name={look.icon} className="size-3.5" />
          {CALM[c.calm]}
        </span>
      </div>
      <button
        type="button"
        className={cx(secondary, "mt-2 min-h-11 text-sm")}
        aria-expanded={shown}
        aria-controls={id}
        disabled={busy}
        onClick={() => {
          if (!shown && !open) onOpen();
          setShown(!shown);
        }}
      >
        {shown ? "Close the card" : "Open the card"}
      </button>
      {shown && (
        <dl id={id} className="mt-2 grid gap-1 text-sm">
          <dt className="font-semibold">Pipeline stage</dt>
          <dd>
            {c.stageLabel}
            {c.hold && ` · ${c.hold}`}
            <span className="block text-ink-muted">{STAGE_HINTS[c.stage]}</span>
          </dd>
          <dt className="font-semibold">Approved scope</dt>
          <dd>{c.scope}</dd>
          <dt className="font-semibold">Availability</dt>
          <dd>
            {c.windows.length ? c.windows.join("; ") : "None recorded"}
            <span className="block text-ink-muted">
              {c.availability}
              {c.staleAvailability && ": older than the freshness rule, so unconfirmed"}
            </span>
          </dd>
          <dt className="font-semibold">Travel and commitments</dt>
          <dd>{c.travel || "Not recorded"}</dd>
          {c.claim && (
            <>
              <dt className="font-semibold">What they’ve said</dt>
              <dd>{c.claim}</dd>
            </>
          )}
          <dt className="font-semibold">Evidence</dt>
          <dd>
            {c.evidenceOutcome || "Nothing checked yet"}
            {c.evidence.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {c.evidence.map((e) => (
                  <li key={e.axis}>
                    {e.axis}: {e.state}
                  </li>
                ))}
              </ul>
            )}
          </dd>
          {c.arrangement && (
            <>
              <dt className="font-semibold">Arrangement</dt>
              <dd>{c.arrangement}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The decision panel
// ---------------------------------------------------------------------------------------------

function DecidePane({
  view,
  busy,
  move,
  onSubmit,
  guideId,
  place,
  preview,
  b,
}: {
  view: BenchView;
  busy: boolean;
  move: (m: Move, announce?: string) => Promise<void>;
  onSubmit: () => void;
  guideId: string;
  place: string;
  preview: boolean;
  b: NetworkBlock;
}) {
  const open = view.steps.find((s) => !s.chosen);
  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-serif text-xl font-semibold">Your decisions</h4>
      {view.phase === "map" ? (
        <DiagnosisForm
          view={view}
          busy={busy}
          onSave={(d) => move({ do: "diagnose", diagnosis: d }, "Diagnosis recorded. What is actually confirmed is now on the map.")}
        />
      ) : (
        <p className={cx(plain, "rounded-xl px-3 py-2 text-sm")}>
          Your diagnosis: {view.diagnosis?.unfilled ?? "?"} h unfilled, {view.diagnosis?.ready ?? "?"} h of ready capacity. Compare it with “What is actually
          confirmed?”.
        </p>
      )}
      {view.revealText && (
        <div className={cx(box, "border-l-4 border-accent")}>
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Three weeks later</p>
          <p className="mt-1">{view.revealText}</p>
        </div>
      )}
      {view.steps
        .filter((s) => s.chosen)
        .map((s) => (
          <p key={s.id} className="text-sm">
            <span className="font-semibold">{s.title}:</span> {s.options.find((o) => o.id === s.chosen)?.text}
          </p>
        ))}
      {view.scorecard && <ScorecardPanel card={view.scorecard} />}
      {open && (view.phase === "before" || view.phase === "after" || view.phase === "quality") && (
        <StepForm key={open.id} step={open} busy={busy} onChoose={(o) => move({ do: "answer", step: open.id, option: o }, "Decision recorded.")} />
      )}
      {view.outreach && (view.phase === "outreach" || view.phase === "reveal") && (
        <OutreachForm view={view} busy={busy} move={move} guideId={guideId} place={place} preview={preview} b={b} />
      )}
      {view.phase === "reveal" && (
        <button type="button" className={primary} disabled={busy} onClick={() => move({ do: "reveal" }, "Three weeks later: the map and cards have changed.")}>
          See three weeks later
        </button>
      )}
      {view.phase === "submit" && (
        <button type="button" className={primary} disabled={busy} onClick={onSubmit}>
          Finish and see the debrief
        </button>
      )}
    </div>
  );
}

function DiagnosisForm({ view, busy, onSave }: { view: BenchView; busy: boolean; onSave: (d: Diagnosis) => void }) {
  const [measure, setMeasure] = useState<Measure | "">("");
  const [nums, setNums] = useState({ planned: "", booked: "", unfilled: "", ready: "" });
  const [counted, setCounted] = useState<string[]>([]);
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const labels = {
    planned: "Planned hours a week, 7–9 am",
    booked: "Booked hours",
    unfilled: "Unfilled hours",
    ready: "Ready capacity for the gap (hours)",
  } as const;
  return (
    <form
      className={box}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ measure, planned: num(nums.planned), booked: num(nums.booked), unfilled: num(nums.unfilled), ready: num(nums.ready), counted });
      }}
    >
      <p className="font-semibold">Diagnose the gap</p>
      <p className="text-sm text-ink-muted">Open a few cards first. Then measure the gap and say who, if anyone, is ready supply for it.</p>
      <fieldset className="mt-2">
        <legend className="text-sm font-semibold">Measure it by</legend>
        {(Object.keys(MEASURES) as Measure[]).map((m) => (
          <label key={m} className="flex min-h-11 items-center gap-2">
            <input type="radio" name="nb-measure" className="size-5" checked={measure === m} onChange={() => setMeasure(m)} />
            {MEASURES[m]}
          </label>
        ))}
      </fieldset>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
          <label key={k} className="flex flex-col gap-1 text-sm font-semibold">
            {labels[k]}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              className={field}
              value={nums[k]}
              onChange={(e) => setNums({ ...nums, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <fieldset className="mt-2">
        <legend className="text-sm font-semibold">Who counts as ready capacity for the 7–9 am gap?</legend>
        {view.cards.map((c) => (
          <label key={c.id} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5"
              checked={counted.includes(c.id)}
              onChange={(e) => setCounted(e.target.checked ? [...counted, c.id] : counted.filter((x) => x !== c.id))}
            />
            {c.label} <span className="text-sm text-ink-muted">({c.service})</span>
          </label>
        ))}
        <p className="text-sm text-ink-muted">Leave them all unticked if nobody is.</p>
      </fieldset>
      <button type="submit" className={cx(primary, "mt-3")} disabled={busy}>
        Record my diagnosis
      </button>
    </form>
  );
}

function StepForm({ step, busy, onChoose }: { step: BenchView["steps"][number]; busy: boolean; onChoose: (o: string) => void }) {
  const [pick, setPick] = useState("");
  const name = useId();
  return (
    <form
      className={box}
      onSubmit={(e) => {
        e.preventDefault();
        if (pick) onChoose(pick);
      }}
    >
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{step.title}</p>
      <fieldset>
        <legend className="mt-1">{step.prompt}</legend>
        {step.options.map((o) => (
          <label key={o.id} className="mt-2 flex items-start gap-2 rounded-xl p-2 ring-1 ring-line">
            <input type="radio" name={name} className="mt-1 size-5 shrink-0" checked={pick === o.id} onChange={() => setPick(o.id)} />
            <span>{o.text}</span>
          </label>
        ))}
      </fieldset>
      <p className="mt-2 text-sm text-ink-muted">Your choice stands once made. The debrief explains each one.</p>
      <button type="submit" className={cx(primary, "mt-2")} disabled={busy || !pick}>
        Decide
      </button>
    </form>
  );
}

function OutreachForm({
  view,
  busy,
  move,
  guideId,
  place,
  preview,
  b,
}: {
  view: BenchView;
  busy: boolean;
  move: (m: Move, announce?: string) => Promise<void>;
  guideId: string;
  place: string;
  preview: boolean;
  b: NetworkBlock;
}) {
  const o = view.outreach!;
  const [profile, setProfile] = useState(o.input?.profile ?? "");
  const [fields, setFields] = useState<Record<string, string>>(o.input?.fields ?? {});
  const [copyNote, setCopyNote] = useState("");
  const saved =
    o.input &&
    o.input.profile === profile &&
    JSON.stringify(o.input.fields) === JSON.stringify({ ...Object.fromEntries(o.template.fields.map((f) => [f.id, fields[f.id] ?? ""])) });
  const draft = o.draft;
  return (
    <div className={box}>
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Recruit for the gap</p>
      <p className="mt-1">
        Draft a local recruitment brief from the reviewed template. The locked claims can’t be changed; you fill in the local details. Nothing here sends
        anything.
      </p>
      <label className="mt-2 flex flex-col gap-1 text-sm font-semibold">
        The role it’s for (sets the checklist)
        <select className={field} value={profile} disabled={o.locked} onChange={(e) => setProfile(e.target.value)}>
          <option value="">Choose a role</option>
          {o.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {o.template.fields.map((f) => (
        <label key={f.id} className="mt-2 flex flex-col gap-1 text-sm font-semibold">
          {f.label}
          <input
            className={field}
            value={fields[f.id] ?? ""}
            maxLength={f.max + 40}
            disabled={o.locked}
            onChange={(e) => setFields({ ...fields, [f.id]: e.target.value })}
            aria-describedby={`nb-hint-${f.id}`}
          />
          <span id={`nb-hint-${f.id}`} className="font-normal text-ink-muted">
            {f.hint}
          </span>
        </label>
      ))}
      {!o.locked && (
        <button
          type="button"
          className={cx(secondary, "mt-3")}
          disabled={busy || saved === true}
          onClick={() => move({ do: "outreach", outreach: { profile, fields } }, "Draft saved.")}
        >
          {o.input ? "Update the draft" : "Make the draft"}
        </button>
      )}
      {o.problems.length > 0 && (
        <ul className={cx(warn, "mt-2 list-disc rounded-xl py-2 pl-8 pr-3 text-sm")} role="status">
          {o.problems.map((p) => (
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
          <p className="mt-2 text-xs text-ink-muted">
            Template {draft.templateVersion} · {draft.approvalState === "approved" ? "approved" : "not yet approved: for review"}. Locked claims:{" "}
            {o.template.locked.length}. Before anything is sent through an approved process: the sender, contact permission, current terms, the approved brand
            and a person’s review.
          </p>
          {draft.checklist && (
            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold">Onboarding checklist: {draft.profile}</summary>
              <ul className="list-disc pl-5">
                {draft.checklist.rows.map((r) => (
                  <li key={r.axis + r.label}>
                    <span className="font-semibold">{r.requirementLabel}:</span> {r.label}. <span className="text-ink-muted">{r.why}</span>
                  </li>
                ))}
              </ul>
              {draft.checklist.unreviewed && <p className="text-xs text-ink-muted">This profile hasn’t been reviewed by its owner yet.</p>}
            </details>
          )}
          <button
            type="button"
            className={cx(secondary, "mt-2")}
            disabled={busy || o.problems.length > 0 || !saved}
            onClick={async () => {
              try {
                await navigator.clipboard?.writeText([`Subject: ${draft.subject}`, draft.intro, draft.watermark].join("\n\n"));
              } catch {
                // Copying is a convenience; the move below still records it as copied, never sent.
              }
              await move({ do: "copy" }, "Copied. It hasn’t been sent.");
              setCopyNote("Copied to your clipboard. It hasn’t been sent, and nothing records it as sent.");
            }}
          >
            <Icon name="copy" className="size-4" /> {o.copied ? "Copied (not sent)" : "Copy the draft"}
          </button>
          {copyNote && <p className="mt-1 text-sm">{copyNote}</p>}
        </div>
      )}
      {b.jobAid.snippetId && (
        <div className="mt-3">
          <AidSection snippetId={b.jobAid.snippetId} why={b.jobAid.why} place={place.startsWith("topic:") ? place : `magazine:${guideId}`} preview={preview} />
        </div>
      )}
    </div>
  );
}

function ScorecardPanel({ card }: { card: NonNullable<BenchView["scorecard"]> }) {
  return (
    <div className={box}>
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Quality scorecard</p>
      <p className="font-semibold">{card.worker}</p>
      <p className="text-sm text-ink-muted">
        {card.role}. Review owner: {card.reviewOwner}.
      </p>
      <p className="mt-2 flex flex-wrap gap-1">
        {card.statuses.map((s) => (
          <span
            key={s}
            className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", s === "restricted" || s === "actionOpen" ? bad : s === "current" ? good : warn)}
          >
            {SCORE_STATUS[s]}
          </span>
        ))}
      </p>
      <p className="mt-1 text-xs text-ink-muted">No total, average or star rating: each dimension stands on its own. “Limited evidence” isn’t a poor rating.</p>
      {card.restriction && <p className={cx(bad, "mt-2 rounded-xl px-3 py-2 text-sm")}>{card.restriction}</p>}
      {card.dims.map((d) => (
        <div key={d.dim} className="mt-2">
          <p className="font-semibold">{d.label}</p>
          <ul className="text-sm">
            {d.metrics.map((m) => (
              <li key={m.id} className="mt-1">
                {m.label}: <span className="font-semibold">{m.text}</span>
                <span className="block text-xs text-ink-muted">
                  {m.period} · {m.source} · reviewed {m.lastReview ? dateLabel(m.lastReview) : "not yet"}
                  {m.missing && ` · ${m.missing}`}
                  {m.note && m.numerator !== null && ` · ${m.note}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {card.strengths.length > 0 && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">Evidenced strengths:</span> {card.strengths.join(" ")}
        </p>
      )}
      {card.concerns.length > 0 && (
        <p className="mt-1 text-sm">
          <span className="font-semibold">Concerns:</span> {card.concerns.join(" ")}
        </p>
      )}
      {card.response && (
        <p className="mt-1 text-sm">
          <span className="font-semibold">The contractor’s response:</span> {card.response}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The debrief
// ---------------------------------------------------------------------------------------------

function DebriefView({
  b,
  d,
  v,
  busy,
  preview,
  guideId,
  place,
  onRetry,
}: {
  b: NetworkBlock;
  d: Debrief;
  v: NetworkView;
  busy: boolean;
  preview: boolean;
  guideId: string;
  place: string;
  onRetry: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="flex flex-col gap-3">
      <h4 ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold">
        Debrief
      </h4>
      <div className={cx("rounded-2xl px-4 py-3", d.valid ? good : bad)}>
        <p className="font-semibold">{d.valid ? "A defensible outcome" : "Not a valid outcome yet"}</p>
        <p>{d.endingText}</p>
      </div>
      {d.critical.length > 0 && (
        <div className={cx(bad, "rounded-2xl px-4 py-3")}>
          <p className="font-semibold">
            Critical {d.critical.length === 1 ? "error" : "errors"}: no total can cancel {d.critical.length === 1 ? "it" : "them"}
          </p>
          <ul className="mt-1 list-disc pl-5">
            {d.critical.map((c) => (
              <li key={c.code}>
                {c.text}. <span className="font-semibold">Instead:</span> {c.correction}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="text-left text-ink-muted">
            Seven dimensions, 0–3 each ({d.score} of {d.max}){d.passed !== null && ` · ${d.passed ? "passed" : "not passed"}`}
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-1 pr-2">
                Dimension
              </th>
              <th scope="col" className="py-1 pr-2">
                Level
              </th>
              <th scope="col" className="py-1">
                Why
              </th>
            </tr>
          </thead>
          <tbody>
            {d.dims.map((x) => (
              <tr key={x.dim} className="border-b border-line align-top">
                <th scope="row" className="py-1 pr-2">
                  {x.label}
                </th>
                <td className="py-1 pr-2">
                  {x.level} · {LEVELS[x.level]}
                </td>
                <td className="py-1">{x.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={box}>
        <p className="font-semibold">The gap, as the model reads it</p>
        <p className="text-sm">
          At the start: {d.diagnosis.expected.planned} h planned, {d.diagnosis.expected.booked} h booked, {d.diagnosis.expected.unfilled} h unfilled, and{" "}
          {d.diagnosis.expected.ready} h of ready capacity. You said {d.diagnosis.given?.unfilled ?? "?"} h unfilled and {d.diagnosis.given?.ready ?? "?"} h
          ready.
        </p>
        <p className="text-sm">
          After the reveal: {d.after.gap} h still unfilled a week, with {d.after.ready} h of ready capacity counted.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {d.choices.map((c) => (
          <li key={c.step} className={box}>
            <p className="font-semibold">{c.title}</p>
            <p className="text-sm">You chose: {c.chosen}</p>
            <p className="mt-1 text-sm">{c.feedback}</p>
          </li>
        ))}
        <li className={box}>
          <p className="font-semibold">Recruit for the gap</p>
          <p className="text-sm">
            Brief for: {d.outreach.profile || "no role"}. {d.outreach.copied ? "Copied, and not sent." : "Not copied."}
          </p>
        </li>
      </ul>
      {d.summary && <p>{d.summary}</p>}
      {b.related.length > 0 && (
        <div>
          <p className="font-semibold">Keep going</p>
          <ul className="mt-1 flex flex-col gap-1">
            {b.related.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="font-semibold text-accent underline underline-offset-2">
                  {r.label}
                </Link>{" "}
                <span className="text-sm text-ink-muted">{r.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {b.jobAid.snippetId && (
        <AidSection snippetId={b.jobAid.snippetId} why={b.jobAid.why} place={place.startsWith("topic:") ? place : `magazine:${guideId}`} preview={preview} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primary} disabled={busy} onClick={onRetry}>
          <Icon name="refresh" className="size-4" /> Try again
        </button>
        <p className="text-xs text-ink-muted">
          Attempt {v.attemptNo} · {d.versions.scenario} · {d.versions.bench} · {d.versions.rubric} · {d.versions.rules} · {d.versions.taxonomy}
        </p>
      </div>
    </div>
  );
}
