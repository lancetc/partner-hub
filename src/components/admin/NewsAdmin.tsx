"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { categories, categoryLabel, policyStatusLabel, type PolicyMeta, type Story } from "@/content/stories";
import { lessons } from "@/content/lessons";
import { resources } from "@/content/resources";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";
import { StoryVisual } from "../StoryVisual";
import { ImageDropZone, type PictureContext } from "./ImagePicker";
import { namesIn } from "./PeopleReferences";
import { plainText } from "@/lib/richText";
import { textHash } from "@/lib/magazineNarration";
import { draftStoryScript } from "@/lib/storyNarration";
import type { NarrationAudio } from "@/lib/magazine";
import { StoryDocEditor } from "./StoryDocEditor";
import { NewsEditionAdmin } from "./NewsEditionAdmin";
import { readDocumentText, type DocumentText } from "@/lib/documentText";
import { GlanceField, PracticeField } from "./StoryGlanceAdmin";
import { StoryPictures, type PictureIdeas } from "./StoryPictures";
import { StoryVideoField } from "./StoryVideoField";

/*
  The homepage news: every story, built-in or new, with its words, poster image, category and
  policy details. Built-in stories can be edited and put back as they shipped. New stories start
  as drafts, previewable by authors, until they're published.
*/

type Summary = {
  slug: string;
  title: string;
  category: Story["category"];
  date: string;
  status: "draft" | "published";
  edited: boolean;
  featured?: boolean;
  glance?: "none" | "proposed" | "check" | "on" | "off";
  builtIn: boolean;
  photo: string | null;
  updatedAt: string | null;
};
type Detail = Summary & { story: Story; deleted: boolean };

const textarea = "w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base leading-relaxed";

