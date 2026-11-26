"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { INTRO_STATUSES, type IntroStatus, type PresenterProfile } from "@/lib/topicIntro";
import { Icon } from "../Icon";
import { ImageDropZone, ImageLibraryDialog } from "./ImagePicker";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";

/*
  The Topic Introduction Manager (docs/topic-video-introductions.md): every Topic's introduction in one place, with bulk
  actions on their drafts, the presenter profiles, and the migration that gives existing Topics their Introduction card.
  Nothing here publishes a Topic or sends anything to a video provider.
*/

type Row = {
  slug: string;
  title: string;
  category: string;
  presenter: { id: string | null; name: string; isDefault: boolean };
  thumbnail: string | null;
  hasIntro: boolean;
  status: IntroStatus;
  statusLabel: string;
  script: string;
  video: string;
  approval: string;
  outdated: boolean;
  reasons: string[];
  words: number;
  topicState: "unpublished" | "live" | "changes";
  updatedAt: string | null;
};
type Preview = {
  topics: number;
  haveIntro: number;
  wouldAdd: number;
  wouldReuse: number;
  wouldReuseVideo: number;
  wouldFold: number;
  foldPictures: number;
  foldScripts: number;
  wouldMove: number;
  duplicates: number;
  titleCardsAfterIntro: number;
  publishedInPlace: number;
  contentTopics: number;
  learnersInProgress: number;
};
type Data = { rows: Row[]; presenters: PresenterProfile[]; videoGeneration: boolean; migration: Preview };
type Estimate = { topics: number; calls: number; maxCalls: number; inputTokens: number; outputTokens: number; model: string; label: string };
type Stats = Record<"video" | "placeholder", Record<string, number | null>> & { slug: string };

const FILTERS = {
  all: { label: "All topics", test: () => true },
  missing: { label: "Without a script", test: (r: Row) => r.script === "Script required" },
  outdated: { label: "Requires review", test: (r: Row) => r.outdated },
  noCard: { label: "No Introduction card yet", test: (r: Row) => !r.hasIntro },
  approved: { label: "Script approved, no video", test: (r: Row) => r.status === "script_approved" || r.status === "placeholder" },
  production: { label: "Ready for production", test: (r: Row) => r.status === "ready_for_production" },
} as const satisfies Record<string, { label: string; test: (r: Row) => boolean }>;

const tone = (s: IntroStatus) => {
  const t = INTRO_STATUSES[s].tone;
  return t === "good" ? "good" : t === "bad" ? "bad" : t === "warn" ? "warn" : t === "info" ? "info" : "neutral";
};

