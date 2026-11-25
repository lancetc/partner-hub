"use client";

import { useRef, useState } from "react";
import type { Lesson } from "@/content/lessons";
import { api, useApi, type Me } from "@/lib/api";
import { cx } from "@/lib/format";
import { formatSeconds, secondsFor, wordCount } from "@/lib/mediaStudio";
import {
  approveScript,
  approveVideo,
  attachVideo,
  cancelProduction,
  confirmStillCurrent,
  DEFAULT_PRESENTER,
  discardPendingVideo,
  INTRO_STATUSES,
  INTRO_WORDS,
  introCardOf,
  introScriptWarnings,
  introState,
  playableVideo,
  prepareForProduction,
  setLayout,
  setPlaceholder,
  setPresenter,
  setScript,
  withIntroCard,
  type PresenterProfile,
} from "@/lib/topicIntro";
import { confirmAction } from "@/lib/confirm";
import { Icon } from "../Icon";
import { IntroCard } from "../player/IntroCard";
import { ImageDropZone } from "./ImagePicker";
import { uploadVideo } from "./LessonEditor";
import { Badge, btn, ErrorNote, Field, input } from "./ui";

/*
  The Video Introduction section of the Topic editor (docs/topic-video-introductions.md). Everything here changes the
  draft, like any other edit: learners keep the published introduction until the author approves a replacement and
  publishes the Topic. Writing a script with AI is a paid call the author asks for; video generation (Synthesia) is
  shown but switched off.
*/

type Update = (fn: (l: Lesson) => void) => void;