export function NewsList() {
  const { data, error, reload } = useApi<{ stories: Summary[]; deleted: Summary[] }>("/api/admin/stories");
  const [busy, setBusy] = useState<string | null>(null);
  async function restore(slug: string) {
    setBusy(slug);
    try {
      await api(`/api/admin/stories/${slug}`, { body: { action: "restore" } });
      reload();
    } finally {
      setBusy(null);
    }
  }
  return (
    <AdminShell title="News">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-3xl text-ink-muted">
          The stories on the homepage. Edit any of them, including their poster images, or write a new one. New stories stay as drafts until you publish them.
        </p>
        <Link href="/admin/news/new" className={btn.primary}>
          <Icon name="plus" className="size-4" /> New story
        </Link>
      </div>
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      <NewsEditionAdmin />
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : (
        <>
          <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.stories.map((s) => (
              <li key={s.slug} className="relative flex flex-col overflow-hidden rounded-3xl border border-line bg-surface hover:border-line-strong">
                <div className="relative aspect-[16/9] bg-muted">
                  {s.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.photo} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-ink-muted">
                      <Icon name="image" className="size-8" />
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={s.status === "published" ? "good" : "neutral"}>{s.status === "published" ? "Published" : "Draft"}</Badge>
                    <Badge>{categoryLabel(s.category)}</Badge>
                    {s.edited && <Badge tone="info">Edited</Badge>}
                    {s.featured && <Badge tone="warn">Featured</Badge>}
                    {s.glance === "proposed" && <Badge tone="info">Summary proposed</Badge>}
                    {s.glance === "check" && <Badge tone="warn">Summary to check</Badge>}
                  </div>
                  <h2 className="font-serif text-lg font-semibold leading-snug">
                    <Link href={`/admin/news/${s.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
                      {s.title}
                    </Link>
                  </h2>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                    <p className="text-sm text-ink-muted">{formatDate(s.date)}</p>
                    {/* Clear ways in, above the card's own link (the owner, Nov 2026). */}
                    <span className="relative z-10 flex items-center gap-1">
                      <a
                        href={`/news/${s.slug}${s.status === "draft" ? "?preview=1" : ""}`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-muted hover:bg-muted hover:text-ink"
                      >
                        <Icon name="eye" className="size-4" /> View<span className="sr-only"> {s.title} (opens in a new tab)</span>
                      </a>
                      <Link
                        href={`/admin/news/${s.slug}`}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover"
                      >
                        <Icon name="pen" className="size-4" /> Edit<span className="sr-only"> {s.title}</span>
                      </Link>
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {data.deleted.length > 0 && (
            <details className="mt-8 rounded-2xl border border-line p-4">
              <summary className="cursor-pointer font-semibold">Deleted stories ({data.deleted.length})</summary>
              <ul className="mt-3 flex flex-col gap-2">
                {data.deleted.map((s) => (
                  <li key={s.slug} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {s.title} <span className="text-sm text-ink-muted">· {formatDate(s.date)}</span>
                    </span>
                    <button type="button" className={btn.secondary} disabled={busy === s.slug} onClick={() => restore(s.slug)}>
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </AdminShell>
  );
}

const blank = (): Story => ({
  slug: "",
  category: "trilogy",
  title: "",
  dek: "",
  byline: "Trilogy Care team",
  // Filled in with today once the page is open (see Form).
  date: "",
  readMinutes: 1,
  visual: { variant: "petals", tone: "teal", icon: "spark", alt: "" },
  body: [{ type: "p", text: "" }],
  audience: ["partner", "coordinator"],
});

export function StoryEditor({ slug }: { slug?: string }) {
  const { data, error } = useApi<Detail>(slug ? `/api/admin/stories/${slug}` : null);
  if (slug && (error || !data))
    return (
      <AdminShell title="Story" back={{ href: "/admin/news", label: "News" }}>
        {error ? <ErrorNote text={error} /> : <p className="text-ink-muted">Loading…</p>}
      </AdminShell>
    );
  return <Form key={data?.slug ?? "new"} initial={data ?? null} />;
}

function Form({ initial }: { initial: Detail | null }) {
  const router = useRouter();
  const isNew = !initial;
  const [s, setS] = useState<Story>(initial?.story ?? blank());
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [edited, setEdited] = useState(initial?.edited ?? false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  // The poster and pictures the writer suggested for the story it wrote (StoryPictures).
  const [ideas, setIdeas] = useState<PictureIdeas | null>(null);
  // Drafted with AI: the introduction is recorded, and approved, when the story is first saved.
  const [voiceOnSave, setVoiceOnSave] = useState(false);
  const set = (patch: Partial<Story>) => {
    setS((x) => ({ ...x, ...patch }));
    setDirty(true);
    setNote(null);
  };
  useEffect(() => {
    // Today's date for a new story, read in the browser rather than when the page is built.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isNew) setS((x) => (x.date ? x : { ...x, date: new Date().toISOString() }));
  }, [isNew]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setNote({ text: (e as Error).message, ok: false });
    } finally {
      setBusy(false);
    }
  }
  const save = () =>
    run(async () => {
      if (isNew) {
        const r = await api<{ slug: string }>("/api/admin/stories", { body: { story: s } });
        setDirty(false);
        const script = s.narration?.script?.trim();
        if (voiceOnSave && script && !s.narration?.audio) {
          // The story now has its address, so its introduction can be recorded (Magazine Editorial Voice) and approved.
          // If that fails the story is still saved, and the introduction can be recorded from the editor.
          setNote({ text: "Saved. Recording the voiced introduction…", ok: true });
          try {
            const { audio } = await api<{ audio: NarrationAudio }>(`/api/admin/stories/${encodeURIComponent(r.slug)}/narration`, { body: { script } });
            await api(`/api/admin/stories/${r.slug}`, { method: "PUT", body: { story: { ...s, narration: { script, audio, approved: true } } } });
          } catch {
            // Recorded in the editor instead.
          }
        }
        router.replace(`/admin/news/${r.slug}`);
        return;
      }
      await api(`/api/admin/stories/${initial.slug}`, { method: "PUT", body: { story: s } });
      setDirty(false);
      if (initial.builtIn) setEdited(true);
      setNote({ text: status === "published" ? "Saved. The story on the homepage is updated." : "Saved as a draft. Publish it when it’s ready.", ok: true });
    });
  const publish = (on: boolean) =>
    run(async () => {
      if (dirty) await api(`/api/admin/stories/${initial!.slug}`, { method: "PUT", body: { story: s } });
      setDirty(false);
      await api(`/api/admin/stories/${initial!.slug}`, { body: { action: on ? "publish" : "unpublish" } });
      setStatus(on ? "published" : "draft");
      setNote({ text: on ? "Published. It’s on the homepage now." : "Unpublished. It’s off the site and back to a draft.", ok: true });
    });
  const remove = () =>
    run(async () => {
      if (
        !(await confirmAction("It comes off the homepage straight away. You can restore it from Deleted stories.", {
          title: "Delete this story?",
          confirmLabel: "Delete",
          danger: true,
        }))
      )
        return;
      await api(`/api/admin/stories/${initial!.slug}`, { method: "DELETE" });
      setDirty(false);
      router.push("/admin/news");
    });
  const revert = () =>
    run(async () => {
      if (
        !(await confirmAction("Your changes to this story are thrown away and it goes back to how it came with the site.", {
          title: "Put this story back?",
          confirmLabel: "Put it back",
          danger: true,
        }))
      )
        return;
      await api(`/api/admin/stories/${initial!.slug}`, { body: { action: "revert" } });
      setDirty(false);
      window.location.reload();
    });

  const dateOnly = s.date.slice(0, 10);
  return (
    <AdminShell title={isNew ? "New story" : s.title || "Story"} back={{ href: "/admin/news", label: "News" }}>
      <div className="flex flex-wrap items-center gap-2">
        {!isNew && <Badge tone={status === "published" ? "good" : "neutral"}>{status === "published" ? "Published" : "Draft"}</Badge>}
        {edited && <Badge tone="info">Edited from the original</Badge>}
        {dirty && <span className="text-sm text-ink-muted">Unsaved changes</span>}
      </div>

      {isNew && (
        <StoryWriter
          onDraft={(r, makePoster) => {
            // Keep a poster already chosen; everything else comes from the draft.
            setS((x) => ({ ...r.story, visual: x.visual.photo ? x.visual : r.story.visual }));
            setDirty(true);
            setIdeas({ poster: r.imageIdea ? { idea: r.imageIdea, alt: r.imageAlt, make: makePoster } : null, pictures: r.pictures ?? [] });
            setVoiceOnSave(true);
            setNote({
              text: `AI filled in every field, including At a glance, the actions and the introduction script (recorded and approved when you save).${makePoster && r.imageIdea ? " The poster is being made under the writer." : ""} Check every fact and picture, turn on the actions if you want them, then save.`,
              ok: true,
            });
          }}
        />
      )}
      {isNew && ideas && (
        <StoryPictures
          ideas={ideas}
          story={s}
          update={(fn) => {
            setS(fn);
            setDirty(true);
          }}
        />
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-5">
          <Field label="Title">
            <input className={cx(input, "font-serif text-lg font-semibold")} value={s.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Standfirst" hint="One or two sentences under the title, on the homepage and at the top of the story.">
            <textarea rows={2} className={textarea} value={s.dek} onChange={(e) => set({ dek: e.target.value })} />
          </Field>
          <StoryDocEditor value={s.body} onChange={(body) => set({ body })} />
          <StoryVideoField story={s} onChange={(video) => set({ video })} />
          <GlanceField slug={initial?.slug ?? null} story={s} onChange={(glance) => set({ glance })} />
          <PracticeField slug={initial?.slug ?? null} story={s} onChange={(practice) => set({ practice })} />
          {s.category === "policy" && <PolicyFields policy={s.policy} onChange={(policy) => set({ policy })} />}
          <SeoFields story={s} slug={initial?.slug} onChange={(seo) => set({ seo })} />
        </div>

        <aside className="flex flex-col gap-5">
          <PosterField visual={s.visual} onChange={(visual) => set({ visual })} context={storyPictureContext(s)} />
          <NarrationField slug={initial?.slug ?? null} story={s} narration={s.narration} onChange={(narration) => set({ narration })} />
          <div className="grid gap-4 rounded-2xl border border-line p-4">
            <Field label="Category">
              <select className={input} value={s.category} onChange={(e) => set({ category: e.target.value as Story["category"] })}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" className={input} value={dateOnly} onChange={(e) => e.target.value && set({ date: `${e.target.value}T00:00:00Z` })} />
            </Field>
            <Field label="Byline">
              <input className={input} value={s.byline} onChange={(e) => set({ byline: e.target.value })} />
            </Field>
            <fieldset>
              <legend className="text-sm font-semibold">Who it’s for</legend>
              {(["partner", "coordinator"] as const).map((a) => (
                <label key={a} className="mt-1 flex min-h-10 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--action)]"
                    checked={s.audience.includes(a)}
                    onChange={(e) => set({ audience: e.target.checked ? [...s.audience, a] : s.audience.filter((x) => x !== a) })}
                  />
                  {a === "partner" ? "Care Partners" : "Care coordinators"}
                </label>
              ))}
            </fieldset>
            {/* The homepage's lead story, whatever its date (the owner, Nov 2026). */}
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-[var(--action)]"
                checked={s.featured === true}
                onChange={(e) => set({ featured: e.target.checked || undefined })}
              />
              <span>
                <span className="text-sm font-semibold">Feature on the homepage</span>
                <span className="block text-sm text-ink-muted">
                  It’s one of the featured stories at the top of the homepage news, which readers browse 01 / 03. Tick as many as you like; unread ones come
                  first.
                </span>
              </span>
            </label>
            {s.featured && (
              <Field label="Pinned until" hint="The last day it’s the feature. Leave empty to keep it until you choose another.">
                <input type="date" className={input} value={s.featuredUntil ?? ""} onChange={(e) => set({ featuredUntil: e.target.value || undefined })} />
              </Field>
            )}
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-[var(--action)]"
                checked={s.priority === true}
                onChange={(e) => set({ priority: e.target.checked || undefined })}
              />
              <span>
                <span className="text-sm font-semibold">Priority announcement</span>
                <span className="block text-sm text-ink-muted">Leads ahead of the feature for everyone who hasn’t read it, for 30 days from its date.</span>
              </span>
            </label>
            <Field
              label="Related topic"
              hint={
                s.relatedLesson && !lessons.some((l) => l.slug === s.relatedLesson)
                  ? "The topic this story linked to has been deleted. Choose another, or leave it as None."
                  : "Shown at the end of the story."
              }
            >
              <select className={input} value={s.relatedLesson ?? ""} onChange={(e) => set({ relatedLesson: e.target.value || undefined })}>
                <option value="">None</option>
                {lessons
                  .filter((l) => l.track !== "reinforcement")
                  .map((l) => (
                    <option key={l.slug} value={l.slug}>
                      {l.title}
                    </option>
                  ))}
              </select>
            </Field>
            <fieldset>
              <legend className="text-sm font-semibold">Related resources</legend>
              {resources.map((r) => (
                <label key={r.id} className="mt-1 flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--action)]"
                    checked={(s.relatedResources ?? []).includes(r.id)}
                    onChange={(e) =>
                      set({ relatedResources: e.target.checked ? [...(s.relatedResources ?? []), r.id] : (s.relatedResources ?? []).filter((x) => x !== r.id) })
                    }
                  />
                  {r.title}
                </label>
              ))}
            </fieldset>
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <button type="button" className={btn.primary} disabled={busy || (!dirty && !isNew)} onClick={save}>
          {busy ? "Saving…" : isNew ? "Save as a draft" : "Save"}
        </button>
        {!isNew && status === "draft" && (
          <button type="button" className={btn.primary} disabled={busy} onClick={() => publish(true)}>
            Publish
          </button>
        )}
        {!isNew && (
          <a href={`/news/${initial.slug}?preview=1`} target="_blank" rel="noopener" className={btn.secondary}>
            <Icon name="eye" className="size-4" /> Preview
          </a>
        )}
        <span className="flex-1" />
        {!isNew && status === "published" && (
          <button type="button" className={btn.quiet} disabled={busy} onClick={() => publish(false)}>
            Unpublish
          </button>
        )}
        {edited && (
          <button type="button" className={btn.quiet} disabled={busy} onClick={revert}>
            Put back as it shipped
          </button>
        )}
        {!isNew && (
          <button type="button" className={cx(btn.quiet, "text-danger")} disabled={busy} onClick={remove}>
            <Icon name="trash" className="size-4" /> Delete
          </button>
        )}
        {note && (
          <p role="status" className={cx("basis-full text-sm", note.ok ? "text-ink-muted" : "font-semibold text-danger")}>
            {note.text}
          </p>
        )}
      </div>
    </AdminShell>
  );
}

const POSITIONS = [
  { label: "Top", value: "center 20%" },
  { label: "Centre", value: "center" },
  { label: "Bottom", value: "center 80%" },
];

/** The poster image: a drop zone, the image library, a description, and which part shows when it's cropped. */
/**
  The story's voiced introduction (the owner, Nov 2026), as on a Magazine page: write a short script, record it in the
  Magazine Editorial Voice (Alloy), listen, and approve it for learners. Editing the script after recording needs a new
  recording before it can be approved again. Saved with the story.
*/
function NarrationField({
  slug,
  story,
  narration,
  onChange,
}: {
  slug: string | null;
  story: Story;
  narration: Story["narration"];
  onChange: (n: Story["narration"]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const script = narration?.script ?? "";
  const audio = narration?.audio;
  const matches = Boolean(audio && audio.scriptHash === textHash(script.trim()));
  const words = script.trim() ? script.trim().split(/\s+/).length : 0;
  async function record() {
    if (!slug) return;
    setBusy(true);
    setError(null);
    try {
      const { audio: rec } = await api<{ audio: NarrationAudio }>(`/api/admin/stories/${encodeURIComponent(slug)}/narration`, { body: { script } });
      // Recorded is approved (the owner, Nov 2026): untick it to hold it back. Learners hear it once the story is published.
      onChange({ script, audio: rec, approved: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Voiced introduction" className="flex flex-col gap-3 rounded-2xl border border-line p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon name="volume" className="size-4 text-accent" /> Voiced introduction
      </h2>
      <Field label="Script" hint={`Read in the Magazine Editorial Voice (Alloy). About 70 to 130 words works well${words ? `: this is ${words}` : ""}.`}>
        <textarea
          rows={6}
          className={textarea}
          value={script}
          onChange={(e) => onChange(e.target.value.trim() ? { ...narration, script: e.target.value, approved: false } : undefined)}
        />
      </Field>
      <button type="button" className={btn.secondary} disabled={busy || !slug || !script.trim()} onClick={() => void record()}>
        <Icon name="mic" className="size-4" /> {busy ? "Recording…" : audio ? "Record again" : "Record it"}
      </button>
      {/* Every story has a script: saving drafts one from the story when the box is empty, and this redrafts it on request. */}
      <button
        type="button"
        className="self-start text-sm font-semibold text-accent transition-colors hover:text-[#007f7e]"
        onClick={() => onChange({ script: draftStoryScript(story) })}
      >
        {script.trim() ? "Redraft from the story" : "Draft from the story"}
      </button>
      {!slug && <p className="text-sm text-ink-muted">Saving the story drafts its script if this is empty. Save it first, then record.</p>}
      {error && <ErrorNote text={error} />}
      {audio && (
        <>
          <audio controls src={audio.src} className="w-full" preload="none" />
          {matches ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--color-action)]"
                checked={Boolean(narration?.approved)}
                onChange={(e) => onChange({ script, audio, approved: e.target.checked })}
              />
              <span>
                <span className="font-semibold">Approved for learners</span>
                <span className="block text-ink-muted">Ticked when it’s recorded. Learners hear it at the top of the story once it’s saved and published.</span>
              </span>
            </label>
          ) : (
            <p className="text-sm font-semibold text-[#7a4b00] dark:text-gold">
              The script has changed since this was recorded. Record it again to approve it.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** "Start from this story": a description for the poster from the story's headline, standfirst and opening, and the people it names (the owner, Nov 2026). */
function storyPictureContext(s: Story): PictureContext {
  const texts = s.body.flatMap((b) => (b.type === "p" ? [b.text] : []));
  const opening = plainText(texts[0] ?? "")
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(" ")
    .slice(0, 320);
  const about = plainText(s.dek ?? "").trim();
  const prompt = [
    `A poster photo for a news story called “${s.title.trim() || "an untitled story"}”${about ? `, about ${about[0].toLowerCase()}${about.slice(1).replace(/\.$/, "")}` : ""}`,
    opening ? `The scene: ${opening}` : "",
  ]
    .filter(Boolean)
    .join(". ")
    .replace(/[.\s]*$/, ".");
  return { label: "Start from this story", prompt, names: namesIn(s.dek ?? "", ...texts.slice(0, 3)), noun: "story" };
}

function PosterField({ visual: v, onChange, context }: { visual: Story["visual"]; onChange: (v: Story["visual"]) => void; context?: PictureContext }) {
  return (
    <section aria-label="Poster image" className="flex flex-col gap-3 rounded-2xl border border-line p-4">
      <h2 className="text-sm font-semibold">Poster image</h2>
      <ImageDropZone
        picture={v.photo}
        label="Drag the poster image here"
        // A picture from the library or Pexels brings its description with it.
        onChange={(p, _how, alt) => onChange({ ...v, ...(p && alt ? { alt } : {}), photo: p ? { ...p, position: v.photo?.position } : undefined })}
        context={context}
        preview={<StoryVisual variant={v.variant} tone={v.tone} icon={v.icon} alt={v.alt || "Poster image"} photo={v.photo} className="size-full" />}
      />
      {v.photo && (
        <>
          <Field label="Describe the image" hint="For people who can’t see it, and for search engines.">
            <textarea rows={2} className={textarea} value={v.alt} onChange={(e) => onChange({ ...v, alt: e.target.value })} />
          </Field>
          <div role="group" aria-label="Which part shows when it's cropped" className="flex flex-wrap items-center gap-1 text-sm">
            <span className="mr-1 font-semibold">Keep in view</span>
            {POSITIONS.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={(v.photo?.position ?? "center") === p.value}
                onClick={() => onChange({ ...v, photo: { ...v.photo!, position: p.value } })}
                className={cx(
                  "min-h-9 rounded-full border px-3",
                  (v.photo?.position ?? "center") === p.value ? "border-action bg-tealtint font-semibold" : "border-line-strong",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
      {!v.photo && <p className="text-sm text-ink-muted">With no picture, the story shows patterned artwork in the category colours.</p>}
    </section>
  );
}

const STATUSES = Object.keys(policyStatusLabel) as PolicyMeta["status"][];

/** For policy updates: where it comes from, its status and the dates that matter. */
function PolicyFields({ policy, onChange }: { policy?: PolicyMeta; onChange: (p: PolicyMeta) => void }) {
  const p: PolicyMeta = policy ?? { status: "announced", issuer: "", sourceTitle: "", sourceUrl: "", published: "", owner: "", reviewDate: "" };
  const set = (patch: Partial<PolicyMeta>) => onChange({ ...p, ...patch });
  return (
    <section aria-label="Policy details" className="grid gap-4 rounded-2xl border border-line p-4 sm:grid-cols-2">
      <h2 className="text-sm font-semibold sm:col-span-2">Policy details</h2>
      <Field label="Status">
        <select className={input} value={p.status} onChange={(e) => set({ status: e.target.value as PolicyMeta["status"] })}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {policyStatusLabel[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Issued by">
        <input className={input} value={p.issuer} onChange={(e) => set({ issuer: e.target.value })} />
      </Field>
      <Field label="Source title">
        <input className={input} value={p.sourceTitle} onChange={(e) => set({ sourceTitle: e.target.value })} />
      </Field>
      <Field label="Source link">
        <input className={input} value={p.sourceUrl} placeholder="https://" onChange={(e) => set({ sourceUrl: e.target.value })} />
      </Field>
      <Field label="Published">
        <input type="date" className={input} value={p.published.slice(0, 10)} onChange={(e) => set({ published: e.target.value })} />
      </Field>
      <Field label="Takes effect">
        <input type="date" className={input} value={(p.effective ?? "").slice(0, 10)} onChange={(e) => set({ effective: e.target.value || undefined })} />
      </Field>
      <Field label="Owner at Trilogy">
        <input className={input} value={p.owner} onChange={(e) => set({ owner: e.target.value })} />
      </Field>
      <Field label="Review by">
        <input type="date" className={input} value={p.reviewDate.slice(0, 10)} onChange={(e) => set({ reviewDate: e.target.value })} />
      </Field>
      <Field label="Correction" hint="Optional. Shown on the story if something has changed since it was published." className="sm:col-span-2">
        <textarea rows={2} className={textarea} value={p.correction ?? ""} onChange={(e) => set({ correction: e.target.value || undefined })} />
      </Field>
    </section>
  );
}

/** How the story shows in search results and when it's shared, with a preview like a Google result. */
function SeoFields({ story: s, slug, onChange }: { story: Story; slug?: string; onChange: (seo: NonNullable<Story["seo"]>) => void }) {
  const seo = s.seo ?? {};
  const title = seo.title || s.title;
  const description = seo.description || s.dek;
  const address = `trilogycare.com.au › news › ${slug ?? "(made from the title when you first save)"}`;
  const count = (n: number, best: number) => (
    <span className={cx("tabular-nums", n > best ? "font-semibold text-danger" : "text-ink-muted")}>
      {n} of about {best}
    </span>
  );
  return (
    <section aria-label="Search and sharing" className="grid gap-4 rounded-2xl border border-line p-4">
      <div>
        <h2 className="text-sm font-semibold">Search and sharing</h2>
        <p className="text-sm text-ink-muted">
          How the story shows in Google and when someone shares the link. Leave these empty to use the title and standfirst.
        </p>
      </div>
      <Field label="Search title">
        <input className={input} value={seo.title ?? ""} placeholder={s.title} onChange={(e) => onChange({ ...seo, title: e.target.value || undefined })} />
        <span className="text-xs">{count(title.length, 60)} characters. Longer titles are cut off in results.</span>
      </Field>
      <Field label="Search description">
        <textarea
          rows={2}
          className={textarea}
          value={seo.description ?? ""}
          placeholder={s.dek}
          onChange={(e) => onChange({ ...seo, description: e.target.value || undefined })}
        />
        <span className="text-xs">{count(description.length, 160)} characters.</span>
      </Field>
      <div aria-label="Preview of a search result" className="rounded-xl bg-white p-3 text-[#202124] shadow-sm ring-1 ring-line">
        <p className="truncate text-xs text-[#4d5156]">{address}</p>
        <p className="mt-0.5 truncate text-lg leading-snug text-[#1a0dab]">{title || "Story title"}</p>
        <p className="line-clamp-2 text-sm text-[#4d5156]">{description || "The standfirst appears here."}</p>
      </div>
      {!s.visual.photo && <p className="text-sm text-ink-muted">Add a poster image so shared links show a picture.</p>}
      {s.visual.photo && !s.visual.alt && <p className="text-sm font-semibold text-danger">Describe the poster image: search engines read it too.</p>}
    </section>
  );
}

/** At the top of a new story: a brief in, a complete news item out, every field filled in to check. */
const DOC_TYPES =
  ".docx,.pptx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain";
const DOC_OK = /\.(docx|pptx|pdf|txt|md)$/i;

/**
  "Write it with AI" on a new story: drop in a document (Word, PowerPoint, PDF or text) and/or type a brief, and AI
  fills in every field below from it (server/storyDraft). Nothing is saved until the author saves.
*/
type Written = { story: Story; imageIdea: string; imageAlt: string; pictures: PictureIdeas["pictures"] };

function StoryWriter({ onDraft }: { onDraft: (r: Written, makePoster: boolean) => void }) {
  // Make the poster with AI as soon as the story is written (the owner, Nov 2026): on unless the author unticks it.
  const [poster, setPoster] = useState(true);
  const [brief, setBrief] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // The document's words, read here in the browser: the file itself is never uploaded.
  const [doc, setDoc] = useState<DocumentText | null>(null);
  const [reading, setReading] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const words = brief.trim().split(/\s+/).filter(Boolean).length;
  function choose(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (/\.(doc|ppt)$/i.test(f.name))
      return setError(`That’s an older Office file. Save it as .${/\.ppt$/i.test(f.name) ? "pptx" : "docx"} or PDF and try again.`);
    if (!DOC_OK.test(f.name)) return setError("Drop a Word (.docx), PowerPoint (.pptx), PDF or text file.");
    setFile(f);
    setDoc(null);
    setReading(true);
    readDocumentText(f)
      .then((d) => {
        if (d.text.split(/\s+/).filter(Boolean).length < 20)
          throw new Error(
            "Almost no text could be read from it. If it’s a scan or all pictures, export it as a PDF with text, or paste the key part into the brief.",
          );
        setDoc(d);
      })
      .catch((e: Error) => {
        setFile(null);
        setError(e.message || "That document couldn’t be read.");
      })
      .finally(() => setReading(false));
  }
  async function write() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<Written>("/api/admin/stories/draft", {
        body: { brief, ...(doc ? { document: { name: doc.name, text: doc.text } } : {}) },
      });
      onDraft(r, poster);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="writer-heading" className="mt-5 rounded-3xl border-2 border-action/30 bg-surface p-5">
      <h2 id="writer-heading" className="flex items-center gap-2 font-serif text-xl font-semibold">
        <Icon name="spark" className="size-5 text-accent" /> Write it with AI
      </h2>
      <p className="mt-1 max-w-3xl text-ink-muted">
        Drop in a document, or type a brief, or both. AI writes the story from it and fills in every field below: headline, standfirst, the story, category,
        audience, At a glance, actions to try, related learning, search details and the introduction script. It uses only what’s in your document and brief, so
        check the facts before you save.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            choose(e.dataTransfer.files[0]);
          }}
          className={cx(
            "flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition-colors",
            over ? "border-[#007f7e] bg-[#e6f3f1]" : "border-line-strong",
          )}
        >
          {file ? (
            <>
              <Icon name="file" className="size-6 text-accent" />
              <p className="max-w-full break-words font-semibold">{file.name}</p>
              <p className="text-sm text-ink-muted" aria-live="polite">
                {reading
                  ? "Reading it…"
                  : doc
                    ? `${doc.kind === "PowerPoint" ? `${doc.parts} ${doc.parts === 1 ? "slide" : "slides"}` : doc.kind === "PDF" ? `${doc.parts} ${doc.parts === 1 ? "page" : "pages"}` : doc.kind} read · ${doc.text.split(/\s+/).filter(Boolean).length.toLocaleString()} words`
                    : ""}
              </p>
              <button
                type="button"
                className={btn.quiet}
                disabled={busy}
                onClick={() => {
                  setFile(null);
                  setDoc(null);
                }}
              >
                <Icon name="close" className="size-4" /> Remove
              </button>
            </>
          ) : (
            <>
              <Icon name="upload" className="size-6 text-accent" />
              <p className="font-semibold">Drop a document here</p>
              <p className="text-sm text-ink-muted">Word, PowerPoint, PDF or text</p>
              <label className={cx(btn.secondary, "cursor-pointer")}>
                Choose a file
                <input type="file" accept={DOC_TYPES} className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
              </label>
            </>
          )}
        </div>
        <div className="flex flex-col">
          <label htmlFor="story-brief" className="text-sm font-semibold">
            {file ? "Anything to add? (optional)" : "Or write a brief"}
          </label>
          <textarea
            id="story-brief"
            rows={6}
            value={brief}
            maxLength={4000}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={
              file
                ? "For example: write it for coordinators, and lead with what changes for them."
                : "For example: From 1 December partners must log visit notes in the Trilogy Care Portal on the day of the visit, not at the end of the week. Applies to all Care Partners. Source: Trilogy Care operations update, 20 November."
            }
            className={cx(textarea, "mt-1 flex-1")}
          />
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <ErrorNote text={error} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={btn.primary} disabled={busy || reading || (file ? !doc : words < 8)} onClick={write}>
          <Icon name="spark" className="size-4" />{" "}
          {busy ? "Writing the story…" : done ? "Write it again" : file ? "Write the story from this document" : "Write the story"}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--action)]" checked={poster} onChange={(e) => setPoster(e.target.checked)} />
          Make a poster picture as well
        </label>
        {busy && <span className="text-sm text-ink-muted">This usually takes under a minute{file ? ", longer for a big document" : ""}.</span>}
      </div>
    </section>
  );
}
