"use client";

import { useEffect, useRef } from "react";
import { clock, contextFor, shuffledFor, type Channel, type Content, type Run } from "@/lib/coordinatorsDay";
import { cx } from "@/lib/format";
import { Icon, type IconName } from "../Icon";

/*
  The open card in The Coordinator's Day: a call, a message, a note, or a setback. The learner picks
  a response, reads the feedback (what's likely to happen, and something to take away), then
  continues to see the move on the board.
*/

const channel: Record<Channel, { label: string; icon: IconName }> = {
  call: { label: "Phone call", icon: "phone" },
  text: { label: "Text message", icon: "chat" },
  email: { label: "Email", icon: "mail" },
  note: { label: "Note", icon: "doc" },
  voicemail: { label: "Voicemail", icon: "phone" },
};

const result = {
  accept: { label: "Good call. You move forward one square.", tone: "bg-[#e3f4f3] text-[#0f5b5b] ring-[#bfe3e1]", icon: "check" as IconName },
  climb: { label: "Handled well. You climb the ladder.", tone: "bg-[#dff3ea] text-[#0f5b5b] ring-[#b7e2cd]", icon: "star" as IconName },
  advance: { label: "A fair call. You move on one square.", tone: "bg-[#eef3f8] text-[#1d2b4f] ring-[#d4dfeb]", icon: "arrow-right" as IconName },
  retry: { label: "Not quite. You stay on this square: try again.", tone: "bg-[#fdf1e4] text-[#7a4a00] ring-[#f3d7b2]", icon: "refresh" as IconName },
};

