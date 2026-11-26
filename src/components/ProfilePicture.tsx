"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, type Me } from "@/lib/api";
import { Icon } from "./Icon";
import { UserAvatar } from "./UserAvatar";

/*
  Your profile picture, in Profile and settings: add one, replace it with another, take one with the webcam, or remove
  it and go back to your initials. A chosen picture is cropped square first (SquareCrop): you place the square, and see the
  circle it's shown in. Only the cropped square is sent.
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
  // The browser has a camera API only on a secure page (https, or localhost); elsewhere Take a photo explains that.
  const [canCamera, setCanCamera] = useState(false);
  const [camera, setCamera] = useState(false);
  // A chosen picture waiting to be cropped (its local address), before anything is sent.
  const [cropping, setCropping] = useState<string | null>(null);
  const closeCrop = () => {
    if (cropping) URL.revokeObjectURL(cropping);
    setCropping(null);
    if (input.current) input.current.value = "";
  };
  /** A file from the picker: checked, then cropped before it's uploaded. */
  const choose = (file: File) => {
    setProblem(null);
    setNote(null);
    if (!file.type.startsWith("image/")) return setProblem("Choose a picture: a JPEG, PNG or WebP photo.");
    if (file.size > 20 * 1024 * 1024) return setProblem("That picture is over 20 MB. Try a smaller one.");
    setCropping(URL.createObjectURL(file));
  };
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
                if (f) choose(f);
              }}
            />
          </label>
          {/* Always offered, so it's never a mystery where it went: where the browser won't allow a camera, it says why. */}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              setNote(null);
              if (canCamera) {
                setProblem(null);
                setCamera(true);
              } else
                setProblem(
                  `Browsers only allow the camera on a secure address (https, or localhost on this computer), and this is ${window.location.host}. Upload a picture instead, or open the Hub at its https or localhost address.`,
                );
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#008282] px-4 font-semibold text-[#007373] hover:bg-tealtint disabled:opacity-60 dark:text-[#3cb8b9]"
          >
            <Icon name="camera" className="size-4" /> Take a photo
          </button>
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
      {cropping && (
        <SquareCrop
          src={cropping}
          onClose={closeCrop}
          onUse={(file) => {
            closeCrop();
            void upload(file);
          }}
        />
      )}
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
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="camera-title"
        className="w-full max-w-md rounded-3xl bg-[var(--glass-pop)] p-5 shadow-2xl backdrop-blur-xl"
      >
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

/** Where the square sits on the picture, in the picture's own pixels: its top-left corner and its side. */
type Square = { x: number; y: number; side: number };

const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const SMALLEST = 120;

