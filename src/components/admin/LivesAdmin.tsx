"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  BIBLE_SECTIONS,
  cleanBible,
  DEFAULT_FOCUS,
  LIFE_EVENT_CATEGORIES,
  type Bible,
  type CastMember,
  type LifeEvent,
  type LifeEventCategory,
  type LivesSettings,
} from "@/lib/livesInProgress";
import type { livesAdmin, livesBible, livesReport } from "@/server/livesAuthoring";
import type { momentsReport } from "@/server/lifeMoments";
import type { calendarReport } from "@/server/livingCalendar";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { ImageLibraryDialog } from "./ImagePicker";
import { Portrait } from "../community/DigitalMemberProfile";
import { Icon } from "../Icon";
import { ArcsTab, AssistantTab } from "./LivesArcs";
import { MomentsTab } from "./LivesMomentsAdmin";
import { LivesOverview } from "./LivesOverview";

/*
  Admin → Lives in Progress (server/livesAuthoring, docs/lives-in-progress.md): the Digital Members' ongoing stories.
  Characters (their Bibles and supporting cast), the Story Bank (the Life Event Bank), Story Arcs and their episodes,
  the AI Story Assistant, conversational memory, the report, and previews of what learners will see.

  Learners' conversations are never shown here: the memory tab and the report have counts only.
*/

export type Admin = ReturnType<typeof livesAdmin>;
type BibleView = ReturnType<typeof livesBible>;
type Report = ReturnType<typeof livesReport>;

const TABS = [
  ["characters", "Characters"],
  ["bank", "Story Bank"],
  ["arcs", "Story Arcs"],
  ["moments", "Life Moments"],
  ["assistant", "AI Story Assistant"],
  ["memory", "Conversational memory"],
  ["report", "Report"],
  ["preview", "Preview"],
] as const;
type Tab = (typeof TABS)[number][0];

export const textarea = cx(input, "min-h-24 py-2 leading-relaxed");