const initials = (name: string) =>
  name
    .split(/[\s,]+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

export function DayCard({
  content,
  run,
  squareName,
  slideTo,
  onChoose,
  onContinue,
  onClose,
}: {
  content: Content;
  run: Run;
  squareName: (i: number) => string;
  /** Where the open setback's slide goes, for its button. */
  slideTo?: number;
  onChoose: (option: string) => void;
  onContinue: () => void;
  /** On a phone: back to the board without choosing. */
  onClose?: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const cardKey = `${run.card.type}:${run.card.id}:${run.phase === "card" ? run.attempt : "f"}`;
  // A new card, or feedback: move focus there, so keyboard and screen reader users follow along.
  useEffect(() => {
    (run.phase === "feedback" ? feedbackRef.current : heading.current)?.focus({ preventScroll: false });
  }, [cardKey, run.phase]);

  if (run.card.type === "event") {
    const e = content.events[run.card.id];
    return (
      <article className="overflow-hidden rounded-3xl bg-surface shadow-lg ring-1 ring-[#f1c4c1]">
        <header className="flex items-center gap-2 bg-[#c7393e] px-5 py-3 text-white">
          <Icon name="alert" className="size-5" />
          <span className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em]">Setback · {clock(run.time)}</span>
          {onClose && <CloseButton onClose={onClose} light />}
        </header>
        <div className="p-5 sm:p-6">
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Icon name={channel[e.channel].icon} className="size-4" /> {channel[e.channel].label} from {e.speaker}
          </p>
          <h2 ref={heading} tabIndex={-1} className="mt-2 font-serif text-2xl font-semibold leading-tight outline-none">
            {e.title}
          </h2>
          <p className="mt-3 text-lg">{e.text}</p>
          <p className="mt-4 rounded-2xl bg-[#fbe3e1] p-3 text-sm text-[#7a1f23]">
            The clock keeps going, and everything you’ve learnt today still applies. You slide back to <strong>{squareName(slideTo ?? 0)}</strong> to replan.
          </p>
          <button type="button" onClick={onContinue} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#c7393e] px-6 font-semibold text-white hover:bg-[#a92f33] sm:w-auto">
            Slide back to {squareName(slideTo ?? 0)} <Icon name="arrow-right" className="size-4 rotate-90" />
          </button>
        </div>
      </article>
    );
  }

  const s = content.scenarios[run.card.id];
  const options = shuffledFor(s, run);
  const context = contextFor(s, run.flags);
  const fb = run.phase === "feedback" ? run.feedback : undefined;
  const chosen = fb ? options.find((o) => o.id === fb.option) : undefined;
  const r = fb ? result[fb.outcome] : undefined;
  const handover = s.kind === "handover";
  return (
    <article className="overflow-hidden rounded-3xl bg-surface shadow-lg ring-1 ring-line">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-5 py-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-semibold">
          <Icon name={channel[s.channel].icon} className="size-4" /> {channel[s.channel].label}
        </span>
        <span className="font-mulish text-sm font-extrabold tabular-nums">{clock(run.time)}</span>
        {s.kind === "recovery" && <span className="rounded-full bg-[#fbe3e1] px-2.5 py-0.5 font-mulish text-xs font-bold text-[#a12d31]">Recovery</span>}
        {s.kind === "opportunity" && <span className="rounded-full bg-[#dff3ea] px-2.5 py-0.5 font-mulish text-xs font-bold text-[#0f5b5b]">Opportunity</span>}
        {handover && <span className="rounded-full bg-[#fde9c4] px-2.5 py-0.5 font-mulish text-xs font-bold text-[#7a4a00]">Handover</span>}
        {onClose && <CloseButton onClose={onClose} />}
      </header>
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          {content.avatars?.[s.speaker] ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small square portrait from public/images
            <img src={content.avatars[s.speaker]} alt="" className="size-12 shrink-0 rounded-full object-cover ring-2 ring-[#fab53d]" />
          ) : (
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-[#1d2b4f] font-mulish text-sm font-extrabold text-white">
              {initials(s.speaker) || "·"}
            </span>
          )}
          <span className="min-w-0 leading-tight">
            <span className="block font-semibold">{s.speaker}</span>
            <span className="block text-sm text-ink-muted">{s.role}</span>
          </span>
        </div>
        <h2 ref={heading} tabIndex={-1} className="mt-4 font-serif text-2xl font-semibold leading-tight outline-none">
          {s.title}
        </h2>
        <p className={cx("mt-3 text-lg", (s.channel === "call" || s.channel === "text") && "rounded-2xl rounded-tl-sm bg-[#eef3f8] p-4")}>{s.prompt}</p>

        {context.length > 0 && (
          <div className="mt-4 rounded-2xl bg-[#fdf6e6] p-3 ring-1 ring-[#f3e2b8]">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-[#7a4a00]">What you know</p>
            <ul className="mt-1 space-y-1 text-sm">
              {context.map((c) => (
                <li key={c} className="flex gap-2">
                  <Icon name="doc" className="mt-0.5 size-4 shrink-0 text-[#7a4a00]" /> {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-5 font-semibold">{s.question}</p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {options.map((o, i) => {
            const picked = chosen?.id === o.id;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  disabled={Boolean(fb)}
                  aria-pressed={picked}
                  onClick={() => onChoose(o.id)}
                  className={cx(
                    "flex w-full items-start gap-3 rounded-2xl p-3.5 text-left ring-1 transition",
                    picked ? "bg-[#e3f4f3] ring-2 ring-[#008282]" : "ring-line enabled:hover:bg-muted enabled:hover:ring-[#008282]",
                    fb && !picked && "opacity-50",
                  )}
                >
                  <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-muted font-mulish text-sm font-extrabold">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span>{o.text}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {chosen && r && (
          <div ref={feedbackRef} tabIndex={-1} role="status" className={cx("mt-5 rounded-2xl p-4 ring-1 outline-none", r.tone)}>
            <p className="flex items-center gap-2 font-semibold">
              <Icon name={r.icon} className="size-5" /> {handover && fb?.outcome === "accept" ? "Handover accepted. That’s your day done." : r.label}
            </p>
            <p className="mt-2 text-[#102a43]">{chosen.feedback}</p>
            {chosen.tip && (
              <p className="mt-2 text-sm text-[#102a43]">
                <strong>Try this:</strong> {chosen.tip}
              </p>
            )}
            <button
              type="button"
              onClick={onContinue}
              className="mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#008282] px-6 font-semibold text-white hover:bg-[#006b6b]"
            >
              {fb?.outcome === "retry" ? "Try again" : handover ? "See how your day went" : "Continue"} <Icon name="arrow-right" className="size-4" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function CloseButton({ onClose, light }: { onClose: () => void; light?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Back to the board"
      className={cx("ml-auto grid size-10 place-items-center rounded-full lg:hidden", light ? "hover:bg-white/15" : "hover:bg-muted")}
    >
      <Icon name="close" className="size-5" />
    </button>
  );
}
