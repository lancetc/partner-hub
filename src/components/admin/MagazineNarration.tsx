"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx } from "@/lib/format";
import type { GuideAudio, GuideDoc, Narration, NarrationAudio, NarrationLength, Page } from "@/lib/magazine";
import {
  answersOn,
  audioOf,
  DEFAULT_AUDIO,
  formatSeconds,
  introSnapshot,
  NARRATION_LENGTHS,
  NARRATION_STATES,
  narrationState,
  pageSnapshot,
  scriptWarnings,
  secondsFor,
  wordCount,
  type NarrationState,
} from "@/lib/magazineNarration";
import { Badge, btn, ErrorNote, input } from "./ui";
import { stream } from "./MagazineAi";
import { Icon } from "../Icon";
import { AvaVideoSlot } from "./AvaVideoSlot";

/*
  The Audio Guide in the editor (docs/magazine-audio-guide.md): its settings in the sidebar, the
  narration review (every script together, in course order), and a strip at the top of each page.
  Claude drafts the scripts; the author edits and approves them; ElevenLabs records approved ones.
  Every step is a change to the draft, so Undo reverses it, and nothing is heard by learners until a
  script is approved, recorded and published.
*/

/** What the editor's draft holds that the Audio Guide needs. */
type Draft = { title: string; standfirst: string; doc: GuideDoc };
type Change = (fn: (d: Draft) => void, tag?: string) => void;
type DraftedScript = { target: string; script: string; checks: string[] };
/** "intro" for the course introduction, else a page's id. */
type Target = string;

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
  if (n) p.narration = n;
  else delete p.narration;
}
const snapshotFor = (draft: Draft, t: Target) => {
  const page = draft.doc.pages.find((p) => p.id === t);
  return t === "intro" || !page ? introSnapshot(draft.title, draft.standfirst, draft.doc) : pageSnapshot(page);
};
const stateOf = (draft: Draft, t: Target) => narrationState(getN(draft.doc, t), snapshotFor(draft, t), audioOf(draft.doc));
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
const voiceParam = (a: GuideAudio) => (a.voice.kind === "custom" ? a.voice.voiceId : a.voice.kind === "openai" ? `openai:${a.voice.voice}` : "topic");
const STATE_TONE: Record<NarrationState, "good" | "warn" | "bad" | "neutral"> = {
  none: "neutral",
  draft: "neutral",
  unrecorded: "neutral",
  rerecord: "bad",
  review: "warn",
  current: "good",
};
const NEEDS_WORK: NarrationState[] = ["none", "review"];

/** Drafting and recording, with progress and errors by script. */
function useNarration(guideId: string, draft: Draft, change: Change) {
  const [jobs, setJobs] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The latest draft, for a recording that finishes after more edits.
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

  /** Claude writes the scripts for `scope` ("course", "intro" or a page id), only `only` if given. They arrive as drafts. */
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
        for (const s of out.scripts) setN(x, s.target, { script: s.script, status: "draft", ...(s.checks.length && { checks: s.checks }) });
      });
      return true;
    } catch (e) {
      fail(key, e);
      return false;
    } finally {
      job(key, null);
    }
  };

  /** ElevenLabs records an approved script; the recording is attached if the script hasn't changed meanwhile. */
  const record = async (t: Target) => {
    const n = getN(latest.current.doc, t);
    if (!n || n.status !== "approved") return false;
    job(t, "Recording…");
    clear(t);
    try {
      const a = await api<NarrationAudio>(`/api/admin/magazine/${guideId}/narration/record`, {
        body: { script: n.script, voice: voiceParam(audioOf(latest.current.doc)), target: t },
      });
      change((x) => {
        const cur = getN(x.doc, t);
        if (cur && cur.script === n.script) setN(x, t, { ...cur, audio: a });
      });
      return true;
    } catch (e) {
      fail(t, e);
      return false;
    } finally {
      job(t, null);
    }
  };
  return { jobs, errors, write, record };
}

// ---------------------------------------------------------------------------------------------
// The sidebar panel: settings and where things stand
// ---------------------------------------------------------------------------------------------

