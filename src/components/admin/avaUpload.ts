"use client";

import { api } from "@/lib/api";
import type { AvaVideoState } from "@/server/ava";

/** A video's size and length, read in the browser (the library needs its size; its length times the words when ElevenLabs can't). */
function videoSize(file: File) {
  return new Promise<{ width: number; height: number; seconds: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = () => {
      resolve({ width: v.videoWidth || 1280, height: v.videoHeight || 720, seconds: Number.isFinite(v.duration) ? v.duration : 0 });
      URL.revokeObjectURL(url);
    };
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration)) return done();
      // Some recordings (WebM) only know their length once asked to go to the end.
      v.ontimeupdate = () => {
        v.ontimeupdate = null;
        done();
      };
      v.currentTime = 1e101;
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn’t be read as a video. Try an MP4."));
    };
    v.src = url;
  });
}

/**
  Puts a video made elsewhere (an ElevenLabs transmission with the Laura avatar, say) in as one of Ava's lines: uploaded
  to the image library, then attached to the line with what it says (server/ava.ts, attachAvaVideo).
*/
export async function uploadAvaVideo(key: string, file: File, transcript: string) {
  const size = await videoSize(file);
  const form = new FormData();
  form.append("file", file);
  form.append("width", String(size.width));
  form.append("height", String(size.height));
  const res = await fetch("/api/admin/uploads", { method: "POST", body: form });
  const saved = (await res.json().catch(() => ({}))) as { src?: string; error?: string };
  if (!res.ok || !saved.src) throw new Error(saved.error ?? "The video couldn’t be uploaded.");
  return api<{ state: AvaVideoState; src?: string; timing?: string }>("/api/admin/ava", {
    body: { action: "attach", key, src: saved.src, transcript: transcript.trim(), seconds: size.seconds },
  }).then((r) => ({ ...r, src: saved.src!, width: size.width, height: size.height }));
}
