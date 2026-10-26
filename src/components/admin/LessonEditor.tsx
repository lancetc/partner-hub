"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Card, CardVisual as Visual, Lesson, Tone } from "@/content/lessons";
import type { VisualVariant } from "@/content/stories";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon, type IconName } from "../Icon";
import { StoryVisual } from "../StoryVisual";
import { CardVisual } from "../player/CardVisual";
import { VideoBubbles } from "../player/VideoBubbles";
import { VideoRecorder } from "./VideoRecorder";
import { toneClasses, useTextTone } from "@/lib/imageTone";
import { parseVideoLink, videoLinkFor } from "@/lib/videoLinks";
import { GRADIENTS, gradientIds } from "@/content/gradients";
import { insertAfterCard, isLinear, mainLine, moveBlock, nextOf, ordered } from "@/lib/lessonGraph";

/*
  Lesson authoring. Cards are edited in place on a canvas (like 7taps); details, media, spaced
  learning and review sit in tabs. A demo of the process: edits stay in this page and are never saved.
*/

const STEPS = [
  { id: "cards", label: "Cards", hint: "Edit the cards in place", icon: "list" },
  { id: "brief", label: "Details", hint: "Who it’s for and what changes", icon: "doc" },
  { id: "media", label: "Media and voice", hint: "Poster, images and narration", icon: "camera" },
  { id: "spaced", label: "Spaced learning", hint: "Follow ups written by Claude", icon: "route" },
  { id: "review", label: "Review and publish", hint: "Checks and sign off", icon: "check" },
] as const satisfies readonly { id: string; label: string; hint: string; icon: IconName }[];
type StepId = (typeof STEPS)[number]["id"];

const TRACKS: { id: Lesson["track"]; label: string }[] = [
  { id: "core", label: "Everyone" },
  { id: "partner", label: "Service partners" },
  { id: "coordinator", label: "Care coordinators" },
  { id: "briefing", label: "Policy briefing" },
];

