"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { GONE_TEXT, KIND_LABELS, MAX_NOTE, PATH_STATES, PERSONAL_NOTE, PHASES, type CatalogueItem, type ItemKind, type StepView } from "@/lib/discovery";
import type { DiscoveryPath, searchCatalogue, suggest } from "@/server/discovery";
import { Icon } from "../Icon";
import { Chip, dbtn, dinput, ItemFacts, KindBadge, Problem } from "./parts";

/*
  One Discovery Path (docs/discovery-paths.md): following it and changing it are the same page. An ordered
  list, not a canvas: each step has Move up and Move down buttons (so nothing needs dragging), a private
  note, and the learner's own marks. Every change saves as it's made; if a save fails the page keeps what
  was done and offers to send it again.
*/

type Data = { path: DiscoveryPath };
type Found = ReturnType<typeof searchCatalogue>;
type Suggestion = Awaited<ReturnType<typeof suggest>>;
type Offer = { item: CatalogueItem; reason?: string };

export function DiscoveryPathView({ id }: { id: string }) {
  const router = useRouter();
  const url = `/api/discovery/${id}`;
  const { data, error, reload, setData } = useApi<Data>(url);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  /** A change that didn't reach the server, kept so it can be sent again. */
  const [failed, setFailed] = useState<{ body: Record<string, unknown>; text: string } | null>(null);
  const [status, setStatus] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  /** The step just moved and which way, so focus stays on the button that was pressed. */
  const [moved, setMoved] = useState<{ id: string; dir: "up" | "down" } | null>(null);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!moved) return;
    const row = list.current?.querySelector<HTMLElement>(`[data-step="${moved.id}"]`);
    const pressed = row?.querySelector<HTMLButtonElement>(`[data-move="${moved.dir}"]`);
    const other = row?.querySelector<HTMLButtonElement>(`[data-move="${moved.dir === "up" ? "down" : "up"}"]`);
    (pressed && !pressed.disabled ? pressed : other)?.focus();
  }, [moved, data]);

  if (error)
    return (
      <div className="mt-6 flex flex-col gap-3">
        <Problem text={error} onRetry={reload} />
        <p>
          <Link href="/discovery" className={dbtn.quiet}>
            <Icon name="arrow-left" className="size-4" /> My Discovery
          </Link>
        </p>
      </div>
    );
  if (!data) return <p className="mt-6 text-ink-muted">Loading your path…</p>;
  const path = data.path;
  const { progress } = path;
  const keys = new Set(path.steps.map((s) => s.key));

  /** Sends a change and takes the path as the server now has it. */
  const send = async (body: Record<string, unknown>, said?: string) => {
    setSaving(true);
    setFailed(null);
    try {
      const out = await api<Data>(url, { body });
      setData(out);
      setSavedAt(true);
      if (said) setStatus(said);
      return true;
    } catch (e) {
      setFailed({ body, text: e instanceof Error ? e.message : "That didn’t save." });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const move = (step: StepView, dir: "up" | "down") => {
    const ids = path.steps.map((s) => s.id);
    const from = ids.indexOf(step.id);
    const to = dir === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    // Shown straight away; the order sent is the whole list, so sending it twice is harmless.
    const byId = new Map(path.steps.map((s) => [s.id, s]));
    setData({ path: { ...path, steps: ids.map((x) => byId.get(x)!) } });
    setMoved({ id: step.id, dir });
    void send({ action: "reorder", order: ids }, `${step.title} moved to position ${to + 1} of ${ids.length}.`);
  };

  const open = async (step: StepView) => {
    setOpening(step.id);
    try {
      const r = await api<{ href: string }>(url, { body: { action: "open", stepId: step.id } });
      router.push(r.href);
    } catch (e) {
      setFailed({ body: {}, text: e instanceof Error ? e.message : "That didn’t open." });
      setOpening(null);
      reload();
    }
  };

  const remove = async () => {
    if (
      !window.confirm(
        `Delete “${path.title}”? Its steps and your notes on them go too. This can’t be undone. The Topics and courses themselves, and your records of doing them, aren’t affected.`,
      )
    )
      return;
    setSaving(true);
    try {
      await api(url, { body: { action: "delete" } });
      router.push("/discovery");
    } catch (e) {
      setFailed({ body: {}, text: e instanceof Error ? e.message : "That didn’t delete." });
      setSaving(false);
    }
  };

  const next = path.steps.find((s) => s.id === progress.nextId) ?? null;
  const archived = path.state === "archived";
  return (
    <div className="mt-4 flex flex-col gap-6">
      <p>
        <Link href="/discovery" className={dbtn.quiet}>
          <Icon name="arrow-left" className="size-4" /> My Discovery
        </Link>
      </p>

      <header className="rounded-3xl bg-surface p-5 ring-1 ring-line sm:p-6">
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <Icon name="route" className="size-4" /> {PERSONAL_NOTE}
        </p>
        {renaming ? (
          <form
            className="mt-2 flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (await send({ title: f.get("title"), goal: f.get("goal") }, "Saved.")) setRenaming(false);
            }}
          >
            <label className="flex flex-col gap-1 font-semibold">
              Name
              <input name="title" defaultValue={path.title} maxLength={80} required className={dinput} autoFocus />
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              Your goal
              <textarea name="goal" defaultValue={path.goal} maxLength={300} className={cx(dinput, "min-h-16 py-2 font-normal")} />
            </label>
            <div className="flex flex-wrap gap-3">
              <button type="submit" className={dbtn.primary} disabled={saving}>
                Save
              </button>
              <button type="button" className={dbtn.secondary} onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{path.title}</h1>
            {path.goal && <p className="mt-1 text-lg text-ink-muted">Your goal: “{path.goal}”</p>}
          </>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Chip tone={progress.done ? "good" : "neutral"}>{progress.done ? "Explored" : PATH_STATES[path.state]}</Chip>
          <span className="font-semibold">{progress.label}</span>
          {progress.minutesLeft > 0 && <span className="text-ink-muted">About {progress.minutesLeft} min left</span>}
        </div>
        {progress.total > 0 && (
          <div className="mt-2 h-2 max-w-md overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-action" style={{ width: `${Math.round((progress.explored / progress.total) * 100)}%` }} />
          </div>
        )}

        {progress.done ? (
          <div className="mt-4 rounded-2xl bg-bg p-4 ring-1 ring-line">
            <p className="font-semibold">You’ve explored every step you chose. What can you use at work?</p>
            <p className="mt-1 text-sm text-ink-muted">
              This is your own route, so there’s no certificate and it doesn’t count as assigned training. Keep it to come back to, add to it, or archive it.
            </p>
          </div>
        ) : (
          next &&
          !archived && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className={dbtn.primary} disabled={opening !== null} onClick={() => void open(next)}>
                {opening === next.id ? "Opening…" : path.lastOpenedAt ? "Continue" : "Start"}
              </button>
              <span>Next: {next.title}</span>
            </div>
          )
        )}

        {!renaming && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            <button type="button" className={dbtn.quiet} onClick={() => setRenaming(true)}>
              <Icon name="pen" className="size-4" /> Rename or change the goal
            </button>
            {path.state === "active" && (
              <button type="button" className={dbtn.quiet} disabled={saving} onClick={() => void send({ state: "paused" }, "Paused.")}>
                <Icon name="pause" className="size-4" /> Pause
              </button>
            )}
            {(path.state === "paused" || path.state === "draft") && path.steps.length > 0 && (
              <button type="button" className={dbtn.quiet} disabled={saving} onClick={() => void send({ state: "active" }, "In progress.")}>
                <Icon name="play" className="size-4" /> {path.state === "paused" ? "Resume" : "Start this path"}
              </button>
            )}
            <button
              type="button"
              className={dbtn.quiet}
              disabled={saving}
              onClick={() => void send({ state: archived ? "active" : "archived" }, archived ? "Restored." : "Archived.")}
            >
              <Icon name="folder" className="size-4" /> {archived ? "Restore" : "Archive"}
            </button>
            <button type="button" className={cx(dbtn.quiet, "text-[#a3271a] dark:text-[#ffb4a6]")} disabled={saving} onClick={() => void remove()}>
              <Icon name="trash" className="size-4" /> Delete
            </button>
          </div>
        )}
      </header>

      <div className="flex min-h-6 flex-wrap items-center gap-3 text-sm" aria-live="polite">
        {failed ? (
          <Problem
            text={`${failed.text} ${Object.keys(failed.body).length ? "Your change is still here." : ""}`}
            onRetry={Object.keys(failed.body).length ? () => void send(failed.body) : undefined}
          />
        ) : saving ? (
          <span className="text-ink-muted">Saving…</span>
        ) : savedAt ? (
          <span className="inline-flex items-center gap-1.5 text-ink-muted">
            <Icon name="check" className="size-4" /> Saved
          </span>
        ) : null}
        <span className="sr-only">{status}</span>
      </div>

      <section aria-labelledby="dp-steps">
        <h2 id="dp-steps" className="font-serif text-2xl font-semibold">
          Steps
        </h2>
        {path.steps.length === 0 ? (
          <p className="mt-2 text-ink-muted">No steps yet. Find a Topic or Magazine page below and add it.</p>
        ) : (
          <ol ref={list} className="mt-3 flex flex-col gap-3">
            {path.steps.map((s, i) => (
              <Step
                key={s.id}
                step={s}
                index={i}
                count={path.steps.length}
                heading={s.phase && s.phase !== path.steps[i - 1]?.phase ? s.phase : null}
                busy={saving}
                opening={opening === s.id}
                readOnly={archived}
                onOpen={() => void open(s)}
                onMove={(dir) => move(s, dir)}
                onChange={(body, said) => send({ action: "step", stepId: s.id, ...body }, said)}
                onRemove={() => void send({ action: "remove", stepId: s.id }, `${s.title} removed.`)}
                onReplace={
                  s.gone?.replacement && !keys.has(s.gone.replacement.key)
                    ? () => void send({ action: "add", key: s.gone!.replacement!.key }, "Added.")
                    : undefined
                }
              />
            ))}
          </ol>
        )}
      </section>

      {!archived && (
        <AddSteps
          goal={path.goal}
          experience={path.experience}
          minutes={path.minutes}
          has={keys}
          busy={saving}
          onAdd={(o) => send({ action: "add", key: o.item.key, reason: o.reason }, `${o.item.title} added as step ${path.steps.length + 1}.`)}
        />
      )}
    </div>
  );
}

