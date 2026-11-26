"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, type Me } from "@/lib/api";
import { Icon } from "./Icon";
import { UserAvatar } from "./UserAvatar";

/*
  Your profile picture, in Profile and settings: add one, replace it with another, take one with the webcam, or remove
  it and go back to your initials. The picture is cropped square on the server; the preview shows it the same way.
*/

const PICTURE_CHANGED = "profile-picture-changed";

export function ProfilePicture({ me, onChange }: { me: Me; onChange: (avatar: string | null) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const has = Boolean(me.user.avatar);
  // Only offered where the browser has a camera API (a secure page: https, or localhost).
  const [canCamera, setCanCamera] = useState(false);
  const [camera, setCamera] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- known only in the browser
    setCanCamera(Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  async function upload(file: File) {
    setProblem(null);
    setNote(null);
    if (!file.type.startsWith("image/")) return setProblem("Choose a picture: a JPEG, PNG or WebP photo.");
    if (file.size > 10 * 1024 * 1024) return setProblem("That picture is over 10 MB. Try a smaller one.");
    setPreview(URL.createObjectURL(file));
    setBusy("upload");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/me/picture", { method: "POST", body });
      const data = (await res.json()) as { avatar?: string; error?: string };
      if (!res.ok || !data.avatar) throw new Error(data.error ?? "Couldn’t save that picture.");
      onChange(data.avatar);
      window.dispatchEvent(new Event(PICTURE_CHANGED));
      setNote(has ? "Picture replaced." : "Picture added.");
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setPreview(null);
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setProblem(null);
    setBusy("remove");
    try {
      await api("/api/me/picture", { method: "DELETE" });
      onChange(null);
      window.dispatchEvent(new Event(PICTURE_CHANGED));
      setNote("Picture removed. Your initials show instead.");
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
          <img src={preview} alt="" className="size-24 rounded-full object-cover opacity-70" />
        ) : (
          <UserAvatar name={me.user.name} src={me.user.avatar} className="size-24 text-2xl" />
        )}
        {busy === "upload" && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/30 text-xs font-semibold text-white">Saving…</span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="font-semibold">Profile picture</p>
        <p className="text-sm text-ink-muted">Shown in the menu and the Community. A clear photo of your face works best; it’s cropped to a circle.</p>
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={id}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-[#008282] px-4 font-semibold text-white hover:bg-[#006b6b] has-[:disabled]:opacity-60"
          >
            <Icon name="camera" className="size-4" /> {has ? "Replace picture" : "Add a picture"}
            <input
              ref={input}
              id={id}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={busy !== null}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
          </label>
          {canCamera && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setCamera(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#008282] px-4 font-semibold text-[#007373] hover:bg-tealtint disabled:opacity-60 dark:text-[#3cb8b9]"
            >
              <Icon name="camera" className="size-4" /> Take a photo
            </button>
          )}
          {has && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={remove}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 font-semibold text-ink-muted hover:bg-muted hover:text-ink disabled:opacity-60"
            >
              <Icon name="trash" className="size-4" /> {busy === "remove" ? "Removing…" : "Remove"}
            </button>
          )}
        </div>
        <p className="text-sm" role="status">
          {problem ? <span className="font-semibold text-danger">{problem}</span> : note && <span className="text-ink-muted">{note}</span>}
        </p>
      </div>
      {camera && (
        <CameraCapture
          onClose={() => setCamera(false)}
          onUse={(file) => {
            setCamera(false);
            void upload(file);
          }}
        />
      )}
    </div>
  );
}

/** The photo's size: square, cut from the middle of the camera's picture, as the circle shows it. */
const SHOT = 800;

/**
  Take a profile photo with the webcam: the live picture in a circle (mirrored, as a mirror would show you), then Take
  photo, look at it, and Use this photo or Retake. The camera is on only while this is open, and switched off whenever it
  closes. Nothing is sent until Use this photo, which uploads it like a chosen file.
*/
function CameraCapture({ onClose, onUse }: { onClose: () => void; onUse: (file: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"starting" | "live" | "taken" | "error">("starting");
  const [error, setError] = useState("");
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const takeButton = useRef<HTMLButtonElement>(null);
  // The latest onClose, so a re-render of the profile panel never restarts the camera.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) video.current.srcObject = s;
        setState("live");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera access is blocked. Allow the camera for this site in your browser’s settings, or upload a picture instead."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera was found. Connect one, or upload a picture instead."
              : name === "NotReadableError"
                ? "The camera is in use by another app. Close it and try again."
                : "The camera couldn’t start. Try again, or upload a picture instead.",
        );
        setState("error");
      });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, []);

  useEffect(() => {
    if (state === "live") takeButton.current?.focus();
  }, [state]);
  useEffect(() => () => void (shot && URL.revokeObjectURL(shot.url)), [shot]);

  const take = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = SHOT;
    canvas.height = SHOT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirrored, the way the preview showed it, from the middle square of the picture.
    ctx.translate(SHOT, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, SHOT, SHOT);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setShot({ url: URL.createObjectURL(blob), blob });
        setState("taken");
      },
      "image/jpeg",
      0.9,
    );
  };

  const button = "inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-semibold";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="camera-title" className="w-full max-w-md rounded-3xl bg-[var(--glass-pop)] p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 id="camera-title" className="font-serif text-xl font-semibold">
            Take a photo
          </h2>
          <button type="button" onClick={onClose} aria-label="Close the camera" className="grid size-10 place-items-center rounded-full hover:bg-muted">
            <Icon name="close" className="size-5" />
          </button>
        </div>
        <div className="relative mx-auto mt-4 aspect-square w-full max-w-80 overflow-hidden rounded-full bg-[#0b1f33]">
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            aria-label="Your camera"
            className={state === "taken" ? "hidden" : "size-full -scale-x-100 object-cover"}
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- the photo just taken, before it's saved */}
          {state === "taken" && shot && <img src={shot.url} alt="The photo you took" className="size-full object-cover" />}
          {state === "starting" && <p className="absolute inset-0 grid place-items-center text-sm font-semibold text-white">Starting the camera…</p>}
        </div>
        {state === "error" ? (
          <p role="alert" className="mt-4 text-sm font-semibold text-danger">
            {error}
          </p>
        ) : (
          <p className="mt-3 text-center text-sm text-ink-muted">
            {state === "taken" ? "Happy with it? Your face should fill most of the circle." : "Look at the camera, with your face in the circle."}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {state === "taken" && shot ? (
            <>
              <button
                type="button"
                onClick={() => onUse(new File([shot.blob], "webcam-photo.jpg", { type: "image/jpeg" }))}
                className={`${button} bg-[#008282] text-white hover:bg-[#006b6b]`}
              >
                <Icon name="check" className="size-4" /> Use this photo
              </button>
              <button type="button" onClick={() => setState("live")} className={`${button} text-ink-muted hover:bg-muted hover:text-ink`}>
                <Icon name="refresh" className="size-4" /> Retake
              </button>
            </>
          ) : state === "error" ? (
            <button type="button" onClick={onClose} className={`${button} bg-[#008282] text-white hover:bg-[#006b6b]`}>
              Close
            </button>
          ) : (
            <button
              ref={takeButton}
              type="button"
              onClick={take}
              disabled={state !== "live"}
              className={`${button} bg-[#008282] text-white hover:bg-[#006b6b] disabled:opacity-60`}
            >
              <Icon name="camera" className="size-4" /> Take photo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { PICTURE_CHANGED };
