"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { useHydrated } from "@/lib/store";
import type { BatonBlock } from "@/lib/magazine";
import {
  BATON_NOTICE,
  blankDecision,
  chooseRole,
  emptyBaton,
  PLACEMENTS,
  PRIVACY,
  readHandoff,
  relayMap,
  RESULTS,
  ROLE_IDS,
  sendHandoff,
  sendProblems,
  stageFor,
  STATUSES,
  VERDICTS,
  type BatonState,
  type Decision,
  type Frame,
  type Option,
  type Placement,
  type RelayStop,
  type Result,
  type RoleId,
  type Stage,
  type StageFeedback,
} from "@/lib/baton";
import type { batonState } from "@/server/baton";
import { Icon } from "../Icon";
import { CharacterRow } from "../characters/CharacterPortrait";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  Pass the Baton (docs/pass-the-baton.md). A journey rail with one active relay stage. The learner picks a role
  (or is given one), reads their role card and sources, deals with any urgent concern first, then builds the
  handoff: every fact sorted (Send, Verify first, Keep in record) by buttons, not dragging, and the recipient,
  urgency, channel, owner and receipt chosen. A short preview shows what the next role can do with it: three
  captioned frames, pausable and skippable, shown all at once with reduced motion, with a transcript. An open
  handoff asks for a follow-up. Then the debrief, a replay, another role, and the relay map.

  In the editor's preview everything is worked out on the page from the block as written, and nothing is stored.
*/