function Step({
  step,
  index,
  count,
  heading,
  busy,
  opening,
  readOnly,
  onOpen,
  onMove,
  onChange,
  onRemove,
  onReplace,
}: {
  step: StepView;
  index: number;
  count: number;
  heading: string | null;
  busy: boolean;
  opening: boolean;
  readOnly: boolean;
  onOpen: () => void;
  onMove: (dir: "up" | "down") => void;
  onChange: (body: Record<string, unknown>, said?: string) => Promise<boolean>;
  onRemove: () => void;
  onReplace?: () => void;
}) {
  const ids = useId();
  const [noting, setNoting] = useState(false);
  const item = step.item;
  return (
    <li data-step={step.id}>
      {heading && <p className="mb-2 mt-2 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{heading}</p>}
      <article aria-labelledby={`${ids}-t`} className={cx("flex gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line sm:p-5", !item && "bg-muted")}>
        <div className="flex shrink-0 flex-col items-center gap-2">
          <span aria-hidden className="inline-flex size-9 items-center justify-center rounded-full bg-muted font-mulish font-extrabold">
            {step.explored ? <Icon name="check" className="size-4" /> : index + 1}
          </span>
          {!readOnly && (
            <>
              <button
                type="button"
                data-move="up"
                className={dbtn.icon}
                disabled={index === 0}
                aria-label={`Move ${step.title} up, to position ${index}`}
                title="Move up"
                onClick={() => onMove("up")}
              >
                <Icon name="arrow-up" className="size-4" />
              </button>
              <button
                type="button"
                data-move="down"
                className={dbtn.icon}
                disabled={index === count - 1}
                aria-label={`Move ${step.title} down, to position ${index + 2}`}
                title="Move down"
                onClick={() => onMove("down")}
              >
                <Icon name="arrow-down" className="size-4" />
              </button>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h3 id={`${ids}-t`} className="font-serif text-xl font-semibold">
            <span className="sr-only">Step {index + 1}: </span>
            {step.title}
          </h3>
          {item ? (
            <ItemFacts item={item} />
          ) : (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <KindBadge kind={step.kind} />
              {step.parentTitle && <span>Was part of the course “{step.parentTitle}”</span>}
            </p>
          )}
          {item?.summary && <p>{item.summary}</p>}
          {item?.kind === "topic" && item.owner && (
            <p className="text-sm text-ink-muted">
              Owner: {item.owner}
              {item.reviewed ? ` · review date ${formatDate(item.reviewed)}` : ""}
            </p>
          )}

          <p className="flex flex-wrap gap-2 empty:hidden">
            {step.reviewedAt && <Chip tone="good">Reviewed for now</Chip>}
            {step.revisit && <Chip>Useful to revisit</Chip>}
            {step.updated && <Chip tone="warn">Updated since you saved this</Chip>}
          </p>

          {step.gone && (
            <div className="rounded-2xl bg-surface p-3 ring-1 ring-line">
              <p className="flex items-start gap-2 font-semibold">
                <Icon name="info" className="mt-0.5 size-5 shrink-0" /> {GONE_TEXT[step.gone.why]}
              </p>
              <p className="mt-1 text-sm text-ink-muted">It stays here as part of your history until you remove it. Your note is kept.</p>
              {step.gone.replacement && onReplace && (
                <p className="mt-2 flex flex-wrap items-center gap-2">
                  <span>
                    You could add the {KIND_LABELS[step.gone.replacement.kind].toLowerCase()} “{step.gone.replacement.title}” instead.
                  </span>
                  <button type="button" className={dbtn.secondary} disabled={busy} onClick={onReplace}>
                    <Icon name="plus" className="size-4" /> Add it
                  </button>
                </p>
              )}
            </div>
          )}

          {step.updated && item && (
            <p className="text-sm text-ink-muted">This has been revised. Opening it shows the current version; what you did before is kept.</p>
          )}
          {step.reason && <p className="text-sm text-ink-muted">Why it was suggested: {step.reason}</p>}

          {noting ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await onChange({ note: new FormData(e.currentTarget).get("note") }, "Note saved.")) setNoting(false);
              }}
            >
              <label htmlFor={`${ids}-n`} className="font-semibold">
                Why I saved this
              </label>
              <textarea
                id={`${ids}-n`}
                name="note"
                defaultValue={step.note}
                maxLength={MAX_NOTE}
                className={cx(dinput, "min-h-20 py-2")}
                aria-describedby={`${ids}-np`}
                autoFocus
              />
              <p id={`${ids}-np`} className="text-sm text-ink-muted">
                Only you can see this. It isn’t used for suggestions. Please don’t include a client’s name or health details.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={dbtn.secondary} disabled={busy}>
                  Save note
                </button>
                <button type="button" className={dbtn.quiet} onClick={() => setNoting(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            step.note && (
              <p className="rounded-2xl bg-bg px-3 py-2 ring-1 ring-line">
                <span className="block text-sm font-semibold text-ink-muted">Why I saved this (only you can see it)</span>
                <span className="whitespace-pre-wrap">{step.note}</span>
              </p>
            )
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {item && (
              <button type="button" className={dbtn.primary} disabled={opening} onClick={onOpen}>
                {opening ? "Opening…" : step.updated ? "Open the current version" : step.openedAt ? "Open again" : "Open"}
                <span className="sr-only">: {step.title}</span>
              </button>
            )}
            {!readOnly && (
              <>
                {item && (
                  <button
                    type="button"
                    className={dbtn.secondary}
                    aria-pressed={Boolean(step.reviewedAt)}
                    disabled={busy}
                    onClick={() => void onChange({ reviewed: !step.reviewedAt }, step.reviewedAt ? "No longer marked reviewed." : "Marked reviewed for now.")}
                  >
                    <Icon name={step.reviewedAt ? "circle-check" : "check"} className="size-4" /> Reviewed for now
                  </button>
                )}
                {item && (
                  <button
                    type="button"
                    className={dbtn.secondary}
                    aria-pressed={step.revisit}
                    disabled={busy}
                    onClick={() => void onChange({ revisit: !step.revisit }, step.revisit ? "No longer marked to revisit." : "Marked useful to revisit.")}
                  >
                    <Icon name={step.revisit ? "bookmark-filled" : "bookmark"} className="size-4" /> Useful to revisit
                  </button>
                )}
                {!noting && (
                  <button type="button" className={dbtn.quiet} onClick={() => setNoting(true)}>
                    <Icon name="pen" className="size-4" /> {step.note ? "Edit my note" : "Add a note"}
                  </button>
                )}
                <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
                  Group under
                  <select
                    className="min-h-11 rounded-full border border-line-strong bg-surface px-3"
                    value={step.phase ?? ""}
                    disabled={busy}
                    onChange={(e) => void onChange({ phase: e.target.value }, e.target.value ? `Grouped under ${e.target.value}.` : "Group removed.")}
                  >
                    <option value="">No group</option>
                    {PHASES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                    {step.phase && !(PHASES as readonly string[]).includes(step.phase) && <option>{step.phase}</option>}
                  </select>
                </label>
                <button type="button" className={dbtn.quiet} disabled={busy} onClick={onRemove}>
                  <Icon name="trash" className="size-4" /> Remove<span className="sr-only"> {step.title} from this path</span>
                </button>
              </>
            )}
          </div>
          {item && step.reviewedAt && (
            <p className="text-sm text-ink-muted">
              “Reviewed for now” is your own mark on this path. It doesn’t complete the {KIND_LABELS[item.kind].toLowerCase()} itself.
            </p>
          )}
        </div>
      </article>
    </li>
  );
}

const FORMATS: { id: "" | ItemKind; label: string }[] = [
  { id: "", label: "Any format" },
  { id: "topic", label: "Topics" },
  { id: "page", label: "Magazine pages" },
  { id: "course", label: "Whole courses" },
];

/** Find published learning to add: by searching, or by asking for more that fits the path's goal. */
function AddSteps({
  goal,
  experience,
  minutes,
  has,
  busy,
  onAdd,
}: {
  goal: string;
  experience: string | null;
  minutes: number | null;
  has: Set<string>;
  busy: boolean;
  onAdd: (o: Offer) => Promise<boolean>;
}) {
  const ids = useId();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"" | ItemKind>("");
  const [max, setMax] = useState("");
  const [found, setFound] = useState<{ offers: Offer[]; total: number; all: number; from: "search" | "goal" } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [version, setVersion] = useState(0);

  // Search as they type, a moment after they stop.
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        const params = new URLSearchParams({ q, kind, max });
        api<Found>(`/api/discovery/catalogue?${params}`).then(
          (r) => {
            if (!live) return;
            setFound({ offers: r.items.map((item) => ({ item })), total: r.total, all: r.all, from: "search" });
            setProblem(null);
          },
          (e: Error) => live && setProblem(e.message),
        );
      },
      q ? 300 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, kind, max, version]);

  const forGoal = async () => {
    setLooking(true);
    setProblem(null);
    try {
      const s = await api<Suggestion>("/api/discovery", { body: { action: "suggest", goal, experience, minutes, exclude: [...has] } });
      setFound({ offers: s.steps.map((x) => ({ item: x.item, reason: x.reason })), total: s.steps.length, all: 0, from: "goal" });
    } catch (e) {
      setProblem(`${e instanceof Error ? e.message : "That didn’t work."} You can still search and add steps yourself.`);
    } finally {
      setLooking(false);
    }
  };

  return (
    <section aria-labelledby={`${ids}-h`} className="rounded-3xl bg-surface p-5 ring-1 ring-line sm:p-6">
      <h2 id={`${ids}-h`} className="font-serif text-2xl font-semibold">
        Add steps
      </h2>
      <p className="mt-1 text-ink-muted">
        Published Topics and Magazine learning you can open. A Magazine page is listed by itself only when it makes sense without the rest of its course.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Search
          <input type="search" className={dinput} value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: invoice" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Format
          <select className={dinput} value={kind} onChange={(e) => setKind(e.target.value as "" | ItemKind)}>
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Time
          <select className={dinput} value={max} onChange={(e) => setMax(e.target.value)}>
            <option value="">Any length</option>
            <option value="5">5 minutes or less</option>
            <option value="10">10 minutes or less</option>
            <option value="20">20 minutes or less</option>
          </select>
        </label>
      </div>
      {goal && (
        <p className="mt-3">
          <button type="button" className={dbtn.secondary} disabled={looking} onClick={() => void forGoal()}>
            <Icon name="bulb" className="size-4" /> {looking ? "Looking through what’s published…" : "Suggest more for my goal"}
          </button>
        </p>
      )}
      {problem && (
        <div className="mt-3">
          <Problem text={problem} onRetry={() => setVersion((v) => v + 1)} />
        </div>
      )}

      <div aria-live="polite" className="mt-4">
        {!found ? (
          <p className="text-ink-muted">Loading…</p>
        ) : found.offers.length === 0 ? (
          <p>
            {found.from === "goal"
              ? "Nothing else that’s published fits your goal."
              : q
                ? `Nothing published matches “${q}”${kind || max ? " with those filters" : ""}.`
                : "Nothing matches those filters."}
          </p>
        ) : (
          <>
            <p className="text-sm text-ink-muted">
              {found.from === "goal" ? `Suggested for “${goal}”` : `Showing ${found.offers.length} of ${found.total}${q || kind || max ? "" : " you can add"}`}
              {found.from === "goal" && (
                <>
                  {" · "}
                  <button type="button" className="font-semibold underline underline-offset-4" onClick={() => setVersion((v) => v + 1)}>
                    Back to search
                  </button>
                </>
              )}
            </p>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {found.offers.map((o) => {
                const there = has.has(o.item.key);
                return (
                  <li key={o.item.key} className="flex flex-wrap items-start gap-3 py-3">
                    <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
                      <p className="font-semibold">{o.item.title}</p>
                      <ItemFacts item={o.item} />
                      {o.item.summary && <p className="text-sm">{o.item.summary}</p>}
                      {o.reason && <p className="text-sm text-ink-muted">Why it’s suggested: {o.reason}</p>}
                    </div>
                    {there ? (
                      <span className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-success">
                        <Icon name="circle-check" className="size-5" /> In this path
                      </span>
                    ) : (
                      <button type="button" className={dbtn.secondary} disabled={busy} onClick={() => void onAdd(o)}>
                        <Icon name="plus" className="size-4" /> Add<span className="sr-only"> {o.item.title}</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
