import "server-only";
import { HttpError } from "./auth";
import type { MediaProvider } from "@/lib/mediaStudio";

/*
  Video providers for Topic Video Introductions (docs/topic-video-introductions.md), behind one shape so the learner
  experience never depends on which one made a video. Synthesia is the first provider, for template-based portrait
  videos. It is switched OFF: its credits are exhausted, and the Hub has never had a verified Synthesia API integration
  (only share links and embeds of videos made in Synthesia's own studio). So there is no network code here at all.

  To switch it on later (see the doc): verify Synthesia's current API (template video creation, status polling, download
  of the rendered MP4 and captions), write `createVideo` and `videoStatus` against it, set SYNTHESIA_API_KEY in
  .env.local, and set TOPIC_INTRO_VIDEO_GENERATION=on. Even then, nothing is submitted without an author confirming it
  for each Topic, and nothing queued is sent automatically when credits are replenished.
*/

export type VideoJob = {
  generationId: string;
  state: "generating" | "generated" | "failed";
  src?: string;
  captionsVtt?: string;
  seconds?: number;
  cost?: number;
  error?: string;
};

export interface VideoProvider {
  id: MediaProvider;
  /** Starts a portrait video from an approved script with a presenter's avatar, voice and template. */
  createVideo(input: { script: string; title: string; avatarId: string; voiceId: string; templateId: string; language: string }): Promise<VideoJob>;
  /** Where a started video is up to. */
  videoStatus(generationId: string): Promise<VideoJob>;
}

/** Video generation is switched on only by explicit configuration. Off by default, and off in this release. */
export const videoGenerationEnabled = () => process.env.TOPIC_INTRO_VIDEO_GENERATION === "on" && Boolean(process.env.SYNTHESIA_API_KEY);

const notEnabled = (): never => {
  throw new HttpError(
    409,
    "Video generation isn't switched on. Synthesia's integration has to be verified and enabled first (docs/topic-video-introductions.md). You can still prepare and approve scripts, and upload a video made elsewhere.",
  );
};

/** Synthesia, not yet integrated: every call refuses, without reaching Synthesia. */
export const synthesia: VideoProvider = {
  id: "synthesia",
  createVideo: async () => notEnabled(),
  videoStatus: async () => notEnabled(),
};

export const videoProviders: Partial<Record<MediaProvider, VideoProvider>> = { synthesia };