type Loaded = ReturnType<typeof batonState>;
type View = Pick<Loaded, "state" | "sent" | "map" | "stale" | "earlierKey"> & { status: string };
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "rounded-2xl bg-[#fff1cc] p-3 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const bad = "rounded-2xl bg-[#fde2e0] p-3 text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]";
const ok = "rounded-2xl bg-[#e3f4e8] p-3 text-[#0f3d1f] dark:bg-[#123321] dark:text-[#b6ecc8]";
const resultTone = (r: Result) => (r === "ontrack" ? ok : r === "followup" ? warn : bad);
const errorText = (e: unknown, d: string) => (e instanceof Error ? e.message : d);

function localView(b: BatonBlock, state: BatonState): View {
  const sent: Record<string, StageFeedback> = {};
  for (const s of b.stages) if (state.tries[s.id]?.length) sent[s.id] = readHandoff(b, s, state.tries[s.id][state.tries[s.id].length - 1]);
  return { state, sent, map: relayMap(b, state), stale: false, earlierKey: false, status: state.passed.length >= b.rolesToComplete ? "finished" : "active" };
}

export function BatonRelay({ block: b, ctx }: { block: BatonBlock; ctx: InteractiveContext }) {
  const hydrated = useHydrated();
  const url = `/api/magazine/${ctx.guideId}/baton`;
  const loaded = useApi<Loaded>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [v, setV] = useState<View | null>(null);
  const [draft, setDraft] = useState<Decision | null>(null);
  const [shown, setShown] = useState<StageFeedback | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const top = useRef<HTMLHeadingElement>(null);

  if (ctx.preview && hydrated && v === null) setV(localView(b, emptyBaton()));
  if (!ctx.preview && loaded.data && v === null) setV(loaded.data);
  const stage = v ? stageFor(b, v.state.role) : undefined;
  if (v && stage && draft === null) {
    setDraft(v.state.drafts[stage.id] ?? blankDecision());
    // Coming back to an open handoff: show where it was left.
    const last = v.sent[stage.id];
    if (last && last.needsFollowUp) setShown(last);
  }

  useEffect(() => {
    if (ctx.preview || !draft || !dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      api(url, { body: { blockId: b.id, draft } }).catch(() => undefined);
    }, 600);
    return () => clearTimeout(t);
  }, [draft, ctx.preview, url, b.id]);

  if (!ctx.preview && loaded.error)
    return (
      <Shell title={b.title}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  if (!v)
    return (
      <Shell title={b.title}>
        <p className="text-ink-muted">Loading…</p>
      </Shell>
    );

  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
    } catch (e) {
      setProblem(errorText(e, "That didn’t send. Your choices are still here."));
    } finally {
      setBusy(false);
    }
  };
  const pickRole = (role: RoleId) =>
    run(async () => {
      if (ctx.preview) {
        const next = chooseRole(b, v.state, role);
        if ("problem" in next) throw new Error(next.problem);
        setV(localView(b, next));
      } else setV(await api<Loaded>(url, { body: { blockId: b.id, role } }));
      const st = stageFor(b, role)!;
      setDraft(v.state.drafts[st.id] ?? blankDecision());
      setShown(null);
      requestAnimationFrame(() => top.current?.focus());
    });
  const change = (d: Decision) => {
    dirty.current = true;
    setDraft(d);
  };
  const send = (d: Decision) =>
    run(async () => {
      if (ctx.preview) {
        const out = sendHandoff(b, v.state, d);
        if ("problem" in out) throw new Error(out.problem);
        setV(localView(b, out.state));
        setShown(out.feedback);
      } else {
        dirty.current = false;
        const out = await api<Loaded & { feedback: StageFeedback; finishedNow: boolean }>(url, { body: { action: "send", blockId: b.id, decision: d } });
        setV(out);
        setShown(out.feedback);
        if (out.finishedNow) {
          ctx.activity(b.id, { outcome: "finished" });
          ctx.engaged(b.id);
        }
      }
    });
  const replay = () => {
    if (!stage) return;
    setShown(null);
    setDraft(blankDecision());
    dirty.current = true;
    requestAnimationFrame(() => top.current?.focus());
  };
  const restart = () =>
    run(async () => {
      if (ctx.preview) setV(localView(b, emptyBaton()));
      else setV(await api<Loaded>(url, { body: { action: "restart", blockId: b.id } }));
      setDraft(null);
      setShown(null);
    });

  const playable = b.stages.filter((s) => s.kind === "handoff").map((s) => s.role as RoleId);
  const passed = v.state.passed.length;
  const complete = passed >= b.rolesToComplete;

  return (
    <Shell title={b.title}>
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{BATON_NOTICE}</p>
      {b.intro && <p className="mt-3 text-lg">{b.intro}</p>}
      {v.earlierKey && (
        <p className={cx(warn, "mt-3")}>
          The relay’s guidance has changed since you started. Your earlier sends are kept and read against the current guidance.
        </p>
      )}
      {v.stale && <p className={cx(warn, "mt-3")}>This relay is past its review date and is being reviewed. Treat its guidance as possibly out of date.</p>}
      <div className={cx(box, "mt-3")}>
        <CharacterRow names={[b.person.name]} size="sm">
          <p className="font-semibold">{b.person.name}</p>
          <p className="text-sm">{b.person.about}</p>
        </CharacterRow>
      </div>

      <Rail b={b} v={v} />

      <section aria-labelledby={`${b.id}-roles`} className="mt-4">
        <h4 id={`${b.id}-roles`} className="font-semibold">
          {b.assignedRole ? "Your role" : "Choose a role to play"}
        </h4>
        <p className="text-sm text-ink-muted">
          Each role starts from the same authored story. Play {b.rolesToComplete === 1 ? "one role" : `${b.rolesToComplete} roles`} without a critical gap to
          finish
          {complete ? ": done." : `. ${passed} so far.`}
        </p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {ROLE_IDS.filter((r) => playable.includes(r)).map((r) => {
            const st = stageFor(b, r)!;
            const last = v.sent[st.id];
            const locked = Boolean(b.assignedRole && r !== b.assignedRole && !v.state.passed.includes(stageFor(b, b.assignedRole)?.id ?? ""));
            return (
              <li key={r}>
                <button
                  type="button"
                  aria-pressed={v.state.role === r}
                  disabled={busy || locked}
                  onClick={() => void pickRole(r)}
                  className={cx(
                    "flex h-full min-h-11 w-full flex-col items-start rounded-2xl p-3 text-left ring-1 disabled:opacity-60",
                    v.state.role === r ? "bg-muted ring-2 ring-action" : "bg-bg ring-line hover:bg-muted",
                  )}
                >
                  <span className="font-semibold">{b.roles[r].label}</span>
                  <span className="text-sm">{b.roles[r].remit}</span>
                  <span className="mt-1 text-xs font-semibold text-ink-muted">
                    {locked ? "After your assigned role" : last ? (last.needsFollowUp ? "Open: needs a follow-up" : RESULTS[last.result]) : "Not played yet"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {problem && (
        <p role="alert" className={cx(warn, "mt-3")}>
          {problem}
        </p>
      )}

      {stage && draft && (
        <div className="mt-5">
          <h4 ref={top} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
            {stage.label}: you’re the {b.roles[stage.role as RoleId].label}
          </h4>
          <p className="text-sm text-ink-muted">{stage.time}</p>
          {!shown ? (
            <>
              <RoleCard b={b} s={stage} />
              <Builder b={b} s={stage} d={draft} change={change} busy={busy} onSend={() => void send(draft)} />
            </>
          ) : (
            <Outcome
              key={`${stage.id}-${v.state.tries[stage.id]?.length ?? 0}-${shown.needsFollowUp}`}
              b={b}
              s={stage}
              f={shown}
              d={draft}
              busy={busy}
              onFollowUp={(id) => {
                const d = { ...(v.state.tries[stage.id]?.at(-1) ?? draft), followUp: id };
                setDraft(d);
                void send(d);
              }}
              onReplay={replay}
            />
          )}
        </div>
      )}

      {Object.keys(v.sent).length > 0 && <RelayMap b={b} map={v.map} complete={complete} />}
      {Object.keys(v.sent).length > 0 && (
        <div className="mt-3">
          <button type="button" className={secondary} disabled={busy} onClick={() => void restart()}>
            <Icon name="refresh" className="size-4" /> Start the whole relay again
          </button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={`Pass the Baton: ${title}`} className="w-full rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="route" className="size-5" /> Pass the Baton · simulation
      </p>
      <h3 className="font-serif text-2xl font-semibold">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

/** The journey, in order: horizontal on a wide screen, stacked on a phone. Statuses are in words. */
function Rail({ b, v }: { b: BatonBlock; v: View }) {
  return (
    <ol aria-label="The journey" className="mt-4 flex flex-col gap-2 md:flex-row md:overflow-x-auto md:pb-2">
      {b.stages.map((s) => {
        const mine = s.kind === "handoff" && s.role === v.state.role;
        const sent = v.sent[s.id];
        const status = s.kind === "event" ? "What happens" : mine ? "Your turn" : sent ? (sent.needsFollowUp ? "Open" : RESULTS[sent.result]) : "In the story";
        return (
          <li
            key={s.id}
            aria-current={mine ? "step" : undefined}
            className={cx("rounded-2xl p-3 text-sm ring-1 md:w-44 md:shrink-0", mine ? "bg-muted ring-2 ring-action" : "bg-bg ring-line")}
          >
            <p className="font-semibold">{s.time}</p>
            <p>{s.label}</p>
            {s.role && <p className="text-xs text-ink-muted">{b.roles[s.role as RoleId].label}</p>}
            <p className="mt-1 text-xs font-semibold">{status}</p>
          </li>
        );
      })}
    </ol>
  );
}

function RoleCard({ b, s }: { b: BatonBlock; s: Stage }) {
  const role = s.role as RoleId;
  const sources = b.sources.filter((x) => x.visibleTo.includes(role));
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <div className={box}>
        <p className="font-semibold">{b.roles[role].label}</p>
        <p className="text-sm">{b.roles[role].remit}</p>
        <p className="mt-2">{s.narrative}</p>
        {s.incoming && (
          <p className="mt-2 rounded-xl bg-muted p-2 text-sm">
            <span className="font-semibold">What arrived:</span> {s.incoming}
          </p>
        )}
        {s.decision && (
          <p className="mt-2 text-sm">
            <span className="font-semibold">Your decision:</span> {s.decision}
          </p>
        )}
        {s.unknowns.length > 0 && (
          <div className="mt-2">
            <p className="text-sm font-semibold">What you don’t know yet</p>
            <ul className="list-disc pl-5 text-sm">
              {s.unknowns.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className={box}>
        <p className="font-semibold">Sources you can see</p>
        <ul className="mt-1 flex flex-col gap-1">
          {sources.map((x) => (
            <li key={x.id}>
              <details>
                <summary className="cursor-pointer text-sm">
                  <span className="font-semibold">{x.title}</span> · {STATUSES[x.status]}
                  {x.time && ` · ${x.time}`}
                </summary>
                <p className="mt-1 text-xs text-ink-muted">{x.kind}</p>
                <p className="mt-1 text-sm">{x.body}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Group({ legend, name, options, value, onChange }: { legend: string; name: string; options: Option[]; value: string; onChange: (id: string) => void }) {
  return (
    <fieldset className={box}>
      <legend className="px-1 font-semibold">{legend}</legend>
      <ul className="mt-1 flex flex-col gap-1">
        {options.map((o) => (
          <li key={o.id}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-muted">
              <input type="radio" name={name} className="mt-1 size-5" checked={value === o.id} onChange={() => onChange(o.id)} />
              <span>{o.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/** The urgent concern first, then the handoff: every fact sorted by buttons, then who, how urgently, how, who owns it and how receipt is confirmed. */
function Builder({
  b,
  s,
  d,
  change,
  busy,
  onSend,
}: {
  b: BatonBlock;
  s: Stage;
  d: Decision;
  change: (d: Decision) => void;
  busy: boolean;
  onSend: () => void;
}) {
  const ids = useId();
  const [flagDone, setFlagDone] = useState(Boolean(d.redFlag));
  const builderRef = useRef<HTMLHeadingElement>(null);
  const facts = s.factIds.map((id) => b.facts.find((f) => f.id === id)!).filter(Boolean);
  const problems = sendProblems(s, d);
  const set = (p: Partial<Decision>) => change({ ...d, ...p });

  if (s.redFlag && !flagDone)
    return (
      <section aria-labelledby={`${ids}-flag`} className={cx(bad, "mt-4 p-4")}>
        <h5 id={`${ids}-flag`} className="flex items-center gap-2 font-serif text-lg font-semibold">
          <Icon name="alert" className="size-5" /> Pause: something urgent
        </h5>
        <p className="mt-1">{s.redFlag.text}</p>
        <Group legend="What do you do first?" name={`${ids}-rf`} options={s.redFlag.options} value={d.redFlag} onChange={(id) => set({ redFlag: id })} />
        <button
          type="button"
          className={cx(primary, "mt-3")}
          disabled={!d.redFlag}
          onClick={() => {
            setFlagDone(true);
            requestAnimationFrame(() => builderRef.current?.focus());
          }}
        >
          Continue to the handoff
        </button>
      </section>
    );

  return (
    <form
      className="mt-4 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <h5 ref={builderRef} tabIndex={-1} className="font-serif text-lg font-semibold outline-none">
        Build the handoff
      </h5>
      {s.redFlag && d.redFlag && (
        <p className="text-sm">
          <span className="font-semibold">The urgent concern:</span> {s.redFlag.options.find((x) => x.id === d.redFlag)?.text}{" "}
          <button type="button" className="font-semibold text-accent underline" onClick={() => setFlagDone(false)}>
            Change
          </button>
        </p>
      )}
      <div className={box}>
        <p className="font-semibold">Sort each fact</p>
        <p className="text-sm text-ink-muted">Send it, verify it first, or keep it in the record and don’t send it to this recipient.</p>
        <ul className="mt-2 flex flex-col gap-3">
          {facts.map((f) => {
            const placed = d.placements[f.id];
            return (
              <li key={f.id} className="rounded-xl bg-surface p-3 ring-1 ring-line">
                <fieldset>
                  <legend className="font-semibold">{f.text}</legend>
                  <p className="text-xs text-ink-muted">
                    {STATUSES[f.status]} · {PRIVACY[f.privacy]}
                    {f.sourceId && b.sources.find((x) => x.id === f.sourceId) ? ` · from ${b.sources.find((x) => x.id === f.sourceId)!.title}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(Object.keys(PLACEMENTS) as Placement[]).map((p) => (
                      <label key={p} className={cx(secondary, "min-h-10 cursor-pointer px-3 text-sm", placed === p && "bg-muted ring-2 ring-action")}>
                        <input
                          type="radio"
                          className="sr-only"
                          name={`${ids}-${f.id}`}
                          checked={placed === p}
                          onChange={() => set({ placements: { ...d.placements, [f.id]: p } })}
                        />
                        {PLACEMENTS[p]}
                      </label>
                    ))}
                  </div>
                  {placed === "send" && f.status !== "confirmed" && (
                    <p className={cx(warn, "mt-2 text-sm")}>
                      Not confirmed: it’ll arrive labelled “{STATUSES[f.status].toLowerCase()}”. Is that what you mean to send?
                    </p>
                  )}
                </fieldset>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Group legend="Who receives it?" name={`${ids}-r`} options={s.recipients} value={d.recipient} onChange={(id) => set({ recipient: id })} />
        <Group legend="How urgent?" name={`${ids}-u`} options={s.urgency} value={d.urgency} onChange={(id) => set({ urgency: id })} />
        <Group legend="Which channel?" name={`${ids}-c`} options={s.channels} value={d.channel} onChange={(id) => set({ channel: id })} />
        <Group legend="Who owns the next step?" name={`${ids}-o`} options={s.owners} value={d.owner} onChange={(id) => set({ owner: id })} />
        <Group legend="How is receipt confirmed?" name={`${ids}-a`} options={s.acks} value={d.ack} onChange={(id) => set({ ack: id })} />
        {s.actions.length > 0 && (
          <fieldset className={box}>
            <legend className="px-1 font-semibold">Anything else? (optional)</legend>
            <ul className="mt-1 flex flex-col gap-1">
              {s.actions.map((a) => (
                <li key={a.id}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-muted">
                    <input
                      type="checkbox"
                      className="mt-1 size-5"
                      checked={d.actions.includes(a.id)}
                      onChange={() => set({ actions: d.actions.includes(a.id) ? d.actions.filter((x) => x !== a.id) : [...d.actions, a.id] })}
                    />
                    <span>{a.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={primary} disabled={busy || problems.length > 0}>
          <Icon name="arrow-right" className="size-4" /> Send the simulated handoff
        </button>
        {problems.length > 0 && <span className="text-sm text-ink-muted">{problems[0]}</span>}
      </div>
    </form>
  );
}

/** The preview, then a follow-up if the handoff is still open, then the debrief. */
function Outcome({
  b,
  s,
  f,
  busy,
  onFollowUp,
  onReplay,
}: {
  b: BatonBlock;
  s: Stage;
  f: StageFeedback;
  d: Decision;
  busy: boolean;
  onFollowUp: (id: string) => void;
  onReplay: () => void;
}) {
  const ids = useId();
  const [seen, setSeen] = useState(false);
  const [follow, setFollow] = useState("");
  const next = useRef<HTMLHeadingElement>(null);
  // Once the preview has played (or been skipped), focus what comes next, after it has rendered.
  useEffect(() => {
    if (seen) next.current?.focus();
  }, [seen]);
  return (
    <div className="mt-3 flex flex-col gap-4">
      <Player
        frames={f.preview.frames}
        onDone={() => {
          if (!seen) setSeen(true);
        }}
      />
      {seen && f.needsFollowUp && (
        <section aria-labelledby={`${ids}-fu`} className={cx(warn, "p-4")}>
          <h5 id={`${ids}-fu`} ref={next} tabIndex={-1} className="font-serif text-lg font-semibold outline-none">
            It hasn’t been acknowledged
          </h5>
          <p className="mt-1">The handoff is still open: sending it isn’t the same as it being received. What do you do?</p>
          <Group legend="Your follow-up" name={`${ids}-f`} options={s.followUps} value={follow} onChange={setFollow} />
          <button type="button" className={cx(primary, "mt-3")} disabled={!follow || busy} onClick={() => onFollowUp(follow)}>
            Follow up
          </button>
        </section>
      )}
      {seen && !f.needsFollowUp && <Debrief b={b} f={f} headingRef={next} onReplay={onReplay} />}
    </div>
  );
}

/**
  About ten seconds: three captioned frames, a few seconds each. Pause and "Read outcome" skip ahead; with
  reduced motion the frames are all shown at once. The transcript has the same words.
*/
function Player({ frames, onDone }: { frames: Frame[]; onDone: () => void }) {
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [step, setStep] = useState(reduced ? frames.length - 1 : 0);
  const [playing, setPlaying] = useState(!reduced);
  const last = step >= frames.length - 1;
  const heading = useRef<HTMLHeadingElement>(null);
  // A sent handoff collapses the builder: bring the learner to what happens next.
  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView({ block: "start" });
  }, []);
  useEffect(() => {
    if (!playing || last) return;
    const t = setTimeout(() => setStep((x) => x + 1), 3300);
    return () => clearTimeout(t);
  }, [playing, last, step]);
  useEffect(() => {
    if (last) onDone();
  }, [last, onDone]);
  const visible = reduced ? frames : frames.slice(0, step + 1);
  return (
    <section aria-label="What happens next" className="rounded-3xl bg-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 ref={heading} tabIndex={-1} className="scroll-mt-24 font-semibold outline-none">
          What the next person sees
        </h5>
        <div className="flex gap-2">
          {!reduced && !last && (
            <button type="button" className={cx(secondary, "min-h-10 text-sm")} onClick={() => setPlaying((p) => !p)}>
              <Icon name={playing ? "pause" : "play"} className="size-4" /> {playing ? "Pause" : "Play"}
            </button>
          )}
          {!last && (
            <button
              type="button"
              className={cx(secondary, "min-h-10 text-sm")}
              onClick={() => {
                setPlaying(false);
                setStep(frames.length - 1);
              }}
            >
              Read outcome
            </button>
          )}
        </div>
      </div>
      <ol className="mt-3 grid gap-3 md:grid-cols-3" aria-live="polite">
        {visible.map((fr, i) => (
          <li key={fr.title} className={cx("rounded-2xl bg-surface p-3 ring-1 ring-line", !reduced && i === step && "animate-card-in")}>
            <p className="text-xs font-semibold text-ink-muted">
              {i + 1} of {frames.length}
            </p>
            <p className="font-semibold">{fr.title}</p>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {fr.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold">Transcript</summary>
        {frames.map((fr) => (
          <p key={fr.title} className="mt-1">
            <span className="font-semibold">{fr.title}.</span> {fr.lines.join(" ")}
          </p>
        ))}
      </details>
    </section>
  );
}

function Debrief({
  b,
  f,
  headingRef,
  onReplay,
}: {
  b: BatonBlock;
  f: StageFeedback;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onReplay: () => void;
}) {
  const notes = f.items.filter((x) => x.verdict === "poor" || x.verdict === "critical");
  const fine = f.items.filter((x) => x.verdict === "good" || x.verdict === "ok");
  return (
    <section aria-label="Debrief" className="flex flex-col gap-3">
      <h5 ref={headingRef} tabIndex={-1} className={cx(resultTone(f.result), "font-serif text-lg font-semibold outline-none")}>
        {RESULTS[f.result]}
        <span className="block text-sm font-normal">
          {f.result === "critical"
            ? "Replay this stage: a critical gap needs another go before the role counts."
            : f.result === "followup"
              ? "Safe, with something to follow up. There’s more than one safe way."
              : "A closed-loop handoff. There’s more than one safe way to do it."}
        </span>
      </h5>
      {f.dims.length > 0 && (
        <dl className="grid gap-2 sm:grid-cols-2">
          {f.dims.map((x) => (
            <div key={x.dim} className="rounded-xl bg-bg p-2 ring-1 ring-line">
              <dt className="text-sm font-semibold">{x.label}</dt>
              <dd className="text-sm">{RESULTS[x.result]}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={box}>
          <p className="font-semibold">What reached the next person?</p>
          {f.reached.length ? (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {f.reached.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">Nothing was sent.</p>
          )}
        </div>
        <div className={box}>
          <p className="font-semibold">What was still missing?</p>
          {f.missing.length ? (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {f.missing.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">Nothing needed was left out.</p>
          )}
        </div>
        <div className={box}>
          <p className="font-semibold">Who had the baton?</p>
          <p className="text-sm">{f.baton}</p>
        </div>
        <div className={box}>
          <p className="font-semibold">How did {b.person.name} experience this?</p>
          <p className="text-sm">{f.participant}</p>
        </div>
      </div>
      {notes.length > 0 && (
        <div className={box}>
          <p className="font-semibold">Worth looking at</p>
          <ul className="mt-1 flex flex-col gap-2">
            {notes.map((x) => (
              <li key={x.label}>
                <span className="font-semibold">{x.label}</span> <span className="text-sm">({VERDICTS[x.verdict]})</span>
                <span className="block text-sm">{x.feedback}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {fine.length > 0 && (
        <details className={box}>
          <summary className="cursor-pointer font-semibold">What went well ({fine.length})</summary>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {fine.map((x) => (
              <li key={x.label}>
                <span className="font-semibold">{x.label}:</span> {x.feedback}
              </li>
            ))}
          </ul>
        </details>
      )}
      {f.goodPath && (
        <div className={ok}>
          <p className="font-semibold">One good way</p>
          <p className="mt-1 text-sm">{f.goodPath}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={f.result === "critical" ? primary : secondary} onClick={onReplay}>
          <Icon name="refresh" className="size-4" /> {f.result === "critical" ? "Replay this stage" : "Try this stage again"}
        </button>
      </div>
    </section>
  );
}

function RelayMap({ b, map, complete }: { b: BatonBlock; map: RelayStop[]; complete: boolean }) {
  return (
    <section aria-labelledby={`${b.id}-map`} className="mt-6">
      <h4 id={`${b.id}-map`} className="font-serif text-xl font-semibold">
        The relay map
      </h4>
      <p className="text-sm text-ink-muted">
        {complete ? "Relay complete. " : ""}Who had the baton at each point. Roles you played show your latest handoff; the others show the authored story.
      </p>
      <ol className="mt-2 flex flex-col gap-2">
        {map.map((m) => (
          <li key={m.id} className={cx(box, "grid gap-1 sm:grid-cols-[9rem_1fr]")}>
            <div>
              <p className="font-semibold">{m.time}</p>
              <p className="text-sm">{m.label}</p>
              {m.role && <p className="text-xs text-ink-muted">{m.role}</p>}
            </div>
            <div>
              <p className="text-sm">{m.text}</p>
              <p className="mt-1 text-xs font-semibold">
                {m.kind === "event" ? "What happens" : m.played ? (m.result ? `You: ${RESULTS[m.result]}` : "You: still open") : "In the story"}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