export function LivesAdmin() {
  const { data, error, reload } = useApi<Admin>("/api/admin/lives");
  const [tab, setTab] = useState<Tab>("characters");
  // The tab is kept in the address, so a link (or the report's link in the menu) opens the right one.
  useEffect(() => {
    const fromHash = () => {
      const t = location.hash.slice(1) as Tab;
      if (TABS.some(([k]) => k === t)) setTab(t);
    };
    fromHash();
    addEventListener("hashchange", fromHash);
    return () => removeEventListener("hashchange", fromHash);
  }, []);
  const choose = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  };

  return (
    <AdminShell title="Lives in Progress">
      <div className="flex flex-col gap-6">
        <p className="max-w-4xl text-ink-muted">
          The Digital Members’ lives carry on. Keep each person’s Character Bible and supporting cast, plan Story Arcs of episodes, record their audio diaries
          and schedule each episode. Learners see an episode only once it’s approved and its time has come, on{" "}
          <Link href="/community#digital" className="font-semibold text-accent hover:underline">
            Community → Digital Members
          </Link>{" "}
          and the homepage. The chat itself is set up in{" "}
          <Link href="/admin/member-chat" className="font-semibold text-accent hover:underline">
            Digital Member chat
          </Link>
          .
        </p>
        {data?.demo.enabled && (
          <p className="flex items-start gap-2 rounded-2xl bg-[#fff4dc] p-3 text-sm text-[#6b4a00] dark:bg-[#3a2e12] dark:text-[#f5d48a]">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            Demo Hub: the stories of Mrs Alvarez, Margaret Alder and Mr Okafor are demonstration content, marked “Demo”, with placeholder pictures. The seed
            records nothing: any recordings here were made by an author. They’re seeded only where HUB_LIVES_DEMO=1 or on a local development server.
          </p>
        )}
        {/* The six parts as one flow, with live counts and what needs attention (LivesOverview). */}
        <LivesOverview onTab={(t) => TABS.some(([k]) => k === t) && choose(t as Tab)} />
        <div role="tablist" aria-label="Lives in Progress" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={tab === k}
              onClick={() => choose(k)}
              className={cx(
                "min-h-11 shrink-0 border-b-[3px] px-3 font-semibold",
                tab === k ? "border-[var(--color-action)] text-ink" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {error && <ErrorNote text={error} />}
        {!data && !error && <p className="text-ink-muted">Loading…</p>}
        {data && tab === "characters" && <CharactersTab admin={data} reload={reload} />}
        {data && tab === "bank" && <BankTab admin={data} reload={reload} />}
        {data && tab === "arcs" && <ArcsTab admin={data} reload={reload} />}
        {data && tab === "moments" && <MomentsTab />}
        {data && tab === "assistant" && <AssistantTab admin={data} reload={reload} />}
        {data && tab === "memory" && <MemoryTab admin={data} reload={reload} />}
        {data && tab === "report" && <ReportTab />}
        {data && tab === "preview" && <PreviewTab admin={data} />}
      </div>
    </AdminShell>
  );
}

/**
  Where a picture is framed in the story's hero: click the face on the whole picture (or use the sliders), and see the
  hero's crop beside it. "x% y%", empty for the Hub's default.
*/
export function FocusField({
  src,
  value,
  onChange,
  label = "Where the face is",
}: {
  src: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const [x, y] = (value || DEFAULT_FOCUS).split(" ").map((n) => Number.parseFloat(n));
  const set = (nx: number, ny: number) => onChange(`${Math.round(nx)}% ${Math.round(ny)}%`);
  if (!src) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          aria-label="Click where the face is"
          className="relative size-32 shrink-0 cursor-crosshair overflow-hidden rounded-xl bg-muted"
          onClick={(ev) => {
            const r = ev.currentTarget.getBoundingClientRect();
            set(((ev.clientX - r.left) / r.width) * 100, ((ev.clientY - r.top) / r.height) * 100);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are */}
          <img src={src} alt="" className="size-full object-fill" />
          <span
            aria-hidden
            className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#fab53d]/80 shadow"
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        </button>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">How the hero shows it</span>
          <span className="relative block h-32 w-40 overflow-hidden rounded-xl bg-[#0b1f33]">
            {/* eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are */}
            <img src={src} alt="" className="size-full object-cover" style={{ objectPosition: `${x}% ${y}%` }} />
          </span>
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            Across{" "}
            <input
              type="range"
              min={0}
              max={100}
              value={x}
              onChange={(ev) => set(Number(ev.target.value), y)}
              className="flex-1 accent-[var(--color-action)]"
            />
          </label>
          <label className="flex items-center gap-2">
            Down{" "}
            <input
              type="range"
              min={0}
              max={100}
              value={y}
              onChange={(ev) => set(x, Number(ev.target.value))}
              className="flex-1 accent-[var(--color-action)]"
            />
          </label>
          <span className="text-xs text-ink-muted">
            {value || `${DEFAULT_FOCUS} (the default)`}
            {value && (
              <button type="button" className="ml-2 font-semibold text-accent hover:underline" onClick={() => onChange("")}>
                Use the default
              </button>
            )}
          </span>
        </div>
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------
// Characters: Bibles and their cast
// ---------------------------------------------------------------------------------------------

const BIBLE_TONE: Record<string, { label: string; tone: "good" | "warn" | "neutral" | "info" }> = {
  none: { label: "No Bible yet", tone: "neutral" },
  draft: { label: "Draft", tone: "warn" },
  changed: { label: "Approved · changes waiting", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
};

function CharactersTab({ admin, reload }: { admin: Admin; reload: () => void }) {
  const [id, setId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  if (id) return <BibleEditor memberId={id} onBack={() => (setId(null), reload())} />;
  const shown = admin.members.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-muted">
        Every Digital Member can have a Character Bible: who they are, their history, personality, daily life, care and how they look and sound. The chat plays
        from the approved version only. A member without one starts from their existing introduction, so nothing already written is lost.
      </p>
      <input className={cx(input, "max-w-sm")} placeholder="Find someone" aria-label="Find someone" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => setId(m.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left hover:border-[var(--color-action)]"
            >
              <Portrait name={m.name} src={m.portrait} className="size-14 text-sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{m.name}</span>
                <span className="block text-xs text-ink-muted">{m.group}</span>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone={BIBLE_TONE[m.bible].tone}>{BIBLE_TONE[m.bible].label}</Badge>
                  {m.arcs > 0 && <Badge tone="info">{m.arcs === 1 ? "1 arc" : `${m.arcs} arcs`}</Badge>}
                  {m.live && <Badge tone="good">Ep {m.live.number} out</Badge>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BibleEditor({ memberId, onBack }: { memberId: string; onBack: () => void }) {
  const { data, error, setData } = useApi<BibleView>(`/api/admin/lives?bible=${encodeURIComponent(memberId)}`);
  const [draft, setDraft] = useState<Bible | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [picking, setPicking] = useState<"portrait" | "references" | "lifestyle" | null>(null);
  const voices = useApi<{ voices: { voiceId: string; name: string; description: string }[]; openai: { id: string; label: string }[]; note: string | null }>(
    "/api/admin/magazine/voices",
  );
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  const b = draft ?? data.draft;
  const changed = JSON.stringify(b) !== JSON.stringify(data.draft);
  const set = (section: keyof Bible, key: string, value: unknown) => setDraft({ ...b, [section]: { ...(b[section] as object), [key]: value } } as Bible);
  const run = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setProblem(null);
    setSaved(null);
    try {
      const next = await api<BibleView>("/api/admin/lives", { body });
      setData(next);
      setDraft(null);
      setNote("");
      setSaved(done);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex flex-col gap-5">
      <button type="button" onClick={onBack} className={cx(btn.quiet, "self-start")}>
        <Icon name="arrow-left" className="size-4" /> All characters
      </button>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif text-3xl font-semibold">{data.name}: Character Bible</h2>
        {data.version > 0 ? <Badge tone="good">Version {data.version} approved</Badge> : <Badge tone="warn">Not approved yet</Badge>}
        {!data.saved && <Badge>Started from the introduction, not saved yet</Badge>}
      </div>
      {b.reconcile && (
        <div className="rounded-2xl border border-[#fab53d] bg-[#fff8e8] p-4 text-sm dark:bg-[#2e2612]">
          <p className="font-semibold">To reconcile with established canon</p>
          <p className="mt-1 whitespace-pre-line">{b.reconcile}</p>
        </div>
      )}
      {BIBLE_SECTIONS.map((s) => (
        <details key={s.key} open={s.key === "identity"} className="rounded-3xl border border-line bg-surface p-5">
          <summary className="cursor-pointer font-serif text-xl font-semibold">{s.label}</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {s.fields.map(([k, label]) => {
              const v = (b[s.key] as Record<string, string>)[k];
              const short = ["fullName", "preferredName", "age", "birthDate", "pronouns", "culture", "location"].includes(k);
              return (
                <Field key={k} label={label}>
                  {short ? (
                    <input className={input} value={v} onChange={(e) => set(s.key, k, e.target.value)} />
                  ) : (
                    <textarea className={textarea} value={v} onChange={(e) => set(s.key, k, e.target.value)} />
                  )}
                </Field>
              );
            })}
          </div>
        </details>
      ))}
      <details open className="rounded-3xl border border-line bg-surface p-5">
        <summary className="cursor-pointer font-serif text-xl font-semibold">Media identity</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Permanent profile image</span>
            <div className="flex items-center gap-3">
              <Portrait name={data.name} src={b.media.portrait} className="size-20" />
              <button type="button" className={btn.secondary} onClick={() => setPicking("portrait")}>
                Choose from the library
              </button>
            </div>
            <span className="text-xs text-ink-muted">The photo library’s portrait stays the character’s face everywhere; this is the one stories use.</span>
          </div>
          <div className="sm:col-span-2">
            <FocusField src={b.media.portrait} value={b.media.focus} onChange={(v) => setDraft({ ...b, media: { ...b.media, focus: v } })} />
            <p className="mt-1 text-xs text-ink-muted">
              Used wherever the portrait fills a wide picture, such as the top of their story, so their whole face shows.
            </p>
          </div>
          {(["references", "lifestyle"] as const).map((k) => (
            <div key={k} className="flex flex-col gap-2">
              <span className="text-sm font-semibold">{k === "references" ? "Character reference images" : "Lifestyle photography"}</span>
              <div className="flex flex-wrap gap-2">
                {b.media[k].map((src) => (
                  <span key={src} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are */}
                    <img src={src} alt="" className="size-16 rounded-xl object-cover" />
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() =>
                        set(
                          "media",
                          k,
                          b.media[k].filter((x) => x !== src),
                        )
                      }
                      className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-surface shadow ring-1 ring-line"
                    >
                      <Icon name="close" className="size-3" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setPicking(k)}
                  className="grid size-16 place-items-center rounded-xl border border-dashed border-line-strong text-ink-muted"
                  aria-label="Add a picture"
                >
                  <Icon name="plus" className="size-5" />
                </button>
              </div>
            </div>
          ))}
          <Field
            label="Voice"
            hint="One voice for every episode and recording. A change needs approving, and old recordings keep the old voice until they’re made again."
          >
            <select
              className={input}
              value={b.media.voiceId}
              onChange={(e) => {
                const id = e.target.value;
                const name = voices.data?.voices.find((v) => v.voiceId === id)?.name ?? voices.data?.openai.find((v) => v.id === id)?.label ?? "";
                setDraft({ ...b, media: { ...b.media, voiceId: id, voiceName: name } });
              }}
            >
              <option value="">Not chosen yet</option>
              {b.media.voiceId &&
                !voices.data?.voices.some((v) => v.voiceId === b.media.voiceId) &&
                !voices.data?.openai.some((v) => v.id === b.media.voiceId) && <option value={b.media.voiceId}>{b.media.voiceName || b.media.voiceId}</option>}
              {(voices.data?.voices.length ?? 0) > 0 && (
                <optgroup label="ElevenLabs">
                  {voices.data!.voices.map((v) => (
                    <option key={v.voiceId} value={v.voiceId}>
                      {v.name}
                      {v.description && ` · ${v.description}`}
                    </option>
                  ))}
                </optgroup>
              )}
              {(voices.data?.openai.length ?? 0) > 0 && (
                <optgroup label="OpenAI">
                  {voices.data!.openai.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
          <Field label="Voice delivery" hint="Read by OpenAI voices as delivery notes; for ElevenLabs, a note for whoever chooses the voice.">
            <textarea className={textarea} value={b.media.delivery} onChange={(e) => set("media", "delivery", e.target.value)} />
          </Field>
          <Field label="Visual appearance guide" hint="For consistent pictures: face, hair, clothes, home, surroundings." className="sm:col-span-2">
            <textarea className={textarea} value={b.media.visualGuide} onChange={(e) => set("media", "visualGuide", e.target.value)} />
          </Field>
          {voices.data?.note && <p className="text-xs text-ink-muted sm:col-span-2">{voices.data.note}</p>}
        </div>
      </details>
      <div className="grid gap-4 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
        <Field label="Where these facts come from">
          <textarea className={textarea} value={b.sources} onChange={(e) => setDraft({ ...b, sources: e.target.value })} />
        </Field>
        <Field label="Still to reconcile" hint="For authors only: never given to the AI or shown to learners.">
          <textarea className={textarea} value={b.reconcile} onChange={(e) => setDraft({ ...b, reconcile: e.target.value })} />
        </Field>
      </div>

      <CastEditor
        memberId={memberId}
        cast={data.cast}
        reload={async () => setData(await api<BibleView>(`/api/admin/lives?bible=${encodeURIComponent(memberId)}`))}
      />

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h3 className="font-serif text-xl font-semibold">Approve</h3>
        {data.changes.length > 0 && (
          <div className="text-sm">
            <p className="font-semibold">What changes from the approved version</p>
            <ul className="mt-1 list-disc pl-5 text-ink-muted">
              {data.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        {data.version > 0 && (
          <Field label="Why it’s changing" hint="Needed for a change to an approved Bible: the character speaks differently to everyone from then on.">
            <input className={input} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </Field>
        )}
        {data.versions.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">Approved versions</summary>
            <ul className="mt-2 space-y-1 text-ink-muted">
              {data.versions.map((v) => (
                <li key={v.version}>
                  Version {v.version} · {v.by} · {new Date(v.at).toLocaleDateString("en-AU")}
                  {v.note && ` · ${v.note}`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {problem && <ErrorNote text={problem} />}
      {saved && (
        <p role="status" className="rounded-2xl bg-tealtint p-3 text-sm">
          {saved}
        </p>
      )}
      <div className="sticky bottom-4 flex flex-wrap items-center gap-2 self-start rounded-full bg-surface p-1.5 shadow-lg">
        <button
          type="button"
          className={btn.primary}
          disabled={busy || (!changed && data.saved)}
          onClick={() => void run({ action: "bible.save", memberId, bible: cleanBible(b) }, "Saved as a draft.")}
        >
          Save draft
        </button>
        <button
          type="button"
          className={btn.secondary}
          disabled={busy || changed || !data.saved}
          title={changed ? "Save first" : undefined}
          onClick={() => void run({ action: "bible.approve", memberId, note }, "Approved. The chat uses this version from the next message.")}
        >
          Approve this version
        </button>
      </div>
      <ImageLibraryDialog
        open={Boolean(picking)}
        onClose={() => setPicking(null)}
        onPick={(p) => {
          if (picking === "portrait") setDraft({ ...b, media: { ...b.media, portrait: p.src } });
          else if (picking) setDraft({ ...b, media: { ...b.media, [picking]: [...b.media[picking], p.src] } });
        }}
      />
    </section>
  );
}

const emptyCast = (): Omit<CastMember, "id" | "memberId"> & { id: string } => ({
  id: "",
  name: "",
  relation: "",
  characterId: "",
  personality: "",
  motivations: "",
  perspective: "",
  history: "",
});

function CastEditor({ memberId, cast, reload }: { memberId: string; cast: CastMember[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<ReturnType<typeof emptyCast> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async () => {
    if (!editing) return;
    try {
      await api("/api/admin/lives", { body: { action: "cast.save", memberId, cast: editing } });
      setEditing(null);
      setProblem(null);
      await reload();
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-serif text-xl font-semibold">Supporting cast</h3>
        <button type="button" className={btn.secondary} onClick={() => setEditing(emptyCast())}>
          <Icon name="plus" className="size-4" /> Add someone
        </button>
      </div>
      <p className="text-sm text-ink-muted">Family, friends, neighbours, workers and providers who turn up in their story. Each can appear in any arc.</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {cast.map((c) => (
          <li key={c.id} className="rounded-2xl border border-line p-3">
            <p className="font-semibold">
              {c.name} <span className="font-normal text-ink-muted">· {c.relation}</span>
            </p>
            {c.perspective && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{c.perspective}</p>}
            <div className="mt-2 flex gap-1">
              <button type="button" className={btn.quiet} onClick={() => setEditing({ ...emptyCast(), ...c })}>
                Edit
              </button>
              <button
                type="button"
                className={btn.quiet}
                onClick={() => void api("/api/admin/lives", { body: { action: "cast.archive", id: c.id } }).then(reload)}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <div className="grid gap-3 rounded-2xl bg-muted p-4 sm:grid-cols-2">
          <Field label="Name">
            <input className={input} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </Field>
          <Field label="Relationship to them" hint="daughter, neighbour, support worker…">
            <input className={input} value={editing.relation} onChange={(e) => setEditing({ ...editing, relation: e.target.value })} />
          </Field>
          {(
            [
              ["personality", "Personality"],
              ["motivations", "Motivations"],
              ["perspective", "Their perspective"],
              ["history", "Relevant history"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <textarea className={textarea} value={editing[k]} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} />
            </Field>
          ))}
          {problem && <ErrorNote text={problem} />}
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" className={btn.primary} onClick={() => void save()}>
              Save
            </button>
            <button type="button" className={btn.quiet} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Story Bank: the Life Event Bank and everyone's cast
// ---------------------------------------------------------------------------------------------

function BankTab({ admin, reload }: { admin: Admin; reload: () => void }) {
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<LifeEvent | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const shown = admin.events.filter(
    (e) =>
      e.archived === archived &&
      (cat === "all" || e.category === cat) &&
      (!q || `${e.title} ${e.summary} ${e.themes.join(" ")}`.toLowerCase().includes(q.toLowerCase())),
  );
  const save = async () => {
    try {
      await api("/api/admin/lives", { body: { action: "event.save", event: { ...editing, themes: editing?.themes ?? [] } } });
      setEditing(null);
      setProblem(null);
      reload();
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  const blank: LifeEvent = {
    id: "",
    title: "",
    category: "everyday",
    summary: "",
    suits: "",
    impact: "",
    themes: [],
    complications: "",
    cast: "",
    resolutions: "",
    sensitivity: "",
  };
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl font-semibold">Life Event Bank</h2>
            <p className="max-w-3xl text-sm text-ink-muted">
              Things that happen in a life, for any character: ordinary days and good news as well as the hard parts. Not a list of required scenarios. The AI
              Story Assistant suggests from here.
            </p>
          </div>
          <button type="button" className={btn.primary} onClick={() => setEditing(blank)}>
            <Icon name="plus" className="size-4" /> Add an event
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input className={cx(input, "max-w-xs")} placeholder="Search events" aria-label="Search events" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={cx(input, "max-w-xs")} aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="all">Every category</option>
            {Object.entries(LIFE_EVENT_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="size-4 accent-[var(--color-action)]" />{" "}
            Archived
          </label>
        </div>
        {editing && <EventForm e={editing} set={setEditing} onSave={() => void save()} onCancel={() => setEditing(null)} problem={problem} />}
        <p className="text-sm text-ink-muted">{shown.length} events</p>
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((e) => (
            <li key={e.id} className="flex flex-col rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{LIFE_EVENT_CATEGORIES[e.category]}</p>
              <p className="mt-1 font-semibold">{e.title}</p>
              <p className="mt-1 text-sm text-ink-muted">{e.summary}</p>
              {e.themes.length > 0 && <p className="mt-2 text-xs text-ink-muted">Themes: {e.themes.join(", ")}</p>}
              {e.sensitivity && <p className="mt-1 text-xs text-[#8a5a00] dark:text-[#f5d48a]">Sensitivity: {e.sensitivity}</p>}
              <div className="mt-auto flex gap-1 pt-2">
                <button type="button" className={btn.quiet} onClick={() => setEditing(e)}>
                  Edit
                </button>
                <button
                  type="button"
                  className={btn.quiet}
                  onClick={() => void api("/api/admin/lives", { body: { action: "event.archive", id: e.id, restore: e.archived } }).then(reload)}
                >
                  {e.archived ? "Restore" : "Archive"}
                </button>
                {e.sample && <Badge>Starter</Badge>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-2xl font-semibold">Supporting cast</h2>
        <p className="text-sm text-ink-muted">Everyone in the members’ stories. Edit them from the member’s Character Bible.</p>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {admin.cast.map((c) => (
            <li key={c.id} className="rounded-2xl border border-line bg-surface p-3 text-sm">
              <p className="font-semibold">
                {c.name} <span className="font-normal text-ink-muted">· {c.relation}</span>
              </p>
              <p className="text-ink-muted">{admin.members.find((m) => m.id === c.memberId)?.name}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function EventForm({
  e,
  set,
  onSave,
  onCancel,
  problem,
}: {
  e: LifeEvent;
  set: (e: LifeEvent) => void;
  onSave: () => void;
  onCancel: () => void;
  problem: string | null;
}) {
  const text = (k: keyof LifeEvent, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <textarea className={textarea} value={e[k] as string} onChange={(ev) => set({ ...e, [k]: ev.target.value })} />
    </Field>
  );
  return (
    <div className="grid gap-3 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
      <Field label="Title">
        <input className={input} value={e.title} onChange={(ev) => set({ ...e, title: ev.target.value })} />
      </Field>
      <Field label="Category">
        <select className={input} value={e.category} onChange={(ev) => set({ ...e, category: ev.target.value as LifeEventCategory })}>
          {Object.entries(LIFE_EVENT_CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      {text("summary", "What happens")}
      {text("suits", "Suitable character profiles")}
      {text("impact", "Possible emotional impact")}
      <Field label="Learning themes" hint="Separate with commas.">
        <input className={input} value={e.themes.join(", ")} onChange={(ev) => set({ ...e, themes: ev.target.value.split(",").map((s) => s.trim()) })} />
      </Field>
      {text("complications", "Possible complications")}
      {text("cast", "Supporting characters it might involve")}
      {text("resolutions", "Possible resolutions")}
      {text("sensitivity", "Content sensitivity")}
      {problem && <ErrorNote text={problem} />}
      <div className="flex gap-2 sm:col-span-2">
        <button type="button" className={btn.primary} onClick={onSave}>
          Save event
        </button>
        <button type="button" className={btn.quiet} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Conversational memory
// ---------------------------------------------------------------------------------------------

function MemoryTab({ admin, reload }: { admin: Admin; reload: () => void }) {
  const [s, setS] = useState<LivesSettings>(admin.settings);
  const [memberId, setMemberId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const brief = useApi<{ rules: string; context: string }>(
    memberId ? `/api/admin/member-chat?preview=${encodeURIComponent(memberId)}${episodeId ? `&episode=${encodeURIComponent(episodeId)}` : ""}` : null,
  );
  const episodes = admin.arcs.filter((a) => a.memberId === memberId).flatMap((a) => a.episodes.filter((e) => e.status !== "archived"));
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-serif text-xl font-semibold">How characters remember</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            <strong>Identity:</strong> the approved Character Bible. It changes only when an author approves a new version.
          </li>
          <li>
            <strong>Their story:</strong> published episodes only, up to the one the learner is looking at. Never an unpublished or later episode.
          </li>
          <li>
            <strong>Each learner:</strong> topics that came up and up to three of the learner’s own questions per chat, scrubbed of phone numbers, emails and
            long numbers. Never the transcript, never the AI’s replies, never a sentence about a real client. Private to that learner: authors see counts only.
          </li>
          <li>
            <strong>The episode being viewed:</strong> looking back at an earlier episode, the character knows only what had happened by then, and remembers
            only chats from that point or before.
          </li>
          <li>Learners can see what’s remembered, start a chat fresh, forget one chat or clear everything.</li>
        </ul>
        <dl className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-muted p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Memories kept</dt>
            <dd className="font-serif text-2xl font-semibold">{admin.memory.memories}</dd>
          </div>
          <div className="rounded-2xl bg-muted p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Learners with memories</dt>
            <dd className="font-serif text-2xl font-semibold">{admin.memory.learners}</dd>
          </div>
        </dl>
      </section>
      <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
        <h2 className="font-serif text-xl font-semibold sm:col-span-2">Settings</h2>
        <label className="flex items-center gap-3 font-semibold sm:col-span-2">
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-action)]"
            checked={s.memory}
            onChange={(e) => setS({ ...s, memory: e.target.checked })}
          />
          Characters remember each learner’s chats
        </label>
        <Field label="Keep memories for (days)" hint="7 to 730. Shortening it applies to what’s already kept.">
          <input
            type="number"
            min={7}
            max={730}
            className={input}
            value={s.retentionDays}
            onChange={(e) => setS({ ...s, retentionDays: Number(e.target.value) })}
          />
        </Field>
        <Field label="Memories given to the AI" hint="The newest, 1 to 20.">
          <input
            type="number"
            min={1}
            max={20}
            className={input}
            value={s.memoriesInBrief}
            onChange={(e) => setS({ ...s, memoriesInBrief: Number(e.target.value) })}
          />
        </Field>
        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-action)]"
            checked={s.notifyByDefault}
            onChange={(e) => setS({ ...s, notifyByDefault: e.target.checked })}
          />
          Following someone sends new episodes to the learner’s Inbox, unless they turn it off
        </label>
        <label className="flex items-start gap-3 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-action)]"
            checked={s.checkInVoice}
            onChange={(e) => setS({ ...s, checkInVoice: e.target.checked })}
          />
          <span>
            Check in: learners can hear a character’s replies spoken, in their approved voice.
            <span className="block text-xs text-ink-muted">
              Each reply is a live, paid speech request: about US$0.005 for a 300-character reply with OpenAI gpt-4o-mini-tts (price to verify), up to 30 an
              hour per learner. The same words are never paid for twice. Off by default.
            </span>
          </span>
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="button"
            className={btn.primary}
            onClick={() =>
              void api("/api/admin/lives", { body: { action: "settings.save", settings: s } }).then(() => {
                setNote("Saved.");
                reload();
              })
            }
          >
            Save settings
          </button>
          {note && <span role="status">{note}</span>}
        </div>
      </section>
      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-serif text-xl font-semibold">What the AI is told</h2>
        <p className="text-sm text-ink-muted">
          The full brief for a character at any episode. The earlier chats in it are your own, as no one else’s are ever shown.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <select className={input} aria-label="Character" value={memberId} onChange={(e) => (setMemberId(e.target.value), setEpisodeId(""))}>
            <option value="">Choose a character…</option>
            {admin.members
              .filter((m) => m.bible !== "none" || m.arcs)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
          <select className={input} aria-label="Episode" value={episodeId} onChange={(e) => setEpisodeId(e.target.value)} disabled={!memberId}>
            <option value="">The latest published episode</option>
            {episodes.map((e) => (
              <option key={e.id} value={e.id}>
                Episode {e.number}: {e.title} ({e.status.replace("_", " ")})
              </option>
            ))}
          </select>
        </div>
        {brief.data && (
          <pre className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-muted p-4 font-sans text-[0.85rem] leading-relaxed">{`${brief.data.rules}\n\n---\n\n${brief.data.context}`}</pre>
        )}
        {brief.error && <ErrorNote text={brief.error} />}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------

function ReportTab() {
  const [days, setDays] = useState(30);
  const { data, error } = useApi<Report>(`/api/admin/lives?report=1&days=${days}`);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  const n = (v: number | null) => (v === null ? "–" : String(Math.round(v * 10) / 10));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <select className={cx(input, "max-w-xs")} aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90, 365].map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
        <p className="text-sm text-ink-muted">{data.voluntaryNote}</p>
      </div>
      <MomentsReport days={days} />
      <CalendarReport days={days} />
      {data.members.map((m) => (
        <section key={m.id} className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5">
          <h2 className="font-serif text-2xl font-semibold">{m.name}</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {(
              [
                ["Story opens", m.opens, `${m.openers} people`],
                ["Episode views", m.episodeViews, `${m.viewers} people`],
                ["Audio starts", m.audioStarts, `${m.audioCompletes} finished`],
                ["Diaries read", m.transcripts, ""],
                ["Followers", m.followers, ""],
                ["Conversations", m.conversations, `${m.conversationPeople} people · ${m.storyChats} from a story`],
                ["Interactions", m.interactions, ""],
                ["Linked learning opened", m.resourceClicks, ""],
                ["Returning learners", m.returning, "on two or more days"],
                ["Days between visits", n(m.daysBetweenVisits), "median"],
              ] as const
            ).map(([k, v, sub]) => (
              <div key={k} className="rounded-2xl bg-muted p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{k}</dt>
                <dd className="font-serif text-2xl font-semibold">{v}</dd>
                {sub && <dd className="text-xs text-ink-muted">{sub}</dd>}
              </div>
            ))}
          </dl>
          {m.continuation.length > 0 && (
            <div>
              <h3 className="font-semibold">Story continuation</h3>
              <p className="text-xs text-ink-muted">Of the people who saw an episode, how many went on to the next one once it was out.</p>
              <ul className="mt-2 space-y-1 text-sm">
                {m.continuation.map((c) => (
                  <li key={c.number}>
                    Episode {c.number} → {c.number + 1}: {c.continued} of {c.viewers}
                    {c.viewers > 0 && ` (${Math.round((c.continued / c.viewers) * 100)}%)`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="text-sm">
            <h3 className="font-semibold">Arcs caught up</h3>
            <ul className="mt-1 space-y-1">
              {m.arcs.map((a) => (
                <li key={a.title}>
                  {a.title}: {a.caughtUp} {a.caughtUp === 1 ? "person has" : "people have"} seen all {a.out} episodes out so far
                </li>
              ))}
            </ul>
          </div>
          {m.decisions.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">What-if choices (counts, not scores)</summary>
              <ul className="mt-2 space-y-3">
                {m.decisions.map((d, i) => (
                  <li key={i}>
                    <p className="text-ink-muted">
                      Episode {d.episode}: {d.situation}
                    </p>
                    <ul className="mt-1 list-disc pl-5">
                      {d.options.map((o) => (
                        <li key={o.text}>
                          {o.text}: {o.chosen}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------------------------

function PreviewTab({ admin }: { admin: Admin }) {
  const storied = admin.members.filter((m) => admin.arcs.some((a) => a.memberId === m.id));
  const [memberId, setMemberId] = useState(storied[0]?.id ?? "");
  const episodes = admin.arcs.filter((a) => a.memberId === memberId).flatMap((a) => a.episodes.filter((e) => e.status !== "archived"));
  const [episodeId, setEpisodeId] = useState("");
  const [width, setWidth] = useState<"mobile" | "desktop">("mobile");
  const e = episodes.find((x) => x.id === episodeId) ?? null;
  const m = admin.members.find((x) => x.id === memberId);
  const src = `/community/digital/${encodeURIComponent(memberId)}?preview=1${episodeId ? `&episode=${encodeURIComponent(episodeId)}` : ""}`;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <select className={input} aria-label="Character" value={memberId} onChange={(ev) => (setMemberId(ev.target.value), setEpisodeId(""))}>
          {storied.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select className={input} aria-label="Episode" value={episodeId} onChange={(ev) => setEpisodeId(ev.target.value)}>
          <option value="">As learners see it now</option>
          {episodes.map((x) => (
            <option key={x.id} value={x.id}>
              Episode {x.number}: {x.title} ({x.status.replace("_", " ")})
            </option>
          ))}
        </select>
        <div className="flex gap-2" role="group" aria-label="Screen size">
          {(["mobile", "desktop"] as const).map((w) => (
            <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)} className={cx(btn.secondary, width === w && "bg-muted")}>
              {w === "mobile" ? "Phone" : "Desktop"}
            </button>
          ))}
        </div>
      </div>
      {m && e && (
        <div>
          <p className="mb-2 text-sm font-semibold">Homepage card</p>
          <div className="relative aspect-[4/5] w-[13rem] overflow-hidden rounded-3xl bg-[#102a43] text-white shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are */}
            <img src={m.portrait} alt="" className="absolute inset-0 size-full object-cover object-[50%_25%]" />
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#06223a] via-[#06223a]/75 to-transparent" />
            <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 font-mulish text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-[#006b6b]">
              Lives in Progress
            </span>
            <span className="absolute inset-x-0 bottom-0 p-3.5">
              <span className="block font-serif text-xl font-semibold">{m.name}</span>
              <span className="mt-1 line-clamp-3 block font-serif text-[0.82rem] italic">“{e.quote || e.title}”</span>
              <span className="mt-1.5 block text-[0.68rem] text-white/80">
                {e.hearable && e.audio ? `New voice message · ${Math.round(e.audio.seconds)} seconds` : `Episode ${String(e.number).padStart(2, "0")}`}
              </span>
            </span>
          </div>
        </div>
      )}
      <div>
        <p className="mb-2 text-sm font-semibold">
          The story, the timeline, the audio diary and the chat ·{" "}
          <a href={src} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            open in a new tab
          </a>
        </p>
        <iframe
          key={src}
          src={src}
          title="Preview of the story as a learner sees it"
          className={cx("rounded-3xl border border-line bg-bg", width === "mobile" ? "h-[52rem] w-[390px] max-w-full" : "h-[52rem] w-full")}
        />
        <p className="mt-2 text-xs text-ink-muted">
          In preview nothing is counted, and an episode that isn’t out is marked. A chat from the preview is a real chat with the AI and is remembered as yours.
        </p>
      </div>
    </div>
  );
}

/** "Meanwhile, in their lives…": the homepage row's numbers, by category. Counts only. */
function MomentsReport({ days }: { days: number }) {
  const { data } = useApi<ReturnType<typeof momentsReport>>(`/api/admin/lives/moments?report=1&days=${days}`);
  if (!data) return null;
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5">
      <h2 className="font-serif text-2xl font-semibold">Life Moments on the homepage</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {(
          [
            ["Cards seen", data.impressions],
            ["People", data.people],
            ["Opened a story", data.opens],
            ["Messages played", data.audioPlays],
            ["Played to the end", data.audioCompletes],
            ["Messages read", data.transcripts],
            ["Conversations started", data.chats],
            ["Came back another day", data.repeatVisitors],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-muted p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{k}</dt>
            <dd className="font-serif text-2xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {data.byCategory.length > 0 && (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">By category</caption>
          <thead>
            <tr className="text-ink-muted">
              <th className="py-1 font-semibold">Category</th>
              <th className="py-1 font-semibold">Seen</th>
              <th className="py-1 font-semibold">Opened</th>
              <th className="py-1 font-semibold">Played</th>
              <th className="py-1 font-semibold">Conversations</th>
            </tr>
          </thead>
          <tbody>
            {data.byCategory.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="py-1">{c.label}</td>
                <td className="py-1">{c.seen}</td>
                <td className="py-1">{c.opened}</td>
                <td className="py-1">{c.played}</td>
                <td className="py-1">{c.chats}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** The Living Calendar's numbers: visits, days explored, filters, events opened, people coming back. Counts only. */
function CalendarReport({ days }: { days: number }) {
  const { data } = useApi<ReturnType<typeof calendarReport>>(`/api/admin/lives/calendar?report=1&days=${days}`);
  if (!data) return null;
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
      <h2 className="font-serif text-2xl font-semibold">Living Calendar</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["Visits", data.visits],
            ["People", data.people],
            ["Days explored", data.daysExplored],
            ["Filters used", data.filters],
            ["Events opened", data.eventsOpened],
            ["Came back another day", data.repeatVisitors],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-muted p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{k}</dt>
            <dd className="font-serif text-2xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-ink-muted">Voice plays, conversations and follows from the calendar are counted with Life Moments above.</p>
    </section>
  );
}
