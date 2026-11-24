"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { XRayBlock } from "@/lib/magazine";
import { emptyState, finishProblems, money, submitLines, XRAY_NOTICE, type LinePick, type ScriptPart, type XRayState } from "@/lib/xray";
import {
  ASK_ORDER,
  ASK_WHO,
  blankFundingPick,
  DECISION_ORDER,
  DECISIONS,
  decisionLabel,
  DOC_ROLES,
  EVIDENCE_KINDS,
  fundingDebrief,
  fundingPhase,
  invoiceCheck,
  MODE_LABEL,
  OPEN_DECISIONS,
  OUTPUT_ORDER,
  OUTPUT_PARTS,
  OVERALL,
  OVERALL_ORDER,
  reviewedCoach,
  ROUTE_ORDER,
  ROUTES,
  scoreFunding,
  SCRIPT_LABELS,
  SOURCE_KINDS,
  type AskWho,
  type CoachPoint,
  type FDecision,
  type FundingDebrief,
  type FundingSource,
  type Route,
} from "@/lib/xrayFunding";
import type { xrayState } from "@/server/xray";
import { Icon } from "../Icon";
import { CharacterRow } from "../characters/CharacterPortrait";
import { AidSection } from "../playbooks/AidSection";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  The Quote/Invoice X-Ray (docs/invoice-xray.md, "Quote and invoice review"). The learner opens a fictional quote or
  invoice, selects each line, inspects the evidence and sources, asks the right person for what's missing, and chooses
  one of six decisions, a funding route and a reason; then says where the document stands overall and what happens
  next, and practises explaining it.

  - Every line is a button on the document, and the same lines are in a table: the case can be done without the
    picture, by keyboard or screen reader, at phone width. Nothing needs a precise tap, a drag or a timer.
  - Statuses are words, never colour alone, and nothing is stamped "approved".
  - The answer key stays on the server until the lines are in; in the editor's preview it runs on the block as written
    and stores nothing. Coaching never changes the decision.
*/

