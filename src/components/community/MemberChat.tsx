"use client";

import { useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/api";
import { STARTERS } from "@/lib/memberChat";
import type { DigitalMemberCard } from "@/server/digitalMembers";
import { readEvents } from "../admin/BuildProgress";
import { Portrait, firstName } from "./DigitalMemberProfile";
import { Icon } from "../Icon";

/*
  Chatting with a Digital Member (server/memberChat): pick a person, and they say hello in their own words; a short
  conversation follows, replies arriving as they're written. Under each reply, "Continue the conversation" offers
  three questions to ask next, written with the reply. Nothing is saved: the chat lives on this page and is gone
  when the window closes. The limits and the switch are in Admin → Digital Member chat.
*/

type Status = { available: boolean; reason: string | null; excluded: string[]; turnsPerChat: number; leftThisHour: number; notice: string };
type Turn = { role: "user" | "assistant"; text: string };
type ChatEvent = { type: "text"; text: string } | { type: "followups"; items: string[] } | { type: "done" } | { type: "error"; message: string };
/** Who's chatting: a card from the tab, or a profile. */
type ChatPerson = Pick<DigitalMemberCard, "id" | "name" | "role" | "portrait" | "hello">;
const STATUS_URL = "/api/community/digital-members/chat";
const DIALOG_CLASS =
  "pointer-events-auto m-auto h-[min(46rem,92vh)] w-[min(44rem,calc(100vw-1.5rem))] max-w-none overflow-hidden rounded-[1.75rem] bg-[#fbfcfc] p-0 text-left text-ink shadow-2xl ring-1 ring-black/5 backdrop:bg-[#0b1626]/60 backdrop:backdrop-blur-sm dark:bg-[#13233a] dark:ring-white/10";

/** "Self-managing, runs her own affairs" → "Self-managing · Runs her own affairs", for the line under the name. */
const roleLine = (role: string) => {
  const [head, ...rest] = role.split(", ");
  const tail = rest.join(", ");
  return tail ? `${head} · ${tail.charAt(0).toUpperCase()}${tail.slice(1)}` : head;
};

/** The button under the portraits in the Digital Members header, and the chat it opens. Hidden when chat isn't available. */
export function MemberChatButton({ members }: { members: DigitalMemberCard[] }) {
  const { data: status } = useApi<Status>(STATUS_URL);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  if (!status?.available) return null;
  const chatty = members.filter((m) => !status.excluded.includes(m.id));
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 font-semibold text-[#102a43] shadow-sm hover:bg-[#e8f6f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <Icon name="chat" className="size-5" /> Chat with a digital member
      </button>
      <dialog
        ref={dialog}
        aria-label="Chat with a digital member"
        onClose={(e) => e.target === e.currentTarget && setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className={DIALOG_CLASS}
      >
        {open && <ChatWindow members={chatty} status={status} onClose={() => dialog.current?.close()} />}
      </dialog>
    </>
  );
}

/** On a profile: chat with this person straight away. Hidden when chat is off for this reader, or for them. */
export function MemberChatWith({ member }: { member: ChatPerson }) {
  const { data: status } = useApi<Status>(STATUS_URL);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  if (!status?.available || status.excluded.includes(member.id)) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 font-semibold text-[#102a43] shadow-sm hover:bg-[#e8f6f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <Icon name="chat" className="size-5" /> Chat with {firstName(member.name)}
      </button>
      <dialog
        ref={dialog}
        aria-label={`Chat with ${member.name}`}
        onClose={(e) => e.target === e.currentTarget && setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className={DIALOG_CLASS}
      >
        {open && <ChatWindow members={[]} initial={member} status={status} onClose={() => dialog.current?.close()} />}
      </dialog>
    </>
  );
}

function ChatWindow({ members, initial, status, onClose }: { members: ChatPerson[]; initial?: ChatPerson; status: Status; onClose: () => void }) {
  const [who, setWho] = useState<ChatPerson | null>(initial ?? null);
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-line px-4 py-4 sm:px-5">
        {who ? (
          <>
            {who.portrait ? (
              // eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are
              <img src={who.portrait} alt="" className="size-16 shrink-0 rounded-2xl object-cover shadow-sm sm:size-[4.5rem]" />
            ) : (
              <Portrait name={who.name} src="" className="size-16 rounded-2xl text-lg sm:size-[4.5rem]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-2xl font-semibold leading-tight tracking-tight">{who.name}</p>
              <p className="mt-1 truncate text-ink-muted">{roleLine(who.role)}</p>
            </div>
            {members.length > 0 && (
              <button
                type="button"
                onClick={() => setWho(null)}
                aria-label="Chat with someone else"
                title="Chat with someone else"
                className="grid size-12 shrink-0 place-items-center rounded-2xl bg-muted text-ink hover:bg-tealtint dark:bg-white/10"
              >
                <Icon name="people" className="size-5" />
              </button>
            )}
          </>
        ) : (
          <p className="flex-1 text-2xl font-semibold tracking-tight">Who would you like to chat with?</p>
        )}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid size-11 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-muted hover:text-ink"
        >
          <Icon name="close" className="size-5" />
        </button>
      </header>
      {who ? <Conversation key={who.id} who={who} status={status} canSwitch={members.length > 0} /> : <Picker members={members} onPick={setWho} />}
      <p className="flex items-center justify-center gap-2 px-4 pb-4 pt-2 text-center text-sm text-ink-muted sm:px-5">
        <Icon name="shield" className="size-4 shrink-0" />
        {status.notice}
      </p>
    </div>
  );
}

function Picker({ members, onPick }: { members: ChatPerson[]; onPick: (m: ChatPerson) => void }) {
  return (
    <ul className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-4 sm:grid-cols-3 sm:p-5">
      {members.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onPick(m)}
            className="flex w-full items-center gap-2.5 rounded-2xl border border-line bg-surface p-2.5 text-left hover:border-[#008282] focus-visible:outline-2 focus-visible:outline-[#008282]"
          >
            {m.portrait ? (
              // eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are
              <img src={m.portrait} alt="" className="size-11 shrink-0 rounded-xl object-cover" />
            ) : (
              <Portrait name={m.name} src="" className="size-11 rounded-xl text-sm" />
            )}
            <span className="min-w-0">
              <span className="block truncate font-semibold">{m.name}</span>
              <span className="block truncate text-xs text-ink-muted">{m.role}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Conversation({ who, status, canSwitch }: { who: ChatPerson; status: Status; canSwitch: boolean }) {
  // Their hello opens the chat; it's on screen, and the server tells the AI it was said.
  const [turns, setTurns] = useState<Turn[]>([{ role: "assistant", text: who.hello }]);
  // What to ask next: openers at first, then the three written with the last reply.
  const [ideas, setIdeas] = useState<string[]>(STARTERS);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [atEnd, setAtEnd] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const sent = turns.filter((t) => t.role === "user").length;
  const left = status.turnsPerChat - sent;
  const first = firstName(who.name);

  // In braces: newer browsers return a promise from scrollIntoView, which React would take for a clean-up.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, ideas]);
  // Closing the chat (or picking someone else) stops a reply that's still being written.
  useEffect(() => () => abort.current?.abort(), []);

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
      const res = await fetch(STATUS_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId: who.id, messages: history }),
        signal: abort.current.signal,
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "That didn’t send. Try again.");
      }
      let reply = "";
      await readEvents<ChatEvent>(res, (e) => {
        if (e.type === "text") {
          reply += e.text;
          setTurns([...history, { role: "assistant", text: reply.trimEnd() }]);
        } else if (e.type === "followups") next = e.items;
        else if (e.type === "error") throw new Error(e.message);
      });
      setIdeas(next.length ? next : ["Tell me more about that"]);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // The message wasn't answered: take it back off, and put the words back to try again.
      setTurns(turns);
      setDraft(words);
      setIdeas(ideas.length ? ideas : STARTERS);
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        ref={scroller}
        className="relative flex-1 overflow-y-auto px-4 py-6 sm:px-6"
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtEnd(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
      >
        <ol className="flex flex-col gap-5">
          {turns.map((t, i) =>
            t.role === "assistant" ? (
              <li key={i} className="max-w-[90%] text-[1.15rem] leading-relaxed">
                <span className="sr-only">{who.name}: </span>
                {t.text ? (
                  <p className="whitespace-pre-line px-1">{t.text}</p>
                ) : (
                  <span className="inline-flex gap-1.5 px-1 py-2" aria-label={`${first} is typing`}>
                    <Dot delay="0ms" />
                    <Dot delay="150ms" />
                    <Dot delay="300ms" />
                  </span>
                )}
              </li>
            ) : (
              <li key={i} className="flex justify-end">
                <p className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-br-md bg-[#e2f2f1] px-4 py-2.5 text-[1.02rem] leading-snug text-ink dark:bg-[#1d4a4a]">
                  <span className="sr-only">You: </span>
                  {t.text}
                </p>
              </li>
            ),
          )}
        </ol>
        {!busy && left > 0 && ideas.length > 0 && (
          <div className="mt-6" role="group" aria-label={sent === 0 ? "Ways to start" : "Continue the conversation"}>
            <p className="text-sm uppercase tracking-wide text-ink-muted">{sent === 0 ? "Start the conversation" : "Continue the conversation"}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {ideas.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="min-h-11 rounded-full border border-line-strong bg-surface px-4 text-left font-semibold text-ink-muted transition hover:border-[#008282] hover:bg-tealtint hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {problem && (
          <p role="alert" className="mt-4 rounded-xl bg-[#fdecea] px-3 py-2 text-sm text-[#8a1c12]">
            {problem}
          </p>
        )}
        <div ref={end} />
      </div>

      <div className="relative px-4 sm:px-5">
        {/* Back to the latest, when the conversation has been scrolled up. */}
        {!atEnd && (
          <button
            type="button"
            aria-label="Go to the latest message"
            onClick={() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" })}
            className="absolute -top-14 left-1/2 grid size-11 -translate-x-1/2 place-items-center rounded-full bg-surface text-ink shadow-md ring-1 ring-black/5 hover:bg-muted"
          >
            <Icon name="arrow-down" className="size-5" />
          </button>
        )}
        {left > 0 ? (
          <form
            className="flex items-center gap-2 rounded-2xl border border-line bg-white py-1.5 pl-4 pr-1.5 shadow-sm focus-within:border-[#008282] dark:bg-white/5"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <label className="sr-only" htmlFor="member-chat-input">
              Your message to {who.name}
            </label>
            <textarea
              id="member-chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              rows={1}
              maxLength={600}
              placeholder={`Ask ${first} something…`}
              className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[1.05rem] outline-none placeholder:text-ink-muted"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-[#dff0ef] text-ink transition hover:bg-[#008282] hover:text-white disabled:opacity-60 disabled:hover:bg-[#dff0ef] disabled:hover:text-ink dark:bg-white/15"
            >
              <Icon name="arrow-up" className="size-5" />
            </button>
          </form>
        ) : (
          <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-center text-sm">
            That’s the end of this chat.{" "}
            {canSwitch ? (
              <>Choose someone else with the people button, or pick {first} again to start a new one.</>
            ) : (
              <>Close it and open it again to start a new one with {first}.</>
            )}
          </p>
        )}
        {left > 0 && sent > 0 && (
          <p className="mt-1 text-right text-xs text-ink-muted">
            {left} {left === 1 ? "message" : "messages"} left in this chat
          </p>
        )}
      </div>
    </>
  );
}

const Dot = ({ delay }: { delay: string }) => (
  <span aria-hidden className="size-2 animate-bounce rounded-full bg-ink-muted motion-reduce:animate-none" style={{ animationDelay: delay }} />
);
