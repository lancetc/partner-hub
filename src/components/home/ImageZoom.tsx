"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";

/*
  A picture, full screen. Opens over the page with the whole picture in view. Click or tap a spot to zoom in on
  it, then move the pointer (or drag a finger) to look around; click again to zoom back out. Escape, the close
  button or a click on the dark surround closes it, and focus goes back to what opened it.
*/

const ZOOM = 2.6;

export function ImageZoom({
  src,
  alt,
  width,
  height,
  open,
  onClose,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  open: boolean;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const close = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  const shut = useCallback(() => {
    setZoomed(false);
    onClose();
  }, [onClose]);

  // Opened: remember what had focus, move it to Close, stop the page behind scrolling, and listen for Escape.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    close.current?.focus();
    const scroll = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") shut();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = scroll;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, shut]);

  if (!open) return null;

  const at = (e: React.PointerEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - box.left) / box.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - box.top) / box.height) * 100)),
    };
  };

  // Straight onto the page body: a parent that's animating or blurred would otherwise hold it inside its own box.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="The picture, full screen"
      className="hub-zoom fixed inset-0 z-[90] flex flex-col bg-[#071521]/95 text-white"
      onClick={(e) => {
        if (e.target === e.currentTarget) shut();
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p className="text-sm text-white/80">{zoomed ? "Move to look around. Click to zoom out." : "Click the picture to zoom in."}</p>
        <button
          ref={close}
          type="button"
          onClick={shut}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 font-semibold hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Icon name="close" className="size-5" /> Close
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget) shut();
        }}
      >
        <div
          className={cx("relative max-h-full max-w-full overflow-hidden rounded-xl", zoomed ? "cursor-zoom-out" : "cursor-zoom-in")}
          style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, calc((100dvh - 7rem) * ${width / height}))`, touchAction: zoomed ? "none" : "auto" }}
          onClick={(e) => {
            setOrigin(at(e as unknown as React.PointerEvent<HTMLElement>));
            setZoomed((z) => !z);
          }}
          onPointerMove={(e) => {
            if (zoomed) setOrigin(at(e));
          }}
        >
          <Image
            src={src}
            alt={alt}
            fill
            sizes="100vw"
            quality={90}
            className="hub-zoom-img object-contain"
            style={{ transform: zoomed ? `scale(${ZOOM})` : "none", transformOrigin: `${origin.x}% ${origin.y}%` }}
            draggable={false}
          />
        </div>
      </div>
      <p className="px-4 pb-4 text-center text-sm text-white/70 sm:px-6">{alt}</p>
    </div>,
    document.body,
  );
}
