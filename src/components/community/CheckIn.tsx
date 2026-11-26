"use client";

import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { useOnePlayer } from "@/lib/onePlayer";
import type { CheckInList } from "@/server/checkIn";
import { readEvents } from "../admin/BuildProgress";
import { Icon } from "../Icon";
import { Portrait } from "./DigitalMemberProfile";

/*
  People I follow (Check in, docs/lives-in-progress.md): a compact card for each Digital Member the learner follows,
  with a line from their life and when they last talked. "Check in" opens a short, informal catch-up in place: no
  modal, no new page, no big chat window. It's the existing member chat (mode "checkin") with its memory. The first
  line is the Hub's, from what's real; the character can bring it to a natural close. No points, no streaks.
*/

type Card = CheckInList["cards"][number];
type Turn = { role: "user" | "assistant"; text: string };
type ChatEvent = { type: "text"; text: string } | { type: "followups"; items: string[] } | { type: "done" } | { type: "error"; message: string };
type Status = { available: boolean; reason: string | null; excluded: string[]; turnsPerChat: number };

export function HomeCheckIn() {
  const { data, reload } = useApi<CheckInList>("/api/community/check-in");
  const status = useApi<Status>("/api/community/digital-members/chat").data;
  const [open, setOpen] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  if (!data) return null;
  if (!data.cards.length)
    // Nothing: beside Your Favourites (app/page.tsx), an empty People I follow lets Favourites take the full width.
    return null;
  return (
    <section aria-labelledby="home-checkin" className="mt-10 rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <h2 id="home-checkin" className="font-serif text-2xl font-semibold">
        People I follow
      </h2>
      <p className="text-sm text-ink-muted">Take a moment to check in.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {data.cards.map((c) => {
          const isOpen = open === c.id;
          return (
            <li key={c.id} className={cx(isOpen && "sm:col-span-2")}>
              {isOpen ? (
                <CatchUp
                  card={c}
                  memory={data.memory}
                  voice={data.voice}
                  status={status}
                  onClose={() => {
                    setOpen(null);
                    // The chat just had is now their latest memory: fetch the cards again so the next opener and
                    // "Last conversation" reflect it, not what the page loaded with.
                    reload();
                    // Back to the card's own button, so keyboard users aren't lost.
                    requestAnimationFrame(() => buttons.current.get(c.id)?.focus());
                  }}
                />
              ) : (
                <div className="flex h-full items-start gap-3 rounded-2xl border border-line bg-bg p-3">
                  <Portrait name={c.name} src={c.portrait} className="size-12 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.name}</p>
                    <p className="mt-0.5 line-clamp-2 font-serif text-sm italic leading-snug">{c.line}</p>
                    <p className="mt-1 text-xs text-ink-muted">{c.lastChat}</p>
                    {/* Under the words, so a half-width card still reads well. */}
                    <button
                      type="button"
                      ref={(el) => {
                        buttons.current.set(c.id, el);
                      }}
                      aria-expanded={false}
                      aria-label={`${c.action} with ${c.name}`}
                      onClick={() => {
                        setOpen(c.id);
                        void api("/api/community/check-in", { body: { memberId: c.id } }).catch(() => {});
                      }}
                      disabled={status !== null && (!status.available || status.excluded.includes(c.id))}
                      title={status && !status.available ? (status.reason ?? undefined) : undefined}
                      className="mt-2 inline-flex min-h-10 items-center rounded-full bg-tealtint px-3.5 text-sm font-semibold hover:bg-[#d3ecea] disabled:opacity-50 dark:hover:bg-white/15"
                    >
                      {c.action}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The catch-up, in the card's place: their words, yours, a few ideas of what to say, and a way to finish. */
function CatchUp({ card: c, memory, voice, status, onClose }: { card: Card; memory: boolean; voice: boolean; status: Status | null; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([{ role: "assistant", text: c.opener }]);
  const [ideas, setIdeas] = useState<string[]>(c.starters);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [conversationId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c${Date.now()}`));
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const sent = turns.filter((t) => t.role === "user").length;
  const left = (status?.turnsPerChat ?? 10) - sent;
  useEffect(() => heading.current?.focus(), []);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns]);

  const send = async (text: string) => {
    const words = text.trim();
    if (!words || busy || left <= 0) return;
    setProblem(null);
    setDraft("");
    setIdeas([]);
    const history: Turn[] = [...turns, { role: "user", text: words }];
    setTurns([...history, { role: "assistant", text: "" }]);
    setBusy(true);
    abort.current = new AbortController();
    let next: string[] = [];
    try {
      const res = await fetch("/api/community/digital-members/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId: c.id, messages: history, episodeId: c.chat?.episodeId, conversationId, mode: "checkin" }),
        signal: abort.current.signal,
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That didn’t send. Try again.");
      let reply = "";
      await readEvents<ChatEvent>(res, (e) => {
        if (e.type === "text") {
          reply += e.text;
          setTurns([...history, { role: "assistant", text: reply.trimEnd() }]);
        } else if (e.type === "followups") next = e.items;
        else if (e.type === "error") throw new Error(e.message);
      });
      setIdeas(next);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setTurns(turns);
      setDraft(words);
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#008282]/40 bg-bg p-4" role="group" aria-labelledby={`catchup-${c.id}`}>
      <div className="flex items-center gap-3">
        <Portrait name={c.name} src={c.portrait} className="size-12 text-xs" />
        <div className="min-w-0 flex-1">
          <h3 id={`catchup-${c.id}`} ref={heading} tabIndex={-1} className="font-semibold outline-none">
            {c.name}
          </h3>
          <p className="text-xs text-ink-muted">A little catch-up</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-ink-muted hover:bg-muted hover:text-ink"
        >
          Finish catch-up
        </button>
      </div>
      <ol className="mt-3 flex max-h-[24rem] flex-col gap-3 overflow-y-auto pr-1" aria-live="polite">
        {turns.map((t, i) =>
          t.role === "assistant" ? (
            <li key={i} className="max-w-[92%]">
              <span className="sr-only">{c.name}: </span>
              {t.text ? (
                <p className="whitespace-pre-line font-serif text-[1.02rem] leading-relaxed">{t.text}</p>
              ) : (
                <span className="inline-flex gap-1.5 py-2" aria-label={`${c.first} is typing`}>
                  {[0, 150, 300].map((d) => (
                    <span
                      key={d}
                      aria-hidden
                      className="size-2 animate-bounce rounded-full bg-ink-muted motion-reduce:animate-none"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </span>
              )}
              {/* The opening line is the Hub's, not the character's reply: only replies can be spoken. */}
              {i > 0 && t.text && !(busy && i === turns.length - 1) && <SpeakReply memberId={c.id} text={t.text} first={c.first} enabled={voice} />}
            </li>
          ) : (
            <li key={i} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-[#e2f2f1] px-3.5 py-2 text-[0.98rem] leading-snug dark:bg-[#1d4a4a]">
                <span className="sr-only">You: </span>
                {t.text}
              </p>
            </li>
          ),
        )}
        <div ref={end} />
      </ol>
      {!busy && left > 0 && ideas.length > 0 && (
        <div className="mt-3" role="group" aria-label="Not sure what to say?">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Not sure what to say?</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ideas.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="min-h-10 rounded-full border border-line-strong px-3 text-left text-sm font-semibold text-ink-muted hover:border-[#008282] hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      {problem && (
        <p role="alert" className="mt-2 rounded-xl bg-[#fdecea] px-3 py-2 text-sm text-[#8a1c12]">
          {problem}
        </p>
      )}
      {status && !status.available ? (
        <p className="mt-3 text-sm text-ink-muted">{status.reason}</p>
      ) : left > 0 ? (
        <form
          className="mt-3 flex items-center gap-2 rounded-2xl border border-line bg-surface py-1 pl-3 pr-1 focus-within:border-[#008282]"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <label htmlFor={`catchup-input-${c.id}`} className="sr-only">
            Your message to {c.name}
          </label>
          <input
            id={`catchup-input-${c.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={600}
            placeholder={`Say something to ${c.first}…`}
            className="min-h-10 flex-1 bg-transparent text-[0.98rem] outline-none placeholder:text-ink-muted"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Send"
            className="grid size-10 place-items-center rounded-full bg-[#dff0ef] hover:bg-[#008282] hover:text-white disabled:opacity-60 dark:bg-white/15"
          >
            <Icon name="arrow-up" className="size-4" />
          </button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">That’s a good catch-up. Finish it here, and check in again whenever you like.</p>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1">
          <Icon name="info" className="size-3.5" /> Fictional character · Conversation memory {memory ? "on" : "off"}
        </span>
        {!voice && <span>Spoken replies are off on this Hub.</span>}
      </p>
    </div>
  );
}

/**
  "Hear it": one of their replies in their own voice. Only shown working when an author has switched spoken replies on
  (each is a live, paid request); otherwise the control is there but off. Plays only when pressed, one sound at a time.
*/
function SpeakReply({ memberId, text, first, enabled }: { memberId: string; text: string; first: string; enabled: boolean }) {
  useOnePlayer();
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src]);
  const play = async () => {
    if (src) return void audio.current?.play();
    setState("loading");
    try {
      const res = await fetch("/api/community/check-in/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId, text }),
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      setSrc(url);
      setState("idle");
      requestAnimationFrame(() => void audio.current?.play());
    } catch {
      setState("failed");
    }
  };
  return (
    <span data-player className="mt-1 inline-flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={!enabled || state === "loading"}
        onClick={() => void play()}
        aria-label={`Hear ${first} say this`}
        title={enabled ? undefined : "Spoken replies are off on this Hub"}
        className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 font-semibold text-[#007373] hover:bg-muted disabled:opacity-40 dark:text-[#3cb8b9]"
      >
        <Icon name="volume" className="size-3.5" /> {state === "loading" ? "Getting it…" : "Hear it"}
      </button>
      {state === "failed" && <span className="text-ink-muted">Couldn’t play it. The words are all here.</span>}
      {src && <audio ref={audio} src={src} preload="auto" />}
    </span>
  );
}
