"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api, useApi, type Me } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx, formatDate } from "@/lib/format";
import type { GuideAudio, GuideDoc, Narration, NarrationAudio, NarrationLength, Page } from "@/lib/magazine";
import {
  answersOn,
  approveForPublication,
  attachRecording,
  audioOf,
  costEstimateText,
  DEFAULT_AUDIO,
  editWorking,
  formatCost,
  formatSeconds,
  introSnapshot,
  NARRATION_LENGTHS,
  NARRATION_STATES,
  narrationState,
  pageSnapshot,
  playable,
  scriptWarnings,
  secondsFor,
  textHash,
  voiceKey,
  wordCount,
  workingCopy,
  type NarrationState,
} from "@/lib/magazineNarration";
import { estimateWords } from "@/lib/wordTimings";
import type { NarrationJob } from "@/server/narrationJobs";
import type { IntroPageStats } from "@/server/narrationStats";
import { Badge, btn, ErrorNote, input } from "./ui";
import { stream } from "./MagazineAi";
import { Icon } from "../Icon";
import { AvaVideoBadge, AvaVideoSlot, useAvaVideo } from "./AvaVideoSlot";

/*
  Audio Introductions in the editor (docs/magazine-audio-guide.md): the settings in the sidebar, an Audio introduction
  section at the top of each page, and the Audio Introduction Manager (every page together, with bulk actions and
  listening figures). AI drafts the scripts; the author edits and approves them; audio is made in the background only
  when the author asks (server/narrationJobs), and approved again before learners hear it. Editing a script never makes
  audio. Every change is a change to the draft, so Undo reverses it. While a published introduction is being replaced,
  learners keep hearing it until the replacement is approved and the course is published.
*/

/** What the editor's draft holds that the Audio Guide needs. */
type Draft = { title: string; standfirst: string; doc: GuideDoc };
type Change = (fn: (d: Draft) => void, tag?: string) => void;
type DraftedScript = { target: string; script: string; checks: string[] };
/** "intro" for the course introduction, else a page's id. */
type Target = string;
type Speech = { provider: string; model: string; profile: string | null; pricePerMillionChars: number | null; configured: boolean };
type JobsData = { jobs: NarrationJob[]; speech: Speech; perHour: number };

/** The PRD's notice, word for word, when a page has moved on since its introduction was made. */
export const OUTDATED_NOTICE =
  "This page has changed since its voiced introduction was generated. Review the introduction to ensure it still reflects the learning experience.";

const getN = (doc: GuideDoc, t: Target) => (t === "intro" ? doc.audio?.intro : doc.pages.find((p) => p.id === t)?.narration);
function setN(d: Draft, t: Target, n: Narration | undefined) {
  if (t === "intro") {
    d.doc.audio = { ...(d.doc.audio ?? DEFAULT_AUDIO) };
    if (n) d.doc.audio.intro = n;
    else delete d.doc.audio.intro;
    return;
  }
  const p = d.doc.pages.find((x) => x.id === t);
  if (!p) return;
  // A page's introduction needs the course's audio settings: the defaults, the first time.
  if (n && !d.doc.audio) d.doc.audio = structuredClone(DEFAULT_AUDIO);
  if (n) p.narration = n;
  else delete p.narration;
}
const snapshotFor = (draft: Draft, t: Target) => {
  const page = draft.doc.pages.find((p) => p.id === t);
  return t === "intro" || !page ? introSnapshot(draft.title, draft.standfirst, draft.doc) : pageSnapshot(page);
};
/** Where the version being worked on stands. */
const stateOf = (draft: Draft, t: Target): NarrationState => {
  const s = narrationState(workingCopy(getN(draft.doc, t)), snapshotFor(draft, t), audioOf(draft.doc));
  // The course introduction needs no recording: Ava says it on the cover.
  return t === "intro" && s === "unrecorded" ? "current" : s;
};
/** Learners hear this one now (when published): approved, its audio approved, from these words. */
const liveOf = (draft: Draft, t: Target) => {
  const n = getN(draft.doc, t);
  return playable(n, audioOf(draft.doc)) ? n : null;
};
/** Everything the settings ask to be narrated, in course order. A one-page guide's page introduction is its introduction. */
function targetsOf(doc: GuideDoc): Target[] {
  const audio = audioOf(doc);
  const content = doc.pages.filter((p) => p.kind === "content");
  return [...(doc.pages.length > 1 && audio.levels.course ? ["intro"] : []), ...(audio.levels.pages ? content.map((p) => p.id) : [])];
}
const labelOf = (doc: GuideDoc, t: Target) => {
  if (t === "intro") return "Course introduction";
  const i = doc.pages.findIndex((p) => p.id === t);
  return doc.pages.length > 1 ? `Page ${i + 1} · ${doc.pages[i]?.title || "Untitled"}` : "Introduction";
};
const NEEDS_SCRIPT: NarrationState[] = ["none"];
const OUTDATED: NarrationState[] = ["review", "revoice", "rerecord"];
const at = () => new Date().toISOString();

// ---------------------------------------------------------------------------------------------
// Recording jobs: one shared list per course, polled while anything is waiting or running
// ---------------------------------------------------------------------------------------------

