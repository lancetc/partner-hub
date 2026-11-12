"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cardById, themeOf } from "@/content/conversations";
import { Icon } from "../Icon";
import { FlipCard } from "./FlipCard";

/*
  A Care Conversations team session. Everyone with the code sees the same card. The host turns the cards
  (back, flip, next, end); everyone else's screen follows within a few seconds. Made for a big screen in a
  meeting room as well as phones.
*/

type View = { code: string; theme: string; host: string; youHost: boolean; cardId: string; position: number; total: number; flipped: boolean };

const POLL_MS = 3000;

export function Room({ code }: { code: string }) {
  const [view, setView] = useState<View | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Follow the host: check for the current card every few seconds (the host's own screen updates straight away).
  useEffect(() => {
    let live = true;
    const check = async () => {
      try {
        const v = await api<View>(`/api/conversations/rooms/${encodeURIComponent(code)}`);
        if (live) setView(v);
      } catch (e) {
        if (live) setGone((e as Error).message);
      }
    };
    void check();
    const t = window.setInterval(check, POLL_MS);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, [code]);

  async function move(action: "next" | "back" | "flip" | "end") {
    setBusy(true);
    try {
      const r = await api<View | { ended: true }>(`/api/conversations/rooms/${encodeURIComponent(code)}`, { body: { action } });
      if ("ended" in r) setGone("You ended the session. Thanks for hosting.");
      else setView(r);
    } catch (e) {
      setGone((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (gone)
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-3xl border border-line bg-surface p-8 text-center">
          <p className="font-serif text-2xl font-semibold">{gone}</p>
          <Link href="/play/conversations" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#008282] px-5 font-semibold text-white">
            Back to Care Conversations
          </Link>
        </div>
      </Shell>
    );
  if (!view)
    return (
      <Shell>
        <p className="text-center text-ink-muted">Joining the session…</p>
      </Shell>
    );

  const card = cardById(view.cardId)!;
  const theme = view.theme === "all" ? null : themeOf(card.theme);
  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Care Conversations · team session</p>
          <p className="text-sm text-ink-muted">
            {view.youHost ? "You’re hosting" : `Hosted by ${view.host}`}
            {theme && ` · ${theme.emoji} ${theme.name}`}
          </p>
        </div>
        <div className="rounded-2xl bg-[#1d2b4f] px-4 py-2 text-white">
          <p className="text-xs text-white/75">Join at Play → Care Conversations with code</p>
          <p className="font-mulish text-2xl font-extrabold tracking-[0.3em]" aria-label={`Session code ${view.code.split("").join(" ")}`}>
            {view.code}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-5">
        <FlipCard
          card={card}
          flipped={view.flipped}
          onFlip={view.youHost ? () => move("flip") : undefined}
          size="lg"
          label={`Card ${view.position + 1} of ${view.total}`}
        />
        <p className="text-sm font-semibold tabular-nums text-ink-muted" aria-live="polite">
          Card {view.position + 1} of {view.total}
          {view.flipped ? " · go deeper" : ""}
        </p>
        {view.youHost ? (
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" disabled={busy || view.position === 0} onClick={() => move("back")} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line-strong px-5 font-semibold hover:bg-muted disabled:opacity-40">
              <Icon name="arrow-left" className="size-4" /> Back
            </button>
            <button type="button" disabled={busy} onClick={() => move("flip")} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line-strong px-5 font-semibold hover:bg-muted">
              <Icon name="refresh" className="size-4" /> {view.flipped ? "Show the question" : "Go deeper"}
            </button>
            <button
              type="button"
              disabled={busy || view.position >= view.total - 1}
              onClick={() => move("next")}
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#008282] px-6 font-semibold text-white hover:bg-[#006b6b] disabled:opacity-40"
            >
              Next card <Icon name="arrow-right" className="size-4" />
            </button>
            <button type="button" disabled={busy} onClick={() => move("end")} className="inline-flex min-h-12 items-center gap-2 rounded-full px-5 font-semibold text-ink-muted hover:bg-muted">
              End session
            </button>
          </div>
        ) : (
          <p className="max-w-md text-center text-ink-muted">The host turns the cards. Think about the question, then share your perspective out loud when you’re ready. Passing is always fine.</p>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">{children}</div>;
}
