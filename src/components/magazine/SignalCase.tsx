"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { SignalBlock } from "@/lib/magazine";
import {
  ACTION_ROLES,
  actionFeedback,
  ARTEFACTS,
  CLUE_KINDS,
  CONNECTIONS,
  DIMENSIONS,
  emptyState,
  HANDOVER_FIELDS,
  MAX_CLUES,
  NOT_YOURS,
  notificationWindow,
  PRIORITIES,
  ratingOf,
  scoreSignal,
  SIGNAL_NOTICE,
  STAGES,
  TIMER_LABEL,
  WINDOW_NOTE,
  type ActionFeedback,
  type ClueKind,
  type ClueMark,
  type Connection,
  type Dim,
  type HandoverField,
  type Priority,
  type SignalState,
} from "@/lib/signal";
import type { SignalDebrief, signalState } from "@/server/signal";
import { Icon } from "../Icon";
import { CharacterRow } from "../characters/CharacterPortrait";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  Spot the Signal (docs/spot-the-signal.md): a calm caseboard. Three updates about one fictional client,
  read for a pattern; then what to do first; only then a provisional assessment; then a handover and the
  debrief. Every step works from the keyboard, nothing depends on colour or dragging, the voicemail has
  its transcript on the page, and nothing is timed: the "timeline" is the made-up story's, not the learner's.

  In the editor's preview it runs against the block as written and stores nothing.
*/

type Loaded = ReturnType<typeof signalState>;
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const field = "w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-base";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";

