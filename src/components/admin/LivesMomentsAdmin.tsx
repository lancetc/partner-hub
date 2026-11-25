"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { CATEGORY_ICONS, categoryOf, cleanMoment, momentProblems, momentWhen, type LifeMoment } from "@/lib/lifeMoments";
import { DEFAULT_FOCUS, EPISODE_MOVES, EPISODE_STATES, type EpisodeState, type LivesSettings } from "@/lib/livesInProgress";
import type { momentsAdmin } from "@/server/lifeMoments";
import type { FeedCard } from "@/server/lifeMoments";
import { Badge, btn, ErrorNote, Field, input, statusTone } from "./ui";
import { ImageLibraryDialog } from "./ImagePicker";
import { Icon, type IconName } from "../Icon";
import { LifeMomentCard } from "../community/LifeMoments";
import { FocusField, textarea } from "./LivesAdmin";
import { AdminMonth, RoutinesPanel, VarietySettings } from "./LivesCalendarAdmin";

/*
  Admin → Lives in Progress → Life Moments ("Meanwhile, in their lives…", server/lifeMoments). Moments by status,
  as a list or a calendar; one moment's editor with its homepage card beside it; the voice message recording; the
  AI Story Assistant for one moment or a proposed fortnight across several people; and the categories and cadence.
  Taking a proposal makes a draft: nothing is approved, scheduled or shared without an author.
*/

type Data = ReturnType<typeof momentsAdmin>;
type Row = Data["moments"][number];

const FILTERS = [
  ["all", "All"],
  ["draft", "Drafts"],
  ["in_review", "Awaiting approval"],
  ["scheduled", "Scheduled"],
  ["published", "Published"],
  ["archived", "Archived"],
] as const;
const verb: Record<string, string> = {
  draft: "Back to draft",
  in_review: "Send for approval",
  approved: "Approve",
  scheduled: "Schedule",
  published: "Share now",
  archived: "Archive",
};
const toLocal = (isoDate: string) => {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : "");
const tone = (s: string) => (s === "scheduled" ? "info" : s === "archived" ? "neutral" : statusTone(s));
const act = (body: Record<string, unknown>) => api<Record<string, unknown>>("/api/admin/lives/moments", { body });

