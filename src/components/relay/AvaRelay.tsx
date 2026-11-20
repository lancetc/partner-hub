"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useReducer, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  answerParts,
  RELAY_IDLE,
  RELAY_MAX_QUESTION,
  RELAY_MODES,
  RELAY_PARTS,
  relayCanSend,
  relayNext,
  relayStatus,
  relayTimer,
  type RelayEvent,
  type RelayEventName,
  type RelayMode,
  type RelayState,
} from "@/lib/relay";
import type { RelayLinked, RelayStreamEvent, RelayTurnView } from "@/server/relay";
import type { CharacterHistory } from "@/server/story";
import { Icon } from "../Icon";

/*
  Ava Relay for learners (docs/ava-relay.md): one dial bar at the top of a Magazine page, and the terminal modal
  it opens. The bar is a button that looks like an input; nothing can be typed until the modal is open.

  The animation and the connection are separate. Dialling starts both: the bar tunes and the modal's parts
  resolve in order, while the server makes the conversation ready. "SIGNAL LINKED" and a usable composer wait for
  both. A failure shows at once, with the page still readable behind it. With reduced motion the modal opens
  complete.
*/

/** An author trying the saved draft: the answers to pretend the learner has given, and whether they've watched the opening. */
export type RelayPreview = { guideId: string; answers: Record<string, string>; watched?: boolean; as?: string };
type Props = {
  slug: string;
  revisionId: string;
  pageId: string;
  preview?: RelayPreview;
  className?: string;
  /** Overrides the device's setting, for an author checking the reduced-motion path. */
  reducedMotion?: boolean;
  /** Runs before a dial, and can stop it: an editor saves the draft first, so the preview is of what's on screen. */
  beforeDial?: () => Promise<boolean>;
};