type Loaded = ReturnType<typeof xrayState>;
type Critical = { lineId: string | null; text: string }[];
type Reply = { lineId: string; who: AskWho; text: string };
type Coach = { source: "ai" | "reviewed"; points: CoachPoint[]; fallback?: string; verdict?: string; facts?: { id: string; text: string }[] };
type Change = (patch: Partial<XRayState> | ((prev: XRayState) => Partial<XRayState>)) => void;

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-base";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const good = "rounded-2xl bg-[#e3f4ea] p-4 text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const summary = "flex min-h-11 cursor-pointer items-center gap-2 py-1 font-semibold";
const errorText = (e: unknown, d: string) => (e instanceof Error ? e.message : d);
const showDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`))
    : "";
const ZOOMS = [1, 1.2, 1.4] as const;
const sourceLine = (s: FundingSource) =>
  [s.title, s.ref, s.version, s.effectiveDate ? `effective ${showDate(s.effectiveDate)}` : "effective date to confirm"].filter(Boolean).join(" · ");

export function QuoteInvoiceXRay({ block: b, ctx }: { block: XRayBlock; ctx: InteractiveContext }) {
  const f = b.funding!;
  const phase = fundingPhase(b.phase);
  const url = `/api/magazine/${ctx.guideId}/xray`;
  const loaded = useApi<Loaded>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<XRayState | null>(ctx.preview ? emptyState() : null);
  const [review, setReview] = useState<FundingDebrief | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [draft, setDraft] = useState<Record<ScriptPart, string> | null>(null);
  const [critical, setCritical] = useState<Critical>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const [held, setHeld] = useState("");
  const top = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLHeadingElement>(null);
  const dirty = useRef(false);

  if (!ctx.preview && loaded.data && s === null) {
    setS(loaded.data.state);
    setDraft(loaded.data.draft);
    setReview(loaded.data.review);
    setReplies(loaded.data.replies);
    if (!loaded.data.usable.ok) setHeld(loaded.data.usable.reason);
  }
  useEffect(() => {
    if (ctx.preview || !s || !dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      api(url, { body: { blockId: b.id, state: s } }).catch(() => undefined);
    }, 600);
    return () => clearTimeout(t);
  }, [s, ctx.preview, url, b.id]);

  if (!ctx.preview && loaded.error)
    return (
      <Shell title={b.title} phase={phase}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  if (!s)
    return (
      <Shell title={b.title} phase={phase}>
        <p className="text-ink-muted">Loading…</p>
      </Shell>
    );

  const change: Change = (patch) => {
    dirty.current = true;
    setS((prev) => (prev ? { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) } : prev));
  };
  const pick = (id: string, p: Partial<LinePick>) =>
    change((prev) => {
      const cur = { ...blankFundingPick(), ...prev.picks[id], ...p };
      // Missing facts belong to a line that's still open; nothing stale is submitted.
      if (!OPEN_DECISIONS.includes(cur.decision as FDecision)) cur.evidence = [];
      return { picks: { ...prev.picks, [id]: cur } };
    });
  const opened = new Set(s.opened ?? []);
  /** What was opened: kept on the attempt (and, outside the preview, recorded once on the server). */
  const signal = (name: "document_line_opened" | "source_checked" | "source_issue_reported", ref: string) => {
    const id = name === "document_line_opened" ? `line:${ref}` : ref;
    if (name !== "source_issue_reported" && !opened.has(id)) setS((prev) => (prev ? { ...prev, opened: [...(prev.opened ?? []), id] } : prev));
    if (!ctx.preview) api(url, { body: { action: "signal", blockId: b.id, name, ref } }).catch(() => undefined);
  };
  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
    } catch (e) {
      setProblem(errorText(e, "That didn’t send. Your work is still here."));
    } finally {
      setBusy(false);
    }
  };
  const focusTop = () => requestAnimationFrame(() => top.current?.focus());
  const ask = (lineId: string, who: AskWho) =>
    run(async () => {
      const mine = s.picks[lineId]?.ask ?? [];
      if (!mine.includes(who)) pick(lineId, { ask: [...mine, who] });
      if (replies.some((r) => r.lineId === lineId && r.who === who)) return;
      const text = ctx.preview
        ? (f.asks.find((x) => x.who === who && x.lineId === lineId)?.reply ??
          f.asks.find((x) => x.who === who && !x.lineId)?.reply ??
          `${ASK_WHO[who]} can’t add anything about this line.`)
        : (await api<{ reply: string }>(url, { body: { action: "ask", blockId: b.id, lineId, who } })).reply;
      setReplies((r) => [...r, { lineId, who, text }]);
    });
  const submit = () =>
    run(async () => {
      if (ctx.preview) {
        const out = submitLines(b, s);
        if ("problem" in out) throw new Error(out.problem);
        setS(out.state);
        setCritical(out.critical);
        if (!out.critical.length) setDraft(b.explain.draft);
      } else {
        const out = await api<Loaded & { critical: Critical }>(url, { body: { action: "submit", blockId: b.id, state: s } });
        dirty.current = false;
        setS(out.state);
        setCritical(out.critical);
        setDraft(out.draft);
      }
      focusTop();
    });
  const finish = () =>
    run(async () => {
      if (ctx.preview) {
        const p = finishProblems(b, s);
        if (p.length) throw new Error(`Not yet. ${p.join(" ")}`);
        setReview(fundingDebrief(b, s, scoreFunding(b, s)));
      } else {
        const out = await api<Loaded>(url, { body: { action: "finish", blockId: b.id, state: s } });
        dirty.current = false;
        setS(out.state);
        setReview(out.review);
        ctx.activity(b.id, { outcome: "finished" });
        ctx.engaged(b.id);
      }
      focusTop();
    });
  const again = () =>
    run(async () => {
      setReview(null);
      setCritical([]);
      setDraft(null);
      setReplies([]);
      setSelected(0);
      if (ctx.preview) setS(emptyState());
      else setS((await api<Loaded>(url, { body: { action: "restart", blockId: b.id } })).state);
      focusTop();
    });

  return (
    <Shell title={b.title} phase={phase}>
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{XRAY_NOTICE}</p>
      {b.intro && <p className="mt-3 text-lg">{b.intro}</p>}
      <div ref={top} tabIndex={-1} className="mt-4 outline-none" />
      {held && (
        <p role="alert" className={cx(warn, "mb-3")}>
          {held}
        </p>
      )}
      {problem && (
        <p role="alert" className={cx(warn, "mb-3")}>
          {problem}
        </p>
      )}
      {review ? (
        <Debrief block={b} d={review} s={s} change={change} preview={Boolean(ctx.preview)} url={url} onAgain={() => void again()} guideId={ctx.guideId} />
      ) : s.stage === 0 ? (
        <Inspect
          block={b}
          s={s}
          change={change}
          pick={pick}
          signal={signal}
          ask={(l, w) => void ask(l, w)}
          replies={replies}
          critical={critical}
          selected={selected}
          setSelected={(i) => {
            setSelected(i);
            signal("document_line_opened", b.lines[i].id);
            requestAnimationFrame(() => sheet.current?.focus());
          }}
          sheetRef={sheet}
          busy={busy || Boolean(held)}
          onSubmit={() => void submit()}
        />
      ) : (
        <Explain block={b} s={s} change={change} draft={draft} busy={busy} preview={Boolean(ctx.preview)} url={url} onFinish={() => void finish()} />
      )}
    </Shell>
  );
}

function Shell({ title, phase, children }: { title: string; phase: "quote" | "invoice"; children: React.ReactNode }) {
  return (
    <section aria-label={`Quote and invoice X-Ray: ${title}`} className="w-full min-w-0 rounded-3xl border border-line-strong bg-surface p-4 sm:p-7">
      <p className="mb-2 flex flex-wrap items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="search" className="size-5" /> {MODE_LABEL[phase]} · training case
      </p>
      <h3 className="font-serif text-2xl font-semibold">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Inspect and decide
// ---------------------------------------------------------------------------------------------

function Inspect({
  block: b,
  s,
  change,
  pick,
  signal,
  ask,
  replies,
  critical,
  selected,
  setSelected,
  sheetRef,
  busy,
  onSubmit,
}: {
  block: XRayBlock;
  s: XRayState;
  change: Change;
  pick: (id: string, p: Partial<LinePick>) => void;
  signal: (name: "document_line_opened" | "source_checked" | "source_issue_reported", ref: string) => void;
  ask: (lineId: string, who: AskWho) => void;
  replies: Reply[];
  critical: Critical;
  selected: number;
  setSelected: (i: number) => void;
  sheetRef: React.RefObject<HTMLHeadingElement | null>;
  busy: boolean;
  onSubmit: () => void;
}) {
  const f = b.funding!;
  const [asTable, setAsTable] = useState(false);
  const decided = b.lines.filter((l) => s.picks[l.id]?.decision).length;
  return (
    <>
      <Request block={b} s={s} signal={signal} />
      {critical.length > 0 && (
        <div role="alert" className={cx(warn, "mt-3")}>
          <p className="font-semibold">Before this goes any further, look again.</p>
          {critical.map((c) => (
            <p key={c.text} className="mt-1">
              {c.text}
            </p>
          ))}
        </div>
      )}
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-serif text-xl font-semibold">The document</h4>
            <button type="button" className={secondary} aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
              <Icon name={asTable ? "doc" : "list"} className="size-4" /> {asTable ? "Show the document" : "Show as a table"}
            </button>
          </div>
          {asTable ? (
            <LineTable block={b} s={s} selected={selected} onSelect={setSelected} />
          ) : (
            <Document block={b} s={s} selected={selected} onSelect={setSelected} />
          )}
          <Sheet
            key={b.lines[selected]?.id}
            block={b}
            s={s}
            i={selected}
            pick={pick}
            ask={ask}
            replies={replies}
            headingRef={sheetRef}
            onNext={() => setSelected((selected + 1) % b.lines.length)}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
          <Drawers block={b} s={s} signal={signal} />
          <p className="text-sm" aria-live="polite">
            {decided} of {b.lines.length} lines decided.
          </p>
          <fieldset className={cx(box, "flex flex-col gap-2")}>
            <legend className="px-1 font-semibold">Overall, where does the document stand?</legend>
            {OVERALL_ORDER.map((o) => (
              <label key={o} className="flex min-h-11 cursor-pointer items-start gap-3">
                <input type="radio" name={`${b.id}-overall`} className="mt-1 size-5" checked={s.overall === o} onChange={() => change({ overall: o })} />
                <span>
                  <span className="font-semibold">{OVERALL[o].label}. </span>
                  <span className="text-sm">{OVERALL[o].text}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className={cx(box, "flex flex-col gap-2")}>
            <legend className="px-1 font-semibold">{b.next.prompt}</legend>
            {b.next.options.map((o) => (
              <label key={o.id} className="flex min-h-11 cursor-pointer items-start gap-3">
                <input type="radio" name={`${b.id}-next`} className="mt-1 size-5" checked={s.next === o.id} onChange={() => change({ next: o.id })} />
                <span>{o.text}</span>
              </label>
            ))}
          </fieldset>
          <button type="button" className={primary} disabled={busy} onClick={onSubmit}>
            Submit the decisions
          </button>
          <p className="text-xs text-ink-muted">
            {f.mode === "assessed" ? "Assessed: a critical error on the first try means no pass. " : "Practice: nothing here is a mark. "}
            You can change any line until you submit.
          </p>
        </div>
      </div>
    </>
  );
}

/** The request: the person's goal and the message that started it. */
function Request({ block: b, s, signal }: { block: XRayBlock; s: XRayState; signal: (name: "source_checked", ref: string) => void }) {
  const f = b.funding!;
  const goal = f.evidence.find((e) => e.kind === "goal");
  const opened = new Set(s.opened ?? []);
  return (
    <article aria-label="The request" className={cx(box, "mt-4")}>
      <CharacterRow names={[b.participant.name]} size="sm">
        <h4 className="font-semibold">
          {b.participant.name}
          {b.participant.about ? `: ${b.participant.about}` : ""}
        </h4>
      </CharacterRow>
      {f.request && <p className="mt-2">{f.request}</p>}
      {goal &&
        (opened.has(goal.id) ? (
          <p className="mt-2">
            <span className="font-semibold">Their goal: </span>
            {goal.text}
          </p>
        ) : (
          <button type="button" className={cx(secondary, "mt-2")} onClick={() => signal("source_checked", goal.id)}>
            <Icon name="user" className="size-4" /> Ask what they want it for
          </button>
        ))}
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold">Document</dt>
        <dd>
          {f.documentRole ? DOC_ROLES[f.documentRole].label : "Not stated"}, dated {showDate(b.docDate)}
        </dd>
        <dt className="font-semibold">Its prices</dt>
        <dd>{f.documentRole ? DOC_ROLES[f.documentRole].price : ""}</dd>
        <dt className="font-semibold">Deciding on</dt>
        <dd>{showDate(b.decisionDate)}</dd>
      </dl>
      {b.facts.length > 0 && (
        <ul className="mt-2 list-disc pl-6 text-sm">
          {b.facts.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-sm font-semibold">
        {fundingPhase(b.phase) === "quote"
          ? "This is a quote: an estimate before anything is agreed or delivered. It isn’t a claim, and it isn’t evidence that anything happened."
          : "This is an invoice after delivery. Each line is checked against what was agreed and what was delivered; an invoice isn’t agreement to a new price."}
      </p>
    </article>
  );
}

const statusOf = (p: LinePick | undefined, phase: XRayBlock["phase"]) => (p?.decision ? decisionLabel(p.decision, phase) : "Not decided yet");

/** The document itself. Each line is a button, so the document is also a list of its lines. */
function Document({ block: b, s, selected, onSelect }: { block: XRayBlock; s: XRayState; selected: number; onSelect: (i: number) => void }) {
  const [zoom, setZoom] = useState(0);
  const total = b.lines.reduce((n, l) => n + l.amountCents, 0);
  const quote = b.phase === "quote";
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">Zoom</span>
        {ZOOMS.map((z, i) => (
          <button key={z} type="button" className={secondary} aria-pressed={zoom === i} onClick={() => setZoom(i)}>
            {Math.round(z * 100)}%
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl">
        <article
          aria-label={`${quote ? "Quote" : "Invoice"} from ${b.supplier}`}
          style={{ fontSize: `${ZOOMS[zoom]}rem` }}
          className="min-w-0 rounded-xl bg-[#fffdf7] p-4 text-[#1d1d1b] shadow-sm ring-1 ring-line sm:p-6 dark:bg-[#f4f1e8]"
        >
          <header className="flex flex-wrap items-start justify-between gap-2 border-b border-dashed border-[#bdb6a3] pb-3">
            <div>
              <p className="font-serif text-lg font-semibold">{b.supplier}</p>
              <p className="text-sm">{quote ? `Prepared for ${b.participant.name}` : `Billed to Trilogy Care for ${b.participant.name}`}</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-mulish text-base font-extrabold uppercase tracking-[0.14em]">{quote ? "Quote" : "Tax invoice"}</p>
              <p>
                {b.docNumber} · {showDate(b.docDate)}
              </p>
              {quote && <p className="font-semibold">Estimate only: nothing delivered</p>}
            </div>
          </header>
          <ol className="mt-2 flex flex-col">
            {b.lines.map((l, i) => (
              <li key={l.id}>
                <button
                  type="button"
                  aria-pressed={selected === i}
                  onClick={() => onSelect(i)}
                  className={cx(
                    "grid min-h-11 w-full grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-[#f1ead6] focus-visible:outline-2 focus-visible:outline-[#1d1d1b]",
                    selected === i && "bg-[#f1ead6] outline-2 outline-[#1d1d1b]",
                  )}
                >
                  <span className="font-semibold">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block">{l.description}</span>
                    {l.detail && <span className="block text-sm text-[#5b574c]">{l.detail}</span>}
                    <span className="mt-1 inline-block rounded-full bg-[#e9e2cc] px-2 py-0.5 text-xs font-semibold">{statusOf(s.picks[l.id], b.phase)}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{money(l.amountCents)}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-2 flex justify-between border-t border-dashed border-[#bdb6a3] pt-3 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(total)}</span>
          </p>
        </article>
      </div>
    </div>
  );
}

/** The same lines as a table: identical information, for keyboard, screen reader and small screens. */
function LineTable({ block: b, s, selected, onSelect }: { block: XRayBlock; s: XRayState; selected: number; onSelect: (i: number) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] text-left text-sm">
        <caption className="mb-2 text-left font-semibold">
          {b.phase === "quote" ? "Quote" : "Invoice"} {b.docNumber} from {b.supplier}, {showDate(b.docDate)}
        </caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="py-2 pr-2">
              Line
            </th>
            <th scope="col" className="py-2 pr-2">
              Item and detail
            </th>
            <th scope="col" className="py-2 pr-2 text-right">
              Amount
            </th>
            <th scope="col" className="py-2">
              Your decision
            </th>
          </tr>
        </thead>
        <tbody>
          {b.lines.map((l, i) => (
            <tr key={l.id} className={cx("border-b border-line align-top", selected === i && "bg-muted")}>
              <th scope="row" className="py-2 pr-2">
                <button type="button" className={cx(secondary, "px-3")} aria-pressed={selected === i} onClick={() => onSelect(i)}>
                  {i + 1}
                  <span className="sr-only">: open this line</span>
                </button>
              </th>
              <td className="py-2 pr-2">
                {l.description}
                {l.detail && <span className="block text-ink-muted">{l.detail}</span>}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{money(l.amountCents)}</td>
              <td className="py-2">{statusOf(s.picks[l.id], b.phase)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The selected line: what it says, the invoice comparison, an X-ray of a bundle, who to ask, and the decision. */
function Sheet({
  block: b,
  s,
  i,
  pick,
  ask,
  replies,
  headingRef,
  onNext,
}: {
  block: XRayBlock;
  s: XRayState;
  i: number;
  pick: (id: string, p: Partial<LinePick>) => void;
  ask: (lineId: string, who: AskWho) => void;
  replies: Reply[];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onNext: () => void;
}) {
  const ids = useId();
  const [xray, setXray] = useState(false);
  const l = b.lines[i];
  const f = b.funding!;
  if (!l) return null;
  const fl = f.lines.find((x) => x.lineId === l.id);
  const p = { ...blankFundingPick(), ...s.picks[l.id] };
  const inv = fl?.invoice ? invoiceCheck(fl.invoice, b.docDate) : null;
  const mine = replies.filter((r) => r.lineId === l.id);
  return (
    <section aria-labelledby={`${ids}-h`} className={cx(box, "flex min-w-0 flex-col gap-3")}>
      <h5 id={`${ids}-h`} ref={headingRef} tabIndex={-1} className="font-serif text-lg font-semibold outline-none">
        Line {i + 1}: {l.description}, {money(l.amountCents)}
      </h5>
      <p className="text-sm">
        {l.detail ? `${l.detail}. ` : ""}
        <span className="font-semibold">{b.phase === "quote" ? "Quote stage: an estimate. " : "Invoice stage: after delivery. "}</span>
        {f.documentRole === "supplier_invoice" || f.documentRole === "worker_invoice" || f.documentRole === "worker_quote"
          ? "A supplier’s cost, not the participant’s price."
          : f.documentRole === "participant_statement"
            ? "The price charged to the participant."
            : "A retail price, not yet an agreed price."}
      </p>

      {fl?.invoice && inv && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[18rem] text-left text-sm">
            <caption className="mb-1 text-left font-semibold">What was agreed, and what’s invoiced</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-1 pr-2">
                  {" "}
                </th>
                <th scope="col" className="py-1 pr-2">
                  Units
                </th>
                <th scope="col" className="py-1 pr-2 text-right">
                  Rate
                </th>
                <th scope="col" className="py-1 text-right">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <th scope="row" className="py-1 pr-2 font-semibold">
                  Agreed
                </th>
                {fl.invoice.agreed ? (
                  <>
                    <td className="py-1 pr-2">
                      {fl.invoice.agreed.qty} × {fl.invoice.agreed.unit}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">{money(fl.invoice.agreed.rateCents)}</td>
                    <td className="py-1 text-right tabular-nums">{money(inv.agreedCents ?? 0)}</td>
                  </>
                ) : (
                  <td colSpan={3} className="py-1">
                    Nothing agreed for this line
                  </td>
                )}
              </tr>
              <tr>
                <th scope="row" className="py-1 pr-2 font-semibold">
                  Invoiced
                </th>
                <td className="py-1 pr-2">
                  {fl.invoice.invoiced.qty} × {fl.invoice.invoiced.unit}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{money(fl.invoice.invoiced.rateCents)}</td>
                <td className="py-1 text-right tabular-nums">{money(inv.invoicedCents)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-sm">
            <span className="font-semibold">Service date: </span>
            {showDate(fl.invoice.serviceDate) || "not shown"}
            {inv.afterInvoice ? " (after the invoice date)" : ""}. <span className="font-semibold">Delivery evidence: </span>
            {fl.invoice.evidence || "none shown"}
          </p>
        </div>
      )}

      {fl && fl.components.length > 0 && (
        <div>
          <button type="button" className={secondary} aria-expanded={xray} onClick={() => setXray(!xray)}>
            <Icon name="eye" className="size-4" /> {xray ? "Hide the X-ray" : "X-ray this line"}
          </button>
          {xray && (
            <ul className="mt-2 flex flex-col gap-1 rounded-xl bg-[#eef4ff] p-3 text-sm text-[#12233f] dark:bg-[#16243a] dark:text-[#cfe0ff]">
              <li className="font-semibold">What this one line is made of:</li>
              {fl.components.map((c) => (
                <li key={c.label} className="flex justify-between gap-2">
                  <span>{c.label}</span>
                  <span className="tabular-nums">{money(c.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <p className="font-semibold">Ask someone about this line</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {ASK_ORDER.map((w) => (
            <button key={w} type="button" className={secondary} aria-pressed={p.ask?.includes(w)} onClick={() => ask(l.id, w)}>
              <Icon name="chat" className="size-4" /> {ASK_WHO[w]}
            </button>
          ))}
        </div>
        {mine.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1" aria-live="polite">
            {mine.map((r) => (
              <li key={r.who} className="rounded-xl bg-muted px-3 py-2 text-sm">
                {r.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Your decision on this line</legend>
        {DECISION_ORDER.map((d) => (
          <label key={d} className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="radio" name={`${ids}-d`} className="mt-1 size-5" checked={p.decision === d} onChange={() => pick(l.id, { decision: d })} />
            <span>
              <span className="font-semibold">{decisionLabel(d, b.phase)}. </span>
              <span className="text-sm">{DECISIONS[d].text}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Funding route</span>
        <select className={field} value={p.route ?? ""} onChange={(e) => pick(l.id, { route: e.target.value as Route })}>
          <option value="">Choose a route</option>
          {ROUTE_ORDER.map((r) => (
            <option key={r} value={r}>
              {ROUTES[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Why</span>
        <select className={field} value={p.reason} onChange={(e) => pick(l.id, { reason: e.target.value })}>
          <option value="">Choose the reason</option>
          {b.reasons.map((r) => (
            <option key={r.id} value={r.id}>
              {r.text}
            </option>
          ))}
        </select>
      </label>
      {OPEN_DECISIONS.includes(p.decision as FDecision) && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 font-semibold">What’s missing?</legend>
          {b.checks.map((c) => (
            <label key={c.id} className="flex min-h-11 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-5"
                checked={p.evidence.includes(c.id)}
                onChange={(e) => pick(l.id, { evidence: e.target.checked ? [...p.evidence, c.id] : p.evidence.filter((x) => x !== c.id) })}
              />
              <span>{c.text}</span>
            </label>
          ))}
          {!p.ask?.length && <p className="text-sm">Ask someone above, too: who can answer what’s missing?</p>}
        </fieldset>
      )}
      <div>
        <button type="button" className={secondary} onClick={onNext}>
          Next line
        </button>
      </div>
    </section>
  );
}

/** The evidence and the sources, each opened on purpose: what's opened is part of the record. */
function Drawers({ block: b, s, signal }: { block: XRayBlock; s: XRayState; signal: (name: "source_checked" | "source_issue_reported", ref: string) => void }) {
  const f = b.funding!;
  const opened = new Set(s.opened ?? []);
  const [flagged, setFlagged] = useState<string[]>([]);
  return (
    <>
      <section aria-label="Evidence" className={box}>
        <h4 className="font-semibold">Evidence</h4>
        <ul className="mt-1 flex flex-col gap-1">
          {f.evidence.map((e) => (
            <li key={e.id}>
              <details
                open={opened.has(e.id)}
                onToggle={(ev) => {
                  if ((ev.currentTarget as HTMLDetailsElement).open) signal("source_checked", e.id);
                }}
              >
                <summary className={summary}>
                  <Icon name="doc" className="size-4" /> {e.title}
                  <span className="sr-only">, {EVIDENCE_KINDS[e.kind]}</span>
                </summary>
                <p className="pb-2 text-sm">{e.text}</p>
              </details>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Sources" className={box}>
        <h4 className="font-semibold">Sources</h4>
        <ul className="mt-1 flex flex-col gap-1">
          {f.sources.map((x) => (
            <li key={x.id}>
              <details
                open={opened.has(x.id)}
                onToggle={(ev) => {
                  if ((ev.currentTarget as HTMLDetailsElement).open) signal("source_checked", x.id);
                }}
              >
                <summary className={summary}>
                  <Icon name="book" className="size-4" /> {x.title}
                </summary>
                <div className="pb-2 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    {SOURCE_KINDS[x.kind].public ? "Public programme source" : "Trilogy Care source"} · {SOURCE_KINDS[x.kind].label}
                  </p>
                  <p className="mt-1">{x.passage}</p>
                  <p className="mt-1 text-xs text-ink-muted">{sourceLine(x)}</p>
                  {x.url && (
                    <a className="mt-1 inline-flex min-h-11 items-center gap-1 underline" href={x.url} target="_blank" rel="noreferrer">
                      Open the source <Icon name="external" className="size-4" />
                    </a>
                  )}
                  <div>
                    <button
                      type="button"
                      className={cx(secondary, "mt-1 text-sm")}
                      disabled={flagged.includes(x.id)}
                      onClick={() => {
                        setFlagged((v) => [...v, x.id]);
                        signal("source_issue_reported", x.id);
                      }}
                    >
                      <Icon name="flag" className="size-4" /> {flagged.includes(x.id) ? "Flagged for its owner" : "This looks out of date or wrong"}
                    </button>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Explain it
// ---------------------------------------------------------------------------------------------

function Explain({
  block: b,
  s,
  change,
  draft,
  busy,
  preview,
  url,
  onFinish,
}: {
  block: XRayBlock;
  s: XRayState;
  change: Change;
  draft: Record<ScriptPart, string> | null;
  busy: boolean;
  preview: boolean;
  url: string;
  onFinish: () => void;
}) {
  const ids = useId();
  const f = b.funding!;
  const n = b.lines.findIndex((l) => l.id === b.explain.lineId);
  const l = b.lines[n];
  const [coach, setCoach] = useState<Coach | null>(s.coach ?? null);
  const [coaching, setCoaching] = useState(false);
  const [coachProblem, setCoachProblem] = useState("");
  const getCoach = async () => {
    setCoaching(true);
    setCoachProblem("");
    try {
      if (preview) setCoach({ source: "reviewed", points: reviewedCoach(b, s) });
      else setCoach(await api<Coach>(url, { body: { action: "coach", blockId: b.id, state: s } }));
    } catch (e) {
      setCoachProblem(errorText(e, "Feedback isn’t available right now. The reviewed model response is still there at the end."));
    } finally {
      setCoaching(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-serif text-xl font-semibold">Explain it to {b.participant.name}</h4>
      <p className={box}>{b.explain.ask}</p>
      {l && (
        <p className="text-sm">
          Line {n + 1}: {l.description}, {money(l.amountCents)}. Your decision: {statusOf(s.picks[l.id], b.phase)}.
        </p>
      )}
      <p>
        Say what you can confirm and what you can’t yet, why, and the next step, in your own words. If the rules don’t settle it, say you need to check and who
        will. This is rehearsal: nothing is sent to anyone.
      </p>
      {draft && (
        <div>
          <button type="button" className={secondary} onClick={() => change({ script: { ...draft }, usedDraft: true })}>
            Start from the reviewed draft
          </button>
        </div>
      )}
      {(["ack", "rule", "split", "next"] as ScriptPart[]).map((k) => (
        <label key={k} className="flex flex-col gap-1">
          <span className="font-semibold">{SCRIPT_LABELS[k]}</span>
          <textarea
            id={`${ids}-${k}`}
            className={cx(field, "min-h-20")}
            value={s.script[k]}
            maxLength={1200}
            onChange={(e) => {
              const v = e.target.value;
              change((p) => ({ script: { ...p.script, [k]: v } }));
            }}
          />
        </label>
      ))}
      <label className="flex flex-col gap-1">
        <span className="font-semibold">The source it rests on</span>
        <select className={field} value={s.cite ?? ""} onChange={(e) => change({ cite: e.target.value })}>
          <option value="">Choose a source</option>
          {f.sources.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}
              {x.version ? ` (${x.version})` : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} disabled={coaching} onClick={() => void getCoach()}>
          <Icon name="spark" className="size-4" /> {coaching ? "Reading it…" : "Feedback on the wording (optional)"}
        </button>
        <button type="button" className={primary} disabled={busy} onClick={onFinish}>
          Finish and see the debrief
        </button>
      </div>
      {coachProblem && (
        <p role="alert" className={warn}>
          {coachProblem}
        </p>
      )}
      {coach && <CoachPanel coach={coach} />}
    </div>
  );
}

function CoachPanel({ coach }: { coach: Coach }) {
  return (
    <section aria-label="Feedback on the wording" className={box} aria-live="polite">
      <h5 className="font-semibold">{coach.source === "ai" ? "Coaching, checked against the approved facts" : "Reviewed feedback"}</h5>
      {coach.fallback && <p className="mt-1 text-sm">{coach.fallback}</p>}
      <ul className="mt-2 flex flex-col gap-2">
        {coach.points.map((p) => (
          <li key={p.text}>
            <span className="font-semibold">{p.kind === "strength" ? "Working well: " : "Try: "}</span>
            {p.text}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-muted">
        Feedback on clarity and respect only. It can’t change the decision, add a rule or cite a source the case doesn’t rest on.
        {coach.verdict ? ` The decision stays: ${DECISIONS[coach.verdict as FDecision]?.label ?? coach.verdict}.` : ""}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// The debrief
// ---------------------------------------------------------------------------------------------

function Debrief({
  block: b,
  d,
  s,
  change,
  preview,
  url,
  guideId,
  onAgain,
}: {
  block: XRayBlock;
  d: FundingDebrief;
  s: XRayState;
  change: Change;
  preview: boolean;
  url: string;
  guideId: string;
  onAgain: () => void;
}) {
  const seen = useRef(false);
  useEffect(() => {
    // Seeing the debrief completes the activity: once, on the server.
    if (preview || seen.current) return;
    seen.current = true;
    api(url, { body: { action: "viewed", blockId: b.id } }).catch(() => undefined);
  }, [preview, url, b.id]);
  const phase = b.phase;
  const tw = d.twist;
  const twLine = tw ? d.lines.find((l) => l.id === tw.lineId) : null;
  const mine = (s.twist?.decision ?? "") as FDecision | "";
  const [checked, setChecked] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <h4 className="font-serif text-xl font-semibold">Debrief</h4>
      {d.mode === "assessed" && (
        <p className={d.passed ? good : warn}>
          <span className="font-semibold">{d.passed ? "Passed. " : "Not passed this time. "}</span>
          {d.passed
            ? "Asking for what was missing and keeping the document pending counted, as it should."
            : "A critical error, a line, the overall result or the source wasn’t right. Try again: you’ll see the same rules."}
        </p>
      )}
      <section aria-label="How it went">
        <h5 className="font-semibold">How it went</h5>
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {d.dims.map((x) => (
            <li key={x.id} className={box}>
              <p>
                <span className="font-semibold">{x.label}: </span>
                {x.rating}
              </p>
              {x.notes.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {x.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <p className={d.overall.right ? good : warn}>
        <span className="font-semibold">Overall: </span>
        {d.overall.chosen ? `you said “${OVERALL[d.overall.chosen].label}”. ` : ""}
        {d.overall.right ? "" : `The reviewed result: “${d.overall.reviewed ? OVERALL[d.overall.reviewed].label : ""}”. `}
        {d.overall.pendingWarranted && "A decisive fact is still missing, so pending clarification is the good decision here, with a named next step."}
      </p>
      {d.next.chosen && (
        <p className={d.next.chosen.right ? good : warn}>
          <span className="font-semibold">What happens now: </span>
          {d.next.chosen.text}. {d.next.chosen.why}
          {!d.next.chosen.right && d.next.right ? ` The reviewed answer: ${d.next.right.text}.` : ""}
        </p>
      )}

      <section aria-label="Line by line">
        <h5 className="font-semibold">The document, line by line</h5>
        <ol className="mt-2 flex flex-col gap-3">
          {d.lines.map((l) => (
            <li key={l.id} className={box}>
              <p className="font-semibold">
                {l.n}. {l.description}, {money(l.amountCents)}
                {l.itemType ? <span className="font-normal"> ({l.itemType})</span> : null}
              </p>
              <p className="mt-1">
                <span className="font-semibold">{l.result.decisionRight ? "Matches: " : "Reviewed decision: "}</span>
                {decisionLabel(l.reviewed.decision, phase)}
                {l.reviewed.alsoAccepted.length ? ` (also accepted: ${l.reviewed.alsoAccepted.map((x) => decisionLabel(x, phase)).join(", ")})` : ""}.
                {l.theirs.decision && l.theirs.decision !== l.reviewed.decision ? ` You said: ${decisionLabel(l.theirs.decision, phase)}.` : ""}
              </p>
              <p className="mt-1 text-sm">
                <span className="font-semibold">Route: </span>
                {l.reviewed.route ? ROUTES[l.reviewed.route] : "None"}
                {!l.result.routeRight && l.theirs.route ? ` (you chose: ${ROUTES[l.theirs.route]})` : ""}.{" "}
                <span className="font-semibold">Price context: </span>
                {l.priceContext.label}. {l.priceContext.rule}
              </p>
              <p className="mt-1 text-sm">
                <span className="font-semibold">Reason: </span>
                {l.reviewed.reasons.join("; ")}
                {!l.result.reasonRight && l.theirs.reason ? ` (you chose: ${l.theirs.reason})` : ""}
              </p>
              {l.reviewed.missing.length > 0 && (
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Missing: </span>
                  {l.reviewed.missing.join("; ")}. <span className="font-semibold">Ask: </span>
                  {l.reviewed.askWho.map((w) => ASK_WHO[w]).join(", ")}
                  {l.result.missingRight === false ? `. You named: ${l.theirs.missing.join("; ") || "nothing"}` : ""}
                </p>
              )}
              {l.whyWrong.map((w) => (
                <p key={w.code} className={cx(warn, "mt-2 p-3 text-sm")}>
                  <span className="font-semibold">{w.label}: </span>
                  {w.why}
                </p>
              ))}
              <p className="mt-2">{l.feedback}</p>
              {l.consequence && (
                <p className="mt-1 text-sm">
                  <span className="font-semibold">If it’s got wrong: </span>
                  {l.consequence}
                </p>
              )}
              {l.changes && (
                <p className="mt-1 text-sm">
                  <span className="font-semibold">What changes the answer? </span>
                  {l.changes}
                </p>
              )}
              {l.components.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {l.components.map((c) => (
                    <li key={c.label}>
                      <span className="font-semibold">
                        {c.label}, {money(c.amountCents)}: {c.clinical === true ? "clinical" : c.clinical === false ? "cosmetic" : "neither"}.{" "}
                      </span>
                      {c.note}
                    </li>
                  ))}
                </ul>
              )}
              <details className="mt-2">
                <summary className={summary}>Behind the label: the checks{l.confidence === "needs_review" ? " (needs owner review)" : ""}</summary>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[18rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-line">
                        <th scope="col" className="py-1 pr-2">
                          Check
                        </th>
                        <th scope="col" className="py-1 pr-2">
                          State
                        </th>
                        <th scope="col" className="py-1">
                          Why, and who
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {l.axes.map((a) => (
                        <tr key={a.axis} className="border-b border-line align-top">
                          <th scope="row" className="py-1 pr-2 font-semibold">
                            {a.label}
                          </th>
                          <td className="py-1 pr-2">{a.stateLabel}</td>
                          <td className="py-1">
                            {a.note}
                            {a.owner ? ` (${a.owner})` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {l.sources.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-xs text-ink-muted">
                    {l.sources.map((x) => (
                      <li key={x.id}>{sourceLine(x)}</li>
                    ))}
                  </ul>
                )}
              </details>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Your explanation">
        <h5 className="font-semibold">Your explanation, and the reviewed one</h5>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <div className={box}>
            <p className="font-semibold">Yours</p>
            {(["ack", "rule", "split", "next"] as ScriptPart[])
              .filter((k) => d.explain.script[k].trim())
              .map((k) => (
                <p key={k} className="mt-1">
                  {d.explain.script[k]}
                </p>
              ))}
            <p className="mt-2 text-sm">
              <span className="font-semibold">Source: </span>
              {d.explain.cite ? sourceLine(d.explain.cite) : "none"}. {d.explain.citeValid ? "It supports this line." : "It doesn’t support this line."}
            </p>
          </div>
          <div className={box}>
            <p className="font-semibold">Reviewed model response</p>
            <dl className="mt-1 flex flex-col gap-1">
              {OUTPUT_ORDER.filter((k) => d.explain.model[k].trim()).map((k) => (
                <div key={k}>
                  <dt className="text-xs font-semibold uppercase tracking-wide">{OUTPUT_PARTS[k]}</dt>
                  <dd>{d.explain.model[k]}</dd>
                </div>
              ))}
            </dl>
            {d.explain.modelSource && <p className="mt-2 text-xs text-ink-muted">Rests on: {sourceLine(d.explain.modelSource)}</p>}
          </div>
        </div>
        <ul className="mt-2 flex flex-col gap-1">
          {d.explain.check.covered.map((c) => (
            <li key={c.id}>
              <span className="font-semibold">{c.met ? "Covered: " : "Not covered: "}</span>
              {c.label}
            </li>
          ))}
        </ul>
        {d.explain.alternative && (
          <p className="mt-2">
            <span className="font-semibold">Another respectful way to say it: </span>
            {d.explain.alternative}
          </p>
        )}
        {d.explain.complaints && (
          <p className="mt-2 text-sm">
            <span className="font-semibold">If they’re still unhappy: </span>
            {d.explain.complaints}
          </p>
        )}
      </section>

      {tw && twLine && (
        <section aria-label="One fact changes" className={box}>
          <h5 className="font-semibold">One fact changes</h5>
          <p className="mt-1">{tw.fact}</p>
          <fieldset className="mt-2 flex flex-col gap-1">
            <legend className="text-sm">
              Line {twLine.n}: {twLine.description}. What is it now?
            </legend>
            {DECISION_ORDER.map((x) => (
              <label key={x} className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name={`${b.id}-twist`}
                  className="size-5"
                  checked={mine === x}
                  onChange={() => {
                    setChecked(false);
                    change({ twist: { outcome: "", account: "", decision: x } });
                  }}
                />
                {decisionLabel(x, phase)}
              </label>
            ))}
          </fieldset>
          <div className="mt-2">
            <button type="button" className={secondary} disabled={!mine} onClick={() => setChecked(true)}>
              Check
            </button>
          </div>
          {checked && (
            <p className={cx(mine === tw.decision ? good : warn, "mt-2")} aria-live="polite">
              {mine === tw.decision ? "Yes. " : `Not quite: ${decisionLabel(tw.decision, phase)}. `}
              {tw.why}
            </p>
          )}
        </section>
      )}

      {d.jobAid.snippetId && <AidSection snippetId={d.jobAid.snippetId} why={d.jobAid.why} preview={preview} place={`magazine:${guideId}`} />}
      <p className="text-xs text-ink-muted">
        Scenario {d.versions.scenario || "unversioned"} · rules {d.versions.ruleSet || "unversioned"} · sources {d.versions.sources.join(", ")}. Practice
        evidence only: it isn’t an approval, a payment or proof a real invoice was right.
      </p>
      <div>
        <button type="button" className={secondary} onClick={onAgain}>
          Start again
        </button>
      </div>
    </div>
  );
}
