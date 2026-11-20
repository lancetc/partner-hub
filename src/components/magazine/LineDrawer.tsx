"use client";

import { useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { useHydrated } from "@/lib/store";
import type { LineBlock } from "@/lib/magazine";
import {
  answerCard,
  blankAnswer,
  complete,
  initialState,
  LANE_ORDER,
  LANES,
  LINE_NOTICE,
  NOT_COMPETENCE,
  replayCard,
  summarise,
  twistCard,
  type Answer,
  type Feedback,
  type Lane,
  type LineCase,
  type LineState,
  type LineSummary,
} from "@/lib/line";
import type { lineState } from "@/server/line";
import { Icon } from "../Icon";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  "Where Is the Line?" (docs/line-drawer.md). One card at a time: choose a lane (by button, or by dragging the card
  onto a lane on a wide screen), then the governing reason and a next action; the answer comes once all three are
  chosen. Right and wrong are said in words, never by colour or a flash. Nothing is timed. Focus moves to each new
  step, and the whole thing works by keyboard and screen reader.

  In the editor's preview it runs against the deck as written (approved cards only) and stores nothing.
*/

type Loaded = ReturnType<typeof lineState>;
type TwistResult = { caseId: string; lane: Lane; right: boolean; changed: boolean; before: Lane | ""; why: string };
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const errorText = (e: unknown, d: string) => (e instanceof Error ? e.message : d);

export function LineDrawer({ block: b, ctx }: { block: LineBlock; ctx: InteractiveContext }) {
  const hydrated = useHydrated();
  const url = `/api/magazine/${ctx.guideId}/line`;
  const loaded = useApi<Loaded>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<LineState | null>(null);
  const [answered, setAnswered] = useState<Record<string, Feedback>>({});
  const [summary, setSummary] = useState<LineSummary | null>(null);
  const [draft, setDraft] = useState<Answer>(blankAnswer());
  const [shown, setShown] = useState<Feedback | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const top = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLHeadingElement>(null);

  if (ctx.preview && hydrated && s === null) setS(initialState(b, new Date().toISOString().slice(0, 10)));
  if (!ctx.preview && loaded.data && s === null) {
    setS(loaded.data.state);
    setAnswered(loaded.data.answered);
    setSummary(loaded.data.summary);
  }

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

  const total = s.order.length;
  const current = shown ? undefined : b.cases.find((c) => c.id === s.order[s.at]);
  const focus = (r: React.RefObject<HTMLHeadingElement | null>) => requestAnimationFrame(() => r.current?.focus());
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

  const check = () =>
    run(async () => {
      if (!current) return;
      if (ctx.preview) {
        const out = answerCard(b, s, current.id, draft);
        if ("problem" in out) throw new Error(out.problem);
        setS(out.state);
        setShown(out.feedback);
        setAnswered({ ...answered, [current.id]: out.feedback });
      } else {
        const out = await api<{ feedback: Feedback; state: LineState }>(url, { body: { blockId: b.id, caseId: current.id, answer: draft } });
        setS(out.state);
        setShown(out.feedback);
        setAnswered({ ...answered, [current.id]: out.feedback });
      }
      focus(feedbackRef);
    });
  const next = () => {
    setShown(null);
    setDraft(blankAnswer());
    focus(top);
  };
  const finish = () =>
    run(async () => {
      if (ctx.preview) setSummary(summarise(b, s));
      else {
        const out = await api<Loaded>(url, { body: { action: "finish", blockId: b.id } });
        setS(out.state);
        setSummary(out.summary);
        ctx.activity(b.id, { outcome: "finished" });
        ctx.engaged(b.id);
      }
      setShown(null);
      focus(top);
    });
  const again = () =>
    run(async () => {
      setSummary(null);
      setShown(null);
      setAnswered({});
      setDraft(blankAnswer());
      if (ctx.preview) setS(initialState(b, new Date().toISOString().slice(0, 10)));
      else setS((await api<Loaded>(url, { body: { action: "restart", blockId: b.id } })).state);
      focus(top);
    });

  return (
    <Shell title={b.title}>
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{LINE_NOTICE}</p>
      {b.intro && <p className="mt-3 text-lg">{b.intro}</p>}
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        {LANE_ORDER.map((l) => (
          <div key={l} className={box}>
            <dt className="font-semibold">{LANES[l].label}</dt>
            <dd className="mt-1 text-sm">{LANES[l].text}</dd>
          </div>
        ))}
      </dl>
      {problem && (
        <p role="alert" className={cx(warn, "mt-3")}>
          {problem}
        </p>
      )}

      {total === 0 ? (
        <p className={cx(box, "mt-4")}>These cards are being reviewed and aren’t available yet. Only approved cards within their review date are shown.</p>
      ) : summary ? (
        <LineMap block={b} url={url} preview={Boolean(ctx.preview)} s={s} summary={summary} headingRef={top} onAgain={() => void again()} />
      ) : (
        <>
          <h4 ref={top} tabIndex={-1} className="mt-5 text-sm font-semibold text-ink-muted outline-none" aria-live="polite">
            Card {Math.min(s.at + (shown ? 0 : 1), total)} of {total} · no time limit
          </h4>
          {shown ? (
            <div className="mt-2 flex flex-col gap-3">
              <FeedbackPanel f={shown} c={b.cases.find((c) => c.id === shown.caseId)!} given={s.answers[shown.caseId]} headingRef={feedbackRef} />
              <div>
                {s.at < total ? (
                  <button type="button" className={primary} onClick={next}>
                    Next card
                  </button>
                ) : (
                  <button type="button" className={primary} disabled={busy} onClick={() => void finish()}>
                    See your line map
                  </button>
                )}
              </div>
            </div>
          ) : current ? (
            <CardBoard c={current} draft={draft} setDraft={setDraft} busy={busy} onCheck={() => void check()} />
          ) : (
            <div className="mt-2">
              <button type="button" className={primary} disabled={busy} onClick={() => void finish()}>
                See your line map
              </button>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={`Where Is the Line?: ${title}`} className="w-full rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="sorting" className="size-5" /> Where is the line? · practice
      </p>
      <h3 className="font-serif text-2xl font-semibold">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

/** One card: the request, then a lane (button or drag), the reason and the next action. */
function CardBoard({ c, draft, setDraft, busy, onCheck }: { c: LineCase; draft: Answer; setDraft: (a: Answer) => void; busy: boolean; onCheck: () => void }) {
  const ids = useId();
  const reasonsRef = useRef<HTMLLegendElement>(null);
  const [dragging, setDragging] = useState(false);
  const chooseLane = (l: Lane) => {
    setDraft({ ...draft, lane: l });
    requestAnimationFrame(() => reasonsRef.current?.focus());
  };
  return (
    <div className="mt-2 flex flex-col gap-4">
      <article
        aria-labelledby={`${ids}-req`}
        draggable
        onDragStart={(e) => {
          setDragging(true);
          e.dataTransfer.setData("text/plain", c.id);
        }}
        onDragEnd={() => setDragging(false)}
        className={cx(box, "flex flex-col gap-2")}
      >
        <p id={`${ids}-req`} className="font-serif text-xl">
          “{c.request}”
        </p>
        {c.facts.length > 0 && (
          <ul className="list-disc pl-5 text-sm">
            {c.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        {(c.know || c.funding) && (
          <details>
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">What do you know?</summary>
            {c.know && <p className="text-sm">{c.know}</p>}
            {c.funding && <p className="mt-1 text-sm">{c.funding}</p>}
          </details>
        )}
      </article>

      <div role="group" aria-label="Choose a lane" className="grid gap-2 md:grid-cols-3">
        {LANE_ORDER.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={draft.lane === l}
            onClick={() => chooseLane(l)}
            onDragOver={(e) => dragging && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              chooseLane(l);
            }}
            className={cx(
              "flex min-h-16 flex-col items-start rounded-2xl border-2 px-4 py-3 text-left",
              draft.lane === l ? "border-accent bg-muted" : "border-line-strong bg-surface hover:bg-muted",
              dragging && "border-dashed",
            )}
          >
            <span className="font-semibold">{LANES[l].label}</span>
            {draft.lane === l && <span className="text-sm">Chosen</span>}
          </button>
        ))}
      </div>

      {draft.lane && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend ref={reasonsRef} tabIndex={-1} className="mb-1 font-semibold outline-none">
              The governing reason
            </legend>
            {c.reasons.map((r) => (
              <label key={r.id} className={cx(box, "flex min-h-11 cursor-pointer items-start gap-3 py-3")}>
                <input
                  type="radio"
                  name={`${ids}-reason`}
                  className="mt-1 size-5"
                  checked={draft.reason === r.id}
                  onChange={() => setDraft({ ...draft, reason: r.id })}
                />
                <span>{r.text}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">What you’d do or say next</legend>
            {c.actions.map((r) => (
              <label key={r.id} className={cx(box, "flex min-h-11 cursor-pointer items-start gap-3 py-3")}>
                <input
                  type="radio"
                  name={`${ids}-action`}
                  className="mt-1 size-5"
                  checked={draft.action === r.id}
                  onChange={() => setDraft({ ...draft, action: r.id })}
                />
                <span>{r.text}</span>
              </label>
            ))}
          </fieldset>
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primary} disabled={busy || !complete(draft)} onClick={onCheck}>
          Check this card
        </button>
        {!complete(draft) && (
          <p className="text-sm text-ink-muted">Choose a lane, the governing reason and a next action. You can change them until you check.</p>
        )}
      </div>
    </div>
  );
}

function FeedbackPanel({ f, c, given, headingRef }: { f: Feedback; c: LineCase; given?: Answer; headingRef?: React.RefObject<HTMLHeadingElement | null> }) {
  const said = (ok: boolean, what: string) => (ok ? `${what}: matches the reviewed answer.` : `${what}: not this time.`);
  return (
    <section aria-label="Feedback" className={cx(box, "flex flex-col gap-2")}>
      <h5 ref={headingRef} tabIndex={-1} className="font-serif text-lg font-semibold outline-none">
        {LANES[f.lane].label}
      </h5>
      <p className="text-sm">“{c.request}”</p>
      <ul className="text-sm">
        <li>
          {said(f.laneRight, "Lane")}
          {!f.laneRight && given?.lane ? ` You chose ${LANES[given.lane as Lane].label.toLowerCase()}.` : ""}
        </li>
        <li>{said(f.reasonRight, "Reason")}</li>
        <li>{said(f.actionRight, "Next action")}</li>
      </ul>
      <p>
        <span className="font-semibold">The governing reason: </span>
        {f.reason}
      </p>
      <p>
        <span className="font-semibold">The person’s choice: </span>
        {f.choice}
      </p>
      <p>
        <span className="font-semibold">Next step: </span>
        {f.next}
      </p>
      {f.debrief && (
        <p className={warn}>
          <span className="font-semibold">Talk this one through with your team leader. </span>
          {f.debrief}
        </p>
      )}
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">See why</summary>
        <p>{f.why}</p>
        {f.secondary.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-sm">
            {f.secondary.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        {f.refs.length > 0 && (
          <p className="mt-2 text-sm text-ink-muted">
            Sources: {f.refs.join("; ")}
            {f.sop ? `. Procedure: ${f.sop}` : ""}
            {f.escalation ? `. Escalation: ${f.escalation}` : ""}.
          </p>
        )}
      </details>
    </section>
  );
}

function LineMap({
  block: b,
  url,
  preview,
  s,
  summary: m,
  headingRef,
  onAgain,
}: {
  block: LineBlock;
  url: string;
  preview: boolean;
  s: LineState;
  summary: LineSummary;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onAgain: () => void;
}) {
  const [replaying, setReplaying] = useState<string | null>(null);
  const [replay, setReplay] = useState<Answer>(blankAnswer());
  const [replayedNow, setReplayed] = useState<Record<string, Feedback>>({});
  const [twistsNow, setTwists] = useState<Record<string, TwistResult>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const caseOf = (id: string) => b.cases.find((c) => c.id === id)!;

  // Earlier replays and second-pass answers from the server, with anything done since on top.
  const loaded = useApi<{ replayed: Record<string, Feedback>; twists: Record<string, TwistResult> }>(preview ? null : `${url}?block=${b.id}`);
  const replayed = { ...(loaded.data?.replayed ?? {}), ...replayedNow };
  const twists = { ...(loaded.data?.twists ?? {}), ...twistsNow };

  const sendReplay = async (id: string) => {
    setProblem(null);
    try {
      if (preview) {
        const out = replayCard(b, s, id, replay);
        if ("problem" in out) throw new Error(out.problem);
        setReplayed({ ...replayedNow, [id]: out.feedback });
      } else {
        const out = await api<{ feedback: Feedback }>(url, { body: { action: "revisit", kind: "replay", blockId: b.id, caseId: id, answer: replay } });
        setReplayed({ ...replayedNow, [id]: out.feedback });
      }
    } catch (e) {
      setProblem(errorText(e, "That didn’t send."));
    }
  };
  const sendTwist = async (id: string, lane: Lane) => {
    setProblem(null);
    try {
      if (preview) {
        const out = twistCard(b, s, id, lane);
        if ("problem" in out) throw new Error(out.problem);
        setTwists({ ...twistsNow, [id]: out.result });
      } else {
        const out = await api<{ twist: TwistResult }>(url, { body: { action: "revisit", kind: "twist", blockId: b.id, caseId: id, lane } });
        setTwists({ ...twistsNow, [id]: out.twist });
      }
    } catch (e) {
      setProblem(errorText(e, "That didn’t send."));
    }
  };

  return (
    <div className="mt-5 flex flex-col gap-4">
      <h4 ref={headingRef} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
        Your line map
      </h4>
      <p>
        {m.total} cards. Lane matched on {m.lane}, the governing reason on {m.reason}, the next action on {m.action}. All three on {m.mastered}.
      </p>
      {(m.overControl > 0 || m.premature > 0) && (
        <div className={warn}>
          {m.overControl > 0 && (
            <p>
              <span className="font-semibold">Stricter than the facts call for, on {m.overControl === 1 ? "one card" : `${m.overControl} cards`}. </span>
              Watch for drawing the line too tight: checks or vetoes where the person’s choice stands.
            </p>
          )}
          {m.premature > 0 && (
            <p className={m.overControl > 0 ? "mt-1" : ""}>
              <span className="font-semibold">Looser than the facts allow, on {m.premature === 1 ? "one card" : `${m.premature} cards`}. </span>
              Watch for approving before the checks are done.
            </p>
          )}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {m.map.map((col) => (
          <section key={col.lane} aria-label={LANES[col.lane].label} className={box}>
            <h5 className="font-semibold">{LANES[col.lane].label}</h5>
            <p className="text-xs text-ink-muted">
              You placed {col.placed.length}; the reviewed answers put {col.reviewed.length} here.
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {col.placed.map((p) => (
                <li key={p.id}>
                  “{p.request}” <span className="font-semibold">{p.right ? "(matches)" : "(reviewed elsewhere)"}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {m.debriefs.length > 0 && (
        <section aria-label="Worth talking through" className={warn}>
          <h5 className="font-semibold">Worth talking through with your team leader</h5>
          <ul className="mt-1 list-disc pl-5">
            {m.debriefs.map((d) => (
              <li key={d.id}>
                “{d.request}”: {d.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {problem && (
        <p role="alert" className={warn}>
          {problem}
        </p>
      )}

      {m.missed.length > 0 && (
        <section aria-label="Try the missed cards again" className="flex flex-col gap-2">
          <h5 className="font-semibold">Try the missed cards again</h5>
          <p className="text-sm text-ink-muted">Your first answers stay on the record.</p>
          {m.missed.map((id) => {
            const c = caseOf(id);
            return (
              <div key={id} className={box}>
                <p>“{c.request}”</p>
                {replayed[id] ? (
                  <FeedbackPanel f={replayed[id]} c={c} />
                ) : replaying === id ? (
                  <CardBoard c={c} draft={replay} setDraft={setReplay} busy={false} onCheck={() => void sendReplay(id)} />
                ) : (
                  <button
                    type="button"
                    className={cx(secondary, "mt-2")}
                    onClick={() => {
                      setReplaying(id);
                      setReplay(blankAnswer());
                    }}
                  >
                    Try it again
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {m.twists.length > 0 && (
        <section aria-label="One new fact" className="flex flex-col gap-2">
          <h5 className="font-semibold">One new fact: does the line move?</h5>
          {m.twists.map((id) => {
            const c = caseOf(id);
            const t = twists[id];
            return (
              <div key={id} className={box}>
                <p>“{c.request}”</p>
                <p className="mt-1 text-sm">You first chose: {s.answers[id]?.lane ? LANES[s.answers[id].lane as Lane].label : "—"}.</p>
                <p className="mt-2 font-semibold">{c.twist?.fact}</p>
                {t ? (
                  <p className="mt-2">
                    <span className="font-semibold">
                      {t.right ? "Yes: " : "Not this time: "}
                      {LANES[t.lane].label}.
                    </span>{" "}
                    {t.changed ? "The new fact changes the answer. " : "The answer stays the same. "}
                    {t.why}
                  </p>
                ) : (
                  <div role="group" aria-label="Choose a lane after the new fact" className="mt-2 grid gap-2 md:grid-cols-3">
                    {LANE_ORDER.map((l) => (
                      <button key={l} type="button" className={secondary} onClick={() => void sendTwist(id, l)}>
                        {LANES[l].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      <p className="text-sm text-ink-muted">{NOT_COMPETENCE}</p>
      <div>
        <button type="button" className={secondary} onClick={onAgain}>
          Start the deck again
        </button>
      </div>
    </div>
  );
}
