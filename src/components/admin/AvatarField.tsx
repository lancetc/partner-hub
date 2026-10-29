"use client";

import { useEffect, useRef, useState } from "react";
import type { Card } from "@/content/lessons";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { CardVisual } from "../player/CardVisual";
import { btn, ErrorNote } from "./ui";

/*
  The AI presenter on a card, made with ElevenLabs: the card's script, read by the hub's voice, and
  a photo of the presenter's face become a lip-synced talking-head video with captions. Replaces
  Synthesia. The video is made once; change the script and it's flagged to remake.
*/

type Photo = { src: string; width: number; height: number };
type Video = Extract<Card["visual"], { kind: "presenter" }>["video"];
type Check = { id: string; status: "pending" | "generating" | "completed" | "failed"; video?: NonNullable<Video> & { durationSec?: number }; error?: string };

const POLL_MS = 10_000;
const GIVE_UP_MS = 15 * 60_000;

/** Same fingerprint the server uses (sha1 of the tidied script), so the editor can spot an out-of-date video. */
async function hashOf(script: string) {
  const data = new TextEncoder().encode(script.trim().replace(/\s+/g, " "));
  const digest = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** For a text card with a script: turn it into an AI presenter card (the script moves into the presenter's transcript). */
export function MakePresenterCard({ card: c, set }: { card: Card; set: (fn: (c: Card) => void) => void }) {
  const settings = useApi<{ portrait: Photo | null }>("/api/admin/avatar").data;
  if (c.type !== "image" || !c.narration?.trim()) return null;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-muted/50 p-3">
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="user" className="size-4 text-accent" /> AI presenter
      </p>
      <p className="text-sm text-ink-muted">
        Turn this card into a talking presenter who reads its script ({words(c.narration)} words), with captions. Made with ElevenLabs, replacing Synthesia.
      </p>
      <button
        type="button"
        className={cx(btn.secondary, "self-start")}
        onClick={() =>
          set((x) => {
            if (x.type !== "image") return;
            const script = x.narration ?? "";
            const presenter = x as unknown as Extract<Card, { type: "presenter" }> & { cta?: string; narration?: string };
            presenter.type = "presenter";
            presenter.transcript = script;
            presenter.durationSec = Math.max(5, Math.round((words(script) / 150) * 60));
            delete presenter.narration;
            delete presenter.cta;
            presenter.visual = {
              kind: "presenter",
              name: "Ava",
              synthetic: true,
              tone: "navy",
              alt: "AI presenter introducing the topic",
              video: { provider: "elevenlabs", id: "", title: "Presenter introduction", orientation: "portrait", poster: settings?.portrait?.src },
            };
          })
        }
      >
        Turn into an AI presenter card
      </button>
    </div>
  );
}

export function AvatarField({ card: c, lesson, photos, set }: { card: Card; lesson: string; photos: Photo[]; set: (fn: (c: Card) => void) => void }) {
  const settings = useApi<{ portrait: Photo | null; configured: boolean }>("/api/admin/avatar");
  const v = c.visual.kind === "presenter" ? c.visual : null;
  const video = v?.video?.provider === "elevenlabs" ? v.video : undefined;
  const script = c.type === "presenter" ? c.transcript : (c.narration ?? "");
  const [picking, setPicking] = useState(false);
  const [portrait, setPortrait] = useState<Photo | null>(null);
  const [working, setWorking] = useState<{ started: number; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    let on = true;
    hashOf(script).then((h) => on && setCurrent(h));
    return () => {
      on = false;
    };
  }, [script]);
  useEffect(() => {
    if (!working) return;
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - working.started) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [working]);

  // The face: this card's photo, else the hub's presenter, else nothing yet.
  const posterPhoto = photos.find((p) => p.src === video?.poster);
  const face: Photo | null = portrait ?? posterPhoto ?? settings.data?.portrait ?? null;

  async function follow(id: string) {
    const started = Date.now();
    setWorking({ started, status: "pending" });
    setElapsed(0);
    try {
      while (live.current) {
        const r = await api<Check>(`/api/admin/avatar?id=${encodeURIComponent(id)}`);
        if (r.status === "completed" && r.video) {
          const made = r.video;
          set((x) => {
            if (x.visual.kind !== "presenter") return;
            const { durationSec, ...rest } = made;
            x.visual.video = rest;
            x.visual.synthetic = true;
            if (x.type === "presenter" && durationSec) x.durationSec = durationSec;
          });
          break;
        }
        if (r.status === "failed") throw new Error(r.error ?? "The video couldn’t be made.");
        setWorking((w) => (w ? { ...w, status: r.status } : w));
        if (Date.now() - started > GIVE_UP_MS) throw new Error("ElevenLabs is taking a long time. Open this card again later to pick the video up.");
        await new Promise((res) => setTimeout(res, POLL_MS));
      }
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      if (live.current) setWorking(null);
    }
  }

  // A video still being made when the card was last saved: pick it up again.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !video?.id || video.src) return;
    resumed.current = true;
    void follow(video.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id, video?.src]);

  async function make() {
    if (!face) return setError("Choose a photo for the presenter’s face first.");
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/admin/avatar", { body: { action: "start", lesson, card: c.id, script, portrait: face } });
      // Remember the video on the card straight away, so closing the editor doesn't lose it.
      set((x) => {
        if (x.visual.kind !== "presenter") return;
        x.visual.video = { provider: "elevenlabs", id, title: "Presenter introduction", orientation: "portrait", poster: face.src };
      });
      await follow(id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!v) return null;
  if (settings.data && !settings.data.configured)
    return <p className="text-sm text-ink-muted">AI presenters use ElevenLabs. Add ELEVENLABS_API_KEY to .env.local and restart the server.</p>;
  const outOfDate = Boolean(video?.src && video.scriptHash && current && video.scriptHash !== current);
  const seconds = Math.max(5, Math.round((words(script) / 150) * 60));

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-muted/50 p-3">
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="user" className="size-4 text-accent" /> AI presenter (ElevenLabs)
      </p>

      <div className="flex gap-3">
        <div className="w-28 shrink-0">
          {video?.src ? (
            <CardVisual visual={v} className="aspect-[9/16] w-full overflow-hidden rounded-xl" />
          ) : face ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={face.src} alt="" className="aspect-[9/16] w-full rounded-xl object-cover object-[center_15%]" />
          ) : (
            <div className="grid aspect-[9/16] w-full place-items-center rounded-xl bg-surface text-center text-xs text-ink-muted">No face yet</div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2 text-sm">
          <p>
            <span className="font-semibold">Script:</span> {words(script)} words, about {seconds} seconds. The presenter says exactly the card’s script.
          </p>
          {video?.src && !outOfDate && <p className="font-semibold text-accent">Video made from the current script.</p>}
          {outOfDate && (
            <p className="rounded-lg bg-gold/25 px-2 py-1 font-semibold">
              The script has changed since this video was made. Remake it so the presenter says the new words.
            </p>
          )}
          <button
            type="button"
            className="self-start text-sm font-semibold text-accent hover:underline"
            onClick={() => setPicking((p) => !p)}
            aria-expanded={picking}
          >
            {picking ? "Done choosing" : "Choose the presenter’s face"}
          </button>
        </div>
      </div>

      {picking && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-ink-muted">
            A head-and-shoulders photo, face to camera, works best. Make one in Media and voice with “Generate a picture with AI” (shape 9:16), or upload one.
          </p>
          <ul className="grid max-h-56 grid-cols-5 gap-1.5 overflow-y-auto">
            {photos.map((p) => (
              <li key={p.src}>
                <button
                  type="button"
                  onClick={() => {
                    setPortrait(p);
                    // Until a video is made, the card shows the chosen face (a made video keeps the face it was made with).
                    if (!video?.src) set((x) => x.visual.kind === "presenter" && x.visual.video && void (x.visual.video.poster = p.src));
                  }}
                  aria-pressed={face?.src === p.src}
                  aria-label="Use this photo as the presenter’s face"
                  className={cx("block aspect-square w-full overflow-hidden rounded-lg border-2", face?.src === p.src ? "border-action" : "border-transparent")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt="" className="size-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
          {face && face.src !== settings.data?.portrait?.src && (
            <button
              type="button"
              className="self-start text-sm font-semibold text-accent hover:underline"
              onClick={async () => {
                try {
                  settings.setData(await api("/api/admin/avatar", { body: { action: "portrait", portrait: face } }));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Use this face for every new presenter video
            </button>
          )}
          {settings.data?.portrait && face?.src === settings.data.portrait.src && <p className="text-xs text-ink-muted">This is the hub’s presenter face.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btn.primary} onClick={make} disabled={Boolean(working) || words(script) < 3}>
          <Icon name="play" className="size-4" /> {working ? "Making the video…" : video?.src ? "Remake presenter video" : "Make presenter video"}
        </button>
        {working && (
          <span role="status" className="text-sm text-ink-muted">
            {working.status === "generating" ? "Animating" : "Queued"} · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}. Usually a few
            minutes.
          </span>
        )}
      </div>
      <p className="text-xs text-ink-muted">
        Uses ElevenLabs credits for the voice and the video. It saves with the topic automatically. Until it’s made, learners hear the script read over the
        photo.
      </p>
      {error && <ErrorNote text={error} />}
    </div>
  );
}
