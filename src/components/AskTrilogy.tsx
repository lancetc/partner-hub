"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { Icon } from "./Icon";
import { RichText } from "./RichText";

/*
  Ask Trilogy, on the homepage: ask a question, get an answer with links to the approved Partner Hub
  material it came from, go straight to the card in a topic that covers it, and a short topic to take
  when you want to understand it better (server/askTrilogy.ts).
*/

type Source = { title: string; href: string; meta: string };
type Found = {
  sources: Source[];
  topic: { title: string; minutes: number; href: string; card: { heading: string; href: string } | null } | null;
  passage: { title: string; href: string; text: string } | null;
};
type Result = { question: string; found: Found | null; text: string; pending: boolean; ai: boolean | null; error?: string };

const SUGGESTIONS = [
  { label: "Invoice requirements", question: "What can I invoice for?" },
  { label: "Incident reporting", question: "How do I report an incident?" },
  { label: "Service eligibility", question: "Who is eligible for Support at Home?" },
];

export function AskTrilogy({ className }: { className?: string }) {
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  async function ask(question: string) {
    const q = question.trim();
    if (q.length < 3 || result?.pending) return;
    setDraft(q);
    setResult({ question: q, found: null, text: "", pending: true, ai: null });
    const update = (fn: (r: Result) => Result) => setResult((r) => (r ? fn(r) : r));
    if (typeof navigator !== "undefined" && !navigator.onLine) return update((r) => ({ ...r, pending: false, error: "You’re offline. Ask Trilogy needs a connection." }));
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return update((r) => ({ ...r, pending: false, error: data.error ?? "Ask Trilogy couldn’t answer just now." }));
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
          const e = JSON.parse(line) as { type: string; text?: string; ai?: boolean; message?: string } & Partial<Found>;
          if (e.type === "found") update((r) => ({ ...r, found: { sources: e.sources ?? [], topic: e.topic ?? null, passage: e.passage ?? null } }));
          else if (e.type === "text") update((r) => ({ ...r, text: r.text + (e.text ?? "") }));
          else if (e.type === "done") update((r) => ({ ...r, pending: false, ai: Boolean(e.ai) }));
          else if (e.type === "error") update((r) => ({ ...r, pending: false, error: e.message }));
        }
      }
      update((r) => ({ ...r, pending: false }));
    } catch {
      update((r) => ({ ...r, pending: false, error: "Ask Trilogy couldn’t answer just now. Check your connection and try again." }));
    }
  }

  const f = result?.found;
  const nothing = result && !result.pending && f && !f.sources.length;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cx("relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#008282] to-[#0a6a70] p-5 text-white shadow-sm sm:p-6", className)}
    >
      {/* Soft brand-colour circles behind the heading. */}
      <svg aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-56 opacity-60" viewBox="0 0 200 200">
        <circle cx="130" cy="70" r="70" fill="#3cb8b9" opacity="0.45" />
        <circle cx="60" cy="40" r="26" fill="#fab53d" opacity="0.5" />
      </svg>
      <h2 id={`${id}-title`} className="relative flex items-center gap-2 font-serif text-2xl font-semibold">
        <Icon name="spark" className="size-6 text-[#fab53d]" /> Ask Trilogy
      </h2>
      <p className="relative mt-1 text-white/90">Find an answer, resource or learning topic.</p>
      <form
        className="relative mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          Your question
        </label>
        <input
          ref={inputRef}
          id={`${id}-q`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What can I invoice for?"
          maxLength={1000}
          autoComplete="off"
          className="min-h-12 min-w-0 flex-1 rounded-full border-0 bg-white px-5 text-[1.02rem] text-[#102a43] placeholder:text-[#627d98] focus-visible:outline-[#fab53d]"
        />
        <button
          type="submit"
          aria-label="Ask"
          disabled={draft.trim().length < 3 || Boolean(result?.pending)}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-[#fab53d] text-[#102a43] hover:bg-[#f9c56a] disabled:opacity-60"
        >
          <Icon name="arrow-right" className="size-5 -rotate-90" />
        </button>
      </form>
      <div className="relative mt-3 flex flex-wrap gap-2" role="group" aria-label="Suggested questions">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => {
              setDraft(s.question);
              void ask(s.question);
            }}
            className="inline-flex min-h-10 items-center rounded-full border border-white/40 px-4 text-sm font-semibold text-white hover:bg-white/15"
          >
            {s.label}
          </button>
        ))}
      </div>

      {result && (
        <div className="relative mt-5 rounded-2xl bg-surface p-4 text-ink sm:p-5" aria-live="polite">
          <p className="text-sm text-ink-muted">
            You asked: <span className="font-semibold text-ink">{result.question}</span>
          </p>
          {result.error ? (
            <p className="mt-3 font-semibold text-danger">{result.error}</p>
          ) : !f ? (
            <p className="mt-3 flex items-center gap-2 text-ink-muted">
              <span className="size-2 animate-pulse rounded-full bg-[#3cb8b9]" aria-hidden /> Looking through the Partner Hub…
            </p>
          ) : nothing ? (
            <p className="mt-3">
              The Partner Hub doesn’t cover that yet. Try other words, or ask your Trilogy Care contact.{" "}
              <Link href="/resources" className="font-semibold text-accent hover:underline">
                Browse resources
              </Link>
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-4">
              {/* The answer: Claude's, written from the sources; otherwise the most relevant passage itself. */}
              {result.text ? (
                <div className="text-[1.02rem] leading-relaxed">
                  <RichText text={result.text} />
                </div>
              ) : (
                f.passage &&
                !(result.pending && result.ai === null && !f.passage) && (
                  <blockquote className="rounded-2xl border-l-4 border-[#008282] bg-tealtint px-4 py-3">
                    <p className="text-[1.02rem] leading-relaxed">{f.passage.text}</p>
                    <footer className="mt-1 text-sm text-ink-muted">From {f.passage.title}</footer>
                  </blockquote>
                )
              )}

              {f.topic?.card && (
                <Link
                  href={f.topic.card.href}
                  className="group flex items-center gap-3 self-start rounded-2xl bg-[#008282] px-4 py-3 text-white hover:bg-[#006b6b]"
                >
                  <Icon name="arrow-right" className="size-5 shrink-0" />
                  <span>
                    <span className="block font-semibold">Go straight to it</span>
                    <span className="block text-sm text-white/85">
                      “{f.topic.card.heading}” in {f.topic.title}
                    </span>
                  </span>
                </Link>
              )}

              {f.topic && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <Icon name="book" className="size-4 text-ink-muted" />
                  <span className="text-ink-muted">To understand it better:</span>
                  <Link href={f.topic.href} className="font-semibold text-accent hover:underline">
                    {f.topic.title}
                  </Link>
                  <span className="text-ink-muted">· {f.topic.minutes} min topic</span>
                </p>
              )}

              {f.sources.length > 0 && (
                <div>
                  <p className="font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-ink-muted">From approved Partner Hub content</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {f.sources.map((s) => (
                      <li key={s.href}>
                        <Link href={s.href} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-muted px-3 text-sm hover:bg-strong">
                          <span className="font-semibold">{s.title}</span>
                          <span className="text-ink-muted">· {s.meta}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.ai === false && (
                <p className="text-xs text-ink-muted">
                  Showing the most relevant passage. Once Claude is connected, Ask Trilogy writes a short answer from these same sources.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
