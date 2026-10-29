"use client";

import Link from "next/link";
import { toggleCardBookmark, useHub, useHydrated, type CardBookmark } from "@/lib/store";
import { formatDate } from "@/lib/format";
import { Icon } from "./Icon";
import { useSavedItems } from "./SearchDialog";
import { SaveButton } from "./SaveButton";

export function SavedList() {
  const hydrated = useHydrated();
  const saved = useHub((s) => s.saved);
  const cards = useHub((s) => s.bookmarks ?? []);
  const loaded = useSavedItems(hydrated ? saved : []);
  if (!hydrated || !loaded) return null;
  const items = loaded;

  if (!items.length && !cards.length) {
    return (
      <p className="mt-8 rounded-3xl bg-muted p-6">
        Nothing saved yet. Use the bookmark on any story, topic or resource, or on a card inside a topic, to find it here.{" "}
        <Link href="/" className="font-semibold text-accent underline underline-offset-4">
          Browse the news
        </Link>
      </p>
    );
  }

  return (
    <>
      {cards.length > 0 && <SavedCards cards={cards} />}
      {items.length > 0 && (
        <ul className="mt-8 flex flex-col divide-y divide-line border-y border-line">
          {items.map((r) => (
            <li key={r.id} className="relative flex items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{r.meta}</p>
                <Link href={r.href} className="font-serif text-xl font-semibold leading-snug after:absolute after:inset-0 after:content-[''] hover:underline">
                  {r.title}
                </Link>
              </div>
              <SaveButton id={r.id} title={r.title} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Cards bookmarked inside lessons, grouped by lesson; each opens straight on that card. */
function SavedCards({ cards }: { cards: CardBookmark[] }) {
  const lessons = [...new Set(cards.map((c) => c.lesson))];
  return (
    <section aria-labelledby="saved-cards" className="mt-8">
      <h2 id="saved-cards" className="font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
        Saved cards
      </h2>
      <p className="mt-1 text-sm text-ink-muted">Cards you bookmarked inside a topic. Opening one takes you straight to it, without changing your progress.</p>
      <div className="mt-3 flex flex-col gap-4">
        {lessons.map((slug) => {
          const here = cards.filter((c) => c.lesson === slug);
          return (
            <div key={slug} className="rounded-3xl border border-line bg-surface p-4">
              <p className="font-serif text-lg font-semibold">{here[0].lessonTitle}</p>
              <ul className="mt-2 flex flex-col gap-1">
                {here.map((c) => (
                  <li key={c.card} className="relative flex items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-muted">
                    <Icon name="bookmark-filled" className="size-4 shrink-0 text-action" />
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/learning/${encodeURIComponent(c.lesson)}?card=${encodeURIComponent(c.card)}`}
                        className="font-semibold leading-snug after:absolute after:inset-0 after:content-[''] hover:underline"
                      >
                        {c.heading || c.label || "Untitled card"}
                      </Link>
                      <span className="block text-xs text-ink-muted">
                        {c.label && c.heading ? `${c.label} · ` : ""}saved {formatDate(c.savedAt)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleCardBookmark(c)}
                      className="relative z-10 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-danger"
                      aria-label={`Remove the bookmark on “${c.heading || c.label}”`}
                    >
                      <Icon name="close" className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
