"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Card, CardVisual as Visual, Lesson, Tone } from "@/content/lessons";
import { commentsOn } from "@/lib/cardComments";
import { QrShare } from "./QrShare";
import { cardSurface, THEMES, themeIds, type ThemeId } from "@/content/themes";
import type { VisualVariant } from "@/content/stories";
import { api, useApi } from "@/lib/api";
import { factsUsed, tokenFor, volatileIn } from "@/lib/facts";
import { extractText } from "@/lib/lessonText";
import { plainText } from "@/lib/richText";
import { SUBJECTS } from "@/lib/subjects";
import { cx, formatBytes } from "@/lib/format";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon, type IconName } from "../Icon";
import { StoryVisual } from "../StoryVisual";
import { CardVisual } from "../player/CardVisual";
import { VideoBubbles } from "../player/VideoBubbles";
import { WrittenFeedback, type WrittenResult } from "../player/WrittenAnswer";
import { fileSize, RESOURCE_KINDS } from "../player/Resources";
import { VideoRecorder } from "./VideoRecorder";
import { panelledOnColour, toneClasses, useTextTone } from "@/lib/imageTone";
import { parseVideoLink, videoLinkFor } from "@/lib/videoLinks";
import { GRADIENTS, gradientIds } from "@/content/gradients";
import { dropTargets, insertAfterCard, isLinear, mainLine, movable, moveBlock, moveToPosition, nextOf, ordered } from "@/lib/lessonGraph";
import { confirmAction } from "@/lib/confirm";
import { CardComments, ReviewComments, type EditorReview } from "./ReviewComments";
import { openCounts } from "../ReviewThreads";
import { ImageGenerator } from "./ImageGenerator";
import { AvatarField, MakePresenterCard } from "./AvatarField";
import { WidgetBuilder, WidgetFields } from "./WidgetBuilder";
import { RichEditable } from "./RichEditable";
import { IconPick } from "./IconPick";

/*
  Lesson authoring. Cards are edited in place on a canvas (like 7taps); details, media, spaced
  learning and review sit in tabs. A demo of the process: edits stay in this page and are never saved.
*/

const STEPS = [
  { id: "cards", label: "Cards", hint: "Edit the cards in place", icon: "list" },
  { id: "brief", label: "Details", hint: "Who it’s for and what changes", icon: "doc" },
  { id: "media", label: "Media and voice", hint: "Poster, images and narration", icon: "camera" },
  { id: "spaced", label: "Spaced learning", hint: "Follow ups written by Claude", icon: "route" },
  { id: "comments", label: "Comments", hint: "Feedback from reviewers", icon: "chat" },
  { id: "review", label: "Review and publish", hint: "Checks and sign off", icon: "check" },
] as const satisfies readonly { id: string; label: string; hint: string; icon: IconName }[];
type StepId = (typeof STEPS)[number]["id"];

/** How long after the last edit the draft saves itself. */
const AUTOSAVE_MS = 1500;

const TRACKS: { id: Lesson["track"]; label: string }[] = [
  { id: "core", label: "Everyone" },
  { id: "partner", label: "Service partners" },
  { id: "coordinator", label: "Care coordinators" },
  { id: "briefing", label: "Policy briefing" },
];

const CARD_TYPES: { type: Card["type"]; label: string; icon: IconName; hint: string }[] = [
  { type: "checklist", label: "Checklist", icon: "checklist", hint: "A list learners tick off, with an optional note under each item" },
  { type: "rating", label: "Confidence", icon: "star", hint: "A 1 to 5 star rating; learners see the average after rating" },
  { type: "wall", label: "Insight wall", icon: "people", hint: "Learners share an idea, then see what others posted" },
  { type: "poll", label: "Poll", icon: "list", hint: "A vote with no right answer; learners see the results" },
  { type: "presenter", label: "Presenter", icon: "play", hint: "A video introduction" },
  { type: "quiz", label: "Quiz", icon: "check", hint: "Questions with feedback" },
  { type: "response", label: "Reflect", icon: "chat", hint: "A written answer with a model response" },
  { type: "resources", label: "Resources", icon: "folder", hint: "A list of PDFs, websites and toolkits; never holds up the topic" },
  { type: "decision", label: "Role Play", icon: "route", hint: "A scenario with choices that branch to consequences" },
  { type: "summary", label: "Summary", icon: "spark", hint: "Recap, action and official resources" },
  { type: "image", label: "Text", icon: "doc", hint: "A heading, short text and a picture" },
  { type: "written", label: "Written answer", icon: "pen", hint: "Learners answer in their own words; AI checks it against your criteria" },
  { type: "widget", label: "Widget", icon: "widget", hint: "An animated diagram, calculator or game that Claude builds from your description" },
];
// Older card types that existing lessons use but new cards don't need.
const LEGACY_TYPES: typeof CARD_TYPES = [
  { type: "hotspot", label: "Hotspot", icon: "target", hint: "A picture with spots to tap that reveal a note" },
  { type: "audio", label: "Narrated", icon: "volume", hint: "Content read aloud automatically" },
  { type: "listen", label: "Audio", icon: "volume", hint: "A card just for listening, with its own play button" },
  { type: "calculator", label: "Calculator", icon: "clock", hint: "An interactive cost slider" },
];
const typeInfo = (t: Card["type"]) => [...CARD_TYPES, ...LEGACY_TYPES].find((c) => c.type === t) ?? { type: t, label: t, icon: "doc" as IconName, hint: "" };

const LIBRARY = [
  { src: "/images/bill.webp", width: 1042, height: 521 },
  { src: "/images/paula.jpeg", width: 275, height: 183 },
  { src: "/images/mara.jpg", width: 541, height: 360 },
  { src: "/images/oldie.jpg", width: 612, height: 408 },
  { src: "/images/age.jpg", width: 320, height: 180 },
  { src: "/images/cleaner.jpg", width: 1000, height: 667 },
  { src: "/images/daut.webp", width: 1042, height: 938 },
  { src: "/images/mum.webp", width: 1042, height: 938 },
  { src: "/images/sally.jpeg", width: 228, height: 152 },
  { src: "/images/two.jpeg", width: 228, height: 152 },
  { src: "/images/tcp.png", width: 1200, height: 628 },
  { src: "/images/team.jpeg", width: 640, height: 456 },
];
type Photo = {
  src: string;
  width: number;
  height: number;
  credit?: { name: string; url: string; source: "Pexels" | "GIPHY"; page?: string };
  animated?: { mp4: string };
};

/** Uploads an image for a card. The browser measures it; the server checks and stores it. */
export async function uploadImage(file: File): Promise<Photo> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn’t an image.");
  let size: { width: number; height: number };
  try {
    const bmp = await createImageBitmap(file);
    size = { width: bmp.width, height: bmp.height };
    bmp.close();
  } catch {
    throw new Error("This browser can’t read that image. Try a JPEG or PNG.");
  }
  const form = new FormData();
  form.append("file", file);
  form.append("width", String(size.width));
  form.append("height", String(size.height));
  const res = await fetch("/api/admin/uploads", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "The upload didn’t work.");
  return { src: data.src, width: data.width, height: data.height };
}

/** Replaces a library picture with a new file everywhere it's used (lessons are updated on the server). */
export async function replaceImage(filename: string, file: File): Promise<Photo & { lessons: string[] }> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn’t an image.");
  let size: { width: number; height: number };
  try {
    const bmp = await createImageBitmap(file);
    size = { width: bmp.width, height: bmp.height };
    bmp.close();
  } catch {
    throw new Error("This browser can’t read that image. Try a JPEG or PNG.");
  }
  const form = new FormData();
  form.append("file", file);
  form.append("width", String(size.width));
  form.append("height", String(size.height));
  const res = await fetch(`/api/admin/uploads/${encodeURIComponent(filename)}`, { method: "PUT", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "The picture couldn’t be replaced.");
  return { src: data.src, width: data.width, height: data.height, lessons: data.lessons ?? [] };
}

/** The lesson with one picture swapped for another (and its size), as the server does when a picture is replaced. */
function swapPicture(l: Lesson, from: string, to: Photo): Lesson {
  return JSON.parse(JSON.stringify(l), (_k, v) => {
    if (typeof v === "string" && v.includes(from)) return v.split(from).join(to.src);
    if (v && typeof v === "object" && !Array.isArray(v) && (v.src === from || v.src === to.src) && typeof v.width === "number")
      return { ...v, src: to.src, width: to.width, height: to.height };
    return v;
  });
}

/** Uploads a PDF for a Resources card. The server checks it really is a PDF. */
export async function uploadPdf(file: File): Promise<{ src: string; name: string; bytes: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/admin/uploads", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "The upload didn’t work.");
  return { src: data.src, name: data.name, bytes: data.bytes };
}

/** Uploads a recorded or chosen video, with a poster frame so the circle isn't blank before play. */
export async function uploadVideo(clip: Blob, name = "recording.webm"): Promise<{ src: string; poster?: string }> {
  const url = URL.createObjectURL(clip);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    await new Promise<void>((ok, fail) => {
      v.onloadeddata = () => ok();
      v.onerror = () => fail(new Error("That video couldn’t be read. Try a WebM or MP4 file."));
    });
    const w = v.videoWidth || 720;
    const h = v.videoHeight || 720;
    // A still from the start of the clip, as the poster.
    let poster: string | undefined;
    try {
      const c = document.createElement("canvas");
      c.width = Math.min(480, w);
      c.height = Math.round((c.width / w) * h);
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      const jpg = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.85));
      if (jpg) poster = (await uploadImage(new File([jpg], "poster.jpg", { type: "image/jpeg" }))).src;
    } catch {
      // A missing poster only means a plain circle before play.
    }
    const form = new FormData();
    form.append("file", new File([clip], name, { type: clip.type || "video/webm" }));
    form.append("width", String(w));
    form.append("height", String(h));
    const res = await fetch("/api/admin/uploads", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "The video didn’t upload.");
    return { src: data.src, poster };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Uploaded images first, then the built-in library, leaving out any an author has deleted. */
function useLibrary() {
  const up = useApi<{ uploads: (Photo & { name: string })[]; deleted: (Photo & { name: string })[]; hiddenBuiltIns: string[] }>("/api/admin/uploads");
  const hidden = up.data?.hiddenBuiltIns ?? [];
  return {
    photos: [...(up.data?.uploads ?? []), ...LIBRARY.filter((p) => !hidden.includes(p.src))] as Photo[],
    /** Deleted uploads and hidden built-in pictures, to bring back. */
    deleted: [...(up.data?.deleted ?? []), ...LIBRARY.filter((p) => hidden.includes(p.src))] as Photo[],
    reload: up.reload,
  };
}

/** Choose an image, or drag one from your computer onto the box. */
function UploadTile({ onUploaded, className, children }: { onUploaded: (p: Photo) => void; className?: string; children?: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  async function upload(file: File | undefined) {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) return setError("That isn’t an image. Drop a JPEG, PNG, WebP or GIF.");
    setBusy(true);
    setError(null);
    try {
      onUploaded(await uploadImage(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          // Don't let the card underneath take the drop as well.
          e.stopPropagation();
          setOver(false);
          void upload(e.dataTransfer.files[0]);
        }}
        className={cx(
          "flex size-full min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs font-semibold has-[:focus-visible]:outline-2",
          over ? "border-action bg-tealtint text-ink" : "border-line-strong text-ink-muted hover:border-action hover:text-ink",
          busy && "cursor-wait opacity-60",
        )}
        title="Choose an image, or drag one here"
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void upload(file);
          }}
        />
        <Icon name="upload" className="size-4" /> {busy ? "Uploading…" : over ? "Drop to upload" : (children ?? "Upload")}
      </label>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type PexelsHit = { id: number; width: number; height: number; alt: string; color: string | null; thumb: string; credit: NonNullable<Photo["credit"]> };
type PexelsPage = { configured: boolean; photos: PexelsHit[]; page: number; total: number | null; more: boolean };

/**
  Search Pexels for a card photo. Picking one copies it into the image library (with the
  photographer's credit), so it behaves like any upload.
*/
function PexelsPicker({ onPicked, onClose }: { onPicked: (p: Photo, alt: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [orientation, setOrientation] = useState<"" | "landscape" | "portrait" | "square">("");
  // Pexels' curated photos to start with; searches and "More photos" replace them.
  const curated = useApi<PexelsPage>("/api/admin/pexels");
  const [searchResults, setResults] = useState<PexelsPage | null>(null);
  const results = searchResults ?? curated.data;
  const [searched, setSearched] = useState("");
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(q: string, page: number, o = orientation) {
    setLoading(true);
    setError(null);
    try {
      const r = await api<PexelsPage>(`/api/admin/pexels?${new URLSearchParams({ q, page: String(page), ...(o ? { orientation: o } : {}) })}`);
      const prev = results;
      setResults(page > 1 && prev ? { ...r, photos: [...prev.photos, ...r.photos.filter((p) => !prev.photos.some((x) => x.id === p.id))] } : r);
      setSearched(q);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function pick(p: PexelsHit) {
    setPicking(p.id);
    setError(null);
    try {
      const r = await api<Photo & { alt: string }>("/api/admin/pexels", { body: { id: p.id } });
      onPicked({ src: r.src, width: r.width, height: r.height, credit: r.credit }, r.alt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPicking(null);
    }
  }

  if (results && !results.configured)
    return (
      <p className="rounded-xl border-2 border-dashed border-gold p-3 text-sm">
        <strong>Pexels isn’t connected.</strong> Add <code>PEXELS_API_KEY</code> to <code>.env.local</code> and restart the server.
      </p>
    );

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line-strong p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Photos from Pexels</p>
        <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={onClose}>
          Close
        </button>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(query, 1);
        }}
      >
        <input
          type="search"
          className={cx(input, "min-w-40 flex-1")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search, e.g. older woman gardening"
          aria-label="Search Pexels"
        />
        <select
          className={cx(input, "w-auto")}
          value={orientation}
          aria-label="Shape"
          onChange={(e) => {
            const o = e.target.value as typeof orientation;
            setOrientation(o);
            if (searched) void load(searched, 1, o);
          }}
        >
          <option value="">Any shape</option>
          <option value="landscape">Landscape</option>
          <option value="portrait">Portrait</option>
          <option value="square">Square</option>
        </select>
        <button type="submit" className={btn.primary} disabled={loading}>
          <Icon name="search" className="size-4" /> Search
        </button>
      </form>
      <p className="text-xs text-ink-muted" role="status">
        {(loading || (!results && !curated.error)) && !results?.photos.length
          ? "Loading photos…"
          : searched
            ? `${results?.total?.toLocaleString("en-AU") ?? 0} photos for “${searched}”.${orientation ? "" : " Tip: pick a shape to match the card."}`
            : "Popular on Pexels this week. Search for something specific."}
      </p>
      {(error ?? curated.error) && <ErrorNote text={(error ?? curated.error)!} />}
      <ul className="grid max-h-[26rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
        {results?.photos.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => pick(p)}
              disabled={picking !== null}
              className="group relative block aspect-[4/3] w-full overflow-hidden rounded-xl disabled:cursor-wait"
              style={{ backgroundColor: p.color ?? undefined }}
              aria-label={`Use photo by ${p.credit.name}${p.alt ? `: ${p.alt}` : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-left text-[0.65rem] font-semibold text-white">
                {p.credit.name}
              </span>
              {picking === p.id && <span className="absolute inset-0 grid place-items-center bg-black/45 text-xs font-semibold text-white">Adding…</span>}
            </button>
          </li>
        ))}
      </ul>
      {results?.more && (
        <button type="button" className={cx(btn.secondary, "self-center")} disabled={loading} onClick={() => load(searched, results.page + 1)}>
          {loading ? "Loading…" : "More photos"}
        </button>
      )}
      <p className="text-[0.7rem] text-ink-muted">
        Photos from{" "}
        <a href="https://www.pexels.com" target="_blank" rel="noreferrer" className="underline">
          Pexels
        </a>
        , free to use. The photographer is credited on the card.
      </p>
    </div>
  );
}

type GiphyHit = { id: string; width: number; height: number; alt: string; thumb: string; still: string; credit: NonNullable<Photo["credit"]> };
type GiphyPage = { configured: boolean; gifs: GiphyHit[]; page: number; total: number | null; more: boolean };

/**
  Search GIPHY for a card GIF (G rated only). GIFs aren't copied into the library: the card
  plays GIPHY's MP4 over its still frame, and credits whoever made it.
*/
function GiphyPicker({ onPicked, onClose }: { onPicked: (p: Photo, alt: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  // What's trending to start with; searches and "More GIFs" replace it.
  const trending = useApi<GiphyPage>("/api/admin/giphy");
  const [searchResults, setResults] = useState<GiphyPage | null>(null);
  const results = searchResults ?? trending.data;
  const [searched, setSearched] = useState("");
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Thumbnails move only for people who haven't asked for reduced motion.
  const [still] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  async function load(q: string, page: number) {
    setLoading(true);
    setError(null);
    try {
      const r = await api<GiphyPage>(`/api/admin/giphy?${new URLSearchParams({ q, page: String(page) })}`);
      const prev = results;
      setResults(page > 1 && prev ? { ...r, gifs: [...prev.gifs, ...r.gifs.filter((g) => !prev.gifs.some((x) => x.id === g.id))] } : r);
      setSearched(q);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function pick(g: GiphyHit) {
    setPicking(g.id);
    setError(null);
    try {
      const r = await api<Photo & { alt: string }>("/api/admin/giphy", { body: { id: g.id } });
      onPicked({ src: r.src, width: r.width, height: r.height, credit: r.credit, animated: r.animated }, r.alt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPicking(null);
    }
  }

  if (results && !results.configured)
    return (
      <p className="rounded-xl border-2 border-dashed border-gold p-3 text-sm">
        <strong>GIPHY isn’t connected.</strong> Add <code>GIPHY_API_KEY</code> to <code>.env.local</code> and restart the server.
      </p>
    );

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line-strong p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">GIFs from GIPHY</p>
        <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={onClose}>
          Close
        </button>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(query, 1);
        }}
      >
        <input
          type="search"
          className={cx(input, "min-w-40 flex-1")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search, e.g. thank you, high five"
          aria-label="Search GIPHY"
        />
        <button type="submit" className={btn.primary} disabled={loading}>
          <Icon name="search" className="size-4" /> Search
        </button>
      </form>
      <p className="text-xs text-ink-muted" role="status">
        {(loading || (!results && !trending.error)) && !results?.gifs.length
          ? "Loading GIFs…"
          : searched
            ? `${results?.total?.toLocaleString("en-AU") ?? 0} GIFs for “${searched}”. Only G-rated GIFs are shown.`
            : "Trending on GIPHY. Search for something specific. Only G-rated GIFs are shown."}
      </p>
      {(error ?? trending.error) && <ErrorNote text={(error ?? trending.error)!} />}
      <ul className="grid max-h-[26rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
        {results?.gifs.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => pick(g)}
              disabled={picking !== null}
              className="group relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted disabled:cursor-wait"
              aria-label={`Use GIF${g.alt ? `: ${g.alt}` : ""}, by ${g.credit.name}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={still ? g.still : g.thumb} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-left text-[0.65rem] font-semibold text-white">
                {g.credit.name}
              </span>
              {picking === g.id && <span className="absolute inset-0 grid place-items-center bg-black/45 text-xs font-semibold text-white">Adding…</span>}
            </button>
          </li>
        ))}
      </ul>
      {results?.more && (
        <button type="button" className={cx(btn.secondary, "self-center")} disabled={loading} onClick={() => load(searched, results.page + 1)}>
          {loading ? "Loading…" : "More GIFs"}
        </button>
      )}
      <p className="text-[0.7rem] font-semibold text-ink-muted">
        Powered by{" "}
        <a href="https://giphy.com" target="_blank" rel="noreferrer" className="underline">
          GIPHY
        </a>
        <span className="font-normal">. The creator is credited on the card. GIFs play silently, and learners can pause them.</span>
      </p>
    </div>
  );
}

const TONES: Tone[] = ["teal", "navy", "warm", "gold", "sky"];
const VARIANTS: VisualVariant[] = ["petals", "rings", "grid", "wave", "dots", "arc"];

const textarea = "w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[0.98rem] leading-relaxed";
const words = (s = "") => s.trim().split(/\s+/).filter(Boolean).length;
// Audio and Listen cards keep their words in `script`, which the player reads; other cards use `narration`.
const scriptOf = (c: Card) => (c.type === "presenter" ? c.transcript : c.type === "audio" || c.type === "listen" ? c.script : c.narration) ?? "";

/** Where a saved lesson stands (see server/authoredLessons). */
export type LessonStatus = { state: "unpublished" | "live" | "changes"; version: string; updatedAt: string | null; publishedAt: string | null };

const savedTime = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });

