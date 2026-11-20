"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { useHydrated } from "@/lib/store";
import type { BenchmarkBlock } from "@/lib/magazine";
import {
  aggregate,
  benchmarkStale,
  CONFIDENCE,
  KINDS,
  NOT_A_SURVEY,
  PAUSED,
  peerReasoning,
  POLL_NOTICE,
  readChoice,
  RESULTS_EMPTY,
  sampleVotes,
  SIMS,
  SUPPRESSED,
  versionKey,
  type BenchmarkBlockData,
  type ChoiceReading,
  type Confidence,
  type Results,
  type Sim,
} from "@/lib/benchmark";
import { members, posts } from "@/content/community";
import type { benchmarkResults, benchmarkState } from "@/server/benchmark";
import { Icon } from "../Icon";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  Peer benchmark poll (docs/peer-benchmark-poll.md). The case, then one choice (with optional confidence and a
  sentence of reasoning), then "Lock in my decision". Only then: how peers chose (text tabs for each group, counts
  and percentages in words as well as bars, n and "as of"), the reviewed perspective beside it, peer reasoning
  from the Community, and a private reflection. Bars are one neutral colour; the learner's own choice is marked
  in words. Nothing animates.

  An unsent choice is kept in this browser until it's locked. In the editor's preview nothing is stored, and an
  author can simulate the empty, small-cohort, sample, offline and stale states.
*/

type Loaded = ReturnType<typeof benchmarkState>;
type ResultsLoaded = ReturnType<typeof benchmarkResults>;
type Draft = { choice: string; confidence: Confidence | ""; reason: string };
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const errorText = (e: unknown, d: string) => (e instanceof Error ? e.message : d);
const blank = (): Draft => ({ choice: "", confidence: "", reason: "" });
const when = (iso: string) =>
  iso
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }).format(
        new Date(iso),
      )
    : "";

/** The unsent choice, kept in this browser only. Any failure just means it isn't kept. */
function useDraft(key: string) {
  const read = (): Draft => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? { ...blank(), ...JSON.parse(raw) } : blank();
    } catch {
      return blank();
    }
  };
  const write = (d: Draft | null) => {
    try {
      if (d) window.localStorage.setItem(key, JSON.stringify(d));
      else window.localStorage.removeItem(key);
    } catch {
      /* not kept */
    }
  };
  return { read, write };
}

