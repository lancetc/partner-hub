"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/format";
import { btn, ErrorNote } from "./ui";
import { uploadImage } from "./LessonEditor";
import { Icon } from "../Icon";

/*
  Crop a picture: drag the frame to move it, drag a corner to resize it, or pick a shape. The arrow keys
  move the frame (with Shift they resize it). The cropped picture is saved as a new picture in the image
  library at full resolution, so the original is never changed and can be used again.
*/

type Picture = { src: string; width: number; height: number };
/** The frame, as fractions of the picture (0 to 1), so it doesn't depend on how big the picture is drawn. */
type Box = { x: number; y: number; w: number; h: number };
type Handle = "move" | "nw" | "ne" | "sw" | "se";

const SHAPES: { label: string; ratio: number | null }[] = [
  { label: "Free", ratio: null },
  { label: "16:9", ratio: 16 / 9 },
  { label: "3:2", ratio: 3 / 2 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "Square", ratio: 1 },
  { label: "Portrait 2:3", ratio: 2 / 3 },
];
const MIN = 0.05;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The largest frame of this shape that fits, centred. `ratio` is width over height in pixels. */
function fitted(ratio: number | null, natural: { w: number; h: number }): Box {
  if (!ratio) return { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
  const r = ratio / (natural.w / natural.h); // the shape in fractions of the picture
  const w = r >= 1 ? 1 : r;
  const h = r >= 1 ? 1 / r : 1;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

export function ImageCropper({ picture, onDone, onClose }: { picture: Picture; onDone: (p: Picture) => void; onClose: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [box, setBox] = useState<Box>({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const drag = useRef<{ handle: Handle; start: { x: number; y: number }; box: Box } | null>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [busy, onClose]);

  /** The frame after a move or resize, kept inside the picture and to its shape. */
  const reshape = (b: Box, handle: Handle, dx: number, dy: number): Box => {
    if (handle === "move") return { ...b, x: clamp(b.x + dx, 0, 1 - b.w), y: clamp(b.y + dy, 0, 1 - b.h) };
    const left = handle === "nw" || handle === "sw";
    const top = handle === "nw" || handle === "ne";
    let x1 = b.x,
      y1 = b.y,
      x2 = b.x + b.w,
      y2 = b.y + b.h;
    if (left) x1 = clamp(x1 + dx, 0, x2 - MIN);
    else x2 = clamp(x2 + dx, x1 + MIN, 1);
    if (top) y1 = clamp(y1 + dy, 0, y2 - MIN);
    else y2 = clamp(y2 + dy, y1 + MIN, 1);
    let w = x2 - x1,
      h = y2 - y1;
    if (ratio && natural) {
      // Keep the shape: the height follows the width, within the picture.
      const r = ratio / (natural.w / natural.h);
      h = w / r;
      const room = top ? y2 : 1 - y1;
      if (h > room) {
        h = room;
        w = h * r;
      }
      const roomW = left ? x2 : 1 - x1;
      if (w > roomW) {
        w = roomW;
        h = w / r;
      }
      if (left) x1 = x2 - w;
      if (top) y1 = y2 - h;
    }
    return { x: x1, y: y1, w, h };
  };

  const begin = (e: React.PointerEvent, handle: Handle) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { handle, start: { x: e.clientX, y: e.clientY }, box };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const rect = stage.current?.getBoundingClientRect();
    if (!d || !rect) return;
    setBox(reshape(d.box, d.handle, (e.clientX - d.start.x) / rect.width, (e.clientY - d.start.y) / rect.height));
  };
  const end = () => {
    drag.current = null;
  };
  const nudge = (e: React.KeyboardEvent) => {
    const step = e.altKey ? 0.002 : 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    setBox((b) => (e.shiftKey ? reshape(b, "se", d[0], d[1]) : reshape(b, "move", d[0], d[1])));
  };

  const pixels = natural ? { w: Math.round(box.w * natural.w), h: Math.round(box.h * natural.h) } : null;

  const save = async () => {
    const el = img.current;
    if (!el || !natural || !pixels) return;
    setBusy(true);
    setProblem(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = pixels.w;
      canvas.height = pixels.h;
      canvas.getContext("2d")!.drawImage(el, box.x * natural.w, box.y * natural.h, pixels.w, pixels.h, 0, 0, pixels.w, pixels.h);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) throw new Error("This browser couldn’t make the cropped picture.");
      const name = `${(picture.src.split("/").pop() ?? "picture").replace(/\.\w+$/, "")}-cropped.png`;
      const p = await uploadImage(new File([blob], name, { type: "image/png" }));
      onDone({ src: p.src, width: p.width, height: p.height });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
      setBusy(false);
    }
  };

  const corner = "absolute size-5 rounded-full border-2 border-white bg-action shadow touch-none";
  // Drawn at the top of the page, so a picture in a scrolling sidebar or a block can't trap it under the page.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="crop-h" className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[#0b1626]/80 p-4">
      <div className="flex w-full max-w-4xl flex-col gap-4 rounded-3xl bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <h2 id="crop-h" className="flex items-center gap-2 font-serif text-xl font-semibold">
            <Icon name="crop" className="size-5 text-accent" /> Crop the picture
          </h2>
          <button type="button" className={btn.quiet} onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
        <div role="group" aria-label="Shape" className="flex flex-wrap gap-1.5">
          {SHAPES.map((s) => (
            <button
              key={s.label}
              type="button"
              aria-pressed={ratio === s.ratio}
              disabled={!natural}
              onClick={() => {
                setRatio(s.ratio);
                if (natural) setBox(s.ratio ? fitted(s.ratio, natural) : { x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
              }}
              className={cx(
                "min-h-9 rounded-full border px-3 text-sm font-semibold",
                ratio === s.ratio ? "border-action bg-action text-on-action" : "border-line-strong hover:bg-muted",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="grid place-items-center overflow-hidden rounded-2xl bg-[#0b1626] p-3">
          <div ref={stage} className="relative max-h-[65vh] select-none" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={img}
              src={picture.src}
              alt=""
              crossOrigin="anonymous"
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="block max-h-[65vh] w-auto max-w-full"
            />
            {natural && (
              <div
                role="group"
                aria-roledescription="crop frame"
                tabIndex={0}
                aria-label={`Crop frame${pixels ? `, ${pixels.w} by ${pixels.h} pixels` : ""}. Arrow keys move it; Shift and the arrow keys resize it.`}
                onKeyDown={nudge}
                onPointerDown={(e) => begin(e, "move")}
                className="absolute cursor-move touch-none outline-none ring-2 ring-white focus-visible:ring-4 focus-visible:ring-action"
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.w * 100}%`,
                  height: `${box.h * 100}%`,
                  // Everything outside the frame is dimmed.
                  boxShadow: "0 0 0 9999px rgba(11, 22, 38, 0.6)",
                }}
              >
                {/* Thirds, to help place things. */}
                <span className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }, (_, i) => (
                    <span key={i} className="border border-white/25" />
                  ))}
                </span>
                <span className={cx(corner, "-left-2.5 -top-2.5 cursor-nwse-resize")} onPointerDown={(e) => begin(e, "nw")} />
                <span className={cx(corner, "-right-2.5 -top-2.5 cursor-nesw-resize")} onPointerDown={(e) => begin(e, "ne")} />
                <span className={cx(corner, "-bottom-2.5 -left-2.5 cursor-nesw-resize")} onPointerDown={(e) => begin(e, "sw")} />
                <span className={cx(corner, "-bottom-2.5 -right-2.5 cursor-nwse-resize")} onPointerDown={(e) => begin(e, "se")} />
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btn.primary} onClick={() => void save()} disabled={busy || !pixels || pixels.w < 20 || pixels.h < 20}>
            <Icon name="check" className="size-4" /> {busy ? "Saving…" : "Use the cropped picture"}
          </button>
          {pixels && (
            <p className="text-sm text-ink-muted">
              {pixels.w} × {pixels.h} pixels{pixels.w < 800 ? " · small: it may look soft on wide screens" : ""}
            </p>
          )}
          <p className="ml-auto text-xs text-ink-muted">The original stays in the image library.</p>
        </div>
        {problem && <ErrorNote text={problem} />}
      </div>
    </div>,
    document.body,
  );
}
