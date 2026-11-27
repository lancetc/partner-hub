"use client";

import { IntroPlayer } from "../magazine/IntroPlayer";
import type { NarrationAudio } from "@/lib/magazine";

/*
  A news story's voiced introduction (the owner, Nov 2026): the Magazine's introduction player, read in the Magazine
  Editorial Voice (Alloy). The article page shows it only once an author has approved the recording of this script.
  As on a Magazine page it starts by itself when the story opens, unless the learner has automatic audio off, and asks
  for a tap when the browser won't start sound on its own.
*/
export function StoryIntro({ script, audio, className }: { script: string; audio: NarrationAudio; className?: string }) {
  // On the story's own picture, as a Magazine course plays its introduction on its cover.
  return <IntroPlayer script={script} audio={audio} autoPlay onPicture className={className} onEvent={() => {}} />;
}