export function LessonEditor({ initial, isNew, status: initialStatus, card }: { initial: Lesson; isNew: boolean; status?: LessonStatus; card?: string }) {
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson>(() => structuredClone(initial));
  const [status, setStatus] = useState<LessonStatus | null>(initialStatus ?? null);
  const [busy, setBusy] = useState<"save" | "publish" | "discard" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Set when the lesson was saved somewhere else (another tab, another author) after this tab loaded it.
  const [conflict, setConflict] = useState<string | null>(null);
  const leaving = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Goes with the next publish: what changed, and whether people who already did it should be told.
  const [changeNote, setChangeNote] = useState("");
  const [important, setImportant] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [step, setStep] = useState<StepId>("cards");
  const [selected, setSelected] = useState(card && initial.nodes[card] ? card : initial.start);
  const [dirty, setDirty] = useState(false);
  // Counts edits, so a save only marks the lesson saved if nothing changed while it was on its way.
  const edits = useRef(0);
  const update = (fn: (l: Lesson) => void) => {
    setLesson((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    edits.current++;
    setDirty(true);
  };
  const checks = useMemo(() => runChecks(lesson), [lesson]);
  // Review comments, for the Comments tab and the counts on each card.
  const reviewApi = useApi<EditorReview>(isNew ? null : `/api/admin/lessons/${encodeURIComponent(initial.slug)}/review`);
  const commentCounts = useMemo(() => openCounts(reviewApi.data?.comments ?? []), [reviewApi.data]);
  const openComments = Object.values(commentCounts).reduce((a, b) => a + b, 0);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  // The comments panel beside the cards: open by itself when there's something to read, until shown or hidden by hand.
  const [commentsShown, setCommentsShown] = useState<boolean | null>(null);
  const commentsPanel = !isNew && (commentsShown ?? openComments > 0);
  const showCard = (id: string) => {
    setSelected(id);
    requestAnimationFrame(() => document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }));
  };

  /** Save draft: learners keep seeing the published version. A new lesson gets its address on first save. */
  /** `force` saves over a newer version saved elsewhere, once the author has chosen to keep theirs. */
  async function save(auto = false, force = false) {
    setBusy("save");
    setSaveError(null);
    if (!auto) setNotice(null);
    const at = edits.current;
    try {
      if (isNew) {
        const r = await api<{ slug: string }>("/api/admin/lessons", { body: { lesson } });
        setDirty(false);
        router.replace(`/admin/lessons/${r.slug}/edit`);
        return true;
      }
      const r = await api<{ status: LessonStatus }>(`/api/admin/lessons/${initial.slug}/content`, {
        method: "PUT",
        body: { lesson, base: force ? undefined : (status?.updatedAt ?? null) },
      });
      setStatus(r.status);
      setConflict(null);
      // Edits made while saving stay unsaved; auto-save picks them up next.
      if (edits.current === at) setDirty(false);
      return true;
    } catch (e) {
      if ((e as { status?: number }).status === 409) setConflict((e as Error).message);
      else setSaveError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  /** Throw away this tab's copy and open the version saved elsewhere. */
  async function loadLatest() {
    if (
      dirty &&
      !(await confirmAction("Changes you made in this tab since then will be lost.", { title: "Load the latest version?", confirmLabel: "Load latest" }))
    )
      return;
    leaving.current = true;
    window.location.reload();
  }

  async function keepMine() {
    const ok = await confirmAction("What’s in this tab replaces the version saved elsewhere. Anything changed there is lost.", {
      title: "Keep your version?",
      confirmLabel: "Keep mine",
      danger: true,
    });
    if (ok) await save(false, true);
  }

  // Coming back to this tab: if the lesson was saved elsewhere meanwhile, say so before any edits are made here.
  const statusRef = useRef(status);
  const busyRef = useRef(busy);
  useEffect(() => {
    statusRef.current = status;
    busyRef.current = busy;
  });
  useEffect(() => {
    if (isNew) return;
    const check = async () => {
      if (document.visibilityState !== "visible" || busyRef.current) return;
      try {
        const r = await api<{ status: LessonStatus }>(`/api/admin/lessons/${initial.slug}/content`);
        if (!busyRef.current && r.status.updatedAt !== (statusRef.current?.updatedAt ?? null))
          setConflict(
            "This topic was saved somewhere else after you opened it here, for example in another tab. Load the latest version before you make changes, so you don’t overwrite it.",
          );
      } catch {
        // Offline or signed out: the save itself will say so.
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [isNew, initial.slug]);

  async function publish() {
    if (dirty && !(await save())) return;
    setBusy("publish");
    setSaveError(null);
    try {
      const r = await api<{ version: string; status: LessonStatus }>(`/api/admin/lessons/${initial.slug}/content`, {
        body: { action: "publish", notes: changeNote, kind: important ? "important" : "minor" },
      });
      setLesson((l) => ({ ...l, version: r.version }));
      setStatus(r.status);
      setNotice(
        important
          ? `Published version ${r.version} as an important change. People who did an earlier version see what’s changed next time they open it.`
          : `Published version ${r.version}. Learners see it from their next visit; anyone who already finished keeps their completion.`,
      );
      setChangeNote("");
      setImportant(false);
      setHistoryKey((k) => k + 1);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    const never = status?.state === "unpublished";
    const ok = await confirmAction(
      never
        ? "It has never been published, so learners haven’t seen it."
        : "Your saved changes are thrown away and the topic goes back to the published version.",
      never
        ? { title: "Delete this topic?", confirmLabel: "Delete", danger: true }
        : { title: "Discard your changes?", confirmLabel: "Discard changes", danger: true },
    );
    if (!ok) return;
    setBusy("discard");
    setSaveError(null);
    try {
      await api(`/api/admin/lessons/${initial.slug}/content`, { body: { action: "discard" } });
      setDirty(false);
      if (never) router.push("/admin/lessons");
      else window.location.reload();
    } catch (e) {
      setSaveError((e as Error).message);
      setBusy(null);
    }
  }

  // Cmd/Ctrl+S saves, and leaving with unsaved changes asks first.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Auto-save: a moment after the last edit, the draft saves itself (a new lesson saves once, by hand, to get its address).
  // After a failed save it waits for the next edit rather than retrying in a loop.
  const failedAt = useRef(-1);
  useEffect(() => {
    // Not while another save is newer: the author decides first (see the warning above the cards).
    if (isNew || !dirty || busy || conflict || failedAt.current === edits.current) return;
    const t = window.setTimeout(async () => {
      const at = edits.current;
      if (!(await saveRef.current(true))) failedAt.current = at;
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [lesson, dirty, busy, isNew, conflict]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => !leaving.current && e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  // New lessons open with the Claude generator; a draft replaces the blank cards.
  const [showDraft, setShowDraft] = useState(isNew);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  function applyDraft(draft: Lesson, source: string | null) {
    setLesson(structuredClone(draft));
    setSelected(draft.start);
    setDirty(true);
    setRound((r) => r + 1);
    setShowDraft(false);
    setStep("cards");
    setDraftNote(
      `Claude drafted ${Object.keys(draft.nodes).length} cards${source ? ` from ${source}` : " from your brief"}. Check every card: facts, tone and the right answers.`,
    );
  }

  return (
    <AdminShell title={isNew ? "New topic" : "Edit topic"} back={{ href: "/admin/lessons", label: "Topics" }}>
      <div className="flex flex-wrap items-center gap-3">
        <Editable
          value={lesson.title}
          onChange={(t) => update((d) => void (d.title = t))}
          placeholder="Topic title"
          className="min-w-48 flex-1 px-1 font-serif text-2xl font-semibold sm:text-3xl"
        />
        {isNew || status?.state === "unpublished" ? (
          <Badge tone="warn">Draft, not published</Badge>
        ) : (
          <Badge tone={status?.state === "changes" ? "info" : "good"}>
            {status?.state === "changes" ? `Version ${status.version} live · changes not published` : `Version ${status?.version ?? lesson.version} live`}
          </Badge>
        )}
        {!isNew && (
          <button
            type="button"
            className={btn.secondary}
            onClick={() => setPreviewing(true)}
            title={dirty ? "Your latest changes are saving; preview shows them in a moment." : undefined}
          >
            <Icon name="play" className="size-4" /> Preview
          </button>
        )}
        {!isNew && status?.state !== "unpublished" && <QrShare kind="lesson" id={initial.slug} />}
        <button type="button" className={btn.secondary} onClick={() => save()} disabled={busy !== null || (!dirty && !isNew)}>
          {busy === "save" ? "Saving…" : dirty || isNew ? "Save draft" : "Saved"}
        </button>
        {!isNew && (
          <button type="button" className={btn.primary} onClick={publish} disabled={busy !== null || (!dirty && status?.state === "live")}>
            <Icon name="check" className="size-4" /> {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted" role="status">
        <span>
          <Icon name="info" className="mr-1 inline size-4 align-[-3px]" />
          {isNew
            ? "Save once to keep this topic as a draft; after that, changes save automatically. Learners won’t see it until you publish."
            : busy === "save"
              ? "Saving…"
              : dirty
                ? conflict
                  ? "Not saved. Choose which version to keep."
                  : saveError
                    ? "Not saved yet. Press Save draft to try again."
                    : "Saving your changes…"
                : status?.state === "unpublished"
                  ? `All changes saved${status.updatedAt ? ` at ${savedTime(status.updatedAt)}` : ""}. Learners won’t see it until you publish.`
                  : status?.state === "changes"
                    ? `All changes saved${status.updatedAt ? ` at ${savedTime(status.updatedAt)}` : ""}. Learners still see version ${status.version} until you publish.`
                    : "Everything is published."}
        </span>
        {!isNew && !dirty && status && status.state !== "live" && (
          <button
            type="button"
            className="font-semibold text-accent underline-offset-4 hover:underline disabled:opacity-60"
            onClick={discard}
            disabled={busy !== null}
          >
            {status.state === "unpublished" ? "Delete draft" : "Discard changes"}
          </button>
        )}
      </p>
      {conflict && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-gold bg-gold/15 px-4 py-3 text-sm">
          <Icon name="alert" className="size-5 shrink-0 text-ink" />
          <p className="min-w-0 flex-1">
            <strong>Saved somewhere else.</strong> {conflict}
            {dirty && " Auto-save is paused in this tab."}
          </p>
          <span className="flex flex-wrap gap-2">
            <button type="button" className={btn.primary} onClick={loadLatest} disabled={busy !== null}>
              Load the latest version
            </button>
            {dirty && (
              <button type="button" className={btn.secondary} onClick={keepMine} disabled={busy !== null}>
                Keep my version
              </button>
            )}
          </span>
        </div>
      )}
      {notice && <p className="mt-2 rounded-2xl bg-tealtint px-4 py-2 text-sm font-medium">{notice}</p>}
      {saveError && (
        <div className="mt-2">
          <ErrorNote text={saveError} />
        </div>
      )}

      <nav aria-label="Topic editor" className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
        {STEPS.map((s) => {
          const active = s.id === step;
          const warn = s.id === "review" && checks.some((c) => !c.ok);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setStep(s.id);
                if (s.id === "comments") {
                  setCommentsFor(null);
                  reviewApi.reload();
                }
              }}
              aria-current={active ? "page" : undefined}
              className={cx(
                "-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 font-medium",
                active ? "border-action text-ink" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              <Icon name={s.icon} className="size-4" />
              {s.label}
              {warn && <span className="size-2 rounded-full bg-orange" aria-label="has items to fix" />}
              {s.id === "comments" && openComments > 0 && (
                <span className="rounded-full bg-gold px-1.5 text-xs font-bold text-[#102a43]" aria-label={`${openComments} open`}>
                  {openComments}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-6">
        {step === "cards" && showDraft && <DraftPanel lesson={lesson} onDraft={applyDraft} onClose={() => setShowDraft(false)} />}
        {step === "cards" && !showDraft && (isNew || draftNote) && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-tealtint px-4 py-3 text-sm">
            <Icon name="spark" className="size-4 text-accent" />
            <span className="min-w-0 flex-1">{draftNote ?? "Start from a brief or a document and Claude will draft the cards for you."}</span>
            <button type="button" className={btn.secondary} onClick={() => setShowDraft(true)}>
              {draftNote ? "Generate again" : "Generate with Claude"}
            </button>
          </div>
        )}
        {step === "cards" && !showDraft && (
          <Cards
            key={round}
            lesson={lesson}
            update={update}
            selected={selected}
            setSelected={setSelected}
            isNew={isNew}
            commentCounts={commentCounts}
            onComments={(id) => {
              showCard(id);
              setCommentsShown(true);
            }}
            commentsToggle={
              !isNew && !commentsPanel ? (
                <button
                  type="button"
                  onClick={() => setCommentsShown(true)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-sm font-semibold shadow-sm ring-1 ring-line hover:bg-strong"
                >
                  <Icon name="chat" className="size-4 text-accent" /> Comments
                  {openComments > 0 && <span className="rounded-full bg-gold px-1.5 text-xs font-bold text-[#102a43]">{openComments}</span>}
                </button>
              ) : null
            }
            commentsPanel={
              commentsPanel ? (
                <CardComments
                  slug={initial.slug}
                  lesson={lesson}
                  data={reviewApi.data}
                  setData={reviewApi.setData}
                  card={selected}
                  onCard={showCard}
                  onClose={() => setCommentsShown(false)}
                  onAll={() => {
                    setCommentsFor(null);
                    setStep("comments");
                  }}
                />
              ) : null
            }
          />
        )}
        {step === "brief" && <Brief lesson={lesson} update={update} isNew={isNew} />}
        {step === "media" && <Media lesson={lesson} update={update} isNew={isNew} />}
        {step === "spaced" && <Spaced lesson={lesson} isNew={isNew} />}
        {step === "comments" && !isNew && (
          <ReviewComments
            slug={initial.slug}
            lesson={lesson}
            data={reviewApi.data}
            setData={reviewApi.setData}
            focusCard={commentsFor}
            setFocusCard={setCommentsFor}
            onShowCard={(id) => {
              setStep("cards");
              setCommentsShown(true);
              showCard(id);
            }}
          />
        )}
        {step === "comments" && isNew && <p className="text-ink-muted">Save the topic first, then share it for review.</p>}
        {previewing && <PreviewDialog slug={initial.slug} cardId={selected} dirty={dirty} onClose={() => setPreviewing(false)} />}
        {step === "review" && (
          <Review
            lesson={lesson}
            checks={checks}
            slug={initial.slug}
            isNew={isNew}
            changeNote={changeNote}
            setChangeNote={setChangeNote}
            important={important}
            setImportant={setImportant}
            onPublish={publish}
            publishing={busy === "publish"}
            canPublish={!isNew && (dirty || status?.state !== "live")}
            historyKey={historyKey}
          />
        )}
      </div>
    </AdminShell>
  );
}

type Update = (fn: (l: Lesson) => void) => void;

function Panel({ title, children, aside, className }: { title: string; children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-3xl border border-line bg-surface p-5", className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ClaudeButton({ children }: { children: React.ReactNode }) {
  return (
    <button type="button" className={btn.secondary} disabled title="Demo: not connected yet">
      <Icon name="spark" className="size-4" /> {children}
    </button>
  );
}

/* 1. Brief */

/* Sample cards for the theme previews: a content card, a question and the recap. */
const THEME_SAMPLES: { type: Card["type"]; label: string; lines: number }[] = [
  { type: "image", label: "Story", lines: 3 },
  { type: "quiz", label: "Check", lines: 2 },
  { type: "decision", label: "Role play", lines: 2 },
  { type: "summary", label: "Recap", lines: 3 },
];

/** Lesson theme: how cards look when they don't have their own colour or photo. */
function ThemePicker({ value, onChange }: { value: ThemeId; onChange: (t: ThemeId) => void }) {
  return (
    <fieldset className="sm:col-span-2">
      <legend className="font-semibold">Card theme</legend>
      <p className="text-sm text-ink-muted">How cards look unless you give one its own colour or photo.</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {themeIds.map((id) => {
          const t = THEMES[id];
          const on = value === id;
          return (
            <label
              key={id}
              className={cx(
                "flex cursor-pointer flex-col gap-2 rounded-2xl border-2 p-3 transition-colors",
                on ? "border-action bg-tealtint/50" : "border-line hover:border-line-strong",
              )}
            >
              <input type="radio" name="lesson-theme" className="sr-only" checked={on} onChange={() => onChange(id)} />
              <span className="flex gap-1.5" aria-hidden>
                {THEME_SAMPLES.map((sample) => {
                  const sf = t.surface({ type: sample.type } as Card);
                  const tc = sf ? toneClasses(sf.text) : null;
                  return (
                    <span
                      key={sample.type}
                      className={cx("flex h-20 flex-1 flex-col gap-1 rounded-lg p-1.5 ring-1 ring-line", sf ? tc!.text : "bg-surface")}
                      style={sf ? { backgroundImage: sf.css } : undefined}
                    >
                      <span className={cx("font-mulish text-[0.5rem] font-extrabold uppercase tracking-wider", sf?.accent ?? (tc ? tc.soft : "text-accent"))}>
                        {sample.label}
                      </span>
                      {Array.from({ length: sample.lines }, (_, i) => (
                        <span key={i} className={cx("h-1 rounded-full bg-current opacity-40", i === sample.lines - 1 ? "w-2/3" : "w-full")} />
                      ))}
                    </span>
                  );
                })}
              </span>
              <span className="flex items-center gap-1.5 font-semibold">
                {on && <Icon name="check" className="size-4 text-accent" />}
                {t.label}
              </span>
              <span className="text-xs text-ink-muted">{t.description}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Brief({ lesson: l, update, isNew }: { lesson: Lesson; update: Update; isNew: boolean }) {
  const [sources, setSources] = useState<string[]>(isNew ? [] : ["Aged Care Act 2024 — Statement of Rights", "Trilogy Care service partner agreement"]);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <Panel title="What is this topic for?">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2">
            <input className={input} value={l.title} onChange={(e) => update((d) => void (d.title = e.target.value))} />
          </Field>
          <Field label="Learning outcome" hint="One thing the learner will do differently afterwards." className="sm:col-span-2">
            <textarea
              rows={2}
              className={textarea}
              value={l.outcome}
              onChange={(e) => update((d) => void (d.outcome = e.target.value))}
              placeholder="Check the confirmation process before agreeing to extend a visit."
            />
          </Field>
          <Field label="Tile summary" hint="Shown under the title on the Learning page." className="sm:col-span-2">
            <textarea rows={2} className={textarea} value={l.summary} onChange={(e) => update((d) => void (d.summary = e.target.value))} />
          </Field>
          {!isNew && <SubjectField slug={l.slug} />}
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-semibold">Audience</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {TRACKS.map((t) => (
                <label
                  key={t.id}
                  className={cx(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4",
                    l.track === t.id ? "border-action bg-tealtint" : "border-line-strong",
                  )}
                >
                  <input
                    type="radio"
                    name="track"
                    className="accent-[var(--action)]"
                    checked={l.track === t.id}
                    onChange={() => update((d) => void (d.track = t.id))}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Owner">
            <input className={input} value={l.owner} onChange={(e) => update((d) => void (d.owner = e.target.value))} />
          </Field>
          <Field label="Review by" hint="Content is flagged for review on this date.">
            <input type="date" className={input} value={l.reviewDate} onChange={(e) => update((d) => void (d.reviewDate = e.target.value))} />
          </Field>
          <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
            <input
              type="checkbox"
              className="size-5 accent-[var(--action)]"
              checked={Boolean(l.assignment?.required)}
              onChange={(e) => update((d) => void (d.assignment = e.target.checked ? { required: true, due: d.assignment?.due } : undefined))}
            />
            <span>
              <span className="font-semibold">Required</span> <span className="text-ink-muted">— appears under “Assigned to you” with a due date</span>
            </span>
          </label>
          <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
            <input
              type="checkbox"
              className="size-5 accent-[var(--action)]"
              checked={l.holdForAudio !== false}
              onChange={(e) => update((d) => void (d.holdForAudio = e.target.checked ? undefined : false))}
            />
            <span>
              <span className="font-semibold">Hold until the audio finishes</span>{" "}
              <span className="text-ink-muted">— learners can’t continue or swipe on until each card’s audio has played to the end</span>
            </span>
          </label>
          <ThemePicker value={l.theme ?? "classic"} onChange={(t) => update((d) => void (d.theme = t === "classic" ? undefined : t))} />
        </div>
      </Panel>

      <div className="flex flex-col gap-5">
        <Panel title="Source material">
          <p className="text-sm text-ink-muted">
            Topics are written only from approved sources. Claude uses these, and nothing else, when drafting cards and follow ups.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {sources.map((s, i) => (
              <li key={i} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
                <Icon name="file" className="size-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">{s}</span>
                <button type="button" className={btn.quiet} aria-label={`Remove ${s}`} onClick={() => setSources(sources.filter((_, j) => j !== i))}>
                  <Icon name="close" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btn.secondary} onClick={() => setSources([...sources, `Policy document ${sources.length + 1}.pdf`])}>
              <Icon name="upload" className="size-4" /> Add document
            </button>
            <button type="button" className={btn.quiet} onClick={() => setSources([...sources, "Pasted text"])}>
              Paste text
            </button>
          </div>
        </Panel>
        <Panel title="Draft with Claude">
          <p className="text-sm text-ink-muted">
            Claude reads the sources and the outcome, then proposes a storyboard: an introduction, a realistic scenario with a decision, a quick check and a
            summary. You edit every card before anything is published.
          </p>
          <div className="mt-3">
            <ClaudeButton>Draft the cards</ClaudeButton>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* 2. Cards */

/*
  2. Cards: a canvas of phone-sized cards, edited in place the way learners see them (like 7taps).
  Text is typed straight onto the card. Pictures and animations open a picker from the top of the card.
  Anything more advanced (feedback, branching, scripts, widget code) lives in the card settings drawer.
*/

const PALETTE: { type: Card["type"]; label: string; icon: IconName; hint: string }[] = [
  {
    type: "written",
    label: "Answer",
    icon: "pen",
    hint: "Learners write an answer in their own words, and AI checks it against criteria you set. Good for practising what to say.",
  },
  { type: "listen", label: "Audio", icon: "volume", hint: "A card just for listening, with its own play button and a transcript to read along." },
  {
    type: "widget",
    label: "Widget",
    icon: "widget",
    hint: "Describe what you want, such as an animated diagram, a calculator or a sorting game, and Claude builds it. Try it on the card and ask for changes.",
  },
  {
    type: "checklist",
    label: "Checklist",
    icon: "checklist",
    hint: "A list learners tick off. Add a note under any item, and choose whether every item must be ticked to continue.",
  },
  { type: "poll", label: "Poll", icon: "list", hint: "A question with no right answer. After voting, learners see how everyone else answered." },
  { type: "quiz", label: "Quiz", icon: "check", hint: "Questions with one right answer and feedback for each choice. Use it to check understanding." },
  { type: "rating", label: "Rating", icon: "star", hint: "A 1 to 5 star confidence check. Learners see the group’s average after they rate." },
  { type: "response", label: "Reflect", icon: "chat", hint: "Learners write a short response, then see an example answer and can ask AI for feedback." },
  {
    type: "resources",
    label: "Resources",
    icon: "folder",
    hint: "A tidy drawer of PDFs, websites and toolkits for further reading. Never holds up the topic.",
  },
  {
    type: "decision",
    label: "Role Play",
    icon: "route",
    hint: "A scenario with choices. Each choice can lead to its own consequence, so learners see what happens.",
  },
  { type: "summary", label: "Summary", icon: "spark", hint: "The closing card: key points to remember, one action to take to work, and official sources." },
  {
    type: "image",
    label: "Text",
    icon: "doc",
    hint: "A heading and short text, with an optional picture, animation or video bubbles. The everyday teaching card.",
  },
  { type: "presenter", label: "Video", icon: "play", hint: "A video from YouTube or Synthesia, or an upload. Vertical videos fill the whole card." },
  { type: "wall", label: "Wall", icon: "people", hint: "An insight wall: learners share an idea, then see what others posted once they’ve posted their own." },
];

/** Card types learners interact with, shown in teal; text and media cards are navy and the summary gold. */
const INTERACTIVE: Card["type"][] = ["quiz", "decision", "poll", "rating", "wall", "calculator", "widget", "response", "written", "hotspot", "checklist"];

/** A tab on the card's top edge naming its type, so it's clear what kind of card you're editing. */
function TypeTag({ card: c }: { card: Card }) {
  const p = PALETTE.find((x) => x.type === c.type) ?? { label: typeInfo(c.type).label, icon: typeInfo(c.type).icon };
  const tone = c.type === "summary" ? "bg-gold text-[#0a1a2e]" : INTERACTIVE.includes(c.type) ? "bg-action text-on-action" : "bg-[#102a43] text-white";
  return (
    <span
      className={cx(
        "pointer-events-none absolute -top-2.5 right-4 z-20 inline-flex h-6 items-center gap-1 rounded-full px-2.5 font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.08em] shadow-md ring-2 ring-muted",
        tone,
      )}
    >
      <Icon name={p.icon} className="size-3" />
      {p.label}
      {c.emphasis === "consequence" && <span className="font-semibold normal-case tracking-normal opacity-85">· consequence</span>}
      {c.requireComplete && (
        <span className="inline-flex items-center gap-0.5 font-semibold normal-case tracking-normal opacity-90">
          · <Icon name="lock" className="size-3" /> Required
        </span>
      )}
      {c.check?.by && checkDays(c.check.by) <= 30 && (
        <span className="inline-flex items-center gap-0.5 font-semibold normal-case tracking-normal opacity-90">
          · <Icon name="clock" className="size-3" /> {checkDays(c.check.by) < 0 ? "Check overdue" : "Check due"}
        </span>
      )}
      {!commentsOn(c) && (
        <span className="inline-flex items-center gap-0.5 font-semibold normal-case tracking-normal opacity-90">
          · <Icon name="chat" className="size-3" /> Comments off
        </span>
      )}
    </span>
  );
}

/** Days until a check date (negative once it's passed). */
function checkDays(date: string) {
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

function freshCard(type: Card["type"], id: string, beat: number): Card {
  const base = { id, beat, label: typeInfo(type).label, heading: "", body: "", visual: { kind: "none" } as Visual };
  switch (type) {
    case "quiz":
      return {
        ...base,
        type,
        heading: "Quick check",
        questions: [
          {
            id: "q1",
            prompt: "",
            options: [
              { id: "a", label: "" },
              { id: "b", label: "" },
            ],
            correct: "a",
            feedback: { correct: "", incorrect: "" },
          },
        ],
        next: "",
      };
    case "decision":
      return {
        ...base,
        type,
        prompt: "What do you do?",
        options: [
          { id: "a", label: "", stay: true, feedback: "" },
          { id: "b", label: "", stay: true, feedback: "" },
        ],
      };
    case "summary":
      return { ...base, type, heading: "What to remember", action: "", points: [""], cta: "Finish" };
    case "poll":
      return {
        ...base,
        type,
        label: "Poll",
        prompt: "",
        options: [
          { id: "a", label: "" },
          { id: "b", label: "" },
        ],
        next: "",
      };
    case "rating":
      return {
        ...base,
        type,
        label: "Confidence check",
        heading: "How confident are you?",
        prompt: "",
        lowLabel: "Not yet",
        highLabel: "Very confident",
        next: "",
      };
    case "wall":
      return { ...base, type, label: "Insight wall", heading: "Share your idea", prompt: "", placeholder: "", next: "" };
    case "response":
      return { ...base, type, prompt: "", modelResponse: "", visibility: "Only you can see this.", next: "" };
    case "checklist":
      return {
        ...base,
        type,
        label: "Checklist",
        heading: "Before you go",
        prompt: "",
        items: [
          { id: "i1", text: "" },
          { id: "i2", text: "" },
          { id: "i3", text: "" },
        ],
        next: "",
      };
    case "resources":
      return {
        ...base,
        type,
        label: "Further reading",
        heading: "Want to go further?",
        body: "Optional resources if you’d like more detail.",
        items: [{ id: "r1", kind: "link", title: "", url: "" }],
        next: "",
      };
    case "hotspot":
      return {
        ...base,
        type,
        label: "Explore",
        heading: "Take a closer look",
        prompt: "Tap each marker to find out more.",
        image: null,
        mode: "explore",
        spots: [],
        next: "",
      };
    case "written":
      return {
        ...base,
        type,
        label: "Your turn",
        heading: "Put it in your own words",
        prompt: "",
        criteria: [
          { id: "c1", text: "" },
          { id: "c2", text: "" },
        ],
        minWords: 10,
        next: "",
      };
    case "presenter":
      return {
        ...base,
        type,
        visual: {
          kind: "presenter",
          name: "Presenter",
          synthetic: true,
          tone: "teal",
          alt: "Presenter video",
          video: { provider: "synthesia", id: "d17ebdc9-8f64-4630-ad37-24747e308796", title: "Presenter video", orientation: "portrait" },
        },
        transcript: "",
        durationSec: 30,
        next: "",
      };
    case "audio":
      return { ...base, type, visual: { kind: "illustration", variant: "wave", tone: "sky", icon: "chat", alt: "" }, script: "", next: "" };
    case "listen":
      return { ...base, type, label: "Listen", heading: "", body: "", script: "", next: "" };
    case "widget":
      return { ...base, type, heading: "Try it yourself", body: "", widget: { request: "", html: "", alt: "" }, next: "" };
    case "calculator":
      return {
        ...base,
        type,
        heading: "See how time changes the total",
        calc: {
          min: 30,
          max: 180,
          step: 15,
          initial: 60,
          rate: 80,
          formula: "total = minutes ÷ 60 × hourly rate",
          assumptions: "Illustrative rate only.",
          version: "1",
        },
        next: "",
      };
    default:
      return { ...base, type: "image", next: "" };
  }
}

function Cards({
  lesson: l,
  update,
  selected,
  setSelected,
  isNew,
  commentCounts,
  onComments,
  commentsToggle,
  commentsPanel,
}: {
  lesson: Lesson;
  update: Update;
  selected: string;
  setSelected: (id: string) => void;
  isNew: boolean;
  /** Open review comments per card. */
  commentCounts: Record<string, number>;
  onComments: (id: string) => void;
  /** Shows the comments panel when it's hidden. */
  commentsToggle?: React.ReactNode;
  /** The selected card's comments, beside the cards. */
  commentsPanel?: React.ReactNode;
}) {
  const cards = ordered(l);
  const card = l.nodes[selected] ?? cards[0];
  const [inspecting, setInspecting] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const focus = (id: string) =>
    requestAnimationFrame(() => document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }));

  const newId = (type: string) => {
    let n = Object.keys(l.nodes).length + 1;
    while (l.nodes[`${type}-${n}`]) n++;
    return `${type}-${n}`;
  };

  function add(type: Card["type"]) {
    const id = newId(type);
    update((d) => insertAfterCard(d, freshCard(type, id, card?.beat ?? 0), card?.id));
    setSelected(id);
    focus(id);
  }

  function duplicate() {
    const id = newId(card.type);
    update((d) => insertAfterCard(d, { ...structuredClone(d.nodes[card.id]), id }, card.id));
    setSelected(id);
    focus(id);
  }

  async function remove() {
    if (cards.length <= 1) return;
    if (
      !(await confirmAction("The card is removed from this topic. Save or publish to keep the change.", {
        title: `Delete “${card.heading || typeInfo(card.type).label}”?`,
        confirmLabel: "Delete card",
        danger: true,
      }))
    )
      return;
    const i = cards.findIndex((c) => c.id === card.id);
    const neighbour = cards[i + 1] ?? cards[i - 1];
    update((d) => {
      const gone = d.nodes[card.id];
      const onward = isLinear(gone) ? gone.next || undefined : undefined;
      if (d.start === card.id) d.start = onward ?? neighbour.id;
      for (const n of Object.values(d.nodes)) {
        if (isLinear(n) && n.next === card.id) n.next = onward ?? "";
        if (n.type === "decision")
          for (const o of n.options)
            if (o.next === card.id) {
              o.next = onward;
              if (!onward) o.stay = true;
            }
      }
      delete d.nodes[card.id];
    });
    setSelected(neighbour.id);
  }

  const [dropNote, setDropNote] = useState<string | null>(null);
  /** An image dropped onto a card is uploaded and becomes that card's picture. */
  async function dropImage(id: string, file: File) {
    setDropNote("Uploading…");
    try {
      const photo = await uploadImage(file);
      update((d) => {
        const v = d.nodes[id].visual;
        if (v.kind === "illustration") v.photo = photo;
        else d.nodes[id].visual = { kind: "illustration", variant: "petals", tone: "teal", icon: "spark", alt: "", photo };
      });
      setDropNote("Image added. Add alt text from the picture pill.");
    } catch (e) {
      setDropNote((e as Error).message);
    }
  }

  /** Adds a card at the end of the lesson, just before the summary. */
  function addAtEnd() {
    const id = newId("image");
    const line = mainLine(l);
    const last = line.filter((x) => l.nodes[x].type !== "summary").at(-1);
    update((d) => insertAfterCard(d, freshCard("image", id, last ? d.nodes[last].beat : 0), last));
    setSelected(id);
    focus(id);
  }

  function move(dir: -1 | 1) {
    update((d) => void moveBlock(d, card.id, dir));
    focus(card.id);
  }

  /*
    Card type descriptions on hover or keyboard focus: to the left of the menu when it's a column at
    the side of the page, otherwise below the button.
  */
  const [tip, setTip] = useState<{ type: Card["type"]; side: "left" | "below"; x: number; y: number } | null>(null);
  function showTip(type: Card["type"], el: HTMLElement) {
    const r = el.getBoundingClientRect();
    if (r.left > 300) setTip({ type, side: "left", x: window.innerWidth - r.left + 10, y: r.top + r.height / 2 });
    else setTip({ type, side: "below", x: Math.max(8, Math.min(r.left, window.innerWidth - 264)), y: r.bottom + 8 });
  }

  // Try each move on a copy to know whether the buttons work, and why not.
  const why = (dir: -1 | 1) => (card ? moveBlock(structuredClone(l), card.id, dir) : "No card selected.");
  const leftWhy = why(-1);
  const rightWhy = why(1);

  /*
    Drag to reorder: pick a card up by its grip, and a "Move here" bar marks the nearest gap it can
    go to (the same moves the arrows allow). Let go to drop it there; Escape cancels.
  */
  const strip = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    slots: { before: string | null; to: number }[];
    slot: number | null;
    /** Where the bar sits, in the strip's scrolled coordinates. */
    barX: number;
  } | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  // A press on a card that may turn into a drag once the pointer moves a few pixels.
  const pressed = useRef<{ id: string; x: number; y: number; pointer: number } | null>(null);

  /** Starts carrying a card (from its label's grip, or by dragging the card itself). */
  function pickUp(id: string, e: React.PointerEvent<HTMLElement>) {
    const slots = dropTargets(l, id);
    if (!slots.length) return false;
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(id);
    setDrag({ id, x: e.clientX, y: e.clientY, slots, slot: null, barX: 0 });
    return true;
  }

  /** The x position of each gap, in the strip's scrolled coordinates. */
  function slotX(slot: { before: string | null }) {
    const ol = strip.current!;
    const box = ol.getBoundingClientRect();
    const at = (el: Element | null | undefined, side: "left" | "right") =>
      el ? (side === "left" ? el.getBoundingClientRect().left - 10 : el.getBoundingClientRect().right + 10) - box.left + ol.scrollLeft : 0;
    if (slot.before) return at(document.getElementById(`card-${slot.before}`), "left");
    // The end: after the last card (before "Add a card").
    const items = [...ol.querySelectorAll(":scope > li[id^='card-']")];
    return at(items.at(-1), "right");
  }

  function dragTo(clientX: number, clientY: number) {
    setDrag((d) => {
      if (!d || !strip.current) return d;
      const ol = strip.current;
      const box = ol.getBoundingClientRect();
      // Near the strip's edges, scroll it so far-away gaps can be reached.
      if (clientX < box.left + 60) ol.scrollLeft -= 18;
      else if (clientX > box.right - 60) ol.scrollLeft += 18;
      const x = clientX - box.left + ol.scrollLeft;
      let best: number | null = null;
      let bestX = 0;
      d.slots.forEach((s, i) => {
        const sx = slotX(s);
        if (best === null || Math.abs(sx - x) < Math.abs(bestX - x)) {
          best = i;
          bestX = sx;
        }
      });
      // Only offer a gap when the pointer is reasonably close to it.
      const near = best !== null && Math.abs(bestX - x) < 220;
      return { ...d, x: clientX, y: clientY, slot: near ? best : null, barX: bestX };
    });
  }

  function drop() {
    const d = drag;
    setDrag(null);
    if (!d || d.slot === null) return;
    const target = d.slots[d.slot];
    update((draft) => void moveToPosition(draft, d.id, target.to));
    setSelected(d.id);
    setLanded(d.id);
    window.setTimeout(() => setLanded((x) => (x === d.id ? null : x)), 900);
    focus(d.id);
  }

  useEffect(() => {
    if (!drag) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [drag]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1 rounded-3xl bg-muted p-4 sm:p-6">
        <ol ref={strip} className={cx("relative flex gap-5 overflow-x-auto pb-3 pt-1", drag ? "cursor-grabbing select-none" : "snap-x")} aria-label="Cards">
          {drag && drag.slot !== null && (
            // Where the card will land.
            <li aria-hidden className="pointer-events-none absolute bottom-16 top-7 z-30 w-0" style={{ left: drag.barX }}>
              <span className="absolute inset-y-0 -left-[3px] w-1.5 animate-pulse rounded-full bg-action shadow-[0_0_0_4px_rgb(0_130_138/0.2)]" />
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-action px-2.5 py-0.5 text-xs font-bold text-on-action shadow">
                Move here
              </span>
            </li>
          )}
          {cards.map((c, i) => {
            const on = c.id === card?.id;
            const canDrag = !drag && movable(l, c.id) && cards.length > 1;
            return (
              <li
                key={c.id}
                id={`card-${c.id}`}
                className={cx(
                  "flex w-[17rem] shrink-0 snap-center flex-col items-center gap-3 transition-opacity",
                  drag?.id === c.id && "opacity-35",
                  landed === c.id && "animate-card-in",
                )}
              >
                <p className="flex max-w-[17rem] font-mulish text-xs font-bold text-ink-muted">
                  <button
                    type="button"
                    aria-label={`Drag “${c.heading || typeInfo(c.type).label}” to a new place`}
                    title={
                      canDrag || drag
                        ? "Drag to move this card"
                        : c.type === "summary"
                          ? "The summary stays at the end"
                          : "Cards inside a branch move with their decision"
                    }
                    disabled={!canDrag && drag?.id !== c.id}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      pickUp(c.id, e);
                    }}
                    onPointerMove={(e) => drag?.id === c.id && dragTo(e.clientX, e.clientY)}
                    onPointerUp={() => drag?.id === c.id && drop()}
                    onPointerCancel={() => setDrag(null)}
                    className="group flex min-h-7 min-w-0 cursor-grab touch-none items-center gap-1 rounded-lg pl-0.5 pr-2 hover:bg-surface hover:text-ink active:cursor-grabbing disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-ink-muted"
                  >
                    <Icon name="grip" className="size-4 shrink-0 group-disabled:opacity-25" />
                    <span className="truncate">
                      {i + 1} · {l.beats[c.beat] ?? "Step"}
                      {c.emphasis === "consequence" && " · after a choice"}
                    </span>
                  </button>
                  {commentCounts[c.id] > 0 && (
                    <button
                      type="button"
                      onClick={() => onComments(c.id)}
                      className="ml-1 inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full bg-gold px-2 text-[#102a43] hover:brightness-95"
                      aria-label={`${commentCounts[c.id]} open review ${commentCounts[c.id] === 1 ? "comment" : "comments"} on this card`}
                    >
                      <Icon name="chat" className="size-3.5" />
                      {commentCounts[c.id]}
                    </button>
                  )}
                </p>
                <div
                  className="relative"
                  // Drag the card itself: press anywhere that isn't text being edited or a control, and move.
                  onPointerDown={(e) => {
                    if (e.button !== 0 || drag || !movable(l, c.id)) return;
                    if ((e.target as HTMLElement).closest("[contenteditable], input, textarea, select, button, a, label")) return;
                    pressed.current = { id: c.id, x: e.clientX, y: e.clientY, pointer: e.pointerId };
                  }}
                  onPointerMove={(e) => {
                    const p = pressed.current;
                    if (drag?.id === c.id) return dragTo(e.clientX, e.clientY);
                    if (!p || p.id !== c.id || p.pointer !== e.pointerId) return;
                    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8) return;
                    pressed.current = null;
                    if (pickUp(c.id, e)) dragTo(e.clientX, e.clientY);
                  }}
                  onPointerUp={() => {
                    pressed.current = null;
                    if (drag?.id === c.id) drop();
                  }}
                  onPointerCancel={() => {
                    pressed.current = null;
                    if (drag?.id === c.id) setDrag(null);
                  }}
                  // The browser's own image dragging would take over the pointer and cancel the move.
                  onDragStart={(e) => (e.target as HTMLElement).tagName === "IMG" && e.preventDefault()}
                >
                  <TypeTag card={c} />
                  <CanvasCard
                    lesson={l}
                    card={c}
                    selected={on}
                    onSelect={() => setSelected(c.id)}
                    update={update}
                    onPick={() => setPicking(c.id)}
                    onSettings={() => (setSelected(c.id), setInspecting(true))}
                    onDropImage={(file) => dropImage(c.id, file)}
                  />
                </div>
                {/* Kept to the card's width (wrapping if needed) so it never pushes the cards apart. */}
                <div className={cx("flex w-full flex-wrap items-center justify-center gap-1.5", !on && "invisible")} role="toolbar" aria-label="Card actions">
                  <ToolButton icon="sliders" label="Card settings" onClick={() => setInspecting(true)} />
                  <ToolButton icon="arrow-left" label="Move earlier" onClick={() => move(-1)} disabled={on ? leftWhy : "Select the card"} />
                  <ToolButton icon="arrow-right" label="Move later" onClick={() => move(1)} disabled={on ? rightWhy : "Select the card"} />
                  <ToolButton
                    icon="lock"
                    label={card?.requireComplete ? "Required completion is on: turn off" : "Make this card required"}
                    pressed={Boolean(card?.requireComplete)}
                    // Greyed out (with the reason on hover) where it would make no difference; always available to turn off.
                    disabled={on && !card?.requireComplete && card ? requiredWhyNot(card, l.holdForAudio) : null}
                    onClick={() => update((d) => void (d.nodes[card.id].requireComplete = !d.nodes[card.id].requireComplete))}
                  />
                  <ToolButton
                    icon="chat"
                    label={card && commentsOn(card) ? "Comments are on: turn off" : "Turn on comments for this card"}
                    pressed={Boolean(card && commentsOn(card))}
                    onClick={() =>
                      update((d) => {
                        if (commentsOn(d.nodes[card.id])) d.nodes[card.id].comments = false;
                        else delete d.nodes[card.id].comments;
                      })
                    }
                  />
                  {c.type === "image" && (
                    <TextPositionToggle
                      value={c.textPosition ?? (c.visual.kind === "illustration" && c.visual.layout === "background" && c.visual.photo ? "bottom" : "top")}
                      onChange={(p) => update((d) => void (d.nodes[c.id].textPosition = p))}
                      className="bg-surface text-ink shadow-sm ring-1 ring-line"
                    />
                  )}
                  <ToolButton icon="copy" label="Duplicate" onClick={duplicate} />
                  <ToolButton icon="trash" label="Delete" onClick={remove} disabled={cards.length <= 1 ? "A topic needs at least one card." : null} />
                </div>
              </li>
            );
          })}
          <li className="flex shrink-0 snap-center flex-col pt-7">
            <button
              type="button"
              onClick={addAtEnd}
              className="flex h-[32rem] w-[17rem] flex-col items-center justify-center gap-2 rounded-[1.75rem] border-2 border-dashed border-line-strong text-ink-muted hover:border-action hover:text-ink"
            >
              <Icon name="plus" className="size-7" />
              <span className="font-semibold">Add a card</span>
              <span className="text-sm">at the end, before the summary</span>
            </button>
          </li>
        </ol>
        {drag && (
          // The card being carried, following the pointer.
          <div
            aria-hidden
            className="pointer-events-none fixed z-50 w-44 -translate-x-1/2 -translate-y-6 rotate-3 rounded-2xl bg-surface p-3 shadow-2xl ring-2 ring-action"
            style={{ left: drag.x, top: drag.y }}
          >
            <p className="flex items-center gap-1 font-mulish text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-accent">
              <Icon name={typeInfo(l.nodes[drag.id].type).icon} className="size-3" /> {typeInfo(l.nodes[drag.id].type).label}
            </p>
            <p className="mt-1 line-clamp-2 font-serif text-sm font-semibold">{l.nodes[drag.id].heading || "Untitled card"}</p>
            <p className="mt-1 text-[0.7rem] text-ink-muted">{drag.slot === null ? "Drag to a gap between cards" : "Let go to drop it here"}</p>
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-ink-muted" role="status">
            {dropNote ?? "Click any text on a card to change it. Use the pill on a card to change its picture or animation, or drop an image file onto a card."}
          </p>
          {commentsToggle}
        </div>
      </div>

      {commentsPanel && <div className="lg:sticky lg:top-24 lg:w-80 lg:shrink-0 lg:self-start">{commentsPanel}</div>}

      <aside aria-label="Add a card" className="order-first lg:order-none">
        <div className="flex gap-1.5 overflow-x-auto rounded-3xl bg-surface p-2 shadow-sm ring-1 ring-line lg:sticky lg:top-24 lg:w-28 lg:flex-col">
          {PALETTE.map((p) => (
            <button
              key={p.type}
              type="button"
              onClick={() => add(p.type)}
              aria-describedby={tip?.type === p.type ? "card-type-tip" : undefined}
              onMouseEnter={(e) => showTip(p.type, e.currentTarget)}
              onFocus={(e) => showTip(p.type, e.currentTarget)}
              onMouseLeave={() => setTip(null)}
              onBlur={() => setTip(null)}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-2xl px-3 text-sm font-medium hover:bg-muted lg:w-full"
            >
              <Icon name={p.icon} className="size-4 shrink-0 text-ink-muted" /> {p.label}
            </button>
          ))}
        </div>
        {tip && (
          // Floats above the page, so the menu's scrolling doesn't cut it off.
          <div
            id="card-type-tip"
            role="tooltip"
            className="pointer-events-none fixed z-50 w-64 rounded-2xl bg-[#102a43] px-3.5 py-2.5 text-sm text-white shadow-xl"
            style={tip.side === "left" ? { top: tip.y, right: tip.x, transform: "translateY(-50%)" } : { top: tip.y, left: tip.x }}
          >
            <p className="font-semibold">{PALETTE.find((p) => p.type === tip.type)?.label}</p>
            <p className="mt-0.5 text-white/85">{PALETTE.find((p) => p.type === tip.type)?.hint}</p>
          </div>
        )}
      </aside>

      {inspecting && card && (
        <Drawer title="Card settings" onClose={() => setInspecting(false)}>
          <CardForm key={card.id} lesson={l} card={card} update={update} isNew={isNew} />
        </Drawer>
      )}
      {picking && l.nodes[picking] && <MediaDialog card={l.nodes[picking]} lesson={l.slug} update={update} onClose={() => setPicking(null)} />}
    </div>
  );
}

/** `disabled` is the reason the action isn't available, shown as its tooltip. */
function ToolButton({
  icon,
  label,
  onClick,
  disabled = null,
  pressed,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: string | null;
  /** For on/off settings such as Required completion. */
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(disabled)}
      aria-label={label}
      aria-pressed={pressed}
      title={disabled ? `${label}: ${disabled}` : label}
      className={cx(
        "inline-flex size-10 items-center justify-center rounded-full shadow-sm ring-1 disabled:opacity-35",
        pressed ? "bg-action text-on-action ring-action" : "bg-surface text-ink ring-line hover:bg-tealtint",
      )}
    >
      <Icon name={icon} className="size-4" />
    </button>
  );
}

/** Plain text edited in place. Enter finishes a single-line field. */
function Editable({
  value,
  onChange,
  placeholder,
  className,
  multiline = false,
  placeholderClass = "empty:before:text-ink-muted/60",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  multiline?: boolean;
  /** Placeholder colour; over photos it follows the text colour. */
  placeholderClass?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The first value is rendered (so it shows before the page is interactive); after that the browser owns the text.
  const [initial] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerText !== value) el.innerText = value;
  }, [value]);
  return (
    <div
      ref={ref}
      role="textbox"
      aria-label={placeholder}
      aria-multiline={multiline}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={(e) => onChange(e.currentTarget.innerText.replace(/\n$/, ""))}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={cx(
        "cursor-text rounded-md outline-none transition-shadow hover:bg-ink/5 focus:bg-transparent focus:ring-2 focus:ring-action/60 empty:before:content-[attr(data-placeholder)]",
        placeholderClass,
        className,
      )}
    >
      {initial}
    </div>
  );
}

/** Top, centre or bottom: where a content card's text sits. Three small buttons in the selected card's toolbar. */
function TextPositionToggle({
  value,
  onChange,
  className,
}: {
  value: "top" | "center" | "bottom";
  onChange: (p: "top" | "center" | "bottom") => void;
  className?: string;
}) {
  const options = [
    { id: "top", label: "Text at the top", y: 5 },
    { id: "center", label: "Text in the centre", y: 10 },
    { id: "bottom", label: "Text at the bottom", y: 15 },
  ] as const;
  return (
    <div role="group" aria-label="Text position" className={cx("inline-flex rounded-full p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          title={o.label}
          aria-label={o.label}
          onClick={() => onChange(o.id)}
          className={cx("grid size-8 place-items-center rounded-full", value === o.id ? "bg-action text-on-action" : "opacity-70 hover:opacity-100")}
        >
          {/* A box with the text lines at the top, middle or bottom. */}
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <rect x="2.5" y="2" width="15" height="16" rx="2.5" opacity="0.45" />
            <path d={`M6 ${o.y - 1.5}h8M6 ${o.y + 1.5}h5`} />
          </svg>
        </button>
      ))}
    </div>
  );
}

function CanvasCard({
  lesson: l,
  card: c,
  selected,
  onSelect,
  update,
  onPick,
  onSettings,
  onDropImage,
}: {
  lesson: Lesson;
  card: Card;
  selected: boolean;
  onSelect: () => void;
  update: Update;
  onPick: () => void;
  onSettings: () => void;
  onDropImage: (file: File) => void;
}) {
  const set = (fn: (x: Card) => void) => update((d) => fn(d.nodes[c.id]));
  const v = c.visual;
  const fullVideo = v.kind === "presenter" && v.video?.orientation === "portrait";
  // A photo can sit at the top of the card or fill it, with the text over a dark fade.
  const background = v.kind === "illustration" && v.layout === "background" && v.photo ? v.photo : null;
  // Light or dark text over the photo: the author's choice, or measured from the photo.
  const toneChoice = v.kind === "illustration" ? (v.textTone ?? "auto") : "auto";
  const tone = useTextTone(background?.src, toneChoice);
  const tc = toneClasses(tone);
  // A gradient behind the card, unless a full-background photo covers it.
  // Its own colour first, then the lesson's theme (see content/themes.ts).
  const gradient = !background ? cardSurface(l, c) : null;
  const surf = background ? tc : gradient ? toneClasses(gradient.text) : null;
  const ph = surf ? surf.placeholder : undefined;
  // Where the text sits (content cards): the top by default, or the bottom over a full-background photo.
  const position = c.textPosition ?? (background ? "bottom" : "top");
  const [dragging, setDragging] = useState(false);
  const pill = v.kind === "presenter" ? "Change video" : v.kind === "illustration" ? (v.photo ? "Change image" : "Change picture") : "Edit animation";
  const script = scriptOf(c);
  const secs = Math.max(1, Math.round((words(script) / 150) * 60));

  return (
    <div
      onMouseDownCapture={onSelect}
      onFocusCapture={onSelect}
      // Drop an image file onto a card to use it.
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        e.preventDefault();
        setDragging(false);
        onSelect();
        onDropImage(file);
      }}
      className={cx(
        "relative flex h-[32rem] w-[17rem] flex-col overflow-hidden rounded-[1.75rem] text-ink shadow-md transition-shadow",
        background ? cx("bg-black", tc.text) : gradient ? surf!.text : "bg-surface",
        selected ? "ring-4 ring-action" : "ring-1 ring-line hover:ring-line-strong",
        c.emphasis === "consequence" && !surf && "bg-orange/5",
      )}
      style={gradient ? { backgroundImage: gradient.css } : undefined}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[1.75rem] border-4 border-dashed border-action bg-tealtint/80 font-semibold text-ink">
          Drop to use this image
        </div>
      )}
      {background && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={background.src}
            alt=""
            className="absolute inset-0 size-full object-cover"
            style={{ objectPosition: v.kind === "illustration" ? (v.photo?.position ?? "center") : undefined }}
          />
          <div aria-hidden className={cx("absolute inset-0", tc.fade)} />
          <MediaPill label="Change image" onClick={onPick} className="top-3 left-3! translate-x-0!" />
          <button
            type="button"
            onClick={() =>
              set((x) => {
                if (x.visual.kind !== "illustration") return;
                const order = ["auto", "light", "dark"] as const;
                x.visual.textTone = order[(order.indexOf(x.visual.textTone ?? "auto") + 1) % order.length];
              })
            }
            title={`Text colour: ${toneChoice === "auto" ? `Auto (${tone === "dark" ? "dark" : "light"} text for this photo)` : toneChoice === "light" ? "Light text" : "Dark text"}. Click to change.`}
            aria-label={`Text colour: ${toneChoice}. Change`}
            className="absolute right-3 top-3 z-10 inline-flex h-9 items-center gap-1 rounded-full bg-white px-2.5 text-xs font-bold text-[#102a43] shadow-md hover:bg-white/90"
          >
            <span
              className={cx(
                "inline-flex size-5 items-center justify-center rounded-full font-serif text-[0.8rem]",
                tone === "dark" ? "bg-white text-[#0a1a2e] ring-1 ring-[#0a1a2e]/30" : "bg-[#0a1a2e] text-white",
              )}
            >
              Aa
            </span>
            {toneChoice === "auto" ? "Auto" : toneChoice === "light" ? "Light" : "Dark"}
          </button>
        </>
      )}
      {fullVideo ? (
        <>
          <CardVisual visual={v} className="size-full" />
          <MediaPill label="Change video" onClick={onPick} className="bottom-4" />
        </>
      ) : (
        <>
          {background ? (
            position !== "top" && <div className="flex-1" />
          ) : v.kind !== "none" ? (
            <div className="relative h-[42%] shrink-0">
              {/* The picture or animation runs to the card's edges; the card's corners round it. */}
              <CardVisual visual={v} className="size-full rounded-none!" />
              <MediaPill label={pill} onClick={onPick} className="bottom-4" />
            </div>
          ) : (
            <button
              type="button"
              onClick={onPick}
              className={cx(
                "mx-3 mt-3 inline-flex min-h-9 items-center gap-1.5 self-start rounded-full border border-dashed px-3 text-xs font-semibold",
                surf ? "border-white/60 bg-white/85 text-[#0a1a2e]" : "border-line-strong text-ink-muted hover:text-ink",
              )}
            >
              <Icon name="image" className="size-3.5" /> Add image, background or animation
            </button>
          )}
          <div
            className={cx(
              "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden relative flex min-h-0 flex-col gap-2 overflow-y-auto px-4 pb-3 pt-3",
              background ? (position === "center" ? "max-h-[85%]" : "max-h-[70%]") : "flex-1",
              background && position === "top" && "pt-14",
            )}
          >
            {c.bubbles && c.bubbles.length > 0 && (
              <div className="relative">
                <VideoBubbles bubbles={c.bubbles} size="canvas" />
                <button
                  type="button"
                  onClick={onPick}
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-white px-2.5 py-0.5 text-[0.7rem] font-semibold text-[#102a43] shadow"
                >
                  Edit
                </button>
              </div>
            )}
            {/* Centre or bottom text: the space above the text grows (and below it too, for centre). */}
            {!background && position !== "top" && <div aria-hidden className="-my-1 flex-1" />}
            <Editable
              value={c.label}
              onChange={(t) => set((x) => void (x.label = t))}
              placeholder="Label"
              className={cx(
                "font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.14em]",
                surf ? (gradient?.accent ?? surf.soft) : c.emphasis === "consequence" ? "text-warm" : "text-accent",
              )}
              placeholderClass={ph}
            />
            <Editable
              value={c.heading}
              onChange={(t) => set((x) => void (x.heading = t))}
              placeholder="Add a title"
              className="font-serif text-[1.35rem] font-semibold leading-tight"
              placeholderClass={ph}
            />
            {c.figure && c.figure.placement === "above" && <CanvasFigure figure={c.figure} onEdit={onSettings} />}
            {c.type === "image" || c.type === "decision" || (c.type === "summary" && c.body) ? (
              <RichEditable
                value={c.body}
                onChange={(t) => set((x) => void (x.body = t))}
                placeholder="Add some text"
                className="text-[0.95rem] leading-relaxed"
                placeholderClass={ph}
              />
            ) : (
              (c.body || c.type === "audio" || c.type === "listen") && (
                <Editable
                  value={c.body}
                  onChange={(t) => set((x) => void (x.body = t))}
                  placeholder="Add some text"
                  className="text-[0.95rem] leading-relaxed"
                  multiline
                  placeholderClass={ph}
                />
              )
            )}
            {c.figure && c.figure.placement !== "above" && <CanvasFigure figure={c.figure} onEdit={onSettings} />}
            {c.pdf && (
              <button
                type="button"
                onClick={onSettings}
                className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2 text-left text-xs text-ink"
                aria-label={`Document: ${c.pdf.title}. Edit in the card settings.`}
              >
                <Icon name="file" className="size-5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate font-semibold">{c.pdf.title || "Untitled document"}</span>
                {c.pdf.required && <span className="shrink-0 rounded-full bg-gold/40 px-1.5 py-0.5 text-[0.6rem] font-bold">Required</span>}
              </button>
            )}
            {c.keyPoints && (
              <ul className={cx("gap-1.5", c.keyPoints.style === "tiles" ? "grid grid-cols-2" : "flex flex-wrap")}>
                {c.keyPoints.items.map((k, i) => (
                  <li
                    key={i}
                    className={cx(
                      "text-xs",
                      // As in the player: on a coloured card the points sit on white.
                      surf ? "bg-white text-[#102a43] shadow-sm" : c.keyPoints!.style === "tiles" ? "bg-muted text-ink" : "bg-tealtint text-ink",
                      c.keyPoints!.style === "tiles" ? "rounded-xl p-2" : "rounded-full px-2.5 py-1",
                    )}
                  >
                    {c.keyPoints!.style === "tiles" && (
                      <IconPick value={k.icon} onChange={(icon) => set((x) => void (x.keyPoints!.items[i].icon = icon))} className="mb-1.5" />
                    )}
                    <RichEditable inline value={k.text} onChange={(t) => set((x) => void (x.keyPoints!.items[i].text = t))} placeholder="Point" />
                  </li>
                ))}
              </ul>
            )}
            {/* As in the player: over a gradient or photo, questions and choices sit on a frosted panel so they stay readable. */}
            {surf && panelledOnColour(c.type) ? (
              <div className={cx(surf.panel, "p-2.5")}>
                <InlineBody card={c} lesson={l} set={set} onSettings={onSettings} />
              </div>
            ) : (
              <InlineBody card={c} lesson={l} set={set} onSettings={onSettings} onColour={Boolean(surf)} />
            )}
            {!background && position === "center" && <div aria-hidden className="-my-1 flex-1" />}
          </div>
          {/* Stays at the bottom of the card, however long its content, so the script is always in reach. */}
          <div className="relative mt-auto flex shrink-0 items-center gap-2 px-4 pb-3 pt-2">
            <button
              type="button"
              onClick={onSettings}
              className={cx(
                "inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold",
                surf ? "bg-white/85 text-[#0a1a2e] backdrop-blur-sm" : script ? "bg-tealtint text-accent" : "bg-orange/15 text-warm",
              )}
              title="Edit the narration script"
            >
              <Icon name="volume" className="size-3.5" /> {script ? `Script · ${secs}s` : "Add script"}
            </button>
            <span aria-hidden className="ml-auto rounded-full bg-action px-3 py-1.5 text-xs font-semibold text-on-action">
              {c.type === "summary" ? c.cta || "Finish" : c.type === "quiz" ? "Check" : c.type === "decision" ? "Choose" : ("cta" in c && c.cta) || "Continue"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function MediaPill({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "absolute left-1/2 z-10 inline-flex min-h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-[#102a43] shadow-md hover:bg-white/90",
        className,
      )}
    >
      <Icon name="image" className="size-3.5" /> {label}
    </button>
  );
}

/** The interactive part of a card, edited in place: quiz answers, decision choices, summary points. */
function InlineBody({
  card: c,
  lesson: l,
  set,
  onSettings,
  onColour = false,
}: {
  card: Card;
  lesson: Lesson;
  set: (fn: (x: Card) => void) => void;
  onSettings: () => void;
  /** The card has a gradient or photo behind it and this body isn’t on a frosted panel: use the card's text colour. */
  onColour?: boolean;
}) {
  if (c.type === "quiz")
    return (
      <div className="flex flex-col gap-3">
        {c.questions.map((q, qi) => (
          <div key={q.id} className="flex flex-col gap-1.5">
            <Editable
              value={q.prompt}
              onChange={(t) => set((x) => x.type === "quiz" && void (x.questions[qi].prompt = t))}
              placeholder="Ask a question"
              className="font-semibold leading-snug"
              multiline
            />
            {q.options.map((o, oi) => (
              <div
                key={o.id}
                className={cx(
                  "flex items-center gap-2 rounded-xl border px-2 py-1.5 text-sm",
                  q.correct === o.id ? "border-action bg-[#DDE8D9] dark:bg-tealtint" : "border-line-strong bg-surface",
                )}
              >
                <button
                  type="button"
                  onClick={() => set((x) => x.type === "quiz" && void (x.questions[qi].correct = o.id))}
                  aria-label={q.correct === o.id ? "Correct answer" : "Mark as the correct answer"}
                  aria-pressed={q.correct === o.id}
                  className={cx(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                    q.correct === o.id ? "border-action bg-action text-on-action" : "border-line-strong",
                  )}
                >
                  {q.correct === o.id && <Icon name="check" className="size-3" />}
                </button>
                <Editable
                  value={o.label}
                  onChange={(t) => set((x) => x.type === "quiz" && void (x.questions[qi].options[oi].label = t))}
                  placeholder={`Answer ${oi + 1}`}
                  className="min-w-0 flex-1"
                />
              </div>
            ))}
            <button
              type="button"
              className="self-start text-xs font-semibold text-accent hover:underline"
              onClick={() =>
                set((x) => x.type === "quiz" && void x.questions[qi].options.push({ id: String.fromCharCode(97 + x.questions[qi].options.length), label: "" }))
              }
            >
              + Answer
            </button>
          </div>
        ))}
        <p className="text-xs text-ink-muted">Tick the right answer. Feedback is in card settings.</p>
      </div>
    );

  if (c.type === "wall")
    return (
      <div className="flex flex-col gap-2">
        <Editable
          value={c.prompt}
          onChange={(t) => set((x) => x.type === "wall" && void (x.prompt = t))}
          placeholder="Ask a question everyone answers"
          className="font-semibold leading-snug"
          multiline
        />
        <div className={cx("rounded-xl border border-dashed p-2 text-xs", onColour ? "border-current/50 opacity-85" : "border-line-strong text-ink-muted")}>
          <Editable
            value={c.placeholder ?? ""}
            onChange={(t) => set((x) => x.type === "wall" && void (x.placeholder = t))}
            placeholder="Hint inside the answer box (optional)"
          />
        </div>
        <div className="flex flex-col gap-1.5 text-ink" aria-hidden>
          {["“Ask what matters to them first…”", "“I write it down so I don’t forget…”"].map((t) => (
            <span key={t} className="rounded-xl bg-muted px-2.5 py-1.5 text-xs blur-[2px]">
              {t}
            </span>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="size-4 accent-[var(--action)]"
            checked={Boolean(c.anonymous)}
            onChange={(e) => set((x) => x.type === "wall" && void (x.anonymous = e.target.checked))}
          />
          Anonymous posts (hide names)
        </label>
        <p className="text-xs opacity-75">Learners post first, then see everyone else’s answers.</p>
      </div>
    );

  if (c.type === "rating")
    return (
      <div className="flex flex-col gap-1.5">
        <Editable
          value={c.prompt}
          onChange={(t) => set((x) => x.type === "rating" && void (x.prompt = t))}
          placeholder="How confident are you…?"
          className="font-semibold leading-snug"
          multiline
        />
        <div className="flex justify-center gap-1 py-1 text-[#ffc72c]" aria-hidden>
          {[1, 2, 3, 4, 5].map((n) => (
            <Icon key={n} name="star" className="size-8" />
          ))}
        </div>
        <div className="flex justify-between gap-3 text-xs font-semibold">
          <Editable
            value={c.lowLabel ?? ""}
            onChange={(t) => set((x) => x.type === "rating" && void (x.lowLabel = t))}
            placeholder="1 star label"
            className="min-w-0 flex-1"
          />
          <Editable
            value={c.highLabel ?? ""}
            onChange={(t) => set((x) => x.type === "rating" && void (x.highLabel = t))}
            placeholder="5 star label"
            className="min-w-0 flex-1 text-right"
          />
        </div>
        <p className="text-xs opacity-75">Learners rate first, then see the average and spread.</p>
      </div>
    );

  if (c.type === "poll")
    return (
      <div className="flex flex-col gap-1.5">
        <Editable
          value={c.prompt}
          onChange={(t) => set((x) => x.type === "poll" && void (x.prompt = t))}
          placeholder="Ask everyone a question"
          className="font-semibold leading-snug"
          multiline
        />
        {c.options.map((o, oi) => (
          <div key={o.id} className="flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-2.5 py-1.5 text-sm">
            <Editable
              value={o.label}
              onChange={(t) => set((x) => x.type === "poll" && void (x.options[oi].label = t))}
              placeholder={`Option ${oi + 1}`}
              className="min-w-0 flex-1"
            />
            {c.options.length > 2 && (
              <button
                type="button"
                aria-label={`Remove option ${oi + 1}`}
                onClick={() => set((x) => x.type === "poll" && void x.options.splice(oi, 1))}
                className="shrink-0 text-ink-muted hover:text-ink"
              >
                <Icon name="close" className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {c.options.length < 6 && (
          <button
            type="button"
            className="self-start text-xs font-semibold text-accent hover:underline"
            onClick={() =>
              set((x) => {
                if (x.type !== "poll") return;
                let n = x.options.length;
                while (x.options.some((o) => o.id === String.fromCharCode(97 + n))) n++;
                x.options.push({ id: String.fromCharCode(97 + n), label: "" });
              })
            }
          >
            + Option
          </button>
        )}
        <p className="text-xs text-ink-muted">No right answer. After voting, learners see what everyone chose.</p>
      </div>
    );

  if (c.type === "decision")
    return (
      <div className="flex flex-col gap-1.5">
        <RichEditable
          inline
          value={c.prompt}
          onChange={(t) => set((x) => x.type === "decision" && void (x.prompt = t))}
          placeholder="What do you do?"
          className="font-semibold"
        />
        {c.options.map((o, oi) => (
          <div key={o.id} className={cx("rounded-xl border bg-surface px-2.5 py-1.5 text-sm", o.correct ? "border-action" : "border-line-strong")}>
            <div className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <RichEditable
                  inline
                  value={o.label}
                  onChange={(t) => set((x) => x.type === "decision" && void (x.options[oi].label = t))}
                  placeholder={`Choice ${oi + 1}`}
                />
              </div>
              <button
                type="button"
                onClick={() => set((x) => x.type === "decision" && void (x.options[oi].correct = !x.options[oi].correct))}
                aria-pressed={Boolean(o.correct)}
                aria-label="Better choice"
                title="Better choice"
                className={cx("mt-0.5 shrink-0 text-base leading-none", o.correct ? "text-gold" : "text-line-strong hover:text-ink-muted")}
              >
                ★
              </button>
            </div>
            <select
              className="mt-1 w-full rounded-lg border border-line bg-surface px-1.5 py-1 text-[0.7rem] text-ink-muted hover:border-line-strong"
              value={o.stay ? "__stay" : (o.next ?? "")}
              onChange={(e) =>
                set((x) => {
                  if (x.type !== "decision") return;
                  const opt = x.options[oi];
                  if (e.target.value === "__stay") {
                    opt.stay = true;
                    opt.next = undefined;
                  } else {
                    opt.stay = false;
                    opt.next = e.target.value;
                  }
                })
              }
              aria-label={`Where choice ${oi + 1} goes`}
            >
              {!o.stay && !o.next && <option value="">Goes to: choose a card…</option>}
              <option value="__stay">Shows feedback, then try again</option>
              {Object.values(l.nodes)
                .filter((n) => n.id !== c.id)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    Goes to: {n.heading || n.label || n.id}
                  </option>
                ))}
            </select>
          </div>
        ))}
        <button
          type="button"
          className="self-start text-xs font-semibold text-accent hover:underline"
          onClick={() => set((x) => x.type === "decision" && void x.options.push({ id: `o${x.options.length + 1}`, label: "", stay: true, feedback: "" }))}
        >
          + Choice
        </button>
      </div>
    );

  if (c.type === "summary")
    return (
      <div className="flex flex-col gap-2">
        <ul className="flex flex-col gap-1 pl-4 text-sm">
          {(c.points ?? []).map((p, i) => (
            <li key={i} className="list-disc">
              <RichEditable inline value={p} onChange={(t) => set((x) => x.type === "summary" && void (x.points![i] = t))} placeholder="A point to remember" />
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={cx("self-start text-xs font-semibold hover:underline", onColour ? "underline" : "text-accent")}
          onClick={() => set((x) => x.type === "summary" && void (x.points = [...(x.points ?? []), ""]))}
        >
          + Point
        </button>
        <div className="rounded-xl bg-[#DCECE5] p-2.5 text-sm text-[#102a43] [text-shadow:none]">
          <p className="text-[0.7rem] font-bold uppercase tracking-wider text-[#0e7c7b]">Take it to work</p>
          <RichEditable
            inline
            value={c.action}
            onChange={(t) => set((x) => x.type === "summary" && void (x.action = t))}
            placeholder="One thing to do on the job"
          />
        </div>
      </div>
    );

  if (c.type === "widget") return <WidgetBuilder card={c} lessonTitle={l.title} set={set} onSettings={onSettings} />;

  if (c.type === "calculator") {
    const total = Math.round((c.calc.initial / 60) * c.calc.rate);
    return (
      <div className="rounded-2xl bg-muted p-3 text-sm text-ink">
        <div className="flex justify-between font-semibold">
          <span>{c.calc.initial} minutes</span>
          <span>${total}</span>
        </div>
        <input
          type="range"
          min={c.calc.min}
          max={c.calc.max}
          step={c.calc.step}
          value={c.calc.initial}
          readOnly
          disabled
          className="mt-2 w-full accent-[var(--action)]"
          aria-label="Preview of the slider"
        />
        <p className="mt-1 text-xs text-ink-muted">
          ${c.calc.rate} an hour · {c.calc.min} to {c.calc.max} minutes
        </p>
        <button
          type="button"
          onClick={onSettings}
          className="mt-2 inline-flex min-h-8 items-center gap-1 rounded-full bg-surface px-3 text-xs font-semibold shadow-sm ring-1 ring-line"
        >
          <Icon name="sliders" className="size-3.5" /> Edit calculator
        </button>
      </div>
    );
  }

  if (c.type === "checklist")
    return (
      <div className="flex flex-col gap-1.5 text-sm">
        <Editable
          value={c.prompt}
          onChange={(t) => set((x) => x.type === "checklist" && void (x.prompt = t))}
          placeholder="What the list is for, e.g. “Before I leave, I…”"
          className="font-semibold"
          multiline
        />
        {c.items.map((item, i) => (
          <div key={item.id} className="flex items-start gap-2 rounded-xl border border-line-strong bg-surface px-2.5 py-1.5">
            <span aria-hidden className="mt-0.5 size-4 shrink-0 rounded border-2 border-line-strong" />
            <Editable
              value={item.text}
              onChange={(t) => set((x) => x.type === "checklist" && void (x.items[i].text = t))}
              placeholder={`Item ${i + 1}`}
              className="min-w-0 flex-1"
              multiline
            />
            {item.note && (
              <span title="Has a note" className="text-ink-muted">
                <Icon name="info" className="size-3.5" />
              </span>
            )}
            {c.items.length > 1 && (
              <button
                type="button"
                aria-label={`Remove item ${i + 1}`}
                onClick={() => set((x) => x.type === "checklist" && void x.items.splice(i, 1))}
                className="shrink-0 text-ink-muted hover:text-ink"
              >
                <Icon name="close" className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {c.items.length < 10 && (
          <button
            type="button"
            className="self-start text-xs font-semibold text-accent hover:underline"
            onClick={() =>
              set((x) => {
                if (x.type !== "checklist") return;
                let n = x.items.length + 1;
                while (x.items.some((it) => it.id === `i${n}`)) n++;
                x.items.push({ id: `i${n}`, text: "" });
              })
            }
          >
            + Item
          </button>
        )}
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="size-4 accent-[var(--action)]"
            checked={Boolean(c.requireAll)}
            onChange={(e) => set((x) => x.type === "checklist" && void (x.requireAll = e.target.checked || undefined))}
          />
          Tick every item to continue
        </label>
        <button type="button" onClick={onSettings} className="self-start text-xs font-semibold text-accent hover:underline">
          Add notes under items
        </button>
      </div>
    );

  if (c.type === "resources") {
    const items = c.items.filter((i) => i.title.trim());
    return (
      <div className="flex flex-col gap-1.5 text-sm">
        {items.length ? (
          <ul className="flex flex-col gap-1.5">
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={onSettings}
                  className="flex w-full items-start gap-2 rounded-xl border border-line bg-surface p-2 text-left text-ink shadow-sm hover:border-line-strong"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-tealtint text-accent">
                    <Icon name={RESOURCE_KINDS[i.kind].icon} className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold leading-snug">{i.title}</span>
                    <span className="block text-[0.7rem] text-ink-muted">{[RESOURCE_KINDS[i.kind].label, fileSize(i.bytes)].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" onClick={onSettings} className={cx("self-start text-xs font-semibold hover:underline", onColour ? "underline" : "text-accent")}>
          {items.length ? "Edit resources" : "+ Add PDFs, websites or toolkits"}
        </button>
      </div>
    );
  }

  if (c.type === "hotspot")
    return (
      <div className="flex flex-col gap-2 text-sm">
        <Editable
          value={c.prompt}
          onChange={(t) => set((x) => x.type === "hotspot" && void (x.prompt = t))}
          placeholder="Tell learners what to look for"
          className="font-semibold"
          multiline
        />
        {c.image ? (
          <button
            type="button"
            onClick={onSettings}
            className="relative w-full overflow-hidden rounded-xl"
            style={{ aspectRatio: `${c.image.width} / ${c.image.height}` }}
            aria-label="Edit hotspots"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.image.src} alt="" className="absolute inset-0 size-full object-cover" />
            {c.spots.map((s, i) => (
              <span
                key={s.id}
                aria-hidden
                className={cx(
                  "absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[0.6rem] font-bold shadow ring-2 ring-white",
                  c.mode === "find" ? "bg-gold text-[#0a1a2e]" : "bg-action text-on-action",
                )}
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
              >
                {i + 1}
              </span>
            ))}
          </button>
        ) : (
          <button
            type="button"
            onClick={onSettings}
            className="grid aspect-[4/3] w-full place-items-center rounded-xl border-2 border-dashed border-line-strong text-xs font-semibold text-ink-muted hover:border-action hover:text-ink"
          >
            <span className="flex flex-col items-center gap-1">
              <Icon name="image" className="size-5" /> Choose a picture
            </span>
          </button>
        )}
        <button type="button" onClick={onSettings} className="self-start text-xs font-semibold text-accent hover:underline">
          {c.spots.length
            ? `${c.spots.length} ${c.spots.length === 1 ? "spot" : "spots"} · ${c.mode === "find" ? "find mode" : "explore mode"} · Edit`
            : "Add spots"}
        </button>
      </div>
    );

  if (c.type === "written")
    return (
      <div className="flex flex-col gap-2 text-sm">
        <Editable
          value={c.prompt}
          onChange={(t) => set((x) => x.type === "written" && void (x.prompt = t))}
          placeholder="Ask a question they answer in writing"
          className="font-semibold"
          multiline
        />
        <div className="rounded-xl border border-dashed border-line-strong p-2 text-xs text-ink-muted">Learner writes here, then checks it with AI</div>
        <div className="rounded-xl bg-muted p-2 text-ink">
          <p className="flex items-center gap-1 text-[0.7rem] font-bold uppercase tracking-wider text-ink-muted">
            <Icon name="spark" className="size-3" /> A good answer covers
          </p>
          <ol className="mt-1 flex flex-col gap-1">
            {c.criteria.map((cr, i) => (
              <li key={cr.id} className="flex items-start gap-1.5">
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-action text-[0.6rem] font-bold text-on-action">{i + 1}</span>
                <Editable
                  value={cr.text}
                  onChange={(t) => set((x) => x.type === "written" && void (x.criteria[i].text = t))}
                  placeholder="Something a good answer includes"
                  className="min-w-0 flex-1 text-xs"
                  multiline
                />
                {c.criteria.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove criterion ${i + 1}`}
                    onClick={() => set((x) => x.type === "written" && void x.criteria.splice(i, 1))}
                    className="shrink-0 text-ink-muted hover:text-ink"
                  >
                    <Icon name="close" className="size-3" />
                  </button>
                )}
              </li>
            ))}
          </ol>
          {c.criteria.length < 6 && (
            <button
              type="button"
              className="mt-1 text-xs font-semibold text-accent hover:underline"
              onClick={() =>
                set((x) => {
                  if (x.type !== "written") return;
                  let n = x.criteria.length + 1;
                  while (x.criteria.some((cr) => cr.id === `c${n}`)) n++;
                  x.criteria.push({ id: `c${n}`, text: "" });
                })
              }
            >
              + Criterion
            </button>
          )}
        </div>
        <button type="button" onClick={onSettings} className="self-start text-xs font-semibold text-accent hover:underline">
          {c.mustPass ? "Must cover all to continue · " : ""}AI notes and Try it
        </button>
      </div>
    );

  if (c.type === "response")
    return (
      <div className="flex flex-col gap-2 text-sm">
        <Editable
          value={c.prompt}
          onChange={(t) => set((x) => x.type === "response" && void (x.prompt = t))}
          placeholder="Ask them to write something"
          className="font-semibold"
          multiline
        />
        <div className="rounded-xl border border-dashed border-line-strong p-2 text-xs text-ink-muted">Learner writes here</div>
        <div className="rounded-xl bg-muted p-2 text-ink">
          <p className="text-[0.7rem] font-bold uppercase tracking-wider text-ink-muted">Example answer</p>
          <Editable
            value={c.modelResponse}
            onChange={(t) => set((x) => x.type === "response" && void (x.modelResponse = t))}
            placeholder="Shown after they answer"
            multiline
          />
        </div>
      </div>
    );

  if (c.type === "listen")
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-[#102a43] text-white shadow-md" aria-hidden>
          <Icon name="volume" className="size-6" />
        </span>
        <div className="w-full rounded-xl bg-white/80 p-2.5 text-left text-sm text-ink">
          <p className="text-[0.7rem] font-bold uppercase tracking-wider text-ink-muted">What the voice says</p>
          <Editable value={c.script} onChange={(t) => set((x) => x.type === "listen" && void (x.script = t))} placeholder="Write the audio script" multiline />
        </div>
        <span className="rounded-xl bg-[#102a43] px-4 py-2 text-xs font-semibold text-white" aria-hidden>
          ▶ Play audio
        </span>
        <p className="text-xs opacity-75">Plays when the learner presses Play, with live captions.</p>
      </div>
    );

  if (c.type === "audio")
    return (
      <div className="rounded-xl bg-muted p-2.5 text-sm text-ink">
        <p className="text-[0.7rem] font-bold uppercase tracking-wider text-ink-muted">Read aloud</p>
        <Editable value={c.script} onChange={(t) => set((x) => x.type === "audio" && void (x.script = t))} placeholder="What the voice says" multiline />
      </div>
    );

  return null;
}

/** Side drawer for a card's advanced settings. */
function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="flex h-dvh w-full max-w-xl flex-col bg-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-serif text-xl font-semibold">{title}</h2>
          <button type="button" className={btn.quiet} onClick={onClose} aria-label="Close">
            <Icon name="close" className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/** Picture, animation or video for the top of a card, with a live preview. */
function MediaDialog({ card: c, lesson, update, onClose }: { card: Card; lesson: string; update: Update; onClose: () => void }) {
  const set = (fn: (x: Card) => void) => update((d) => fn(d.nodes[c.id]));
  const portrait = c.visual.kind === "presenter" && c.visual.video?.orientation === "portrait";
  return (
    <Drawer title="Picture, background and video" onClose={onClose}>
      {c.type === "image" && c.narration?.trim() && (
        <>
          <MakePresenterCard card={c} set={set} />
          <hr className="my-5 border-line" />
        </>
      )}
      <BackgroundField card={c} set={set} />
      <hr className="my-5 border-line" />
      <BubbleField card={c} set={set} />
      <hr className="my-5 border-line" />
      {c.visual.kind !== "none" && (
        <div className={cx("mx-auto mb-5", portrait ? "w-48" : "w-full")}>
          {c.visual.kind === "illustration" ? (
            <ReplaceablePicture card={c} set={set} update={update}>
              <CardVisual visual={c.visual} className="aspect-[16/10] w-full overflow-hidden rounded-2xl" />
            </ReplaceablePicture>
          ) : (
            <CardVisual visual={c.visual} className={cx("w-full overflow-hidden rounded-2xl", portrait ? "aspect-[9/16]" : "aspect-[16/10]")} />
          )}
        </div>
      )}
      <VisualField card={c} set={set} lesson={lesson} update={update} />
      {(c.type === "image" || c.type === "audio") && (
        <>
          <hr className="my-5 border-line" />
          <FigureField card={c} set={set} />
          <hr className="my-5 border-line" />
          <DocumentField card={c} set={set} />
        </>
      )}
    </Drawer>
  );
}

/**
  A gallery picture with "Replace" on hover (or a file dropped on it): the new file takes its place
  everywhere it's used, in every lesson. Only uploads can be replaced; built-in pictures can't.
*/
function ReplaceableTile({ photo, update, onReplaced, children }: { photo: Photo; update?: Update; onReplaced: () => void; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const uploaded = photo.src.startsWith("/api/uploads/");
  const file = photo.src.split("/").pop() ?? "";

  async function replace(next: File | undefined) {
    if (!next) return;
    setError(null);
    try {
      const { lessons } = await api<{ lessons: { slug: string; title: string }[] }>(`/api/admin/uploads/${encodeURIComponent(file)}`);
      const where = lessons.map((x) => `“${x.title}”`).join(", ");
      const ok = await confirmAction(
        where
          ? `Every card using this picture changes to the new one, in ${where}, including what learners see now. Cards keep their crop and position.`
          : "The new picture takes its place in the library.",
        { title: `Replace with “${next.name}”?`, confirmLabel: "Replace" },
      );
      if (!ok) return;
      setBusy(true);
      const done = await replaceImage(file, next);
      // This editor's copy of the lesson changes too, so saving it doesn't put the old picture back.
      update?.((d) => void Object.assign(d, swapPicture(d, photo.src, done)));
      onReplaced();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!uploaded) return <>{children}</>;
  return (
    <div
      className={cx("group relative", busy && "animate-pulse")}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const f = e.dataTransfer.files?.[0];
        if (!f) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        void replace(f);
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-tealtint/90 text-xs font-bold text-ink">Drop to replace</div>
      )}
      <button
        type="button"
        onClick={() => pick.current?.click()}
        disabled={busy}
        title="Replace this picture everywhere it’s used (or drop a file on it)"
        aria-label="Replace this picture with a new one, everywhere it’s used"
        className="absolute inset-x-1 bottom-1 inline-flex min-h-7 items-center justify-center gap-1 rounded-full bg-white/95 text-[0.7rem] font-bold text-[#102a43] opacity-0 shadow ring-1 ring-black/10 transition-opacity hover:bg-white focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <Icon name="refresh" className="size-3" /> {busy ? "Replacing…" : "Replace"}
      </button>
      <input
        ref={pick}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void replace(f);
        }}
      />
      {error && (
        <p role="alert" className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg bg-surface p-1.5 text-[0.7rem] text-danger shadow">
          {error}
        </p>
      )}
    </div>
  );
}

/**
  The card's picture in the media panel: "Replace image" (or drop a file on it) swaps the picture on
  this card, keeping its position. "Replace in every lesson" swaps the file everywhere it's used.
*/
function ReplaceablePicture({
  card: c,
  set,
  update,
  children,
}: {
  card: Card;
  set: (fn: (x: Card) => void) => void;
  update: Update;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState<"card" | "everywhere" | null>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const everywhereInput = useRef<HTMLInputElement>(null);
  const photo = c.visual.kind === "illustration" ? c.visual.photo : undefined;
  const isUpload = Boolean(photo?.src.startsWith("/api/uploads/"));

  async function onCard(file: File | undefined) {
    if (!file) return;
    setBusy("card");
    setError(null);
    setNote(null);
    try {
      const p = await uploadImage(file);
      set((x) => {
        if (x.visual.kind !== "illustration") return;
        // A new picture: keep where it sits on the card, drop the old one's photo credit.
        x.visual.photo = { src: p.src, width: p.width, height: p.height, ...(x.visual.photo?.position ? { position: x.visual.photo.position } : {}) };
      });
      setNote("Picture replaced on this card.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function everywhere(file: File | undefined) {
    if (!file || !photo) return;
    const ok = await confirmAction(
      "Every card using this picture changes to the new one, in every topic, including what learners see now. Cards keep their crop and position.",
      { title: `Replace in every topic with “${file.name}”?`, confirmLabel: "Replace everywhere" },
    );
    if (!ok) return;
    setBusy("everywhere");
    setError(null);
    setNote(null);
    try {
      const next = await replaceImage(photo.src.split("/").pop()!, file);
      // This editor's copy of the lesson changes too, so saving it doesn't put the old picture back.
      update((d) => void Object.assign(d, swapPicture(d, photo.src, next)));
      setNote(`Picture replaced in ${next.lessons.length || 1} ${next.lessons.length === 1 ? "topic" : "topics"}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cx("relative rounded-2xl", over && "ring-4 ring-action")}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          void onCard(file);
        }}
      >
        {children}
        {over && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl bg-tealtint/85 font-semibold text-ink">
            Drop to replace the picture
          </div>
        )}
        <button
          type="button"
          onClick={() => pick.current?.click()}
          disabled={busy !== null}
          className="absolute bottom-3 right-3 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-semibold text-[#102a43] shadow-md hover:bg-white/90 disabled:opacity-60"
        >
          <Icon name="refresh" className="size-4" /> {busy === "card" ? "Uploading…" : photo ? "Replace image" : "Add an image"}
        </button>
        <input
          ref={pick}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void onCard(file);
          }}
        />
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        <span>Drop a picture on it to replace it on this card.</span>
        {isUpload && (
          <>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => everywhereInput.current?.click()}
              className="font-semibold text-accent hover:underline disabled:opacity-60"
            >
              {busy === "everywhere" ? "Replacing everywhere…" : "Replace in every topic"}
            </button>
            <input
              ref={everywhereInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void everywhere(file);
              }}
            />
          </>
        )}
      </p>
      {note && (
        <p role="status" className="rounded-xl bg-tealtint px-3 py-2 text-sm">
          {note}
        </p>
      )}
      {error && <ErrorNote text={error} />}
    </div>
  );
}

/** One or two talking-head clips shown as circles at the top of the card: record on the webcam or upload. */
function BubbleField({ card: c, set }: { card: Card; set: (fn: (x: Card) => void) => void }) {
  const bubbles = c.bubbles ?? [];
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = (b: { src: string; poster?: string }) => set((x) => void (x.bubbles = [...(x.bubbles ?? []), b].slice(0, 2)));
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold">Video bubbles</p>
        <p className="text-xs text-ink-muted">
          Short talking-head clips in a circle at the top of the card. Learners tap to play. Up to two, for two speakers.
        </p>
      </div>
      {bubbles.length > 0 && (
        <ul className="flex flex-wrap gap-4">
          {bubbles.map((b, i) => (
            <li key={b.src} className="flex w-36 flex-col items-center gap-2">
              <video src={b.src} poster={b.poster} preload="metadata" controls playsInline className="size-28 rounded-full bg-[#102a43] object-cover" />
              <input
                className={cx(input, "min-h-9 text-sm")}
                placeholder="Name (optional)"
                value={b.label ?? ""}
                onChange={(e) => set((x) => void (x.bubbles![i].label = e.target.value))}
                aria-label={`Name for video ${i + 1}`}
              />
              <button type="button" className={btn.quiet} onClick={() => set((x) => void (x.bubbles = x.bubbles!.filter((_, j) => j !== i)))}>
                <Icon name="trash" className="size-4" /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {recording ? (
        <VideoRecorder
          onCancel={() => setRecording(false)}
          onSave={async (clip) => {
            add(await uploadVideo(clip, `recording.${clip.type.includes("mp4") ? "mp4" : "webm"}`));
            setRecording(false);
          }}
        />
      ) : (
        bubbles.length < 2 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.primary} onClick={() => setRecording(true)} disabled={busy}>
              <Icon name="camera" className="size-4" /> Record with webcam
            </button>
            <label className={cx(btn.secondary, "cursor-pointer has-[:focus-visible]:outline-2", busy && "pointer-events-none opacity-50")}>
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setBusy(true);
                  setError(null);
                  try {
                    add(await uploadVideo(f, f.name));
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <Icon name="upload" className="size-4" /> {busy ? "Uploading…" : "Upload a video"}
            </label>
          </div>
        )
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** The card's background: plain, or one of the gradient presets. */
function BackgroundField({ card: c, set }: { card: Card; set: (fn: (x: Card) => void) => void }) {
  const current = c.background?.gradient ?? null;
  const covered = c.visual.kind === "illustration" && c.visual.layout === "background" && Boolean(c.visual.photo);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">Card background</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Card background">
        <button
          type="button"
          aria-pressed={!current}
          onClick={() => set((x) => void delete x.background)}
          className={cx(
            "flex h-16 w-14 flex-col items-center justify-end rounded-xl border-2 bg-surface pb-1 text-[0.65rem] font-semibold",
            !current ? "border-action" : "border-line-strong",
          )}
        >
          Plain
        </button>
        {gradientIds.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={current === g}
            onClick={() => set((x) => void (x.background = { gradient: g }))}
            style={{ backgroundImage: GRADIENTS[g].css }}
            className={cx(
              "flex h-16 w-14 flex-col items-center justify-end rounded-xl border-2 pb-1 text-[0.65rem] font-semibold",
              GRADIENTS[g].text === "light" ? "text-white" : "text-[#0a1a2e]",
              current === g ? "border-action ring-2 ring-action/40" : "border-transparent",
            )}
          >
            {GRADIENTS[g].label}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-muted">
        {covered
          ? "A full-background photo is covering this. Set the photo to “Top of the card” to see the gradient."
          : "Text switches to white or dark to suit the gradient you pick."}
      </p>
    </div>
  );
}

/**
  Why "Required completion" would make no difference on this card, or null when it would.
  Mirrors completionGate: answer cards and (by default) audio already hold learners.
*/
function requiredWhyNot(c: Card, holdForAudio: boolean | undefined) {
  const v = c.visual;
  if (
    (c.type === "presenter" && v.kind === "presenter" && v.video) ||
    c.bubbles?.length ||
    c.type === "response" ||
    c.type === "calculator" ||
    c.type === "widget"
  )
    return null;
  if (["quiz", "decision", "poll", "rating", "wall", "written", "hotspot"].includes(c.type))
    return "Learners already have to answer this card before moving on";
  if (c.type === "checklist") return "Use “Tick every item to continue” on the card instead";
  if (c.type === "listen" || c.type === "audio" || c.narration)
    return holdForAudio !== false ? "This topic already holds learners until the audio finishes (Details tab)" : null;
  return "Nothing to finish on this card: add narration or a video first";
}

/** What "Required completion" asks of the learner on this kind of card. */
function requiredHint(c: Card) {
  const v = c.visual;
  if (c.type === "presenter" && v.kind === "presenter" && v.video)
    return v.video.provider === "synthesia" && !v.video.src
      ? "Continue and swiping unlock after the video’s length has passed (Synthesia’s player can’t report when it ends)."
      : "Continue and swiping unlock once the video has played to the end.";
  if (c.type === "response") return "Continue and swiping unlock once they’ve written an answer.";
  if (c.type === "calculator") return "Continue and swiping unlock once they’ve tried the calculator.";
  if (c.type === "widget") return "Continue and swiping unlock once they’ve pressed, typed or dragged something in the widget.";
  if (["quiz", "decision", "poll", "rating", "wall", "written", "hotspot"].includes(c.type))
    return "Learners already have to answer this card before moving on.";
  if (c.type === "listen" || c.type === "audio" || c.narration) return "Continue and swiping unlock once the audio has played to the end.";
  return "This card has no audio, video or activity to finish. Add narration or a video for this to apply.";
}

/**
  "Check by": for content that can go out of date (a rate, a date, a rule). Suggested automatically
  when the card mentions a dollar amount, date, percentage or law.
*/
function CheckFields({ card: c, set }: { card: Card; set: (fn: (c: Card) => void) => void }) {
  const found = volatileIn(extractText({ nodes: { [c.id]: c } } as unknown as Lesson).join(" "));
  const check = c.check;
  if (!check)
    return (
      <div
        className={cx("flex flex-wrap items-center gap-3 rounded-2xl border p-3 sm:col-span-2", found.length ? "border-gold bg-gold/10" : "border-line-strong")}
      >
        <Icon name="clock" className="size-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">Check date</span>
          <span className="block text-ink-muted">
            {found.length
              ? `This card mentions ${found.join(", ")}. Add a date to check it by, or use a shared fact, so it doesn’t go out of date.`
              : "For content that can go out of date: you’ll be reminded before it’s due."}
          </span>
        </span>
        <button
          type="button"
          className={btn.secondary}
          onClick={() =>
            set((x) => {
              const by = new Date(Date.now() + 182 * 86_400_000).toISOString().slice(0, 10);
              x.check = { by };
            })
          }
        >
          Add a check date
        </button>
      </div>
    );
  const days = checkDays(check.by);
  const upd = (fn: (k: NonNullable<Card["check"]>) => void) => set((x) => x.check && void fn(x.check));
  return (
    <fieldset className="grid gap-3 rounded-2xl border border-line-strong p-3 sm:col-span-2 sm:grid-cols-2">
      <legend className="flex items-center gap-1.5 px-1 font-semibold">
        <Icon name="clock" className="size-4" /> Check date
        <span className={cx("ml-1 rounded-full px-2 text-xs", days < 0 ? "bg-danger/15 text-danger" : days <= 30 ? "bg-gold/25" : "bg-muted text-ink-muted")}>
          {days < 0 ? `${-days} days overdue` : days === 0 ? "Due today" : `Due in ${days} days`}
        </span>
      </legend>
      <Field label="Check by">
        <input type="date" className={input} value={check.by} onChange={(e) => upd((k) => void (k.by = e.target.value))} />
      </Field>
      <Field label="What to check" hint="E.g. “Confirm the hourly rate with Finance”.">
        <input className={input} value={check.note ?? ""} onChange={(e) => upd((k) => void (k.note = e.target.value || undefined))} />
      </Field>
      <Field label="Source to check against" hint="Optional title.">
        <input
          className={input}
          value={check.source?.title ?? ""}
          onChange={(e) => upd((k) => void (k.source = { title: e.target.value, url: k.source?.url ?? "" }))}
        />
      </Field>
      <Field label="Source link">
        <input
          className={input}
          placeholder="https://"
          value={check.source?.url ?? ""}
          onChange={(e) => upd((k) => void (k.source = { title: k.source?.title ?? "", url: e.target.value.trim() }))}
        />
      </Field>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button
          type="button"
          className={btn.secondary}
          onClick={() => upd((k) => void (k.by = new Date(Date.now() + 182 * 86_400_000).toISOString().slice(0, 10)))}
        >
          Checked: next check in 6 months
        </button>
        <button type="button" className={btn.quiet} onClick={() => set((x) => void delete x.check)}>
          Remove check date
        </button>
      </div>
    </fieldset>
  );
}

type FactRow = { key: string; label: string; value: string };

/** Facts this card uses (with their current values), and a quick way to put another one in. */
function FactsHelper({ card: c }: { card: Card }) {
  const facts = useApi<{ facts: FactRow[] }>("/api/admin/facts").data?.facts ?? [];
  const used = factsUsed(c);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line-strong p-3 text-sm sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">Shared facts</span>
        <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Close" : "Insert a fact"}
        </button>
      </div>
      {used.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {used.map((k) => {
            const f = facts.find((x) => x.key === k);
            return (
              <li key={k} className={cx("rounded-full px-2.5 py-0.5 text-xs", f ? "bg-tealtint" : "bg-danger/10 text-danger")}>
                {f ? `${f.label}: ${f.value}` : `${tokenFor(k)} isn’t in the facts library`}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-ink-muted">Put a rate, date or number in as a shared fact and it stays current everywhere it’s used.</p>
      )}
      {open && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-ink-muted">
            Copy a fact’s code and paste it into the card’s text. Learners see its value.{" "}
            <Link href="/admin/facts" className="underline" target="_blank">
              Manage facts
            </Link>
          </p>
          <ul className="flex flex-col divide-y divide-line">
            {facts.map((f) => (
              <li key={f.key} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{f.label}</span> <span className="text-ink-muted">· {f.value}</span>
                </span>
                <button
                  type="button"
                  className="rounded-full border border-line-strong px-2.5 py-0.5 font-mono text-xs hover:bg-muted"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(tokenFor(f.key)).catch(() => {});
                    setCopied(f.key);
                  }}
                >
                  {copied === f.key ? "Copied" : tokenFor(f.key)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CardForm({ lesson: l, card: c, update, isNew }: { lesson: Lesson; card: Card; update: Update; isNew: boolean }) {
  const set = (fn: (c: Card) => void) => update((d) => fn(d.nodes[c.id]));
  const t = typeInfo(c.type);
  const others = Object.values(l.nodes).filter((n) => n.id !== c.id);
  const script = scriptOf(c);
  // Required completion makes no difference here (already off): say why instead.
  const noEffect = !c.requireComplete && requiredWhyNot(c, l.holdForAudio);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const listen = () => {
    const a = audio.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    a.src = `/api/tts?key=${encodeURIComponent(`lesson:${l.slug}:${c.id}`)}`;
    a.play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  };

  return (
    <Panel
      title={`${t.label} card`}
      aside={
        <span className="flex items-center gap-2 text-sm text-ink-muted">
          <Icon name={t.icon} className="size-4" /> {t.hint}
        </span>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CheckFields card={c} set={set} />
        <FactsHelper card={c} />
        <label className={cx("flex items-start gap-3 rounded-2xl border border-line-strong p-3 sm:col-span-2", noEffect && "opacity-60")}>
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-[var(--action)]"
            checked={Boolean(c.requireComplete)}
            disabled={Boolean(noEffect)}
            onChange={(e) => set((x) => void (x.requireComplete = e.target.checked))}
          />
          <span>
            <span className="flex items-center gap-1.5 font-semibold">
              <Icon name="lock" className="size-4" /> Required completion
            </span>
            <span className="block text-sm text-ink-muted">{noEffect ? `Not needed. ${noEffect}.` : requiredHint(c)}</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-2xl border border-line-strong p-3 sm:col-span-2">
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-[var(--action)]"
            checked={commentsOn(c)}
            onChange={(e) => set((x) => (e.target.checked ? void delete x.comments : void (x.comments = false)))}
          />
          <span>
            <span className="flex items-center gap-1.5 font-semibold">
              <Icon name="chat" className="size-4" /> Comments
            </span>
            <span className="block text-sm text-ink-muted">
              Learners can read and add comments on this card: local tips, things to watch for, questions. You and organisation admins can pin a useful comment
              or hide one.
            </span>
          </span>
        </label>
        <Field label="Step">
          <select className={input} value={c.beat} onChange={(e) => set((x) => void (x.beat = Number(e.target.value)))}>
            {l.beats.map((b, i) => (
              <option key={i} value={i}>
                {i + 1}. {b}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Small label" hint="Shown above the heading.">
          <input className={input} value={c.label} onChange={(e) => set((x) => void (x.label = e.target.value))} />
        </Field>
        <Field label="Heading" className="sm:col-span-2">
          <input className={input} value={c.heading} onChange={(e) => set((x) => void (x.heading = e.target.value))} />
        </Field>
        <Field
          label="On-screen text"
          hint={`${words(plainText(c.body))} words. Keep it to two or three short sentences.${c.type === "image" || c.type === "decision" ? " Format it on the card, or here with **bold**, *italic*, [words](https://link), - bullets and | table | rows |." : ""}`}
          className="sm:col-span-2"
        >
          <textarea rows={4} className={textarea} value={c.body} onChange={(e) => set((x) => void (x.body = e.target.value))} />
        </Field>

        {c.type === "decision" && <DecisionFields card={c} others={others} set={set} />}
        {c.type === "quiz" && <QuizFields card={c} set={set} />}
        {c.type === "summary" && <SummaryFields card={c} set={set} />}
        {c.type === "calculator" && <CalculatorFields card={c} set={set} />}
        {c.type === "widget" && <WidgetFields card={c} set={set} />}
        {c.type === "written" && <WrittenFields lesson={l} card={c} set={set} />}
        {c.type === "hotspot" && <HotspotFields card={c} set={set} />}
        {c.type === "resources" && <ResourcesFields card={c} set={set} />}
        {c.type === "checklist" && <ChecklistFields card={c} set={set} />}
        {c.type === "response" && (
          <>
            <Field label="Prompt" className="sm:col-span-2">
              <textarea
                rows={2}
                className={textarea}
                value={c.prompt}
                onChange={(e) => set((x) => x.type === "response" && void (x.prompt = e.target.value))}
              />
            </Field>
            <Field label="Model response" hint="Shown after the learner writes their own." className="sm:col-span-2">
              <textarea
                rows={3}
                className={textarea}
                value={c.modelResponse}
                onChange={(e) => set((x) => x.type === "response" && void (x.modelResponse = e.target.value))}
              />
            </Field>
          </>
        )}
        {"next" in c && (
          <Field label="Then go to" hint={c.type === "quiz" ? "After the learner passes. Leave empty to finish here." : undefined} className="sm:col-span-2">
            <select className={input} value={c.next ?? ""} onChange={(e) => set((x) => "next" in x && void (x.next = e.target.value))}>
              <option value="">{c.type === "quiz" ? "Finish the topic" : "Choose a card…"}</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.heading || o.id}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <hr className="my-5 border-line" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={c.type === "presenter" ? "Presenter script" : "Narration script"}
          hint={`${words(script)} words · about ${Math.max(1, Math.round((words(script) / 150) * 60))} seconds read aloud by Charlie (Australian).`}
          className="sm:col-span-2"
        >
          <textarea
            rows={4}
            className={textarea}
            value={script}
            onChange={(e) =>
              set((x) => {
                if (x.type === "presenter") x.transcript = e.target.value;
                else if (x.type === "audio" || x.type === "listen") x.script = e.target.value;
                else x.narration = e.target.value;
              })
            }
            placeholder="What the voice says on this card. Write it to be heard: short sentences, plain words."
          />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button
            type="button"
            className={btn.secondary}
            onClick={listen}
            disabled={isNew || !script}
            title={isNew ? "Available once the topic is saved" : undefined}
          >
            <Icon name={playing ? "pause" : "volume"} className="size-4" /> {playing ? "Stop" : "Listen"}
          </button>
          <ClaudeButton>Write narration from the text</ClaudeButton>
          <audio ref={audio} onEnded={() => setPlaying(false)} className="hidden" />
        </div>
        {(c.type === "image" || c.type === "audio") && <FigureField card={c} set={set} />}
        {(c.type === "image" || c.type === "audio") && <DocumentField card={c} set={set} />}
        <KeyPointsField card={c} set={set} />
        <Field label="Official source" hint="Shown as a link under the card text." className="sm:col-span-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className={input}
              placeholder="Title"
              value={c.source?.title ?? ""}
              onChange={(e) => set((x) => void (x.source = { title: e.target.value, url: x.source?.url ?? "" }))}
            />
            <input
              className={input}
              placeholder="https://"
              value={c.source?.url ?? ""}
              onChange={(e) => set((x) => void (x.source = { title: x.source?.title ?? "", url: e.target.value }))}
            />
          </div>
        </Field>
      </div>
      <hr className="my-5 border-line" />
      <VisualField card={c} set={set} lesson={l.slug} update={update} />
    </Panel>
  );
}

function CalculatorFields({ card: c, set }: { card: Extract<Card, { type: "calculator" }>; set: (fn: (c: Card) => void) => void }) {
  const num = (k: "min" | "max" | "step" | "initial" | "rate") => (
    <Field label={{ min: "Shortest (minutes)", max: "Longest (minutes)", step: "Steps of", initial: "Starts at", rate: "Hourly rate ($)" }[k]}>
      <input
        type="number"
        className={input}
        value={c.calc[k]}
        onChange={(e) => set((x) => x.type === "calculator" && void (x.calc[k] = Number(e.target.value)))}
      />
    </Field>
  );
  return (
    <div className="grid gap-3 rounded-2xl border border-line p-3 sm:col-span-2 sm:grid-cols-3">
      <p className="text-sm font-semibold sm:col-span-3">Calculator</p>
      {num("min")}
      {num("max")}
      {num("step")}
      {num("initial")}
      {num("rate")}
      <Field label="Formula shown" className="sm:col-span-3">
        <input className={input} value={c.calc.formula} onChange={(e) => set((x) => x.type === "calculator" && void (x.calc.formula = e.target.value))} />
      </Field>
      <Field label="Assumptions" hint="Shown under the result, for example that the rate is illustrative." className="sm:col-span-3">
        <input
          className={input}
          value={c.calc.assumptions}
          onChange={(e) => set((x) => x.type === "calculator" && void (x.calc.assumptions = e.target.value))}
        />
      </Field>
    </div>
  );
}

function DecisionFields({ card: c, others, set }: { card: Extract<Card, { type: "decision" }>; others: Card[]; set: (fn: (c: Card) => void) => void }) {
  const opt = (i: number, fn: (o: Extract<Card, { type: "decision" }>["options"][number]) => void) => set((x) => x.type === "decision" && fn(x.options[i]));
  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <Field label="Question to the learner">
        <input className={input} value={c.prompt} onChange={(e) => set((x) => x.type === "decision" && void (x.prompt = e.target.value))} />
      </Field>
      <p className="text-sm font-semibold">Choices</p>
      {c.options.map((o, i) => (
        <div key={o.id} className={cx("grid gap-2 rounded-2xl border p-3 sm:grid-cols-2", o.correct ? "border-action" : "border-line")}>
          <input
            className={cx(input, "sm:col-span-2")}
            placeholder={`Choice ${i + 1}`}
            value={o.label}
            onChange={(e) => opt(i, (x) => void (x.label = e.target.value))}
          />
          <select
            className={input}
            value={o.stay ? "__stay" : (o.next ?? "")}
            onChange={(e) =>
              opt(i, (x) => (e.target.value === "__stay" ? ((x.stay = true), (x.next = undefined)) : ((x.stay = false), (x.next = e.target.value))))
            }
            aria-label="What happens next"
          >
            <option value="__stay">Stay here and show feedback</option>
            {others.map((n) => (
              <option key={n.id} value={n.id}>
                Go to: {n.heading || n.id}
              </option>
            ))}
          </select>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-[var(--action)]"
              checked={Boolean(o.correct)}
              onChange={(e) => opt(i, (x) => void (x.correct = e.target.checked))}
            />
            Better choice (scored on first try)
          </label>
          <textarea
            rows={2}
            className={cx(textarea, "sm:col-span-2")}
            placeholder="Feedback (**bold** and *italic* work here)"
            value={o.feedback ?? ""}
            onChange={(e) => opt(i, (x) => void (x.feedback = e.target.value))}
          />
        </div>
      ))}
      <button
        type="button"
        className={cx(btn.quiet, "self-start")}
        onClick={() => set((x) => x.type === "decision" && void x.options.push({ id: `o${x.options.length + 1}`, label: "", stay: true, feedback: "" }))}
      >
        <Icon name="plus" className="size-4" /> Add choice
      </button>
    </div>
  );
}

function QuizFields({ card: c, set }: { card: Extract<Card, { type: "quiz" }>; set: (fn: (c: Card) => void) => void }) {
  const q = (i: number, fn: (q: Extract<Card, { type: "quiz" }>["questions"][number]) => void) => set((x) => x.type === "quiz" && fn(x.questions[i]));
  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-[var(--action)]"
            checked={Boolean(c.assessment)}
            onChange={(e) =>
              set((x) => {
                if (x.type !== "quiz") return;
                if (e.target.checked) x.assessment = { passMark: 80 };
                else delete x.assessment;
              })
            }
          />
          Assessment mode
        </label>
        <p className="text-xs text-ink-muted">
          For compliance training. Learners answer every question, then it’s marked all at once against a pass mark, with feedback only once they pass.
          Questions and answers are shuffled for each attempt, and every attempt’s score shows in Completions.
        </p>
        {c.assessment && (
          <label className="flex items-center gap-2 text-sm">
            Pass mark
            <input
              type="number"
              min={1}
              max={100}
              className={cx(input, "max-w-24")}
              value={c.assessment.passMark}
              onChange={(e) =>
                set((x) => x.type === "quiz" && x.assessment && void (x.assessment.passMark = Math.min(100, Math.max(1, Number(e.target.value) || 0))))
              }
            />
            %
          </label>
        )}
      </div>
      {c.questions.map((qu, i) => (
        <fieldset key={qu.id} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">Question {i + 1}</legend>
          <input className={input} placeholder="Question" value={qu.prompt} onChange={(e) => q(i, (x) => void (x.prompt = e.target.value))} />
          {qu.options.map((o, j) => (
            <div key={o.id} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${c.id}-${qu.id}`}
                className="size-5 accent-[var(--action)]"
                checked={qu.correct === o.id}
                onChange={() => q(i, (x) => void (x.correct = o.id))}
                aria-label="Correct answer"
              />
              <input
                className={input}
                placeholder={`Answer ${j + 1}`}
                value={o.label}
                onChange={(e) => q(i, (x) => void (x.options[j].label = e.target.value))}
              />
            </div>
          ))}
          <button
            type="button"
            className={cx(btn.quiet, "self-start")}
            onClick={() => q(i, (x) => void x.options.push({ id: String.fromCharCode(97 + x.options.length), label: "" }))}
          >
            <Icon name="plus" className="size-4" /> Add answer
          </button>
          <div className="grid gap-2 sm:grid-cols-2">
            <textarea
              rows={2}
              className={textarea}
              placeholder="Feedback when right"
              value={qu.feedback.correct}
              onChange={(e) => q(i, (x) => void (x.feedback.correct = e.target.value))}
            />
            <textarea
              rows={2}
              className={textarea}
              placeholder="Feedback when wrong"
              value={qu.feedback.incorrect}
              onChange={(e) => q(i, (x) => void (x.feedback.incorrect = e.target.value))}
            />
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className={cx(btn.quiet, "self-start")}
        onClick={() =>
          set(
            (x) =>
              x.type === "quiz" &&
              void x.questions.push({
                id: `q${x.questions.length + 1}`,
                prompt: "",
                options: [
                  { id: "a", label: "" },
                  { id: "b", label: "" },
                ],
                correct: "a",
                feedback: { correct: "", incorrect: "" },
              }),
          )
        }
      >
        <Icon name="plus" className="size-4" /> Add question
      </button>
    </div>
  );
}

type ChecklistCard = Extract<Card, { type: "checklist" }>;

/** Checklist settings: each item, its optional note, and whether every item must be ticked. */
function ChecklistFields({ card: c, set }: { card: ChecklistCard; set: (fn: (c: Card) => void) => void }) {
  const upd = (fn: (x: ChecklistCard) => void) => set((x) => x.type === "checklist" && void fn(x));
  return (
    <>
      <Field label="What the list is for" hint="Shown above the items, e.g. “Before I leave, I…”." className="sm:col-span-2">
        <input className={input} value={c.prompt} onChange={(e) => upd((x) => void (x.prompt = e.target.value))} />
      </Field>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <p className="text-sm font-semibold">Items</p>
        {c.items.map((item, i) => (
          <div key={item.id} className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-2">
            <Field label={`Item ${i + 1}`}>
              <input className={input} value={item.text} onChange={(e) => upd((x) => void (x.items[i].text = e.target.value))} />
            </Field>
            <Field label="Note" hint="Optional. Shows under the item once it’s ticked.">
              <input
                className={input}
                value={item.note ?? ""}
                onChange={(e) =>
                  upd((x) => {
                    if (e.target.value) x.items[i].note = e.target.value;
                    else delete x.items[i].note;
                  })
                }
              />
            </Field>
            <div className="flex gap-1 sm:col-span-2">
              <button type="button" className={btn.quiet} disabled={i === 0} onClick={() => upd((x) => void x.items.splice(i - 1, 0, ...x.items.splice(i, 1)))}>
                Move up
              </button>
              <button
                type="button"
                className={btn.quiet}
                disabled={i === c.items.length - 1}
                onClick={() => upd((x) => void x.items.splice(i + 1, 0, ...x.items.splice(i, 1)))}
              >
                Move down
              </button>
              <button
                type="button"
                className={cx(btn.quiet, "ml-auto text-danger")}
                disabled={c.items.length <= 1}
                onClick={() => upd((x) => void x.items.splice(i, 1))}
              >
                <Icon name="trash" className="size-4" /> Remove
              </button>
            </div>
          </div>
        ))}
        {c.items.length < 10 && (
          <button
            type="button"
            className={cx(btn.secondary, "self-start")}
            onClick={() =>
              upd((x) => {
                let n = x.items.length + 1;
                while (x.items.some((it) => it.id === `i${n}`)) n++;
                x.items.push({ id: `i${n}`, text: "" });
              })
            }
          >
            <Icon name="plus" className="size-4" /> Add an item
          </button>
        )}
      </div>
      <label className="flex items-start gap-3 sm:col-span-2">
        <input
          type="checkbox"
          className="mt-0.5 size-5 accent-[var(--action)]"
          checked={Boolean(c.requireAll)}
          onChange={(e) => upd((x) => (e.target.checked ? void (x.requireAll = true) : void delete x.requireAll))}
        />
        <span>
          <span className="font-semibold">Tick every item to continue</span>
          <span className="block text-sm text-ink-muted">Otherwise it’s a reference list: learners can tick items but don’t have to.</span>
        </span>
      </label>
    </>
  );
}

type ResourcesCard = Extract<Card, { type: "resources" }>;

/** Resources card settings: the drawer's name and each PDF, website or toolkit in it. */
function ResourcesFields({ card: c, set }: { card: ResourcesCard; set: (fn: (c: Card) => void) => void }) {
  const upd = (fn: (x: ResourcesCard) => void) => set((x) => x.type === "resources" && void fn(x));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const add = () =>
    upd((x) => {
      let n = x.items.length + 1;
      while (x.items.some((i) => i.id === `r${n}`)) n++;
      x.items.push({ id: `r${n}`, kind: "link", title: "", url: "" });
    });
  const shift = (i: number, by: -1 | 1) => upd((x) => void x.items.splice(i + by, 0, ...x.items.splice(i, 1)));
  return (
    <>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <p className="text-sm font-semibold">Files and links</p>
        {error && <ErrorNote text={error} />}
        {c.items.map((item, i) => {
          const uploaded = item.url.startsWith("/api/uploads/");
          return (
            <div key={item.id} className="grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-[9rem_1fr]">
              <Field label="Type">
                <select className={input} value={item.kind} onChange={(e) => upd((x) => void (x.items[i].kind = e.target.value as typeof item.kind))}>
                  {Object.entries(RESOURCE_KINDS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Title">
                <input className={input} value={item.title} onChange={(e) => upd((x) => void (x.items[i].title = e.target.value))} />
              </Field>
              <Field label={item.kind === "pdf" ? "PDF" : "Web address"} className="sm:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  {uploaded ? (
                    <span className="flex min-h-11 flex-1 items-center gap-2 rounded-xl bg-muted px-3 text-sm">
                      <Icon name="file" className="size-4 shrink-0 text-accent" /> Uploaded PDF{item.bytes ? ` · ${fileSize(item.bytes)}` : ""}
                      <a href={item.url} target="_blank" rel="noreferrer" className="ml-auto font-semibold text-accent hover:underline">
                        Open
                      </a>
                    </span>
                  ) : (
                    <input
                      className={cx(input, "min-w-48 flex-1")}
                      value={item.url}
                      placeholder="https://"
                      onChange={(e) => upd((x) => void (x.items[i].url = e.target.value.trim()))}
                    />
                  )}
                  {item.kind === "pdf" && (
                    <label className={cx(btn.secondary, "cursor-pointer", busy === item.id && "cursor-wait opacity-60")}>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="sr-only"
                        disabled={busy !== null}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          setBusy(item.id);
                          setError(null);
                          try {
                            const r = await uploadPdf(file);
                            upd((x) => {
                              x.items[i].url = r.src;
                              x.items[i].bytes = r.bytes;
                              if (!x.items[i].title.trim()) x.items[i].title = file.name.replace(/\.pdf$/i, "");
                            });
                          } catch (err) {
                            setError((err as Error).message);
                          } finally {
                            setBusy(null);
                          }
                        }}
                      />
                      <Icon name="upload" className="size-4" /> {busy === item.id ? "Uploading…" : uploaded ? "Replace PDF" : "Upload a PDF"}
                    </label>
                  )}
                  {uploaded && (
                    <button
                      type="button"
                      className={btn.quiet}
                      onClick={() =>
                        upd((x) => {
                          x.items[i].url = "";
                          delete x.items[i].bytes;
                        })
                      }
                    >
                      Use a link instead
                    </button>
                  )}
                </div>
              </Field>
              <Field label="Published by" hint="Optional.">
                <input className={input} value={item.source ?? ""} onChange={(e) => upd((x) => void (x.items[i].source = e.target.value))} />
              </Field>
              <Field label="Short note" hint="Optional. Shown when a learner opens the details.">
                <input className={input} value={item.description ?? ""} onChange={(e) => upd((x) => void (x.items[i].description = e.target.value))} />
              </Field>
              <div className="flex flex-wrap gap-1 sm:col-span-2">
                <button type="button" className={btn.quiet} disabled={i === 0} onClick={() => shift(i, -1)}>
                  Move up
                </button>
                <button type="button" className={btn.quiet} disabled={i === c.items.length - 1} onClick={() => shift(i, 1)}>
                  Move down
                </button>
                <button
                  type="button"
                  className={cx(btn.quiet, "ml-auto text-danger")}
                  disabled={c.items.length <= 1}
                  onClick={() => upd((x) => void x.items.splice(i, 1))}
                >
                  <Icon name="trash" className="size-4" /> Remove
                </button>
              </div>
            </div>
          );
        })}
        {c.items.length < 12 && (
          <button type="button" className={cx(btn.secondary, "self-start")} onClick={add}>
            <Icon name="plus" className="size-4" /> Add a resource
          </button>
        )}
      </div>
    </>
  );
}

type HotspotCard = Extract<Card, { type: "hotspot" }>;

/** Hotspot card settings: the picture, the spots on it, and how learners find them. */
function HotspotFields({ card: c, set }: { card: HotspotCard; set: (fn: (c: Card) => void) => void }) {
  const upd = (fn: (x: HotspotCard) => void) => set((x) => x.type === "hotspot" && void fn(x));
  const [picking, setPicking] = useState(!c.image);
  const [pexels, setPexels] = useState(false);
  const [selected, setSelected] = useState<string | null>(c.spots[0]?.id ?? null);
  const library = useLibrary();
  const box = useRef<HTMLDivElement>(null);
  // The spot being dragged; the picture follows the pointer (captured by the spot's button).
  const drag = useRef<{ id: string } | null>(null);
  const spot = c.spots.find((s) => s.id === selected);
  const index = c.spots.findIndex((s) => s.id === selected);

  const choose = (p: Photo, alt = "") => {
    upd((x) => {
      x.image = { src: p.src, width: p.width, height: p.height, alt: x.image?.alt || alt, ...(p.credit ? { credit: p.credit } : {}) };
    });
    setPicking(false);
    setPexels(false);
  };
  /** Where a pointer is on the picture, as percentages. */
  const at = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    const clamp = (n: number) => Math.round(Math.max(1, Math.min(99, n)) * 10) / 10;
    return { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) };
  };
  const addAt = (p: { x: number; y: number }) => {
    let n = c.spots.length + 1;
    while (c.spots.some((s) => s.id === `s${n}`)) n++;
    const id = `s${n}`;
    upd((x) => void x.spots.push({ id, ...p, r: 7, label: "", text: "" }));
    setSelected(id);
  };

  return (
    <>
      <Field label="Instruction" hint="What learners should do, e.g. “Find the three hazards in this kitchen”." className="sm:col-span-2">
        <input className={input} value={c.prompt} onChange={(e) => upd((x) => void (x.prompt = e.target.value))} />
      </Field>

      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="text-sm font-semibold">How it works</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["explore", "Explore", "Each spot has a marker. Learners tap them to reveal a note."],
              ["find", "Find", "No markers. Learners tap where they think it is. A hint appears after three misses."],
            ] as const
          ).map(([mode, label, hint]) => (
            <label
              key={mode}
              className={cx("flex cursor-pointer gap-3 rounded-2xl border-2 p-3", c.mode === mode ? "border-action bg-tealtint" : "border-line-strong")}
            >
              <input
                type="radio"
                name={`${c.id}-mode`}
                className="mt-1 accent-[var(--action)]"
                checked={c.mode === mode}
                onChange={() => upd((x) => void (x.mode = mode))}
              />
              <span>
                <span className="font-semibold">{label}</span>
                <span className="block text-sm text-ink-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Picture</p>
          {c.image && (
            <button type="button" className={btn.quiet} onClick={() => setPicking((p) => !p)}>
              <Icon name="image" className="size-4" /> {picking ? "Keep this picture" : "Change picture"}
            </button>
          )}
        </div>
        {picking && (
          <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-expanded={pexels}
                onClick={() => setPexels((o) => !o)}
                className="flex min-h-11 items-center gap-1 rounded-xl border-2 border-dashed border-line-strong px-3 text-xs font-semibold text-ink-muted hover:border-action hover:text-ink"
              >
                <Icon name="search" className="size-4" /> Find on Pexels
              </button>
              <UploadTile className="w-auto [&_label]:flex-row [&_label]:px-3" onUploaded={(p) => (choose(p), library.reload())}>
                Upload an image
              </UploadTile>
            </div>
            {pexels && <PexelsPicker onClose={() => setPexels(false)} onPicked={(p, alt) => (choose(p, alt), library.reload())} />}
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {library.photos.map((p) => (
                <button
                  key={p.src}
                  type="button"
                  onClick={() => choose(p)}
                  className={cx("aspect-[4/3] overflow-hidden rounded-xl border-2", c.image?.src === p.src ? "border-action" : "border-transparent")}
                  aria-label={`Use ${p.src.split("/").pop()}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
        {c.image && (
          <>
            <p className="text-sm text-ink-muted">Click the picture to add a spot. Drag a spot to move it.</p>
            <div
              ref={box}
              className="relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded-2xl bg-muted"
              style={{ aspectRatio: `${c.image.width} / ${c.image.height}` }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("[data-spot]")) return;
                if (c.spots.length < 12) addAt(at(e));
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                const p = at(e);
                upd((x) => {
                  const s = x.spots.find((s) => s.id === d.id);
                  if (s) Object.assign(s, p);
                });
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerLeave={() => (drag.current = null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image.src} alt="" className="pointer-events-none absolute inset-0 size-full object-cover" draggable={false} />
              {c.spots.map((s, i) => (
                <span
                  key={s.id}
                  data-spot
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${2 * s.r}%`, aspectRatio: "1" }}
                >
                  {/* The tap area learners get. */}
                  <span
                    aria-hidden
                    className={cx(
                      "absolute inset-0 rounded-full border-2 border-dashed",
                      selected === s.id ? "border-white bg-white/25" : "border-white/70 bg-white/10",
                    )}
                  />
                  <button
                    type="button"
                    aria-label={`Spot ${i + 1}${s.label ? `: ${s.label}` : ""}. Drag to move`}
                    aria-pressed={selected === s.id}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                      drag.current = { id: s.id };
                      setSelected(s.id);
                    }}
                    onPointerUp={() => (drag.current = null)}
                    className={cx(
                      "absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 cursor-grab place-items-center rounded-full font-mulish text-sm font-extrabold shadow-lg ring-2 ring-white active:cursor-grabbing",
                      selected === s.id ? "bg-gold text-[#0a1a2e]" : "bg-action text-on-action",
                    )}
                  >
                    {i + 1}
                  </button>
                </span>
              ))}
            </div>
            <Field label="Picture description" hint="For people who can’t see the picture. Don’t give away where the spots are.">
              <input className={input} value={c.image.alt} onChange={(e) => upd((x) => x.image && void (x.image.alt = e.target.value))} />
            </Field>
          </>
        )}
      </div>

      {c.spots.length > 0 && (
        <div className="flex flex-col gap-3 sm:col-span-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Spots">
            {c.spots.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={selected === s.id}
                onClick={() => setSelected(s.id)}
                className={cx(
                  "min-h-9 rounded-full border px-3 text-sm",
                  selected === s.id ? "border-action bg-tealtint font-semibold" : "border-line-strong hover:bg-muted",
                  !s.label.trim() && "italic text-ink-muted",
                )}
              >
                {i + 1}. {s.label.trim() || "No label yet"}
              </button>
            ))}
          </div>
          {spot && (
            <div className="grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-2">
              <Field label={`Spot ${index + 1}: label`} hint="Shown as the note’s title, e.g. “Trip hazard”.">
                <input className={input} value={spot.label} onChange={(e) => upd((x) => void (x.spots[index].label = e.target.value))} />
              </Field>
              <Field label="Tap area size" hint="Bigger is easier to find.">
                <input
                  type="range"
                  min={4}
                  max={18}
                  value={spot.r}
                  onChange={(e) => upd((x) => void (x.spots[index].r = Number(e.target.value)))}
                  className="w-full accent-[var(--action)]"
                />
              </Field>
              <Field label="What it reveals" hint="A sentence or two." className="sm:col-span-2">
                <textarea rows={2} className={textarea} value={spot.text} onChange={(e) => upd((x) => void (x.spots[index].text = e.target.value))} />
              </Field>
              <button
                type="button"
                className={cx(btn.quiet, "justify-self-start text-danger")}
                onClick={() => {
                  upd((x) => void x.spots.splice(index, 1));
                  setSelected(c.spots[index + 1]?.id ?? c.spots[index - 1]?.id ?? null);
                }}
              >
                <Icon name="trash" className="size-4" /> Remove this spot
              </button>
            </div>
          )}
          <Field label="To continue, learners find" className="sm:col-span-2">
            <select
              className={input}
              value={c.required && c.required < c.spots.length ? c.required : ""}
              onChange={(e) => upd((x) => void (e.target.value ? (x.required = Number(e.target.value)) : delete x.required))}
            >
              <option value="">All {c.spots.length} spots</option>
              {Array.from({ length: c.spots.length - 1 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  At least {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </>
  );
}

/** Settings for a written answer card: what the AI is told, the pass rule, and a place to try it out. */
function WrittenFields({ lesson: l, card: c, set }: { lesson: Lesson; card: Extract<Card, { type: "written" }>; set: (fn: (c: Card) => void) => void }) {
  const upd = (fn: (x: Extract<Card, { type: "written" }>) => void) => set((x) => x.type === "written" && void fn(x));
  return (
    <>
      <Field label="Question" className="sm:col-span-2">
        <textarea rows={2} className={textarea} value={c.prompt} onChange={(e) => upd((x) => void (x.prompt = e.target.value))} />
      </Field>
      <Field label="Hint inside the answer box" hint="Optional." className="sm:col-span-2">
        <input className={input} value={c.placeholder ?? ""} onChange={(e) => upd((x) => void (x.placeholder = e.target.value))} />
      </Field>
      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="text-sm font-semibold">What a good answer covers</legend>
        <p className="text-sm text-ink-muted">
          The AI marks each one as covered, partly covered or not yet, and learners see that list. Write them as you’d explain them to a learner.
        </p>
        {c.criteria.map((cr, i) => (
          <div key={cr.id} className="flex items-start gap-2">
            <span className="mt-2.5 grid size-6 shrink-0 place-items-center rounded-full bg-action text-xs font-bold text-on-action">{i + 1}</span>
            <textarea
              rows={2}
              className={textarea}
              value={cr.text}
              placeholder="For example: Says they’d check with the care coordinator before agreeing"
              onChange={(e) => upd((x) => void (x.criteria[i].text = e.target.value))}
            />
            <button
              type="button"
              className={cx(btn.quiet, "mt-1.5")}
              aria-label={`Remove criterion ${i + 1}`}
              disabled={c.criteria.length <= 1}
              onClick={() => upd((x) => void x.criteria.splice(i, 1))}
            >
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        ))}
        {c.criteria.length < 6 && (
          <button
            type="button"
            className={cx(btn.secondary, "self-start")}
            onClick={() =>
              upd((x) => {
                let n = x.criteria.length + 1;
                while (x.criteria.some((cr) => cr.id === `c${n}`)) n++;
                x.criteria.push({ id: `c${n}`, text: "" });
              })
            }
          >
            <Icon name="plus" className="size-4" /> Add a criterion
          </button>
        )}
      </fieldset>
      <Field
        label="Notes for the AI"
        hint="Private. Context and how to judge: what to accept, what doesn’t matter, words learners might use. Learners never see this."
        className="sm:col-span-2"
      >
        <textarea
          rows={3}
          className={textarea}
          value={c.guidance ?? ""}
          placeholder="For example: Accept “coordinator”, “care partner” or “Trilogy” as the person to check with. Don’t mark down spelling."
          onChange={(e) => upd((x) => void (x.guidance = e.target.value))}
        />
      </Field>
      <Field label="Example of a strong answer" hint="Optional. Helps the AI judge answers." className="sm:col-span-2">
        <textarea rows={3} className={textarea} value={c.example ?? ""} onChange={(e) => upd((x) => void (x.example = e.target.value))} />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          className="size-5 accent-[var(--action)]"
          checked={Boolean(c.showExample)}
          disabled={!c.example?.trim()}
          onChange={(e) => upd((x) => void (x.showExample = e.target.checked))}
        />
        Show the example to learners after they get feedback
      </label>
      <Field label="Shortest answer" hint="In words.">
        <input
          type="number"
          min={1}
          max={200}
          className={input}
          value={c.minWords ?? 10}
          onChange={(e) => upd((x) => void (x.minWords = Math.max(1, Math.min(200, Number(e.target.value) || 1))))}
        />
      </Field>
      <div />
      <label className="flex items-start gap-3 sm:col-span-2">
        <input
          type="checkbox"
          className="mt-0.5 size-5 accent-[var(--action)]"
          checked={Boolean(c.mustPass)}
          onChange={(e) => upd((x) => void (x.mustPass = e.target.checked))}
        />
        <span>
          <span className="font-semibold">Must cover every criterion to continue</span>
          <span className="block text-sm text-ink-muted">Otherwise checking once is enough. If AI feedback isn’t available, learners can always carry on.</span>
        </span>
      </label>
      {c.mustPass && (
        <Field label="Tries before they can move on anyway" hint="So nobody gets stuck.">
          <input
            type="number"
            min={1}
            max={10}
            className={input}
            value={c.maxAttempts ?? 3}
            onChange={(e) => upd((x) => void (x.maxAttempts = Math.max(1, Math.min(10, Number(e.target.value) || 1))))}
          />
        </Field>
      )}
      <WrittenTryIt lesson={l} card={c} />
    </>
  );
}

/** Try a sample answer against the card as it is now, saved or not, and see what learners would get. */
function WrittenTryIt({ lesson: l, card: c }: { lesson: Lesson; card: Extract<Card, { type: "written" }> }) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WrittenResult | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<WrittenResult>("/api/admin/written-test", { body: { lessonTitle: l.title, outcome: l.outcome, card: c, answer } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-line-strong p-3 sm:col-span-2">
      <p className="flex items-center gap-1.5 font-semibold">
        <Icon name="spark" className="size-4 text-accent" /> Try it
      </p>
      <p className="text-sm text-ink-muted">
        Write an answer a learner might give and see the feedback they’d get. Try a weak one too, to check the criteria catch it.
      </p>
      <textarea rows={3} className={textarea} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="A sample answer" />
      <button type="button" className={cx(btn.primary, "self-start")} onClick={run} disabled={busy || !answer.trim()}>
        {busy ? "Checking…" : "Check this answer"}
      </button>
      {error && <ErrorNote text={error} />}
      {result?.unavailable && <p className="rounded-xl bg-orange/10 p-3 text-sm">{result.message}</p>}
      {result && !result.unavailable && <WrittenFeedback result={result} criteria={c.criteria} />}
    </div>
  );
}

function SummaryFields({ card: c, set }: { card: Extract<Card, { type: "summary" }>; set: (fn: (c: Card) => void) => void }) {
  return (
    <>
      <Field label="Recap points" hint="One per line." className="sm:col-span-2">
        <textarea
          rows={4}
          className={textarea}
          value={(c.points ?? []).join("\n")}
          onChange={(e) => set((x) => x.type === "summary" && void (x.points = e.target.value.split("\n")))}
        />
      </Field>
      <Field
        label="Action to take"
        hint="What the learner does next on the job. Format words on the card, or here with **bold**, *italic* and [words](https://link)."
        className="sm:col-span-2"
      >
        <input className={input} value={c.action} onChange={(e) => set((x) => x.type === "summary" && void (x.action = e.target.value))} />
      </Field>
      <div className="sm:col-span-2">
        <p className="text-sm font-semibold">Official resources</p>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {(c.references ?? (c.reference ? [c.reference] : [])).map((r) => (
            <li key={r.url} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
              <Icon name="external" className="size-4 text-accent" /> {r.title} <span className="text-ink-muted">· {r.issuer}</span>
            </li>
          ))}
        </ul>
        <button type="button" className={cx(btn.quiet, "mt-1")} disabled title="Demo">
          <Icon name="plus" className="size-4" /> Add resource
        </button>
      </div>
    </>
  );
}

type Figure = NonNullable<Card["figure"]>;

/** The in-text picture on a canvas card: a small preview that opens the card's settings. */
function CanvasFigure({ figure: f, onEdit }: { figure: Figure; onEdit?: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="group relative block w-full overflow-hidden rounded-xl bg-muted"
      style={{ aspectRatio: f.fit === "fill" ? "16 / 9" : `${f.width} / ${f.height}`, maxHeight: f.fit === "fill" ? undefined : "9rem" }}
      aria-label={`Picture in the text${f.alt ? `: ${f.alt}` : ""}. Edit in the card settings.`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={f.src} alt="" className={cx("size-full", f.fit === "fill" ? "object-cover" : "object-contain")} />
      {!f.alt && <span className="absolute left-1.5 top-1.5 rounded-full bg-orange px-2 py-0.5 text-[0.65rem] font-bold text-[#102a43]">Needs alt</span>}
      {f.animated && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[0.65rem] font-bold text-white">GIF</span>}
    </button>
  );
}

/**
  A picture inside the card's text, as content (a diagram, a form, a screenshot, a photo to talk
  about). Separate from the card visual at the top or behind the card.
*/
function FigureField({ card: c, set }: { card: Card; set: (fn: (c: Card) => void) => void }) {
  const f = c.figure;
  const library = useLibrary();
  const [source, setSource] = useState<"library" | "pexels" | "giphy" | null>(null);
  const upd = (fn: (x: Figure) => void) => set((x) => void (x.figure && fn(x.figure)));
  const choose = (p: Photo, suggestedAlt = "") => {
    set((x) => {
      x.figure = {
        src: p.src,
        width: p.width,
        height: p.height,
        // A new picture needs its own description: the old one would describe the wrong image.
        alt: x.figure?.src === p.src ? x.figure.alt : suggestedAlt,
        ...(x.figure?.caption ? { caption: x.figure.caption } : {}),
        ...(p.credit ? { credit: p.credit } : {}),
        ...(p.animated ? { animated: p.animated } : {}),
        ...(x.figure?.placement ? { placement: x.figure.placement } : {}),
        ...(x.figure?.fit ? { fit: x.figure.fit } : {}),
      };
    });
    setSource(null);
  };
  const toggle = (k: NonNullable<typeof source>) => setSource((o) => (o === k ? null : k));
  const sourceButton =
    "flex min-h-11 items-center gap-1 rounded-xl border-2 border-dashed border-line-strong px-3 text-xs font-semibold text-ink-muted hover:border-action hover:text-ink";

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div>
        <p className="text-sm font-semibold">Picture in the text</p>
        <p className="text-sm text-ink-muted">
          An image that’s part of the content, such as a diagram, a form or a screenshot. It sits with the text, not behind it.
        </p>
      </div>
      {f && (
        <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div
            className="relative overflow-hidden rounded-xl bg-muted"
            style={{ aspectRatio: f.fit === "fill" ? "16 / 9" : `${f.width} / ${f.height}`, maxHeight: "12rem" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.src} alt="" className={cx("size-full", f.fit === "fill" ? "object-cover" : "object-contain")} />
          </div>
          <div className="flex flex-col gap-2">
            <Field label="Alt text" hint="What the picture shows, for people using a screen reader.">
              <input className={input} value={f.alt} onChange={(e) => upd((x) => void (x.alt = e.target.value))} />
            </Field>
            <Field label="Caption (optional)" hint="Shown under the picture.">
              <input className={input} value={f.caption ?? ""} onChange={(e) => upd((x) => void (x.caption = e.target.value || undefined))} />
            </Field>
          </div>
        </div>
      )}
      {f && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {(
            [
              [
                "Where",
                "placement",
                [
                  ["below", "Under the text"],
                  ["above", "Above the text"],
                ],
              ],
              [
                "Size",
                "fit",
                [
                  ["whole", "Show the whole picture"],
                  ["full", "Edge to edge"],
                  ["fill", "Wide, cropped"],
                ],
              ],
            ] as const
          ).map(([label, key, options]) => (
            <div key={key} className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
              <span className="text-sm text-ink-muted">{label}</span>
              {options.map(([value, text], i) => {
                const on = (f[key] ?? options[0][0]) === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => upd((x) => void ((x as Record<string, unknown>)[key] = i === 0 ? undefined : value))}
                    className={cx(
                      "min-h-9 rounded-full border px-3 text-sm",
                      on ? "border-action bg-tealtint font-semibold" : "border-line-strong hover:bg-muted",
                    )}
                  >
                    {text}
                  </button>
                );
              })}
            </div>
          ))}
          <button type="button" className={cx(btn.quiet, "text-danger")} onClick={() => set((x) => void delete x.figure)}>
            <Icon name="trash" className="size-4" /> Remove picture
          </button>
        </div>
      )}
      {f?.credit && (
        <p className="text-xs text-ink-muted">
          {f.animated ? "GIF" : "Photo"} by{" "}
          <a href={f.credit.page ?? f.credit.url} target="_blank" rel="noreferrer" className="underline">
            {f.credit.name}
          </a>{" "}
          on {f.credit.source}.{f.credit.source === "GIPHY" && " The credit shows on the picture."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <UploadTile className="w-auto [&_label]:flex-row [&_label]:px-3" onUploaded={(p) => (choose(p), library.reload())}>
          {f ? "Upload a different image" : "Upload an image"}
        </UploadTile>
        <button type="button" aria-expanded={source === "library"} onClick={() => toggle("library")} className={sourceButton}>
          <Icon name="image" className="size-4" /> Image library
        </button>
        <button type="button" aria-expanded={source === "pexels"} onClick={() => toggle("pexels")} className={sourceButton}>
          <Icon name="search" className="size-4" /> Find on Pexels
        </button>
        <button type="button" aria-expanded={source === "giphy"} onClick={() => toggle("giphy")} className={sourceButton}>
          <Icon name="spark" className="size-4" /> Find a GIF
        </button>
      </div>
      {source === "library" && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {library.photos.map((p) => (
            <button
              key={p.src}
              type="button"
              onClick={() => choose(p)}
              className={cx("aspect-[4/3] overflow-hidden rounded-xl border-2", f?.src === p.src ? "border-action" : "border-transparent")}
              aria-label={`Use ${p.src.split("/").pop()}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {source === "pexels" && <PexelsPicker onClose={() => setSource(null)} onPicked={(p, alt) => (choose(p, alt), library.reload())} />}
      {source === "giphy" && <GiphyPicker onClose={() => setSource(null)} onPicked={(p, alt) => choose(p, alt)} />}
    </div>
  );
}

/**
  A PDF inside the card's text (a form, a policy, a fact sheet). Learners read it inside the lesson;
  Required reading keeps Continue locked until they've opened it, or reached its last page.
*/
function DocumentField({ card: c, set }: { card: Card; set: (fn: (c: Card) => void) => void }) {
  const d = c.pdf;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upd = (fn: (x: NonNullable<Card["pdf"]>) => void) => set((x) => void (x.pdf && fn(x.pdf)));
  const options = (label: string, key: "placement" | "required", list: readonly (readonly [string | undefined, string])[]) => (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="text-sm text-ink-muted">{label}</span>
      {list.map(([value, text]) => {
        const on = (d?.[key] ?? undefined) === value || (!d?.[key] && value === list[0][0]);
        return (
          <button
            key={text}
            type="button"
            aria-pressed={on}
            onClick={() => upd((x) => void ((x as Record<string, unknown>)[key] = value === list[0][0] ? undefined : value))}
            className={cx("min-h-9 rounded-full border px-3 text-sm", on ? "border-action bg-tealtint font-semibold" : "border-line-strong hover:bg-muted")}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div>
        <p className="text-sm font-semibold">Document in the text</p>
        <p className="text-sm text-ink-muted">
          A PDF learners read inside the topic, such as a form, a policy or a fact sheet. It shows as a tile with its first page. For a list of files to keep,
          use a Resources card.
        </p>
      </div>
      {d && (
        <>
          <Field label="Title" hint="What learners see on the tile.">
            <input className={input} value={d.title} onChange={(e) => upd((x) => void (x.title = e.target.value))} />
          </Field>
          <div className="flex flex-col gap-2">
            {options("Where", "placement", [
              [undefined, "Under the text"],
              ["above", "Above the text"],
            ])}
            {options("Required reading", "required", [
              [undefined, "Not required"],
              ["open", "Must open it"],
              ["end", "Must read to the last page"],
            ])}
          </div>
          <p className="text-xs text-ink-muted">
            {d.bytes ? `${formatBytes(d.bytes)} · ` : ""}
            <a href={d.src} target="_blank" rel="noreferrer" className="underline">
              Open the PDF
            </a>
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <label className={cx(btn.secondary, "cursor-pointer", busy && "cursor-wait opacity-60")}>
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              setError(null);
              try {
                const r = await uploadPdf(file);
                set((x) => {
                  x.pdf = {
                    ...(x.pdf ?? {}),
                    src: r.src,
                    bytes: r.bytes,
                    title: x.pdf?.title || file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "),
                  };
                });
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
          <Icon name="upload" className="size-4" /> {busy ? "Uploading…" : d ? "Replace the PDF" : "Upload a PDF"}
        </label>
        {d && (
          <button type="button" className={cx(btn.quiet, "text-danger")} onClick={() => set((x) => void delete x.pdf)}>
            <Icon name="trash" className="size-4" /> Remove document
          </button>
        )}
      </div>
      {error && <ErrorNote text={error} />}
    </div>
  );
}

function KeyPointsField({ card: c, set }: { card: Card; set: (fn: (c: Card) => void) => void }) {
  const kp = c.keyPoints;
  return (
    <div className="sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Key points</p>
        <div className="flex gap-1" role="group" aria-label="Key points style">
          {(["none", "chips", "tiles"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={(kp?.style ?? "none") === s}
              className={cx("min-h-9 rounded-full px-3 text-sm", (kp?.style ?? "none") === s ? "bg-action text-on-action" : "hover:bg-muted")}
              onClick={() => set((x) => void (x.keyPoints = s === "none" ? undefined : { ...(x.keyPoints ?? { items: [{ text: "" }] }), style: s }))}
            >
              {s === "none" ? "None" : s === "chips" ? "Chips" : "Tiles"}
            </button>
          ))}
        </div>
      </div>
      {kp && (
        <div className="mt-2 flex flex-col gap-2">
          {kp.items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <IconPick value={it.icon} onChange={(icon) => set((x) => void (x.keyPoints!.items[i].icon = icon))} />
              <input
                className={input}
                value={it.text}
                placeholder={`Point ${i + 1}`}
                aria-label={`Point ${i + 1}`}
                onChange={(e) => set((x) => void (x.keyPoints!.items[i].text = e.target.value))}
              />
              <button
                type="button"
                aria-label={`Remove point ${i + 1}`}
                onClick={() => set((x) => void x.keyPoints!.items.splice(i, 1))}
                className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-muted hover:text-ink"
              >
                <Icon name="trash" className="size-4" />
              </button>
            </div>
          ))}
          <p className="text-xs text-ink-muted">Format words on the card itself, or here with **bold**, *italic* and [words](https://link).</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.quiet} onClick={() => set((x) => void x.keyPoints!.items.push({ text: "" }))}>
              <Icon name="plus" className="size-4" /> Add point
            </button>
            <ClaudeButton>Suggest from the script</ClaudeButton>
          </div>
        </div>
      )}
    </div>
  );
}

/** Paste a YouTube or Synthesia link. Says whether it was recognised, so a link never silently fails. */
function VideoLinkField({ video, set }: { video: Extract<Visual, { kind: "presenter" }>["video"]; set: (fn: (c: Card) => void) => void }) {
  const [text, setText] = useState(video && video.provider !== "elevenlabs" ? videoLinkFor({ ...video, provider: video.provider }) : "");
  const parsed = parseVideoLink(text);
  const status = !text.trim()
    ? null
    : parsed
      ? parsed.provider === "youtube"
        ? `YouTube ${parsed.orientation === "portrait" ? "Short" : "video"} found.`
        : "Synthesia video found."
      : "That isn’t a YouTube or Synthesia link we can play.";
  return (
    <Field label="Video link" hint="Paste a YouTube link (videos or Shorts) or a Synthesia share link. Plays only when the learner presses play.">
      <input
        className={input}
        value={text}
        placeholder="https://www.youtube.com/watch?v=… or https://share.synthesia.io/…"
        onChange={(e) => {
          setText(e.target.value);
          const link = parseVideoLink(e.target.value);
          if (!link) return;
          set((x) => {
            if (x.visual.kind !== "presenter") return;
            const old = x.visual.video;
            const same = old?.provider === link.provider && old.id === link.id;
            x.visual.video = {
              provider: link.provider,
              id: link.id,
              title: old?.title ?? "Video",
              // Shorts are vertical; a normal YouTube video is wide. A Synthesia video keeps its shape.
              orientation: link.orientation ?? old?.orientation ?? "portrait",
              // Synthesia's own file and poster belong to that one video.
              ...(same && old?.src ? { src: old.src, poster: old.poster } : {}),
            };
            // Only Synthesia videos are labelled as an AI presenter.
            x.visual.synthetic = link.provider === "synthesia";
          });
        }}
      />
      {status && (
        <span role="status" className={cx("text-xs font-semibold", parsed ? "text-accent" : "text-danger")}>
          {status}
        </span>
      )}
    </Field>
  );
}

const VISUAL_KINDS: { kind: Visual["kind"]; label: string }[] = [
  { kind: "none", label: "None" },
  { kind: "illustration", label: "Photo or pattern" },
  { kind: "words", label: "Words" },
  { kind: "presenter", label: "Video" },
  { kind: "triangle", label: "Triangle diagram" },
  { kind: "orbit", label: "People around the client" },
];

function VisualField({ card: c, set, lesson, update }: { card: Card; set: (fn: (c: Card) => void) => void; lesson: string; update?: Update }) {
  const v = c.visual;
  const library = useLibrary();
  const [pexels, setPexels] = useState(false);
  const [giphy, setGiphy] = useState(false);
  // Library photos have no credit; Pexels photos and GIPHY GIFs bring theirs (and a description for the alt text if there's none).
  const applyPhoto = (p: Photo, suggestedAlt = "") =>
    set((x) => {
      const alt = ("alt" in x.visual ? x.visual.alt : "") || suggestedAlt;
      const photo = {
        src: p.src,
        width: p.width,
        height: p.height,
        ...(p.credit ? { credit: p.credit } : {}),
        ...(p.animated ? { animated: p.animated } : {}),
      };
      if (x.visual.kind === "illustration") {
        x.visual.photo = { ...photo, ...(x.visual.photo?.position ? { position: x.visual.photo.position } : {}) };
        if (!x.visual.alt) x.visual.alt = suggestedAlt;
      } else x.visual = { kind: "illustration", variant: "petals", tone: "teal", icon: "spark", alt, photo };
    });
  const choose = (kind: Visual["kind"]) =>
    set((x) => {
      const alt = "alt" in x.visual ? x.visual.alt : "";
      x.visual =
        kind === "none"
          ? { kind }
          : kind === "illustration"
            ? { kind, variant: "petals", tone: "teal", icon: "spark", alt }
            : kind === "words"
              ? { kind, words: ["One", "Two", "Three"], tone: "navy", alt }
              : kind === "presenter"
                ? {
                    kind,
                    name: "Paula",
                    synthetic: true,
                    tone: "teal",
                    alt,
                    video: { provider: "synthesia", id: "d17ebdc9-8f64-4630-ad37-24747e308796", title: "Welcome", orientation: "portrait" },
                  }
                : kind === "triangle"
                  ? { kind, highlight: "all", labels: ["Choice", "Dignity", "Privacy"], alt }
                  : {
                      kind,
                      centre: "Client",
                      nodes: [
                        { label: "Family", icon: "heart" },
                        { label: "Coordinator", icon: "chat" },
                        { label: "Partner", icon: "home" },
                      ],
                      alt,
                    };
    });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Card visual</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-expanded={pexels}
            onClick={() => (setPexels((o) => !o), setGiphy(false))}
            className="flex min-h-11 items-center gap-1 rounded-xl border-2 border-dashed border-line-strong px-3 text-xs font-semibold text-ink-muted hover:border-action hover:text-ink"
          >
            <Icon name="search" className="size-4" /> Find on Pexels
          </button>
          <button
            type="button"
            aria-expanded={giphy}
            onClick={() => (setGiphy((o) => !o), setPexels(false))}
            className="flex min-h-11 items-center gap-1 rounded-xl border-2 border-dashed border-line-strong px-3 text-xs font-semibold text-ink-muted hover:border-action hover:text-ink"
          >
            <Icon name="spark" className="size-4" /> Find a GIF
          </button>
          <UploadTile
            className="w-auto [&_label]:flex-row [&_label]:px-3"
            onUploaded={(p) => {
              applyPhoto(p);
              library.reload();
            }}
          >
            Upload an image
          </UploadTile>
        </div>
      </div>
      {pexels && (
        <PexelsPicker
          onClose={() => setPexels(false)}
          onPicked={(p, alt) => {
            applyPhoto(p, alt);
            library.reload();
            setPexels(false);
          }}
        />
      )}
      {giphy && (
        <GiphyPicker
          onClose={() => setGiphy(false)}
          onPicked={(p, alt) => {
            applyPhoto(p, alt);
            setGiphy(false);
          }}
        />
      )}
      {v.kind === "illustration" && v.photo?.credit && (
        <p className="text-xs text-ink-muted">
          {v.photo.animated ? "GIF" : "Photo"} by{" "}
          <a href={v.photo.credit.page ?? v.photo.credit.url} target="_blank" rel="noreferrer" className="underline">
            {v.photo.credit.name}
          </a>{" "}
          on {v.photo.credit.source}.{v.photo.credit.source === "GIPHY" && " The credit shows on the card."}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Visual type">
        {VISUAL_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            aria-pressed={v.kind === k.kind}
            onClick={() => choose(k.kind)}
            className={cx(
              "min-h-9 rounded-full border px-3 text-sm",
              v.kind === k.kind ? "border-action bg-tealtint font-semibold" : "border-line-strong hover:bg-muted",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      {v.kind === "illustration" && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          <button
            type="button"
            onClick={() => set((x) => x.visual.kind === "illustration" && void delete x.visual.photo)}
            className={cx("aspect-[4/3] overflow-hidden rounded-xl border-2", !v.photo ? "border-action" : "border-transparent")}
            aria-label="Pattern artwork"
          >
            <StoryVisual variant={v.variant} tone={v.tone} icon={v.icon} alt="" className="size-full" iconSize="size-5" />
          </button>
          {library.photos.map((p) => (
            <ReplaceableTile key={p.src} photo={p} update={update} onReplaced={library.reload}>
              <button
                type="button"
                onClick={() => applyPhoto(p)}
                className={cx("block aspect-[4/3] w-full overflow-hidden rounded-xl border-2", v.photo?.src === p.src ? "border-action" : "border-transparent")}
                aria-label={`Use ${p.src.split("/").pop()}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt="" className="size-full object-cover" />
              </button>
            </ReplaceableTile>
          ))}
          <UploadTile
            className="aspect-[4/3]"
            onUploaded={(p) => {
              applyPhoto(p);
              library.reload();
            }}
          />
        </div>
      )}
      {v.kind === "illustration" && v.photo && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Where the image goes">
          {/* Text and audio cards can also carry it inside the text, under the heading. */}
          {(c.type === "image" || c.type === "audio") && (
            <button
              type="button"
              aria-pressed={false}
              onClick={() =>
                set((x) => {
                  if (x.visual.kind !== "illustration" || !x.visual.photo) return;
                  const p = x.visual.photo;
                  x.figure = {
                    src: p.src,
                    width: p.width,
                    height: p.height,
                    alt: x.visual.alt,
                    placement: "above",
                    ...(p.credit ? { credit: p.credit } : {}),
                    ...(p.animated ? { animated: p.animated } : {}),
                  };
                  x.visual = { kind: "none" };
                })
              }
              className="order-last min-h-9 rounded-full border border-line-strong px-3 text-sm hover:bg-muted"
            >
              In the text, under the heading
            </button>
          )}
          {(
            [
              ["top", "Top of the card"],
              ["background", "Full background"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={(v.layout ?? "top") === k}
              onClick={() => set((x) => x.visual.kind === "illustration" && void (x.visual.layout = k))}
              className={cx(
                "min-h-9 rounded-full border px-3 text-sm",
                (v.layout ?? "top") === k ? "border-action bg-tealtint font-semibold" : "border-line-strong hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {v.kind === "illustration" && v.photo && v.layout === "background" && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Text colour over the image">
          <span className="mr-1 text-sm font-semibold">Text colour</span>
          {(
            [
              ["auto", "Auto"],
              ["light", "Light text"],
              ["dark", "Dark text"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={(v.textTone ?? "auto") === k}
              onClick={() => set((x) => x.visual.kind === "illustration" && void (x.visual.textTone = k))}
              className={cx(
                "min-h-9 rounded-full border px-3 text-sm",
                (v.textTone ?? "auto") === k ? "border-action bg-tealtint font-semibold" : "border-line-strong hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
          <span className="w-full text-xs text-ink-muted">Auto checks how bright the photo is behind the text and picks light or dark.</span>
        </div>
      )}
      {v.kind === "illustration" && !v.photo && (
        <div className="flex flex-wrap items-center gap-2">
          {TONES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={v.tone === t}
              onClick={() => set((x) => x.visual.kind === "illustration" && void (x.visual.tone = t))}
              className={cx(
                "min-h-9 rounded-full border px-3 text-sm capitalize",
                v.tone === t ? "border-action bg-tealtint font-semibold" : "border-line-strong",
              )}
            >
              {t}
            </button>
          ))}
          <select
            className={cx(input, "w-auto")}
            value={v.variant}
            onChange={(e) => set((x) => x.visual.kind === "illustration" && void (x.visual.variant = e.target.value as VisualVariant))}
            aria-label="Pattern"
          >
            {VARIANTS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select
            className={cx(input, "w-auto")}
            value={v.icon}
            onChange={(e) => set((x) => x.visual.kind === "illustration" && void (x.visual.icon = e.target.value as typeof v.icon))}
            aria-label="Icon"
          >
            {(["clock", "shield", "heart", "leaf", "chat", "home", "spark", "doc", "people", "sun", "route", "book"] as const).map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        </div>
      )}
      {v.kind === "words" && (
        <Field label="Words" hint="Shown one after another. Comma separated.">
          <input
            className={input}
            value={v.words.join(", ")}
            onChange={(e) => set((x) => x.visual.kind === "words" && void (x.visual.words = e.target.value.split(",").map((w) => w.trim())))}
          />
        </Field>
      )}
      {v.kind === "triangle" && (
        <Field label="Highlight">
          <select
            className={input}
            value={v.highlight}
            onChange={(e) => set((x) => x.visual.kind === "triangle" && void (x.visual.highlight = e.target.value as typeof v.highlight))}
          >
            <option value="all">All three, in turn</option>
            <option value="client">Client</option>
            <option value="coordinator">Coordinator</option>
            <option value="trilogy">Trilogy Care</option>
          </select>
        </Field>
      )}
      {v.kind === "orbit" && (
        <>
          <Field label="In the centre">
            <input className={input} value={v.centre} onChange={(e) => set((x) => x.visual.kind === "orbit" && void (x.visual.centre = e.target.value))} />
          </Field>
          <Field label="People around them" hint="The highlight moves between them in turn. Comma separated.">
            <input
              className={input}
              value={v.nodes.map((n) => n.label).join(", ")}
              onChange={(e) =>
                set((x) => {
                  if (x.visual.kind !== "orbit") return;
                  const old = x.visual.nodes;
                  x.visual.nodes = e.target.value.split(",").map((label, i) => ({ label: label.trim(), icon: old[i]?.icon ?? "people" }));
                })
              }
            />
          </Field>
        </>
      )}
      {v.kind === "triangle" && (
        <Field label="Labels" hint="Appear one by one around the triangle. Comma separated.">
          <input
            className={input}
            value={(v.labels ?? []).join(", ")}
            onChange={(e) => set((x) => x.visual.kind === "triangle" && void (x.visual.labels = e.target.value.split(",").map((w) => w.trim())))}
          />
        </Field>
      )}
      {v.kind === "presenter" && v.video?.provider === "elevenlabs" && <AvatarField key={c.id} card={c} lesson={lesson} photos={library.photos} set={set} />}
      {v.kind === "presenter" && v.video?.provider !== "elevenlabs" && (
        <>
          {/* Synthesia is being replaced: a video card can switch to an AI presenter. */}
          {(c.type === "presenter" || c.narration?.trim()) && (
            <button
              type="button"
              className={cx(btn.secondary, "self-start")}
              onClick={() =>
                set((x) => {
                  if (x.visual.kind !== "presenter") return;
                  x.visual.synthetic = true;
                  x.visual.video = { provider: "elevenlabs", id: "", title: "Presenter introduction", orientation: "portrait" };
                })
              }
            >
              <Icon name="user" className="size-4" /> Use an AI presenter instead
            </button>
          )}
          <VideoLinkField key={c.id} video={v.video} set={set} />
          <Field label="Shape">
            <select
              className={input}
              value={v.video?.orientation ?? "landscape"}
              onChange={(e) =>
                set((x) => x.visual.kind === "presenter" && x.visual.video && void (x.visual.video.orientation = e.target.value as "portrait" | "landscape"))
              }
            >
              <option value="portrait">Vertical: fills the whole card</option>
              <option value="landscape">Wide: sits above the text</option>
            </select>
          </Field>
        </>
      )}
      {v.kind !== "none" && (
        <Field label="Alt text" hint="Describe what the picture shows for people using a screen reader.">
          <input className={input} value={v.alt} onChange={(e) => set((x) => x.visual.kind !== "none" && void (x.visual.alt = e.target.value))} />
        </Field>
      )}
    </div>
  );
}

/*
  Claude drafts the cards. The author writes a brief and can attach the source document; the
  document is the only source of facts. The result lands on the canvas to be edited.
*/
function DraftPanel({ lesson: l, onDraft, onClose }: { lesson: Lesson; onDraft: (draft: Lesson, source: string | null) => void; onClose: () => void }) {
  const generator = useApi<{ generator: { connected: boolean; model: string } }>("/api/admin/lessons").data?.generator;
  const [brief, setBrief] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [audience, setAudience] = useState<Lesson["track"]>(l.track === "reinforcement" ? "partner" : l.track);
  const [minutes, setMinutes] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const ready = brief.trim().length >= 10 || Boolean(file);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (!/\.(pdf|docx|txt|md)$/i.test(f.name)) return setError("Attach a PDF, Word (.docx) or text file.");
    if (f.size > 15 * 1024 * 1024) return setError("That file is over 15 MB.");
    setError(null);
    setFile(f);
  };

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("brief", brief);
      form.append("audience", audience);
      form.append("minutes", String(minutes));
      if (file) form.append("file", file);
      const res = await fetch("/api/admin/lessons/draft", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Claude couldn’t draft the topic.");
      onDraft(data.lesson as Lesson, data.source ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="draft-title" className="mb-6 rounded-3xl border-2 border-action/30 bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="draft-title" className="flex items-center gap-2 font-serif text-2xl font-semibold">
            <Icon name="spark" className="size-5 text-accent" /> Generate the cards with Claude
          </h2>
          <p className="mt-1 max-w-2xl text-ink-muted">
            Describe the topic, and attach a policy, procedure or guide if you have one. Claude drafts the cards: a scenario, a decision, a quick check and a
            summary. You then edit everything on the canvas.
          </p>
        </div>
        <button type="button" className={btn.quiet} onClick={onClose} disabled={busy}>
          Start from blank cards
        </button>
      </div>

      {generator && !generator.connected && (
        <p className="mt-4 rounded-2xl border-2 border-dashed border-gold p-3 text-sm">
          <strong>Claude isn’t connected yet.</strong> Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart the server, then generate.
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Field label="Brief" hint="What should people be able to do afterwards? Who is it for? Any scenario to use?">
          <textarea
            rows={7}
            maxLength={4000}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[0.98rem] leading-relaxed"
            placeholder="For example: Service partners need to know what to do when a client seems confused or unwell during a visit. Use a cleaning visit as the scenario, and make sure they know to tell the coordinator the same day."
          />
        </Field>
        <div className="flex flex-col gap-4">
          <div>
            <span className="text-sm font-semibold">Source document (optional)</span>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                pick(e.dataTransfer.files?.[0]);
              }}
              className={cx(
                "mt-1 flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed p-4 text-center text-sm has-[:focus-visible]:outline-2",
                over ? "border-action bg-tealtint" : "border-line-strong hover:border-action",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="sr-only"
                onChange={(e) => pick(e.target.files?.[0])}
                disabled={busy}
              />
              <Icon name="upload" className="size-5 text-ink-muted" />
              {file ? (
                <>
                  <span className="font-semibold">{file.name}</span>
                  <span className="text-xs text-ink-muted">{Math.max(1, Math.round(file.size / 1024))} KB · click to change</span>
                </>
              ) : (
                <>
                  <span className="font-semibold">Drop a PDF or Word file, or click to choose</span>
                  <span className="text-xs text-ink-muted">PDF, .docx or text, up to 15 MB</span>
                </>
              )}
            </label>
            {file && (
              <button type="button" className={cx(btn.quiet, "mt-1")} onClick={() => setFile(null)} disabled={busy}>
                Remove file
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Audience">
              <select className={input} value={audience} onChange={(e) => setAudience(e.target.value as Lesson["track"])} disabled={busy}>
                {TRACKS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Length">
              <select className={input} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} disabled={busy}>
                {[3, 4, 5, 6].map((m) => (
                  <option key={m} value={m}>
                    About {m} min
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className={btn.primary} disabled={busy || !ready} onClick={generate}>
          <Icon name="spark" className="size-4" /> {busy ? "Claude is writing the cards…" : "Generate cards"}
        </button>
        {busy ? (
          <span className="flex items-center gap-2 text-sm text-ink-muted" role="status">
            <span className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
            This usually takes a minute or two{file ? " with a document" : ""}.
          </span>
        ) : (
          <span className="text-sm text-ink-muted">Claude only uses facts from your document. Nothing is published until you review it.</span>
        )}
      </div>
    </section>
  );
}

/* 3. Media and voice */

function Media({ lesson: l, update, isNew }: { lesson: Lesson; update: Update; isNew: boolean }) {
  const cards = ordered(l);
  const library = useLibrary();
  const [deleted, setDeleted] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const fileOf = (src: string) => src.split("/").pop() ?? "";
  const isUpload = (src: string) => src.startsWith("/api/uploads/");
  // Uploads are deleted by file name; built-in pictures (public/images) are hidden by address.
  const usageUrl = (src: string) =>
    isUpload(src) ? `/api/admin/uploads/${encodeURIComponent(fileOf(src))}` : `/api/admin/uploads/built-in?src=${encodeURIComponent(src)}`;

  /** Deletes an image from the library, after saying where it's still used. */
  async function remove(p: Photo) {
    setMediaError(null);
    try {
      const { lessons } = await api<{ lessons: { slug: string; title: string }[] }>(usageUrl(p.src));
      const names = lessons.map((x) => (x.slug === l.slug ? "this topic" : `“${x.title}”`));
      if (JSON.stringify(l).includes(p.src) && !names.includes("this topic")) names.unshift("this topic");
      const ok = await confirmAction(
        names.length
          ? `It’s still used in ${names.join(", ")}. Those cards keep showing it, but you won’t be able to pick it from the library again.`
          : "It’s removed from the image library.",
        { title: "Delete this image?", confirmLabel: "Delete", danger: true },
      );
      if (!ok) return;
      if (isUpload(p.src)) await api(usageUrl(p.src), { method: "DELETE" });
      else await api("/api/admin/uploads/built-in", { body: { src: p.src, hidden: true } });
      setDeleted(p.src);
      library.reload();
    } catch (e) {
      setMediaError((e as Error).message);
    }
  }
  /** Replaces an uploaded picture with a new file, everywhere it's used, after saying where that is. */
  const [replacing, setReplacing] = useState<Photo | null>(null);
  const [replaced, setReplaced] = useState<string | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  // The picture the file chooser was opened for (cancelling the chooser leaves nothing behind).
  const pickFor = useRef<Photo | null>(null);
  async function replace(p: Photo, file: File) {
    setMediaError(null);
    setReplaced(null);
    try {
      const { lessons } = await api<{ lessons: { slug: string; title: string }[] }>(usageUrl(p.src));
      const names = lessons.map((x) => (x.slug === l.slug ? "this topic" : `“${x.title}”`));
      if (JSON.stringify(l).includes(p.src) && !names.includes("this topic")) names.unshift("this topic");
      const ok = await confirmAction(
        names.length
          ? `Every card using it changes to the new picture, in ${names.join(", ")}, including what learners see now. Cards keep their crop and position.`
          : "The new picture takes its place in the library.",
        { title: `Replace with “${file.name}”?`, confirmLabel: "Replace" },
      );
      if (!ok) return;
      setReplacing(p);
      const next = await replaceImage(fileOf(p.src), file);
      // This editor's copy of the lesson changes too, so saving it doesn't put the old picture back.
      if (JSON.stringify(l).includes(p.src)) update((d) => void Object.assign(d, swapPicture(d, p.src, next)));
      setReplaced(next.lessons.length ? `Picture replaced in ${next.lessons.length} ${next.lessons.length === 1 ? "topic" : "topics"}.` : "Picture replaced.");
      library.reload();
    } catch (e) {
      setMediaError((e as Error).message);
    } finally {
      setReplacing(null);
    }
  }
  /** Keeps one copy of each picture that's in the library more than once. */
  async function mergeCopies() {
    setMediaError(null);
    setReplaced(null);
    try {
      const r = await api<{
        pictures: number;
        removed: number;
        lessons: string[];
        swaps: { from: string; to: { src: string; width: number; height: number } }[];
      }>("/api/admin/uploads/duplicates", { body: {} });
      // This editor's copy of the topic changes too, so saving it doesn't bring a removed copy back.
      const mine = r.swaps.filter((w) => JSON.stringify(l).includes(w.from));
      if (mine.length) update((d) => void mine.reduce((acc, w) => Object.assign(acc, swapPicture(acc, w.from, w.to)), d));
      setReplaced(
        r.removed
          ? `Removed ${r.removed} duplicate ${r.removed === 1 ? "copy" : "copies"} of ${r.pictures} ${r.pictures === 1 ? "picture" : "pictures"}. ${r.lessons.length} ${r.lessons.length === 1 ? "topic now uses" : "topics now use"} the copy that was kept.`
          : "No duplicates found. Each picture is in the library once.",
      );
      library.reload();
    } catch (e) {
      setMediaError((e as Error).message);
    }
  }
  async function restore(src: string) {
    setMediaError(null);
    try {
      if (isUpload(src)) await api(usageUrl(src), { body: { action: "restore" } });
      else await api("/api/admin/uploads/built-in", { body: { src, hidden: false } });
      if (deleted === src) setDeleted(null);
      library.reload();
    } catch (e) {
      setMediaError((e as Error).message);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Poster image" aside={<span className="text-sm text-ink-muted">Topic intro and Learning tile</span>}>
        <StoryVisual {...l.visual} alt={l.visual.alt ?? ""} className="aspect-[16/10] rounded-2xl" />
        <details className="group mt-3 rounded-2xl border border-line bg-muted/50" open={generating} onToggle={(e) => setGenerating(e.currentTarget.open)}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 font-semibold">
            <Icon name="spark" className="size-4 text-accent" /> Generate a picture with AI
            <Icon name="chevron-down" className="ml-auto size-5 text-ink-muted transition-transform group-open:rotate-180" />
          </summary>
          {generating && (
            <div className="px-3 pb-3">
              <ImageGenerator
                lesson={l}
                onMade={library.reload}
                onUse={(p, prompt) =>
                  update((d) => {
                    d.visual.photo = p;
                    // A starting point for the alt text; the author can refine it in Details.
                    if (!d.visual.alt) d.visual.alt = prompt.slice(0, 200);
                  })
                }
              />
            </div>
          )}
        </details>
        <div className="mt-3 grid grid-cols-6 gap-2">
          <UploadTile
            className="aspect-square"
            onUploaded={(p) => {
              update((d) => void (d.visual.photo = p));
              library.reload();
            }}
          />
          {library.photos.map((p) => {
            const name = (p as Photo & { name?: string }).name ?? fileOf(p.src);
            return (
              <div
                key={p.src}
                className={cx("group relative", replacing?.src === p.src && "animate-pulse")}
                // Drop a new file onto an uploaded picture to replace it.
                onDragOver={(e) => {
                  if (!isUpload(p.src) || !e.dataTransfer.types.includes("Files")) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  const file = e.dataTransfer.files?.[0];
                  if (!isUpload(p.src) || !file) return;
                  e.preventDefault();
                  e.stopPropagation();
                  void replace(p, file);
                }}
              >
                <button
                  type="button"
                  onClick={() => update((d) => void (d.visual.photo = p))}
                  className={cx(
                    "block aspect-square w-full overflow-hidden rounded-lg border-2",
                    l.visual.photo?.src === p.src ? "border-action" : "border-transparent",
                  )}
                  aria-label={`Use ${name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt="" className="size-full object-cover" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(p)}
                  aria-label={`Delete ${name} from the library`}
                  title="Delete from the library"
                  className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-white/90 text-[#102a43] opacity-0 shadow ring-1 ring-black/10 transition-opacity hover:bg-white hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <Icon name="trash" className="size-3.5" />
                </button>
                {/* Built-in pictures are part of the hub itself, so only uploads can be replaced. */}
                {isUpload(p.src) && (
                  <button
                    type="button"
                    onClick={() => {
                      pickFor.current = p;
                      replaceInput.current?.click();
                    }}
                    aria-label={`Replace ${name} with a new picture, everywhere it's used`}
                    title="Replace with a new picture, everywhere it’s used (or drop a file here)"
                    className="absolute left-1 top-1 grid size-7 place-items-center rounded-full bg-white/90 text-[#102a43] opacity-0 shadow ring-1 ring-black/10 transition-opacity hover:bg-white hover:text-accent focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Icon name="refresh" className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <input
          ref={replaceInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            const p = pickFor.current;
            pickFor.current = null;
            if (file && p) void replace(p, file);
          }}
        />
        {replaced && (
          <p role="status" className="mt-2 rounded-xl bg-tealtint px-3 py-2 text-sm">
            {replaced}
          </p>
        )}
        {deleted && (
          <p role="status" className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
            Image deleted from the library.
            <button type="button" onClick={() => restore(deleted)} className="font-semibold text-accent hover:underline">
              Undo
            </button>
          </p>
        )}
        {mediaError && (
          <div className="mt-2">
            <ErrorNote text={mediaError} />
          </div>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          <span>Hover over an image to delete it, or to replace it everywhere it’s used (you can also drop a new file onto it).</span>
          <button type="button" onClick={mergeCopies} className="font-semibold text-accent hover:underline">
            Remove duplicate copies
          </button>
          {library.deleted.length > 0 && (
            <button type="button" aria-expanded={showDeleted} onClick={() => setShowDeleted((s) => !s)} className="font-semibold text-accent hover:underline">
              {showDeleted ? "Hide deleted images" : `Show deleted images (${library.deleted.length})`}
            </button>
          )}
        </p>
        {showDeleted && library.deleted.length > 0 && (
          <div className="mt-2 rounded-2xl bg-muted p-3">
            <p className="text-sm font-semibold">Deleted images</p>
            <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {library.deleted.map((p) => (
                <li key={p.src} className="flex flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt="" className="aspect-square w-full rounded-lg object-cover opacity-60" />
                  <button
                    type="button"
                    onClick={() => restore(p.src)}
                    aria-label={`Restore ${(p as Photo & { name?: string }).name ?? fileOf(p.src)} to the library`}
                    className="min-h-8 rounded-full bg-surface text-xs font-semibold text-accent ring-1 ring-line hover:bg-tealtint"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {TONES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={l.visual.tone === t}
              onClick={() => update((d) => void ((d.visual.tone = t), delete d.visual.photo))}
              className={cx(
                "min-h-9 rounded-full border px-3 text-sm capitalize",
                l.visual.tone === t && !l.visual.photo ? "border-action bg-tealtint" : "border-line-strong",
              )}
            >
              {t}
            </button>
          ))}
          <select
            className={cx(input, "w-auto")}
            value={l.visual.variant}
            onChange={(e) => update((d) => void (d.visual.variant = e.target.value as VisualVariant))}
            aria-label="Pattern"
          >
            {VARIANTS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
      </Panel>

      <Panel title="Voice">
        <div className="flex items-center gap-4 rounded-2xl bg-muted p-4">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-action text-on-action">
            <Icon name="volume" className="size-6" />
          </span>
          <div>
            <p className="font-semibold">Charlie · Australian English</p>
            <p className="text-sm text-ink-muted">ElevenLabs live voice. Each card’s script is read when the card opens.</p>
          </div>
        </div>
        <ul className="mt-4 flex flex-col divide-y divide-line">
          {cards.map((c) => {
            const s = scriptOf(c);
            const alt = c.visual.kind === "none" || ("alt" in c.visual && c.visual.alt);
            return (
              <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{c.heading || c.id}</span>
                <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", s ? "bg-tealtint text-accent" : "bg-orange/15 text-warm")}>
                  {s ? `${Math.max(1, Math.round((words(s) / 150) * 60))}s narration` : "No narration"}
                </span>
                <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", alt ? "bg-tealtint text-accent" : "bg-orange/15 text-warm")}>
                  {alt ? "Alt text" : "Needs alt"}
                </span>
              </li>
            );
          })}
        </ul>
        {isNew && <p className="mt-3 text-sm text-ink-muted">Voice previews are available once the topic is saved.</p>}
      </Panel>
    </div>
  );
}

/* 4. Spaced learning */

function Spaced({ lesson: l, isNew }: { lesson: Lesson; isNew: boolean }) {
  const live = useApi<{ lessons: { slug: string; spaced: boolean; state: string }[] }>(isNew ? null : "/api/admin/lessons").data?.lessons.find(
    (x) => x.slug === l.slug,
  );
  const [on, setOn] = useState<boolean | null>(null);
  const checked = on ?? live?.spaced ?? false;
  const plan = [
    { when: "Day 0", stage: "Learn", text: "This master topic", own: true },
    { when: "Week 2", stage: "Recall", text: "Two or three quick questions on the key facts" },
    { when: "Month 2", stage: "Apply", text: "A new scenario where they use it on the job" },
    { when: "Week 14", stage: "Refresh", text: "A short refresher before it fades" },
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <Panel title="Spaced learning">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-line-strong p-4">
          <input type="checkbox" className="mt-0.5 size-5 accent-[var(--action)]" checked={checked} onChange={(e) => setOn(e.target.checked)} />
          <span>
            <span className="font-semibold">Bring this topic back with spaced follow ups</span>
            <span className="mt-1 block text-sm text-ink-muted">
              Leave it off for topics that stand on their own, like Our Mission and Model. Turn it on for rules and processes people need to remember.
            </span>
          </span>
        </label>
        <ol className={cx("mt-5 grid gap-3 sm:grid-cols-4", !checked && "opacity-45")}>
          {plan.map((p) => (
            <li key={p.stage} className={cx("rounded-2xl p-3", p.own ? "border-2 border-action" : "bg-muted")}>
              <p className="font-mulish text-xs font-bold text-ink-muted">{p.when}</p>
              <p className="font-semibold">{p.stage}</p>
              <p className="text-sm leading-snug">{p.text}</p>
              {!p.own && <p className="mt-1 text-xs text-ink-muted">Written by Claude</p>}
            </li>
          ))}
        </ol>
        <p className={cx("mt-3 rounded-2xl border border-dashed border-line-strong p-3 text-sm", !checked && "opacity-45")}>
          <strong>Adaptive:</strong> anyone who got a Recall or Apply question wrong on their first try gets an easier Refresh with more practice.
        </p>
      </Panel>
      <Panel title="How it works">
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>You write and approve one master topic.</li>
          <li>With spaced learning on, Claude writes the Recall, Apply and Refresh follow ups using only your cards.</li>
          <li>You preview each one, regenerate or edit it, then approve.</li>
          <li>Learners get each follow up in their daily digest when it’s due. They don’t choose them from the catalogue.</li>
        </ol>
        {!isNew && (
          <Link href="/admin/lessons" className={cx(btn.secondary, "mt-4")}>
            {live?.state === "live" ? "See the approved follow ups" : "Generate on the Topics page"} <Icon name="arrow-right" className="size-4" />
          </Link>
        )}
      </Panel>
    </div>
  );
}

/* 5. Review and publish */

type Check = { label: string; ok: boolean; detail?: string };

function runChecks(l: Lesson): Check[] {
  const cards = Object.values(l.nodes);
  const missingAlt = cards.filter((c) => c.visual.kind !== "none" && !c.visual.alt);
  const missingVoice = cards.filter((c) => !scriptOf(c) && c.type !== "quiz");
  const broken = cards.flatMap((c) =>
    nextOf(c)
      .filter((n) => !l.nodes[n])
      .map((n) => `${c.heading || c.id} → ${n}`),
  );
  const deadEnds = cards.filter(
    (c) => c.type !== "summary" && c.type !== "quiz" && !nextOf(c).length && !(c.type === "decision" && c.options.some((o) => o.stay)),
  );
  const empty = cards.filter((c) => !c.heading || (!c.body && c.type !== "quiz" && c.type !== "decision"));
  const long = cards.filter((c) => words(c.body) > 70);
  const sourced = cards.some((c) => c.source) || cards.some((c) => c.type === "summary" && (c.references?.length || c.reference));
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
  return [
    { label: "Title, outcome and summary filled in", ok: Boolean(l.title && l.outcome && l.summary) },
    { label: "Every card has a heading and text", ok: !empty.length, detail: empty.length ? plural(empty.length, "card") + " to finish" : undefined },
    { label: "Text is short enough to read on a phone", ok: !long.length, detail: long.length ? `${plural(long.length, "card")} over 70 words` : undefined },
    {
      label: "Every path leads to the end",
      ok: !broken.length && !deadEnds.length,
      detail: [...broken, ...deadEnds.map((c) => `${c.heading || c.id} has no next card`)].join("; ") || undefined,
    },
    { label: "Learners check their understanding", ok: cards.some((c) => c.type === "quiz" || c.type === "decision" || c.type === "written") },
    ...(cards.some((c) => c.type === "checklist")
      ? [
          {
            label: "Checklists have items",
            ok: cards.every((c) => c.type !== "checklist" || (c.items.length > 0 && c.items.every((i) => i.text.trim()))),
            detail: "Each checklist needs at least one item, and no empty items",
          },
        ]
      : []),
    ...(cards.some((c) => c.type === "resources")
      ? [
          {
            label: "Resources have a title and a working link",
            ok: cards.every(
              (c) => c.type !== "resources" || (c.items.length > 0 && c.items.every((i) => i.title.trim() && /^(https:\/\/|\/api\/uploads\/)/.test(i.url))),
            ),
            detail: "Each resource needs a title, and a web address starting https:// or an uploaded PDF",
          },
        ]
      : []),
    ...(cards.some((c) => c.type === "hotspot")
      ? [
          {
            label: "Hotspot cards are set up",
            ok: cards.every((c) => c.type !== "hotspot" || (c.image && c.spots.length > 0 && c.spots.every((s) => s.label.trim() && s.text.trim()))),
            detail: "Each hotspot card needs a picture and at least one spot, and every spot needs a label and a note",
          },
        ]
      : []),
    ...(cards.some((c) => c.type === "written")
      ? [
          {
            label: "Written answers have criteria",
            ok: cards.every((c) => c.type !== "written" || (c.prompt.trim() && c.criteria.some((cr) => cr.text.trim()))),
            detail: "Each written answer card needs a question and at least one criterion",
          },
        ]
      : []),
    { label: "Ends with a summary and an action", ok: cards.some((c) => c.type === "summary" && c.action) },
    {
      label: "Pictures have alt text",
      ok: !missingAlt.length,
      detail: missingAlt.length ? plural(missingAlt.length, "picture") + " missing alt text" : undefined,
    },
    {
      label: "Every card has narration",
      ok: !missingVoice.length,
      detail: missingVoice.length ? plural(missingVoice.length, "card") + " without a script" : undefined,
    },
    { label: "Official sources are cited", ok: sourced },
    { label: "Review date is in the future", ok: l.reviewDate > new Date().toISOString().slice(0, 10) },
  ];
}

/*
  Preview in a phone-sized window over the editor, so closing it returns to exactly where you were.
  Plays the last saved draft in author preview (nothing is recorded), from the selected card or the start.
*/
function PreviewDialog({ slug, cardId, dirty, onClose }: { slug: string; cardId: string; dirty: boolean; onClose: () => void }) {
  const [fromStart, setFromStart] = useState(false);
  const [run, setRun] = useState(0);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // The player's own close button (inside the frame) asks to close the window.
    const onMessage = (e: MessageEvent) => e.origin === window.location.origin && e.data?.type === "tc-preview-close" && onClose();
    document.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onMessage);
      document.body.style.overflow = scroll;
    };
  }, [onClose]);
  const src = `/learning/${encodeURIComponent(slug)}?preview=1&embed=1${fromStart ? "" : `&card=${encodeURIComponent(cardId)}`}`;
  const choice = (on: boolean) =>
    cx("min-h-9 rounded-full px-3 text-sm font-semibold", on ? "bg-surface text-ink shadow-sm" : "text-white/80 hover:text-white");
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Topic preview"
      className="fixed inset-0 z-[60] flex flex-col items-center gap-3 bg-[rgb(10_26_46/0.75)] p-3 sm:p-5"
      onClick={onClose}
    >
      <div className="flex w-full max-w-[26rem] flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="inline-flex rounded-full bg-white/15 p-1" role="group" aria-label="Start from">
          <button type="button" aria-pressed={!fromStart} className={choice(!fromStart)} onClick={() => setFromStart(false)}>
            This card
          </button>
          <button type="button" aria-pressed={fromStart} className={choice(fromStart)} onClick={() => setFromStart(true)}>
            From the start
          </button>
        </div>
        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          aria-label="Restart the preview"
          title="Restart"
          className="grid size-10 place-items-center rounded-full text-white hover:bg-white/15"
        >
          <Icon name="refresh" className="size-4" />
        </button>
        <button
          ref={closeBtn}
          type="button"
          onClick={onClose}
          className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-semibold text-ink hover:bg-muted"
        >
          <Icon name="close" className="size-4" /> Close preview
        </button>
      </div>
      {dirty && (
        <p className="w-full max-w-[26rem] rounded-xl bg-gold/90 px-3 py-1.5 text-center text-sm text-[#0a1a2e]" onClick={(e) => e.stopPropagation()}>
          Showing your last saved draft. Save to include your latest changes.
        </p>
      )}
      <iframe
        key={`${src}#${run}`}
        src={src}
        title="Topic preview"
        // Answer cards can be spoken, so the preview may use the microphone.
        allow="microphone"
        className="w-full max-w-[26rem] flex-1 rounded-[2rem] border-0 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

type Version = {
  version: string;
  notes: string;
  kind: "minor" | "important";
  by: string;
  at: string | null;
  latest: boolean;
  changes: { lesson: string[]; cards: { id: string; title: string; change: "added" | "removed" | "changed"; parts: string[] }[] };
};

/** Every published version: who, when, the note, and what changed card by card. Any earlier version can be restored as the draft. */
function VersionHistory({ slug }: { slug: string }) {
  const data = useApi<{ versions: Version[] }>(`/api/admin/lessons/${slug}/versions`);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const versions = data.data?.versions ?? [];

  async function restore(v: Version) {
    const ok = await confirmAction(`Version ${v.version} becomes your draft. Check it, then publish to make it live as a new version.`, {
      title: `Restore version ${v.version}?`,
      confirmLabel: "Restore as draft",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/lessons/${slug}/content`, { body: { action: "restore_version", version: v.version } });
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Panel title="Version history">
      {error && <ErrorNote text={error} />}
      {!data.data ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : !versions.length ? (
        <p className="text-sm text-ink-muted">History starts with the next publish. Each version is kept with what changed.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {versions.map((v) => {
            const n = v.changes.cards.length + v.changes.lesson.length;
            return (
              <li key={v.version} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Version {v.version}</span>
                  {v.latest && <Badge tone="good">Live</Badge>}
                  {v.kind === "important" && <Badge tone="warn">Important</Badge>}
                </div>
                <p className="text-xs text-ink-muted">
                  {v.at
                    ? `${new Date(v.at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })} · ${v.by}`
                    : "Before history began"}
                </p>
                {v.notes && <p className="mt-1 text-sm">{v.notes}</p>}
                <div className="mt-1 flex flex-wrap gap-3 text-xs font-semibold">
                  {n > 0 && (
                    <button
                      type="button"
                      className="text-accent hover:underline"
                      onClick={() => setOpen(open === v.version ? null : v.version)}
                      aria-expanded={open === v.version}
                    >
                      {open === v.version ? "Hide changes" : `What changed (${n})`}
                    </button>
                  )}
                  {!v.latest && (
                    <button type="button" className="text-ink-muted hover:text-ink hover:underline" disabled={busy} onClick={() => restore(v)}>
                      Restore
                    </button>
                  )}
                </div>
                {open === v.version && (
                  <ul className="mt-2 flex flex-col gap-1 rounded-xl bg-muted p-2.5 text-xs">
                    {v.changes.lesson.length > 0 && <li>Topic: {v.changes.lesson.join(", ")} changed</li>}
                    {v.changes.cards.map((c) => (
                      <li key={c.id}>
                        <span
                          className={cx(
                            "mr-1.5 rounded px-1.5 font-bold uppercase",
                            c.change === "added" ? "bg-success/15 text-success" : c.change === "removed" ? "bg-danger/10 text-danger" : "bg-gold/25",
                          )}
                        >
                          {c.change}
                        </span>
                        {c.title}
                        {c.parts.length > 0 && <span className="text-ink-muted"> · {c.parts.join(", ")}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

function Review({
  checks,
  slug,
  isNew,
  changeNote,
  setChangeNote,
  important,
  setImportant,
  onPublish,
  publishing,
  canPublish,
  historyKey,
}: {
  lesson: Lesson;
  checks: Check[];
  slug: string;
  isNew: boolean;
  changeNote: string;
  setChangeNote: (s: string) => void;
  important: boolean;
  setImportant: (on: boolean) => void;
  onPublish: () => void;
  publishing: boolean;
  canPublish: boolean;
  historyKey: number;
}) {
  const passed = checks.filter((c) => c.ok).length;
  const flow = [
    { label: "Draft", who: "You", done: true },
    { label: "Content review", who: "Subject matter expert" },
    { label: "Compliance review", who: "Quality and Compliance" },
    { label: "Published", who: "Live for learners" },
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <Panel title="Automatic checks" aside={<Badge tone={passed === checks.length ? "good" : "warn"}>{`${passed} of ${checks.length} passed`}</Badge>}>
        <ul className="flex flex-col divide-y divide-line">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-3 py-2.5">
              <span
                className={cx(
                  "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full",
                  c.ok ? "bg-success text-white" : "bg-orange/15 text-warm",
                )}
              >
                <Icon name={c.ok ? "check" : "alert"} className="size-3.5" />
              </span>
              <span>
                <span className="font-medium">{c.label}</span>
                {c.detail && <span className="block text-sm text-ink-muted">{c.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <ClaudeButton>Ask Claude to check accuracy against the sources</ClaudeButton>
        </div>
      </Panel>
      <div className="flex flex-col gap-5">
        <Panel title="Sign off">
          <ol className="flex flex-col border-l-2 border-line pl-5">
            {flow.map((f) => (
              <li key={f.label} className="relative py-2">
                <span
                  aria-hidden
                  className={cx(
                    "absolute -left-[1.72rem] top-3.5 size-3 rounded-full border-2",
                    f.done ? "border-action bg-action" : "border-line-strong bg-surface",
                  )}
                />
                <p className="font-semibold">{f.label}</p>
                <p className="text-sm text-ink-muted">{f.who}</p>
              </li>
            ))}
          </ol>
          <Field label="What changed in this version" hint="Kept in the version history. For an important change, learners see it too." className="mt-3">
            <textarea
              rows={3}
              className={textarea}
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="For example: Updated the example rate and the worked amounts."
            />
          </Field>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 accent-[var(--action)]" checked={important} onChange={(e) => setImportant(e.target.checked)} />
            <span>
              <span className="font-semibold">Important change</span>
              <span className="block text-ink-muted">People who did an earlier version see this note next time they open the topic.</span>
            </span>
          </label>
          <button type="button" className={cx(btn.primary, "mt-3 w-full")} onClick={onPublish} disabled={!canPublish || publishing}>
            {publishing ? "Publishing…" : "Publish"}
          </button>
          <p className="mt-2 text-xs text-ink-muted">
            {isNew ? "Save the topic first." : "Learners who already finished keep their completion. Publishing starts a new version."}
          </p>
        </Panel>
        {!isNew && <VersionHistory key={historyKey} slug={slug} />}
      </div>
    </div>
  );
}

/** The topic's subject on the Learning page. Saved as soon as it's chosen; no publish needed. */
function SubjectField({ slug }: { slug: string }) {
  const { data } = useApi<{ subject: string | null }>(`/api/admin/lessons/${encodeURIComponent(slug)}/subject`);
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);
  const value = chosen !== undefined ? chosen : (data?.subject ?? null);
  async function choose(subject: string | null) {
    setChosen(subject);
    setNote(null);
    try {
      await api(`/api/admin/lessons/${encodeURIComponent(slug)}/subject`, { method: "PUT", body: { subject } });
      setNote("Saved. The Learning page shows it straight away.");
    } catch (e) {
      setNote((e as Error).message);
    }
  }
  return (
    <Field label="Subject" hint={note ?? "Where the topic sits when people browse the Learning page."} className="sm:col-span-2">
      <select className={input} value={value ?? ""} disabled={!data} onChange={(e) => choose(e.target.value || null)}>
        <option value="">No subject</option>
        {SUBJECTS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
