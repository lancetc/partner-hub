"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  ARC_MOVES,
  ARC_STATES,
  cleanArc,
  episodeDate,
  episodeProblems,
  EPISODE_MOVES,
  EPISODE_STATES,
  INTERACTION_KINDS,
  RESOURCE_KINDS,
  type Arc,
  type ArcState,
  type EpisodeState,
  type Interaction,
  type InteractionKind,
} from "@/lib/livesInProgress";
import { Badge, btn, ErrorNote, Field, input, statusTone } from "./ui";
import { ImageLibraryDialog } from "./ImagePicker";
import { Icon } from "../Icon";
import { FocusField, textarea, type Admin } from "./LivesAdmin";

/*
  Story Arcs and their episodes for Admin → Lives in Progress (server/livesAuthoring), and the AI Story Assistant
  (server/livesAssist). An arc is planned, reviewed and approved; each episode goes draft → in review → approved →
  scheduled → published, and can be archived. A change to an approved or scheduled episode sends it back to draft.
*/

type AdminArc = Admin["arcs"][number];
type AdminEpisode = AdminArc["episodes"][number];

const STATE_TONE = (s: string) => (s === "scheduled" ? "info" : s === "archived" ? "neutral" : statusTone(s));
const toLocal = (isoDate: string) => {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : "");
const verb: Record<string, string> = {
  draft: "Back to draft",
  in_review: "Send for review",
  approved: "Approve",
  scheduled: "Schedule",
  published: "Publish now",
  archived: "Archive",
};

async function act(body: Record<string, unknown>) {
  return api<Record<string, unknown>>("/api/admin/lives", { body });
}

// ---------------------------------------------------------------------------------------------
// Arcs
// ---------------------------------------------------------------------------------------------