export function SignalCase({ block: b, ctx }: { block: SignalBlock; ctx: InteractiveContext }) {
  const ids = useId();
  const url = `/api/magazine/${ctx.guideId}/signal`;
  const loaded = useApi<Loaded>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [state, setState] = useState<SignalState | null>(ctx.preview ? emptyState() : null);
  const [debrief, setDebrief] = useState<SignalDebrief | null>(null);
  const [checked, setChecked] = useState<ActionFeedback | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [critical, setCritical] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);

  // Their saved work, once it's loaded.
  if (!ctx.preview && loaded.data && state === null) {
    setState(loaded.data.state);
    setDebrief(loaded.data.debrief);
  }
  // Saved a moment after each change, so leaving and coming back picks up here.
  useEffect(() => {
    if (ctx.preview || !state || !dirty.current || debrief) return;
    const t = setTimeout(() => {
      dirty.current = false;
      api(url, { body: { blockId: b.id, state } }).then(
        () => setSaved(true),
        () => setSaved(false),
      );
    }, 800);
    return () => clearTimeout(t);
  }, [state, ctx.preview, url, b.id, debrief]);

  if (!ctx.preview && loaded.error)
    return (
      <Shell title={b.title}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  if (!state)
    return (
      <Shell title={b.title}>
        <p className="text-ink-muted">Loading…</p>
      </Shell>
    );

  const set = (patch: Partial<SignalState>) => {
    dirty.current = true;
    setSaved(false);
    setState({ ...state, ...patch });
  };
  const go = (stage: number) => {
    set({ stage });
    setProblem(null);
    requestAnimationFrame(() => top.current?.focus());
  };
  const passages = b.artefacts.flatMap((a) => a.passages.map((p) => ({ ...p, artefact: a })));
  const clues = passages.filter((p) => state.clues[p.id] && state.clues[p.id] !== "distractor");
  const mark = (id: string, m: ClueMark | null) => {
    const next = { ...state.clues };
    if (m === null) delete next[id];
    else next[id] = m;
    set({ clues: next, links: state.links.filter((l) => next[l.a] && next[l.b] && next[l.a] !== "distractor" && next[l.b] !== "distractor") });
  };

  const check = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const fb = ctx.preview
        ? actionFeedback(b, state.actions)
        : (await api<{ feedback: ActionFeedback }>(url, { body: { action: "actions", blockId: b.id, state } })).feedback;
      setChecked(fb);
      setCritical(fb.critical);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (ctx.preview) {
        const r = scoreSignal(b, state);
        if (r.critical.length) {
          setCritical(r.critical);
          go(3);
        } else setDebrief(previewDebrief(b, r));
      } else {
        const out = await api<{ finished: boolean; critical: string[]; state: SignalState; debrief: SignalDebrief | null }>(url, {
          body: { action: "submit", blockId: b.id, state },
        });
        if (!out.finished) {
          setCritical(out.critical);
          setChecked(null);
          setState(out.state);
          requestAnimationFrame(() => top.current?.focus());
        } else {
          setDebrief(out.debrief);
          // Working the case through to the debrief is what counts as having done it.
          ctx.activity(b.id, { outcome: "finished" });
          ctx.engaged(b.id);
        }
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t send. Your work is still here.");
    } finally {
      setBusy(false);
    }
  };
  const again = async () => {
    setDebrief(null);
    setChecked(null);
    setCritical([]);
    if (ctx.preview) setState(emptyState());
    else setState((await api<Loaded>(url, { body: { action: "restart", blockId: b.id } })).state);
  };

  if (debrief)
    return (
      <Shell title={b.title}>
        <Debrief block={b} state={state} d={debrief} onAgain={() => void again()} preview={Boolean(ctx.preview)} />
      </Shell>
    );

  const stage = state.stage;
  return (
    <Shell title={b.title}>
      <CharacterRow names={[b.client]} size="sm">
        <p className="text-ink-muted">
          {b.client}
          {b.role ? ` · ${b.role}` : ""}
        </p>
      </CharacterRow>
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{SIGNAL_NOTICE}</p>
      <div ref={top} tabIndex={-1} className="mt-4 outline-none">
        <p className="text-sm font-semibold text-ink-muted" aria-live="polite">
          Step {stage + 1} of {STAGES.length}
          {!ctx.preview && saved ? " · Saved" : ""}
        </p>
        <h4 className="font-serif text-xl font-semibold">{STAGES[stage]}</h4>
      </div>
      {critical.length > 0 && stage === 3 && (
        <div role="alert" className="mt-3 rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]">
          <p className="font-semibold">Before you go on, look at this step again.</p>
          {critical.map((c) => (
            <p key={c} className="mt-1">
              {c}
            </p>
          ))}
        </div>
      )}
      {problem && (
        <p role="alert" className="mt-3 rounded-2xl bg-muted px-4 py-3">
          {problem}
        </p>
      )}

      {stage === 0 && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-lg">{b.intro || "Three ordinary updates. One client. What needs your attention?"}</p>
          <p className="text-ink-muted">
            You’ll read an invoice, a shift note and a voicemail, pick out what matters, say what you’d do first, and then make a provisional assessment and
            write a handover. Take the time you need: nothing measures how fast you read or click. Where a timeline appears, it’s the made-up story’s, showing
            what a choice leads to.
          </p>
          <div>
            <button type="button" className={primary} onClick={() => go(1)}>
              Open the case
            </button>
          </div>
        </div>
      )}

      {stage === 1 && (
        <div className="mt-3 flex flex-col gap-4">
          <p className="text-ink-muted">
            Read all three. Mark a line as a clue when it matters, and say what kind of evidence it is. If something looks unusual but turns out to have an
            ordinary explanation, say so. Up to {MAX_CLUES} clues: {clues.length} so far.
          </p>
          <div className="grid gap-4 xl:grid-cols-3">
            {b.artefacts.map((a) => (
              <article key={a.id} aria-labelledby={`${ids}-${a.id}`} className={cx(box, "flex flex-col gap-2")}>
                <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{ARTEFACTS[a.kind]}</p>
                <h5 id={`${ids}-${a.id}`} className="font-serif text-lg font-semibold">
                  {a.title}
                </h5>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                  <dt className="text-ink-muted">Source</dt>
                  <dd>{a.source}</dd>
                  {a.eventAt && (
                    <>
                      <dt className="text-ink-muted">Happened</dt>
                      <dd>{a.eventAt}</dd>
                    </>
                  )}
                  <dt className="text-ink-muted">Received</dt>
                  <dd>{a.receivedAt}</dd>
                </dl>
                {a.kind === "voicemail" && a.audio && <Voicemail src={a.audio} />}
                {a.kind === "voicemail" && <p className="text-sm font-semibold">Transcript</p>}
                <ul className="flex flex-col gap-2">
                  {a.passages.map((p) => {
                    const m = state.clues[p.id];
                    const full = !m && clues.length >= MAX_CLUES;
                    return (
                      <li key={p.id} className={cx("rounded-xl border p-3", m ? "border-ink" : "border-line")}>
                        <p>
                          {p.text}
                          {p.amount && <span className="font-semibold"> · {p.amount}</span>}
                        </p>
                        {p.previous && <p className="text-sm text-ink-muted">Before: {p.previous}</p>}
                        <label className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
                          <span className="sr-only">“{p.text}”:</span>
                          This is
                          <select
                            className="min-h-11 rounded-full border border-line-strong bg-surface px-3"
                            value={m ?? ""}
                            onChange={(e) => mark(p.id, (e.target.value || null) as ClueMark | null)}
                          >
                            <option value="">not marked</option>
                            {(Object.keys(CLUE_KINDS) as ClueKind[]).map((k) => (
                              <option key={k} value={k} disabled={full}>
                                a clue: {CLUE_KINDS[k].label.toLowerCase()}
                              </option>
                            ))}
                            <option value="distractor">unusual, but not a signal</option>
                          </select>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {a.context && (
                  <details className="text-sm">
                    <summary className="min-h-11 cursor-pointer py-2 font-semibold">{a.kind === "invoice" ? "What the file says" : "About the source"}</summary>
                    <p>{a.context}</p>
                  </details>
                )}
              </article>
            ))}
          </div>
          <ul className="grid gap-1 text-sm text-ink-muted sm:grid-cols-3">
            {(Object.keys(CLUE_KINDS) as ClueKind[]).map((k) => (
              <li key={k}>
                <span className="font-semibold text-ink">{CLUE_KINDS[k].label}:</span> {CLUE_KINDS[k].text}
              </li>
            ))}
          </ul>
          <Nav onBack={() => go(0)} onNext={() => go(2)} disabled={clues.length === 0} hint={clues.length === 0 ? "Mark at least one clue to go on." : ""} />
        </div>
      )}

      {stage === 2 && <Connect ids={ids} clues={clues} state={state} set={set} onBack={() => go(1)} onNext={() => go(3)} />}

      {stage === 3 && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-ink-muted">
            Before any classification: what do you do now? Choose every step you’d take. They’re listed in the order you choose them.
          </p>
          <fieldset>
            <legend className="sr-only">What do you do now?</legend>
            <div className="flex flex-col gap-2">
              {b.actions.map((a) => {
                const at = state.actions.indexOf(a.id);
                return (
                  <label
                    key={a.id}
                    className={cx(
                      "flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3",
                      at >= 0 ? "border-ink bg-tealtint" : "border-line-strong hover:bg-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-5 accent-[var(--color-action)]"
                      checked={at >= 0}
                      onChange={(e) => {
                        setChecked(null);
                        set({ actions: e.target.checked ? [...state.actions, a.id] : state.actions.filter((x) => x !== a.id) });
                      }}
                    />
                    <span>
                      <span className="font-semibold">
                        {at >= 0 ? `${at + 1}. ` : ""}
                        {a.label}
                      </span>
                      {a.guidance && <span className="block text-sm text-ink-muted">{a.guidance}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <p className="text-sm text-ink-muted">These are practice choices. Choosing one contacts no one.</p>
          {checked && (
            <div aria-live="polite" className="flex flex-col gap-2">
              {checked.chosen.map((c) => (
                <div key={c.id} className={box}>
                  <p className="font-semibold">{c.label}</p>
                  <p className="text-sm text-ink-muted">{ACTION_ROLES[c.role]}</p>
                  <p className="mt-1">{c.feedback}</p>
                  {c.consequence && <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-sm">{c.consequence}</p>}
                </div>
              ))}
              {checked.missed.length > 0 && <p className={box}>This case also needed: {checked.missed.join("; ")}. One action alone is often not enough.</p>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={secondary} onClick={() => go(2)}>
              <Icon name="arrow-left" className="size-4" /> Back
            </button>
            {!checked || checked.critical.length ? (
              <button type="button" className={primary} disabled={busy || !state.actions.length} onClick={() => void check()}>
                {checked?.critical.length ? "Check again" : "Check these"}
              </button>
            ) : (
              <button type="button" className={primary} onClick={() => go(4)}>
                Go on to the assessment <Icon name="arrow-right" className="size-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {stage === 4 && (
        <div className="mt-3 flex flex-col gap-4">
          <p className="text-ink-muted">A provisional view, in this order. {NOT_YOURS}</p>
          <Choice
            legend="1. Is it connected with the delivery of funded aged care?"
            name={`${ids}-conn`}
            value={state.connection}
            options={(Object.keys(CONNECTIONS) as Connection[]).map((c) => ({ value: c, label: CONNECTIONS[c] }))}
            onChange={(v) => set({ connection: v as Connection })}
          />
          <Choice
            legend="2. Do the facts fit a reportable incident type?"
            name={`${ids}-type`}
            value={state.typeId ?? "~"}
            options={[...b.key.types.map((t) => ({ value: t.id, label: t.label })), { value: "", label: "No reportable type is established on these facts" }]}
            onChange={(v) => set({ typeId: v })}
          />
          <Choice
            legend="3. What would you expect the priority to be?"
            name={`${ids}-pri`}
            value={state.priority}
            options={(Object.keys(PRIORITIES) as Priority[]).map((p) => ({ value: p, label: PRIORITIES[p].label, hint: PRIORITIES[p].text }))}
            onChange={(v) => set({ priority: v as Priority })}
          />
          <p className="text-sm text-ink-muted">“Not established yet” means you need the authorised reviewer to decide. It never means doing nothing.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 font-semibold">
              Your reasoning, in a sentence
              <textarea
                className={cx(field, "min-h-20 font-normal")}
                maxLength={400}
                value={state.rationale}
                onChange={(e) => set({ rationale: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              The clue it rests on
              <select className={cx(field, "min-h-11 font-normal")} value={state.rationaleClue} onChange={(e) => set({ rationaleClue: e.target.value })}>
                <option value="">Choose a clue…</option>
                {clues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {ARTEFACTS[c.artefact.kind]}: {c.text.slice(0, 70)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Nav
            onBack={() => go(3)}
            onNext={() => go(5)}
            disabled={!state.connection || state.typeId === null || !state.priority}
            hint={!state.connection || state.typeId === null || !state.priority ? "Answer all three questions to go on." : ""}
          />
        </div>
      )}

      {stage === 5 && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-ink-muted">
            Write the handover you’d give the person you escalated to. Facts, exact words, what you don’t know. No conclusions about anyone.
          </p>
          {(Object.keys(HANDOVER_FIELDS) as HandoverField[]).map((f) => (
            <label key={f} className="flex flex-col gap-1 font-semibold">
              {HANDOVER_FIELDS[f].label}
              {HANDOVER_FIELDS[f].hint && <span className="text-sm font-normal text-ink-muted">{HANDOVER_FIELDS[f].hint}</span>}
              <textarea
                className={cx(field, "min-h-16 font-normal")}
                maxLength={1200}
                value={state.handover[f]}
                onChange={(e) => set({ handover: { ...state.handover, [f]: e.target.value } })}
              />
            </label>
          ))}
          <p className="text-sm text-ink-muted">
            This is practice. It’s kept with your attempt so you can compare it, and only you can read it. It doesn’t create a record or reach anyone.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={secondary} onClick={() => go(4)}>
              <Icon name="arrow-left" className="size-4" /> Back
            </button>
            <button type="button" className={primary} disabled={busy} onClick={() => void submit()}>
              {busy ? "Finishing…" : "Finish and see the debrief"}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

/** In the editor's preview the author's copy has the answers, so the debrief is worked out in the browser. */
function previewDebrief(b: SignalBlock, r: ReturnType<typeof scoreSignal>): SignalDebrief {
  return {
    dims: (Object.keys(DIMENSIONS) as Dim[]).map((d) => ({ id: d, label: DIMENSIONS[d].label, rating: ratingOf(r.dims[d].score), notes: r.dims[d].notes })),
    flags: r.flags,
    clues: Object.fromEntries(
      b.artefacts.flatMap((a) => a.passages.filter((p) => p.signal !== "none").map((p) => [p.id, { signal: p.signal, kind: p.kind, why: p.why }])),
    ),
    actions: b.actions.map(({ id, label, role, feedback }) => ({ id, label, role, feedback })),
    key: {
      connection: b.key.connection,
      typeId: b.key.typeId,
      priority: b.key.priority,
      why: b.key.why,
      anchor: b.key.anchor,
      handover: b.key.handover,
      needed: b.key.needed,
    },
    window: notificationWindow(b),
    awareNote: b.awareNote,
    source: b.source,
  };
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={`Spot the Signal: ${title}`} className="w-full rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="eye" className="size-5" /> Spot the Signal · training case
      </p>
      <h3 className="font-serif text-2xl font-semibold">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function Nav({ onBack, onNext, disabled, hint }: { onBack: () => void; onNext: () => void; disabled?: boolean; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={secondary} onClick={onBack}>
        <Icon name="arrow-left" className="size-4" /> Back
      </button>
      <button type="button" className={primary} disabled={disabled} onClick={onNext}>
        Continue <Icon name="arrow-right" className="size-4" />
      </button>
      {hint && <span className="text-sm text-ink-muted">{hint}</span>}
    </div>
  );
}

function Choice({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <fieldset>
      <legend className="font-semibold">{legend}</legend>
      <div className="mt-1.5 flex flex-col gap-2">
        {options.map((o) => (
          <label
            key={o.value || "none"}
            className={cx(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-2.5",
              value === o.value ? "border-ink bg-tealtint" : "border-line-strong hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name={name}
              className="mt-1 size-4 accent-[var(--color-action)]"
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>
              {o.label}
              {o.hint && <span className="block text-sm text-ink-muted">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The voicemail recording, with its speed. The transcript beside it says everything it does. */
function Voicemail({ src }: { src: string }) {
  const el = useRef<HTMLAudioElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <audio ref={el} controls preload="none" src={src} className="h-11 max-w-full">
        The recording can’t play here. The transcript below has everything that’s said.
      </audio>
      <label className="flex items-center gap-1 text-sm">
        Speed
        <select
          className="min-h-11 rounded-full border border-line-strong bg-surface px-2"
          defaultValue="1"
          onChange={(e) => el.current && (el.current.playbackRate = Number(e.target.value))}
        >
          {["0.75", "1", "1.25", "1.5"].map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

type Clue = { id: string; text: string; artefact: SignalBlock["artefacts"][number] };

/** Linking clues: pick two from a list and say what the link is. No dragging, nothing that needs a pointer. */
function Connect({
  ids,
  clues,
  state,
  set,
  onBack,
  onNext,
}: {
  ids: string;
  clues: Clue[];
  state: SignalState;
  set: (p: Partial<SignalState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [a, setA] = useState("");
  const [b2, setB] = useState("");
  const [kind, setKind] = useState<ClueKind>("hypothesis");
  const name = (id: string) => {
    const c = clues.find((x) => x.id === id);
    return c ? `${ARTEFACTS[c.artefact.kind]}: “${c.text.slice(0, 60)}${c.text.length > 60 ? "…" : ""}”` : "";
  };
  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-ink-muted">
        Do any of your clues belong together? Link two, and say whether the link is something seen, something reported, or an idea to check. A link between two
        different updates is where a pattern shows.
      </p>
      {clues.length < 2 ? (
        <p className={box}>You’ve marked one clue. Go back to mark more if others matter, or continue.</p>
      ) : (
        <div className={cx(box, "grid gap-3 sm:grid-cols-2")}>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            This clue
            <select id={`${ids}-ca`} className={cx(field, "min-h-11 font-normal")} value={a} onChange={(e) => setA(e.target.value)}>
              <option value="">Choose…</option>
              {clues.map((c) => (
                <option key={c.id} value={c.id}>
                  {name(c.id)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            goes with this one
            <select className={cx(field, "min-h-11 font-normal")} value={b2} onChange={(e) => setB(e.target.value)}>
              <option value="">Choose…</option>
              {clues
                .filter((c) => c.id !== a)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {name(c.id)}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Together, they are
            <select className={cx(field, "min-h-11 font-normal")} value={kind} onChange={(e) => setKind(e.target.value as ClueKind)}>
              {(Object.keys(CLUE_KINDS) as ClueKind[]).map((k) => (
                <option key={k} value={k}>
                  {CLUE_KINDS[k].label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className={secondary}
              disabled={!a || !b2 || state.links.some((l) => (l.a === a && l.b === b2) || (l.a === b2 && l.b === a))}
              onClick={() => {
                set({ links: [...state.links, { a, b: b2, kind }] });
                setA("");
                setB("");
              }}
            >
              <Icon name="plus" className="size-4" /> Connect
            </button>
          </div>
        </div>
      )}
      <ul className="flex flex-col gap-2" aria-live="polite" aria-label="Your connections">
        {state.links.map((l, i) => (
          <li key={`${l.a}:${l.b}`} className={cx(box, "flex flex-wrap items-start justify-between gap-2")}>
            <span>
              {name(l.a)} <span className="font-semibold">+</span> {name(l.b)}
              <span className="block text-sm text-ink-muted">{CLUE_KINDS[l.kind].label}</span>
            </span>
            <button type="button" className="min-h-11 font-semibold text-accent" onClick={() => set({ links: state.links.filter((_, j) => j !== i) })}>
              Remove<span className="sr-only"> connection {i + 1}</span>
            </button>
          </li>
        ))}
      </ul>
      <Nav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function Debrief({
  block: b,
  state,
  d,
  onAgain,
  preview,
}: {
  block: SignalBlock;
  state: SignalState;
  d: SignalDebrief;
  onAgain: () => void;
  preview: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const passages = b.artefacts.flatMap((a) => a.passages.map((p) => ({ ...p, artefact: a })));
  const type = d.key.typeId ? b.key.types.find((t) => t.id === d.key.typeId)?.label : "No reportable type is established on these facts";
  return (
    <div className="mt-3 flex flex-col gap-5">
      <h4 ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
        Debrief
      </h4>
      <ul className="grid gap-2 sm:grid-cols-2">
        {d.dims.map((x) => (
          <li key={x.id} className={box}>
            <p className="font-semibold">{x.label}</p>
            <p className="text-sm text-ink-muted">{x.rating}</p>
            {x.notes.map((n) => (
              <p key={n} className="mt-1 text-sm">
                {n}
              </p>
            ))}
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-muted">This reads your reasoning and what you did. How long you took isn’t measured.</p>

      <div className={box}>
        <h5 className="font-semibold">How this case was assessed</h5>
        <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="text-ink-muted">Connected with funded care</dt>
          <dd>
            {CONNECTIONS[d.key.connection]}
            {state.connection && state.connection !== d.key.connection ? ` (you said: ${CONNECTIONS[state.connection].toLowerCase()})` : ""}
          </dd>
          <dt className="text-ink-muted">Reportable type</dt>
          <dd>{type}</dd>
          <dt className="text-ink-muted">Priority</dt>
          <dd>
            {PRIORITIES[d.key.priority].label}
            {state.priority && state.priority !== d.key.priority ? ` (you said: ${PRIORITIES[state.priority].label.toLowerCase()})` : ""}
          </dd>
        </dl>
        <p className="mt-2 whitespace-pre-wrap">{d.key.why}</p>
        <p className="mt-2 text-sm text-ink-muted">
          {NOT_YOURS} Checked against: {d.source.title}, {d.source.version}.{d.key.anchor ? ` ${d.key.anchor}` : ""}
        </p>
      </div>

      <div className={box}>
        <h5 className="font-semibold">{TIMER_LABEL}</h5>
        {d.window ? (
          <>
            <p className="mt-1">
              In this case the provider became aware on <strong>{d.window.aware}</strong>. For a {PRIORITIES[d.key.priority].label} assessment, the provider
              notifies the Commission {d.window.rule}: by <strong>{d.window.due}</strong>.
            </p>
            <p className="mt-1 text-sm text-ink-muted">{WINDOW_NOTE}</p>
          </>
        ) : (
          <p className="mt-1">
            No clock is shown for this case.{" "}
            {d.awareNote || "When the provider became aware can’t be said confidently: that uncertainty is itself something to escalate."}
          </p>
        )}
        {d.awareNote && d.window && <p className="mt-1 text-sm text-ink-muted">{d.awareNote}</p>}
      </div>

      <div>
        <h5 className="font-semibold">The clues</h5>
        <ul className="mt-2 flex flex-col gap-2">
          {passages
            .filter((p) => d.clues[p.id])
            .map((p) => {
              const k = d.clues[p.id];
              const mine = state.clues[p.id];
              return (
                <li key={p.id} className={box}>
                  <p className="text-sm text-ink-muted">{ARTEFACTS[p.artefact.kind]}</p>
                  <p>
                    {p.text}
                    {p.amount ? ` · ${p.amount}` : ""}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="font-semibold">{k.signal === "distractor" ? "Not a signal" : CLUE_KINDS[k.kind].label}.</span> {k.why}
                  </p>
                  <p className="text-sm text-ink-muted">
                    You: {!mine ? "didn’t mark it" : mine === "distractor" ? "said it wasn’t a signal" : `marked it as ${CLUE_KINDS[mine].label.toLowerCase()}`}
                    .
                  </p>
                </li>
              );
            })}
        </ul>
      </div>

      <div>
        <h5 className="font-semibold">What each action does in this case</h5>
        <ul className="mt-2 flex flex-col gap-2">
          {d.actions.map((a) => (
            <li key={a.id} className={box}>
              <p className="font-semibold">
                {a.label}
                {state.actions.includes(a.id) ? " (you chose this)" : ""}
              </p>
              <p className="text-sm text-ink-muted">{ACTION_ROLES[a.role]}</p>
              <p className="mt-1 text-sm">{a.feedback}</p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h5 className="font-semibold">Your handover, beside a senior reviewer’s</h5>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          <div className={box}>
            <p className="font-semibold">Yours</p>
            {(Object.keys(HANDOVER_FIELDS) as HandoverField[]).map((f) => (
              <p key={f} className="mt-2 text-sm">
                <span className="block font-semibold text-ink-muted">{HANDOVER_FIELDS[f].label}</span>
                <span className="whitespace-pre-wrap">{state.handover[f] || "(left empty)"}</span>
              </p>
            ))}
          </div>
          <div className={box}>
            <p className="font-semibold">Senior reviewer’s example</p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{d.key.handover}</p>
            {d.key.needed.length > 0 && (
              <>
                <p className="mt-3 text-sm font-semibold text-ink-muted">What still needed finding out</p>
                <ul className="list-disc pl-5 text-sm">
                  {d.key.needed.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          Notice what the example keeps apart: what was seen, what was said, and what someone thinks. It names no one as guilty and diagnoses nothing.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={secondary} onClick={onAgain}>
          <Icon name="refresh" className="size-4" /> Work the case again
        </button>
        {preview && <span className="text-sm text-ink-muted">Preview: nothing was recorded.</span>}
      </div>
    </div>
  );
}
