"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import {
  EXPERIENCE,
  MAX_GOAL,
  PATH_STATES,
  PERSONAL_NOTE,
  PRIVACY_REMINDER,
  REQUEST_STATES,
  STARTERS,
  TIMES,
  type CatalogueItem,
  type Experience,
} from "@/lib/discovery";
import type { myDiscovery, suggest } from "@/server/discovery";
import { Icon } from "../Icon";
import { Chip, dbtn, dinput, ItemFacts, Problem, ROLE_LABELS } from "./parts";

/*
  My Discovery (docs/discovery-paths.md): the learner's own Discovery Paths, and where a new one starts:
  from a goal in their words, or from an empty list. Suggestions only ever hold published learning they
  can open; when nothing fits, the page says so and offers to pass the gap on.
*/

type Data = ReturnType<typeof myDiscovery>;
type Suggestion = Awaited<ReturnType<typeof suggest>>;
type Created = { path: { id: string } };

const DRAFT_KEY = "discovery-goal-draft";
const readDraft = () => {
  try {
    return window.localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
};
const keepDraft = (goal: string) => {
  try {
    if (goal) window.localStorage.setItem(DRAFT_KEY, goal);
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Private windows and blocked storage: the field still works, it just isn't remembered.
  }
};

export function MyDiscovery() {
  const { data, error, reload, setData } = useApi<Data>("/api/discovery");
  if (error) return <Problem text={error} onRetry={reload} />;
  if (!data) return <p className="mt-6 text-ink-muted">Loading your Discovery Paths…</p>;
  const current = data.paths.filter((p) => p.state !== "archived");
  const archived = data.paths.filter((p) => p.state === "archived");
  return (
    <div className="mt-6 flex flex-col gap-8">
      <Create data={data} first={current.length === 0} onRequests={(requests) => setData({ ...data, requests })} />

      <section aria-labelledby="dp-mine">
        <h2 id="dp-mine" className="font-serif text-2xl font-semibold">
          Your Discovery Paths
        </h2>
        {current.length === 0 ? (
          <p className="mt-2 max-w-2xl text-ink-muted">
            You haven’t made one yet. Start from a goal above, or build one yourself. You can also add a Topic or Magazine page to a path while you’re reading
            it.
          </p>
        ) : (
          <ul className="mt-3 grid gap-4 md:grid-cols-2">
            {current.map((p) => (
              <PathCard key={p.id} path={p} />
            ))}
          </ul>
        )}
        {archived.length > 0 && (
          <details className="mt-4">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">Archived ({archived.length})</summary>
            <ul className="mt-2 grid gap-4 md:grid-cols-2">
              {archived.map((p) => (
                <PathCard key={p.id} path={p} />
              ))}
            </ul>
          </details>
        )}
      </section>

      {data.requests.length > 0 && (
        <section aria-labelledby="dp-requests">
          <h2 id="dp-requests" className="font-serif text-2xl font-semibold">
            Topics you’ve asked for
          </h2>
          <ul className="mt-3 flex flex-col divide-y divide-line rounded-3xl bg-surface px-5 ring-1 ring-line">
            {data.requests.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.goal}</span>
                  <Chip tone={r.state === "published" ? "good" : "neutral"}>{REQUEST_STATES[r.state].label}</Chip>
                </p>
                <p className="text-sm text-ink-muted">
                  Asked {formatDate(r.createdAt)}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
                {r.link && (
                  <p>
                    <Link href={r.link} className="font-semibold text-accent underline-offset-4 hover:underline">
                      Open what was published
                    </Link>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PathCard({ path }: { path: Data["paths"][number] }) {
  const { progress } = path;
  const done = progress.done;
  return (
    <li className="flex flex-col gap-2 rounded-3xl bg-surface p-5 ring-1 ring-line">
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <Icon name="route" className="size-4" /> {PERSONAL_NOTE}
      </p>
      <h3 className="font-serif text-xl font-semibold">
        <Link href={`/discovery/${path.id}`} className="underline-offset-4 hover:underline">
          {path.title}
        </Link>
      </h3>
      {path.goal && <p className="text-ink-muted">“{path.goal}”</p>}
      <p className="flex flex-wrap items-center gap-2">
        <Chip tone={done ? "good" : "neutral"}>{done ? "Explored" : PATH_STATES[path.state]}</Chip>
        <span>{progress.label}</span>
      </p>
      {progress.total > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-action" style={{ width: `${Math.round((progress.explored / progress.total) * 100)}%` }} />
        </div>
      )}
      {progress.nextTitle && !done && <p className="text-sm">Next: {progress.nextTitle}</p>}
      {path.attention > 0 && (
        <p className="text-sm text-ink-muted">
          {path.attention} step{path.attention === 1 ? " has" : "s have"} changed since you saved {path.attention === 1 ? "it" : "them"}.
        </p>
      )}
      <p className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <Link href={`/discovery/${path.id}`} className={dbtn.secondary}>
          {progress.total === 0 ? "Add steps" : done ? "Open" : "Continue"}
        </Link>
        <span className="text-sm text-ink-muted">
          {path.lastOpenedAt ? `Last opened ${formatDate(path.lastOpenedAt)}` : `Changed ${formatDate(path.updatedAt)}`}
        </span>
      </p>
    </li>
  );
}

function Create({ data, first, onRequests }: { data: Data; first: boolean; onRequests: (r: Data["requests"]) => void }) {
  const router = useRouter();
  const ids = useId();
  // A goal they'd started typing is still there after a reload or a dropped connection. (This only renders in the browser, once their paths have loaded.)
  const [goal, setGoal] = useState(readDraft);
  const [experience, setExperience] = useState<Experience | "">("");
  const [minutes, setMinutes] = useState<number | 0>(0);
  const [busy, setBusy] = useState<"" | "suggest" | "create" | "request">("");
  const [problem, setProblem] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  /** Steps of the suggestion the learner has taken out before starting. */
  const [dropped, setDropped] = useState<string[]>([]);
  /** Everything offered for this goal so far, so "Try another" offers something else. */
  const offered = useRef<string[]>([]);
  const [context, setContext] = useState("");
  const [requested, setRequested] = useState(false);
  const result = useRef<HTMLDivElement>(null);

  const changeGoal = (v: string) => {
    setGoal(v);
    keepDraft(v.trim());
    if (suggestion) {
      setSuggestion(null);
      offered.current = [];
    }
    setRequested(false);
  };

  const ask = async (again: boolean) => {
    setBusy("suggest");
    setProblem(null);
    setRequested(false);
    try {
      if (!again) offered.current = [];
      const s = await api<Suggestion>("/api/discovery", {
        body: { action: "suggest", goal, experience: experience || null, minutes: minutes || null, exclude: offered.current },
      });
      offered.current = [...offered.current, ...s.steps.map((x) => x.key)];
      setSuggestion(s);
      setDropped([]);
      // Move to the answer, for a screen reader and on a phone.
      requestAnimationFrame(() => result.current?.focus());
    } catch (e) {
      setProblem(`${e instanceof Error ? e.message : "That didn’t work."} Your goal is still here: you can try again, or build the path yourself.`);
    } finally {
      setBusy("");
    }
  };

  const create = async (body: Record<string, unknown>) => {
    setBusy("create");
    setProblem(null);
    try {
      const made = await api<Created>("/api/discovery", { body });
      keepDraft("");
      router.push(`/discovery/${made.path.id}`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
      setBusy("");
    }
  };
  const fromSuggestion = (start: boolean) => {
    if (!suggestion) return;
    void create({
      goal: suggestion.goal,
      title: suggestion.title,
      purpose: suggestion.purpose,
      experience: suggestion.experience,
      minutes: suggestion.minutes,
      steps: suggestion.steps.filter((s) => !dropped.includes(s.key)).map((s) => ({ key: s.key, reason: s.reason })),
      recommendationId: suggestion.id,
      start,
    });
  };
  const myself = () => void create({ goal: goal.trim(), experience: experience || null, minutes: minutes || null });

  const request = async () => {
    setBusy("request");
    setProblem(null);
    try {
      const r = await api<{ requests: Data["requests"] }>("/api/discovery", { body: { action: "request", goal, context } });
      onRequests(r.requests);
      setRequested(true);
      setContext("");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t send.");
    } finally {
      setBusy("");
    }
  };

  const kept = suggestion?.steps.filter((s) => !dropped.includes(s.key)) ?? [];
  const ready = goal.trim().length >= 3;
  return (
    <section aria-labelledby={`${ids}-h`} className="rounded-3xl bg-surface p-5 ring-1 ring-line sm:p-6">
      <h2 id={`${ids}-h`} className="font-serif text-2xl font-semibold">
        Create a Discovery Path
      </h2>
      <p className="mt-1 max-w-3xl text-ink-muted">
        {first ? "Tell the Hub what you’d like to get better at, and it will suggest a short route through learning that’s already published. " : ""}A Discovery
        Path is yours: change it whenever you like. It doesn’t replace training you’ve been assigned, and finishing one doesn’t award a certificate.
      </p>

      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !busy) void ask(false);
        }}
      >
        <div>
          <label htmlFor={`${ids}-goal`} className="block font-semibold">
            What would you like to feel more confident doing?
          </label>
          <textarea
            id={`${ids}-goal`}
            className={cx(dinput, "mt-1.5 min-h-20 py-2")}
            maxLength={MAX_GOAL}
            value={goal}
            aria-describedby={`${ids}-privacy`}
            placeholder="For example: checking a supplier invoice"
            onChange={(e) => changeGoal(e.target.value)}
          />
          <p id={`${ids}-privacy`} className="mt-1 text-sm text-ink-muted">
            {PRIVACY_REMINDER} Your goal is private to you.
          </p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Or start from one of these">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                className="min-h-11 rounded-full border border-line-strong bg-bg px-3 text-left text-sm hover:bg-muted"
                onClick={() => changeGoal(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="font-semibold">
              How new is this to you? <span className="font-normal text-ink-muted">(optional)</span>
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(Object.keys(EXPERIENCE) as Experience[]).map((x) => (
                <Pick key={x} name={`${ids}-exp`} label={EXPERIENCE[x]} checked={experience === x} onPick={() => setExperience(experience === x ? "" : x)} />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="font-semibold">
              How long do you have now? <span className="font-normal text-ink-muted">(optional)</span>
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {TIMES.map((t) => (
                <Pick key={t} name={`${ids}-time`} label={`${t} minutes`} checked={minutes === t} onPick={() => setMinutes(minutes === t ? 0 : t)} />
              ))}
            </div>
          </fieldset>
        </div>
        <p className="text-sm text-ink-muted">
          Your role: {ROLE_LABELS[data.audience] ?? data.audience}. Suggestions only include learning that’s published and open to you.
        </p>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className={dbtn.primary} disabled={!ready || Boolean(busy)}>
            {busy === "suggest" ? "Looking through what’s published…" : "Suggest a path"}
          </button>
          <button type="button" className={dbtn.secondary} disabled={Boolean(busy)} onClick={myself}>
            Build it myself
          </button>
        </div>
      </form>

      {problem && (
        <div className="mt-4">
          <Problem text={problem} />
        </div>
      )}

      <div ref={result} tabIndex={-1} aria-live="polite" className="outline-none">
        {suggestion && suggestion.steps.length > 0 && (
          <div className="mt-6 border-t border-line pt-5">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">A suggested path</p>
            <h3 className="mt-1 font-serif text-2xl font-semibold">{suggestion.title}</h3>
            {suggestion.purpose && <p className="mt-1 text-ink-muted">{suggestion.purpose}</p>}
            <p className="mt-1 text-sm text-ink-muted">
              {kept.length} step{kept.length === 1 ? "" : "s"}, about {kept.reduce((n, s) => n + s.item.minutes, 0)} minutes. Every step is published Hub
              learning. {suggestion.engine === "ai" ? "AI chose and ordered these from what’s published; it didn’t write any of it." : ""}
            </p>
            <ol className="mt-3 flex flex-col gap-3">
              {kept.map((s, i) => (
                <li key={s.key} className="flex gap-3 rounded-2xl bg-bg p-4 ring-1 ring-line">
                  <span aria-hidden className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-mulish font-extrabold">
                    {i + 1}
                  </span>
                  <SuggestedStep item={s.item} reason={s.reason} />
                  <button
                    type="button"
                    className={dbtn.icon}
                    aria-label={`Leave out ${s.item.title}`}
                    title="Leave this out"
                    onClick={() => setDropped([...dropped, s.key])}
                  >
                    <Icon name="close" className="size-4" />
                  </button>
                </li>
              ))}
            </ol>
            {kept.length === 0 && <p className="mt-3">You’ve left out every step. Try another suggestion, or build the path yourself.</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className={dbtn.primary} disabled={Boolean(busy) || kept.length === 0} onClick={() => fromSuggestion(true)}>
                {busy === "create" ? "Saving…" : "Start this path"}
              </button>
              <button type="button" className={dbtn.secondary} disabled={Boolean(busy) || kept.length === 0} onClick={() => fromSuggestion(false)}>
                Edit the route
              </button>
              <button type="button" className={dbtn.quiet} disabled={Boolean(busy)} onClick={() => void ask(true)}>
                <Icon name="refresh" className="size-4" /> Try another suggestion
              </button>
              <button type="button" className={dbtn.quiet} disabled={Boolean(busy)} onClick={myself}>
                Build it myself
              </button>
            </div>
          </div>
        )}

        {suggestion && suggestion.steps.length === 0 && (
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="font-serif text-2xl font-semibold">{suggestion.again ? "Nothing else fits this goal" : "No suitable published learning yet"}</h3>
            <p className="mt-1 max-w-3xl text-ink-muted">
              {suggestion.again
                ? "That was everything published that’s about this. You can go back to the first suggestion by pressing Suggest a path, or build the path yourself."
                : "Nothing published on the Hub is about this yet, so there’s no route to suggest. We’d rather say so than fill a path with loosely related steps."}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" className={dbtn.secondary} disabled={Boolean(busy)} onClick={myself}>
                Build it myself
              </button>
              <Link href="/topics" className={dbtn.quiet}>
                Browse Topics
              </Link>
              <Link href="/magazine" className={dbtn.quiet}>
                Browse Magazine
              </Link>
            </div>
            {suggestion.nearby.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold">The closest published learning</h4>
                <p className="text-sm text-ink-muted">These are in the same area. They aren’t about your goal itself.</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {suggestion.nearby.map((n) => (
                    <li key={n.key} className="flex flex-col gap-1 rounded-2xl bg-bg p-4 ring-1 ring-line">
                      <Link href={n.item.href} className="font-semibold text-accent underline-offset-4 hover:underline">
                        {n.item.title}
                      </Link>
                      <ItemFacts item={n.item} />
                      <p className="text-sm text-ink-muted">{n.reason}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!suggestion.again &&
              (requested ? (
                <p role="status" className="mt-4 flex items-center gap-2 font-semibold text-success">
                  <Icon name="circle-check" className="size-5" /> Sent to the people who write Hub learning. It’s listed under “Topics you’ve asked for”.
                </p>
              ) : (
                <div className="mt-4 rounded-2xl bg-bg p-4 ring-1 ring-line">
                  <h4 className="font-semibold">Request this topic</h4>
                  <p className="mt-1 text-sm text-ink-muted">
                    Your goal goes to the people who write Hub learning, with your role but not your name. New learning is written and reviewed before it’s
                    published, so this isn’t instant.
                  </p>
                  <label htmlFor={`${ids}-ctx`} className="mt-3 block text-sm font-semibold">
                    Anything that would help them? <span className="font-normal text-ink-muted">(optional)</span>
                  </label>
                  <textarea
                    id={`${ids}-ctx`}
                    className={cx(dinput, "mt-1 min-h-16 py-2")}
                    maxLength={500}
                    value={context}
                    aria-describedby={`${ids}-ctxp`}
                    onChange={(e) => setContext(e.target.value)}
                  />
                  <p id={`${ids}-ctxp`} className="mt-1 text-sm text-ink-muted">
                    {PRIVACY_REMINDER}
                  </p>
                  <button type="button" className={cx(dbtn.primary, "mt-3")} disabled={Boolean(busy)} onClick={() => void request()}>
                    {busy === "request" ? "Sending…" : "Request this topic"}
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SuggestedStep({ item, reason }: { item: CatalogueItem; reason: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <p className="font-semibold">{item.title}</p>
      <ItemFacts item={item} />
      {item.summary && <p className="text-sm">{item.summary}</p>}
      <p className="text-sm text-ink-muted">Why it’s here: {reason}</p>
    </div>
  );
}

/** One of a few optional choices: press again to clear it. */
function Pick({ name, label, checked, onPick }: { name: string; label: string; checked: boolean; onPick: () => void }) {
  return (
    <label
      className={cx(
        "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
        checked ? "border-action bg-action text-on-action" : "border-line-strong bg-bg hover:bg-muted",
      )}
    >
      <input type="checkbox" name={name} className="sr-only" checked={checked} onChange={onPick} />
      {checked && <Icon name="check" className="size-4" />}
      {label}
    </label>
  );
}