export function ArcsTab({ admin, reload }: { admin: Admin; reload: () => void }) {
  const [view, setView] = useState<"list" | "timeline">("list");
  const [member, setMember] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ memberId: string; title: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const arcs = admin.arcs.filter((a) => member === "all" || a.memberId === member);
  const arc = admin.arcs.find((a) => a.id === open);
  if (arc) return <ArcEditor admin={admin} arc={arc} reload={reload} onBack={() => setOpen(null)} />;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <select className={cx(input, "max-w-xs")} aria-label="Character" value={member} onChange={(e) => setMember(e.target.value)}>
          <option value="all">Everyone</option>
          {admin.members
            .filter((m) => admin.arcs.some((a) => a.memberId === m.id))
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
        <div role="group" aria-label="View" className="flex gap-1">
          {(["list", "timeline"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cx(btn.secondary, view === v && "bg-muted")}>
              <Icon name={v === "list" ? "list" : "timeline"} className="size-4" /> {v === "list" ? "List" : "Timeline"}
            </button>
          ))}
        </div>
        <button type="button" className={cx(btn.primary, "ml-auto")} onClick={() => setCreating({ memberId: admin.members[0]?.id ?? "", title: "" })}>
          <Icon name="plus" className="size-4" /> New arc
        </button>
      </div>
      {creating && (
        <div className="grid gap-3 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Whose story">
            <select className={input} value={creating.memberId} onChange={(e) => setCreating({ ...creating, memberId: e.target.value })}>
              {admin.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Arc title">
            <input className={input} value={creating.title} onChange={(e) => setCreating({ ...creating, title: e.target.value })} />
          </Field>
          <button
            type="button"
            className={btn.primary}
            onClick={async () => {
              try {
                const r = await act({ action: "arc.save", arc: { memberId: creating.memberId, title: creating.title, plannedEpisodes: 6 } });
                setCreating(null);
                reload();
                setOpen(String(r.id));
              } catch (e) {
                setProblem((e as Error).message);
              }
            }}
          >
            Create
          </button>
          {problem && <ErrorNote text={problem} />}
        </div>
      )}
      {view === "list" ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {arcs.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setOpen(a.id)}
                className="flex w-full flex-col gap-2 rounded-3xl border border-line bg-surface p-5 text-left hover:border-[var(--color-action)]"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATE_TONE(a.status)}>{ARC_STATES[a.status]}</Badge>
                  {a.primary && <Badge tone="info">Primary storyline</Badge>}
                  {a.sample && <Badge>Demo</Badge>}
                  {a.issues.length > 0 && <Badge tone="warn">{a.issues.length} to check</Badge>}
                </span>
                <span className="font-serif text-xl font-semibold">{a.title}</span>
                <span className="text-sm text-ink-muted">
                  {a.memberName} · {a.episodes.length} of {a.plannedEpisodes} episodes · {a.schedule || "no schedule yet"}
                </span>
                <span className="flex flex-wrap gap-1">
                  {a.episodes.map((e) => (
                    <span key={e.id} title={`${e.number}. ${e.title}: ${EPISODE_STATES[e.status]}`} className={cx("h-2 w-6 rounded-full", dot(e.status))} />
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <TimelineView arcs={arcs} onOpen={setOpen} />
      )}
      {!arcs.length && <p className="text-ink-muted">No arcs yet.</p>}
    </div>
  );
}

const dot = (s: EpisodeState) =>
  s === "published"
    ? "bg-[#1f8a52]"
    : s === "scheduled"
      ? "bg-[#2f6fb0]"
      : s === "approved"
        ? "bg-[#7fd4d4]"
        : s === "in_review"
          ? "bg-[#fab53d]"
          : s === "archived"
            ? "bg-line"
            : "bg-line-strong";

/** Every episode on a calendar of weeks, an arc to a row: what's out, what's scheduled and what's still being written. */
function TimelineView({ arcs, onOpen }: { arcs: AdminArc[]; onOpen: (id: string) => void }) {
  const dated = arcs.flatMap((a) => a.episodes.filter((e) => e.publishAt).map((e) => Date.parse(e.publishAt)));
  if (!dated.length) return <p className="text-ink-muted">Nothing is dated yet.</p>;
  const week = 7 * 86_400_000;
  const start = Math.min(...dated) - week / 2;
  const weeks = Math.max(4, Math.ceil((Math.max(...dated) - start) / week) + 1);
  const now = Date.now();
  return (
    <div className="overflow-x-auto rounded-3xl border border-line bg-surface p-4">
      <div style={{ minWidth: `${12 + weeks * 4.5}rem` }}>
        <div className="grid text-xs text-ink-muted" style={{ gridTemplateColumns: `12rem repeat(${weeks}, minmax(4.5rem, 1fr))` }}>
          <span />
          {Array.from({ length: weeks }, (_, i) => (
            <span key={i} className={cx("border-l border-line px-1", now >= start + i * week && now < start + (i + 1) * week && "font-bold text-ink")}>
              {new Date(start + i * week + week / 2).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            </span>
          ))}
        </div>
        {arcs.map((a) => (
          <div key={a.id} className="mt-2 grid items-center" style={{ gridTemplateColumns: `12rem repeat(${weeks}, minmax(4.5rem, 1fr))` }}>
            <button type="button" onClick={() => onOpen(a.id)} className="truncate pr-2 text-left text-sm font-semibold hover:underline">
              {a.memberName}: {a.title}
            </button>
            {Array.from({ length: weeks }, (_, i) => {
              const here = a.episodes.filter(
                (e) => e.publishAt && Date.parse(e.publishAt) >= start + i * week && Date.parse(e.publishAt) < start + (i + 1) * week,
              );
              return (
                <span key={i} className="flex min-h-9 flex-col gap-0.5 border-l border-line px-1">
                  {here.map((e) => (
                    <span
                      key={e.id}
                      title={`${e.title}: ${EPISODE_STATES[e.status]}`}
                      className={cx("truncate rounded px-1 text-[0.7rem] font-semibold text-white", dot(e.status))}
                    >
                      {e.number}. {e.title}
                    </span>
                  ))}
                </span>
              );
            })}
          </div>
        ))}
        <p className="mt-3 flex flex-wrap gap-3 text-xs text-ink-muted">
          {(["published", "scheduled", "approved", "in_review", "draft"] as EpisodeState[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className={cx("size-3 rounded", dot(s))} /> {EPISODE_STATES[s]}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

function ArcEditor({ admin, arc, reload, onBack }: { admin: Admin; arc: AdminArc; reload: () => void; onBack: () => void }) {
  const [draft, setDraft] = useState<Arc | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const a = draft ?? cleanArc(arc);
  const changed = draft !== null && JSON.stringify(cleanArc(draft)) !== JSON.stringify(cleanArc(arc));
  const cast = admin.cast.filter((c) => c.memberId === arc.memberId);
  const run = async (body: Record<string, unknown>, done?: string) => {
    setProblem(null);
    setNote(null);
    try {
      const r = await act(body);
      reload();
      if (done) setNote(done);
      return r;
    } catch (e) {
      setProblem((e as Error).message);
      return null;
    }
  };
  const episode = arc.episodes.find((e) => e.id === episodeId);
  if (episode) return <EpisodeEditor admin={admin} arc={arc} e={episode} reload={reload} onBack={() => setEpisodeId(null)} />;
  const set = <K extends keyof Arc>(k: K, v: Arc[K]) => setDraft({ ...a, [k]: v });
  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={onBack} className={cx(btn.quiet, "self-start")}>
        <Icon name="arrow-left" className="size-4" /> All arcs
      </button>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif text-3xl font-semibold">{arc.title}</h2>
        <Badge tone={STATE_TONE(arc.status)}>{ARC_STATES[arc.status]}</Badge>
        {arc.sample && <Badge>Demo</Badge>}
      </div>
      <p className="text-sm text-ink-muted">
        {arc.memberName} · by {arc.authorName || "—"}
        {arc.approvedByName && ` · approved by ${arc.approvedByName}`}
      </p>
      {arc.issues.length > 0 && (
        <div className="rounded-2xl border border-[#fab53d] bg-[#fff8e8] p-4 text-sm dark:bg-[#2e2612]">
          <p className="font-semibold">Worth checking before approval</p>
          <ul className="mt-1 list-disc pl-5">
            {arc.issues.map((i, n) => (
              <li key={n}>{i.text}</li>
            ))}
          </ul>
        </div>
      )}
      <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
        <Field label="Arc title">
          <input className={input} value={a.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Central theme">
          <input className={input} value={a.theme} onChange={(e) => set("theme", e.target.value)} />
        </Field>
        <Field label="Narrative summary" className="sm:col-span-2">
          <textarea className={textarea} value={a.summary} onChange={(e) => set("summary", e.target.value)} />
        </Field>
        <Field label="Starting circumstances">
          <textarea className={textarea} value={a.starting} onChange={(e) => set("starting", e.target.value)} />
        </Field>
        <Field label="Planned resolution">
          <textarea className={textarea} value={a.resolution} onChange={(e) => set("resolution", e.target.value)} />
        </Field>
        <Field label="Intended learning opportunities" hint="One per line.">
          <textarea className={textarea} value={a.learning.join("\n")} onChange={(e) => set("learning", e.target.value.split("\n"))} />
        </Field>
        <Field label="Behaviour change it supports, where it applies">
          <textarea className={textarea} value={a.behaviour} onChange={(e) => set("behaviour", e.target.value)} />
        </Field>
        <Field label="Planned episodes" hint="Any length: three episodes to twelve weeks or more.">
          <input type="number" min={1} max={24} className={input} value={a.plannedEpisodes} onChange={(e) => set("plannedEpisodes", Number(e.target.value))} />
        </Field>
        <Field label="Publication schedule" hint="For people: “Wednesdays, 9 am”. Each episode has its own date.">
          <input className={input} value={a.schedule} onChange={(e) => set("schedule", e.target.value)} />
        </Field>
        <Field label="Start date">
          <input type="date" className={input} value={a.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="End date">
          <input type="date" className={input} value={a.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-semibold">Supporting characters</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {cast.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-action)]"
                  checked={a.cast.includes(c.id)}
                  onChange={(e) => set("cast", e.target.checked ? [...a.cast, c.id] : a.cast.filter((x) => x !== c.id))}
                />
                {c.name} ({c.relation})
              </label>
            ))}
            {!cast.length && <span className="text-sm text-ink-muted">Add supporting cast in the Character Bible.</span>}
          </div>
        </fieldset>
        <Field label="Life events it draws on" className="sm:col-span-2">
          <select
            multiple
            className={cx(input, "min-h-32 py-1")}
            value={a.events}
            onChange={(e) =>
              set(
                "events",
                [...e.target.selectedOptions].map((o) => o.value),
              )
            }
          >
            {admin.events
              .filter((x) => !x.archived)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="size-4 accent-[var(--color-action)]" checked={a.primary} onChange={(e) => set("primary", e.target.checked)} />
          This is {arc.memberName}’s active primary storyline
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button
            type="button"
            className={btn.primary}
            disabled={!changed}
            onClick={() => void run({ action: "arc.save", arc: a }, "Saved. An approved arc goes back to draft when it changes.").then(() => setDraft(null))}
          >
            Save arc
          </button>
          {ARC_MOVES[arc.status].map((s: ArcState) => (
            <button
              key={s}
              type="button"
              className={btn.secondary}
              disabled={changed}
              onClick={() => void run({ action: "arc.status", id: arc.id, status: s })}
            >
              {verb[s]}
            </button>
          ))}
          <button
            type="button"
            className={btn.quiet}
            onClick={() => void run({ action: "arc.duplicate", id: arc.id }, "Duplicated as a draft, with its episodes as drafts and no dates.")}
          >
            <Icon name="copy" className="size-4" /> Duplicate
          </button>
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-serif text-2xl font-semibold">Episodes</h3>
          <button
            type="button"
            className={btn.secondary}
            onClick={() => void run({ action: "episode.new", arcId: arc.id }).then((r) => r && setEpisodeId(String(r.id)))}
          >
            <Icon name="plus" className="size-4" /> New episode
          </button>
        </div>
        <ol className="flex flex-col gap-2">
          {arc.episodes.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3">
              <span className="font-mulish text-sm font-extrabold">{String(e.number).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{e.title}</span>
                <span className="block text-xs text-ink-muted">
                  {e.publishAt ? episodeDate(e.publishAt) : "No date yet"}
                  {e.audio ? (e.hearable ? " · Audio diary" : " · Recording waiting for a check") : " · No recording"}
                  {e.media.placeholder && " · Placeholder picture"}
                </span>
              </span>
              <Badge tone={STATE_TONE(e.status)}>{EPISODE_STATES[e.status]}</Badge>
              <button
                type="button"
                className={btn.quiet}
                aria-label={`Move episode ${e.number} up`}
                onClick={() => void run({ action: "episode.move", id: e.id, dir: "up" })}
              >
                <Icon name="arrow-up" className="size-4" />
              </button>
              <button
                type="button"
                className={btn.quiet}
                aria-label={`Move episode ${e.number} down`}
                onClick={() => void run({ action: "episode.move", id: e.id, dir: "down" })}
              >
                <Icon name="arrow-down" className="size-4" />
              </button>
              <button type="button" className={btn.secondary} onClick={() => setEpisodeId(e.id)}>
                Open
              </button>
            </li>
          ))}
        </ol>
      </section>
      {problem && <ErrorNote text={problem} />}
      {note && (
        <p role="status" className="rounded-2xl bg-tealtint p-3 text-sm">
          {note}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// One episode
// ---------------------------------------------------------------------------------------------

const newInteraction = (kind: InteractionKind, n: number): Interaction => ({
  id: `i${n}`,
  kind,
  label: INTERACTION_KINDS[kind].label,
  body: "",
  castId: "",
  options:
    kind === "decide"
      ? [
          { id: "o1", text: "", response: "" },
          { id: "o2", text: "", response: "" },
        ]
      : [],
  thought: "",
  href: "",
});

function EpisodeEditor({ admin, arc, e, reload, onBack }: { admin: Admin; arc: AdminArc; e: AdminEpisode; reload: () => void; onBack: () => void }) {
  const [d, setD] = useState<AdminEpisode>(e);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [picking, setPicking] = useState<"hero" | "thumb" | null>(null);
  const [estimate, setEstimate] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [listened, setListened] = useState(false);
  const cast = admin.cast.filter((c) => c.memberId === arc.memberId);
  const changed = JSON.stringify(d) !== JSON.stringify(e);
  const problems = episodeProblems(d);
  const set = <K extends keyof AdminEpisode>(k: K, v: AdminEpisode[K]) => setD({ ...d, [k]: v });
  const setI = (i: number, patch: Partial<Interaction>) =>
    set(
      "interactions",
      d.interactions.map((x, n) => (n === i ? { ...x, ...patch } : x)),
    );
  const run = async (body: Record<string, unknown>, done?: string) => {
    setProblem(null);
    setNote(null);
    try {
      const r = await act(body);
      reload();
      if (done) setNote(done);
      return r;
    } catch (err) {
      setProblem((err as Error).message);
      return null;
    }
  };
  const record = async (confirm: boolean) => {
    setProblem(null);
    setRecording(confirm);
    try {
      const r = await api<{ estimate: { text: string }; recorded: boolean }>("/api/admin/lives/audio", { body: { episodeId: e.id, confirm } });
      setEstimate(r.estimate.text);
      if (r.recorded) {
        setNote("Recorded. Listen to it, then tick that it matches before learners hear it.");
        setEstimate(null);
        reload();
      }
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setRecording(false);
    }
  };
  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={onBack} className={cx(btn.quiet, "self-start")}>
        <Icon name="arrow-left" className="size-4" /> {arc.title}
      </button>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif text-3xl font-semibold">
          Episode {String(e.number).padStart(2, "0")}: {e.title}
        </h2>
        <Badge tone={STATE_TONE(e.status)}>{EPISODE_STATES[e.status]}</Badge>
        {e.sample && <Badge>Demo</Badge>}
        <a href={`/community/digital/${arc.memberId}?preview=1&episode=${e.id}`} target="_blank" rel="noreferrer" className={btn.quiet}>
          <Icon name="eye" className="size-4" /> Preview
        </a>
      </div>
      {e.reviewNote && <p className="rounded-2xl bg-muted p-3 text-sm">Review note: {e.reviewNote}</p>}

      <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={d.title} onChange={(ev) => set("title", ev.target.value)} />
        </Field>
        <Field label="Goes out" hint="In your time zone. Learners see it from then, once it’s scheduled.">
          <input type="datetime-local" className={input} value={toLocal(d.publishAt)} onChange={(ev) => set("publishAt", fromLocal(ev.target.value))} />
        </Field>
        <Field label="Narrative summary (for authors)" className="sm:col-span-2">
          <textarea className={textarea} value={d.summary} onChange={(ev) => set("summary", ev.target.value)} />
        </Field>
        <Field label="Opening lines for learners" hint="What happened, as a documentary would open. No lesson." className="sm:col-span-2">
          <textarea className={textarea} value={d.story} onChange={(ev) => set("story", ev.target.value)} />
        </Field>
        <Field label="In their own words (first person)">
          <textarea className={textarea} value={d.dialogue} onChange={(ev) => set("dialogue", ev.target.value)} />
        </Field>
        <Field label="Homepage card quotation">
          <textarea className={textarea} value={d.quote} onChange={(ev) => set("quote", ev.target.value)} />
        </Field>
        <Field
          label="Audio diary script"
          hint={`${d.diary.split(/\s+/).filter(Boolean).length} words, about ${Math.round(d.diary.split(/\s+/).filter(Boolean).length / 2.5)} seconds.`}
          className="sm:col-span-2"
        >
          <textarea className={cx(textarea, "min-h-36")} value={d.diary} onChange={(ev) => set("diary", ev.target.value)} />
        </Field>
        <Field label="What they know or feel afterwards" hint="The character’s memory of this episode, for the chat. Approved with the episode.">
          <textarea className={textarea} value={d.knowledge} onChange={(ev) => set("knowledge", ev.target.value)} />
        </Field>
        <Field label="Approved consequences and outcomes">
          <textarea className={textarea} value={d.outcomes} onChange={(ev) => set("outcomes", ev.target.value)} />
        </Field>
        <Field label="Teaser for the next episode" hint="Shown once this one is out. Don’t give the next event away." className="sm:col-span-2">
          <input className={input} value={d.teaser} onChange={(ev) => set("teaser", ev.target.value)} />
        </Field>
      </section>

      <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
        <h3 className="font-serif text-xl font-semibold sm:col-span-2">Pictures</h3>
        {(["hero", "thumb"] as const).map((k) => (
          <div key={k} className="flex flex-col gap-2">
            <span className="text-sm font-semibold">{k === "hero" ? "Hero image" : "Thumbnail"}</span>
            {d.media[k] ? (
              // eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are
              <img src={d.media[k]} alt="" className="aspect-video w-full max-w-sm rounded-2xl object-cover" />
            ) : (
              <span className="text-sm text-ink-muted">{k === "hero" ? "None: their portrait is used." : "None: the hero is used."}</span>
            )}
            <button type="button" className={cx(btn.secondary, "self-start")} onClick={() => setPicking(k)}>
              Choose from the library
            </button>
          </div>
        ))}
        {d.media.hero && (
          <div className="sm:col-span-2">
            <FocusField
              label="What stays in view in the hero"
              src={d.media.hero}
              value={d.media.focus}
              onChange={(v) => set("media", { ...d.media, focus: v })}
            />
            <p className="mt-1 text-xs text-ink-muted">Without a hero image, the portrait is framed on the face set in the Character Bible.</p>
          </div>
        )}
        <Field label="Hero alt text">
          <input className={input} value={d.media.heroAlt} onChange={(ev) => set("media", { ...d.media, heroAlt: ev.target.value })} />
        </Field>
        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-action)]"
            checked={d.media.placeholder}
            onChange={(ev) => set("media", { ...d.media, placeholder: ev.target.checked })}
          />
          This is a placeholder picture, to be replaced
        </label>
        <Field
          label="What the real picture should show"
          hint="For whoever makes it. The AI Story Assistant can draft one from the Character Bible’s visual guide."
          className="sm:col-span-2"
        >
          <textarea className={textarea} value={d.media.prompt} onChange={(ev) => set("media", { ...d.media, prompt: ev.target.value })} />
        </Field>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h3 className="font-serif text-xl font-semibold">People in this episode</h3>
        <div className="flex flex-wrap gap-2">
          {cast.map((c) => (
            <label key={c.id} className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-action)]"
                checked={d.cast.includes(c.id)}
                onChange={(ev) => set("cast", ev.target.checked ? [...d.cast, c.id] : d.cast.filter((x) => x !== c.id))}
              />
              {c.name}
            </label>
          ))}
        </div>
        <h3 className="mt-2 font-serif text-xl font-semibold">Learning links</h3>
        <p className="text-sm text-ink-muted">Learners only see the ones they can open.</p>
        <ul className="flex flex-col gap-2">
          {d.resources.map((r, i) => (
            <li key={r.href} className="flex items-center gap-2 text-sm">
              <Badge>{RESOURCE_KINDS[r.kind]}</Badge> {r.title}
              <button
                type="button"
                className={btn.quiet}
                onClick={() =>
                  set(
                    "resources",
                    d.resources.filter((_, n) => n !== i),
                  )
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <select
          className={cx(input, "max-w-xl")}
          aria-label="Add a learning link"
          value=""
          onChange={(ev) => {
            const link = admin.links.find((l) => l.href === ev.target.value);
            if (link && !d.resources.some((r) => r.href === link.href)) set("resources", [...d.resources, link]);
          }}
        >
          <option value="">Add a Topic, Magazine course or Discovery Path…</option>
          {admin.links.map((l) => (
            <option key={l.href} value={l.href}>
              {RESOURCE_KINDS[l.kind]}: {l.title}
            </option>
          ))}
        </select>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h3 className="font-serif text-xl font-semibold">Spend a moment with them</h3>
        <p className="text-sm text-ink-muted">Optional. Some episodes simply let learners get to know them.</p>
        {d.interactions.map((x, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-2xl bg-muted p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{INTERACTION_KINDS[x.kind].label}</Badge>
              <input className={cx(input, "max-w-sm")} aria-label="Label" value={x.label} onChange={(ev) => setI(i, { label: ev.target.value })} />
              <button
                type="button"
                className={btn.quiet}
                onClick={() =>
                  set(
                    "interactions",
                    d.interactions.filter((_, n) => n !== i),
                  )
                }
              >
                Remove
              </button>
            </div>
            <p className="text-xs text-ink-muted">{INTERACTION_KINDS[x.kind].hint}</p>
            {x.kind === "perspective" && (
              <select className={cx(input, "max-w-sm")} aria-label="Who" value={x.castId} onChange={(ev) => setI(i, { castId: ev.target.value })}>
                <option value="">Who is speaking…</option>
                {cast.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.relation})
                  </option>
                ))}
              </select>
            )}
            {x.kind === "learn" ? (
              <select className={cx(input, "max-w-xl")} aria-label="Which link" value={x.href} onChange={(ev) => setI(i, { href: ev.target.value })}>
                <option value="">One of this episode’s learning links…</option>
                {d.resources.map((r) => (
                  <option key={r.href} value={r.href}>
                    {r.title}
                  </option>
                ))}
              </select>
            ) : null}
            <textarea
              className={textarea}
              aria-label="Words"
              placeholder={
                x.kind === "conversation"
                  ? "The opening question"
                  : x.kind === "decide"
                    ? "The situation"
                    : x.kind === "reflect"
                      ? "The question"
                      : x.kind === "perspective"
                        ? "Their words"
                        : "A line about it"
              }
              value={x.body}
              onChange={(ev) => setI(i, { body: ev.target.value })}
            />
            {x.kind === "reflect" && (
              <textarea
                className={textarea}
                aria-label="Their thoughts"
                placeholder="The person’s own thoughts on it"
                value={x.thought}
                onChange={(ev) => setI(i, { thought: ev.target.value })}
              />
            )}
            {x.kind === "decide" && (
              <div className="flex flex-col gap-2">
                {x.options.map((o, n) => (
                  <div key={n} className="grid gap-2 sm:grid-cols-2">
                    <input
                      className={input}
                      aria-label={`Response ${n + 1}`}
                      placeholder="A response the learner could choose"
                      value={o.text}
                      onChange={(ev) => setI(i, { options: x.options.map((p, m) => (m === n ? { ...p, text: ev.target.value } : p)) })}
                    />
                    <input
                      className={input}
                      aria-label={`Reaction ${n + 1}`}
                      placeholder="How they react, first person"
                      value={o.response}
                      onChange={(ev) => setI(i, { options: x.options.map((p, m) => (m === n ? { ...p, response: ev.target.value } : p)) })}
                    />
                  </div>
                ))}
                {x.options.length < 4 && (
                  <button
                    type="button"
                    className={cx(btn.quiet, "self-start")}
                    onClick={() => setI(i, { options: [...x.options, { id: `o${x.options.length + 1}`, text: "", response: "" }] })}
                  >
                    Add a response
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {d.interactions.length < 6 && (
          <div className="flex flex-wrap gap-2">
            {(Object.keys(INTERACTION_KINDS) as InteractionKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={btn.secondary}
                onClick={() => set("interactions", [...d.interactions, newInteraction(k, d.interactions.length + 1)])}
              >
                <Icon name="plus" className="size-4" /> {INTERACTION_KINDS[k].label}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h3 className="font-serif text-xl font-semibold">Audio diary</h3>
        {e.audio ? (
          <div className="flex flex-col gap-2">
            <audio controls src={e.audio.src} className="w-full max-w-md" />
            <p className="text-sm text-ink-muted">
              {Math.round(e.audio.seconds)} seconds · {e.audio.voiceName} ·{" "}
              {e.audio.checked ? "Checked: learners hear it" : "Not checked yet: learners see the words only"}
            </p>
            {!e.audio.checked && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-[var(--color-action)]" checked={listened} onChange={(ev) => setListened(ev.target.checked)} />
                  I’ve listened: it matches the script and sounds like {arc.memberName}
                </label>
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={!listened}
                  onClick={() => void run({ action: "audio.check", id: e.id, ok: true }, "Checked. Learners hear it now.")}
                >
                  Confirm
                </button>
              </div>
            )}
            <button type="button" className={cx(btn.quiet, "self-start")} onClick={() => void run({ action: "audio.remove", id: e.id }, "Recording removed.")}>
              Remove the recording
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No recording yet. Learners read the diary instead.</p>
        )}
        <p className="text-sm text-ink-muted">
          Recorded in {arc.memberName}’s approved voice from the approved script, once, and kept. It costs money, so you’ll see the estimate before anything is
          made.
        </p>
        {estimate ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#fff8e8] p-3 text-sm dark:bg-[#2e2612]">
            <span className="flex-1">{estimate}</span>
            <button type="button" className={btn.primary} disabled={recording} onClick={() => void record(true)}>
              {recording ? "Recording…" : "Record now"}
            </button>
            <button type="button" className={btn.quiet} onClick={() => setEstimate(null)}>
              Not now
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={cx(btn.secondary, "self-start")}
            disabled={changed || !["approved", "scheduled", "published"].includes(e.status)}
            onClick={() => void record(false)}
          >
            <Icon name="mic" className="size-4" /> {e.audio ? "Record again" : "Record the diary"}…
          </button>
        )}
      </section>

      {problems.length > 0 && (
        <div className="rounded-2xl bg-muted p-4 text-sm">
          <p className="font-semibold">Before it can go for review</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {e.status === "published" && changed && (
        <Field label="What you’re correcting, and why" hint="This episode is out: a correction is recorded with your reason.">
          <input className={input} value={reason} onChange={(ev) => setReason(ev.target.value)} />
        </Field>
      )}
      {problem && <ErrorNote text={problem} />}
      {note && (
        <p role="status" className="rounded-2xl bg-tealtint p-3 text-sm">
          {note}
        </p>
      )}
      <div className="sticky bottom-4 flex flex-wrap items-center gap-2 self-start rounded-3xl bg-surface p-1.5 shadow-lg">
        <button
          type="button"
          className={btn.primary}
          disabled={!changed}
          onClick={() =>
            void run(
              { action: "episode.save", episode: d, reason },
              ["approved", "scheduled", "in_review"].includes(e.status) ? "Saved. It’s back to draft, to be approved again." : "Saved.",
            )
          }
        >
          Save
        </button>
        {EPISODE_MOVES[e.status].map((s) => (
          <button
            key={s}
            type="button"
            className={s === "archived" ? btn.quiet : btn.secondary}
            disabled={changed}
            onClick={() => void run({ action: "episode.status", id: e.id, status: s }, `${EPISODE_STATES[s]}.`)}
          >
            {verb[s]}
          </button>
        ))}
        {e.status === "draft" && (
          <button type="button" className={btn.quiet} onClick={() => void run({ action: "episode.delete", id: e.id }).then((r) => r && onBack())}>
            Delete draft
          </button>
        )}
      </div>
      <ImageLibraryDialog
        open={Boolean(picking)}
        onClose={() => setPicking(null)}
        onPick={(p) => picking && set("media", { ...d.media, [picking]: p.src, ...(picking === "hero" && p.alt ? { heroAlt: p.alt } : {}) })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The AI Story Assistant
// ---------------------------------------------------------------------------------------------

type Proposal = {
  kind: string;
  proposal: Record<string, unknown>;
  removed: string[];
  leanedOn: { bible: boolean; cast: number; events: number; learning: number };
};

export function AssistantTab({ admin, reload }: { admin: Admin; reload: () => void }) {
  const [memberId, setMemberId] = useState(admin.arcs[0]?.memberId ?? admin.members[0]?.id ?? "");
  const [kind, setKind] = useState<"arc" | "episode" | "dialogue" | "image" | "review">("arc");
  const [arcId, setArcId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [brief, setBrief] = useState<Record<string, string>>({ episodes: "6" });
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Proposal | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const arcs = admin.arcs.filter((a) => a.memberId === memberId);
  const episodes = arcs.find((a) => a.id === arcId)?.episodes ?? [];
  const ask = async () => {
    setBusy(true);
    setProblem(null);
    setOut(null);
    setNote(null);
    try {
      setOut(await api<Proposal>("/api/admin/lives/assist", { body: { kind, memberId, arcId: arcId || undefined, episodeId: episodeId || undefined, brief } }));
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const takeArc = async () => {
    const p = out!.proposal as {
      title: string;
      summary: string;
      starting: string;
      theme: string;
      resolution: string;
      learning: string[];
      events: string[];
      episodes: { title: string; summary: string; story: string; quote: string; cast: string[] }[];
    };
    try {
      const r = await act({
        action: "arc.save",
        arc: {
          memberId,
          title: p.title,
          summary: p.summary,
          starting: p.starting,
          theme: p.theme,
          resolution: p.resolution,
          learning: p.learning,
          events: p.events,
          plannedEpisodes: p.episodes.length,
        },
      });
      for (const e of p.episodes) {
        const made = await act({ action: "episode.new", arcId: r.id, title: e.title });
        await act({ action: "episode.save", episode: { id: made.id, title: e.title, summary: e.summary, story: e.story, quote: e.quote, cast: e.cast } });
      }
      setNote("Saved as a draft arc with draft episodes. Nothing is scheduled: review it in Story Arcs.");
      reload();
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  const takeEpisode = async () => {
    const ep = episodes.find((x) => x.id === episodeId);
    if (!ep) return setProblem("Choose the episode to put it into.");
    const p = out!.proposal as Record<string, unknown>;
    const pick = (k: string) => (typeof p[k] === "string" && p[k] ? p[k] : (ep as unknown as Record<string, unknown>)[k]);
    const interactions =
      Array.isArray(p.interactions) && p.interactions.length
        ? (p.interactions as Interaction[]).map((x, i) => ({ ...x, id: `i${i + 1}`, options: (x.options ?? []).map((o, n) => ({ ...o, id: `o${n + 1}` })) }))
        : ep.interactions;
    try {
      await act({
        action: "episode.save",
        reason: ep.status === "published" ? "Took a suggestion from the AI Story Assistant" : "",
        episode: {
          ...ep,
          title: pick("title"),
          summary: pick("summary"),
          story: pick("story"),
          dialogue: pick("dialogue"),
          quote: pick("quote"),
          diary: pick("diary"),
          knowledge: pick("knowledge"),
          teaser: pick("teaser"),
          interactions,
          ...(kind === "image" && { media: { ...ep.media, prompt: p.prompt, heroAlt: ep.media.heroAlt || p.alt } }),
        },
      });
      setNote("Put into the episode as a draft. Review it before approval.");
      reload();
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <p className="text-sm text-ink-muted">
        The assistant proposes; you decide. It reads the approved Character Bible, the supporting cast, earlier arcs and published episodes, the Life Event Bank
        and the Hub’s published learning. Nothing is saved until you take it, and nothing is ever scheduled or published from here. Claude when it’s connected,
        otherwise the Hub’s OpenAI connection; forty suggestions an hour each.
      </p>
      <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
        <Field label="Character">
          <select className={input} value={memberId} onChange={(e) => (setMemberId(e.target.value), setArcId(""), setEpisodeId(""))}>
            {admin.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What would you like?">
          <select className={input} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="arc">Suggest a new arc</option>
            <option value="episode">Draft an episode</option>
            <option value="dialogue">First-person dialogue and a diary</option>
            <option value="image">An image prompt for an episode</option>
            <option value="review">Review an arc: consistency, authenticity, competencies, other perspectives, missed learning</option>
          </select>
        </Field>
        {kind !== "arc" && (
          <>
            <Field label="Arc">
              <select className={input} value={arcId} onChange={(e) => (setArcId(e.target.value), setEpisodeId(""))}>
                <option value="">Choose…</option>
                {arcs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </Field>
            {kind !== "review" && (
              <Field label="Episode">
                <select className={input} value={episodeId} onChange={(e) => setEpisodeId(e.target.value)}>
                  <option value="">{kind === "episode" ? "A new one" : "Choose…"}</option>
                  {episodes.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.number}. {x.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </>
        )}
        {kind === "arc" ? (
          (
            [
              ["theme", "Theme"],
              ["duration", "Duration", "e.g. six weeks"],
              ["objectives", "Learning objectives"],
              ["behaviour", "Desired behaviour change"],
              ["issue", "Operational issue it relates to"],
              ["cast", "Supporting characters"],
              ["tone", "Emotional tone"],
              ["episodes", "Number of episodes"],
            ] as const
          ).map(([k, label, hint]) => (
            <Field key={k} label={label} hint={hint}>
              <input className={input} value={brief[k] ?? ""} onChange={(e) => setBrief({ ...brief, [k]: e.target.value })} />
            </Field>
          ))
        ) : kind !== "review" && kind !== "image" ? (
          <Field label="Your note" className="sm:col-span-2">
            <textarea className={textarea} value={brief.note ?? ""} onChange={(e) => setBrief({ ...brief, note: e.target.value })} />
          </Field>
        ) : null}
        <div className="sm:col-span-2">
          <button
            type="button"
            className={btn.primary}
            disabled={busy || (kind !== "arc" && !arcId) || (kind === "image" && !episodeId)}
            onClick={() => void ask()}
          >
            <Icon name="spark" className="size-4" /> {busy ? "Thinking…" : "Ask the assistant"}
          </button>
        </div>
      </section>
      {problem && <ErrorNote text={problem} />}
      {note && (
        <p role="status" className="rounded-2xl bg-tealtint p-3 text-sm">
          {note}
        </p>
      )}
      {out && (
        <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
          <h3 className="font-serif text-xl font-semibold">The suggestion</h3>
          <p className="text-xs text-ink-muted">
            It leaned on {out.leanedOn.bible ? "the approved Bible" : "no approved Bible"}, {out.leanedOn.cast} cast, {out.leanedOn.events} life events and{" "}
            {out.leanedOn.learning} learning titles.
          </p>
          {out.removed.length > 0 && (
            <p className="rounded-2xl bg-[#fff8e8] p-3 text-sm dark:bg-[#2e2612]">Taken out because it isn’t real here: {out.removed.join(" ")}</p>
          )}
          <Proposed value={out.proposal} />
          <div className="flex flex-wrap gap-2">
            {kind === "arc" && (
              <button type="button" className={btn.primary} onClick={() => void takeArc()}>
                Save as a draft arc
              </button>
            )}
            {(kind === "episode" || kind === "dialogue" || kind === "image") && episodeId && (
              <button type="button" className={btn.primary} onClick={() => void takeEpisode()}>
                Put into the episode as a draft
              </button>
            )}
            <button type="button" className={btn.secondary} onClick={() => void ask()}>
              Try again
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/** A proposal, readably: strings as paragraphs, lists as lists, episodes as cards. */
function Proposed({ value }: { value: unknown }) {
  if (typeof value === "string") return value ? <p className="whitespace-pre-line">{value}</p> : null;
  if (Array.isArray(value))
    return (
      <ol className="list-decimal space-y-2 pl-5">
        {value.map((v, i) => (
          <li key={i}>
            <Proposed value={v} />
          </li>
        ))}
      </ol>
    );
  if (value && typeof value === "object")
    return (
      <dl className="space-y-2">
        {Object.entries(value as Record<string, unknown>)
          .filter(([, v]) => v !== "" && !(Array.isArray(v) && !v.length) && typeof v !== "number")
          .map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{k.replace(/([A-Z])/g, " $1")}</dt>
              <dd className="mt-0.5">
                <Proposed value={v} />
              </dd>
            </div>
          ))}
      </dl>
    );
  return null;
}
