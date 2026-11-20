"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { useHydrated } from "@/lib/store";
import type { JourneyBlock } from "@/lib/magazine";
import {
  buildDebrief,
  emptyState,
  finishProblems,
  JOURNEY_NOTICE,
  PERSONA_IDS,
  PERSONA_ROLES,
  scoreJourney,
  tryTension,
  type Attempt,
  type JourneyDebrief,
  type JourneyState,
  type Milestone,
  type PersonaId,
  type Tension,
  type TensionFeedback,
} from "@/lib/journey";
import type { journeyState } from "@/server/journey";
import { Icon } from "../Icon";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  The SaH Journey (docs/sah-journey.md). A scrubber of milestones (buttons, arrow keys, previous and next) with the
  fictional story time and a note that it's never a wait estimate. At each milestone, four lanes, one per person;
  opening a lens shows what they know, what matters, what they can do, what they're waiting for and who can see
  it. Two lenses can be compared side by side. At a decision point the facts come first, then what to check, then
  the plan: actions by area and what to say. Feedback is in words, a path to debrief means looking again, and every
  try is kept. Nothing animates and nothing is timed.

  In the editor's preview it runs against the block as written and stores nothing.
*/

type Loaded = ReturnType<typeof journeyState>;
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const good = "rounded-2xl bg-[#e3f4e8] p-4 text-[#0f3d1f] dark:bg-[#123321] dark:text-[#b6ecc8]";
const errorText = (e: unknown, d: string) => (e instanceof Error ? e.message : d);
const blank = (): Attempt => ({ options: [], saying: "" });
/** A person's role, when their name doesn't already say it. */
const roleOf = (b: JourneyBlock, p: PersonaId) => (b.personas[p].name === PERSONA_ROLES[p] ? "" : PERSONA_ROLES[p]);