type JobStore = { data: JobsData | null; error: string | null; listeners: Set<() => void>; timer: ReturnType<typeof setTimeout> | null; voice: string };
const stores = new Map<string, JobStore>();
function storeFor(guideId: string, voice: string) {
  let s = stores.get(guideId);
  if (!s) stores.set(guideId, (s = { data: null, error: null, listeners: new Set(), timer: null, voice }));
  s.voice = voice;
  return s;
}
async function loadJobs(guideId: string) {
  const s = stores.get(guideId);
  if (!s) return;
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
  try {
    s.data = await api<JobsData>(`/api/admin/magazine/${guideId}/narration/jobs?voice=${encodeURIComponent(s.voice)}`);
    s.error = null;
  } catch (e) {
    s.error = e instanceof Error ? e.message : "Couldn’t load the recordings.";
  }
  s.listeners.forEach((l) => l());
  // Keep looking while something is being made, as long as someone's watching.
  if (s.listeners.size && s.data?.jobs.some((j) => j.status === "queued" || j.status === "running")) s.timer = setTimeout(() => void loadJobs(guideId), 2500);
}
/** The course's recording jobs, and attaching each finished one to the script it was made from. */
function useJobs(guideId: string, draft: Draft, change: Change) {
  const voice = voiceKey(audioOf(draft.doc));
  const store = storeFor(guideId, voice);
  const subscribe = useCallback(
    (cb: () => void) => {
      const s = storeFor(guideId, voice);
      s.listeners.add(cb);
      if (s.listeners.size === 1) void loadJobs(guideId);
      return () => {
        s.listeners.delete(cb);
        if (!s.listeners.size && s.timer) {
          clearTimeout(s.timer);
          s.timer = null;
        }
      };
    },
    [guideId, voice],
  );
  const data = useSyncExternalStore(
    subscribe,
    () => store.data,
    () => null,
  );
  // A finished recording goes with the script it was made from, for the author to listen to and approve. One that's
  // already there, or made from words since changed, is left alone; a failed one changes nothing.
  useEffect(() => {
    if (!data) return;
    const latest = new Map<string, NarrationJob>();
    for (const j of data.jobs) if (j.status === "done" && j.result && !latest.has(j.target)) latest.set(j.target, j);
    const attached: string[] = [];
    for (const [t, j] of latest) {
      if (j.attached) continue;
      const n = getN(draft.doc, t);
      if (attachRecording(n, j.result!, audioOf(draft.doc)) === n) continue;
      change((d) => {
        const cur = getN(d.doc, t);
        const next = attachRecording(cur, j.result!, audioOf(d.doc));
        if (next !== cur) setN(d, t, next);
      });
      j.attached = true;
      attached.push(j.id);
    }
    // Noted on the server, so a recording the author then discards isn't put back.
    if (attached.length) void api(`/api/admin/magazine/${guideId}/narration/jobs`, { body: { action: "attached", jobIds: attached } }).catch(() => {});
  }, [data, draft, change, guideId]);
  const latestJob = (t: Target) => data?.jobs.find((j) => j.target === t) ?? null;
  return { data, error: store.error, latestJob, refresh: () => loadJobs(guideId) };
}

/** What recording these scripts is estimated to cost, where the price is reliable. */
const costLine = (chars: number, speech: Speech | undefined) => (speech ? costEstimateText(chars, speech) : "The cost estimate is loading.");

// ---------------------------------------------------------------------------------------------
// Writing scripts and asking for audio
// ---------------------------------------------------------------------------------------------

function useNarration(guideId: string, draft: Draft, change: Change) {
  const [jobs, setJobs] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const recordings = useJobs(guideId, draft, change);
  // The latest draft, for a request that finishes after more edits.
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  }, [draft]);
  const job = (key: string, text: string | null) =>
    setJobs((j) => {
      const next = { ...j };
      if (text === null) delete next[key];
      else next[key] = text;
      return next;
    });
  const fail = (key: string, e: unknown) => setErrors((x) => ({ ...x, [key]: e instanceof Error ? e.message : "That didn’t work." }));
  const clear = (key: string) =>
    setErrors((x) => {
      const next = { ...x };
      delete next[key];
      return next;
    });

  /** AI writes the scripts for `scope` ("course", "intro" or a page id), only `only` if given. They arrive as drafts. */
  const write = async (scope: string, only: Target[] | null, note: string, key: string) => {
    job(key, "Starting…");
    clear(key);
    try {
      const d = latest.current;
      const out = await stream<{ scripts: DraftedScript[] }>(
        `/api/admin/magazine/${guideId}/narration/draft`,
        { scope, only, note, doc: d.doc, title: d.title, standfirst: d.standfirst },
        (text) => job(key, text),
        "scripts",
      );
      change((x) => {
        for (const s of out.scripts)
          setN(
            x,
            s.target,
            // A new version. A published introduction stays as it is until this one is approved for publication.
            editWorking(getN(x.doc, s.target), audioOf(x.doc), (w) => ({
              ...(w?.hidden && { hidden: true as const }),
              script: s.script,
              status: "draft",
              version: (w?.version ?? 0) + 1,
              ...(s.checks.length && { checks: s.checks }),
            })),
          );
      });
      return true;
    } catch (e) {
      fail(key, e);
      return false;
    } finally {
      job(key, null);
    }
  };

  /** Asks for audio for approved scripts, made in the background. `fresh`: a new take even if these words were recorded before. */
  const record = async (targets: Target[], opts: { fresh?: boolean; confirmed?: boolean; key: string }) => {
    const d = latest.current;
    const items = targets
      .map((t) => ({ target: t, w: workingCopy(getN(d.doc, t)) }))
      .filter((x) => x.w?.status === "approved" && x.w.script.trim())
      .map((x) => ({ target: x.target, script: x.w!.script }));
    if (!items.length) return false;
    job(opts.key, "Asking for the audio…");
    clear(opts.key);
    try {
      await api(`/api/admin/magazine/${guideId}/narration/jobs`, {
        body: { action: "queue", items, voice: voiceKey(audioOf(d.doc)), confirmed: opts.confirmed === true, fresh: opts.fresh === true },
      });
      await recordings.refresh();
      return true;
    } catch (e) {
      fail(opts.key, e);
      return false;
    } finally {
      job(opts.key, null);
    }
  };
  const retry = async (jobId: string, key: string) => {
    clear(key);
    try {
      await api(`/api/admin/magazine/${guideId}/narration/jobs`, { body: { action: "retry", jobId } });
      await recordings.refresh();
    } catch (e) {
      fail(key, e);
    }
  };
  return { jobs, errors, write, record, retry, recordings, fail, clear };
}

// ---------------------------------------------------------------------------------------------
// The sidebar panel: settings and where things stand
// ---------------------------------------------------------------------------------------------

type Voices = {
  topic: { name: string };
  profiles?: { id: string; name: string; summary: string; ready: boolean }[];
  voices: { voiceId: string; name: string; description: string }[];
  openai: { id: string; label: string }[];
  note: string | null;
};