export function MomentsTab() {
  const { data, error, reload } = useApi<Data>("/api/admin/lives/moments");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [member, setMember] = useState("all");
  const [category, setCategory] = useState("all");
  const [arc, setArc] = useState("all");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [panel, setPanel] = useState<"bulk" | "categories" | "routines" | null>(null);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  const editing = data.moments.find((m) => m.id === open);
  if (editing) return <MomentEditor data={data} m={editing} reload={reload} onBack={() => setOpen(null)} />;
  const shown = data.moments.filter(
    (m) =>
      (filter === "all" || m.status === filter) &&
      (member === "all" || m.memberId === member) &&
      (category === "all" || m.category === category) &&
      (arc === "all" || m.arcId === arc),
  );
  const featured = data.moments.filter((m) => m.featured && m.status !== "archived").sort((a, b) => a.sort - b.sort);
  const name = (id: string) => data.members.find((x) => x.id === id)?.name ?? id;
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-3xl text-sm text-ink-muted">
        Small moments from between episodes, in the “Meanwhile, in their lives…” row on the homepage. Each goes through approval like an episode. A moment that
        follows an episode can’t be shared before that episode is out. New episodes appear in the row by themselves.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Status" className="flex flex-wrap gap-1">
          {FILTERS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={cx(
                "min-h-10 rounded-full border px-3 text-sm font-semibold",
                filter === k ? "border-[var(--color-action)] bg-tealtint" : "border-line text-ink-muted",
              )}
            >
              {label} <span className="font-normal">({k === "all" ? data.moments.length : data.moments.filter((m) => m.status === k).length})</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className={cx(input, "max-w-[12rem]")} aria-label="Character" value={member} onChange={(e) => setMember(e.target.value)}>
          <option value="all">Everyone</option>
          {data.members
            .filter((x) => data.moments.some((m) => m.memberId === x.id))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
        <select className={cx(input, "max-w-[12rem]")} aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">Every category</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select className={cx(input, "max-w-[14rem]")} aria-label="Arc" value={arc} onChange={(e) => setArc(e.target.value)}>
          <option value="all">Any arc, or none</option>
          {data.arcs.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
        <div role="group" aria-label="View" className="flex gap-1">
          {(["list", "calendar"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cx(btn.secondary, view === v && "bg-muted")}>
              <Icon name={v === "list" ? "list" : "calendar"} className="size-4" /> {v === "list" ? "List" : "Calendar"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={btn.quiet} onClick={() => setPanel(panel === "categories" ? null : "categories")}>
            Categories and cadence
          </button>
          <button type="button" className={btn.secondary} onClick={() => setPanel(panel === "bulk" ? null : "bulk")}>
            <Icon name="spark" className="size-4" /> Propose a fortnight or a month
          </button>
          <button type="button" className={btn.quiet} onClick={() => setPanel(panel === "routines" ? null : "routines")}>
            Routines
          </button>
          <NewMoment data={data} onMade={(id) => (reload(), setOpen(id))} onProblem={setProblem} />
        </div>
      </div>
      {problem && <ErrorNote text={problem} />}
      {panel === "bulk" && <BulkPanel data={data} onDone={() => (setPanel(null), reload())} />}
      {panel === "categories" && <CategoriesPanel settings={data.settings} onDone={reload} />}
      {panel === "categories" && <VarietySettings settings={data.settings} onDone={reload} />}
      {panel === "routines" && <RoutinesPanel members={data.members} categories={data.categories} />}
      {featured.length > 0 && view === "list" && (
        <section className="rounded-3xl border border-line bg-surface p-4">
          <h3 className="font-semibold">Featured, in order</h3>
          <p className="text-xs text-ink-muted">Featured moments come first in everyone’s row, in this order, while they’re out.</p>
          <ol className="mt-2 flex flex-col gap-1">
            {featured.map((m, i) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-ink-muted">{i + 1}.</span>
                <span className="flex-1 truncate">
                  {name(m.memberId)}: {m.headline}
                </span>
                <button
                  type="button"
                  aria-label="Move up"
                  className={btn.quiet}
                  onClick={() => void act({ action: "moment.move", id: m.id, dir: "up" }).then(reload)}
                >
                  <Icon name="arrow-up" className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  className={btn.quiet}
                  onClick={() => void act({ action: "moment.move", id: m.id, dir: "down" }).then(reload)}
                >
                  <Icon name="arrow-down" className="size-4" />
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      {view === "list" ? (
        <ul className="flex flex-col gap-2">
          {shown.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setOpen(m.id)}
                className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left hover:border-[var(--color-action)]"
              >
                <Icon name={categoryOf(m.category, data.settings).icon as IconName} className="size-5 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{m.headline || "Untitled moment"}</span>
                  <span className="block text-xs text-ink-muted">
                    {name(m.memberId)} · {categoryOf(m.category, data.settings).label} ·{" "}
                    {m.publishAt
                      ? new Date(m.publishAt).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
                      : "No date"}
                    {m.episodeId && " · follows an episode"}
                    {m.category === "voice" && (m.audio ? (m.hearable ? " · recorded" : " · recording to check") : " · not recorded")}
                  </span>
                </span>
                {m.featured && <Badge tone="info">Featured</Badge>}
                {m.sample && <Badge>Demo</Badge>}
                <Badge tone={tone(m.status)}>{EPISODE_STATES[m.status]}</Badge>
              </button>
            </li>
          ))}
          {!shown.length && <li className="text-ink-muted">Nothing here.</li>}
        </ul>
      ) : (
        <AdminMonth members={data.members} onOpen={setOpen} onChanged={reload} />
      )}
    </div>
  );
}

function NewMoment({ data, onMade, onProblem }: { data: Data; onMade: (id: string) => void; onProblem: (p: string) => void }) {
  const [memberId, setMemberId] = useState("");
  return (
    <span className="flex gap-1">
      <select className={cx(input, "max-w-[11rem]")} aria-label="New moment for" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
        <option value="">New moment for…</option>
        {data.members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={btn.primary}
        disabled={!memberId}
        onClick={() =>
          void act({ action: "moment.new", memberId }).then(
            (r) => onMade(String(r.id)),
            (e: Error) => onProblem(e.message),
          )
        }
      >
        <Icon name="plus" className="size-4" /> Create
      </button>
    </span>
  );
}

/** The assistant's proposed fortnight across the people chosen, ticked into drafts. */
function BulkPanel({ data, onDone }: { data: Data; onDone: () => void }) {
  const storied = data.members.filter((m) => data.arcs.some((a) => a.memberId === m.id));
  const [ids, setIds] = useState<string[]>(storied.map((m) => m.id));
  const [weeks, setWeeks] = useState(2);
  // "Generate a month" (the Living Calendar): a whole month, with a number of voice messages.
  const [month, setMonth] = useState("");
  const [voices, setVoices] = useState(2);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [out, setOut] = useState<{ proposals: (Partial<LifeMoment> & { publishAt: string; name?: string; memberId: string })[]; removed: string[] } | null>(
    null,
  );
  const [take, setTake] = useState<Set<number>>(new Set());
  const ask = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await api<{ proposal: { moments: (Partial<LifeMoment> & { publishAt: string; name?: string; memberId: string })[] }; removed: string[] }>(
        "/api/admin/lives/assist",
        {
          body: { kind: "moments", memberIds: ids, brief: month ? { month, voices } : { weeks, voices } },
        },
      );
      setOut({ proposals: r.proposal.moments, removed: r.removed });
      setTake(new Set(r.proposal.moments.map((_, i) => i)));
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
      <h3 className="font-serif text-xl font-semibold">Propose moments: a fortnight, or a month</h3>
      <p className="text-sm text-ink-muted">
        The Hub, not the assistant, chooses each day and time, the same way every time: uneven days and quiet ones, nobody on two days running (unless
        Categories and cadence allows it), birthdays in the morning, reflections in the evening and story developments on weekdays.
      </p>
      <p className="text-sm text-ink-muted">
        The assistant reads each person’s approved Bible, what’s been published and the Life Event Bank, and proposes moments at about{" "}
        {data.settings.momentsPerDay} a day across everyone. It doesn’t know what happens in episodes still to come. Tick the ones you want: they become drafts
        to edit and approve.
      </p>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Who</legend>
        {storied.map((m) => (
          <label key={m.id} className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-action)]"
              checked={ids.includes(m.id)}
              onChange={(e) => setIds(e.target.checked ? [...ids, m.id] : ids.filter((x) => x !== m.id))}
            />
            {m.name}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Weeks from tomorrow">
          <input
            type="number"
            min={1}
            max={4}
            className={cx(input, "w-24")}
            value={weeks}
            disabled={Boolean(month)}
            onChange={(e) => setWeeks(Number(e.target.value))}
          />
        </Field>
        <Field label="Or a whole month">
          <input type="month" className={cx(input, "w-44")} value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <Field label="Voice messages">
          <input type="number" min={0} max={10} className={cx(input, "w-24")} value={voices} onChange={(e) => setVoices(Number(e.target.value))} />
        </Field>
        <button type="button" className={btn.primary} disabled={busy || !ids.length} onClick={() => void ask()}>
          <Icon name="spark" className="size-4" /> {busy ? "Thinking…" : "Propose"}
        </button>
      </div>
      {problem && <ErrorNote text={problem} />}
      {out && (
        <>
          {out.removed.length > 0 && <p className="text-sm text-ink-muted">Taken out: {out.removed.join(" ")}</p>}
          <ul className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto">
            {out.proposals.map((p, i) => (
              <li key={i}>
                <label className="flex items-start gap-3 rounded-2xl border border-line p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-[var(--color-action)]"
                    checked={take.has(i)}
                    onChange={(e) => {
                      const next = new Set(take);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      setTake(next);
                    }}
                  />
                  <span>
                    <span className="block text-xs text-ink-muted">
                      {new Date(p.publishAt).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric" })} · {p.name} ·{" "}
                      {categoryOf(p.category ?? "everyday", data.settings).label}
                    </span>
                    <span className="block font-semibold">{p.headline}</span>
                    {(p.quote || p.body) && <span className="block text-ink-muted">{p.quote ? `“${p.quote}”` : p.body}</span>}
                    {p.audioScript && <span className="block italic text-ink-muted">Voice: {p.audioScript}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={cx(btn.primary, "self-start")}
            disabled={!take.size}
            onClick={() =>
              void act({ action: "moment.bulk", items: out.proposals.filter((_, i) => take.has(i)) }).then(onDone, (e: Error) => setProblem(e.message))
            }
          >
            Save {take.size} as drafts
          </button>
        </>
      )}
    </section>
  );
}

function CategoriesPanel({ settings, onDone }: { settings: LivesSettings; onDone: () => void }) {
  const [s, setS] = useState(settings);
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState<string>("spark");
  const [note, setNote] = useState<string | null>(null);
  const save = (next: LivesSettings) =>
    api("/api/admin/lives", {
      body: { action: "settings.save", settings: { momentsPerDay: next.momentsPerDay, momentCategories: next.momentCategories } },
    }).then(() => {
      setS(next);
      setNote("Saved.");
      onDone();
    });
  return (
    <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-xl font-semibold">Cadence</h3>
        <Field label="About how many moments a day, across everyone" hint="For the assistant’s proposals. One to five; not everyone needs something every day.">
          <input
            type="number"
            min={1}
            max={5}
            className={cx(input, "w-24")}
            value={s.momentsPerDay}
            onChange={(e) => setS({ ...s, momentsPerDay: Number(e.target.value) })}
          />
        </Field>
        <button type="button" className={cx(btn.secondary, "self-start")} onClick={() => void save(s)}>
          Save cadence
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-xl font-semibold">Your own categories</h3>
        <p className="text-xs text-ink-muted">The twelve built-in ones stay. Yours look like Everyday life, with their own label and icon.</p>
        <ul className="flex flex-wrap gap-2">
          {s.momentCategories.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm">
              <Icon name={c.icon as IconName} className="size-4" /> {c.label}
              <button
                type="button"
                aria-label={`Remove ${c.label}`}
                onClick={() => void save({ ...s, momentCategories: s.momentCategories.filter((x) => x.id !== c.id) })}
                className="ml-1 text-ink-muted hover:text-ink"
              >
                <Icon name="close" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <input
            className={cx(input, "max-w-[12rem]")}
            aria-label="Category name"
            placeholder="e.g. Grandkids"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <select className={cx(input, "max-w-[9rem]")} aria-label="Icon" value={icon} onChange={(e) => setIcon(e.target.value)}>
            {CATEGORY_ICONS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={btn.secondary}
            disabled={!label.trim()}
            onClick={() =>
              void save({ ...s, momentCategories: [...s.momentCategories, { id: "", label: label.trim(), icon, like: "everyday" }] }).then(() => setLabel(""))
            }
          >
            Add
          </button>
        </div>
      </div>
      {note && (
        <p role="status" className="text-sm sm:col-span-2">
          {note}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// One moment
// ---------------------------------------------------------------------------------------------

function MomentEditor({ data, m, reload, onBack }: { data: Data; m: Row; reload: () => void; onBack: () => void }) {
  const [d, setD] = useState<Row>(m);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [estimate, setEstimate] = useState<string | null>(null);
  const [listened, setListened] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [busy, setBusy] = useState(false);
  // The time the editor opened, for the card preview’s "Goes out …" or "Yesterday".
  const [openedAt] = useState(() => Date.now());
  const who = data.members.find((x) => x.id === m.memberId);
  const arcs = data.arcs.filter((a) => a.memberId === m.memberId);
  const episodes = arcs.find((a) => a.id === d.arcId)?.episodes ?? [];
  const changed = JSON.stringify(d) !== JSON.stringify(m);
  const set = <K extends keyof Row>(k: K, v: Row[K]) => setD({ ...d, [k]: v });
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
  const record = async (confirm: boolean) => {
    setProblem(null);
    setBusy(true);
    try {
      const r = await api<{ estimate: { text: string }; recorded: boolean }>("/api/admin/lives/moments/audio", { body: { momentId: m.id, confirm } });
      setEstimate(r.recorded ? null : r.estimate.text);
      if (r.recorded) {
        setNote("Recorded. Listen to it, then tick that it matches before learners hear it.");
        reload();
      }
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const suggest = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await api<{ proposal: Partial<LifeMoment> }>("/api/admin/lives/assist", {
        body: { kind: "moment", memberId: m.memberId, arcId: d.arcId || undefined, brief: { category: d.category, lifeEventId: d.lifeEventId, note: aiNote } },
      });
      const p = r.proposal;
      setD({
        ...d,
        headline: p.headline || d.headline,
        body: p.body ?? d.body,
        quote: p.quote || d.quote,
        audioScript: p.audioScript || d.audioScript,
        imagePrompt: p.imagePrompt || d.imagePrompt,
        actionLabel: p.actionLabel || d.actionLabel,
        continuity: p.continuity || d.continuity,
      });
      setNote("The suggestion is in the form. Nothing is saved until you save it.");
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const cat = categoryOf(d.category, data.settings);
  const first = who ? (/^(mr|mrs|ms)\b/i.test(who.name) ? who.name : who.name.split(" ")[0]) : "";
  const preview: FeedCard = {
    id: d.id,
    kind: "moment",
    memberId: d.memberId,
    name: who?.name ?? "",
    first,
    possessive: /^mr\b/i.test(who?.name ?? "") ? "his" : "her",
    portrait: who?.portrait ?? "",
    category: cat.id,
    categoryLabel: cat.label,
    icon: cat.icon,
    // As learners will see it: from the real time it goes out, or "Goes out …" while that's still to come.
    when:
      d.publishAt && Date.parse(d.publishAt) > openedAt && !(d.eventAt && Date.parse(d.eventAt) > openedAt)
        ? `Goes out ${new Date(d.publishAt).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}`
        : momentWhen(d.publishAt, d.eventAt, new Date(openedAt), Intl.DateTimeFormat().resolvedOptions().timeZone),
    publishedAt: d.publishAt,
    upcoming: Boolean(d.eventAt),
    headline: d.headline || "A headline",
    body: d.body,
    quote: d.quote,
    transcript: d.audioScript,
    audio: d.audio?.checked ? { src: d.audio.src, seconds: d.audio.seconds, scriptHash: d.audio.scriptHash, voice: d.audio.voiceName, at: d.audio.at } : null,
    image:
      d.image && !d.placeholder
        ? { src: d.image, alt: d.imageAlt, focus: d.focus || DEFAULT_FOCUS }
        : { src: who?.portrait ?? "", alt: "", focus: who?.focus ?? DEFAULT_FOCUS },
    action: d.action,
    actionLabel: d.actionLabel || (d.action === "chat" ? `Have a conversation with ${first}` : `Catch up with ${first}`),
    opener: d.opener,
    episodeId: d.episodeId,
    unread: true,
    relationship: null,
    featured: d.featured,
  };
  const problems = momentProblems(d, d.publishAt);
  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={onBack} className={cx(btn.quiet, "self-start")}>
        <Icon name="arrow-left" className="size-4" /> All moments
      </button>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif text-3xl font-semibold">{m.headline || "New moment"}</h2>
        <Badge tone={tone(m.status)}>{EPISODE_STATES[m.status]}</Badge>
        {m.sample && <Badge>Demo</Badge>}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-5">
          <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
            <Field label="Category">
              <select className={input} value={d.category} onChange={(e) => set("category", e.target.value)}>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From the Life Event Bank">
              <select className={input} value={d.lifeEventId} onChange={(e) => set("lifeEventId", e.target.value)}>
                <option value="">None</option>
                {data.events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Headline" className="sm:col-span-2">
              <input className={input} value={d.headline} onChange={(e) => set("headline", e.target.value)} />
            </Field>
            <Field label="What happened (third person)">
              <textarea className={textarea} value={d.body} onChange={(e) => set("body", e.target.value)} />
            </Field>
            <Field label="In their own words">
              <textarea className={textarea} value={d.quote} onChange={(e) => set("quote", e.target.value)} />
            </Field>
            <Field
              label="Voice message script"
              hint={`For a Voice message card. ${d.audioScript.split(/\s+/).filter(Boolean).length} words, about ${Math.round(d.audioScript.split(/\s+/).filter(Boolean).length / 2.5)} seconds.`}
              className="sm:col-span-2"
            >
              <textarea className={textarea} value={d.audioScript} onChange={(e) => set("audioScript", e.target.value)} />
            </Field>
          </section>

          <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
            <h3 className="font-serif text-xl font-semibold sm:col-span-2">When, and where it leads</h3>
            <Field label="Shared at" hint="Learners see it from then. The card says how long ago, from this time.">
              <input type="datetime-local" className={input} value={toLocal(d.publishAt)} onChange={(e) => set("publishAt", fromLocal(e.target.value))} />
            </Field>
            <Field label="When it happens, if later" hint="For an upcoming event: the card says “Coming up on Friday”.">
              <input type="datetime-local" className={input} value={toLocal(d.eventAt)} onChange={(e) => set("eventAt", fromLocal(e.target.value))} />
            </Field>
            <Field label="Leaves the row at" hint="Empty: it stays until it drifts down.">
              <input type="datetime-local" className={input} value={toLocal(d.expiresAt)} onChange={(e) => set("expiresAt", fromLocal(e.target.value))} />
            </Field>
            <Field label="Priority" hint="0 to 10: higher comes sooner.">
              <input type="number" min={0} max={10} className={input} value={d.priority} onChange={(e) => set("priority", Number(e.target.value))} />
            </Field>
            <Field label="Story arc">
              <select className={input} value={d.arcId} onChange={(e) => setD({ ...d, arcId: e.target.value, episodeId: "" })}>
                <option value="">An everyday moment (no arc)</option>
                {arcs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Follows episode" hint="It can’t be shared before this episode is out.">
              <select className={input} value={d.episodeId} disabled={!d.arcId} onChange={(e) => set("episodeId", e.target.value)}>
                <option value="">None</option>
                {episodes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.number}. {e.title} ({EPISODE_STATES[e.status as EpisodeState]}
                    {e.publishAt ? `, ${new Date(e.publishAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : ""})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="The card’s button">
              <select className={input} value={d.action} onChange={(e) => set("action", e.target.value as LifeMoment["action"])}>
                <option value="story">Opens their story</option>
                <option value="chat">Starts a conversation</option>
              </select>
            </Field>
            <Field label="Button words" hint="Empty: chosen from the category.">
              <input className={input} value={d.actionLabel} onChange={(e) => set("actionLabel", e.target.value)} />
            </Field>
            {d.action === "chat" && (
              <Field label="The learner’s first line" className="sm:col-span-2">
                <input className={input} value={d.opener} onChange={(e) => set("opener", e.target.value)} />
              </Field>
            )}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="size-4 accent-[var(--color-action)]" checked={d.featured} onChange={(e) => set("featured", e.target.checked)} />
              Featured: first in everyone’s row while it’s out
            </label>
          </section>

          <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
            <h3 className="font-serif text-xl font-semibold sm:col-span-2">Picture</h3>
            <div className="flex flex-col gap-2">
              <span className="text-sm text-ink-muted">{d.image ? "Its own picture" : "None: their portrait, framed on their face."}</span>
              <button type="button" className={cx(btn.secondary, "self-start")} onClick={() => setPicking(true)}>
                Choose from the library
              </button>
              {d.image && (
                <button type="button" className={cx(btn.quiet, "self-start")} onClick={() => setD({ ...d, image: "", imageAlt: "", focus: "" })}>
                  Use their portrait
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 self-start text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-action)]"
                checked={d.placeholder}
                onChange={(e) => set("placeholder", e.target.checked)}
              />
              A placeholder: learners see their portrait until it’s replaced
            </label>
            {d.image && (
              <div className="sm:col-span-2">
                <FocusField label="What stays in view" src={d.image} value={d.focus} onChange={(v) => set("focus", v)} />
              </div>
            )}
            <Field label="Alt text">
              <input className={input} value={d.imageAlt} onChange={(e) => set("imageAlt", e.target.value)} />
            </Field>
            <Field label="What the real picture should show">
              <textarea className={textarea} value={d.imagePrompt} onChange={(e) => set("imagePrompt", e.target.value)} />
            </Field>
            <Field label="What it rests on (for continuity)" hint="Bible facts, an episode, a cast member." className="sm:col-span-2">
              <textarea className={textarea} value={d.continuity} onChange={(e) => set("continuity", e.target.value)} />
            </Field>
          </section>

          <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
            <h3 className="font-serif text-xl font-semibold">AI Story Assistant</h3>
            <p className="text-sm text-ink-muted">
              Suggests the words for this moment from the Bible and what’s published. It fills the form; nothing is saved.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                className={cx(input, "max-w-md")}
                aria-label="Your note"
                placeholder="Your note, e.g. a quiet Sunday"
                value={aiNote}
                onChange={(e) => setAiNote(e.target.value)}
              />
              <button type="button" className={btn.secondary} disabled={busy} onClick={() => void suggest()}>
                <Icon name="spark" className="size-4" /> Suggest
              </button>
            </div>
          </section>

          {d.category === "voice" && (
            <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
              <h3 className="font-serif text-xl font-semibold">Voice message</h3>
              {m.audio ? (
                <div className="flex flex-col gap-2">
                  <audio controls src={m.audio.src} className="w-full max-w-md" />
                  <p className="text-sm text-ink-muted">
                    {Math.round(m.audio.seconds)} seconds · {m.audio.voiceName} ·{" "}
                    {m.hearable ? "Checked: learners hear it" : "Learners read the words until it’s checked"}
                  </p>
                  {!m.audio.checked && (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--color-action)]"
                          checked={listened}
                          onChange={(e) => setListened(e.target.checked)}
                        />
                        I’ve listened: it matches the script and sounds like {who?.name}
                      </label>
                      <button
                        type="button"
                        className={btn.secondary}
                        disabled={!listened}
                        onClick={() => void run({ action: "moment.audio.check", id: m.id, ok: true }, "Checked.")}
                      >
                        Confirm
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    className={cx(btn.quiet, "self-start")}
                    onClick={() => void run({ action: "moment.audio.remove", id: m.id }, "Recording removed.")}
                  >
                    Remove the recording
                  </button>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Not recorded. Learners read the message instead.</p>
              )}
              {estimate ? (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#fff8e8] p-3 text-sm dark:bg-[#2e2612]">
                  <span className="flex-1">{estimate}</span>
                  <button type="button" className={btn.primary} disabled={busy} onClick={() => void record(true)}>
                    {busy ? "Recording…" : "Record now"}
                  </button>
                  <button type="button" className={btn.quiet} onClick={() => setEstimate(null)}>
                    Not now
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={cx(btn.secondary, "self-start")}
                  disabled={busy || changed || !["approved", "scheduled", "published"].includes(m.status)}
                  onClick={() => void record(false)}
                >
                  <Icon name="mic" className="size-4" /> {m.audio ? "Record again" : "Record the message"}…
                </button>
              )}
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          <p className="text-sm font-semibold">The homepage card</p>
          <div className="w-full max-w-[20rem]">
            <LifeMomentCard card={preview} onOpen={() => {}} preview />
          </div>
          {d.placeholder && d.image && <p className="text-xs text-ink-muted">Learners see the portrait: the picture is marked as a placeholder.</p>}
        </aside>
      </div>

      {problems.length > 0 && (
        <div className="rounded-2xl bg-muted p-4 text-sm">
          <p className="font-semibold">Before it can be approved</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {m.status === "published" && changed && (
        <Field label="What you’re correcting, and why" hint="This moment is out: the correction is recorded with your reason.">
          <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} />
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
          onClick={() => void run({ action: "moment.save", moment: { ...cleanMoment(d), publishAt: d.publishAt }, reason }, "Saved.")}
        >
          Save
        </button>
        {EPISODE_MOVES[m.status].map((s) => (
          <button
            key={s}
            type="button"
            className={s === "archived" ? btn.quiet : btn.secondary}
            disabled={changed}
            onClick={() => void run({ action: "moment.status", id: m.id, status: s }, `${EPISODE_STATES[s]}.`)}
          >
            {verb[s]}
          </button>
        ))}
        {m.status === "draft" && (
          <button type="button" className={btn.quiet} onClick={() => void run({ action: "moment.delete", id: m.id }).then((r) => r && onBack())}>
            Delete draft
          </button>
        )}
      </div>
      <ImageLibraryDialog open={picking} onClose={() => setPicking(false)} onPick={(p) => setD({ ...d, image: p.src, imageAlt: p.alt || d.imageAlt })} />
    </div>
  );
}