export function SahJourney({ block: b, ctx }: { block: JourneyBlock; ctx: InteractiveContext }) {
  const hydrated = useHydrated();
  const url = `/api/magazine/${ctx.guideId}/journey`;
  const loaded = useApi<Loaded>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<JourneyState | null>(null);
  const [decided, setDecided] = useState<Record<string, TensionFeedback>>({});
  const [debrief, setDebrief] = useState<JourneyDebrief | null>(null);
  const [earlierKey, setEarlierKey] = useState(false);
  const [lens, setLens] = useState<PersonaId | null>(null);
  const [compare, setCompare] = useState<[PersonaId, PersonaId] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const top = useRef<HTMLHeadingElement>(null);

  if (ctx.preview && hydrated && s === null) setS(emptyState());
  if (!ctx.preview && loaded.data && s === null) {
    setS(loaded.data.state);
    setDecided(loaded.data.decided);
    setDebrief(loaded.data.debrief);
    setEarlierKey(loaded.data.earlierKey);
  }

  // Where the learner is and the lenses they've opened save as they go. Decisions save only through a try.
  useEffect(() => {
    if (ctx.preview || !s || !dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      api(url, { body: { blockId: b.id, state: { at: s.at, lenses: s.lenses } } }).catch(() => undefined);
    }, 500);
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

  const total = b.milestones.length;
  const m = b.milestones[Math.min(s.at, total - 1)];
  if (!m)
    return (
      <Shell title={b.title}>
        <p className={box}>This journey has no milestones yet.</p>
      </Shell>
    );
  const tension = b.tensions.find((t) => t.milestoneId === m.id);
  const blocked = Boolean(tension && !s.settled.includes(tension.id));
  const explored = b.milestones.filter((x) => PERSONA_IDS.every((p) => (s.lenses[x.id] ?? []).includes(p))).length;
  const left = finishProblems(b, s);

  const change = (fn: (x: JourneyState) => JourneyState) => {
    dirty.current = true;
    setS((x) => (x ? fn(x) : x));
  };
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
  const go = (i: number) => {
    if (i < 0 || i >= total || i === s.at) return;
    // Moving on past a decision point waits for the decision; going back is always open.
    const firstOpen = b.milestones.findIndex((x, k) => k < i && b.tensions.some((t) => t.milestoneId === x.id && !s.settled.includes(t.id)));
    if (i > s.at && firstOpen !== -1) {
      setProblem(`Decide at “${b.milestones[firstOpen].label}” before moving on.`);
      return;
    }
    setProblem(null);
    setLens(null);
    setCompare(null);
    change((x) => ({ ...x, at: i }));
  };
  const opened = (ps: PersonaId[]) =>
    change((x) => {
      const had = x.lenses[m.id] ?? [];
      const all = [...new Set([...had, ...ps])];
      return all.length === had.length ? x : { ...x, lenses: { ...x.lenses, [m.id]: all } };
    });
  const openLens = (p: PersonaId) => {
    setCompare(null);
    setLens(p);
    opened([p]);
  };
  const openCompare = (pair: [PersonaId, PersonaId]) => {
    setLens(null);
    setCompare(pair);
    opened(pair);
  };

  const decide = (t: Tension, a: Attempt) =>
    run(async () => {
      if (ctx.preview) {
        const out = tryTension(b, s, t.id, a);
        if ("problem" in out) throw new Error(out.problem);
        setS(out.state);
        setDecided({ ...decided, [t.id]: out.feedback });
      } else {
        const out = await api<{ feedback: TensionFeedback; state: JourneyState }>(url, { body: { action: "try", blockId: b.id, tensionId: t.id, ...a } });
        // Keep the place and lenses already here; the try brings back the decisions.
        setS((x) => (x ? { ...x, tries: out.state.tries, settled: out.state.settled } : out.state));
        setDecided({ ...decided, [t.id]: out.feedback });
      }
    });
  const finish = () =>
    run(async () => {
      if (ctx.preview) {
        if (left.length) throw new Error(`Not yet. ${left.join(" ")}`);
        setDebrief(buildDebrief(b, s, scoreJourney(b, s)));
      } else {
        // Make sure the last lenses opened are saved before finishing.
        dirty.current = false;
        await api(url, { body: { blockId: b.id, state: { at: s.at, lenses: s.lenses } } });
        const out = await api<Loaded>(url, { body: { action: "finish", blockId: b.id } });
        setS(out.state);
        setDebrief(out.debrief);
        ctx.activity(b.id, { outcome: "finished" });
        ctx.engaged(b.id);
      }
      requestAnimationFrame(() => top.current?.focus());
    });
  const again = () =>
    run(async () => {
      setDebrief(null);
      setDecided({});
      setLens(null);
      setCompare(null);
      setEarlierKey(false);
      if (ctx.preview) setS(emptyState());
      else setS((await api<Loaded>(url, { body: { action: "restart", blockId: b.id } })).state);
      requestAnimationFrame(() => top.current?.focus());
    });

  if (debrief)
    return (
      <Shell title={b.title}>
        <Debrief b={b} d={debrief} headingRef={top} busy={busy} onAgain={() => void again()} />
      </Shell>
    );

  return (
    <Shell title={b.title}>
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{JOURNEY_NOTICE}</p>
      {b.intro && <p className="mt-3 text-lg">{b.intro}</p>}
      {earlierKey && (
        <p className={cx(warn, "mt-3")}>
          The decision guidance in this journey has been updated since you started. Your earlier tries are kept and read against the current guidance.
        </p>
      )}
      <details className={cx(box, "mt-3")}>
        <summary className="cursor-pointer font-semibold">Who’s in this journey</summary>
        <ul className="mt-2 flex flex-col gap-2">
          {PERSONA_IDS.map((p) => (
            <li key={p}>
              <strong>{b.personas[p].name}</strong> {roleOf(b, p) && <span className="text-ink-muted">({roleOf(b, p)})</span>}
              {b.personas[p].about && <span>: {b.personas[p].about}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm">
          <strong>What {b.personas.family.name} may be told:</strong> {b.consent}
        </p>
      </details>

      <Scrubber b={b} s={s} go={go} explored={explored} />

      {problem && (
        <p role="alert" className={cx(warn, "mt-3")}>
          {problem}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 ref={top} tabIndex={-1} className="font-serif text-xl font-semibold outline-none" aria-live="polite">
          {m.label}
        </h4>
        <span className="text-sm text-ink-muted">
          {m.time} · {m.status}
        </span>
      </div>
      <p className="mt-1 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm font-semibold">
        <Icon name="clock" className="size-4" /> {b.timeNote}
      </p>
      <p className="mt-2">{m.meaning}</p>
      <MilestoneContext m={m} />

      <Lanes b={b} m={m} seen={s.lenses[m.id] ?? []} lens={lens} onOpen={openLens} onCompare={openCompare} compare={compare} />
      {lens && <Lens b={b} m={m} p={lens} onClose={() => setLens(null)} />}
      {compare && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {compare.map((p) => (
            <Lens key={p} b={b} m={m} p={p} />
          ))}
          <div className="lg:col-span-2">
            <button type="button" className={secondary} onClick={() => setCompare(null)}>
              Close the comparison
            </button>
          </div>
        </div>
      )}

      {tension && (
        <Decision
          key={tension.id}
          t={tension}
          b={b}
          tries={s.tries[tension.id] ?? []}
          feedback={decided[tension.id]}
          settled={s.settled.includes(tension.id)}
          busy={busy}
          onTry={(a) => void decide(tension, a)}
        />
      )}

      <nav aria-label="Move through the journey" className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" className={secondary} disabled={s.at === 0} onClick={() => go(s.at - 1)}>
          <Icon name="arrow-left" className="size-4" /> Previous
        </button>
        {s.at < total - 1 ? (
          <button type="button" className={primary} disabled={blocked} onClick={() => go(s.at + 1)}>
            Next: {b.milestones[s.at + 1].label} <Icon name="arrow-right" className="size-4" />
          </button>
        ) : (
          <button type="button" className={primary} disabled={busy} onClick={() => void finish()}>
            See the whole journey
          </button>
        )}
        {blocked && <span className="text-sm text-ink-muted">Decide here before moving on.</span>}
      </nav>
      {s.at === total - 1 && left.length > 0 && (
        <div className={cx(box, "mt-3")}>
          <p className="font-semibold">Still to do before the whole journey:</p>
          <ul className="mt-1 list-disc pl-5">
            {left.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={`The SaH Journey: ${title}`} className="w-full rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="timeline" className="size-5" /> The SaH Journey · four perspectives
      </p>
      <h3 className="font-serif text-2xl font-semibold">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

/** The milestones in order. Arrow keys move along it; the current one is marked for screen readers too. */
function Scrubber({ b, s, go, explored }: { b: JourneyBlock; s: JourneyState; go: (i: number) => void; explored: number }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? i + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? b.milestones.length - 1
              : -2;
    if (to === -2) return;
    e.preventDefault();
    go(to);
    requestAnimationFrame(() => refs.current[Math.max(0, Math.min(b.milestones.length - 1, to))]?.focus());
  };
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">The journey</p>
        <p className="text-sm text-ink-muted">
          Explored {explored} of {b.milestones.length} · every view opened counts
        </p>
      </div>
      <ol className="mt-2 flex gap-2 overflow-x-auto pb-2" aria-label="Milestones">
        {b.milestones.map((x, i) => {
          const all = PERSONA_IDS.every((p) => (s.lenses[x.id] ?? []).includes(p));
          const here = i === s.at;
          const decision = b.tensions.some((t) => t.milestoneId === x.id);
          return (
            <li key={x.id} className="shrink-0">
              <button
                type="button"
                ref={(el) => {
                  refs.current[i] = el;
                }}
                aria-current={here ? "step" : undefined}
                onClick={() => go(i)}
                onKeyDown={(e) => onKey(e, i)}
                className={cx(
                  "flex min-h-11 w-40 flex-col items-start rounded-2xl px-3 py-2 text-left text-sm ring-1",
                  here ? "bg-action text-on-action ring-action" : "bg-bg ring-line hover:bg-muted",
                )}
              >
                <span className="font-semibold">{x.time}</span>
                <span className="line-clamp-2">{x.label}</span>
                <span className={cx("mt-1 text-xs", here ? "" : "text-ink-muted")}>
                  {[all ? "All four views opened" : "", decision ? "Decision point" : ""].filter(Boolean).join(" · ") || " "}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** What the milestone means, what's confirmed and not, the misconception to avoid, and the source. */
function MilestoneContext({ m }: { m: Milestone }) {
  return (
    <details className={cx(box, "mt-3")}>
      <summary className="cursor-pointer font-semibold">About this point: confirmed, not yet known, who’s responsible</summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {m.confirmed.length > 0 && (
          <div>
            <p className="font-semibold">Confirmed</p>
            <ul className="list-disc pl-5">
              {m.confirmed.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        {m.unknown.length > 0 && (
          <div>
            <p className="font-semibold">Not known yet</p>
            <ul className="list-disc pl-5">
              {m.unknown.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {m.misconception && (
        <p className="mt-3">
          <strong>A common misunderstanding:</strong> {m.misconception}
        </p>
      )}
      {m.responsible && (
        <p className="mt-2">
          <strong>Who’s responsible:</strong> {m.responsible}
        </p>
      )}
      {m.source.title && (
        <p className="mt-2 text-sm">
          Source:{" "}
          {m.source.url ? (
            <a href={m.source.url} target="_blank" rel="noreferrer" className="underline">
              {m.source.title} <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            m.source.title
          )}
        </p>
      )}
    </details>
  );
}

/** One lane per person at this milestone: what they know, and a button to open their view. */
function Lanes({
  b,
  m,
  seen,
  lens,
  compare,
  onOpen,
  onCompare,
}: {
  b: JourneyBlock;
  m: Milestone;
  seen: PersonaId[];
  lens: PersonaId | null;
  compare: [PersonaId, PersonaId] | null;
  onOpen: (p: PersonaId) => void;
  onCompare: (pair: [PersonaId, PersonaId]) => void;
}) {
  const ids = useId();
  const [a, setA] = useState<PersonaId>("person");
  const [c, setC] = useState<PersonaId>("coordinator");
  return (
    <div className="mt-4">
      <h5 className="font-semibold">Four views of this moment</h5>
      <ul className="mt-2 flex flex-col gap-2">
        {PERSONA_IDS.map((p) => (
          <li key={p} className={cx(box, "grid gap-2 sm:grid-cols-[11rem_1fr_auto] sm:items-center")}>
            <div className="sm:sticky sm:left-0">
              <p className="font-semibold">{b.personas[p].name}</p>
              {roleOf(b, p) && <p className="text-xs text-ink-muted">{roleOf(b, p)}</p>}
            </div>
            <p>{m.cards[p].knows}</p>
            <div className="flex items-center gap-2">
              {seen.includes(p) && (
                <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
                  <Icon name="check" className="size-4" /> Opened
                </span>
              )}
              <button type="button" className={secondary} aria-expanded={lens === p} onClick={() => onOpen(p)}>
                {b.personas[p].name}’s view
              </button>
            </div>
          </li>
        ))}
      </ul>
      <fieldset className="mt-3 flex flex-wrap items-end gap-2">
        <legend className="mb-1 text-sm font-semibold">Compare two perspectives</legend>
        {(
          [
            [a, setA, "First"],
            [c, setC, "Second"],
          ] as const
        ).map(([v, set, label]) => (
          <label key={label} className="flex flex-col text-sm">
            <span id={`${ids}-${label}`}>{label}</span>
            <select
              aria-labelledby={`${ids}-${label}`}
              className="min-h-11 rounded-xl border border-line-strong bg-bg px-3"
              value={v}
              onChange={(e) => set(e.target.value as PersonaId)}
            >
              {PERSONA_IDS.map((p) => (
                <option key={p} value={p}>
                  {b.personas[p].name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="button" className={secondary} disabled={a === c} aria-pressed={Boolean(compare)} onClick={() => onCompare([a, c])}>
          Compare side by side
        </button>
      </fieldset>
    </div>
  );
}

/** One person's view at one milestone. */
function Lens({ b, m, p, onClose }: { b: JourneyBlock; m: Milestone; p: PersonaId; onClose?: () => void }) {
  const c = m.cards[p];
  const ref = useRef<HTMLHeadingElement>(null);
  // A single opened view takes focus; compared views leave it on the compare button.
  const single = Boolean(onClose);
  useEffect(() => {
    if (single) ref.current?.focus();
  }, [p, m.id, single]);
  const rows: [string, string][] = [
    ["What they know", c.knows],
    ["What matters to them", c.matters],
    ["What they can do now", c.canDo],
    ["What they’re waiting for", c.waiting],
  ];
  return (
    <section aria-labelledby={`lens-${m.id}-${p}`} className={cx(box, "mt-3 bg-surface")}>
      <h5 id={`lens-${m.id}-${p}`} ref={ref} tabIndex={-1} className="font-serif text-lg font-semibold outline-none">
        {b.personas[p].name}’s view · {m.time}
      </h5>
      {roleOf(b, p) && <p className="text-sm text-ink-muted">{roleOf(b, p)}</p>}
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-sm font-semibold">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {c.quote && <blockquote className="mt-3 border-l-4 border-accent pl-3 italic">“{c.quote}”</blockquote>}
      <p className="mt-3 text-sm">
        <strong>Who can see this?</strong> {c.visibility || "Shared with the people in this conversation."}
      </p>
      {onClose && (
        <button type="button" className={cx(secondary, "mt-3")} onClick={onClose}>
          Close {b.personas[p].name}’s view
        </button>
      )}
    </section>
  );
}

/**
  A decision point, revealed in layers: what's known, then what to check, then the plan (actions by area, and what
  to say). After a try, the feedback in words; a path to debrief means looking again. Every try is kept.
*/
function Decision({
  t,
  b,
  tries,
  feedback,
  settled,
  busy,
  onTry,
}: {
  t: Tension;
  b: JourneyBlock;
  tries: Attempt[];
  feedback: TensionFeedback | undefined;
  settled: boolean;
  busy: boolean;
  onTry: (a: Attempt) => void;
}) {
  const ids = useId();
  const [layer, setLayer] = useState(tries.length ? 3 : 1);
  const [draft, setDraft] = useState<Attempt>(tries.length ? tries[tries.length - 1] : blank());
  const [editing, setEditing] = useState(!feedback);
  const [seenTries, setSeenTries] = useState(tries.length);
  const feedbackRef = useRef<HTMLHeadingElement>(null);
  const checkRef = useRef<HTMLHeadingElement>(null);
  const planRef = useRef<HTMLLegendElement>(null);
  // A new try came back: show its feedback.
  if (tries.length !== seenTries) {
    setSeenTries(tries.length);
    setEditing(false);
  }
  useEffect(() => {
    if (!editing && feedback && seenTries > 0) feedbackRef.current?.focus();
  }, [editing, feedback, seenTries]);
  const toggle = (id: string) => setDraft((d) => ({ ...d, options: d.options.includes(id) ? d.options.filter((x) => x !== id) : [...d.options, id] }));
  const reveal = (n: number) => {
    setLayer(n);
    requestAnimationFrame(() => (n === 2 ? checkRef.current : planRef.current)?.focus());
  };

  return (
    <section aria-labelledby={`${ids}-h`} className="mt-5 rounded-3xl bg-muted p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="branch" className="size-4" /> Decision point
      </p>
      <h5 id={`${ids}-h`} className="font-serif text-xl font-semibold">
        {t.title}
      </h5>
      <div className={cx(box, "mt-3")}>
        <p className="font-semibold">What’s known</p>
        <ul className="mt-1 list-disc pl-5">
          {t.known.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      {layer < 2 ? (
        <button type="button" className={cx(secondary, "mt-3")} onClick={() => reveal(2)}>
          What would you check?
        </button>
      ) : (
        <div className={cx(box, "mt-3")}>
          <p ref={checkRef} tabIndex={-1} className="font-semibold outline-none">
            What to check before acting
          </p>
          <ul className="mt-1 list-disc pl-5">
            {t.check.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {layer === 2 && (
        <button type="button" className={cx(secondary, "mt-3")} onClick={() => reveal(3)}>
          Plan your response
        </button>
      )}

      {layer >= 3 && editing && (
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onTry(draft);
          }}
        >
          {t.areas.map((a, i) => (
            <fieldset key={a.id} className={box}>
              <legend ref={i === 0 ? planRef : undefined} tabIndex={i === 0 ? -1 : undefined} className="px-1 font-semibold outline-none">
                {a.label}
              </legend>
              <p className="text-sm text-ink-muted">Choose any that you’d do.</p>
              <ul className="mt-2 flex flex-col gap-2">
                {a.options.map((x) => (
                  <li key={x.id}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-muted">
                      <input type="checkbox" className="mt-1 size-5" checked={draft.options.includes(x.id)} onChange={() => toggle(x.id)} />
                      <span>
                        {x.text}
                        {x.owner && <span className="block text-sm text-ink-muted">Who: {x.owner}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
          <fieldset className={box}>
            <legend className="px-1 font-semibold">What would you say?</legend>
            <ul className="mt-2 flex flex-col gap-2">
              {t.sayings.map((x) => (
                <li key={x.id}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-muted">
                    <input
                      type="radio"
                      name={`${ids}-say`}
                      className="mt-1 size-5"
                      checked={draft.saying === x.id}
                      onChange={() => setDraft((d) => ({ ...d, saying: x.id }))}
                    />
                    <span>
                      {x.to && <span className="block text-sm text-ink-muted">To {x.to}:</span>}“{x.text}”
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={primary} disabled={busy || !draft.options.length || !draft.saying}>
              {tries.length ? "Try this plan" : "Decide"}
            </button>
            {(!draft.options.length || !draft.saying) && <span className="text-sm text-ink-muted">Choose at least one action and what you’d say.</span>}
          </div>
        </form>
      )}

      {layer >= 3 && !editing && feedback && (
        <TryFeedback
          f={feedback}
          b={b}
          tries={tries.length}
          headingRef={feedbackRef}
          settled={settled}
          onAgain={() => {
            setEditing(true);
            requestAnimationFrame(() => planRef.current?.focus());
          }}
        />
      )}
      {layer >= 3 && !editing && !feedback && tries.length > 0 && (
        <button type="button" className={cx(secondary, "mt-3")} onClick={() => setEditing(true)}>
          Look at your plan again
        </button>
      )}
    </section>
  );
}

function TryFeedback({
  f,
  tries,
  settled,
  headingRef,
  onAgain,
}: {
  f: TensionFeedback;
  b: JourneyBlock;
  tries: number;
  settled: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onAgain: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3" aria-live="polite">
      <h6 ref={headingRef} tabIndex={-1} className={cx(f.stands ? good : warn, "font-semibold outline-none")}>
        {f.stands ? "This plan stands." : "Look again: part of this plan needs a debrief."}
        <span className="block text-sm font-normal">
          Try {tries}. {tries > 1 ? "Your first try is kept for the debrief." : "Every try is kept."}
        </span>
      </h6>
      {f.critical.length > 0 && (
        <div className={warn}>
          <p className="font-semibold">Needs a debrief</p>
          <ul className="mt-1 flex flex-col gap-2">
            {f.critical.map((x) => (
              <li key={x.text}>
                <span className="font-semibold">“{x.text}”</span>
                <span className="block">{x.feedback}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {f.gaps.length > 0 && (
        <div className={box}>
          <p className="font-semibold">What’s missing</p>
          <ul className="mt-1 flex flex-col gap-2">
            {f.gaps.map((x) => (
              <li key={x.area}>
                <span className="font-semibold">{x.area}:</span> {x.gap}
              </li>
            ))}
          </ul>
        </div>
      )}
      {f.chosen.some((x) => x.role !== "unsafe") && (
        <div className={box}>
          <p className="font-semibold">What you chose, and what happens</p>
          <ul className="mt-1 flex flex-col gap-2">
            {f.chosen
              .filter((x) => x.role !== "unsafe")
              .map((x) => (
                <li key={x.id}>
                  <span className="font-semibold">{x.text}</span>
                  <span className="block">{x.feedback}</span>
                  {x.consequence && <span className="block text-sm text-ink-muted">In the story: {x.consequence}</span>}
                </li>
              ))}
          </ul>
        </div>
      )}
      {f.saying && f.saying.good && (
        <div className={box}>
          <p className="font-semibold">What you said</p>
          <p>“{f.saying.text}”</p>
          <p className="mt-1">{f.saying.feedback}</p>
        </div>
      )}
      <div className={box}>
        <p className="font-semibold">How each part of the story is affected</p>
        <dl className="mt-1 grid gap-1 sm:grid-cols-2">
          {f.effects.map((x) => (
            <div key={x.dim}>
              <dt className="text-sm font-semibold">{x.label}</dt>
              <dd>{x.text}</dd>
            </div>
          ))}
        </dl>
      </div>
      {f.reviewed && (
        <div className={good}>
          <p className="font-semibold">The reviewed response</p>
          <p className="mt-1 whitespace-pre-line">{f.reviewed}</p>
        </div>
      )}
      <div>
        <button type="button" className={settled && f.stands ? secondary : primary} onClick={onAgain}>
          {f.stands ? "Try a different plan" : "Look again and change your plan"}
        </button>
      </div>
    </div>
  );
}

/** The whole journey: what each person knew and waited for at each point, how each part went, and each decision first and last. */
function Debrief({
  b,
  d,
  headingRef,
  busy,
  onAgain,
}: {
  b: JourneyBlock;
  d: JourneyDebrief;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  busy: boolean;
  onAgain: () => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-4">
      <h4 ref={headingRef} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
        The whole journey
      </h4>
      <p className="inline-flex items-center gap-2 self-start rounded-full bg-muted px-3 py-1 text-sm font-semibold">
        <Icon name="clock" className="size-4" /> {b.timeNote}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] border-separate border-spacing-1 text-left text-sm">
          <caption className="sr-only">What each person knew and was waiting for at each milestone</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 bg-surface p-2">
                Milestone
              </th>
              {PERSONA_IDS.map((p) => (
                <th key={p} scope="col" className="p-2">
                  {b.personas[p].name}
                  {roleOf(b, p) && <span className="block text-xs font-normal text-ink-muted">{roleOf(b, p)}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.map.map((m) => (
              <tr key={m.id}>
                <th scope="row" className="sticky left-0 bg-surface p-2 align-top">
                  {m.time}
                  <span className="block font-normal">{m.label}</span>
                </th>
                {m.people.map((p) => (
                  <td key={p.id} className="rounded-xl bg-bg p-2 align-top">
                    {p.knows}
                    <span className="mt-1 block text-ink-muted">Waiting for: {p.waiting}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h5 className="font-semibold">How each part went</h5>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {d.dims.map((x) => (
            <li key={x.id} className={box}>
              <p className="font-semibold">
                {x.label}: {x.rating}
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
      </div>
      <div>
        <h5 className="font-semibold">Your decisions</h5>
        <ul className="mt-2 flex flex-col gap-2">
          {d.decisions.map((x) => (
            <li key={x.id} className={box}>
              <p className="font-semibold">{x.title}</p>
              <p className="text-sm">
                {x.tries} {x.tries === 1 ? "try" : "tries"}.{" "}
                {x.first && (x.first.stands ? "Your first plan stood." : `Your first plan needed a debrief (${x.first.critical.length} to look at again).`)}{" "}
                {x.tries > 1 && x.last?.stands && "Your last plan stood."}
              </p>
              {x.last?.reviewed && <p className="mt-2 text-sm whitespace-pre-line">{x.last.reviewed}</p>}
            </li>
          ))}
        </ul>
      </div>
      {d.source.title && (
        <p className="text-sm text-ink-muted">
          Checked against {d.source.title}
          {d.source.version && `, version ${d.source.version}`}.
        </p>
      )}
      <div>
        <button type="button" className={secondary} disabled={busy} onClick={onAgain}>
          <Icon name="refresh" className="size-4" /> Start the journey again
        </button>
      </div>
    </div>
  );
}
