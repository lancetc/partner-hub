"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { XRayBlock } from "@/lib/magazine";
import {
  ACCOUNTS,
  blankPick,
  buildDebrief,
  emptyState,
  finishProblems,
  isEligible,
  money,
  OUTCOME_ORDER,
  OUTCOMES,
  PHASES,
  QUOTE_NOTE,
  RATE_TBC,
  RECEIPT_NOTE,
  SCRIPT_PARTS,
  scoreXRay,
  splitOf,
  submitLines,
  XRAY_NOTICE,
  type FundingAccount,
  type LineOutcome,
  type LinePick,
  type ScriptPart,
  type Split,
  type XRayDebrief,
  type XRayState,
} from "@/lib/xray";
import type { xrayState } from "@/server/xray";
import { Icon } from "../Icon";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  Invoice X-Ray (docs/invoice-xray.md). The document's lines are buttons, so the document is also the list:
  click, tap or tab to a line and sort it in the sheet beside it. The split updates as lines are sorted, and is
  announced as one short sentence. Every amount says whether it's an estimate. Nothing is timed.

  In the editor's preview it runs against the block as written and stores nothing.
*/

type Loaded = ReturnType<typeof xrayState>;
type Critical = { lineId: string | null; text: string }[];
type Change = (patch: Partial<XRayState> | ((prev: XRayState) => Partial<XRayState>)) => void;
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-base";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const good = "rounded-2xl bg-[#e3f4ea] p-4 text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const errorText = (e: unknown, d: string) => (e instanceof Error ? e.message : d);
const showDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`))
    : "";

export function InvoiceXRay({ block: b, ctx }: { block: XRayBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/xray`;
  const loaded = useApi<Loaded>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<XRayState | null>(ctx.preview ? emptyState() : null);
  const [draft, setDraft] = useState<Record<ScriptPart, string> | null>(null);
  const [debrief, setDebrief] = useState<XRayDebrief | null>(null);
  const [critical, setCritical] = useState<Critical>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const top = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLHeadingElement>(null);
  const dirty = useRef(false);

  if (!ctx.preview && loaded.data && s === null) {
    setS(loaded.data.state);
    setDraft(loaded.data.draft);
    setDebrief(loaded.data.debrief);
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
      <Shell title={b.title}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  if (!s)
    return (
      <Shell title={b.title}>
        <p className="text-ink-muted">Loading…</p>
      </Shell>
    );

  const change: Change = (patch) => {
    dirty.current = true;
    setS((prev) => (prev ? { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) } : prev));
  };
  const pick = (id: string, p: Partial<LinePick>) =>
    change((prev) => {
      const cur = { ...blankPick(), ...prev.picks[id], ...p };
      // Each outcome asks for its own detail; the rest is cleared, so nothing stale is submitted.
      if (!isEligible(cur.outcome)) cur.account = "";
      if (cur.outcome !== "needs_review") cur.evidence = [];
      return { picks: { ...prev.picks, [id]: cur } };
    });
  const focusTop = () => requestAnimationFrame(() => top.current?.focus());
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
        setDebrief(buildDebrief(b, s, scoreXRay(b, s)));
      } else {
        const out = await api<Loaded>(url, { body: { action: "finish", blockId: b.id, state: s } });
        dirty.current = false;
        setS(out.state);
        setDebrief(out.debrief);
        ctx.activity(b.id, { outcome: "finished" });
        ctx.engaged(b.id);
      }
      focusTop();
    });
  const again = () =>
    run(async () => {
      setDebrief(null);
      setCritical([]);
      setDraft(null);
      setSelected(0);
      if (ctx.preview) setS(emptyState());
      else setS((await api<Loaded>(url, { body: { action: "restart", blockId: b.id } })).state);
      focusTop();
    });

  const split = splitOf(b, Object.fromEntries(b.lines.map((l) => [l.id, s.picks[l.id]?.outcome ?? ""])));

  return (
    <Shell title={b.title}>
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{XRAY_NOTICE}</p>
      {b.intro && <p className="mt-3 text-lg">{b.intro}</p>}
      <Context block={b} />
      <div ref={top} tabIndex={-1} className="mt-5 outline-none" />
      {problem && (
        <p role="alert" className={cx(warn, "mb-3")}>
          {problem}
        </p>
      )}

      {debrief ? (
        <Debrief block={b} d={debrief} s={s} change={change} onAgain={() => void again()} />
      ) : s.stage === 0 ? (
        <>
          <h4 className="font-serif text-xl font-semibold">Sort every line</h4>
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
          <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="flex flex-col gap-4">
              <Document
                block={b}
                s={s}
                selected={selected}
                onSelect={(i) => {
                  setSelected(i);
                  requestAnimationFrame(() => sheet.current?.focus());
                }}
              />
              <Sheet block={b} s={s} i={selected} pick={pick} headingRef={sheet} onNext={() => setSelected((selected + 1) % b.lines.length)} />
            </div>
            <div className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
              <SplitPanel block={b} split={split} />
              <fieldset className={cx(box, "flex flex-col gap-2")}>
                <legend className="px-1 font-semibold">{b.next.prompt}</legend>
                {b.next.options.map((o) => (
                  <label key={o.id} className="flex min-h-11 cursor-pointer items-start gap-3">
                    <input type="radio" name={`${b.id}-next`} className="mt-1 size-5" checked={s.next === o.id} onChange={() => change({ next: o.id })} />
                    <span>{o.text}</span>
                  </label>
                ))}
              </fieldset>
              <button type="button" className={primary} disabled={busy} onClick={() => void submit()}>
                Submit the lines
              </button>
            </div>
          </div>
        </>
      ) : (
        <Explain block={b} s={s} change={change} draft={draft} busy={busy} onFinish={() => void finish()} />
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={`Invoice X-Ray: ${title}`} className="w-full rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="search" className="size-5" /> Invoice X-Ray · training case
      </p>
      <h3 className="font-serif text-2xl font-semibold">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function Context({ block: b }: { block: XRayBlock }) {
  return (
    <article aria-label="What you’re checking against" className={cx(box, "mt-4")}>
      <h4 className="font-semibold">
        {b.participant.name}
        {b.participant.about ? `: ${b.participant.about}` : ""}
      </h4>
      <ul className="mt-2 list-disc pl-6 text-sm">
        {b.facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold">Document</dt>
        <dd>
          {PHASES[b.phase]}, dated {showDate(b.docDate)}
        </dd>
        <dt className="font-semibold">Deciding on</dt>
        <dd>{showDate(b.decisionDate)}</dd>
        <dt className="font-semibold">Contribution rate</dt>
        <dd>{b.rate.basisPoints === null ? `${RATE_TBC}` : `${b.rate.basisPoints / 100}%${b.rate.category ? `, ${b.rate.category}` : ""}`}</dd>
      </dl>
      <p className="mt-3 text-sm font-semibold">{b.phase === "quote" ? QUOTE_NOTE : RECEIPT_NOTE}</p>
    </article>
  );
}

/** The document itself. Each line is a button, so the document is also the accessible list of lines. */
function Document({ block: b, s, selected, onSelect }: { block: XRayBlock; s: XRayState; selected: number; onSelect: (i: number) => void }) {
  const total = b.lines.reduce((n, l) => n + l.amountCents, 0);
  return (
    <article
      aria-label={`${PHASES[b.phase]} from ${b.supplier}`}
      className="rounded-xl bg-[#fffdf7] p-4 text-[#1d1d1b] shadow-sm ring-1 ring-line sm:p-6 dark:bg-[#f4f1e8]"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-dashed border-[#bdb6a3] pb-3">
        <div>
          <p className="font-serif text-lg font-semibold">{b.supplier}</p>
          <p className="text-sm">Prepared for {b.participant.name}</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-mulish text-base font-extrabold uppercase tracking-[0.14em]">{b.phase === "quote" ? "Quote" : "Tax invoice / receipt"}</p>
          <p>
            {b.docNumber} · {showDate(b.docDate)}
          </p>
          {b.phase === "quote" && <p className="font-semibold">Estimate only: not paid, not claimable</p>}
        </div>
      </header>
      <ol className="mt-2 flex flex-col">
        {b.lines.map((l, i) => {
          const o = s.picks[l.id]?.outcome ?? "";
          return (
            <li key={l.id}>
              <button
                type="button"
                aria-pressed={selected === i}
                onClick={() => onSelect(i)}
                className={cx(
                  "grid min-h-11 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-[#f1ead6] focus-visible:outline-2 focus-visible:outline-[#1d1d1b]",
                  selected === i && "bg-[#f1ead6] outline-2 outline-[#1d1d1b]",
                )}
              >
                <span className="font-semibold">{i + 1}</span>
                <span>
                  <span className="block">{l.description}</span>
                  {l.detail && <span className="block text-sm text-[#5b574c]">{l.detail}</span>}
                  <span className="mt-1 inline-block rounded-full bg-[#e9e2cc] px-2 py-0.5 text-xs font-semibold">
                    {o ? OUTCOMES[o].label : "Not sorted yet"}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{money(l.amountCents)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 flex justify-between border-t border-dashed border-[#bdb6a3] pt-3 font-semibold">
        <span>Total (incl. GST)</span>
        <span className="tabular-nums">{money(total)}</span>
      </p>
    </article>
  );
}

function Sheet({
  block: b,
  s,
  i,
  pick,
  headingRef,
  onNext,
}: {
  block: XRayBlock;
  s: XRayState;
  i: number;
  pick: (id: string, p: Partial<LinePick>) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onNext: () => void;
}) {
  const ids = useId();
  const l = b.lines[i];
  if (!l) return null;
  const p = s.picks[l.id] ?? blankPick();
  return (
    <section aria-labelledby={`${ids}-h`} className={cx(box, "flex flex-col gap-3")}>
      <h5 id={`${ids}-h`} ref={headingRef} tabIndex={-1} className="font-serif text-lg font-semibold outline-none">
        Line {i + 1}: {l.description}, {money(l.amountCents)}
      </h5>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">What is this line, for {b.participant.name}?</legend>
        {OUTCOME_ORDER.map((o) => (
          <label key={o} className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="radio" name={`${ids}-o`} className="mt-1 size-5" checked={p.outcome === o} onChange={() => pick(l.id, { outcome: o })} />
            <span>
              <span className="font-semibold">{OUTCOMES[o].label}. </span>
              <span className="text-sm">{OUTCOMES[o].text}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {isEligible(p.outcome) && (
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Funded from</span>
          <select className={field} value={p.account} onChange={(e) => pick(l.id, { account: e.target.value as FundingAccount })}>
            <option value="">Choose an account</option>
            {(Object.keys(ACCOUNTS) as FundingAccount[])
              .filter((a) => a !== "none")
              .map((a) => (
                <option key={a} value={a}>
                  {ACCOUNTS[a]}
                </option>
              ))}
          </select>
        </label>
      )}
      {p.outcome && (
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
      )}
      {p.outcome === "needs_review" && (
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

function SplitPanel({ block: b, split, title = "The split" }: { block: XRayBlock; split: Split; title?: string }) {
  const est = b.phase === "quote" ? "indicative" : "if confirmed";
  const rows: [string, string][] = [
    [`Eligible (${est})`, money(split.eligible)],
    [`Government subsidy (${est})`, split.subsidy === null ? RATE_TBC : money(split.subsidy)],
    [`Participant contribution (${est})`, split.contribution === null ? RATE_TBC : money(split.contribution)],
    ["Private, if they choose it", money(split.private)],
    ["Pending review", money(split.pending)],
  ];
  if (split.unsorted) rows.push(["Not sorted yet", money(split.unsorted)]);
  const summary = `Eligible ${rows[0][1]}, private ${money(split.private)}, pending ${money(split.pending)}${split.unsorted ? `, ${money(split.unsorted)} not sorted yet` : ""}.`;
  return (
    <details open className={box}>
      <summary className="min-h-11 cursor-pointer py-1 font-semibold">{title}</summary>
      <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>{k}</dt>
            <dd className="text-right font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
        <dt className="border-t border-line pt-1 font-semibold">Total on the document</dt>
        <dd className="border-t border-line pt-1 text-right font-semibold tabular-nums">{money(split.total)}</dd>
      </dl>
      <p className="mt-2 text-xs text-ink-muted">
        Worked out from the line prices and this case’s stated rate.{" "}
        {b.phase === "quote" ? "Estimates, not claims or payment promises." : "Nothing is claimed until the evidence is checked."}
      </p>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>
    </details>
  );
}

function Explain({
  block: b,
  s,
  change,
  draft,
  busy,
  onFinish,
}: {
  block: XRayBlock;
  s: XRayState;
  change: Change;
  draft: Record<ScriptPart, string> | null;
  busy: boolean;
  onFinish: () => void;
}) {
  const ids = useId();
  const n = b.lines.findIndex((l) => l.id === b.explain.lineId);
  const l = b.lines[n];
  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-serif text-xl font-semibold">Explain it to the family</h4>
      <p className={box}>{b.explain.ask}</p>
      {l && (
        <p className="text-sm">
          Line {n + 1}: {l.description}, {money(l.amountCents)}.
        </p>
      )}
      <p>
        Write it in four parts, in your own words. You can start from a reviewed draft and change it. Nothing is sent: for a real participant, check the actual
        plan, scope and current rules first.
      </p>
      {draft && (
        <div>
          <button type="button" className={secondary} onClick={() => change({ script: { ...draft }, usedDraft: true })}>
            Start from the reviewed draft
          </button>
        </div>
      )}
      {(Object.keys(SCRIPT_PARTS) as ScriptPart[]).map((k) => (
        <label key={k} className="flex flex-col gap-1">
          <span className="font-semibold">{SCRIPT_PARTS[k]}</span>
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
      <div>
        <button type="button" className={primary} disabled={busy} onClick={onFinish}>
          Finish and see the debrief
        </button>
      </div>
    </div>
  );
}

function Debrief({ block: b, d, s, change, onAgain }: { block: XRayBlock; d: XRayDebrief; s: XRayState; change: Change; onAgain: () => void }) {
  const tw = d.twist;
  const mine = s.twist ?? { outcome: "" as LineOutcome | "", account: "" as FundingAccount | "" };
  const [checked, setChecked] = useState(false);
  const twistLine = tw ? d.lines.find((l) => l.id === tw.lineId) : null;
  const twistRight = tw && mine.outcome === tw.outcome && (!isEligible(tw.outcome) || mine.account === tw.account);
  return (
    <div className="flex flex-col gap-4">
      <h4 className="font-serif text-xl font-semibold">Debrief</h4>
      <section aria-label="How it read">
        <h5 className="font-semibold">How it read</h5>
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

      <section aria-label="Line by line">
        <h5 className="font-semibold">The document, line by line</h5>
        <ol className="mt-2 flex flex-col gap-2">
          {d.lines.map((l) => (
            <li key={l.id} className={box}>
              <p className="font-semibold">
                {l.n}. {l.description}, {money(l.amountCents)}
              </p>
              <p className="mt-1">
                <span className="font-semibold">{l.result.outcomeRight ? "Matches: " : "Reviewed answer: "}</span>
                {OUTCOMES[l.reviewed.outcome].label}
                {isEligible(l.reviewed.outcome) ? `, from ${ACCOUNTS[l.reviewed.account]}` : ""}.
                {!l.result.outcomeRight && l.theirs.outcome ? ` You said: ${OUTCOMES[l.theirs.outcome].label}.` : ""}
                {l.result.accountRight === false && l.theirs.account ? ` You chose ${ACCOUNTS[l.theirs.account]}.` : ""}
              </p>
              <p className="mt-1 text-sm">
                <span className="font-semibold">Reason: </span>
                {l.reviewed.reasons.join("; ")}
                {!l.result.reasonRight && l.theirs.reason ? ` (you chose: ${l.theirs.reason})` : ""}
              </p>
              {l.reviewed.evidence.length > 0 && (
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Missing: </span>
                  {l.reviewed.evidence.join("; ")}
                  {l.result.evidenceRight === false ? ` (you named: ${l.theirs.evidence.join("; ") || "nothing"})` : ""}
                </p>
              )}
              <p className="mt-2">{l.feedback}</p>
              {l.changes && (
                <p className="mt-1 text-sm">
                  <span className="font-semibold">What changes the answer? </span>
                  {l.changes}
                </p>
              )}
              <p className="mt-1 text-xs text-ink-muted">Rests on: {[l.source.rule, l.source.fact, l.source.procedure].filter(Boolean).join(" · ")}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <SplitPanel block={b} split={d.split.theirs} title="Your split" />
        <SplitPanel block={b} split={d.split.reviewed} title="The reviewed split" />
      </div>
      {d.next.chosen && (
        <p className={d.next.chosen.right ? good : warn}>
          <span className="font-semibold">What happens now: </span>
          {d.next.chosen.text}. {d.next.chosen.why}
          {!d.next.chosen.right && d.next.right ? ` The reviewed answer: ${d.next.right.text}.` : ""}
        </p>
      )}

      <section aria-label="Your explanation">
        <h5 className="font-semibold">Your explanation</h5>
        <div className={cx(box, "mt-2 flex flex-col gap-1")}>
          {(Object.keys(SCRIPT_PARTS) as ScriptPart[]).map((k) => (
            <p key={k}>{d.explain.script[k]}</p>
          ))}
        </div>
        <ul className="mt-2 flex flex-col gap-1">
          {d.explain.check.covered.map((c) => (
            <li key={c.id}>
              <span className="font-semibold">{c.met ? "Covered: " : "Not covered: "}</span>
              {c.label}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          <span className="font-semibold">The reviewed script: </span>
          {d.explain.model}
        </p>
      </section>

      {tw && twistLine && (
        <section aria-label="One fact changes" className={box}>
          <h5 className="font-semibold">One fact changes</h5>
          <p className="mt-1">{tw.fact}</p>
          <p className="mt-1 text-sm">
            Line {twistLine.n}: {twistLine.description}. What is it now?
          </p>
          <fieldset className="mt-2 flex flex-col gap-1">
            <legend className="sr-only">What is line {twistLine.n} now?</legend>
            {OUTCOME_ORDER.map((o) => (
              <label key={o} className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name={`${b.id}-twist`}
                  className="size-5"
                  checked={mine.outcome === o}
                  onChange={() => {
                    setChecked(false);
                    change({ twist: { outcome: o, account: isEligible(o) ? mine.account : "" } });
                  }}
                />
                {OUTCOMES[o].label}
              </label>
            ))}
          </fieldset>
          {isEligible(mine.outcome) && (
            <label className="mt-2 flex flex-col gap-1">
              <span className="font-semibold">Funded from</span>
              <select
                className={field}
                value={mine.account}
                onChange={(e) => {
                  setChecked(false);
                  change({ twist: { outcome: mine.outcome, account: e.target.value as FundingAccount } });
                }}
              >
                <option value="">Choose an account</option>
                {(Object.keys(ACCOUNTS) as FundingAccount[])
                  .filter((a) => a !== "none")
                  .map((a) => (
                    <option key={a} value={a}>
                      {ACCOUNTS[a]}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div className="mt-2">
            <button type="button" className={secondary} disabled={!mine.outcome} onClick={() => setChecked(true)}>
              Check
            </button>
          </div>
          {checked && (
            <p className={cx(twistRight ? good : warn, "mt-2")} aria-live="polite">
              {twistRight ? "Yes. " : `Not quite: ${OUTCOMES[tw.outcome].label}${isEligible(tw.outcome) ? `, from ${ACCOUNTS[tw.account]}` : ""}. `}
              {tw.why}
            </p>
          )}
        </section>
      )}

      {(d.source.title || d.source.version) && (
        <p className="text-sm text-ink-muted">
          Checked against: {d.source.title}
          {d.source.version ? `, ${d.source.version}` : ""}.
        </p>
      )}
      <div>
        <button type="button" className={secondary} onClick={onAgain}>
          Start again
        </button>
      </div>
    </div>
  );
}
