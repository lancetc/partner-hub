"use client";

import { IntroPlayer } from "../magazine/IntroPlayer";
import type { NarrationAudio } from "@/lib/magazine";

/*
  A news story's voiced introduction (the owner, Nov 2026): the Magazine's introduction player, read in the Magazine
  Editorial Voice (Alloy). The article page shows it only once an author has approved the recording of this script.
*/
export function StoryIntro({ script, audio }: { script: string; audio: NarrationAudio }) {
  return <IntroPlayer script={script} audio={audio} onEvent={() => {}} />;
}