const key = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function AvaRelay({ slug, revisionId, pageId, preview, className, reducedMotion, beforeDial }: Props) {
  const [state, dispatch] = useReducer((s: RelayState, e: { event: RelayEvent; reduced?: boolean }) => relayNext(s, e.event, e.reduced), RELAY_IDLE);
  // Whether this opening skips the effects: decided when the bar is pressed.
  const [reduced, setReduced] = useState(false);
  const go = useCallback((event: RelayEvent) => dispatch({ event }), []);
  const [linked, setLinked] = useState<RelayLinked | null>(null);
  const [failure, setFailure] = useState("");
  const [mode, setMode] = useState<RelayMode>("story");
  const [turns, setTurns] = useState<RelayTurnView[]>([]);
  const [pending, setPending] = useState<{ question: string } | null>(null);
  const [askError, setAskError] = useState("");
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<{ id: string; name: string } | null>(null);
  const bar = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const middle = useRef<HTMLDivElement>(null);
  const asking = useRef<AbortController | null>(null);
  const session = useRef("");
  const uid = useId();

  const send = useCallback(
    (event: RelayEventName, extra: { mode?: RelayMode; outcome?: string } = {}) => {
      if (preview) return;
      void api("/api/relay", {
        body: { action: "event", slug, pageId, sessionId: session.current, event, key: key(), mode: extra.mode ?? mode, outcome: extra.outcome ?? "" },
      }).catch(() => {});
    },
    [preview, slug, pageId, mode],
  );

  /** Makes the conversation ready. Its result, not the animation, decides whether anything can be sent. */
  const connect = useCallback(
    async (fresh = false) => {
      setFailure("");
      try {
        const l = await api<RelayLinked>("/api/relay", { body: { action: "link", slug, revisionId, pageId, mode, fresh, preview } });
        session.current = l.sessionId;
        setLinked(l);
        setTurns(l.turns);
        go("linked");
        if (!preview)
          void api("/api/relay", { body: { action: "event", slug, pageId, sessionId: l.sessionId, event: "ava_relay_linked", key: key(), mode } }).catch(
            () => {},
          );
      } catch (e) {
        setFailure(e instanceof Error ? e.message : "Ava’s relay couldn’t connect.");
        go("failed");
        send("ava_relay_failed", { outcome: "link" });
      }
    },
    [slug, revisionId, pageId, mode, preview, go, send],
  );

  const waiting = useRef(false);
  const dial = async () => {
    if (state.phase !== "idle" || waiting.current) return;
    if (beforeDial) {
      waiting.current = true;
      const ok = await beforeDial().catch(() => false);
      waiting.current = false;
      if (!ok) return;
    }
    const still = reducedMotion ?? reduceMotion();
    setReduced(still);
    // Anything playing on the page stops, and keeps its place.
    document.querySelectorAll<HTMLMediaElement>("video, audio").forEach((m) => {
      if (!m.paused) m.pause();
    });
    dispatch({ event: "dial", reduced: still });
    send("ava_relay_dialled");
    void connect();
  };

  // The one timer a state needs: the bar's tuning, then each part of the modal in turn.
  useEffect(() => {
    const t = relayTimer(state);
    if (!t) return;
    const id = window.setTimeout(() => go(t.event), t.ms);
    return () => window.clearTimeout(id);
  }, [state, go]);

  // The modal opens when the bar has finished tuning (at once with reduced motion, or on a failure).
  const open = state.phase === "resolving" || state.phase === "open";
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      panel.current?.focus();
      const scroll = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = scroll;
      };
    }
  }, [open]);

  const close = useCallback(() => {
    asking.current?.abort();
    asking.current = null;
    if (dialog.current?.open) dialog.current.close();
    if (state.phase !== "idle") send("ava_relay_closed");
    go("close");
    setPending(null);
    setAskError("");
    setHistory(null);
    bar.current?.focus();
  }, [go, send, state.phase]);

  // Leaving the page cancels an answer that's still being written.
  useEffect(() => () => asking.current?.abort(), []);

  const canSend = relayCanSend(state) && !pending;
  // Once everything has settled, the composer takes focus, unless the learner has already moved it.
  const ready = relayCanSend(state);
  useEffect(() => {
    if (ready && (document.activeElement === panel.current || document.activeElement === document.body)) composer.current?.focus();
  }, [ready]);
  // The latest message is in view: when something is said, and when the modal opens on an earlier conversation.
  // On a phone the whole middle scrolls; on a wider screen, only the conversation.
  useEffect(() => {
    for (const el of [log.current, middle.current]) if (el && (turns.length || pending)) el.scrollTo({ top: el.scrollHeight });
  }, [turns, pending, askError, mode, open, ready]);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || !canSend || !linked) return;
    setAskError("");
    setDraft("");
    setPending({ question });
    const ctrl = new AbortController();
    asking.current = ctrl;
    try {
      const res = await fetch("/api/relay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "ask",
          sessionId: linked.sessionId,
          pageId,
          mode,
          text: question,
          key: key(),
          preview,
          ...(preview && { turns: turns.map((t) => ({ role: t.role, mode: t.mode, text: t.text, kind: t.kind })) }),
        }),
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok || !res.body) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Ava couldn’t answer just now.");
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let learner: RelayTurnView | null = null;
      let done = false;
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as RelayStreamEvent;
          if (e.type === "start") learner = e.learner;
          else if (e.type === "final") {
            const turn = e.turn;
            setTurns((t) => [...t, ...(learner ? [learner] : []), turn]);
            done = true;
          } else if (e.type === "error") {
            if (learner) setTurns((t) => [...t, learner!]);
            setAskError(e.message);
            done = true;
          }
        }
      }
      if (!done) throw new Error("Ava’s answer was cut off. Try again.");
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setAskError(e instanceof Error ? e.message : "Ava couldn’t answer just now.");
        setDraft((d) => d || question);
      }
    } finally {
      if (asking.current === ctrl) asking.current = null;
      setPending(null);
      composer.current?.focus();
    }
  };

  const changeMode = (next: RelayMode) => {
    if (next === mode) return;
    setMode(next);
    send("ava_relay_mode_changed", { mode: next });
  };

  const shown = (part: (typeof RELAY_PARTS)[number]) => state.shown > RELAY_PARTS.indexOf(part);
  const part = (name: (typeof RELAY_PARTS)[number]) => ({ "data-shown": shown(name), "data-pulse": !reduced });
  const status = relayStatus(state);
  const dialling = state.phase === "dialling";
  const prompts = linked ? linked.prompts[mode] : [];
  const lastPage = turns.length ? turns[turns.length - 1].pageId : pageId;

  return (
    <div className={className}>
      <button
        ref={bar}
        type="button"
        onClick={() => void dial()}
        aria-label="Dial Ava’s relay to check in"
        aria-haspopup="dialog"
        aria-busy={dialling}
        data-relay-bar={state.phase}
        className="relay relay-bar flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left"
      >
        {dialling && <span className="relay-sweep" aria-hidden />}
        <span aria-hidden className="relay-mono text-lg text-[var(--relay-glow)]">
          ›
        </span>
        <span className="min-w-0 flex-1 truncate text-[1.02rem] text-[var(--relay-ink)]">{dialling ? "Establishing field relay…" : "Check in with Ava…"}</span>
        <span className="relay-mono inline-flex items-center gap-1.5 text-xs font-bold text-[var(--relay-glow)]">
          <RelayWave /> {dialling ? "TUNING" : "DIAL"}
        </span>
      </button>
      {/* Told to a screen reader while the bar tunes; the modal has its own status once it's open. */}
      <span className="sr-only" role="status">
        {dialling ? "Establishing field relay" : ""}
      </span>

      <dialog
        ref={dialog}
        className="relay relay-dialog"
        aria-labelledby={`${uid}-title`}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          // A click on the dimmed page closes it, unless there's something typed and not sent.
          if (e.target === dialog.current && !draft.trim()) close();
        }}
      >
        {open && (
          <div ref={panel} tabIndex={-1} className="relay-scan flex h-full flex-col outline-none" data-relay-status={status}>
            <header {...part("header")} className="relay-part flex items-center gap-3 border-b border-[var(--relay-line)] px-4 py-3">
              <div className="min-w-0 flex-1">
                <p id={`${uid}-title`} className="relay-mono text-xs font-bold text-[var(--relay-glow)]">
                  TC / FIELD RELAY
                </p>
                <p role="status" aria-live="polite" className="relay-mono mt-0.5 flex items-center gap-1.5 text-xs text-[var(--relay-dim)]">
                  <span
                    aria-hidden
                    className={cx(
                      "inline-block size-2 rounded-full",
                      status === "SIGNAL LINKED" ? "bg-[var(--relay-glow)]" : status === "NO SIGNAL" ? "bg-[#ff9d8a]" : "bg-[var(--relay-line)]",
                    )}
                  />
                  {status}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--relay-line)] px-3 text-sm font-semibold text-[var(--relay-ink)] hover:border-[var(--relay-glow)]"
              >
                <Icon name="close" className="size-4" /> Close
              </button>
            </header>

            <div ref={middle} className="relay-middle">
              <div {...part("ava")} className="relay-part flex items-center gap-3 px-4 pt-4">
                {linked?.ava.portrait ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={linked.ava.portrait} alt="" className="size-12 rounded-full border border-[var(--relay-line)] object-cover" />
                ) : (
                  <span
                    aria-hidden
                    className="relay-mono grid size-12 place-items-center rounded-full border border-[var(--relay-line)] bg-[var(--relay-raised)] text-lg font-bold text-[var(--relay-glow)]"
                  >
                    {linked?.ava.monogram ?? "A"}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="font-semibold">{linked?.ava.name ?? "Ava"}</p>
                  <p className="text-sm text-[var(--relay-dim)]">{linked?.ava.line || "A fictional guide"} · Fictional character, AI guide</p>
                </div>
              </div>

              <div {...part("tabs")} className="relay-part relay-tabs px-4 pt-4">
                <div role="tablist" aria-label="What to ask Ava about" className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--relay-line)] p-1">
                  {(Object.keys(RELAY_MODES) as RelayMode[]).map((m) => {
                    const off = m === "work" && linked ? !linked.work : false;
                    return (
                      <button
                        key={m}
                        type="button"
                        role="tab"
                        id={`${uid}-tab-${m}`}
                        aria-selected={mode === m}
                        aria-controls={`${uid}-panel`}
                        disabled={off}
                        onClick={() => changeMode(m)}
                        className={cx(
                          "relay-mono min-h-11 rounded-lg px-2 text-xs font-bold uppercase",
                          mode === m ? "bg-[var(--relay-glow)] text-[#03201d]" : "text-[var(--relay-dim)] hover:text-[var(--relay-ink)]",
                          off && "cursor-not-allowed opacity-50",
                        )}
                      >
                        {mode === m && <span className="sr-only">Selected: </span>}
                        {RELAY_MODES[m]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div {...part("context")} className="relay-part px-4 pt-3">
                {linked && (
                  <div className="rounded-xl border border-[var(--relay-line)] bg-[var(--relay-panel)] px-3 py-2.5 text-sm">
                    {mode === "story" ? (
                      <>
                        <p className="font-semibold">
                          {linked.card.course}
                          {linked.card.page !== linked.card.course && <span className="font-normal text-[var(--relay-dim)]"> · {linked.card.page}</span>}
                        </p>
                        <p className="mt-0.5 text-[var(--relay-dim)]">{[linked.card.scene, linked.card.where].filter(Boolean).join(" · ")}</p>
                        {linked.card.people.length > 0 && (
                          <p className="mt-1.5 flex flex-wrap gap-1.5">
                            {linked.card.people.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => setHistory(history?.id === p.id ? null : p)}
                                aria-expanded={history?.id === p.id}
                                className="inline-flex min-h-8 items-center gap-1 rounded-full border border-[var(--relay-line)] px-2.5 text-xs font-semibold hover:border-[var(--relay-glow)]"
                              >
                                <Icon name="book" className="size-3.5" /> {p.name}’s story so far
                              </button>
                            ))}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="font-semibold">Work guidance</p>
                        <p className="mt-0.5 text-[var(--relay-dim)]">
                          Approved Hub guidance you can open, with its source. The story you came from is fiction and isn’t used as policy.
                        </p>
                      </>
                    )}
                  </div>
                )}
                {history && linked && <PersonHistory person={history} episode={linked.card.episode} onClose={() => setHistory(null)} />}
              </div>

              <div
                ref={log}
                {...part("message")}
                id={`${uid}-panel`}
                role="tabpanel"
                aria-labelledby={`${uid}-tab-${mode}`}
                className="relay-part relay-log relative min-h-0 flex-1 overflow-y-auto px-4 py-4"
              >
                {state.link === "failed" ? (
                  <div role="alert" className="rounded-xl border border-[#ff9d8a]/60 bg-[var(--relay-panel)] p-4">
                    <p className="font-semibold">The relay couldn’t connect.</p>
                    <p className="mt-1 text-sm text-[var(--relay-dim)]">
                      {failure || "Ava’s relay isn’t available right now."} Your page and its activities are still here.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          go("retry");
                          void connect();
                        }}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--relay-glow)] px-4 text-sm font-bold text-[#03201d]"
                      >
                        <Icon name="refresh" className="size-4" /> Retry
                      </button>
                      <button
                        type="button"
                        onClick={close}
                        className="inline-flex min-h-11 items-center rounded-full border border-[var(--relay-line)] px-4 text-sm font-semibold hover:border-[var(--relay-glow)]"
                      >
                        Continue reading
                      </button>
                    </div>
                  </div>
                ) : !linked ? (
                  <p className="text-sm text-[var(--relay-dim)]">Connecting to Ava…</p>
                ) : (
                  <ol className="flex flex-col gap-3">
                    <li>
                      <AvaBubble name={linked.ava.name}>
                        {mode === "story"
                          ? linked.opening
                          : "Ask me a work question and I’ll look for approved guidance on the Hub. If I can’t find it, I’ll say so."}
                      </AvaBubble>
                    </li>
                    {turns.map((t, i) => {
                      const prev = turns[i - 1];
                      return (
                        <li key={t.id} className="flex flex-col gap-3">
                          {prev && prev.pageId !== t.pageId && <Divider>Now on: {t.pageTitle}</Divider>}
                          {prev && prev.mode !== t.mode && t.role === "learner" && <Divider>{RELAY_MODES[t.mode]}</Divider>}
                          {t.role === "learner" ? (
                            <LearnerBubble>{t.text}</LearnerBubble>
                          ) : (
                            <AvaTurn
                              turn={t}
                              name={linked.ava.name}
                              onSource={() => send("ava_source_opened", { outcome: t.kind })}
                              onPerson={(p) => setHistory(p)}
                            />
                          )}
                        </li>
                      );
                    })}
                    {turns.length > 0 && lastPage !== pageId && !pending && (
                      <li>
                        <Divider>Now on: {linked.card.page}</Divider>
                      </li>
                    )}
                    {pending && (
                      <li className="flex flex-col gap-3">
                        <LearnerBubble>{pending.question}</LearnerBubble>
                        <AvaBubble name={linked.ava.name} live>
                          <span className="text-[var(--relay-dim)]">{mode === "work" ? "Checking approved guidance…" : "Ava is replying…"}</span>
                        </AvaBubble>
                      </li>
                    )}
                    {askError && (
                      <li role="alert" className="rounded-xl border border-[#ff9d8a]/60 bg-[var(--relay-panel)] px-3 py-2.5 text-sm">
                        {askError}
                      </li>
                    )}
                  </ol>
                )}
              </div>
            </div>

            <div
              {...part("composer")}
              className="relay-part border-t border-[var(--relay-line)] bg-[var(--relay-panel)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
            >
              {linked && state.link !== "failed" && (
                <>
                  <div className="flex flex-wrap gap-1.5" aria-label="Suggested questions">
                    {prompts.map((p) => (
                      <button
                        key={p}
                        type="button"
                        disabled={!canSend}
                        onClick={() => void ask(p)}
                        className="min-h-9 rounded-full border border-[var(--relay-line)] px-3 text-sm hover:border-[var(--relay-glow)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <form
                    className="mt-2.5 flex items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void ask(draft);
                    }}
                  >
                    <label htmlFor={`${uid}-ask`} className="sr-only">
                      {mode === "story" ? "Ask Ava about this story" : "Ask Ava a work question"}
                    </label>
                    <textarea
                      ref={composer}
                      id={`${uid}-ask`}
                      rows={2}
                      maxLength={RELAY_MAX_QUESTION}
                      value={draft}
                      disabled={!relayCanSend(state)}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          void ask(draft);
                        }
                      }}
                      placeholder={
                        relayCanSend(state) ? (mode === "story" ? "Ask about this story…" : "Ask a work question, in general terms…") : "Connecting…"
                      }
                      className="min-h-12 flex-1 resize-none rounded-xl border border-[var(--relay-line)] bg-[var(--relay-bg)] px-3 py-2 text-[1rem] text-[var(--relay-ink)] placeholder:text-[var(--relay-dim)] disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={!canSend || !draft.trim()}
                      className="relay-mono inline-flex min-h-12 items-center rounded-xl bg-[var(--relay-glow)] px-4 text-xs font-bold text-[#03201d] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      SEND
                    </button>
                  </form>
                  <div className="mt-2 flex items-start justify-between gap-3 text-xs text-[var(--relay-dim)]">
                    <p>{linked.notes[mode]}</p>
                    {turns.length > 0 && !linked.preview && (
                      <button
                        type="button"
                        disabled={Boolean(pending)}
                        onClick={() => {
                          setTurns([]);
                          setAskError("");
                          void connect(true);
                        }}
                        className="shrink-0 font-semibold text-[var(--relay-ink)] underline underline-offset-2"
                      >
                        New conversation
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}

function RelayWave() {
  return (
    <svg viewBox="0 0 20 14" width="18" height="13" aria-hidden className="shrink-0">
      <path d="M1 7c2-6 4-6 6 0s4 6 6 0 4-6 6 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const Divider = ({ children }: { children: React.ReactNode }) => (
  <p className="relay-mono flex items-center gap-2 text-[0.68rem] font-bold uppercase text-[var(--relay-dim)]">
    <span aria-hidden className="h-px flex-1 bg-[var(--relay-line)]" />
    {children}
    <span aria-hidden className="h-px flex-1 bg-[var(--relay-line)]" />
  </p>
);

function LearnerBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-8 self-end rounded-2xl rounded-br-sm bg-[var(--relay-raised)] px-3.5 py-2.5">
      <p className="sr-only">You asked:</p>
      <p className="whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function AvaBubble({ name, label, live, children }: { name: string; label?: string; live?: boolean; children: React.ReactNode }) {
  return (
    <div
      className="mr-8 rounded-2xl rounded-bl-sm border border-[var(--relay-line)] bg-[var(--relay-panel)] px-3.5 py-2.5"
      aria-live={live ? "polite" : undefined}
      aria-busy={live || undefined}
    >
      <p className="relay-mono text-[0.68rem] font-bold uppercase text-[var(--relay-glow)]">
        {name}
        {label && <span className="text-[var(--relay-dim)]"> · {label}</span>}
      </p>
      <div className="mt-1 whitespace-pre-wrap leading-relaxed">{children}</div>
    </div>
  );
}

const TAG_WORD = { S: "Source", F: "Feedback", C: "Story" } as const;
/** An answer's words, with each tag drawn as a small label attached to the claim it follows. */
function AnswerText({ text, names = {} }: { text: string; names?: Record<string, string> }) {
  return (
    <>
      {answerParts(text).map((p, i) =>
        "text" in p ? (
          <span key={i}>{p.text.replace(/\*\*/g, "")}</span>
        ) : (
          <sup key={i} className="relay-mono ml-0.5 rounded border border-[var(--relay-line)] px-1 text-[0.62rem] font-bold text-[var(--relay-glow)]">
            {names[p.ref] ?? `${TAG_WORD[p.ref[0] as keyof typeof TAG_WORD]} ${p.ref.slice(1)}`}
          </sup>
        ),
      )}
    </>
  );
}

function AvaTurn({
  turn,
  name,
  onSource,
  onPerson,
}: {
  turn: RelayTurnView;
  name: string;
  onSource: () => void;
  onPerson: (p: { id: string; name: string }) => void;
}) {
  const names = Object.fromEntries([
    ...turn.sources.map((s) => [s.ref, `Source ${s.ref.slice(1)}`]),
    ...turn.feedback.map((f) => [f.ref, "Approved feedback"]),
    ...turn.people.map((p) => [p.ref, `${p.name}’s story`]),
  ]) as Record<string, string>;
  return (
    <AvaBubble name={name} label={turn.kindLabel}>
      <AnswerText text={turn.text} names={names} />
      {turn.sources.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1.5 border-t border-[var(--relay-line)] pt-2.5 text-sm">
          {turn.sources.map((s) => (
            <li key={s.ref}>
              <Link href={s.href} target="_blank" onClick={onSource} className="font-semibold text-[var(--relay-glow)] underline underline-offset-2">
                Source {s.ref.slice(1)}: {s.title}
                <span className="sr-only"> (opens in a new tab)</span>
              </Link>
              <span className="block text-xs text-[var(--relay-dim)]">{s.meta}</span>
            </li>
          ))}
        </ul>
      )}
      {turn.people.length > 0 && (
        <p className="mt-2.5 flex flex-wrap gap-1.5 border-t border-[var(--relay-line)] pt-2.5">
          {turn.people.map((p) => (
            <button
              key={p.ref}
              type="button"
              onClick={() => onPerson({ id: p.id, name: p.name })}
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-[var(--relay-line)] px-2.5 text-xs font-semibold hover:border-[var(--relay-glow)]"
            >
              <Icon name="book" className="size-3.5" /> From {p.name}’s approved story
            </button>
          ))}
        </p>
      )}
      {turn.route && (
        <div className="mt-2.5 rounded-xl border border-[var(--relay-line)] bg-[var(--relay-bg)] px-3 py-2.5 text-sm">
          {turn.route.urgent && <p className="font-semibold text-[#ffb4a6]">If someone may be in danger right now, call 000 first.</p>}
          <p className={cx(turn.route.urgent && "mt-1")}>{turn.route.note}</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {turn.route.links.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noreferrer" className="font-semibold text-[var(--relay-glow)] underline underline-offset-2">
                  {l.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
            {turn.route.contacts.map((c) => (
              <li key={c.label}>
                <span className="font-semibold">{c.label}:</span> {c.route}
              </li>
            ))}
            {turn.route.links.length + turn.route.contacts.length === 0 && <li>{turn.route.general}</li>}
          </ul>
        </div>
      )}
    </AvaBubble>
  );
}

/** A person's approved story up to where this page sits: what the learner may open, with anything later behind a button. */
function PersonHistory({ person, episode, onClose }: { person: { id: string; name: string }; episode: string; onClose: () => void }) {
  const [h, setH] = useState<CharacterHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(
    (later: boolean) =>
      api<CharacterHistory>(`/api/story?character=${encodeURIComponent(person.id)}&episode=${encodeURIComponent(episode)}${later ? "&later=1" : ""}`)
        .then(setH)
        .catch(() => setFailed(true)),
    [person.id, episode],
  );
  useEffect(() => {
    void load(false);
  }, [load]);
  return (
    <section
      aria-label={`${person.name}’s story so far`}
      className="mt-2 rounded-xl border border-[var(--relay-line)] bg-[var(--relay-panel)] px-3 py-2.5 text-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{person.name}’s story so far</p>
        <button type="button" onClick={onClose} className="text-xs font-semibold underline underline-offset-2">
          Hide
        </button>
      </div>
      {failed ? (
        <p className="mt-1 text-[var(--relay-dim)]">That story couldn’t be opened just now.</p>
      ) : !h ? (
        <p className="mt-1 text-[var(--relay-dim)]">Loading…</p>
      ) : (
        <>
          <p className="mt-1 text-[var(--relay-dim)]">
            {h.character.fictional}. {h.character.summary}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {[...h.upTo, ...h.later].map((i) => (
              <li key={i.id}>
                {i.href ? (
                  <Link href={i.href} target="_blank" className="font-semibold text-[var(--relay-glow)] underline underline-offset-2">
                    {i.title}
                  </Link>
                ) : (
                  <span className="font-semibold">{i.title}</span>
                )}
                <span className="text-[var(--relay-dim)]"> · {[i.whenLabel, i.format].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
            {!h.upTo.length && !h.later.length && <li className="text-[var(--relay-dim)]">Nothing else you can open yet.</li>}
          </ul>
          {h.laterCount > 0 && !h.later.length && (
            <button type="button" onClick={() => void load(true)} className="mt-2 text-xs font-semibold underline underline-offset-2">
              Show {h.laterCount} later {h.laterCount === 1 ? "appearance" : "appearances"} (may give away what happens next)
            </button>
          )}
        </>
      )}
    </section>
  );
}
