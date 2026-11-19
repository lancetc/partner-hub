"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import type { Block, Media, Verdict } from "@/lib/magazine";
import { ImageDropZone } from "./ImagePicker";
import { ImageCropper } from "./ImageCropper";
import { Icon } from "../Icon";

/* Pieces the Magazine editor's block editors share. */

export const rid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

export type Update = <T extends Block>(blockId: string, fn: (b: T) => void, tag?: string) => void;

export const VERDICT_TONE: Record<Verdict, string> = {
  best: "border-[#2f8f5b] bg-[#e9f6ef] dark:bg-[#17301f]",
  acceptable: "border-[#fab53d] bg-[#fff6e4] dark:bg-[#3a2f17]",
  risky: "border-[#c7393e] bg-[#fdf1f0] dark:bg-[#3a1f1f]",
};

/** A line or paragraph of plain text edited in place, as it appears on the page. */
export function InlineText({
  value,
  onChange,
  placeholder,
  className,
  multiline = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  multiline?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The first value is drawn; after that the browser owns the text, and undo puts new text in.
  const [initial] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerText !== value) el.innerText = value;
  }, [value]);
  return (
    <div
      ref={ref}
      role="textbox"
      aria-label={placeholder}
      aria-multiline={multiline}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={(e) => onChange(e.currentTarget.innerText.replace(/\n$/, ""))}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={cx(
        "cursor-text rounded-md outline-none transition-shadow empty:before:text-ink-muted/60 empty:before:content-[attr(data-placeholder)] hover:bg-ink/5 focus:bg-transparent focus:ring-2 focus:ring-action/60",
        className,
      )}
    >
      {initial}
    </div>
  );
}

/** A picture on the page, or a place to drop one. Its description and width are set in the panel. */
export function MediaSlot({
  media,
  onPick,
  aspect = "aspect-[16/10]",
  className,
  crop = true,
}: {
  media: Media;
  onPick: (src: string | null) => void;
  aspect?: string;
  className?: string;
  /** A Crop button on the picture. Off where the block's toolbar has one. */
  crop?: boolean;
}) {
  if (!media.src) return <ImageDropZone onChange={(p) => onPick(p?.src ?? null)} label="Drag a picture here" addLabel="Add picture" aspect={aspect} />;
  return <PlacedPicture media={media} onPick={onPick} className={className} crop={crop} />;
}

/** A picture already on the page, with a Crop button on it. */
function PlacedPicture({ media, onPick, className, crop }: { media: Media; onPick: (src: string | null) => void; className?: string; crop: boolean }) {
  const [cropping, setCropping] = useState(false);
  return (
    <div className={cx("group/pic relative", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={media.src} alt={media.alt} className="w-full rounded-2xl bg-muted" />
      {crop && (
        <button
          type="button"
          onClick={() => setCropping(true)}
          className="absolute bottom-3 right-3 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface/95 px-3 text-sm font-semibold shadow-md ring-1 ring-line hover:bg-surface sm:opacity-0 sm:group-hover/pic:opacity-100 sm:focus-visible:opacity-100"
        >
          <Icon name="crop" className="size-4" /> Crop
        </button>
      )}
      {cropping && (
        <ImageCropper
          picture={{ src: media.src, width: 0, height: 0 }}
          onClose={() => setCropping(false)}
          onDone={(p) => {
            onPick(p.src);
            setCropping(false);
          }}
        />
      )}
      {!media.decorative && !media.alt && (
        <span className="absolute left-3 top-3 rounded-full bg-[#fdf1f0] px-3 py-1 text-xs font-bold text-[#a12d31] shadow">
          Describe this picture in the panel
        </span>
      )}
    </div>
  );
}
