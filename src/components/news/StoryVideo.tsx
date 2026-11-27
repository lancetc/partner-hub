"use client";

import type { StoryVideo as Video } from "@/content/stories";
import { cx } from "@/lib/format";
import { EmbedPlayer } from "../magazine/GuideBlocks";
import { RichText } from "../RichText";

/*
  A news story's video (the owner, Nov 2026): uploaded to the Hub or on YouTube, Vimeo or Loom. It never plays by itself,
  shows captions where it has them, pauses when the reader leaves the page, and offers the transcript underneath.
*/

const pauseWhenHidden = (el: HTMLMediaElement | null) => (el ? () => el.pause() : undefined);

export function StoryVideo({ video: v, fallbackPoster, className }: { video: Video; fallbackPoster?: string; className?: string }) {
  return (
    <figure className={cx("not-prose", className)}>
      {v.embed ? (
        <EmbedPlayer embed={v.embed} title={v.title} />
      ) : (
        <video
          ref={pauseWhenHidden}
          controls
          playsInline
          preload="metadata"
          poster={v.poster ?? fallbackPoster}
          className="aspect-video w-full rounded-2xl bg-black object-contain"
          aria-label={v.title}
        >
          <source src={v.src} />
          {v.captions && <track kind="captions" src={v.captions} srcLang="en" label="English" default />}
        </video>
      )}
      <figcaption className="mt-2 text-base text-ink-muted">
        <span className="font-semibold text-ink">{v.title}</span>
        {v.caption && <> · {v.caption}</>}
      </figcaption>
      {v.transcript && (
        <details className="mt-3 rounded-2xl border border-line bg-surface p-4 text-base">
          <summary className="cursor-pointer font-semibold">Read the transcript</summary>
          <RichText text={v.transcript} className="mt-3 text-ink-muted" />
        </details>
      )}
    </figure>
  );
}
