"use client";

import Image from "next/image";
import type { Card } from "@/content/lessons";
import { cx } from "@/lib/format";
import { MotionPhoto } from "../MotionPhoto";
import { PhotoCredit } from "./CardVisual";

/*
  A picture inside a card's text (`card.figure`), as content rather than decoration. Shown whole by
  default, never taller than about half a phone screen; "fill" crops it to a wide frame instead.
*/
export function CardFigure({ figure: f, onColour = false, className }: { figure: NonNullable<Card["figure"]>; onColour?: boolean; className?: string }) {
  const fill = f.fit === "fill";
  return (
    <figure className={cx("flex flex-col gap-1.5", className)}>
      <div
        className={cx("relative w-full overflow-hidden rounded-2xl", onColour ? "bg-white/30" : "bg-muted")}
        style={{ aspectRatio: fill ? "16 / 9" : `${f.width} / ${f.height}`, maxHeight: fill ? undefined : "22rem" }}
      >
        {f.animated ? (
          <MotionPhoto still={f.src} mp4={f.animated.mp4} alt={f.alt} className={fill ? undefined : "object-contain!"} />
        ) : (
          <Image src={f.src} alt={f.alt} fill sizes="(min-width: 640px) 30rem, 100vw" className={fill ? "object-cover" : "object-contain"} />
        )}
        {f.credit && <PhotoCredit credit={f.credit} className="absolute bottom-2 right-2" />}
      </div>
      {f.caption && <figcaption className={cx("text-sm leading-snug", onColour ? "opacity-85" : "text-ink-muted")}>{f.caption}</figcaption>}
    </figure>
  );
}
