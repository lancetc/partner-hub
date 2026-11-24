"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import type { AvaVideo, ReaderAva } from "@/server/ava";
import { AvaTransmission, avaLineMedia } from "../ava/AvaTransmission";

/*
  A Magazine course's cover (or a page's picture, when its introduction has a video), with Ava (Ava 2.0, docs/ai-learning-guide.md).
  Ava's transmission comes first, every time the page opens: her window is there from the start (her video comes with the
  course), flickers on, shows "Incoming transmission" while her video loads, and she starts by herself (muted, with a
  button for sound, until the page has been used or when the learner has the Audio guide off). When she
  finishes, her last frame holds for a few seconds, then she signs off (the screen folds away and the window flickers
  out) and the picture, after a two-second pause, floats slowly up into place as it fades in. The picture then stays: she's heard again the next time the page opens.
*/

/** How long the finished transmission stays on screen before it signs off. */
const HOLD_MS = 3000;
/** The sign-off: the screen folding away and the window flickering out (ava.css, .ava-signoff). */
const SIGNOFF_MS = 800;

export function CourseCover({
  line,
  ava,
  video,
  title,
  cover,
  script,
  startMuted,
  onEvent,
}: {
  /** Which of Ava's lines this is: a course's introduction (magazine:<id>:intro) or a page's (magazine:<id>:page:<pageId>). */
  line: string;
  /** Ava's name and portrait, sent with the course. */
  ava?: ReaderAva;
  /** Her video for this line, sent with the course; null when she reads the introduction over her portrait. */
  video: AvaVideo | null;
  title: string;
  /** The picture that takes over once Ava has finished: the course's cover, or the page's picture. */
  cover: string | null;
  /** What she says: the video's own script, or the approved introduction she reads. Empty for a video whose script isn't in yet. */
  script: string;
  /** The learner has the Audio guide off: she starts without sound, her words on screen. */
  startMuted: boolean;
  onEvent?: (outcome: "started" | "finished") => void;
}) {
  // "ava": the transmission; "leaving": it's signing off; "cover": the picture.
  const [stage, setStage] = useState<"ava" | "leaving" | "cover">("ava");
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const finished = () => {
    onEvent?.("finished");
    if (!cover) return;
    timers.current.push(
      window.setTimeout(() => {
        setStage("leaving");
        timers.current.push(window.setTimeout(() => setStage("cover"), SIGNOFF_MS));
      }, HOLD_MS),
    );
  };

  if (stage === "cover" && cover)
    return (
      // Once she has signed off, the picture floats up into its place as it fades in (ava.css, .ava-cover-in).
      <div className="ava-cover-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} alt="" className="aspect-[16/9] w-full rounded-3xl bg-muted object-cover" />
      </div>
    );

  return (
    <div className={cx(stage === "leaving" && "ava-signoff")}>
      <AvaTransmission
        layout="block"
        media={avaLineMedia(line, video)}
        portrait={ava?.portrait ?? null}
        name={ava?.name ?? "Ava"}
        // A video with its own words (an interrupted transmission) is read as it was said.
        script={video?.transcript || script}
        title={`Introduction to ${title}`}
        afterEnd="hold"
        autoPlay
        startMuted={startMuted}
        onEvent={(e) => {
          if (e === "started") onEvent?.("started");
          if (e === "completed") finished();
        }}
      />
    </div>
  );
}