export function AudioGuidePanel({ draft, change, onOpenReview }: { draft: Draft; change: Change; onOpenReview: () => void }) {
  const audio = draft.doc.audio;
  const voices = useApi<{
    topic: { name: string };
    voices: { voiceId: string; name: string; description: string }[];
    openai: { id: string; label: string }[];
    note: string | null;
  }>(audio ? "/api/admin/magazine/voices" : null).data;
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

  return (
    <section aria-labelledby="audio-guide-h" className="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-sm ring-1 ring-line">
      <h2 id="audio-guide-h" className="flex items-center gap-2 font-semibold">
        <Icon name="volume" className="size-4 text-accent" /> Audio guide
      </h2>
      {!audio ? (
        <>
          <p className="text-sm text-ink-muted">
            A friendly voice that introduces the course and each page in 15 to 45 seconds: a question or a challenge to start, not the page read aloud. Claude
            drafts the scripts from your content; you approve them before anything is recorded.
          </p>
          <button type="button" className={btn.secondary} onClick={() => set(() => {})}>
            <Icon name="volume" className="size-4" /> Set up the audio guide
          </button>
        </>
      ) : (
        <>
          <p className="text-sm" role="status">
            {total === 0
              ? "Nothing to narrate: turn on course or page introductions."
              : `${counts.current ?? 0} of ${total} narrated${counts.review ? ` · ${counts.review} may be out of date` : ""}${counts.rerecord ? ` · ${counts.rerecord} to record again` : ""}${
                  counts.draft ? ` · ${counts.draft} to approve` : ""
                }${counts.unrecorded ? ` · ${counts.unrecorded} to record` : ""}`}
          </p>
          <div className="flex flex-col gap-2">
            <button type="button" className={btn.primary} onClick={onOpenReview} disabled={total === 0}>
              <Icon name="spark" className="size-4" /> {counts.none === total ? "Generate Magazine Narration" : "Open narration review"}
            </button>
          </div>
          <fieldset className="flex flex-col gap-1.5 text-sm">
            <legend className="mb-1 font-semibold">Narration</legend>
            {draft.doc.pages.length > 1 && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-action)]"
                  checked={audio.levels.course}
                  onChange={(e) => set((a) => void (a.levels.course = e.target.checked))}
                />
                Course introduction
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
            <label className="flex items-center gap-2 text-ink-muted" title="Coming in a later phase">
              <input type="checkbox" className="size-4" checked={false} disabled />
              Audio on selected blocks (coming later)
            </label>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Voice
            <select
              className={cx(input, "font-normal")}
              value={audio.voice.kind === "topic" ? "topic" : audio.voice.kind === "openai" ? `openai:${audio.voice.voice}` : audio.voice.voiceId}
              onChange={(e) => {
                const value = e.target.value;
                const v = voices?.voices.find((x) => x.voiceId === value);
                set(
                  (a) =>
                    void (a.voice = value.startsWith("openai:")
                      ? { kind: "openai", voice: value.slice("openai:".length) }
                      : v
                        ? { kind: "custom", voiceId: v.voiceId, name: v.name }
                        : { kind: "topic" }),
                );
              }}
            >
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
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="mb-1 font-semibold">Playback</legend>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="narration-playback"
                className="mt-0.5 size-4 accent-[var(--color-action)]"
                checked={audio.playback === "auto"}
                onChange={() => set((a) => void (a.playback = "auto"))}
              />
              <span>
                Play automatically (recommended)
                <span className="block text-xs text-ink-muted">
                  Each introduction plays as learners arrive on a page they haven’t finished. They get an Audio guide switch to turn it off, and pause and mute
                  on the card.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="narration-playback"
                className="mt-0.5 size-4 accent-[var(--color-action)]"
                checked={audio.playback === "press-play"}
                onChange={() => set((a) => void (a.playback = "press-play"))}
              />
              <span>Learner presses Play</span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="narration-playback"
                className="mt-0.5 size-4 accent-[var(--color-action)]"
                checked={audio.playback === "offer-auto"}
                onChange={() => set((a) => void (a.playback = "offer-auto"))}
              />
              <span>
                Offer automatic playback after the learner opts in
                <span className="block text-xs text-ink-muted">The same switch, but off until each learner turns it on.</span>
              </span>
            </label>
          </fieldset>
          <button
            type="button"
            className="self-start text-xs font-semibold text-accent hover:underline"
            onClick={async () => {
              if (
                !(await confirmAction("Learners won’t hear any narration. The scripts and recordings are removed from this draft; Undo brings them back.", {
                  title: "Turn off the audio guide?",
                  confirmLabel: "Turn it off",
                }))
              )
                return;
              change((d) => {
                delete d.doc.audio;
                d.doc.pages.forEach((p) => delete p.narration);
              });
            }}
          >
            Turn off the audio guide
          </button>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// One script: edit, approve, write again, record
// ---------------------------------------------------------------------------------------------

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
  const n = getN(draft.doc, t);
  const audio = audioOf(draft.doc);
  const state = stateOf(draft, t);
  const page = draft.doc.pages.find((p) => p.id === t);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const words = n ? wordCount(n.script) : 0;
  const { min, max } = NARRATION_LENGTHS[audio.length];
  const warnings = n ? scriptWarnings(n.script, audio.length, page ? answersOn(page) : []) : [];
  const running = actions.jobs[t];
  const error = actions.errors[t];
  const edit = (script: string) =>
    change((d) => {
      const cur = getN(d.doc, t);
      setN(d, t, { ...(cur ?? { status: "draft" as const }), script });
    }, `${t}:narration`);

  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{label ?? labelOf(draft.doc, t)}</h3>
        <Badge tone={STATE_TONE[state]}>{NARRATION_STATES[state].label}</Badge>
      </div>
      {n ? (
        <>
          <textarea
            aria-label={`Script: ${labelOf(draft.doc, t)}`}
            className={cx(input, "min-h-28 py-2 font-serif text-[1.02rem] leading-relaxed")}
            value={n.script}
            maxLength={1200}
            onChange={(e) => edit(e.target.value)}
          />
          <p className={cx("text-xs", words < min * 0.9 || words > max * 1.1 ? "font-semibold text-[#8a5a00] dark:text-[#ffd48a]" : "text-ink-muted")}>
            {words} words · about {formatSeconds(secondsFor(words))} · aim for {min} to {max}
          </p>
          {warnings.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-[#8a5a00] dark:text-[#ffd48a]">
              {warnings.map((w) => (
                <li key={w} className="flex items-start gap-1.5">
                  <Icon name="alert" className="mt-0.5 size-4 shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}
          {state === "review" && (
            <p className="text-sm text-[#8a5a00] dark:text-[#ffd48a]">The page has changed a lot since this was approved. Check it still fits.</p>
          )}
          {state === "rerecord" && (
            <p className="text-sm text-danger">The script or voice has changed since it was recorded. Record it again before publishing.</p>
          )}
          {n.audio && (
            // The script above is its transcript.
            <audio controls preload="none" src={n.audio.src} className="h-10 w-full" />
          )}
        </>
      ) : (
        <p className="text-sm text-ink-muted">No script yet.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {n && n.status === "draft" && (
          <button
            type="button"
            className={btn.primary}
            disabled={busy || !n.script.trim()}
            onClick={() => change((d) => setN(d, t, { ...getN(d.doc, t)!, status: "approved", basis: snapshotFor(d, t) }))}
          >
            <Icon name="check" className="size-4" /> Approve
          </button>
        )}
        {n && n.status === "approved" && (state === "unrecorded" || state === "rerecord" || (state === "review" && !n.audio)) && (
          <button type="button" className={btn.primary} disabled={busy} onClick={() => void actions.record(t)}>
            <Icon name="volume" className="size-4" /> {state === "rerecord" ? "Record again" : "Record"}
          </button>
        )}
        {state === "review" && (
          <button
            type="button"
            className={btn.secondary}
            disabled={busy}
            onClick={() => change((d) => setN(d, t, { ...getN(d.doc, t)!, basis: snapshotFor(d, t) }))}
          >
            Still fine
          </button>
        )}
        {n && n.status === "approved" && (
          <button type="button" className={btn.quiet} disabled={busy} onClick={() => change((d) => setN(d, t, { ...getN(d.doc, t)!, status: "draft" }))}>
            Back to draft
          </button>
        )}
        <button type="button" className={btn.quiet} disabled={busy} onClick={() => setAsking((a) => !a)}>
          <Icon name="spark" className="size-4" /> {n ? "Write again" : "Write it"}
        </button>
        {n && (
          <button type="button" className={btn.quiet} disabled={busy} onClick={() => change((d) => setN(d, t, undefined))}>
            <Icon name="trash" className="size-4" /> Remove
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
              placeholder="Less formal, and start with Mrs Russo’s question"
            />
          </label>
          <button type="submit" className={btn.secondary} disabled={busy}>
            <Icon name="spark" className="size-4" /> Write it
          </button>
        </form>
      )}
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
// The narration review: every script together
// ---------------------------------------------------------------------------------------------

export function NarrationReview({ guideId, draft, change, onClose }: { guideId: string; draft: Draft; change: Change; onClose: () => void }) {
  const actions = useNarration(guideId, draft, change);
  const [attention, setAttention] = useState(false);
  const [recording, setRecording] = useState<string | null>(null);
  const targets = targetsOf(draft.doc);
  const states = Object.fromEntries(targets.map((t) => [t, stateOf(draft, t)])) as Record<Target, NarrationState>;
  const toWrite = targets.filter((t) => NEEDS_WORK.includes(states[t]));
  const drafts = targets.filter((t) => states[t] === "draft");
  const toRecord = targets.filter((t) => states[t] === "unrecorded" || states[t] === "rerecord");
  const busy = Object.keys(actions.jobs).length > 0 || recording !== null;
  const shown = attention ? targets.filter((t) => states[t] !== "current") : targets;

  const generate = async (all: boolean) => {
    if (
      all &&
      targets.some((t) => getN(draft.doc, t)) &&
      !(await confirmAction("Every script is written again as a draft, replacing what’s there (recordings included). Undo brings them back.", {
        title: "Start the narration again?",
        confirmLabel: "Start again",
      }))
    )
      return;
    await actions.write("course", all ? null : toWrite, "", "all");
  };
  const recordAll = async () => {
    for (const t of toRecord) {
      setRecording(`Recording ${toRecord.indexOf(t) + 1} of ${toRecord.length}…`);
      await actions.record(t);
    }
    setRecording(null);
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="narration-review-h" className="fixed inset-0 z-50 overflow-y-auto bg-[#0b1626]/70 p-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-3xl bg-bg p-5 shadow-2xl sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="narration-review-h" className="flex items-center gap-2 font-serif text-2xl font-semibold">
              <Icon name="volume" className="size-6 text-accent" /> Narration review
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Claude drafts each introduction from the course; you edit and approve it; approved scripts are recorded with ElevenLabs. Learners hear nothing
              until it’s approved, recorded and published.
            </p>
          </div>
          <button type="button" className={btn.quiet} onClick={onClose}>
            Close
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 ring-1 ring-line">
          {toWrite.length > 0 ? (
            <button type="button" className={btn.primary} disabled={busy} onClick={() => void generate(false)}>
              <Icon name="spark" className="size-4" />{" "}
              {toWrite.length === targets.length ? "Generate Magazine Narration" : `Write the ${toWrite.length} that need it`}
            </button>
          ) : (
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => void generate(true)}>
              <Icon name="spark" className="size-4" /> Start again
            </button>
          )}
          {drafts.length > 0 && (
            <button
              type="button"
              className={btn.secondary}
              disabled={busy}
              onClick={() =>
                change((d) => {
                  for (const t of drafts) {
                    const n = getN(d.doc, t);
                    if (n?.script.trim()) setN(d, t, { ...n, status: "approved", basis: snapshotFor(d, t) });
                  }
                })
              }
            >
              <Icon name="check" className="size-4" /> Approve all ({drafts.length})
            </button>
          )}
          {toRecord.length > 0 && (
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => void recordAll()}>
              <Icon name="volume" className="size-4" /> Record approved scripts ({toRecord.length})
            </button>
          )}
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--color-action)]" checked={attention} onChange={(e) => setAttention(e.target.checked)} />
            Needs attention only
          </label>
        </div>
        {(actions.jobs.all || recording) && (
          <p className="text-sm font-semibold text-ink-muted" role="status">
            {actions.jobs.all ?? recording}
          </p>
        )}
        {actions.errors.all && <ErrorNote text={actions.errors.all} />}
        {targets.length === 0 && <p className="text-ink-muted">Nothing to narrate: turn on course or page introductions in the Audio guide settings.</p>}
        {shown.map((t) => (
          <div key={t} className="flex flex-col gap-2">
            <NarrationRow draft={draft} change={change} target={t} actions={actions} busy={busy} />
            {/* Ava's video for the course introduction: it plays on the cover, before the cover picture. */}
            {t === "intro" && <AvaVideoSlot lineKey={`magazine:${guideId}:intro`} script={draft.doc.audio?.intro?.script} />}
          </div>
        ))}
        {attention && shown.length === 0 && <p className="text-ink-muted">Everything is narrated and current.</p>}
      </div>
    </div>
  );
}

/**
  On the course outline, under the cover: the course introduction's narration and Ava's video for it (she plays on the
  learner's cover page before the cover picture), collapsed to a line until opened, like a page's strip.
*/
export function CourseIntroStrip({ guideId, draft, change }: { guideId: string; draft: Draft; change: Change }) {
  const actions = useNarration(guideId, draft, change);
  const narrated = Boolean(draft.doc.audio?.levels.course);
  const state = stateOf(draft, "intro");
  const intro = draft.doc.audio?.intro;
  const [open, setOpen] = useState(false);
  const busy = Object.keys(actions.jobs).length > 0;
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group rounded-2xl border border-[#b7dede] bg-tealtint">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm">
        <Icon name="volume" className="size-4 text-accent" />
        <span className="font-semibold">Course introduction: Audio guide and Ava’s video</span>
        {narrated && <Badge tone={STATE_TONE[state]}>{NARRATION_STATES[state].label}</Badge>}
        {intro && !open && <span className="min-w-0 flex-1 truncate text-ink-muted">“{intro.script}”</span>}
        <Icon name="chevron-down" className="ml-auto size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {open && <AvaVideoSlot lineKey={`magazine:${guideId}:intro`} script={intro?.script} />}
        {narrated ? (
          <NarrationRow draft={draft} change={change} target="intro" actions={actions} busy={busy} label="Course introduction" />
        ) : (
          <p className="rounded-2xl bg-surface p-4 text-sm text-ink-muted">
            The Audio guide’s course introduction is off (Audio guide settings, in the sidebar). Ava’s video can still go on the cover.
          </p>
        )}
      </div>
    </details>
  );
}

/** At the top of a page in the editor: its narration and Ava's video for it, collapsed to a line until opened. */
export function PageNarrationStrip({ guideId, draft, change, page }: { guideId: string; draft: Draft; change: Change; page: Page }) {
  const actions = useNarration(guideId, draft, change);
  const state = stateOf(draft, page.id);
  const [open, setOpen] = useState(false);
  const busy = Object.keys(actions.jobs).length > 0;
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group rounded-2xl border border-[#b7dede] bg-tealtint">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm">
        <Icon name="volume" className="size-4 text-accent" />
        <span className="font-semibold">{draft.doc.pages.length > 1 ? "Audio guide and Ava’s video" : "Audio guide"}</span>
        <Badge tone={STATE_TONE[state]}>{NARRATION_STATES[state].label}</Badge>
        {page.narration && !open && <span className="min-w-0 flex-1 truncate text-ink-muted">“{page.narration.script}”</span>}
        <Icon name="chevron-down" className="ml-auto size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {/* Ava's video for the page: with one, she plays where the picture goes and the audio introduction steps aside. */}
        {draft.doc.pages.length > 1 && open && <AvaVideoSlot lineKey={`magazine:${guideId}:page:${page.id}`} script={page.narration?.script} />}
        <NarrationRow
          draft={draft}
          change={change}
          target={page.id}
          actions={actions}
          busy={busy}
          label={draft.doc.pages.length > 1 ? "Page introduction" : "Introduction"}
        />
      </div>
    </details>
  );
}
