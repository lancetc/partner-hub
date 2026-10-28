"use client";

import { useState } from "react";
import { toggleCardBookmark, useCardBookmarked } from "@/lib/store";
import { Icon } from "../Icon";

/** Bookmarks the card on screen so the learner can come back to it from Saved items. */
export function CardBookmark({
  lesson,
  lessonTitle,
  card,
  label,
  heading,
}: {
  lesson: string;
  lessonTitle: string;
  card: string;
  label: string;
  heading: string;
}) {
  const saved = useCardBookmarked(lesson, card);
  const [note, setNote] = useState<string | null>(null);
  const name = heading || label || "this card";
  return (
    <>
      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? `Remove the bookmark on “${name}”` : `Bookmark “${name}” to come back to`}
        title={saved ? "Bookmarked. Find it in Saved items." : "Bookmark this card"}
        onClick={() =>
          setNote(toggleCardBookmark({ lesson, lessonTitle, card, label, heading }) ? "Card bookmarked. Find it in Saved items." : "Bookmark removed.")
        }
        className={
          saved
            ? "inline-flex size-11 items-center justify-center rounded-full text-action hover:bg-muted"
            : "inline-flex size-11 items-center justify-center rounded-full hover:bg-muted"
        }
      >
        <Icon name={saved ? "bookmark-filled" : "bookmark"} className="size-5" />
      </button>
      <span className="sr-only" role="status">
        {note}
      </span>
    </>
  );
}
