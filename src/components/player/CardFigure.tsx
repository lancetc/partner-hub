"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Card } from "@/content/lessons";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { MotionPhoto } from "../MotionPhoto";
import { PhotoCredit } from "./CardVisual";

type Figure = NonNullable<Card["figure"]>;

/*
  A picture inside a card's text (`card.figure`), as content rather than decoration. Shown whole by
  default, never taller than about half a phone screen; "fill" crops it to a wide frame and "full"
  runs it edge to edge across the card. Tapping it opens it full screen, for reading a form or a diagram.
*/
export function CardFigure({ figure: f, onColour = false, className }: { figure: Figure; onColour?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const fill = f.fit === "fill";
  const full = f.fit === "full";
  return (
    <figure className={cx("flex flex-col gap-1.5", full && "-mx-4", className)}>
      <div
        // A tap anywhere on the picture opens it; the button below is the keyboard and screen reader way in. Swipes still turn the card.
        onClick={f.animated ? undefined : () => setOpen(true)}
        className={cx("relative w-full overflow-hidden", !f.animated && "cursor-zoom-in", full ? "" : "rounded-2xl", onColour ? "bg-white/30" : "bg-muted")}
        style={{ aspectRatio: fill ? "16 / 9" : `${f.width} / ${f.height}`, maxHeight: fill || full ? undefined : "22rem" }}
      >
        {f.animated ? (
          <MotionPhoto still={f.src} mp4={f.animated.mp4} alt={f.alt} className={fill ? undefined : "object-contain!"} />
        ) : (
          <Image src={f.src} alt={f.alt} fill sizes="(min-width: 640px) 30rem, 100vw" className={fill ? "object-cover" : "object-contain"} />
        )}
        {!f.animated && (
          <button
            type="button"
            onClick={(e) => (e.stopPropagation(), setOpen(true))}
            className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/70"
            aria-label={`Open the picture full screen${f.alt ? `: ${f.alt}` : ""}`}
          >
            <Icon name="search" className="size-4" />
          </button>
        )}
        {f.credit && <PhotoCredit credit={f.credit} className="absolute bottom-2 right-2" />}
      </div>
      {f.caption && <figcaption className={cx("text-sm leading-snug", full && "px-4", onColour ? "opacity-85" : "text-ink-muted")}>{f.caption}</figcaption>}
      {open && <FullScreen figure={f} onClose={() => setOpen(false)} />}
    </figure>
  );
}

/** The picture on its own, as large as the screen allows; "Actual size" lets people pan around a detailed image. */
function FullScreen({ figure: f, onClose }: { figure: Figure; onClose: () => void }) {
  const [actual, setActual] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={f.alt || "Picture"} className="fixed inset-0 z-[70] flex flex-col bg-black/90 text-white">
      <div className="flex items-center justify-between gap-2 p-3">
        <button
          type="button"
          onClick={() => setActual((a) => !a)}
          aria-pressed={actual}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-semibold hover:bg-white/25"
        >
          <Icon name="search" className="size-4" /> {actual ? "Fit to screen" : "Actual size"}
        </button>
        <button
          ref={close}
          type="button"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-full bg-white/15 hover:bg-white/25"
          aria-label="Close"
        >
          <Icon name="close" className="size-5" />
        </button>
      </div>
      <div
        className={cx("min-h-0 flex-1", actual ? "overflow-auto" : "flex items-center justify-center p-3")}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={f.src}
          alt={f.alt}
          className={actual ? "max-w-none" : "max-h-full max-w-full object-contain"}
          style={actual ? { width: f.width, height: f.height } : undefined}
        />
      </div>
      {f.caption && <p className="p-4 text-center text-sm text-white/85">{f.caption}</p>}
    </div>,
    document.body,
  );
}
