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
import { ImageDropZone } from "./ImagePicker";
import { StoryDocEditor } from "./StoryDocEditor";

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
  builtIn: boolean;
  photo: string | null;
  updatedAt: string | null;
};
type Detail = Summary & { story: Story; deleted: boolean };

const textarea = "w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[0.98rem] leading-relaxed";

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
                  </div>
                  <h2 className="font-serif text-lg font-semibold leading-snug">
                    <Link href={`/admin/news/${s.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
                      {s.title}
                    </Link>
                  </h2>
                  <p className="mt-auto pt-1 text-sm text-ink-muted">{formatDate(s.date)}</p>
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
          onDraft={(story, imageIdea) => {
            // Keep a poster already chosen; everything else comes from the draft.
            setS((x) => ({ ...story, visual: x.visual.photo ? x.visual : story.visual }));
            setDirty(true);
            setNote({
              text: `Claude filled in the story from your brief. Check every fact and add a poster image${imageIdea ? ` (suggestion: ${imageIdea})` : ""}, then save.`,
              ok: true,
            });
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
          {s.category === "policy" && <PolicyFields policy={s.policy} onChange={(policy) => set({ policy })} />}
          <SeoFields story={s} slug={initial?.slug} onChange={(seo) => set({ seo })} />
        </div>

        <aside className="flex flex-col gap-5">
          <PosterField visual={s.visual} onChange={(visual) => set({ visual })} />
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
function PosterField({ visual: v, onChange }: { visual: Story["visual"]; onChange: (v: Story["visual"]) => void }) {
  return (
    <section aria-label="Poster image" className="flex flex-col gap-3 rounded-2xl border border-line p-4">
      <h2 className="text-sm font-semibold">Poster image</h2>
      <ImageDropZone
        picture={v.photo}
        label="Drag the poster image here"
        onChange={(p) => onChange({ ...v, photo: p ? { ...p, position: v.photo?.position } : undefined })}
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
function StoryWriter({ onDraft }: { onDraft: (story: Story, imageIdea: string) => void }) {
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function write() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ story: Story; imageIdea: string }>("/api/admin/stories/draft", { body: { brief } });
      onDraft(r.story, r.imageIdea);
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
        <Icon name="spark" className="size-5 text-accent" /> Write it with Claude
      </h2>
      <p className="mt-1 max-w-3xl text-ink-muted">
        Paste or type a brief: what’s happening, who it’s for, what they need to do, and any dates, sources or quotes. Claude turns it into a news item and
        fills in every field below. It uses only what’s in your brief, so check the facts before you save.
      </p>
      <label htmlFor="story-brief" className="sr-only">
        Your brief
      </label>
      <textarea
        id="story-brief"
        rows={5}
        value={brief}
        maxLength={4000}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="For example: From 1 December partners must log visit notes in the Trilogy Care Portal on the day of the visit, not at the end of the week. Applies to all Care Partners. Source: Trilogy Care operations update, 20 November."
        className={cx(textarea, "mt-3")}
      />
      {error && (
        <div className="mt-2">
          <ErrorNote text={error} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={btn.primary} disabled={busy || brief.trim().split(/\s+/).filter(Boolean).length < 8} onClick={write}>
          <Icon name="spark" className="size-4" /> {busy ? "Writing the story…" : done ? "Write it again" : "Write the story"}
        </button>
        {busy && <span className="text-sm text-ink-muted">This usually takes under a minute.</span>}
      </div>
    </section>
  );
}