export function PeerPoll({ block: b, ctx }: { block: BenchmarkBlock; ctx: InteractiveContext }) {
  const hydrated = useHydrated();
  const url = `/api/magazine/${ctx.guideId}/benchmark`;
  const vk = versionKey(b);
  const store = useDraft(`peer-poll:${ctx.guideId}:${b.id}:${vk}`);
  const loaded = useApi<Loaded>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [state, setState] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [results, setResults] = useState<{ status: "loading" | "ready" | "offline" | "paused"; data: Results | null; batch: number }>({
    status: "loading",
    data: null,
    batch: b.batchMinutes,
  });
  const [sim, setSim] = useState<Sim>("enough");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const top = useRef<HTMLHeadingElement>(null);

  if (hydrated && draft === null) setDraft(ctx.preview ? blank() : store.read());
  if (ctx.preview && state === null) setState(previewState(b, null, sim));
  if (!ctx.preview && loaded.data && state === null) setState(loaded.data);

  // Once locked, fetch the latest batch of results. In the preview, the simulated state stands in.
  const lockedChoice = state?.locked?.choice ?? "";
  useEffect(() => {
    if (ctx.preview || !lockedChoice) return;
    let live = true;
    api<ResultsLoaded>(`${url}?block=${b.id}&results=1`)
      .then((r) => live && setResults({ status: r.paused ? "paused" : "ready", data: r.results, batch: r.batchMinutes }))
      .catch(() => live && setResults((x) => ({ ...x, status: "offline" })));
    return () => {
      live = false;
    };
  }, [ctx.preview, lockedChoice, url, b.id]);

  const shownResults = ctx.preview
    ? sim === "offline"
      ? { status: "offline" as const, data: null, batch: b.batchMinutes }
      : sim === "stale"
        ? { status: "paused" as const, data: null, batch: b.batchMinutes }
        : { status: "ready" as const, data: aggregate(b, sampleVotes(b, sim), new Date().toISOString()), batch: b.batchMinutes }
    : results;

  if (!ctx.preview && loaded.error)
    return (
      <Shell title={b.title}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  if (!state || !draft)
    return (
      <Shell title={b.title}>
        <p className="text-ink-muted">Loading…</p>
      </Shell>
    );

  const change = (d: Draft) => {
    setDraft(d);
    if (!ctx.preview) store.write(d);
  };
  const lock = () =>
    void (async () => {
      if (busy || !draft.choice) return;
      setBusy(true);
      setProblem(null);
      try {
        if (ctx.preview) setState(previewState(b, { ...draft, reflection: "", lockedAt: new Date().toISOString() }, sim));
        else {
          const out = await api<Loaded & { already: boolean }>(url, { body: { action: "lock", blockId: b.id, ...draft } });
          setState(out);
          store.write(null);
          ctx.activity(b.id, { outcome: "locked" });
          ctx.engaged(b.id);
        }
        requestAnimationFrame(() => top.current?.focus());
      } catch (e) {
        setProblem(errorText(e, "That didn’t send. Your choice is still here: try again."));
      } finally {
        setBusy(false);
      }
    })();
  const retryResults = () => {
    setResults((x) => ({ ...x, status: "loading" }));
    api<ResultsLoaded>(`${url}?block=${b.id}&results=1`)
      .then((r) => setResults({ status: r.paused ? "paused" : "ready", data: r.results, batch: r.batchMinutes }))
      .catch(() => setResults((x) => ({ ...x, status: "offline" })));
  };

  return (
    <Shell title={b.title}>
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{POLL_NOTICE}</p>
      {b.intro && <p className="mt-3 text-lg">{b.intro}</p>}
      {ctx.preview && (
        <label className="mt-3 flex flex-col gap-1 rounded-2xl bg-muted p-3 text-sm">
          <span className="font-semibold">Preview as (nothing is stored)</span>
          <select
            className="min-h-11 rounded-xl border border-line-strong bg-bg px-3"
            value={sim}
            onChange={(e) => {
              const next = e.target.value as Sim;
              setSim(next);
              setState((s) => previewState(b, s?.locked ?? null, next));
            }}
          >
            {(Object.keys(SIMS) as Sim[]).map((k) => (
              <option key={k} value={k}>
                {SIMS[k]}
              </option>
            ))}
          </select>
        </label>
      )}

      <Scenario b={b} />

      {problem && (
        <p role="alert" className={cx(warn, "mt-3")}>
          {problem}
        </p>
      )}

      {!state.locked ? (
        <Choose b={b} draft={draft} change={change} busy={busy} onLock={lock} />
      ) : (
        <div className="mt-5 flex flex-col gap-4">
          <h4 ref={top} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
            Your decision is locked in
          </h4>
          <YourDecision b={b} locked={state.locked} />
          {state.paused ? (
            <p className={warn}>{PAUSED}</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <PeerResults b={b} r={shownResults} mine={state.locked.choice} preview={Boolean(ctx.preview)} onRetry={retryResults} />
              {state.perspective && state.reading && <Perspective b={b} p={state.perspective} reading={state.reading} readings={state.readings ?? []} />}
            </div>
          )}
          <PeerReasoning peers={state.peers} />
          <Reflect
            key={state.locked.lockedAt}
            initial={state.locked.reflection}
            onSave={async (reflection) => {
              if (ctx.preview) return;
              setState(await api<Loaded>(url, { body: { action: "reflect", blockId: b.id, reflection } }));
            }}
          />
          {ctx.preview && (
            <div>
              <button type="button" className={secondary} onClick={() => setState(previewState(b, null, sim))}>
                Start the preview again
              </button>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

/** What the editor's preview shows, worked out from the block as written. */
function previewState(b: BenchmarkBlockData, locked: Loaded["locked"], sim: Sim): Loaded {
  const paused = sim === "stale" || benchmarkStale(b, new Date().toISOString().slice(0, 10));
  const peers = peerReasoning(b, posts, members, new Set());
  return {
    locked,
    paused,
    reading: locked && !paused ? readChoice(b, locked.choice) : null,
    perspective: locked && !paused ? b.perspective : null,
    readings: locked && !paused ? b.choices.map((c) => ({ id: c.id, label: KINDS[c.kind] as string })) : null,
    peers: locked ? peers : { thread: peers.thread, reasons: [] },
  };
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={`Peer benchmark poll: ${title}`} className="w-full rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="people" className="size-5" /> Peer benchmark · practice
      </p>
      <h3 className="font-serif text-2xl font-semibold">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function Scenario({ b }: { b: BenchmarkBlock }) {
  const s = b.scenario;
  return (
    <article className={cx(box, "mt-4")} aria-labelledby={`case-${b.id}`}>
      <h4 id={`case-${b.id}`} className="font-serif text-xl font-semibold">
        {s.heading}
      </h4>
      {s.role && <p className="mt-1 text-sm text-ink-muted">{s.role}</p>}
      <p className="mt-3 font-semibold">What you know</p>
      <ul className="mt-1 list-disc pl-5">
        {s.facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {s.unknowns.length > 0 && (
        <>
          <p className="mt-3 font-semibold">What you don’t know yet</p>
          <ul className="mt-1 list-disc pl-5">
            {s.unknowns.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

function Choose({ b, draft, change, busy, onLock }: { b: BenchmarkBlock; draft: Draft; change: (d: Draft) => void; busy: boolean; onLock: () => void }) {
  const ids = useId();
  return (
    <form
      className="mt-4 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onLock();
      }}
    >
      <fieldset>
        <legend className="font-serif text-lg font-semibold">{b.scenario.question}</legend>
        <ul className="mt-2 flex flex-col gap-2">
          {b.choices.map((c, i) => (
            <li key={c.id}>
              <label
                className={cx(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl p-3 ring-1",
                  draft.choice === c.id ? "bg-muted ring-2 ring-action" : "bg-bg ring-line hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name={`${ids}-c`}
                  className="mt-1 size-5"
                  checked={draft.choice === c.id}
                  onChange={() => change({ ...draft, choice: c.id })}
                />
                <span>
                  <span className="font-semibold">{String.fromCharCode(65 + i)}.</span> {c.text}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {b.askConfidence && (
        <fieldset>
          <legend className="text-sm font-semibold">How confident are you? (optional)</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {(Object.keys(CONFIDENCE) as Confidence[]).map((k) => (
              <label key={k} className={cx(secondary, "cursor-pointer", draft.confidence === k && "bg-muted ring-2 ring-action")}>
                <input
                  type="radio"
                  name={`${ids}-conf`}
                  className="sr-only"
                  checked={draft.confidence === k}
                  onChange={() => change({ ...draft, confidence: k })}
                />
                {CONFIDENCE[k]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {b.askReason && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Why, in a sentence (optional, private to you)</span>
          <input
            className="min-h-11 rounded-xl border border-line-strong bg-bg px-3"
            maxLength={200}
            value={draft.reason}
            onChange={(e) => change({ ...draft, reason: e.target.value })}
          />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={primary} disabled={busy || !draft.choice}>
          <Icon name="lock" className="size-4" /> Lock in my decision
        </button>
        <span className="text-sm text-ink-muted">Once it’s locked, it can’t be changed for this version of the case. Then you’ll see how others chose.</span>
      </div>
    </form>
  );
}

function YourDecision({ b, locked }: { b: BenchmarkBlock; locked: NonNullable<Loaded["locked"]> }) {
  const i = b.choices.findIndex((c) => c.id === locked.choice);
  return (
    <div className={box}>
      <p className="text-sm font-semibold text-ink-muted">You chose</p>
      <p className="mt-1">
        <span className="font-semibold">{String.fromCharCode(65 + Math.max(0, i))}.</span> {b.choices[i]?.text}
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        {[locked.confidence && `Confidence: ${CONFIDENCE[locked.confidence as Confidence]}`, locked.lockedAt && `Locked ${when(locked.lockedAt)}`]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {locked.reason && <p className="mt-1 text-sm">Your reason: “{locked.reason}”</p>}
    </div>
  );
}

/** How peers chose, one group at a time, as text tabs. A group too small to show says so, with no numbers. */
function PeerResults({
  b,
  r,
  mine,
  preview,
  onRetry,
}: {
  b: BenchmarkBlock;
  r: { status: "loading" | "ready" | "offline" | "paused"; data: Results | null; batch: number };
  mine: string;
  preview: boolean;
  onRetry: () => void;
}) {
  const ids = useId();
  const [tab, setTab] = useState<string | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const groups = r.data?.groups ?? [];
  // Open on the first group that can be shown; a hidden group is still there to choose, and says why.
  const g = groups.find((x) => x.id === tab) ?? groups.find((x) => x.shown) ?? groups[0];
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const to = e.key === "ArrowRight" ? (i + 1) % groups.length : e.key === "ArrowLeft" ? (i - 1 + groups.length) % groups.length : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(groups[to].id);
    tabs.current[to]?.focus();
  };
  return (
    <section aria-labelledby={`${ids}-h`} className={box}>
      <h5 id={`${ids}-h`} className="font-serif text-lg font-semibold">
        How others chose
      </h5>
      {preview && r.data && !r.data.empty && (
        <p className={cx(warn, "mt-2 py-2 text-sm font-semibold")}>Sample distribution for the preview: not real results.</p>
      )}
      <div aria-live="polite" className="mt-2">
        {r.status === "loading" ? (
          <p className="text-ink-muted">Loading results…</p>
        ) : r.status === "offline" ? (
          <div>
            <p>Results are delayed. Your decision is saved, and the reviewed perspective is here; results will appear when they’re available.</p>
            {!preview && (
              <button type="button" className={cx(secondary, "mt-2")} onClick={onRetry}>
                <Icon name="refresh" className="size-4" /> Try again
              </button>
            )}
          </div>
        ) : r.status === "paused" || !r.data ? (
          <p>{PAUSED}</p>
        ) : r.data.empty ? (
          <p>{RESULTS_EMPTY}</p>
        ) : (
          <p className="sr-only">Results are now available.</p>
        )}
      </div>
      {r.status === "ready" && r.data && !r.data.empty && g && (
        <>
          <div role="tablist" aria-label="Groups" className="mt-2 flex flex-wrap gap-2">
            {groups.map((x, i) => (
              <button
                key={x.id}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${ids}-t-${x.id}`}
                aria-selected={x.id === g.id}
                aria-controls={`${ids}-p`}
                tabIndex={x.id === g.id ? 0 : -1}
                onClick={() => setTab(x.id)}
                onKeyDown={(e) => onKey(e, i)}
                className={cx(
                  "min-h-11 rounded-full px-4 text-sm font-semibold ring-1",
                  x.id === g.id ? "bg-action text-on-action ring-action" : "bg-surface ring-line-strong hover:bg-muted",
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`${ids}-p`} aria-labelledby={`${ids}-t-${g.id}`} className="mt-3">
            {!g.shown ? (
              <p>{SUPPRESSED}</p>
            ) : (
              <>
                <ul className="flex flex-col gap-3">
                  {g.rows.map((row) => {
                    const i = b.choices.findIndex((c) => c.id === row.choiceId);
                    const isMine = row.choiceId === mine;
                    return (
                      <li key={row.choiceId}>
                        <p className="text-sm">
                          <span className="font-semibold">{String.fromCharCode(65 + i)}.</span> {row.text}
                          {isMine && <span className="font-semibold"> (your choice)</span>}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                            <div
                              className={cx("h-full rounded-full bg-ink-muted", isMine && "outline outline-2 outline-offset-1 outline-action")}
                              style={{ width: `${row.pct}%` }}
                            />
                          </div>
                          <span className="w-24 text-right text-sm tabular-nums">
                            {row.pct}% ({row.count})
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-sm text-ink-muted">
                  n = {g.n} · as of {when(r.data.asOf)} · updated every {r.batch} minutes
                </p>
                {g.rows.find((x) => x.choiceId === mine) && (
                  <p className="mt-1 text-sm">
                    {g.rows.find((x) => x.choiceId === mine)!.pct}% of {g.id === "all" ? "everyone shown" : g.label} chose the same as you.
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
      <p className="mt-3 text-sm text-ink-muted">{NOT_A_SURVEY}</p>
    </section>
  );
}

/** The reviewed perspective. It comes from the reviewers, never from the vote. */
function Perspective({
  b,
  p,
  reading,
  readings,
}: {
  b: BenchmarkBlock;
  p: BenchmarkBlockData["perspective"];
  reading: ChoiceReading;
  readings: { id: string; label: string }[];
}) {
  return (
    <section aria-labelledby={`persp-${b.id}`} className={cx(box, "bg-surface")}>
      <h5 id={`persp-${b.id}`} className="flex items-center gap-2 font-serif text-lg font-semibold">
        <Icon name="shield" className="size-5" /> {p.label}
      </h5>
      {p.critical && <p className={cx(warn, "mt-2 font-semibold")}>This case needs the approved escalation pathway, whatever most people chose.</p>}
      <div className="mt-2 rounded-xl bg-muted p-3">
        <p className="font-semibold">Your choice: {reading.label}</p>
        <p className="mt-1">{reading.feedback}</p>
      </div>
      <dl className="mt-3 flex flex-col gap-2">
        <div>
          <dt className="text-sm font-semibold">The reasoning</dt>
          <dd>{p.reasoning}</dd>
        </div>
        <div>
          <dt className="text-sm font-semibold">What I would check next</dt>
          <dd>{p.checkNext}</dd>
        </div>
        <div>
          <dt className="text-sm font-semibold">Facts that change the urgency</dt>
          <dd>{p.thresholds}</dd>
        </div>
        {p.distinguish && (
          <div>
            <dt className="text-sm font-semibold">Where more than one step is defensible</dt>
            <dd>{p.distinguish}</dd>
          </div>
        )}
        <div>
          <dt className="text-sm font-semibold">Next step</dt>
          <dd>{p.nextStep}</dd>
        </div>
      </dl>
      <div className="mt-3">
        <p className="text-sm font-semibold">How each choice reads</p>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {b.choices.map((c, i) => (
            <li key={c.id}>
              <span className="font-semibold">{String.fromCharCode(65 + i)}:</span> {readings.find((x) => x.id === c.id)?.label ?? ""}
            </li>
          ))}
        </ul>
      </div>
      {b.policy.title && (
        <p className="mt-3 text-sm">
          Policy:{" "}
          {b.policy.url ? (
            <a href={b.policy.url} target="_blank" rel="noreferrer" className="underline">
              {b.policy.title} <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            b.policy.title
          )}
          {b.policy.version && `, version ${b.policy.version}`}
        </p>
      )}
    </section>
  );
}

function PeerReasoning({ peers }: { peers: Loaded["peers"] }) {
  if (!peers.thread) return null;
  return (
    <section aria-labelledby="peer-reasoning" className={box}>
      <h5 id="peer-reasoning" className="font-serif text-lg font-semibold">
        Peer reasoning
      </h5>
      <p className="text-sm text-ink-muted">From the Community’s discussion of this fictional case. Likes order them; they don’t make them right.</p>
      {peers.reasons.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {peers.reasons.map((r) => (
            <li key={r.commentId} className="rounded-xl bg-muted p-3">
              <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-ink-muted">Peer reasoning</p>
              <blockquote className="mt-1 border-l-4 border-line-strong pl-3">{r.body}</blockquote>
              <p className="mt-1 text-sm text-ink-muted">
                {[r.name, r.role].filter(Boolean).join(", ")} · {r.likes} {r.likes === 1 ? "like" : "likes"}
              </p>
              {r.endorsedBy && (
                <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold">
                  <Icon name="circle-check" className="size-4" /> Reviewed and endorsed by {r.endorsedBy}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link href={`/community#post-${peers.thread.id}`} className={cx(secondary, "mt-3")}>
        <Icon name="chat" className="size-4" /> Open the case discussion
      </Link>
    </section>
  );
}

function Reflect({ initial, onSave }: { initial: string; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState<"" | "saving" | "saved" | "failed">(initial ? "saved" : "");
  return (
    <form
      className={box}
      onSubmit={(e) => {
        e.preventDefault();
        setSaved("saving");
        onSave(text)
          .then(() => setSaved("saved"))
          .catch(() => setSaved("failed"));
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-semibold">What fact would make you change your mind?</span>
        <span className="text-sm text-ink-muted">Private to you. It doesn’t change your locked decision.</span>
        <textarea
          className="min-h-20 rounded-xl border border-line-strong bg-bg px-3 py-2"
          maxLength={500}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved("");
          }}
        />
      </label>
      <div className="mt-2 flex items-center gap-3">
        <button type="submit" className={secondary} disabled={saved === "saving"}>
          Save
        </button>
        <span role="status" className="text-sm text-ink-muted">
          {saved === "saved" ? "Saved." : saved === "failed" ? "That didn’t save. Try again." : ""}
        </span>
      </div>
    </form>
  );
}