export function AudioGuidePanel({ draft, change, onOpenReview }: { draft: Draft; change: Change; onOpenReview: () => void }) {
  const audio = draft.doc.audio;
  const voices = useApi<Voices>(audio ? "/api/admin/magazine/voices" : null).data;
  const set = (fn: (a: GuideAudio) => void) =>
    change((d) => {
      d.doc.audio = structuredClone(d.doc.audio ?? DEFAULT_AUDIO);
      fn(d.doc.audio);
    });
  const counts = useMemo(() => {
    const c: Partial<Record<NarrationState, number>> = {};
    for (const t of targetsOf(draft.doc)) {
      const s = stateOf(draft, t);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [draft]);
  const total = targetsOf(draft.doc).length;
  const profileName = (id: string) => voices?.profiles?.find((p) => p.id === id)?.name ?? "Magazine Editorial Voice";

  return (
    <section aria-labelledby="audio-guide-h" className="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-sm ring-1 ring-line">
      <h2 id="audio-guide-h" className="flex items-center gap-2 font-semibold">
        <Icon name="volume" className="size-4 text-accent" /> Voiced introductions
      </h2>
      {!audio ? (
        <>
          <p className="text-sm text-ink-muted">
            A short spoken introduction at the top of each page, in the Magazine Editorial Voice: why it matters and what’s ahead, not the page read aloud. AI
            drafts the scripts from your content; you approve them, and the audio, before learners hear anything.
          </p>
          <button type="button" className={btn.secondary} onClick={() => set(() => {})}>
            <Icon name="volume" className="size-4" /> Set up voiced introductions
          </button>
        </>
      ) : (
        <>
          <p className="text-sm" role="status">
            {total === 0
              ? "Nothing to introduce: turn on course or page introductions."
              : `${counts.current ?? 0} of ${total} ready${counts.review ? ` · ${counts.review} may be out of date` : ""}${counts.revoice ? ` · ${counts.revoice} in an earlier voice` : ""}${
                  counts.rerecord ? ` · ${counts.rerecord} to record again` : ""
                }${counts.draft ? ` · ${counts.draft} to approve` : ""}${counts.pending ? ` · ${counts.pending} audio to approve` : ""}${
                  counts.unrecorded ? ` · ${counts.unrecorded} without audio` : ""
                }`}
          </p>
          <button type="button" className={btn.primary} onClick={onOpenReview} disabled={total === 0}>
            <Icon name="list" className="size-4" /> Voiced Introduction Manager
          </button>
          <fieldset className="flex flex-col gap-1.5 text-sm">
            <legend className="mb-1 font-semibold">Introductions</legend>
            {draft.doc.pages.length > 1 && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-action)]"
                  checked={audio.levels.course}
                  onChange={(e) => set((a) => void (a.levels.course = e.target.checked))}
                />
                Course introduction (Ava gives it on the cover)
              </label>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-action)]"
                checked={audio.levels.pages}
                onChange={(e) => set((a) => void (a.levels.pages = e.target.checked))}
              />
              {draft.doc.pages.length > 1 ? "Page introductions" : "Page introduction"}
            </label>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Voice
            <select
              className={cx(input, "font-normal")}
              value={voiceKey(audio)}
              onChange={(e) => {
                const value = e.target.value;
                const v = voices?.voices.find((x) => x.voiceId === value);
                set(
                  (a) =>
                    void (a.voice =
                      value === "profile:editorial"
                        ? { kind: "profile", id: "editorial" }
                        : value.startsWith("openai:")
                          ? { kind: "openai", voice: value.slice("openai:".length) }
                          : v
                            ? { kind: "custom", voiceId: v.voiceId, name: v.name }
                            : { kind: "topic" }),
                );
              }}
            >
              <option value="profile:editorial">{profileName("editorial")} (Alloy, recommended)</option>
              <option value="topic">{voices?.topic.name ?? "The Topic narrator"}</option>
              {(voices?.openai.length ?? 0) > 0 && (
                <optgroup label="OpenAI voices">
                  {voices!.openai.map((v) => (
                    <option key={v.id} value={`openai:${v.id}`}>
                      {v.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {audio.voice.kind === "openai" && !voices?.openai.some((v) => v.id === (audio.voice as { voice: string }).voice) && (
                <option value={`openai:${audio.voice.voice}`}>OpenAI: {audio.voice.voice}</option>
              )}
              {audio.voice.kind === "custom" && !voices?.voices.some((v) => v.voiceId === (audio.voice as { voiceId: string }).voiceId) && (
                <option value={audio.voice.voiceId}>{audio.voice.name}</option>
              )}
              {voices?.voices.map((v) => (
                <option key={v.voiceId} value={v.voiceId}>
                  {v.name}
                  {v.description ? ` (${v.description})` : ""}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-ink-muted">
              {audio.voice.kind === "profile"
                ? (voices?.profiles?.find((p) => p.id === "editorial")?.summary ?? "Alloy, with editorial delivery notes.")
                : "Introductions already recorded in another voice keep playing until you replace them."}
            </span>
            {voices?.note && <span className="text-xs font-normal text-ink-muted">{voices.note}</span>}
          </label>
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="mb-1 font-semibold">Script length</legend>
            {(Object.keys(NARRATION_LENGTHS) as NarrationLength[]).map((l) => (
              <label key={l} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="narration-length"
                  className="size-4 accent-[var(--color-action)]"
                  checked={audio.length === l}
                  onChange={() => set((a) => void (a.length = l))}
                />
                {NARRATION_LENGTHS[l].label} · {NARRATION_LENGTHS[l].seconds}
              </label>
            ))}
          </fieldset>
          <p className="text-sm">
            <span className="font-semibold">Playback:</span> <span className="text-ink-muted">introductions play by themselves as each page opens.</span>
          </p>
          <button
            type="button"
            className="self-start text-xs font-semibold text-accent hover:underline"
            onClick={async () => {
              if (
                !(await confirmAction("Learners won’t hear any introductions. The scripts and recordings are removed from this draft; Undo brings them back.", {
                  title: "Turn off voiced introductions?",
                  confirmLabel: "Turn them off",
                }))
              )
                return;
              change((d) => {
                delete d.doc.audio;
                d.doc.pages.forEach((p) => delete p.narration);
              });
            }}
          >
            Turn off voiced introductions
          </button>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// One introduction: script, audio, approval and visibility
// ---------------------------------------------------------------------------------------------

/** Reads how long a recording plays, in the browser, before it's uploaded. */
function measureAudio(file: File) {
  return new Promise<number>((resolve, reject) => {
    const el = document.createElement("audio");
    const url = URL.createObjectURL(file);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      resolve(Number.isFinite(el.duration) ? Math.round(el.duration * 10) / 10 : 0);
      URL.revokeObjectURL(url);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser can’t read that recording. Try an MP3."));
    };
    el.src = url;
  });
}

function jobText(j: NarrationJob | null, w: Narration | undefined) {
  if (!j || !w || j.scriptHash !== textHash(w.script)) return null;
  if (j.status === "queued") return "Audio queued…";
  if (j.status === "running") return "Making the audio…";
  return null;
}

function NarrationRow({
  draft,
  change,
  target: t,
  actions,
  busy,
  label,
}: {
  draft: Draft;
  change: Change;
  target: Target;
  actions: ReturnType<typeof useNarration>;
  busy: boolean;
  label?: string;
}) {
  const me = useApi<Me>("/api/me").data;
  const who = me?.user.name ?? "An author";
  const n = getN(draft.doc, t);
  const w = workingCopy(n);
  const live = liveOf(draft, t);
  const audio = audioOf(draft.doc);
  const state = stateOf(draft, t);
  const page = draft.doc.pages.find((p) => p.id === t);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [sample, setSample] = useState(false);
  const script = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const words = w ? wordCount(w.script) : 0;
  const { min, max } = NARRATION_LENGTHS[audio.length];
  const warnings = w ? scriptWarnings(w.script, audio.length, page ? answersOn(page) : []) : [];
  const running = actions.jobs[t];
  const error = actions.errors[t];
  const job = actions.recordings.latestJob(t);
  const making = jobText(job, w);
  const failed = job?.status === "failed" && w && job.scriptHash === textHash(w.script) && (!w.audio || w.audio.at < job.createdAt) ? job : null;
  const speech = actions.recordings.data?.speech;
  const replacing = Boolean(live && n?.next);
  const edit = (fn: (x: Narration | undefined) => Narration | undefined, tag?: string) =>
    change((d) => setN(d, t, editWorking(getN(d.doc, t), audioOf(d.doc), fn)), tag);

  const upload = async (f: File | undefined) => {
    if (!f || !w) return;
    actions.clear(t);
    try {
      if (!f.type.startsWith("audio/")) throw new Error("That isn’t an audio file. Upload an MP3.");
      const seconds = await measureAudio(f);
      const form = new FormData();
      form.append("file", f);
      form.append("width", "0");
      form.append("height", "0");
      const res = await fetch("/api/admin/uploads", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { src?: string; error?: string };
      if (!res.ok || !data.src) throw new Error(data.error ?? "The upload didn’t work.");
      const rec: NarrationAudio = {
        src: data.src,
        seconds,
        words: estimateWords(w.script, seconds),
        scriptHash: textHash(w.script),
        voice: "upload",
        at: at(),
        provider: "upload",
        pending: true,
      };
      // The author's own recording of these words: it waits for approval like any other.
      edit((x) => x && { ...x, status: "approved", ...(x.status !== "approved" && { basis: snapshotFor(draft, t) }), audio: rec });
    } catch (e) {
      actions.fail(t, e);
    }
  };

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{label ?? labelOf(draft.doc, t)}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {n?.hidden && <Badge tone="warn">Turned off for learners</Badge>}
          {live && <Badge tone="good">{replacing ? "Published version kept" : "Learners hear this"}</Badge>}
          <Badge tone={NARRATION_STATES[state].tone}>{NARRATION_STATES[state].label}</Badge>
          {w?.version && <span className="text-xs text-ink-muted">Script v{w.version}</span>}
        </div>
      </div>

      {state === "review" && (
        <div role="note" className="flex flex-col gap-2 rounded-xl border border-gold bg-gold/10 p-3 text-sm">
          <p className="font-semibold">{OUTDATED_NOTICE}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btn.secondary}
              disabled={busy}
              onClick={() =>
                change((d) => {
                  const cur = getN(d.doc, t);
                  if (!cur) return;
                  const basis = snapshotFor(d, t);
                  setN(d, t, { ...cur, basis, ...(cur.next && { next: { ...cur.next, basis } }) });
                })
              }
            >
              <Icon name="check" className="size-4" /> It’s still appropriate
            </button>
            <button type="button" className={btn.quiet} onClick={() => script.current?.focus()}>
              <Icon name="pen" className="size-4" /> Update the script
            </button>
            <button type="button" className={btn.quiet} disabled={busy} onClick={() => void actions.write(t, null, "", t)}>
              <Icon name="spark" className="size-4" /> Regenerate the script
            </button>
            {w?.status === "approved" && (
              <button type="button" className={btn.quiet} disabled={busy || Boolean(making)} onClick={() => void actions.record([t], { fresh: true, key: t })}>
                <Icon name="volume" className="size-4" /> Generate replacement audio
              </button>
            )}
          </div>
        </div>
      )}
      {replacing && (
        <p className="rounded-xl bg-tealtint p-3 text-sm">
          You’re working on a replacement. Learners keep hearing the published introduction until you approve this one for publication and publish the course.{" "}
          <button
            type="button"
            className="font-semibold text-accent underline"
            onClick={() =>
              change((d) =>
                setN(
                  d,
                  t,
                  editWorking(getN(d.doc, t), audioOf(d.doc), () => undefined),
                ),
              )
            }
          >
            Discard the replacement
          </button>
        </p>
      )}

      {w ? (
        <>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Script
            <textarea
              ref={script}
              aria-label={`Script: ${labelOf(draft.doc, t)}`}
              className={cx(input, "min-h-32 py-2 font-serif text-[1.02rem] font-normal leading-relaxed")}
              value={w.script}
              maxLength={1200}
              // Editing never makes audio: the author asks for that. In a replacement, audio of the old words goes (the published one stays).
              onChange={(e) => {
                const value = e.target.value;
                const inReplacement = Boolean(live);
                edit((x) => {
                  const next: Narration = { ...(x ?? { status: "draft" as const }), script: value };
                  if (inReplacement && next.audio && next.audio.scriptHash !== textHash(value)) delete next.audio;
                  return next;
                }, `${t}:narration`);
              }}
            />
          </label>
          <p className={cx("text-xs", words < min * 0.6 || words > max * 1.1 ? "font-semibold text-[#8a5a00] dark:text-[#ffd48a]" : "text-ink-muted")}>
            {words} words · about {formatSeconds(secondsFor(words))} spoken · aim for {min} to {max}
          </p>
          {warnings.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-[#8a5a00] dark:text-[#ffd48a]">
              {warnings.map((x) => (
                <li key={x} className="flex items-start gap-1.5">
                  <Icon name="alert" className="mt-0.5 size-4 shrink-0" /> {x}
                </li>
              ))}
            </ul>
          )}
          {state === "rerecord" && (
            <p className="text-sm text-danger">The script has changed since this audio was made. Generate audio again before publishing.</p>
          )}
          {state === "revoice" && <p className="text-sm text-ink-muted">This audio is in an earlier voice. It keeps playing until you replace it.</p>}
        </>
      ) : (
        <p className="text-sm text-ink-muted">No script yet. Generate one from the page, or write your own.</p>
      )}

      {/* The script */}
      <div className="flex flex-wrap items-center gap-2">
        {!w && (
          <button
            type="button"
            className={btn.quiet}
            disabled={busy}
            onClick={() => edit(() => ({ script: " ", status: "draft", version: 1 }))}
            title="Start with an empty script"
          >
            <Icon name="pen" className="size-4" /> Write my own
          </button>
        )}
        <button type="button" className={btn.secondary} disabled={busy} onClick={() => setAsking((a) => !a)}>
          <Icon name="spark" className="size-4" /> {w ? "Regenerate script" : "Generate script"}
        </button>
        {w && w.status === "draft" && (
          <button
            type="button"
            className={btn.primary}
            disabled={busy || !w.script.trim()}
            onClick={() => edit((x) => x && { ...x, script: x.script.trim(), status: "approved", basis: snapshotFor(draft, t) })}
          >
            <Icon name="check" className="size-4" /> Approve script
          </button>
        )}
        {w && w.status === "approved" && !w.audio && (
          <button type="button" className={btn.quiet} disabled={busy} onClick={() => edit((x) => x && { ...x, status: "draft" })}>
            Back to draft
          </button>
        )}
      </div>
      {asking && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setAsking(false);
            void actions.write(t, null, note, t);
            setNote("");
          }}
        >
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
            Anything to change? (optional)
            <input
              className={input}
              value={note}
              maxLength={600}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Less formal, and start with Dot’s question"
            />
          </label>
          <button type="submit" className={btn.secondary} disabled={busy}>
            <Icon name="spark" className="size-4" /> {w ? "Write it again" : "Write it"}
          </button>
        </form>
      )}

      {/* The audio. The course introduction has none here: Ava says it on the cover, live in her voice. */}
      {t === "intro" && w && (
        <p className="text-sm text-ink-muted">Ava says the course introduction on the cover, in her own voice, so it isn’t recorded here.</p>
      )}
      {w && t !== "intro" && (
        <div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3">
          <p className="text-sm font-semibold">Audio</p>
          {w.audio ? (
            <div className="flex flex-col gap-1">
              {/* The script above is its transcript. */}
              <audio controls preload="none" src={w.audio.src} className="h-10 w-full" aria-label={`Preview the audio: ${labelOf(draft.doc, t)}`} />
              <p className="text-xs text-ink-muted">
                {formatSeconds(w.audio.seconds)} · {w.audio.provider === "upload" ? "uploaded" : `made ${formatDate(w.audio.at)}`}
                {w.audio.model ? ` · ${w.audio.model}` : ""}
                {w.audio.cost !== undefined ? ` · ${formatCost(w.audio.cost)} (estimate)` : ""}
                {w.audio.pending ? " · waiting for your approval" : n?.approvedBy && !replacing ? ` · approved by ${n.approvedBy}` : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{w.status === "approved" ? "No audio yet." : "Approve the script first; then generate the audio."}</p>
          )}
          {making && (
            <p className="text-sm font-semibold text-ink-muted" role="status">
              {making}
            </p>
          )}
          {failed && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-danger">The audio couldn’t be made: {failed.error}</span>
              <button type="button" className={btn.quiet} onClick={() => void actions.retry(failed.id, t)}>
                <Icon name="refresh" className="size-4" /> Try again
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {w.status === "approved" && (
              <button
                type="button"
                className={w.audio ? btn.quiet : btn.primary}
                disabled={busy || Boolean(making) || speech?.configured === false}
                onClick={() => void actions.record([t], { fresh: Boolean(w.audio), key: t })}
              >
                <Icon name="volume" className="size-4" /> {w.audio ? "Regenerate audio" : "Generate audio"}
              </button>
            )}
            {w.status === "approved" && w.audio?.pending && w.audio.scriptHash === textHash(w.script) && (
              <button
                type="button"
                className={btn.primary}
                disabled={busy}
                onClick={() => change((d) => setN(d, t, approveForPublication(getN(d.doc, t), who, at())))}
              >
                <Icon name="check" className="size-4" /> Approve for publication
              </button>
            )}
            <button type="button" className={btn.quiet} disabled={busy} onClick={() => file.current?.click()}>
              <Icon name="upload" className="size-4" /> Upload audio
            </button>
            <input
              ref={file}
              type="file"
              accept="audio/mpeg,.mp3"
              className="hidden"
              onChange={(e) => void upload(e.target.files?.[0]).finally(() => (e.target.value = ""))}
            />
            <button type="button" className={btn.quiet} onClick={() => setSample((s) => !s)} aria-expanded={sample}>
              <Icon name="play" className="size-4" /> Preview voice
            </button>
          </div>
          {w.status === "approved" && speech && <p className="text-xs text-ink-muted">{costLine(w.script.length, speech)}</p>}
          {sample && (
            // A sample of the course's voice: made once per voice and model, then kept.
            <audio
              controls
              preload="none"
              src={`/api/admin/magazine/voices/preview?voice=${encodeURIComponent(voiceKey(audio))}`}
              className="h-10 w-full"
              aria-label="A sample of the voice"
            />
          )}
        </div>
      )}

      {/* Visibility and removing */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {n && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-action)]"
              checked={!n.hidden}
              onChange={(e) =>
                change((d) => {
                  const cur = getN(d.doc, t);
                  if (!cur) return;
                  const { hidden: _h, ...rest } = cur;
                  void _h;
                  setN(d, t, e.target.checked ? rest : { ...rest, hidden: true });
                })
              }
            />
            Show to learners
          </label>
        )}
        {n && (
          <button
            type="button"
            className={btn.quiet}
            disabled={busy}
            onClick={async () => {
              if (
                live &&
                !(await confirmAction("Learners stop hearing this introduction once the course is published again. Undo brings it back.", {
                  title: "Remove the introduction?",
                  confirmLabel: "Remove",
                  danger: true,
                }))
              )
                return;
              change((d) => setN(d, t, undefined));
            }}
          >
            <Icon name="trash" className="size-4" /> Remove
          </button>
        )}
      </div>
      {running && (
        <p className="text-sm text-ink-muted" role="status">
          {running}
        </p>
      )}
      {error && <ErrorNote text={error} />}
    </article>
  );
}

// ---------------------------------------------------------------------------------------------
// The Audio Introduction Manager: every introduction in the course together
// ---------------------------------------------------------------------------------------------

function scriptStatus(w: Narration | undefined) {
  if (!w) return "None";
  return `${w.status === "approved" ? "Approved" : "Draft"}${w.version ? ` · v${w.version}` : ""}`;
}
function audioStatus(w: Narration | undefined, job: NarrationJob | null, state: NarrationState) {
  const forThis = job && w && job.scriptHash === textHash(w.script) && (!w.audio || w.audio.at < job.createdAt);
  if (forThis && job.status === "queued") return "Queued";
  if (forThis && job.status === "running") return "Generating";
  if (forThis && job.status === "failed") return "Failed";
  if (!w?.audio) return "None";
  if (state === "rerecord") return "Doesn’t match the script";
  if (w.audio.pending) return "To approve";
  if (state === "revoice") return "Earlier voice";
  return w.audio.provider === "upload" ? "Uploaded" : "Generated";
}

export function NarrationReview({ guideId, draft, change, onClose }: { guideId: string; draft: Draft; change: Change; onClose: () => void }) {
  const actions = useNarration(guideId, draft, change);
  const me = useApi<Me>("/api/me").data;
  const [tab, setTab] = useState<"pages" | "listening">("pages");
  const [outdated, setOutdated] = useState(false);
  const [selected, setSelected] = useState<Set<Target>>(new Set());
  const [open, setOpen] = useState<Target | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const preview = useRef<HTMLAudioElement>(null);
  const targets = targetsOf(draft.doc);
  const states = Object.fromEntries(targets.map((t) => [t, stateOf(draft, t)])) as Record<Target, NarrationState>;
  const work = (t: Target) => workingCopy(getN(draft.doc, t));
  const missing = targets.filter((t) => NEEDS_SCRIPT.includes(states[t]));
  const drafts = targets.filter((t) => states[t] === "draft");
  // Audio is for pages: the course introduction is spoken live by Ava on the cover.
  const toRecord = targets.filter((t) => t !== "intro" && (states[t] === "unrecorded" || states[t] === "rerecord"));
  const toApprove = targets.filter((t) => t !== "intro" && states[t] === "pending");
  const chosen = targets.filter((t) => selected.has(t));
  const chosenApproved = chosen.filter((t) => t !== "intro" && work(t)?.status === "approved");
  const busy = Object.keys(actions.jobs).length > 0;
  const shown = outdated ? targets.filter((t) => OUTDATED.includes(states[t])) : targets;
  const speech = actions.recordings.data?.speech;
  const chars = (ts: Target[]) => ts.reduce((n, t) => n + (work(t)?.script.length ?? 0), 0);
  const who = me?.user.name ?? "An author";

  const writeScripts = async (ts: Target[], again: boolean) => {
    if (
      !(await confirmAction(
        `${again ? "Writes these" : "Writes the"} ${ts.length} ${ts.length === 1 ? "script" : "scripts"} with AI in one request, from the course as it is now. They arrive as drafts for you to edit and approve; a published introduction stays until its replacement is approved. Script writing is a paid AI request; its cost isn’t estimated here.`,
        { title: again ? "Regenerate the selected scripts?" : "Generate the missing scripts?", confirmLabel: again ? "Regenerate" : "Generate" },
      ))
    )
      return;
    await actions.write("course", ts, "", "all");
  };
  const recordAudio = async (ts: Target[], fresh: boolean) => {
    if (
      !(await confirmAction(
        `Makes audio for ${ts.length} approved ${ts.length === 1 ? "script" : "scripts"} in ${speech?.profile === "editorial" ? "the Magazine Editorial Voice" : "the course’s voice"}, in the background. ${costLine(chars(ts), speech)} Each recording waits for your approval; nothing learners hear changes until then.`,
        { title: fresh ? "Regenerate audio?" : "Generate audio for approved scripts?", confirmLabel: "Generate audio" },
      ))
    )
      return;
    await actions.record(ts, { fresh, confirmed: true, key: "all" });
  };
  const togglePreview = (t: Target, src: string) => {
    const el = preview.current;
    if (!el) return;
    if (playing === t) {
      el.pause();
      return;
    }
    el.src = src;
    void el.play().catch(() => {});
    setPlaying(t);
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="narration-review-h" className="fixed inset-0 z-50 overflow-y-auto bg-[#0b1626]/70 p-2 sm:p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 rounded-3xl bg-bg p-4 shadow-2xl sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="narration-review-h" className="flex items-center gap-2 font-serif text-2xl font-semibold">
              <Icon name="volume" className="size-6 text-accent" /> Voiced Introduction Manager
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              Every page’s spoken introduction. AI drafts each script from the page; you edit and approve it; audio is made only when you ask, and waits for
              your approval. Learners hear nothing new until it’s approved and the course is published, and a published introduction keeps playing until its
              replacement is approved.
            </p>
          </div>
          <button type="button" className={btn.quiet} onClick={onClose}>
            Close
          </button>
        </div>
        <div role="tablist" aria-label="Manager views" className="flex gap-1 border-b border-line">
          {(
            [
              ["pages", "Introductions"],
              ["listening", "Listening"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cx(
                "min-h-11 border-b-2 px-4 font-semibold",
                tab === k ? "border-action text-ink" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "listening" ? (
          <ListeningView guideId={guideId} draft={draft} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 ring-1 ring-line">
              <button type="button" className={btn.primary} disabled={busy || !missing.length} onClick={() => void writeScripts(missing, false)}>
                <Icon name="spark" className="size-4" /> Generate missing scripts ({missing.length})
              </button>
              {drafts.length > 0 && (
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={busy}
                  onClick={() =>
                    change((d) => {
                      for (const t of drafts)
                        setN(
                          d,
                          t,
                          editWorking(getN(d.doc, t), audioOf(d.doc), (x) =>
                            x && x.script.trim() ? { ...x, script: x.script.trim(), status: "approved", basis: snapshotFor(d, t) } : x,
                          ),
                        );
                    })
                  }
                >
                  <Icon name="check" className="size-4" /> Approve all scripts ({drafts.length})
                </button>
              )}
              <button
                type="button"
                className={btn.secondary}
                disabled={busy || !toRecord.length || speech?.configured === false}
                onClick={() => void recordAudio(toRecord, false)}
              >
                <Icon name="volume" className="size-4" /> Generate audio for approved scripts ({toRecord.length})
              </button>
              {toApprove.length > 0 && (
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !(await confirmAction(
                        `Approves ${toApprove.length} recordings for publication. Listen to each one first: learners hear them once the course is published.`,
                        {
                          title: "Approve the audio?",
                          confirmLabel: "Approve",
                        },
                      ))
                    )
                      return;
                    const when = at();
                    change((d) => {
                      for (const t of toApprove) setN(d, t, approveForPublication(getN(d.doc, t), who, when));
                    });
                  }}
                >
                  <Icon name="check" className="size-4" /> Approve audio ({toApprove.length})
                </button>
              )}
              <label className="ml-auto flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--color-action)]" checked={outdated} onChange={(e) => setOutdated(e.target.checked)} />
                Outdated only ({targets.filter((t) => OUTDATED.includes(states[t])).length})
              </label>
            </div>
            {chosen.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-tealtint p-3 text-sm">
                <span className="font-semibold">{chosen.length} selected</span>
                <button type="button" className={btn.secondary} disabled={busy} onClick={() => void writeScripts(chosen, true)}>
                  <Icon name="spark" className="size-4" /> Regenerate scripts
                </button>
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={busy || !chosenApproved.length || speech?.configured === false}
                  onClick={() => void recordAudio(chosenApproved, true)}
                >
                  <Icon name="volume" className="size-4" /> Regenerate audio ({chosenApproved.length})
                </button>
                <button type="button" className={btn.quiet} onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              </div>
            )}
            {(actions.jobs.all || actions.recordings.data?.jobs.some((j) => j.status === "queued" || j.status === "running")) && (
              <p className="text-sm font-semibold text-ink-muted" role="status">
                {actions.jobs.all ??
                  `Making audio: ${actions.recordings.data!.jobs.filter((j) => j.status === "queued" || j.status === "running").length} to go. You can keep working; finished recordings appear here to approve.`}
              </p>
            )}
            {actions.errors.all && <ErrorNote text={actions.errors.all} />}
            {targets.length === 0 && <p className="text-ink-muted">Nothing to introduce: turn on course or page introductions in the settings.</p>}
            <audio ref={preview} preload="none" className="hidden" onPause={() => setPlaying(null)} onEnded={() => setPlaying(null)} />
            <div className="overflow-x-auto rounded-2xl ring-1 ring-line">
              <table className="w-full min-w-[56rem] border-collapse bg-surface text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th scope="col" className="w-10 p-3">
                      <input
                        type="checkbox"
                        aria-label="Select every introduction shown"
                        className="size-4 accent-[var(--color-action)]"
                        checked={shown.length > 0 && shown.every((t) => selected.has(t))}
                        onChange={(e) => setSelected(new Set(e.target.checked ? shown : []))}
                      />
                    </th>
                    <th scope="col" className="p-3">
                      Page
                    </th>
                    <th scope="col" className="p-3">
                      Script
                    </th>
                    <th scope="col" className="p-3">
                      Audio
                    </th>
                    <th scope="col" className="p-3">
                      Approval
                    </th>
                    <th scope="col" className="p-3">
                      Duration
                    </th>
                    <th scope="col" className="p-3">
                      Last generated
                    </th>
                    <th scope="col" className="p-3">
                      Review
                    </th>
                    <th scope="col" className="p-3">
                      <span className="sr-only">Preview and edit</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((t) => {
                    const n = getN(draft.doc, t);
                    const w = workingCopy(n);
                    const job = actions.recordings.latestJob(t);
                    const live = liveOf(draft, t);
                    const heard = w?.audio ?? live?.audio;
                    return (
                      <tr key={t} className="border-b border-line align-top last:border-0">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${labelOf(draft.doc, t)}`}
                            className="size-4 accent-[var(--color-action)]"
                            checked={selected.has(t)}
                            onChange={(e) =>
                              setSelected((s) => {
                                const next = new Set(s);
                                if (e.target.checked) next.add(t);
                                else next.delete(t);
                                return next;
                              })
                            }
                          />
                        </td>
                        <th scope="row" className="p-3 text-left font-semibold">
                          {labelOf(draft.doc, t)}
                          {n?.hidden && <span className="block text-xs font-normal text-ink-muted">Turned off for learners</span>}
                          {live && n?.next && <span className="block text-xs font-normal text-ink-muted">Replacement in progress</span>}
                        </th>
                        <td className="p-3">{scriptStatus(w)}</td>
                        <td className="p-3">
                          {audioStatus(w, job, states[t])}
                          {job?.status === "failed" && audioStatus(w, job, states[t]) === "Failed" && (
                            <button type="button" className="ml-2 font-semibold text-accent underline" onClick={() => void actions.retry(job.id, "all")}>
                              Retry
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          {live ? (
                            <>
                              Approved{n?.approvedBy ? ` by ${n.approvedBy}` : ""}
                              {n?.approvedAt && <span className="block text-xs text-ink-muted">{formatDate(n.approvedAt)}</span>}
                            </>
                          ) : w?.audio?.pending ? (
                            "Audio to approve"
                          ) : (
                            "Not yet"
                          )}
                        </td>
                        <td className="p-3 tabular-nums">
                          {heard ? formatSeconds(heard.seconds) : w ? `≈ ${formatSeconds(secondsFor(wordCount(w.script)))}` : "—"}
                        </td>
                        <td className="p-3">{heard ? formatDate(heard.at) : "—"}</td>
                        <td className="p-3">
                          {OUTDATED.includes(states[t]) ? <Badge tone={NARRATION_STATES[states[t]].tone}>{NARRATION_STATES[states[t]].label}</Badge> : "—"}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1">
                            {heard && (
                              <button
                                type="button"
                                className={btn.quiet}
                                onClick={() => togglePreview(t, heard.src)}
                                aria-label={`${playing === t ? "Pause" : "Preview"} ${labelOf(draft.doc, t)}`}
                              >
                                <Icon name={playing === t ? "pause" : "play"} className="size-4" />
                              </button>
                            )}
                            <button type="button" className={btn.quiet} aria-expanded={open === t} onClick={() => setOpen((o) => (o === t ? null : t))}>
                              {open === t ? "Close" : "Edit"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {outdated && shown.length === 0 && <p className="text-ink-muted">Nothing is out of date.</p>}
            {open && targets.includes(open) && (
              <div className="flex flex-col gap-2">
                <NarrationRow draft={draft} change={change} target={open} actions={actions} busy={busy} />
                {/* Ava's video for the course introduction: it plays on the cover, before the cover picture. */}
                {open === "intro" && <AvaVideoSlot lineKey={`magazine:${guideId}:intro`} script={draft.doc.audio?.intro?.script} />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Listening to the introductions, by page: totals only. Listening is never needed to finish a page. */
function ListeningView({ guideId, draft }: { guideId: string; draft: Draft }) {
  const { data, error } = useApi<{ pages: IntroPageStats[]; listeners: number; seconds: number }>(`/api/admin/magazine/${guideId}/narration/stats`);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  const rows = draft.doc.pages.filter((p) => p.kind === "content").map((p) => ({ page: p, s: data.pages.find((x) => x.pageId === p.id) }));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        From the published editions: {data.listeners} {data.listeners === 1 ? "person has" : "people have"} listened, for {formatSeconds(data.seconds)} in all.
        Totals only, never who. Listening is optional and isn’t evidence of learning; the comparison with finishing the page shows once both groups have five
        people or more.
      </p>
      <div className="overflow-x-auto rounded-2xl ring-1 ring-line">
        <table className="w-full min-w-[52rem] border-collapse bg-surface text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
              {[
                "Page",
                "Plays",
                "Listeners",
                "Listened",
                "Average reached",
                "Finished",
                "Replays",
                "Transcript",
                "Speeds",
                "Finished the page: listened / didn’t",
              ].map((h) => (
                <th key={h} scope="col" className="p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ page, s }) => (
              <tr key={page.id} className="border-b border-line last:border-0">
                <th scope="row" className="p-3 text-left font-semibold">
                  {labelOf(draft.doc, page.id)}
                </th>
                <td className="p-3 tabular-nums">{s?.plays ?? 0}</td>
                <td className="p-3 tabular-nums">{s?.listeners ?? 0}</td>
                <td className="p-3 tabular-nums">{s ? formatSeconds(s.seconds) : "0:00"}</td>
                <td className="p-3 tabular-nums">{s?.percent != null ? `${s.percent}%` : "—"}</td>
                <td className="p-3 tabular-nums">{s?.completed ?? 0}</td>
                <td className="p-3 tabular-nums">{s?.replays ?? 0}</td>
                <td className="p-3 tabular-nums">{s?.transcripts ?? 0}</td>
                <td className="p-3">
                  {s && Object.keys(s.speeds).length
                    ? Object.entries(s.speeds)
                        .map(([k, v]) => `${k} ${v}`)
                        .join(", ")
                    : "—"}
                </td>
                <td className="p-3 tabular-nums">
                  {s?.finishedAfterListening != null && s.finishedWithoutListening != null
                    ? `${s.finishedAfterListening}% / ${s.finishedWithoutListening}%`
                    : "Too few to compare"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
  On the course outline, under the cover: the course introduction's script (Ava gives it on the cover, in her voice) and
  her video for it, collapsed to a line until opened, like a page's section.
*/
export function CourseIntroStrip({ guideId, draft, change }: { guideId: string; draft: Draft; change: Change }) {
  const actions = useNarration(guideId, draft, change);
  const narrated = Boolean(draft.doc.audio?.levels.course);
  const state = stateOf(draft, "intro");
  const intro = workingCopy(draft.doc.audio?.intro);
  const [open, setOpen] = useState(false);
  const busy = Object.keys(actions.jobs).length > 0;
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group rounded-2xl border border-action/25 bg-tealtint">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm">
        <Icon name="volume" className="size-4 text-accent" />
        <span className="font-semibold">Course introduction and Ava’s video</span>
        {narrated && <Badge tone={NARRATION_STATES[state].tone}>{NARRATION_STATES[state].label}</Badge>}
        <AvaVideoBadge lineKey={`magazine:${guideId}:intro`} />
        {intro && !open && <span className="min-w-0 flex-1 truncate text-ink-muted">“{intro.script}”</span>}
        <Icon name="chevron-down" className="ml-auto size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {open && <AvaVideoSlot lineKey={`magazine:${guideId}:intro`} script={draft.doc.audio?.intro?.script} />}
        {narrated ? (
          <NarrationRow draft={draft} change={change} target="intro" actions={actions} busy={busy} label="Course introduction" />
        ) : (
          <p className="rounded-2xl bg-surface p-4 text-sm text-ink-muted">
            The course introduction is off (Voiced introductions, in the sidebar). Ava’s video can still go on the cover.
          </p>
        )}
      </div>
    </details>
  );
}

/** At the top of a page in the editor: its Audio introduction section, and Ava's video for it, collapsed to a line until opened. */
export function PageNarrationStrip({ guideId, draft, change, page }: { guideId: string; draft: Draft; change: Change; page: Page }) {
  const actions = useNarration(guideId, draft, change);
  const state = stateOf(draft, page.id);
  const [open, setOpen] = useState(false);
  const busy = Object.keys(actions.jobs).length > 0;
  const w = workingCopy(page.narration);
  // Ava's video in the page's header overrides this introduction (the owner, Nov 2026): learners see her instead of
  // hearing it, so it's greyed out here, still there for when her video is removed. (A one-page guide's is the course's.)
  const ava = useAvaVideo(draft.doc.pages.length > 1 ? `magazine:${guideId}:page:${page.id}` : `magazine:${guideId}:intro`).has;
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={cx("group rounded-2xl border", ava ? "border-line bg-muted" : "border-action/25 bg-tealtint")}
    >
      <summary className={cx("flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm", ava && "text-ink-muted")}>
        <Icon name="volume" className={cx("size-4", ava ? "text-ink-muted" : "text-accent")} />
        <span className="font-semibold">Voiced introduction</span>
        {ava ? (
          <Badge tone="neutral">Not used: Ava’s video plays instead</Badge>
        ) : (
          <Badge tone={NARRATION_STATES[state].tone}>{NARRATION_STATES[state].label}</Badge>
        )}
        {w && !open && <span className="min-w-0 flex-1 truncate text-ink-muted">“{w.script}”</span>}
        <Icon name="chevron-down" className="ml-auto size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {ava && (
          <p role="note" className="rounded-xl bg-surface px-3 py-2 text-sm">
            This page has Ava’s video in its header, so learners see her instead of hearing this introduction. It’s kept here for if her video is removed.
          </p>
        )}
        <div className={cx(ava && "opacity-60 grayscale")}>
          <NarrationRow
            draft={draft}
            change={change}
            target={page.id}
            actions={actions}
            busy={busy}
            label={draft.doc.pages.length > 1 ? "Page introduction" : "Introduction"}
          />
        </div>
        {/* Ava's video for the page is set beside its picture, in the page's header ("Ava in the header"). */}
      </div>
    </details>
  );
}
