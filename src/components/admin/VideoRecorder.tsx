"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { btn } from "./ui";

/*
  Records a short talking-head clip from the webcam for a card's video bubble. The preview is a
  circle, the way learners will see it. Nothing leaves the computer until "Use this video".
*/

export const MAX_SECONDS = 90;
const TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

type Stage = "off" | "starting" | "live" | "countdown" | "recording" | "review" | "saving";

export function VideoRecorder({ onSave, onCancel }: { onSave: (clip: Blob) => Promise<void>; onCancel: () => void }) {
  const live = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [stage, setStage] = useState<Stage>("off");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [count, setCount] = useState(3);
  const [clip, setClip] = useState<{ blob: Blob; url: string } | null>(null);

  const stopCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => () => stopCamera(), []);
  useEffect(() => () => void (clip && URL.revokeObjectURL(clip.url)), [clip]);

  // Recording timer, with an automatic stop at the limit.
  useEffect(() => {
    if (stage !== "recording") return;
    const t = window.setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) recorder.current?.stop();
        return s + 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [stage]);

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can’t record video. Try Chrome, Edge or Safari, or upload a video instead.");
      return;
    }
    setStage("starting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } }, audio: true });
      if (live.current) {
        live.current.srcObject = stream.current;
        await live.current.play().catch(() => {});
      }
      setStage("live");
    } catch (e) {
      const name = (e as DOMException).name;
      setError(
        name === "NotAllowedError"
          ? "The browser didn’t allow the camera. Allow camera and microphone for this site in the address bar, then try again."
          : name === "NotFoundError"
            ? "No camera was found. Plug one in, or upload a video instead."
            : "The camera couldn’t start. Close other apps using it and try again.",
      );
      setStage("off");
    }
  }

  function begin() {
    if (!stream.current) return;
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(stream.current, type ? { mimeType: type, videoBitsPerSecond: 2_000_000 } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      const blob = new Blob(chunks.current, { type: r.mimeType || "video/webm" });
      setClip({ blob, url: URL.createObjectURL(blob) });
      setStage("review");
    };
    recorder.current = r;
    setSeconds(0);
    r.start(250);
    setStage("recording");
  }

  // 3, 2, 1 before recording starts.
  useEffect(() => {
    if (stage !== "countdown") return;
    const t = window.setTimeout(() => {
      if (count > 1) setCount((c) => c - 1);
      else begin();
    }, 800);
    return () => window.clearTimeout(t);
  });

  async function save() {
    if (!clip) return;
    setStage("saving");
    setError(null);
    try {
      await onSave(clip.blob);
      stopCamera();
    } catch (e) {
      setError((e as Error).message);
      setStage("review");
    }
  }

  const showLive = stage === "live" || stage === "countdown" || stage === "recording" || stage === "starting";
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-muted/50 p-4">
      <div className="relative size-56 overflow-hidden rounded-full bg-[#102a43] shadow-lg ring-4 ring-surface">
        {/* Mirrored, like looking in a mirror; the recording itself isn't flipped. */}
        <video ref={live} muted playsInline className={cx("size-full -scale-x-100 object-cover", !showLive && "hidden")} />
        {stage === "review" && clip && <video src={clip.url} controls playsInline className="size-full object-cover" />}
        {stage === "off" && (
          <div className="grid size-full place-items-center text-white/80">
            <Icon name="camera" className="size-12" />
          </div>
        )}
        {stage === "countdown" && <span className="absolute inset-0 grid place-items-center bg-black/30 font-serif text-7xl font-semibold text-white">{count}</span>}
        {stage === "recording" && (
          <span className="absolute left-1/2 top-3 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white">
            <span className="size-2 animate-pulse rounded-full bg-red-500" /> {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="max-w-sm text-center text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {stage === "off" && (
          <button type="button" className={btn.primary} onClick={startCamera}>
            <Icon name="camera" className="size-4" /> Turn on camera
          </button>
        )}
        {stage === "starting" && <span className="text-sm text-ink-muted">Starting the camera…</span>}
        {stage === "live" && (
          <button type="button" className={btn.primary} onClick={() => (setCount(3), setStage("countdown"))}>
            <span className="size-3 rounded-full bg-red-500" /> Record
          </button>
        )}
        {stage === "recording" && (
          <button type="button" className={btn.primary} onClick={() => recorder.current?.stop()}>
            <span className="size-3 rounded-sm bg-white" /> Stop
          </button>
        )}
        {(stage === "review" || stage === "saving") && (
          <>
            <button type="button" className={btn.primary} onClick={save} disabled={stage === "saving"}>
              {stage === "saving" ? "Saving…" : "Use this video"}
            </button>
            <button type="button" className={btn.secondary} disabled={stage === "saving"} onClick={() => (setClip(null), stream.current ? setStage("live") : startCamera())}>
              Retake
            </button>
          </>
        )}
        <button
          type="button"
          className={btn.quiet}
          disabled={stage === "saving"}
          onClick={() => {
            if (recorder.current?.state === "recording") recorder.current.stop();
            stopCamera();
            onCancel();
          }}
        >
          Cancel
        </button>
      </div>
      <p className="max-w-sm text-center text-xs text-ink-muted">
        Up to {MAX_SECONDS / 60 === 1.5 ? "90 seconds" : `${MAX_SECONDS} seconds`}. Look at the camera, speak to one person, and keep it short. The video stays on this computer until you choose “Use this video”.
      </p>
    </div>
  );
}