export function TopicIntroSection({ lesson: l, update }: { lesson: Lesson; update: Update }) {
  const { data } = useApi<{ presenters: PresenterProfile[] }>("/api/admin/topic-intros/presenters");
  const me = useApi<Me>("/api/me").data;
  const all = data?.presenters ?? [];
  const fallback = all.find((p) => p.isDefault) ?? DEFAULT_PRESENTER;
  const c = introCardOf(l);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [drafted, setDrafted] = useState<{ warnings: string[]; model: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const videoFile = useRef<HTMLInputElement>(null);
  const captionsFile = useRef<HTMLInputElement>(null);
  const [captions, setCaptions] = useState<string | null>(null);

  if (!c)
    return (
      <div className="rounded-3xl bg-muted p-6">
        <p>This topic doesn’t have its Introduction card yet. Every topic opens with one.</p>
        <button type="button" className={cx(btn.primary, "mt-3")} onClick={() => update((d) => Object.assign(d, withIntroCard(d, fallback)))}>
          Add the Introduction card
        </button>
      </div>
    );

  const state = introState(l);
  const meta = INTRO_STATUSES[state.status];
  const script = c.intro.script;
  const spoken = script?.spoken ?? "";
  const words = wordCount(spoken);
  const warnings = introScriptWarnings(spoken, l);
  const presenter = all.find((p) => p.id === c.intro.presenter) ?? fallback;
  const who = me?.user.name ?? "an author";
  const at = () => new Date().toISOString();
  const pending = c.intro.pendingVideo;
  const hasVideo = playableVideo(c.visual);

  async function generate() {
    if (
      spoken.trim() &&
      !(await confirmAction("The script you have is replaced by a new draft. This is a paid AI call.", {
        title: "Write a new script?",
        confirmLabel: "Write a new one",
      }))
    )
      return;
    setBusy("script");
    setProblem(null);
    try {
      const r = await api<{ script: string; warnings: string[]; model: string }>("/api/admin/topic-intros/script", { body: { lesson: l } });
      update((d) => setScript(d, r.script, "ai", at(), r.model));
      setDrafted({ warnings: r.warnings, model: r.model });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function uploadIntroVideo(file: File) {
    setBusy("video");
    setProblem(null);
    try {
      const v = await uploadVideo(file, file.name);
      const seconds = await new Promise<number>((ok) => {
        const el = document.createElement("video");
        el.preload = "metadata";
        el.onloadedmetadata = () => ok(Number.isFinite(el.duration) ? Math.round(el.duration) : 0);
        el.onerror = () => ok(0);
        el.src = v.src;
      });
      update((d) =>
        attachVideo(d, {
          src: v.src,
          ...(v.poster && { poster: v.poster }),
          ...(captions && { captionsVtt: captions }),
          seconds,
          provider: "upload",
          at: at(),
        }),
      );
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function uploadCaptions(file: File) {
    setBusy("captions");
    setProblem(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/uploads", { method: "POST", body: form });
      const d = (await res.json().catch(() => ({}))) as { src?: string; error?: string };
      if (!res.ok || !d.src) throw new Error(d.error ?? "The captions file didn’t upload. Use a WebVTT (.vtt) file.");
      setCaptions(d.src);
      if (pending) update((x) => attachVideo(x, { ...introCardOf(x)!.intro.pendingVideo!, captionsVtt: d.src }));
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <section className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-xl font-semibold">Video introduction</h2>
            <Badge
              tone={meta.tone === "good" ? "good" : meta.tone === "bad" ? "bad" : meta.tone === "warn" ? "warn" : meta.tone === "info" ? "info" : "neutral"}
            >
              {meta.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            The topic’s first card: a portrait presenter, the title and a short description, and “Let’s get started”. It always comes first and can’t be
            removed. Changes here are part of the draft: learners keep the published introduction until you approve a replacement and publish the topic.
          </p>
          {state.reasons.length > 0 && (
            <div role="status" className="mt-3 flex flex-wrap items-start gap-3 rounded-2xl border-2 border-gold bg-gold/15 px-4 py-3 text-sm">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Requires review</p>
                <ul className="mt-1 list-disc pl-4">
                  {state.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <p className="mt-1 text-ink-muted">
                  Nothing is regenerated by itself, and learners keep the published introduction until you approve a new one.
                </p>
              </div>
              {state.outdated && (
                <button type="button" className={btn.secondary} onClick={() => update((d) => confirmStillCurrent(d, who, at()))}>
                  The script still fits
                </button>
              )}
            </div>
          )}
          {c.intro.layout === "legacy" && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-muted px-4 py-3 text-sm">
              <p className="min-w-0 flex-1">
                This topic’s existing presenter card is its introduction, and learners see it as it was
                {c.visual.kind === "presenter" ? ` (${c.visual.name})` : ""}.
              </p>
              <button type="button" className={btn.secondary} onClick={() => update((d) => setLayout(d, "intro"))}>
                Use the introduction screen
              </button>
            </div>
          )}
          {c.intro.layout !== "legacy" && c.intro.origin === "reused" && (
            <p className="mt-3 text-sm">
              <button
                type="button"
                className="font-semibold text-accent underline-offset-4 hover:underline"
                onClick={() => update((d) => setLayout(d, "legacy"))}
              >
                Show the existing presenter card as it was
              </button>
            </p>
          )}
        </section>

        <section className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line">
          <h3 className="font-semibold">On the card</h3>
          <div className="mt-3 grid gap-3">
            <Field label="Title" hint="Leave empty to show the topic’s title.">
              <input
                className={input}
                value={c.heading}
                placeholder={l.title}
                onChange={(e) => update((d) => void (introCardOf(d)!.heading = e.target.value))}
              />
            </Field>
            <Field label="Short description" hint="One or two sentences. Leave empty to show the topic’s summary.">
              <textarea
                className={cx(input, "min-h-20 py-2")}
                value={c.body}
                placeholder={l.summary}
                onChange={(e) => update((d) => void (introCardOf(d)!.body = e.target.value))}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Presenter script</h3>
            {script && (
              <Badge tone={script.status === "approved" ? "good" : "info"}>
                {script.status === "approved" ? "Approved" : "Draft"} · version {script.version}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {INTRO_WORDS.min} to {INTRO_WORDS.max} words, about 15 to 30 seconds: a question or situation, why it matters, how it connects to their work, and
            what they’ll explore. Australian English, warm and confident.
          </p>
          <textarea
            aria-label="Presenter script"
            className={cx(input, "mt-3 min-h-40 py-2 leading-relaxed")}
            value={spoken}
            placeholder="Generate a script, or write your own."
            onChange={(e) => update((d) => setScript(d, e.target.value, "author", at()))}
          />
          <p className="mt-1 text-sm" aria-live="polite">
            <span className={cx(words && (words < INTRO_WORDS.min || words > INTRO_WORDS.max) ? "font-semibold text-danger" : "text-ink-muted")}>
              {words} {words === 1 ? "word" : "words"}
            </span>
            <span className="text-ink-muted"> · about {formatSeconds(words ? secondsFor(words) : 0)} spoken</span>
            {drafted && <span className="text-ink-muted"> · drafted by {drafted.model}</span>}
          </p>
          {warnings.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {warnings.map((w) => (
                <li key={w} className="flex gap-1.5">
                  <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-warm" /> {w}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btn.secondary} onClick={generate} disabled={busy !== null}>
              <Icon name="spark" className="size-4" /> {busy === "script" ? "Writing…" : spoken.trim() ? "Regenerate" : "Generate a script"}
            </button>
            {script?.status === "draft" && spoken.trim() && (
              <button type="button" className={btn.primary} onClick={() => update((d) => approveScript(d, who, at()))} disabled={busy !== null}>
                <Icon name="check" className="size-4" /> Approve script
              </button>
            )}
          </div>
          {script?.status === "approved" && script.approvedAt && (
            <p className="mt-2 text-sm text-ink-muted">
              Approved by {script.approvedBy} on {script.approvedAt.slice(0, 10)}. Editing it makes a new draft; the approved one stays until the new one is
              approved.
            </p>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Generating writes from this topic’s cards, questions and sources. It’s a paid AI call and nothing is saved until you keep it.
          </p>
        </section>

        <section className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line">
          <h3 className="font-semibold">Presenter</h3>
          <Field label="Presenter profile" hint="The default presenter introduces every topic unless one is chosen here." className="mt-3">
            <select
              className={input}
              value={c.intro.presenter ?? ""}
              onChange={(e) => update((d) => setPresenter(d, all.find((p) => p.id === e.target.value) ?? null, fallback))}
            >
              <option value="">Default: {fallback.name}</option>
              {all
                .filter((p) => !p.isDefault && (p.active || p.id === c.intro.presenter))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.active ? "" : " (switched off)"}
                  </option>
                ))}
            </select>
          </Field>
          <div className="mt-4">
            <p className="text-sm font-semibold">Placeholder portrait</p>
            <p className="mb-2 text-sm text-ink-muted">
              Shown until a video is approved. Choose a portrait (9:16) picture for this topic, or keep the presenter’s.
            </p>
            <div className="max-w-56">
              <ImageDropZone
                aspect="aspect-[9/16]"
                picture={c.intro.placeholder ?? presenter.portrait}
                onChange={(p) => update((d) => setPlaceholder(d, p ? { src: p.src, width: p.width, height: p.height } : undefined, presenter))}
                label="Drag a portrait here"
                preview={
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={(c.intro.placeholder ?? presenter.portrait).src}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                    style={{ objectPosition: c.intro.placeholder?.position ?? presenter.portrait.position ?? "center" }}
                  />
                }
              />
            </div>
            {c.intro.placeholder && (
              <button type="button" className={cx(btn.quiet, "mt-1")} onClick={() => update((d) => setPlaceholder(d, undefined, presenter))}>
                Use the presenter’s portrait
              </button>
            )}
          </div>
        </section>

        <section className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line">
          <h3 className="font-semibold">Video</h3>
          <p className="mt-1 text-sm text-ink-muted">
            {hasVideo
              ? "Learners see the approved video once the topic is published."
              : "No video yet: learners see the placeholder portrait, with no play button."}
          </p>
          {pending ? (
            <div className="mt-3 flex flex-wrap items-start gap-4 rounded-2xl bg-muted p-3">
              <video
                src={pending.src}
                poster={pending.poster}
                controls
                playsInline
                preload="metadata"
                className="aspect-[9/16] w-36 rounded-xl bg-black object-cover"
              >
                {pending.captionsVtt && <track kind="captions" src={pending.captionsVtt} srcLang="en" label="English" default />}
              </video>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">A video waiting for your approval</p>
                <p className="text-ink-muted">
                  {pending.provider === "upload" ? "Uploaded" : `Made with ${pending.provider}`}
                  {pending.seconds ? `, ${formatSeconds(pending.seconds)}` : ""}. {pending.captionsVtt ? "With captions." : "No captions file yet."}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className={btn.primary} onClick={() => update((d) => approveVideo(d, who, at()))}>
                    <Icon name="check" className="size-4" /> Approve video
                  </button>
                  <button type="button" className={btn.secondary} onClick={() => update((d) => discardPendingVideo(d))}>
                    Discard
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btn.secondary} onClick={() => videoFile.current?.click()} disabled={busy !== null}>
              <Icon name="upload" className="size-4" />{" "}
              {busy === "video" ? "Uploading…" : hasVideo || pending ? "Upload a replacement video" : "Upload a video"}
            </button>
            <button type="button" className={btn.secondary} onClick={() => captionsFile.current?.click()} disabled={busy !== null}>
              {busy === "captions" ? "Uploading…" : "Add captions (.vtt)"}
            </button>
            <input
              ref={videoFile}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && uploadIntroVideo(e.target.files[0])}
            />
            <input
              ref={captionsFile}
              type="file"
              accept=".vtt,text/vtt"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && uploadCaptions(e.target.files[0])}
            />
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            A portrait (9:16) MP4 made elsewhere, saying the approved script. Captions help everyone; add a WebVTT file.
          </p>

          <div className="mt-5 rounded-2xl border border-dashed border-line-strong p-4">
            <p className="flex items-center gap-2 font-semibold">
              Synthesia <Badge tone="neutral">Not switched on</Badge>
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              Video generation is off until Synthesia’s integration is verified and enabled. You can prepare an approved script now; nothing is ever sent
              without an author confirming it.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {c.intro.production ? (
                <>
                  <Badge tone="info">
                    {
                      INTRO_STATUSES[
                        c.intro.production.state === "ready"
                          ? "ready_for_production"
                          : c.intro.production.state === "failed"
                            ? "failed"
                            : c.intro.production.state
                      ].label
                    }
                  </Badge>
                  <button type="button" className={btn.quiet} onClick={() => update((d) => cancelProduction(d))}>
                    Take out of production
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={script?.status !== "approved"}
                  title={script?.status !== "approved" ? "Approve the script first" : undefined}
                  onClick={() => update((d) => prepareForProduction(d, presenter, who, at()))}
                >
                  Prepare for production
                </button>
              )}
              <button type="button" className={btn.primary} disabled title="Video generation isn’t switched on">
                Generate video with Synthesia
              </button>
            </div>
          </div>
        </section>
        {problem && <ErrorNote text={problem} />}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-2 text-sm font-semibold">Preview</p>
        <div className="mx-auto aspect-[9/16] w-full max-w-[20rem] overflow-hidden rounded-[1.75rem] shadow-xl ring-1 ring-line">
          {c.intro.layout === "legacy" ? (
            <div className="grid h-full place-items-center bg-muted p-6 text-center text-sm text-ink-muted">
              Shown as the existing presenter card. Use Preview at the top to see it.
            </div>
          ) : (
            <IntroCard key={JSON.stringify(c.visual)} card={c} title={l.title} summary={l.summary} headingRef={headingRef} track={null} autoPlay={false} />
          )}
        </div>
        <p className="mt-2 text-center text-xs text-ink-muted">
          The draft as learners will see it. The button below it in the topic reads “Let’s get started”.
        </p>
      </aside>
    </div>
  );
}
