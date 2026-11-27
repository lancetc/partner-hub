"use client";

import { useState } from "react";
import type { Story, StoryVideo as Video } from "@/content/stories";
import { cx } from "@/lib/format";
import { embedLink, parseEmbedLink } from "@/lib/magazine";
import { Icon } from "../Icon";
import { StoryVideo } from "../news/StoryVideo";
import { ImageDropZone } from "./ImagePicker";
import { btn, ErrorNote, Field, input } from "./ui";

/*
  The News editor's video (the owner, Nov 2026): upload one to the Hub (up to 250 MB, with a progress bar) or paste a
  YouTube, Vimeo or Loom link; give it a title, captions, a cover picture and a transcript; and choose where it sits in
  the story. Saved with the story.
*/

const textarea = "w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base leading-relaxed";
const PLACES: { id: Video["placement"]; label: string }[] = [
  { id: "top", label: "Before the story" },
  { id: "opening", label: "After the opening" },
  { id: "end", label: "At the end" },
];
const SITE = { youtube: "YouTube", vimeo: "Vimeo", loom: "Loom" } as const;

/** Uploads a file to the Hub, reporting progress (a long video takes a while). */
function uploadWithProgress(file: File, size: { width: number; height: number }, onProgress: (share: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("width", String(size.width));
    form.append("height", String(size.height));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/uploads");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: { src?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Not JSON: reported below.
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.src) resolve(data.src);
      else reject(new Error(data.error ?? "The upload didn’t work."));
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check the connection and try again."));
    xhr.send(form);
  });
}