export function TopicIntroManager() {
  const { data, error, reload } = useApi<Data>("/api/admin/topic-intros");
  const [filter, setFilter] = useState<keyof typeof FILTERS>("all");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => FILTERS[filter].test(r) && (!q.trim() || `${r.title} ${r.category}`.toLowerCase().includes(q.trim().toLowerCase()))),
    [data, filter, q],
  );
  const slugs = [...picked].filter((s) => rows.some((r) => r.slug === s));
  const toggle = (slug: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setProblem(null);
    setNote(null);
    try {
      const r = await api<{ done: string[]; skipped: { slug: string; why: string }[] }>("/api/admin/topic-intros", { body: { action, slugs, ...extra } });
      setNote(
        `Done for ${r.done.length} ${r.done.length === 1 ? "topic" : "topics"}${r.skipped.length ? `; ${r.skipped.length} skipped (${[...new Set(r.skipped.map((s) => s.why))].join(" ")})` : ""}. Drafts only: publish each topic to make it live.`,
      );
      reload();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function generateScripts() {
    setBusy("estimate");
    setProblem(null);
    try {
      const est = await api<{ estimate: Estimate; confirm: string; slugs: string[] }>("/api/admin/topic-intros", {
        body: { action: "estimate_scripts", slugs },
      });
      setBusy(null);
      if (!est.slugs.length) return setNote("Every chosen topic already has a script.");
      const e = est.estimate;
      const ok = await confirmAction(
        `${e.topics} ${e.topics === 1 ? "script" : "scripts"} with ${e.model}: ${e.calls} paid AI ${e.calls === 1 ? "call" : "calls"} (up to ${e.maxCalls} if replies need fixing), about ${e.inputTokens.toLocaleString()} input and ${e.outputTokens.toLocaleString()} output tokens. ${e.label} Each script is saved as a draft to check and approve.`,
        { title: "Generate the missing scripts?", confirmLabel: "Generate (paid)" },
      );
      if (ok) await run("generate_scripts", { slugs: est.slugs, confirm: est.confirm });
    } catch (e) {
      setProblem((e as Error).message);
      setBusy(null);
    }
  }

  async function migrate() {
    const m = data?.migration;
    if (!m) return;
    const ok = await confirmAction(
      `${m.wouldAdd} topics get a new Introduction card, ${m.wouldFold} have their title card folded into it (its picture becomes their placeholder), and ${m.wouldReuse} keep their first presenter card as it is (${m.wouldReuseVideo} with a video). Published topics are changed in place, keeping their version, so learner progress, completions and assessments are untouched.`,
      { title: "Add Introduction cards to every topic?", confirmLabel: "Apply", danger: true },
    );
    if (!ok) return;
    setBusy("migrate");
    try {
      const r = await api<{ changed: string[] }>("/api/admin/topic-intros", { body: { action: "apply_migration", confirm: "add-introduction-cards" } });
      setNote(`${r.changed.length} topics now open with their Introduction card. Restart the server so every page picks them up.`);
      reload();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const m = data?.migration;
  return (
    <AdminShell title="Topic introductions" back={{ href: "/admin/lessons", label: "Topics" }}>
      <p className="max-w-3xl text-ink-muted">
        Every topic opens with a short portrait video introduction. Until videos can be made, learners see the presenter’s placeholder portrait. Scripts,
        presenters and placeholders here change each topic’s draft; publish a topic to make its changes live.
      </p>
      {error && <ErrorNote text={error} />}

      {m && m.topics > m.haveIntro && (
        <section className="mt-5 rounded-3xl border-2 border-gold bg-gold/10 p-5">
          <h2 className="font-semibold">Migration preview</h2>
          <p className="mt-1 text-sm">
            {m.topics - m.haveIntro} of {m.topics} topics don’t open with their Introduction card yet. Nothing has changed: this is a preview.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Already have one", m.haveIntro],
              ["Would get a new card", m.wouldAdd],
              ["Would reuse their presenter card", m.wouldReuse],
              ["…with a video kept", m.wouldReuseVideo],
              ["Title card folded into the intro", m.wouldFold],
              ["Duplicates to tidy", m.duplicates],
              ["Card to move first", m.wouldMove],
              ["Title card after the intro", m.titleCardsAfterIntro],
              ["Learners part-way (carry on)", m.learnersInProgress],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-surface p-3 ring-1 ring-line">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="font-serif text-2xl font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <button type="button" className={cx(btn.secondary, "mt-3")} onClick={migrate} disabled={busy !== null}>
            {busy === "migrate" ? "Applying…" : "Apply the migration…"}
          </button>
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <Field label="Show" className="w-56">
          <select className={input} value={filter} onChange={(e) => setFilter(e.target.value as keyof typeof FILTERS)}>
            {Object.entries(FILTERS).map(([k, f]) => (
              <option key={k} value={k}>
                {f.label} ({(data?.rows ?? []).filter(f.test).length})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Search" className="min-w-48 flex-1">
          <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or category" />
        </Field>
      </div>

      <div className="sticky top-16 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 shadow-sm ring-1 ring-line">
        <span className="mr-1 text-sm font-semibold">{slugs.length} chosen</span>
        <button type="button" className={btn.quiet} onClick={() => setPicked(new Set(rows.map((r) => r.slug)))}>
          Choose all shown
        </button>
        {slugs.length > 0 && (
          <button type="button" className={btn.quiet} onClick={() => setPicked(new Set())}>
            Clear
          </button>
        )}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <button type="button" className={btn.secondary} disabled={!slugs.length || busy !== null} onClick={generateScripts}>
          <Icon name="spark" className="size-4" /> {busy === "generate_scripts" ? "Writing…" : "Generate missing scripts"}
        </button>
        <select
          aria-label="Assign a presenter"
          className={cx(input, "w-auto")}
          value=""
          disabled={!slugs.length || busy !== null}
          onChange={(e) => e.target.value && run("assign_presenter", { presenterId: e.target.value === "default" ? null : e.target.value })}
        >
          <option value="">Assign a presenter…</option>
          <option value="default">The default presenter</option>
          {(data?.presenters ?? [])
            .filter((p) => p.active && !p.isDefault)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <button type="button" className={btn.secondary} disabled={!slugs.length || busy !== null} onClick={() => setLibrary(true)}>
          Replace placeholders
        </button>
        <button type="button" className={btn.secondary} disabled={!slugs.length || busy !== null} onClick={() => run("replace_placeholder", { picture: null })}>
          Reset to presenter’s portrait
        </button>
        <button type="button" className={btn.secondary} disabled={!slugs.length || busy !== null} onClick={() => run("prepare_production")}>
          Prepare approved scripts for production
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Video generation is {data?.videoGeneration ? "switched on" : "switched off"}. Preparing for production never sends anything: each video needs an author
        to confirm it.
      </p>
      {note && <p className="mt-3 rounded-2xl bg-tealtint px-4 py-2 text-sm font-medium">{note}</p>}
      {problem && (
        <div className="mt-3">
          <ErrorNote text={problem} />
        </div>
      )}
      <ImageLibraryDialog
        open={library}
        onClose={() => setLibrary(false)}
        onPick={(p) => {
          setLibrary(false);
          run("replace_placeholder", { picture: { src: p.src, width: p.width, height: p.height } });
        }}
      />

      <div className="mt-4 overflow-x-auto rounded-3xl bg-surface shadow-sm ring-1 ring-line">
        <table className="w-full min-w-[60rem] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="p-3">
                <span className="sr-only">Choose</span>
              </th>
              <th className="p-3">Topic</th>
              <th className="p-3">Presenter</th>
              <th className="p-3">Script</th>
              <th className="p-3">Video</th>
              <th className="p-3">Approval</th>
              <th className="p-3">Status</th>
              <th className="p-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {!data && !error && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-ink-muted">
                  Loading…
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.slug} className="border-b border-line last:border-0 align-top">
                <td className="p-3">
                  <input type="checkbox" className="size-5" aria-label={`Choose ${r.title}`} checked={picked.has(r.slug)} onChange={() => toggle(r.slug)} />
                </td>
                <td className="p-3">
                  <div className="flex gap-3">
                    <div className="relative aspect-[9/16] w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {r.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.thumbnail} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <Link href={`/admin/lessons/${r.slug}/edit`} className="font-semibold hover:underline">
                        {r.title}
                      </Link>
                      <p className="text-xs text-ink-muted">
                        {r.category} · {r.topicState === "unpublished" ? "not published" : r.topicState === "changes" ? "changes to publish" : "live"}
                      </p>
                      <button
                        type="button"
                        className="mt-1 text-xs font-semibold text-accent hover:underline"
                        onClick={() => api<Stats>(`/api/admin/topic-intros?stats=${r.slug}`).then(setStats, () => {})}
                      >
                        Engagement
                      </button>
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  {r.presenter.name}
                  {r.presenter.isDefault && <span className="block text-xs text-ink-muted">Default</span>}
                </td>
                <td className="p-3">
                  {r.script}
                  {r.words > 0 && <span className="block text-xs text-ink-muted">{r.words} words</span>}
                </td>
                <td className="p-3">{r.video}</td>
                <td className="p-3 text-ink-muted">{r.approval}</td>
                <td className="p-3">
                  <Badge tone={tone(r.status)}>{r.statusLabel}</Badge>
                  {r.reasons.map((x) => (
                    <span key={x} className="mt-1 block text-xs text-ink-muted">
                      {x}
                    </span>
                  ))}
                  {!r.hasIntro && <span className="mt-1 block text-xs text-ink-muted">No Introduction card yet</span>}
                </td>
                <td className="p-3 text-ink-muted">{r.updatedAt ? r.updatedAt.slice(0, 10) : "Not edited"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stats && (
        <section className="mt-5 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Introduction engagement: {data?.rows.find((r) => r.slug === stats.slug)?.title}</h2>
            <button type="button" className={btn.quiet} onClick={() => setStats(null)}>
              Close
            </button>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Placeholder and video kept apart. Watching a video isn’t evidence of learning or of a change in practice.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {(["video", "placeholder"] as const).map((k) => (
              <dl key={k} className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-2xl bg-muted p-4 text-sm">
                <dt className="col-span-2 font-semibold">{k === "video" ? "With a video" : "With the placeholder"}</dt>
                {Object.entries(stats[k]).map(([name, v]) => (
                  <div key={name} className="contents">
                    <dt className="text-ink-muted">{name.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
                    <dd>{v ?? "–"}</dd>
                  </div>
                ))}
              </dl>
            ))}
          </div>
        </section>
      )}

      <Presenters presenters={data?.presenters ?? []} onSaved={reload} />
    </AdminShell>
  );
}

const blank = (): Partial<PresenterProfile> => ({ provider: "synthesia", language: "en-AU", accent: "Australian", active: true });

function Presenters({ presenters, onSaved }: { presenters: PresenterProfile[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<Partial<PresenterProfile> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (k: keyof PresenterProfile, v: unknown) => setEditing((e) => (e ? { ...e, [k]: v } : e));
  async function save() {
    setProblem(null);
    try {
      await api("/api/admin/topic-intros/presenters", { body: editing });
      setEditing(null);
      onSaved();
    } catch (e) {
      setProblem((e as Error).message);
    }
  }
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif text-xl font-semibold">Presenters</h2>
        <button type="button" className={btn.secondary} onClick={() => setEditing(blank())}>
          <Icon name="plus" className="size-4" /> Add a presenter
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Reusable across topics. Ava, the care coordinator on the road, is a separate character and isn’t a Topic presenter.
      </p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {presenters.map((p) => (
          <li key={p.id} className="flex gap-3 rounded-2xl bg-surface p-3 shadow-sm ring-1 ring-line">
            <div className="relative aspect-[9/16] w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.portrait.src}
                alt=""
                className="absolute inset-0 size-full object-cover"
                style={{ objectPosition: p.portrait.position ?? "center" }}
              />
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">
                {p.name} {p.isDefault && <Badge tone="good">Default</Badge>} {!p.active && <Badge>Off</Badge>}
              </p>
              <p className="mt-0.5 line-clamp-2 text-ink-muted">{p.description}</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {p.provider} · {p.language} · {p.accent}
                {p.avatarId ? "" : " · no avatar id yet"}
              </p>
              <button type="button" className="mt-1 font-semibold text-accent hover:underline" onClick={() => setEditing(p)}>
                Edit
              </button>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <div className="mt-4 grid gap-3 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line sm:grid-cols-2">
          <Field label="Name">
            <input className={input} value={editing.name ?? ""} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Provider">
            <select className={input} value={editing.provider} onChange={(e) => set("provider", e.target.value)}>
              <option value="synthesia">Synthesia</option>
              <option value="upload">Videos uploaded by authors</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="none">None</option>
            </select>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea className={cx(input, "min-h-16 py-2")} value={editing.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="sm:row-span-3">
            <p className="mb-1 text-sm font-semibold">Placeholder portrait</p>
            <div className="max-w-40">
              <ImageDropZone
                aspect="aspect-[9/16]"
                picture={editing.portrait}
                onChange={(p) => set("portrait", p && { src: p.src, width: p.width, height: p.height })}
              />
            </div>
          </div>
          <Field label="Avatar id" hint="The provider’s id, once set up.">
            <input className={input} value={editing.avatarId ?? ""} onChange={(e) => set("avatarId", e.target.value)} />
          </Field>
          <Field label="Voice id">
            <input className={input} value={editing.voiceId ?? ""} onChange={(e) => set("voiceId", e.target.value)} />
          </Field>
          <Field label="Template id">
            <input className={input} value={editing.templateId ?? ""} onChange={(e) => set("templateId", e.target.value)} />
          </Field>
          <Field label="Language">
            <input className={input} value={editing.language ?? ""} onChange={(e) => set("language", e.target.value)} />
          </Field>
          <Field label="Accent">
            <input className={input} value={editing.accent ?? ""} onChange={(e) => set("accent", e.target.value)} />
          </Field>
          <Field label="Delivery style" className="sm:col-span-2">
            <input className={input} value={editing.deliveryStyle ?? ""} onChange={(e) => set("deliveryStyle", e.target.value)} />
          </Field>
          <Field label="Suits (audience)" hint="Empty for everyone.">
            <input className={input} value={editing.audience ?? ""} onChange={(e) => set("audience", e.target.value)} />
          </Field>
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-5" checked={editing.active ?? true} onChange={(e) => set("active", e.target.checked)} /> Active
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-5" checked={editing.isDefault ?? false} onChange={(e) => set("isDefault", e.target.checked)} /> The default
              presenter
            </label>
          </div>
          {problem && (
            <div className="sm:col-span-2">
              <ErrorNote text={problem} />
            </div>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" className={btn.primary} onClick={save}>
              Save presenter
            </button>
            <button type="button" className={btn.secondary} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
