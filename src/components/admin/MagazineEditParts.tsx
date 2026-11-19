"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { FRAMES, frameClass, picturePosition, positionText, type Block, type Frame, type Media, type Verdict } from "@/lib/magazine";
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

/**
  A picture cropped to its frame, as readers see it, that the author drags to choose which part shows. Arrow keys
  nudge it; double-click centres it again. The picture itself isn't changed: only its position is saved.
*/
export function RepositionPicture({ media, className, onMove }: { media: Media; className: string; onMove: (position: string | undefined) => void }) {
  const [moving, setMoving] = useState<[number, number] | null>(null);
  const drag = useRef<{ x: number; y: number; from: [number, number]; spareX: number; spareY: number; at: [number, number] } | null>(null);
  const [x, y] = moving ?? picturePosition(media.position);
  const save = (p: [number, number]) => onMove(p[0] === 50 && p[1] === 50 ? undefined : positionText(p[0], p[1]));
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Picture position: drag the picture, or use the arrow keys, to choose what shows"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(y)}
      aria-valuetext={`${Math.round(x)}% across, ${Math.round(y)}% down`}
      className="group relative cursor-grab touch-none select-none rounded-2xl outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus active:cursor-grabbing"
      onPointerDown={(e) => {
        const img = e.currentTarget.querySelector("img");
        if (!img?.naturalWidth) return;
        e.preventDefault();
        const r = img.getBoundingClientRect();
        // How far the picture runs past the frame, each way: dragging moves it within that.
        const scale = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight);
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          from: [x, y],
          spareX: img.naturalWidth * scale - r.width,
          spareY: img.naturalHeight * scale - r.height,
          at: [x, y],
        };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
        setMoving([x, y]);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        // Dragging the picture down shows more of its top, so the position goes up.
        const nx = d.spareX > 1 ? clamp(d.from[0] - ((e.clientX - d.x) / d.spareX) * 100) : d.from[0];
        const ny = d.spareY > 1 ? clamp(d.from[1] - ((e.clientY - d.y) / d.spareY) * 100) : d.from[1];
        d.at = [nx, ny];
        setMoving(d.at);
      }}
      onPointerUp={() => {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        setMoving(null);
        if (d.at[0] !== d.from[0] || d.at[1] !== d.from[1]) save(d.at);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setMoving(null);
      }}
      onDoubleClick={() => save([50, 50])}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 2;
        const by = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [step, 0], ArrowRight: [-step, 0] }[e.key];
        if (!by) return;
        e.preventDefault();
        save([clamp(x + by[0]), clamp(y + by[1])]);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={media.src} alt={media.alt} draggable={false} className={cx(className, "pointer-events-none")} style={{ objectPosition: `${x}% ${y}%` }} />
      <span
        aria-hidden
        className={cx(
          "pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white transition-opacity",
          moving ? "opacity-0" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        <Icon name="grip" className="size-3.5" /> Drag to reposition · double-click to centre
      </span>
    </div>
  );
}

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
  framing,
}: {
  media: Media;
  onPick: (src: string | null) => void;
  aspect?: string;
  className?: string;
  /** A Crop button on the picture. Off where the block's toolbar has one. */
  crop?: boolean;
  /** The frame shape, offered under the picture; in a frame, the picture is dragged to choose what shows. */
  framing?: { frame: Frame | undefined; onFrame: (f: Frame | undefined) => void; onMove: (position: string | undefined) => void };
}) {
  if (!media.src) return <ImageDropZone onChange={(p) => onPick(p?.src ?? null)} label="Drag a picture here" addLabel="Add picture" aspect={aspect} />;
  if (!framing) return <PlacedPicture media={media} onPick={onPick} className={className} crop={crop} />;
  return (
    <div className={className}>
      {framing.frame ? (
        <RepositionPicture media={media} className={cx("w-full rounded-2xl bg-muted", frameClass(framing.frame))} onMove={framing.onMove} />
      ) : (
        <PlacedPicture media={media} onPick={onPick} crop={crop} />
      )}
      <div role="group" aria-label="Picture shape" className="mt-2 flex flex-wrap items-center gap-1 text-xs font-semibold">
        <span className="mr-1 text-ink-muted">Shape</span>
        {FRAMES.map((f) => (
          <button
            key={f.label}
            type="button"
            aria-pressed={framing.frame === f.value}
            onClick={() => framing.onFrame(f.value)}
            className={cx(
              "min-h-8 rounded-full border px-3",
              framing.frame === f.value ? "border-action bg-action text-on-action" : "border-line-strong hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        ))}
        {!framing.frame && <span className="ml-1 text-ink-muted">Pick a shape to drag the picture into place.</span>}
      </div>
    </div>
  );
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
