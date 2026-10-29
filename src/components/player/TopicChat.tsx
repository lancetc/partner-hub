"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { RichText } from "../RichText";

/*
  The topic assistant: a chat bubble in the card footer opens a chat window where learners ask
  Trilogy Care questions. Answers come from the Partner Hub's published content (server/topicChat.ts)
  and stream in as they're written. The conversation lives only in this page.
*/

type Source = { title: string; href: string; meta: string };
type Turn = { role: "user" | "assistant"; text: string; sources?: Source[]; error?: string; pending?: boolean };

const STARTERS = ["What’s the most important thing in this topic?", "Can you explain this card more simply?", "Who do I contact about this?"];

export function TopicChat({ slug, title, card, preview = false }: { slug: string; title: string; card?: { id: string; heading: string }; preview?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const busy = turns.some((t) => t.pending);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setDraft("");
    const history = [...turns.filter((t) => !t.error && t.text), { role: "user" as const, text: q }];
    setTurns([...turns, { role: "user", text: q }, { role: "assistant", text: "", pending: true }]);
    const update = (fn: (t: Turn) => Turn) => setTurns((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);
    if (typeof navigator !== "undefined" && !navigator.onLine)
      return update(() => ({ role: "assistant", text: "", error: "You’re offline. The assistant needs a connection." }));
    try {
      const res = await fetch("/api/lessons/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          preview,
          // "This card" means the one on screen.
          messages: history.map((t, i) =>
            i === history.length - 1 && card ? { role: t.role, text: `${t.text}\n\n(I’m on the card “${card.heading}”.)` } : { role: t.role, text: t.text },
          ),
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        return update(() => ({ role: "assistant", text: "", error: (data as { error?: string }).error ?? "The assistant couldn’t answer just now." }));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as { type: string; text?: string; sources?: Source[]; message?: string };
          if (e.type === "sources") update((t) => ({ ...t, sources: e.sources }));
          else if (e.type === "text") update((t) => ({ ...t, text: t.text + (e.text ?? "") }));
          else if (e.type === "error") update((t) => ({ ...t, error: e.message, pending: false }));
          else if (e.type === "done") update((t) => ({ ...t, pending: false }));
        }
      }
      update((t) => ({ ...t, pending: false }));
    } catch {
      update(() => ({ role: "assistant", text: "", error: "The assistant couldn’t answer just now. Check your connection and try again." }));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialog.current?.showModal();
          requestAnimationFrame(() => input.current?.focus());
        }}
        aria-label="Ask a question about this topic"
        title="Ask a question"
        className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full border border-line-strong text-accent hover:bg-muted"
      >
        <Icon name="chat" className="size-5" />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="topic-chat-title"
        className="m-0 mx-auto h-dvh max-h-none w-full max-w-none bg-bg p-0 text-ink backdrop:bg-[var(--overlay)] sm:my-auto sm:h-[min(44rem,90vh)] sm:max-w-lg sm:rounded-3xl sm:border sm:border-line"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#0e7c7b] text-white">
              <Icon name="chat" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="topic-chat-title" className="font-semibold leading-tight">
                Ask a question
              </h2>
              <p className="truncate text-sm text-ink-muted">About {title} and working with Trilogy Care</p>
            </div>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close the chat"
              className="grid size-11 place-items-center rounded-full hover:bg-muted"
            >
              <Icon name="close" className="size-5" />
            </button>
          </header>

          <div ref={list} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
            <div className="rounded-2xl bg-muted p-3 text-[0.95rem]">
              <p>Ask anything about this topic or how you work with Trilogy Care. Answers come from the Partner Hub’s topics, resources and news.</p>
              <p className="mt-2 flex gap-2 text-sm text-ink-muted">
                <Icon name="lock" className="mt-0.5 size-4 shrink-0" /> Leave out client names and private details. Questions aren’t saved.
              </p>
            </div>
            {!turns.length && (
              <div className="flex flex-col items-start gap-2">
                {STARTERS.filter((s) => card || !s.includes("this card")).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="rounded-2xl border border-line-strong px-3 py-2 text-left text-sm font-medium hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {turns.map((t, i) =>
              t.role === "user" ? (
                <p key={i} className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#0e7c7b] px-3 py-2 text-white">
                  {t.text}
                </p>
              ) : (
                <div key={i} className="max-w-[92%] self-start">
                  <div className={cx("rounded-2xl rounded-bl-md px-3 py-2", t.error ? "border border-danger/50" : "bg-surface shadow-sm ring-1 ring-line")}>
                    {t.error ? (
                      <p className="flex gap-2 text-sm">
                        <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-danger" /> {t.error}
                      </p>
                    ) : t.text ? (
                      <RichText text={t.text} className="text-[0.95rem] leading-relaxed" />
                    ) : (
                      <p className="flex items-center gap-1 py-1 text-ink-muted" aria-label="Writing an answer">
                        {[0, 1, 2].map((d) => (
                          <span key={d} className="size-2 animate-bounce rounded-full bg-current" style={{ animationDelay: `${d * 150}ms` }} />
                        ))}
                      </p>
                    )}
                  </div>
                  {!t.pending && !t.error && t.sources && t.sources.length > 1 && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                      From the hub:
                      {t.sources.slice(1, 4).map((s) => (
                        <Link key={s.href} href={s.href} className="rounded-full bg-muted px-2 py-0.5 font-semibold text-accent hover:underline">
                          {s.title}
                        </Link>
                      ))}
                    </p>
                  )}
                </div>
              ),
            )}
          </div>

          <form
            className="border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
          >
            <div className="flex items-end gap-2">
              <label htmlFor="topic-chat-input" className="sr-only">
                Your question
              </label>
              <textarea
                id="topic-chat-input"
                ref={input}
                rows={1}
                value={draft}
                maxLength={1000}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(draft);
                  }
                }}
                placeholder="Type your question"
                className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-line-strong bg-surface px-3 py-3 text-[0.98rem] leading-snug [field-sizing:content]"
              />
              <button
                type="submit"
                disabled={!draft.trim() || busy}
                aria-label="Send"
                className="grid size-12 shrink-0 place-items-center rounded-full bg-action text-on-action hover:bg-action-hover disabled:opacity-40"
              >
                <Icon name="arrow-right" className="size-5" />
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-ink-muted">Answers can be wrong. Check anything important with your Trilogy Care contact.</p>
          </form>
        </div>
      </dialog>
    </>
  );
}
