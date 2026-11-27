"use client";

import { useState } from "react";
import { Icon } from "../Icon";
import { ImageZoom } from "../home/ImageZoom";

/*
  A story picture readers can open full size (the owner, Nov 2026): the author ticks "Open full size when clicked" in the
  News editor. It opens in the Hub's zoom view: the whole picture, then click a spot to zoom in on it and look around.
*/
export function ZoomablePicture({
  src,
  alt,
  shownAlt,
  width,
  height,
}: {
  src: string;
  /** Its description, for the full-size view. */
  alt: string;
  /** What the picture in the story says to screen readers ("" when its caption already describes it). */
  shownAlt: string;
  width: number;
  height: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group relative block w-full cursor-zoom-in rounded-2xl text-left">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={shownAlt} width={width} height={height} loading="lazy" className="h-auto w-full rounded-2xl" />
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-surface/95 px-3 py-1.5 font-mulish text-sm font-semibold text-ink shadow transition group-hover:bg-surface">
          <Icon name="expand" className="size-4" /> Enlarge
          <span className="sr-only"> the picture{alt ? `: ${alt}` : ""}</span>
        </span>
      </button>
      <ImageZoom src={src} alt={alt} width={width} height={height} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