/**
  Crop a chosen picture square (the owner, Nov 2026): the picture with a square frame over it, the circle it'll be shown
  in drawn inside, and everything outside dimmed. Drag the square to move it, or a corner to make it bigger or smaller;
  the arrow keys move it, and with Shift they resize it. It starts as the biggest square in the middle. Use this crop
  makes an 800-pixel square JPEG (smaller if the picture is) and uploads that, like a photo from the camera.
*/
function SquareCrop({ src, onClose, onUse }: { src: string; onClose: () => void; onUse: (file: File) => void }) {
  const img = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [sq, setSq] = useState<Square | null>(null);
  const drag = useRef<{ corner: "move" | "nw" | "ne" | "sw" | "se"; x: number; y: number; from: Square; scale: number } | null>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loaded = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const w = e.currentTarget.naturalWidth;
    const h = e.currentTarget.naturalHeight;
    const side = Math.min(w, h);
    setNatural({ w, h });
    setSq({ x: (w - side) / 2, y: (h - side) / 2, side });
  };

  /** The square after moving it, or dragging a corner (the opposite corner stays put), kept inside the picture. */
  const reshape = (b: Square, corner: "move" | "nw" | "ne" | "sw" | "se", dx: number, dy: number): Square => {
    if (!natural) return b;
    if (corner === "move") return { ...b, x: clampTo(b.x + dx, 0, natural.w - b.side), y: clampTo(b.y + dy, 0, natural.h - b.side) };
    const left = corner === "nw" || corner === "sw";
    const top = corner === "nw" || corner === "ne";
    // The corner that stays put, and the room there is to grow towards the dragged one.
    const ax = left ? b.x + b.side : b.x;
    const ay = top ? b.y + b.side : b.y;
    const room = Math.min(left ? ax : natural.w - ax, top ? ay : natural.h - ay);
    const grow = (left ? -dx : dx) + (top ? -dy : dy);
    const side = clampTo(b.side + grow / 2, Math.min(SMALLEST, room), room);
    return { x: left ? ax - side : ax, y: top ? ay - side : ay, side };
  };

  const begin = (e: React.PointerEvent, corner: "move" | "nw" | "ne" | "sw" | "se") => {
    if (!sq || !natural || !img.current) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { corner, x: e.clientX, y: e.clientY, from: sq, scale: natural.w / img.current.getBoundingClientRect().width };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setSq(reshape(d.from, d.corner, (e.clientX - d.x) * d.scale, (e.clientY - d.y) * d.scale));
  };
  const end = () => {
    drag.current = null;
  };
  const nudge = (e: React.KeyboardEvent) => {
    if (!sq || !natural) return;
    const step = Math.max(2, Math.round(Math.min(natural.w, natural.h) / 50));
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    setSq(e.shiftKey ? reshape(sq, "se", d[0] + d[1], d[0] + d[1]) : reshape(sq, "move", d[0], d[1]));
  };

  const use = () => {
    const el = img.current;
    if (!el || !sq) return;
    const out = Math.round(Math.min(SHOT, sq.side));
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(el, sq.x, sq.y, sq.side, sq.side, 0, 0, out, out);
    canvas.toBlob((blob) => blob && onUse(new File([blob], "profile-picture.jpg", { type: "image/jpeg" })), "image/jpeg", 0.9);
  };

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const corner = "absolute size-5 touch-none rounded-full border-2 border-white bg-[#008282] shadow";
  const button = "inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-semibold";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
        className="w-full max-w-lg rounded-3xl bg-[var(--glass-pop)] p-5 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="crop-title" className="font-serif text-xl font-semibold">
            Crop your picture
          </h2>
          <button type="button" onClick={onClose} aria-label="Cancel and close" className="grid size-10 place-items-center rounded-full hover:bg-muted">
            <Icon name="close" className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-muted">Drag the square to frame your face, or drag a corner to resize it. The circle shows how it’ll look.</p>
        <div className="mt-4 grid place-items-center overflow-hidden rounded-2xl bg-[#0b1f33] p-3">
          <div className="relative select-none" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the chosen picture, on this device only, before it's cropped */}
            <img ref={img} src={src} alt="" draggable={false} onLoad={loaded} className="block max-h-[60vh] w-auto max-w-full" />
            {natural && sq && (
              <div
                role="group"
                aria-roledescription="crop square"
                tabIndex={0}
                aria-label="Crop square. Arrow keys move it; Shift and the arrow keys resize it."
                onKeyDown={nudge}
                onPointerDown={(e) => begin(e, "move")}
                className="absolute cursor-move touch-none outline-none ring-2 ring-white focus-visible:ring-4 focus-visible:ring-[#3cb8b9]"
                style={{
                  left: pct(sq.x, natural.w),
                  top: pct(sq.y, natural.h),
                  width: pct(sq.side, natural.w),
                  height: pct(sq.side, natural.h),
                  boxShadow: "0 0 0 9999px rgba(11, 31, 51, 0.65)",
                }}
              >
                {/* The circle it's shown in. */}
                <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/80 ring-offset-0" />
                <span className={`${corner} -left-2.5 -top-2.5 cursor-nwse-resize`} onPointerDown={(e) => begin(e, "nw")} />
                <span className={`${corner} -right-2.5 -top-2.5 cursor-nesw-resize`} onPointerDown={(e) => begin(e, "ne")} />
                <span className={`${corner} -bottom-2.5 -left-2.5 cursor-nesw-resize`} onPointerDown={(e) => begin(e, "sw")} />
                <span className={`${corner} -bottom-2.5 -right-2.5 cursor-nwse-resize`} onPointerDown={(e) => begin(e, "se")} />
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={use} disabled={!sq} className={`${button} bg-[#008282] text-white hover:bg-[#006b6b] disabled:opacity-60`}>
            <Icon name="check" className="size-4" /> Use this crop
          </button>
          <button type="button" onClick={onClose} className={`${button} text-ink-muted hover:bg-muted hover:text-ink`}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