/** A video's frame size, read in the browser before uploading. */
function videoSize(file: File) {
  const url = URL.createObjectURL(file);
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve({ width: v.videoWidth || 1280, height: v.videoHeight || 720 });
    v.onerror = () => reject(new Error("This browser can’t read that video. Try an MP4."));
    v.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

export function StoryVideoField({ story, onChange }: { story: Story; onChange: (v: Video | undefined) => void }) {
  const v = story.video;
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [preview, setPreview] = useState(false);
  const base = (): Video => v ?? { title: story.title, placement: "opening" };

  async function upload(file: File | undefined, kind: "video" | "captions") {
    if (!file) return;
    setError(null);
    try {
      if (kind === "video" && !file.type.startsWith("video/")) throw new Error("That file isn’t a video. Upload an MP4, WebM or MOV.");
      if (kind === "video" && file.size > 250 * 1024 * 1024)
        throw new Error("That video is over 250 MB. Put it on YouTube or Vimeo and paste the link instead.");
      setProgress(0);
      const size = kind === "video" ? await videoSize(file) : { width: 0, height: 0 };
      const src = await uploadWithProgress(file, size, setProgress);
      if (kind === "video") {
        const next: Video = { ...base(), src };
        delete next.embed;
        onChange(next);
      } else onChange({ ...base(), captions: src });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }
  function useLink() {
    const embed = parseEmbedLink(link);
    if (!embed) {
      setError("That isn’t a YouTube, Vimeo or Loom video link.");
      return;
    }
    setError(null);
    const next: Video = { ...base(), embed };
    delete next.src;
    delete next.captions;
    onChange(next);
    setLink("");
  }
  const has = Boolean(v?.src || v?.embed);

  return (
    <section aria-labelledby="video-edit-h" className="flex flex-col gap-3 rounded-2xl border border-line p-4 sm:p-5">
      <h2 id="video-edit-h" className="flex items-center gap-2 font-semibold">
        <Icon name="play" className="size-4 text-accent" /> Video <span className="font-normal text-ink-muted">(optional)</span>
      </h2>
      <p className="text-sm text-ink-muted">An interview or a short clip with the story. It never plays by itself.</p>

      {!has ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label
            className={cx(
              "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line-strong p-4 text-center hover:bg-muted",
              progress !== null && "pointer-events-none opacity-60",
            )}
          >
            <Icon name="upload" className="size-5 text-accent" />
            <span className="font-semibold">Upload a video</span>
            <span className="text-sm text-ink-muted">MP4, WebM or MOV, up to 250 MB</span>
            <input type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" onChange={(e) => void upload(e.target.files?.[0], "video")} />
          </label>
          <div className="flex flex-col gap-2">
            <Field label="Or a YouTube, Vimeo or Loom link">
              <input className={input} value={link} placeholder="https://vimeo.com/…" onChange={(e) => setLink(e.target.value)} />
            </Field>
            <button type="button" className={cx(btn.secondary, "self-start")} disabled={!link.trim()} onClick={useLink}>
              Use this link
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            {v?.embed ? (
              <>
                On {SITE[v.embed.provider]}:{" "}
                <a href={embedLink(v.embed)} target="_blank" rel="noreferrer" className="break-all font-semibold text-accent underline underline-offset-2">
                  {embedLink(v.embed)}
                </a>
              </>
            ) : (
              <span className="font-semibold">Uploaded to the Hub</span>
            )}
            <button type="button" className={cx(btn.quiet, "hover:text-danger")} onClick={() => onChange(undefined)}>
              <Icon name="trash" className="size-4" /> Remove the video
            </button>
          </p>
          <Field label="Title" hint="Under the video, and read out by screen readers.">
            <input className={input} value={v?.title ?? ""} onChange={(e) => onChange({ ...base(), title: e.target.value })} />
          </Field>
          <Field label="Caption" hint="Optional: who's in it, and when it was recorded.">
            <input className={input} value={v?.caption ?? ""} onChange={(e) => onChange({ ...base(), caption: e.target.value || undefined })} />
          </Field>
          <div role="radiogroup" aria-label="Where the video sits" className="flex flex-wrap items-center gap-1 text-sm">
            <span className="mr-1 font-semibold">Where it sits</span>
            {PLACES.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={v?.placement === p.id}
                onClick={() => onChange({ ...base(), placement: p.id })}
                className={cx(
                  "min-h-9 rounded-full border px-3",
                  v?.placement === p.id ? "border-[#007f7e] bg-[#e6f3f1] font-semibold text-ink" : "border-line-strong text-ink-muted hover:bg-muted",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {v?.src && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">Captions</p>
              <p className="text-sm text-ink-muted">
                {v.captions ? "A captions file is attached." : "A WebVTT (.vtt) captions file makes the video usable without sound. Recommended."}
              </p>
              <label className={cx(btn.secondary, "cursor-pointer self-start")}>
                <Icon name="upload" className="size-4" /> {v.captions ? "Replace captions" : "Upload captions (.vtt)"}
                <input type="file" accept=".vtt,text/vtt" className="sr-only" onChange={(e) => void upload(e.target.files?.[0], "captions")} />
              </label>
            </div>
          )}
          {v?.src && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">Cover picture</p>
              <p className="text-sm text-ink-muted">Shown before it plays. The story’s poster image is used when this is empty.</p>
              <div className="max-w-sm">
                <ImageDropZone
                  picture={v.poster ? { src: v.poster, width: 1600, height: 900 } : undefined}
                  label="Drag the cover picture here"
                  aspect="aspect-video"
                  onChange={(p) => onChange({ ...base(), poster: p?.src })}
                />
              </div>
            </div>
          )}
          <Field label="Transcript" hint="Optional, under the video: everything that's said, for reading instead.">
            <textarea
              rows={4}
              className={textarea}
              value={v?.transcript ?? ""}
              onChange={(e) => onChange({ ...base(), transcript: e.target.value || undefined })}
            />
          </Field>
          <button type="button" className={cx(btn.quiet, "self-start")} onClick={() => setPreview(!preview)}>
            <Icon name="eye" className="size-4" /> {preview ? "Hide preview" : "Preview"}
          </button>
          {preview && v && <StoryVideo video={v} fallbackPoster={story.visual.photo?.src} />}
        </>
      )}

      {progress !== null && (
        <div role="status" className="flex flex-col gap-1">
          <p className="text-sm text-ink-muted">Uploading… {Math.round(progress * 100)}%</p>
          <div aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-[#007f7e] transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}
      {error && <ErrorNote text={error} />}
    </section>
  );
}
