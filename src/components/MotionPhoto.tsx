"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./Icon";
import { cx } from "@/lib/format";

const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(REDUCE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );

/**
  A GIF (from GIPHY) played as a muted MP4 loop over its still frame. It fills its positioned
  parent. Anything that moves for more than five seconds needs a way to stop it, so there's
  always a pause button; people who've asked for reduced motion see the still until they press play.
*/
export function MotionPhoto({
  still,
  mp4,
  alt,
  className,
  style,
  buttonClassName = "bottom-2 left-2",
}: {
  still: string;
  mp4: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  buttonClassName?: string;
}) {
  const reduced = useReducedMotion();
  // null: follow the reduced-motion setting until the learner presses the button.
  const [choice, setChoice] = useState<boolean | null>(null);
  const playing = choice ?? !reduced;
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing]);

  return (
    <>
      <video
        ref={ref}
        src={mp4}
        poster={still}
        muted
        loop
        playsInline
        autoPlay={playing}
        preload={playing ? "auto" : "none"}
        role="img"
        aria-label={alt}
        className={cx("absolute inset-0 size-full object-cover", className)}
        style={style}
      />
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setChoice(!playing);
        }}
        aria-label={playing ? "Pause animation" : "Play animation"}
        aria-pressed={!playing}
        className={cx(
          "absolute z-10 grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white",
          buttonClassName,
        )}
      >
        <Icon name={playing ? "pause" : "play"} className="size-4" />
      </button>
    </>
  );
}
