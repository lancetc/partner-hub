"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { BALANCE_BUCKETS, WEEKDAYS, type BalanceBucket, type Routine } from "@/lib/livingCalendar";
import { EPISODE_STATES, type LivesSettings } from "@/lib/livesInProgress";
import type { calendarAdmin } from "@/server/livingCalendar";
import { Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";
import { textarea } from "./LivesAdmin";

/*
  The Living Calendar for authors (server/livingCalendar, docs/lives-in-progress.md), inside Admin → Lives in Progress →
  Life Moments: the month with every moment in any state, episodes and routine days; click a day to add a moment
  there, drag a moment to move it; the month's review and balance; routines; and how varied proposed schedules are.
*/

type Month = ReturnType<typeof calendarAdmin>;
type Member = { id: string; name: string; portrait: string };
const act = (url: string, body: Record<string, unknown>) => api<Record<string, unknown>>(url, { body });

export function AdminMonth({ members, onOpen, onChanged }: { members: Member[]; onOpen: (id: string) => void; onChanged: () => void }) {
  const [month, setMonth] = useState<string | null>(null);
  const { data, error, reload } = useApi<Month>(`/api/admin/lives/calendar${month ? `?month=${month}` : ""}`);
  const [newFor, setNewFor] = useState(members[0]?.id ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? id;
  const run = async (url: string, body: Record<string, unknown>) => {
    setProblem(null);
    try {
      const r = await act(url, body);
      reload();
      onChanged();
      return r;
    } catch (e) {
      setProblem((e as Error).message);
      return null;
    }
  };
  const title = new Date(`${data.month}-01T00:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Previous month" className={btn.secondary} onClick={() => setMonth(data.prev)}>
          <Icon name="arrow-left" className="size-4" />
        </button>
        <h3 className="min-w-44 text-center font-serif text-xl font-semibold">{title}</h3>
        <button type="button" aria-label="Next month" className={btn.secondary} onClick={() => setMonth(data.next)}>
          <Icon name="arrow-right" className="size-4" />
        </button>
        <span className="ml-auto flex items-center gap-2 text-sm">
          <label htmlFor="new-for">Clicking a day adds a moment for</label>
          <select id="new-for" className={cx(input, "max-w-[12rem]")} value={newFor} onChange={(e) => setNewFor(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </span>
      </div>
      {problem && <ErrorNote text={problem} />}
      <div className="overflow-x-auto rounded-3xl border border-line bg-surface p-3">
        <div className="grid min-w-[52rem] grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => (
            <span key={d} className="px-1 text-xs font-semibold text-ink-muted">
              {d.slice(0, 3)}
            </span>
          ))}
          {data.days.map((d) => {
            const ms = data.moments.filter((m) => m.date === d);
            const es = data.episodes.filter((e) => e.date === d);
            const rs = data.routines.filter((r) => r.days.includes(d));
            return (
              <div
                key={d}
                onDragOver={(e) => (e.preventDefault(), setOver(d))}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const id = e.dataTransfer.getData("text/moment");
                  if (id) void run("/api/admin/lives/moments", { action: "moment.reschedule", id, date: d });
                }}
                className={cx(
                  "flex min-h-28 flex-col gap-0.5 rounded-xl border p-1",
                  d.slice(0, 7) === data.month ? "border-line" : "border-line opacity-50",
                  over === d && "border-[var(--color-action)] bg-tealtint",
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted">{Number(d.slice(8))}</span>
                  <button
                    type="button"
                    aria-label={`Add a moment for ${name(newFor)} on ${d}`}
                    className="grid size-5 place-items-center rounded text-ink-muted hover:bg-muted"
                    onClick={() =>
                      void run("/api/admin/lives/moments", { action: "moment.new", memberId: newFor, date: d }).then((r) => r && onOpen(String(r.id)))
                    }
                  >
                    <Icon name="plus" className="size-3" />
                  </button>
                </span>
                {es.map((e) => (
                  <span
                    key={e.id}
                    className="truncate rounded bg-[#102a43] px-1 text-xs text-white"
                    title={`${name(e.memberId)}: episode ${e.number}, ${e.title} (${EPISODE_STATES[e.status]})`}
                  >
                    Ep {e.number} · {name(e.memberId)}
                  </span>
                ))}
                {ms.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    draggable={m.status !== "published"}
                    onDragStart={(e) => e.dataTransfer.setData("text/moment", m.id)}
                    onClick={() => onOpen(m.id)}
                    title={`${name(m.memberId)}: ${m.headline} (${EPISODE_STATES[m.status]})${m.status === "published" ? "" : ". Drag to another day to move it."}`}
                    className={cx(
                      "truncate rounded px-1 text-left text-xs font-semibold",
                      m.status === "published" ? "bg-[#1f8a52]/15" : m.status === "scheduled" ? "cursor-grab bg-[#2f6fb0]/15" : "cursor-grab bg-muted",
                    )}
                  >
                    {m.headline || "Untitled"}
                  </button>
                ))}
                {rs.map((r) => (
                  <span key={r.id} className="truncate px-1 text-xs italic text-ink-muted" title={`${name(r.memberId)}: ${r.when}`}>
                    {r.title}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Navy: episodes. Green: shared (stays put). Blue: scheduled. Grey: drafts and approved. Italic: routines. Drag a moment that isn’t shared yet to move
          it; a moment that follows an episode can’t move before it.
        </p>
      </div>
      <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 md:grid-cols-2">
        <div>
          <h3 className="font-serif text-xl font-semibold">Review of {title}</h3>
          {data.review.issues.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {data.review.issues.map((i, n) => (
                <li key={n}>
                  {i.text}
                  {i.momentId && (
                    <button type="button" className="ml-1 font-semibold text-accent hover:underline" onClick={() => onOpen(i.momentId!)}>
                      Open
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">Nothing to look at: no duplicates, crowded days, spoilers or routine clashes.</p>
          )}
        </div>
        <div>
          <h3 className="font-serif text-xl font-semibold">Balance</h3>
          <p className="text-xs text-ink-muted">{data.review.count} moments and episodes this month, against the targets in Categories and cadence.</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {data.review.balance.map((b) => (
              <li key={b.bucket}>
                <span className="flex justify-between">
                  <span>{b.label}</span>
                  <span className="tabular-nums text-ink-muted">
                    {b.share}% <span className="text-xs">(aim {b.target}%)</span>
                  </span>
                </span>
                <span className="mt-0.5 block h-1.5 rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-[var(--color-action)]" style={{ width: `${Math.min(100, b.share)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------------------------

type RoutineRow = Month["routines"][number];

export function RoutinesPanel({ members, categories }: { members: Member[]; categories: { id: string; label: string }[] }) {
  const { data, reload } = useApi<Month>("/api/admin/lives/calendar");
  const [editing, setEditing] = useState<RoutineRow | null>(null);
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? id;
  const run = async (body: Record<string, unknown>) => {
    setProblem(null);
    try {
      const r = await act("/api/admin/lives/calendar", body);
      reload();
      return r;
    } catch (e) {
      setProblem((e as Error).message);
      return null;
    }
  };
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  if (editing)
    return (
      <RoutineEditor
        r={editing}
        name={name(editing.memberId)}
        categories={categories}
        members={members}
        problem={problem}
        onCancel={() => setEditing(null)}
        onSave={async (next) => {
          if (await run({ action: "routine.save", id: editing.id, routine: next })) setEditing(null);
        }}
      />
    );
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
      <h3 className="font-serif text-xl font-semibold">Routines</h3>
      <p className="text-sm text-ink-muted">
        The usual shape of their week, from the Character Bible: they show on the calendar as usual days. A past one is never shown as something that happened
        unless a shared moment says so. Pause a routine when the story interrupts it (“While her hip heals”), or skip a single day.
      </p>
      <ul className="flex flex-col gap-2">
        {data.routines.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                {name(r.memberId)}: {r.title}
              </span>
              <span className="block text-ink-muted">
                {r.when}
                {r.pauses.length > 0 && ` · paused ${r.pauses.map((p) => `${p.from} to ${p.to}${p.reason ? ` (${p.reason})` : ""}`).join(", ")}`}
              </span>
            </span>
            {r.sample && <Badge>Demo</Badge>}
            <Badge tone={r.status === "approved" ? "good" : "neutral"}>
              {r.status === "approved" ? "Approved" : r.status === "draft" ? "Draft" : "Archived"}
            </Badge>
            <button type="button" className={btn.quiet} onClick={() => setEditing(r)}>
              Edit
            </button>
            {r.status !== "approved" && (
              <button type="button" className={btn.secondary} onClick={() => void run({ action: "routine.status", id: r.id, status: "approved" })}>
                Approve
              </button>
            )}
            {r.status === "approved" && (
              <button type="button" className={btn.quiet} onClick={() => void run({ action: "routine.status", id: r.id, status: "archived" })}>
                Archive
              </button>
            )}
            {r.status === "draft" && (
              <button type="button" className={btn.quiet} onClick={() => void run({ action: "routine.delete", id: r.id })}>
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <select className={cx(input, "max-w-[12rem]")} aria-label="Whose routine" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={btn.secondary}
          onClick={() =>
            void run({ action: "routine.new", memberId, title: "A new routine" }).then(async (r) => {
              if (!r) return;
              const fresh = await api<Month>("/api/admin/lives/calendar");
              setEditing(fresh.routines.find((x) => x.id === r.id) ?? null);
            })
          }
        >
          <Icon name="plus" className="size-4" /> Add a routine
        </button>
      </div>
      {problem && <ErrorNote text={problem} />}
    </section>
  );
}

function RoutineEditor({
  r,
  name,
  categories,
  members,
  problem,
  onSave,
  onCancel,
}: {
  r: RoutineRow;
  name: string;
  categories: { id: string; label: string }[];
  members: Member[];
  problem: string | null;
  onSave: (r: Routine) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Routine>(r);
  const set = <K extends keyof Routine>(k: K, v: Routine[K]) => setD({ ...d, [k]: v });
  return (
    <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
      <h3 className="font-serif text-xl font-semibold sm:col-span-2">
        {name}: {r.title}
      </h3>
      {r.status === "approved" && <p className="text-sm text-ink-muted sm:col-span-2">Saving a change sends it back for approval.</p>}
      <Field label="Name">
        <input className={input} value={d.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="Kind">
        <select className={input} value={d.category} onChange={(e) => set("category", e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What it is" hint="Not how any one day went." className="sm:col-span-2">
        <input className={input} value={d.about} onChange={(e) => set("about", e.target.value)} />
      </Field>
      <Field label="How often">
        <select className={input} value={d.freq} onChange={(e) => set("freq", e.target.value as Routine["freq"])}>
          <option value="weekly">Weekly</option>
          <option value="fortnightly">Fortnightly</option>
          <option value="monthly">Monthly</option>
          <option value="annual">Every year</option>
        </select>
      </Field>
      <Field label="Time of day" hint="Empty for any time.">
        <input type="time" className={input} value={d.time} onChange={(e) => set("time", e.target.value)} />
      </Field>
      {d.freq !== "annual" && (
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-semibold">{d.freq === "monthly" ? "Which weekday (with which one in the month), or a date" : "Days"}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {WEEKDAYS.map((w, i) => (
              <label key={w} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-action)]"
                  checked={d.weekdays.includes(i)}
                  onChange={(e) =>
                    set("weekdays", e.target.checked ? (d.freq === "monthly" ? [i] : [...d.weekdays, i].sort()) : d.weekdays.filter((x) => x !== i))
                  }
                />
                {w.slice(0, 3)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {d.freq === "monthly" && (
        <>
          <Field label="Which one in the month">
            <select className={input} value={d.nth} onChange={(e) => set("nth", Number(e.target.value))}>
              <option value={0}>By date instead</option>
              <option value={1}>First</option>
              <option value={2}>Second</option>
              <option value={3}>Third</option>
              <option value={4}>Fourth</option>
              <option value={-1}>Last</option>
            </select>
          </Field>
          <Field label="Or the date each month">
            <input type="number" min={0} max={31} className={input} value={d.dayOfMonth} onChange={(e) => set("dayOfMonth", Number(e.target.value))} />
          </Field>
        </>
      )}
      {d.freq === "annual" && (
        <>
          <Field label="Month">
            <input type="number" min={1} max={12} className={input} value={d.month} onChange={(e) => set("month", Number(e.target.value))} />
          </Field>
          <Field label="Day">
            <input type="number" min={1} max={31} className={input} value={d.day} onChange={(e) => set("day", Number(e.target.value))} />
          </Field>
        </>
      )}
      <Field label="Starts">
        <input type="date" className={input} value={d.start} onChange={(e) => set("start", e.target.value)} />
      </Field>
      <Field label="Ends" hint="Empty: it carries on.">
        <input type="date" className={input} value={d.end} onChange={(e) => set("end", e.target.value)} />
      </Field>
      <Field label="Days it doesn’t happen" hint="Exceptions and cancellations, as YYYY-MM-DD, one per line." className="sm:col-span-2">
        <textarea className={textarea} value={d.skips.join("\n")} onChange={(e) => set("skips", e.target.value.split(/\s+/).filter(Boolean))} />
      </Field>
      <Field label="Pauses" hint="One per line: from, to, why. For example: 2026-12-01, 2026-12-20, While her hip heals" className="sm:col-span-2">
        <textarea
          className={textarea}
          value={d.pauses.map((p) => `${p.from}, ${p.to}, ${p.reason}`).join("\n")}
          onChange={(e) =>
            set(
              "pauses",
              e.target.value
                .split("\n")
                .map((line) => line.split(",").map((s) => s.trim()))
                .filter((p) => p[0] && p[1])
                .map(([from, to, ...why]) => ({ from, to, reason: why.join(", ") })),
            )
          }
        />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-semibold">Shared with</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {members
            .filter((m) => m.id !== r.memberId)
            .map((m) => (
              <label key={m.id} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-action)]"
                  checked={d.alsoMembers.includes(m.id)}
                  onChange={(e) => set("alsoMembers", e.target.checked ? [...d.alsoMembers, m.id] : d.alsoMembers.filter((x) => x !== m.id))}
                />
                {m.name}
              </label>
            ))}
        </div>
      </fieldset>
      <Field label="Where it comes from in the Character Bible" className="sm:col-span-2">
        <input className={input} value={d.source} onChange={(e) => set("source", e.target.value)} />
      </Field>
      {problem && <ErrorNote text={problem} />}
      <div className="flex gap-2 sm:col-span-2">
        <button type="button" className={btn.primary} onClick={() => onSave(d)}>
          Save
        </button>
        <button type="button" className={btn.quiet} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// How varied proposals are, and the balance to aim for
// ---------------------------------------------------------------------------------------------

export function VarietySettings({ settings, onDone }: { settings: LivesSettings; onDone: () => void }) {
  const [v, setV] = useState(settings.variety);
  const [b, setB] = useState(settings.balance);
  const [note, setNote] = useState<string | null>(null);
  const total = Object.values(b).reduce((n, x) => n + x, 0);
  return (
    <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        <h3 className="font-serif text-xl font-semibold">A little serendipity</h3>
        <p className="text-xs text-ink-muted">How proposed schedules vary. The same people and dates always give the same schedule.</p>
        <Field label="Most moments on one day, across everyone">
          <input
            type="number"
            min={1}
            max={5}
            className={cx(input, "w-24")}
            value={v.maxPerDay}
            onChange={(e) => setV({ ...v, maxPerDay: Number(e.target.value) })}
          />
        </Field>
        <Field label="About how many days have nothing (%)">
          <input
            type="number"
            min={0}
            max={60}
            className={cx(input, "w-24")}
            value={v.quietDays}
            onChange={(e) => setV({ ...v, quietDays: Number(e.target.value) })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-action)]"
            checked={v.consecutive}
            onChange={(e) => setV({ ...v, consecutive: e.target.checked })}
          />
          Let one person appear on two days running
        </label>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="font-serif text-xl font-semibold">Editorial balance</h3>
        <p className="text-xs text-ink-muted">What a month should be made of, in per cent. Never only illness, incidents or care.</p>
        {(Object.keys(BALANCE_BUCKETS) as BalanceBucket[]).map((k) => (
          <Field key={k} label={BALANCE_BUCKETS[k].label}>
            <input type="number" min={0} max={100} className={cx(input, "w-24")} value={b[k]} onChange={(e) => setB({ ...b, [k]: Number(e.target.value) })} />
          </Field>
        ))}
        <p className={cx("text-xs", total === 100 ? "text-ink-muted" : "font-semibold text-danger")}>Total {total}%</p>
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <button
          type="button"
          className={btn.primary}
          onClick={() =>
            void api("/api/admin/lives", { body: { action: "settings.save", settings: { variety: v, balance: b } } }).then(() => {
              setNote("Saved.");
              onDone();
            })
          }
        >
          Save variety and balance
        </button>
        {note && <span role="status">{note}</span>}
      </div>
    </section>
  );
}