const CARD_TYPES: { type: Card["type"]; label: string; icon: IconName; hint: string }[] = [
  { type: "image", label: "Explain", icon: "doc", hint: "A heading, short text and a picture" },
  { type: "presenter", label: "Presenter", icon: "play", hint: "A video introduction" },
  { type: "decision", label: "Decision", icon: "route", hint: "A choice that branches to consequences" },
  { type: "quiz", label: "Quiz", icon: "check", hint: "Questions with feedback" },
  { type: "poll", label: "Poll", icon: "list", hint: "A vote with no right answer; learners see the results" },
  { type: "rating", label: "Confidence", icon: "star", hint: "A 1 to 5 star rating; learners see the average after rating" },
  { type: "wall", label: "Insight wall", icon: "people", hint: "Learners share an idea, then see what others posted" },
  { type: "response", label: "Reflect", icon: "chat", hint: "A written answer with a model response" },
  { type: "summary", label: "Summary", icon: "spark", hint: "Recap, action and official resources" },
];
// Older card types that existing lessons use but new cards don't need.
const LEGACY_TYPES: typeof CARD_TYPES = [
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
type Photo = { src: string; width: number; height: number; credit?: { name: string; url: string; source: "Pexels"; page?: string } };

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

/** Uploaded images first, then the built-in library. */
function useLibrary() {
  const up = useApi<{ uploads: (Photo & { name: string })[] }>("/api/admin/uploads");
  return { photos: [...(up.data?.uploads ?? []), ...LIBRARY] as Photo[], reload: up.reload };
}

function UploadTile({ onUploaded, className, children }: { onUploaded: (p: Photo) => void; className?: string; children?: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label
        className={cx(
          "flex size-full min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line-strong text-xs font-semibold text-ink-muted hover:border-action hover:text-ink has-[:focus-visible]:outline-2",
          busy && "cursor-wait opacity-60",
        )}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              onUploaded(await uploadImage(file));
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
        <Icon name="upload" className="size-4" /> {busy ? "Uploading…" : (children ?? "Upload")}
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

const TONES: Tone[] = ["teal", "navy", "warm", "gold", "sky"];
const VARIANTS: VisualVariant[] = ["petals", "rings", "grid", "wave", "dots", "arc"];

const textarea = "w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[0.98rem] leading-relaxed";
const words = (s = "") => s.trim().split(/\s+/).filter(Boolean).length;
const scriptOf = (c: Card) => (c.type === "presenter" ? c.transcript : c.type === "audio" ? c.script : c.narration) ?? "";

/** Where a saved lesson stands (see server/authoredLessons). */
export type LessonStatus = { state: "unpublished" | "live" | "changes"; version: string; updatedAt: string | null; publishedAt: string | null };

const savedTime = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });

export function LessonEditor({ initial, isNew, status: initialStatus }: { initial: Lesson; isNew: boolean; status?: LessonStatus }) {
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson>(() => structuredClone(initial));
  const [status, setStatus] = useState<LessonStatus | null>(initialStatus ?? null);
  const [busy, setBusy] = useState<"save" | "publish" | "discard" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [step, setStep] = useState<StepId>("cards");
  const [selected, setSelected] = useState(initial.start);
  const [dirty, setDirty] = useState(false);
  const update = (fn: (l: Lesson) => void) => {
    setLesson((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };
  const checks = useMemo(() => runChecks(lesson), [lesson]);

  /** Save draft: learners keep seeing the published version. A new lesson gets its address on first save. */
  async function save() {
    setBusy("save");
    setSaveError(null);
    setNotice(null);
    try {
      if (isNew) {
        const r = await api<{ slug: string }>("/api/admin/lessons", { body: { lesson } });
        setDirty(false);
        router.replace(`/admin/lessons/${r.slug}/edit`);
        return true;
      }
      const r = await api<{ status: LessonStatus }>(`/api/admin/lessons/${initial.slug}/content`, { method: "PUT", body: { lesson } });
      setStatus(r.status);
      setDirty(false);
      return true;
    } catch (e) {
      setSaveError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (dirty && !(await save())) return;
    setBusy("publish");
    setSaveError(null);
    try {
      const r = await api<{ version: string; status: LessonStatus }>(`/api/admin/lessons/${initial.slug}/content`, { body: { action: "publish" } });
      setLesson((l) => ({ ...l, version: r.version }));
      setStatus(r.status);
      setNotice(`Published version ${r.version}. Learners see it from their next visit; anyone who already finished keeps their completion.`);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    const never = status?.state === "unpublished";
    if (!window.confirm(never ? "Delete this lesson? It has never been published." : "Discard your saved changes and go back to the published version?"))
      return;
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
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
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
    <AdminShell title={isNew ? "New lesson" : "Edit lesson"} back={{ href: "/admin/lessons", label: "Lessons" }}>
      <div className="flex flex-wrap items-center gap-3">
        <Editable
          value={lesson.title}
          onChange={(t) => update((d) => void (d.title = t))}
          placeholder="Lesson title"
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
          <Link
            href={status?.state === "live" && !dirty ? `/learning/${initial.slug}` : `/learning/${initial.slug}?preview=1`}
            className={btn.secondary}
            target="_blank"
            title={dirty ? "Shows your last saved draft. Save first to preview your latest changes." : undefined}
          >
            <Icon name="play" className="size-4" /> Preview
          </Link>
        )}
        <button type="button" className={btn.secondary} onClick={save} disabled={busy !== null || (!dirty && !isNew)}>
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
            ? "Save to keep this lesson as a draft. Learners won’t see it until you publish."
            : dirty
              ? "You have unsaved changes."
              : status?.state === "unpublished"
                ? `Draft saved${status.updatedAt ? ` at ${savedTime(status.updatedAt)}` : ""}. Learners won’t see it until you publish.`
                : status?.state === "changes"
                  ? `Changes saved${status.updatedAt ? ` at ${savedTime(status.updatedAt)}` : ""}. Learners still see version ${status.version} until you publish.`
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
      {notice && <p className="mt-2 rounded-2xl bg-tealtint px-4 py-2 text-sm font-medium">{notice}</p>}
      {saveError && (
        <div className="mt-2">
          <ErrorNote text={saveError} />
        </div>
      )}

      <nav aria-label="Lesson editor" className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
        {STEPS.map((s) => {
          const active = s.id === step;
          const warn = s.id === "review" && checks.some((c) => !c.ok);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              aria-current={active ? "page" : undefined}
              className={cx(
                "-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 font-medium",
                active ? "border-action text-ink" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              <Icon name={s.icon} className="size-4" />
              {s.label}
              {warn && <span className="size-2 rounded-full bg-orange" aria-label="has items to fix" />}
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
        {step === "cards" && !showDraft && <Cards key={round} lesson={lesson} update={update} selected={selected} setSelected={setSelected} isNew={isNew} />}
        {step === "brief" && <Brief lesson={lesson} update={update} isNew={isNew} />}
        {step === "media" && <Media lesson={lesson} update={update} isNew={isNew} />}
        {step === "spaced" && <Spaced lesson={lesson} isNew={isNew} />}
        {step === "review" && <Review lesson={lesson} checks={checks} />}
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

function Brief({ lesson: l, update, isNew }: { lesson: Lesson; update: Update; isNew: boolean }) {
  const [sources, setSources] = useState<string[]>(isNew ? [] : ["Aged Care Act 2024 — Statement of Rights", "Trilogy Care service partner agreement"]);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <Panel title="What is this lesson for?">
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
        </div>
      </Panel>

      <div className="flex flex-col gap-5">
        <Panel title="Source material">
          <p className="text-sm text-ink-muted">
            Lessons are written only from approved sources. Claude uses these, and nothing else, when drafting cards and follow ups.
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
  Anything more advanced (feedback, branching, scripts, calculator maths) lives in the card settings drawer.
*/

const PALETTE: { type: Card["type"]; label: string; icon: IconName }[] = [
  { type: "image", label: "Content", icon: "doc" },
  { type: "quiz", label: "Quiz", icon: "check" },
  { type: "decision", label: "Decision", icon: "route" },
  { type: "poll", label: "Poll", icon: "list" },
  { type: "rating", label: "Rating", icon: "star" },
  { type: "wall", label: "Wall", icon: "people" },
  { type: "listen", label: "Audio", icon: "volume" },
  { type: "presenter", label: "Video", icon: "play" },
  { type: "calculator", label: "Calculator", icon: "sliders" },
  { type: "response", label: "Reflect", icon: "chat" },
  { type: "summary", label: "Summary", icon: "spark" },
];

/** Card types learners interact with, shown in teal; content cards are navy and the summary gold. */
const INTERACTIVE: Card["type"][] = ["quiz", "decision", "poll", "rating", "wall", "calculator", "response"];

/** A tab on the card's top edge naming its type, so it's clear what kind of card you're editing. */
function TypeTag({ card: c }: { card: Card }) {
  const p = PALETTE.find((x) => x.type === c.type) ?? { label: typeInfo(c.type).label, icon: typeInfo(c.type).icon };
  const tone = c.type === "summary" ? "bg-gold text-[#0a1a2e]" : INTERACTIVE.includes(c.type) ? "bg-action text-on-action" : "bg-[#0f2642] text-white";
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
    </span>
  );
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
}: {
  lesson: Lesson;
  update: Update;
  selected: string;
  setSelected: (id: string) => void;
  isNew: boolean;
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

  function remove() {
    if (cards.length <= 1) return;
    if (!window.confirm(`Delete “${card.heading || typeInfo(card.type).label}”?`)) return;
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

  // Try each move on a copy to know whether the buttons work, and why not.
  const why = (dir: -1 | 1) => (card ? moveBlock(structuredClone(l), card.id, dir) : "No card selected.");
  const leftWhy = why(-1);
  const rightWhy = why(1);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1 rounded-3xl bg-muted p-4 sm:p-6">
        <ol className="flex snap-x gap-5 overflow-x-auto pb-3 pt-1" aria-label="Cards">
          {cards.map((c, i) => {
            const on = c.id === card?.id;
            return (
              <li key={c.id} id={`card-${c.id}`} className="flex shrink-0 snap-center flex-col items-center gap-3">
                <p className="max-w-[17rem] truncate font-mulish text-xs font-bold text-ink-muted">
                  {i + 1} · {l.beats[c.beat] ?? "Step"}
                  {c.emphasis === "consequence" && " · after a choice"}
                </p>
                <div className="relative">
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
                <div className={cx("flex gap-1.5", !on && "invisible")} role="toolbar" aria-label="Card actions">
                  <ToolButton icon="sliders" label="Card settings" onClick={() => setInspecting(true)} />
                  <ToolButton icon="arrow-left" label="Move earlier" onClick={() => move(-1)} disabled={on ? leftWhy : "Select the card"} />
                  <ToolButton icon="arrow-right" label="Move later" onClick={() => move(1)} disabled={on ? rightWhy : "Select the card"} />
                  <ToolButton
                    icon="lock"
                    label={card?.requireComplete ? "Required completion is on" : "Make this card required"}
                    pressed={Boolean(card?.requireComplete)}
                    onClick={() => update((d) => void (d.nodes[card.id].requireComplete = !d.nodes[card.id].requireComplete))}
                  />
                  <ToolButton icon="copy" label="Duplicate" onClick={duplicate} />
                  <ToolButton icon="trash" label="Delete" onClick={remove} disabled={cards.length <= 1 ? "A lesson needs at least one card." : null} />
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
        <p className="mt-1 text-sm text-ink-muted" role="status">
          {dropNote ?? "Click any text on a card to change it. Use the pill on a card to change its picture or animation, or drop an image file onto a card."}
        </p>
      </div>

      <aside aria-label="Add a card" className="order-first lg:order-none">
        <div className="flex gap-1.5 overflow-x-auto rounded-3xl bg-surface p-2 shadow-sm ring-1 ring-line lg:sticky lg:top-24 lg:w-28 lg:flex-col">
          {PALETTE.map((p) => (
            <button
              key={p.type}
              type="button"
              onClick={() => add(p.type)}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-2xl px-3 text-sm font-medium hover:bg-muted lg:w-full"
            >
              <Icon name={p.icon} className="size-4 text-ink-muted" /> {p.label}
            </button>
          ))}
        </div>
      </aside>

      {inspecting && card && (
        <Drawer title="Card settings" onClose={() => setInspecting(false)}>
          <CardForm key={card.id} lesson={l} card={card} update={update} isNew={isNew} />
        </Drawer>
      )}
      {picking && l.nodes[picking] && <MediaDialog card={l.nodes[picking]} update={update} onClose={() => setPicking(null)} />}
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
  const gradient = !background ? (c.background ? GRADIENTS[c.background.gradient] : c.type === "listen" ? GRADIENTS.mist : null) : null;
  const surf = background ? tc : gradient ? toneClasses(gradient.text) : null;
  const ph = surf ? surf.placeholder : undefined;
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
            className="absolute right-3 top-3 z-10 inline-flex h-9 items-center gap-1 rounded-full bg-white px-2.5 text-xs font-bold text-[#0f2642] shadow-md hover:bg-white/90"
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
            <div className="flex-1" />
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
              background ? "max-h-[70%]" : "flex-1",
            )}
          >
            {c.bubbles && c.bubbles.length > 0 && (
              <div className="relative">
                <VideoBubbles bubbles={c.bubbles} size="canvas" />
                <button
                  type="button"
                  onClick={onPick}
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-white px-2.5 py-0.5 text-[0.7rem] font-semibold text-[#0f2642] shadow"
                >
                  Edit
                </button>
              </div>
            )}
            <Editable
              value={c.label}
              onChange={(t) => set((x) => void (x.label = t))}
              placeholder="Label"
              className={cx(
                "font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.14em]",
                surf ? surf.soft : c.emphasis === "consequence" ? "text-warm" : "text-accent",
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
            {(c.body || c.type === "image" || c.type === "audio" || c.type === "listen") && (
              <Editable
                value={c.body}
                onChange={(t) => set((x) => void (x.body = t))}
                placeholder="Add some text"
                className="text-[0.95rem] leading-relaxed"
                multiline
                placeholderClass={ph}
              />
            )}
            {c.keyPoints && (
              <ul className={cx("gap-1.5", c.keyPoints.style === "tiles" ? "grid grid-cols-2" : "flex flex-wrap")}>
                {c.keyPoints.items.map((k, i) => (
                  <li
                    key={i}
                    className={cx("text-xs text-ink", c.keyPoints!.style === "tiles" ? "rounded-xl bg-muted p-2" : "rounded-full bg-tealtint px-2.5 py-1")}
                  >
                    <Editable value={k.text} onChange={(t) => set((x) => void (x.keyPoints!.items[i].text = t))} placeholder="Point" />
                  </li>
                ))}
              </ul>
            )}
            <InlineBody card={c} lesson={l} set={set} onSettings={onSettings} />
            <div className="mt-auto flex items-center gap-2 pt-2">
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
                {c.type === "summary"
                  ? c.cta || "Finish"
                  : c.type === "quiz"
                    ? "Check"
                    : c.type === "decision"
                      ? "Choose"
                      : ("cta" in c && c.cta) || "Continue"}
              </span>
            </div>
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
        "absolute left-1/2 z-10 inline-flex min-h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-[#0f2642] shadow-md hover:bg-white/90",
        className,
      )}
    >
      <Icon name="image" className="size-3.5" /> {label}
    </button>
  );
}

/** The interactive part of a card, edited in place: quiz answers, decision choices, summary points. */
function InlineBody({ card: c, lesson: l, set, onSettings }: { card: Card; lesson: Lesson; set: (fn: (x: Card) => void) => void; onSettings: () => void }) {
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
                  q.correct === o.id ? "border-action bg-tealtint" : "border-line-strong",
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
        <div className="rounded-xl border border-dashed border-line-strong p-2 text-xs text-ink-muted">
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
        <div className="flex justify-center gap-1 py-1 text-[#fdb813]" aria-hidden>
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
          <div key={o.id} className="flex items-center gap-2 rounded-xl border border-line-strong px-2.5 py-1.5 text-sm">
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
        <Editable
          value={c.prompt}
          onChange={(t) => set((x) => x.type === "decision" && void (x.prompt = t))}
          placeholder="What do you do?"
          className="font-semibold"
        />
        {c.options.map((o, oi) => (
          <div key={o.id} className={cx("rounded-xl border px-2.5 py-1.5 text-sm", o.correct ? "border-action" : "border-line-strong")}>
            <div className="flex items-start gap-1.5">
              <Editable
                value={o.label}
                onChange={(t) => set((x) => x.type === "decision" && void (x.options[oi].label = t))}
                placeholder={`Choice ${oi + 1}`}
                className="min-w-0 flex-1"
                multiline
              />
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
            <button type="button" onClick={onSettings} className="mt-0.5 text-[0.7rem] text-ink-muted hover:text-accent">
              {o.stay ? "Shows feedback, then try again" : `Goes to: ${(o.next && l.nodes[o.next]?.heading) || "choose a card"}`}
            </button>
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
              <Editable value={p} onChange={(t) => set((x) => x.type === "summary" && void (x.points![i] = t))} placeholder="A point to remember" multiline />
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="self-start text-xs font-semibold text-accent hover:underline"
          onClick={() => set((x) => x.type === "summary" && void (x.points = [...(x.points ?? []), ""]))}
        >
          + Point
        </button>
        <div className="rounded-xl bg-tealtint p-2.5 text-sm text-ink">
          <p className="text-[0.7rem] font-bold uppercase tracking-wider text-accent">Take it to work</p>
          <Editable
            value={c.action}
            onChange={(t) => set((x) => x.type === "summary" && void (x.action = t))}
            placeholder="One thing to do on the job"
            multiline
          />
        </div>
      </div>
    );

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
        <span className="grid size-14 place-items-center rounded-full bg-[#0f2642] text-white shadow-md" aria-hidden>
          <Icon name="volume" className="size-6" />
        </span>
        <div className="w-full rounded-xl bg-white/80 p-2.5 text-left text-sm text-ink">
          <p className="text-[0.7rem] font-bold uppercase tracking-wider text-ink-muted">What the voice says</p>
          <Editable value={c.script} onChange={(t) => set((x) => x.type === "listen" && void (x.script = t))} placeholder="Write the audio script" multiline />
        </div>
        <span className="rounded-xl bg-[#0f2642] px-4 py-2 text-xs font-semibold text-white" aria-hidden>
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
function MediaDialog({ card: c, update, onClose }: { card: Card; update: Update; onClose: () => void }) {
  const set = (fn: (x: Card) => void) => update((d) => fn(d.nodes[c.id]));
  const portrait = c.visual.kind === "presenter" && c.visual.video?.orientation === "portrait";
  return (
    <Drawer title="Picture, background and video" onClose={onClose}>
      <BackgroundField card={c} set={set} />
      <hr className="my-5 border-line" />
      <BubbleField card={c} set={set} />
      <hr className="my-5 border-line" />
      {c.visual.kind !== "none" && (
        <div className={cx("mx-auto mb-5", portrait ? "w-48" : "w-full")}>
          <CardVisual visual={c.visual} className={cx("w-full overflow-hidden rounded-2xl", portrait ? "aspect-[9/16]" : "aspect-[16/10]")} />
        </div>
      )}
      <VisualField card={c} set={set} />
    </Drawer>
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
              <video src={b.src} poster={b.poster} preload="metadata" controls playsInline className="size-28 rounded-full bg-[#0f2642] object-cover" />
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

/** What "Required completion" asks of the learner on this kind of card. */
function requiredHint(c: Card) {
  const v = c.visual;
  if (c.type === "presenter" && v.kind === "presenter" && v.video)
    return v.video.provider === "synthesia" && !v.video.src
      ? "Continue and swiping unlock after the video’s length has passed (Synthesia’s player can’t report when it ends)."
      : "Continue and swiping unlock once the video has played to the end.";
  if (c.type === "response") return "Continue and swiping unlock once they’ve written an answer.";
  if (c.type === "calculator") return "Continue and swiping unlock once they’ve tried the calculator.";
  if (["quiz", "decision", "poll", "rating", "wall"].includes(c.type)) return "Learners already have to answer this card before moving on.";
  if (c.type === "listen" || c.type === "audio" || c.narration) return "Continue and swiping unlock once the audio has played to the end.";
  return "This card has no audio, video or activity to finish. Add narration or a video for this to apply.";
}

function CardForm({ lesson: l, card: c, update, isNew }: { lesson: Lesson; card: Card; update: Update; isNew: boolean }) {
  const set = (fn: (c: Card) => void) => update((d) => fn(d.nodes[c.id]));
  const t = typeInfo(c.type);
  const others = Object.values(l.nodes).filter((n) => n.id !== c.id);
  const script = scriptOf(c);
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
        <label className="flex items-start gap-3 rounded-2xl border border-line-strong p-3 sm:col-span-2">
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-[var(--action)]"
            checked={Boolean(c.requireComplete)}
            onChange={(e) => set((x) => void (x.requireComplete = e.target.checked))}
          />
          <span>
            <span className="flex items-center gap-1.5 font-semibold">
              <Icon name="lock" className="size-4" /> Required completion
            </span>
            <span className="block text-sm text-ink-muted">{requiredHint(c)}</span>
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
        <Field label="On-screen text" hint={`${words(c.body)} words. Keep it to two or three short sentences.`} className="sm:col-span-2">
          <textarea rows={4} className={textarea} value={c.body} onChange={(e) => set((x) => void (x.body = e.target.value))} />
        </Field>

        {c.type === "decision" && <DecisionFields card={c} others={others} set={set} />}
        {c.type === "quiz" && <QuizFields card={c} set={set} />}
        {c.type === "summary" && <SummaryFields card={c} set={set} />}
        {c.type === "calculator" && <CalculatorFields card={c} set={set} />}
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
              <option value="">{c.type === "quiz" ? "Finish the lesson" : "Choose a card…"}</option>
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
                else if (x.type === "audio") x.script = e.target.value;
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
            title={isNew ? "Available once the lesson is saved" : undefined}
          >
            <Icon name={playing ? "pause" : "volume"} className="size-4" /> {playing ? "Stop" : "Listen"}
          </button>
          <ClaudeButton>Write narration from the text</ClaudeButton>
          <audio ref={audio} onEnded={() => setPlaying(false)} className="hidden" />
        </div>
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
      <VisualField card={c} set={set} />
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
            placeholder="Feedback"
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
      <Field label="Action to take" hint="What the learner does next on the job." className="sm:col-span-2">
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
            <input
              key={i}
              className={input}
              value={it.text}
              placeholder={`Point ${i + 1}`}
              onChange={(e) => set((x) => void (x.keyPoints!.items[i].text = e.target.value))}
            />
          ))}
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
  const [text, setText] = useState(video ? videoLinkFor(video) : "");
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

function VisualField({ card: c, set }: { card: Card; set: (fn: (c: Card) => void) => void }) {
  const v = c.visual;
  const library = useLibrary();
  const [pexels, setPexels] = useState(false);
  // Library photos have no credit; Pexels ones bring theirs (and a description for the alt text if there's none).
  const applyPhoto = (p: Photo, suggestedAlt = "") =>
    set((x) => {
      const alt = ("alt" in x.visual ? x.visual.alt : "") || suggestedAlt;
      const photo = { src: p.src, width: p.width, height: p.height, ...(p.credit ? { credit: p.credit } : {}) };
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
            onClick={() => setPexels((o) => !o)}
            className="flex min-h-11 items-center gap-1 rounded-xl border-2 border-dashed border-line-strong px-3 text-xs font-semibold text-ink-muted hover:border-action hover:text-ink"
          >
            <Icon name="search" className="size-4" /> Find on Pexels
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
      {v.kind === "illustration" && v.photo?.credit && (
        <p className="text-xs text-ink-muted">
          Photo by{" "}
          <a href={v.photo.credit.page ?? v.photo.credit.url} target="_blank" rel="noreferrer" className="underline">
            {v.photo.credit.name}
          </a>{" "}
          on Pexels. The credit shows on the card.
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
            <button
              key={p.src}
              type="button"
              onClick={() => applyPhoto(p)}
              className={cx("aspect-[4/3] overflow-hidden rounded-xl border-2", v.photo?.src === p.src ? "border-action" : "border-transparent")}
              aria-label={`Use ${p.src.split("/").pop()}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt="" className="size-full object-cover" />
            </button>
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
      {v.kind === "presenter" && (
        <>
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
      if (!res.ok) throw new Error(data.error ?? "Claude couldn’t draft the lesson.");
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
            Describe the lesson, and attach a policy, procedure or guide if you have one. Claude drafts the cards: a scenario, a decision, a quick check and a
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
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Poster image" aside={<span className="text-sm text-ink-muted">Lesson intro and Learning tile</span>}>
        <StoryVisual {...l.visual} alt={l.visual.alt ?? ""} className="aspect-[16/10] rounded-2xl" />
        <div className="mt-3 grid grid-cols-6 gap-2">
          <UploadTile
            className="aspect-square"
            onUploaded={(p) => {
              update((d) => void (d.visual.photo = p));
              library.reload();
            }}
          />
          {library.photos.map((p) => (
            <button
              key={p.src}
              type="button"
              onClick={() => update((d) => void (d.visual.photo = p))}
              className={cx("aspect-square overflow-hidden rounded-lg border-2", l.visual.photo?.src === p.src ? "border-action" : "border-transparent")}
              aria-label={`Use ${p.src.split("/").pop()}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
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
        {isNew && <p className="mt-3 text-sm text-ink-muted">Voice previews are available once the lesson is saved.</p>}
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
    { when: "Day 0", stage: "Learn", text: "This master lesson", own: true },
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
            <span className="font-semibold">Bring this lesson back with spaced follow ups</span>
            <span className="mt-1 block text-sm text-ink-muted">
              Leave it off for lessons that stand on their own, like Our Mission and Model. Turn it on for rules and processes people need to remember.
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
          <li>You write and approve one master lesson.</li>
          <li>With spaced learning on, Claude writes the Recall, Apply and Refresh follow ups using only your cards.</li>
          <li>You preview each one, regenerate or edit it, then approve.</li>
          <li>Learners get each follow up in their daily digest when it’s due. They don’t choose them from the catalogue.</li>
        </ol>
        {!isNew && (
          <Link href="/admin/lessons" className={cx(btn.secondary, "mt-4")}>
            {live?.state === "live" ? "See the approved follow ups" : "Generate on the Lessons page"} <Icon name="arrow-right" className="size-4" />
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
    { label: "Learners check their understanding", ok: cards.some((c) => c.type === "quiz" || c.type === "decision") },
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

function Review({ lesson: l, checks }: { lesson: Lesson; checks: Check[] }) {
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
          <Field label="What changed in this version" className="mt-3">
            <textarea rows={3} className={textarea} placeholder={`Version ${l.version}: …`} />
          </Field>
          <button type="button" className={cx(btn.primary, "mt-3 w-full")} disabled title="Demo editor: not connected yet">
            Send for review
          </button>
          <p className="mt-2 text-xs text-ink-muted">Learners who already finished keep their completion. Published changes start a new version.</p>
        </Panel>
      </div>
    </div>
  );
}
