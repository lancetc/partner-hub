"use client";

import { useEffect, useRef, useState } from "react";
import type { Story, StoryBlock } from "@/content/stories";
import { makePicture } from "@/lib/makePicture";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { btn, ErrorNote } from "./ui";

/*
  The pictures the News writer suggests for a story it has written (the owner, Nov 2026): the poster, made straight
  away when the author ticked "Make a poster picture as well", and up to two pictures for inside the story, each made
  only when the author asks. Every picture comes from the Hub's AI picture service in its house style, lands in the
  image library, and arrives with a description for people who can't see it; the author can change or remove any.
*/

export type PictureIdeas = {
  poster: { idea: string; alt: string; make: boolean } | null;
  pictures: { after: string; idea: string; alt: string; caption: string }[];
};

type State = "idle" | "making" | "done" | "error";

/** Where a picture goes: after its heading's section starts, or after the opening paragraphs (before the first heading). */
function insertAfter(body: StoryBlock[], after: string, block: StoryBlock): StoryBlock[] {
  const h = after ? body.findIndex((b) => b.type === "h2" && b.text === after) : -1;
  if (h >= 0) {
    // After the heading's first paragraph, so the picture sits in its section rather than under the heading itself.
    const next = body.findIndex((b, i) => i > h && b.type !== "h2" && b.type !== "h3");
    const at = next >= 0 && body.slice(h + 1, next).every((b) => b.type === "h3") ? next + 1 : h + 1;
    return [...body.slice(0, at), block, ...body.slice(at)];
  }
  const first = body.findIndex((b) => b.type === "h2");
  const at = first >= 0 ? first : body.length;
  return [...body.slice(0, at), block, ...body.slice(at)];
}

export function StoryPictures({ ideas, story, update }: { ideas: PictureIdeas; story: Story; update: (fn: (s: Story) => Story) => void }) {
  const [poster, setPoster] = useState<State>("idle");
  const [posterError, setPosterError] = useState<string | null>(null);
  const [made, setMade] = useState<Record<number, State>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const started = useRef<PictureIdeas | null>(null);

  async function makePoster() {
    if (!ideas.poster) return;
    setPoster("making");
    setPosterError(null);
    try {
      const photo = await makePicture({ prompt: ideas.poster.idea, aspect: "16:9", title: story.title, alt: ideas.poster.alt });
      update((s) => ({ ...s, visual: { ...s.visual, photo: { ...photo }, alt: s.visual.alt || ideas.poster!.alt } }));
      setPoster("done");
    } catch (e) {
      setPoster("error");
      setPosterError((e as Error).message);
    }
  }
  // The poster is made as soon as the story is written, when the author asked for it (once per draft).
  useEffect(() => {
    if (started.current === ideas) return;
    started.current = ideas;
    setMade({});
    setErrors({});
    if (ideas.poster?.make && !story.visual.photo) void makePoster();
    else setPoster("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideas]);

  async function make(i: number) {
    const p = ideas.pictures[i];
    setMade((m) => ({ ...m, [i]: "making" }));
    setErrors((e) => ({ ...e, [i]: "" }));
    try {
      const photo = await makePicture({ prompt: p.idea, aspect: "3:2", title: p.caption || story.title, alt: p.alt });
      const block: StoryBlock = {
        type: "image",
        src: photo.src,
        width: photo.width,
        height: photo.height,
        alt: p.alt || p.idea,
        align: "full",
        ...(p.caption ? { caption: p.caption } : {}),
      };
      update((s) => ({ ...s, body: insertAfter(s.body, p.after, block) }));
      setMade((m) => ({ ...m, [i]: "done" }));
    } catch (e) {
      setMade((m) => ({ ...m, [i]: "error" }));
      setErrors((x) => ({ ...x, [i]: (e as Error).message }));
    }
  }

  if (!ideas.poster && !ideas.pictures.length) return null;
  return (
    <section aria-labelledby="pictures-h" className="mt-4 rounded-3xl border border-line bg-surface p-5">
      <h2 id="pictures-h" className="flex items-center gap-2 font-semibold">
        <Icon name="image" className="size-4 text-accent" /> Pictures for this story
      </h2>
      <p className="mt-1 text-sm text-ink-muted">Made with AI in the Hub’s house style and saved to the image library. Check each one, and its description.</p>
      <ul className="mt-3 flex flex-col divide-y divide-line">
        {ideas.poster && (
          <li className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Poster image</p>
              <p className="text-sm text-ink-muted">{ideas.poster.idea}</p>
              {posterError && (
                <div className="mt-2">
                  <ErrorNote text={posterError} />
                </div>
              )}
            </div>
            {poster === "making" ? (
              <span className="inline-flex min-h-10 items-center gap-2 text-sm text-ink-muted" role="status">
                <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Making the poster…
              </span>
            ) : poster === "done" ? (
              <span className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[#007f7e]" role="status">
                <Icon name="check" className="size-4" /> Added as the poster
              </span>
            ) : (
              <button type="button" className={btn.secondary} onClick={() => void makePoster()}>
                <Icon name="spark" className="size-4" /> {poster === "error" ? "Try again" : story.visual.photo ? "Make a new poster" : "Make the poster"}
              </button>
            )}
          </li>
        )}
        {ideas.pictures.map((p, i) => (
          <li key={i} className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{p.after ? `In the story, under “${p.after}”` : "In the story, after the opening"}</p>
              <p className="text-sm text-ink-muted">{p.idea}</p>
              {p.caption && <p className="mt-0.5 text-sm italic text-ink-muted">Caption: {p.caption}</p>}
              {errors[i] && (
                <div className="mt-2">
                  <ErrorNote text={errors[i]} />
                </div>
              )}
            </div>
            {made[i] === "making" ? (
              <span className="inline-flex min-h-10 items-center gap-2 text-sm text-ink-muted" role="status">
                <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Making it…
              </span>
            ) : made[i] === "done" ? (
              <span className={cx("inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[#007f7e]")} role="status">
                <Icon name="check" className="size-4" /> Added to the story
              </span>
            ) : (
              <button type="button" className={btn.secondary} onClick={() => void make(i)}>
                <Icon name="spark" className="size-4" /> {made[i] === "error" ? "Try again" : "Make this picture"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
