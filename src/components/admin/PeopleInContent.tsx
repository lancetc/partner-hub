"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { CHARACTER_ROLES, type CharacterRole } from "@/lib/characters";
import { lookSaysWho } from "@/lib/peopleInText";
import type { peopleToAdd } from "@/server/peopleInContent";
import { Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";

/*
  People in your content (docs/character-photos.md): the people Topics and Magazine courses name who aren't in the
  character library, or have no portrait. Adding them is free; a portrait is paid (OpenAI), so it always shows the cost
  and asks first. A name that isn't a person can be dismissed, and brought back.
*/

type Loaded = ReturnType<typeof peopleToAdd>;
type Person = Loaded["people"][number];
const usd = (n: number) => `US$${n.toFixed(2)}`;
const GENDER = { man: "Man", woman: "Woman", unknown: "Man or woman not said" } as const;
const SHOWN = 24;

export function PeopleInContent({ onChanged }: { onChanged: () => void }) {
  const data = useApi<Loaded>("/api/admin/characters/people");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");
  const [all, setAll] = useState(false);
  const [edits, setEdits] = useState<Record<string, { role: CharacterRole; look: string }>>({});

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setProblem("");
    setDone("");
    try {
      const r = await fetch("/api/admin/characters/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "That didn’t work.");
      data.reload();
      onChanged();
      return j as { added?: string[]; queued?: number; needsDescription?: string[]; cost?: number };
    } catch (e) {
      setProblem((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (data.error) return <ErrorNote text={data.error} />;
  if (!data.data) return <p className="text-ink-muted">Reading Topics and courses for the people they name…</p>;
  const { people, dismissed, cost, openai, topics, courses } = data.data;
  const missing = people.filter((p) => p.state === "missing");
  const edited = (p: Person) => edits[p.key] ?? { role: p.role, look: p.look };
  const shown = all ? people : people.slice(0, SHOWN);

  const addAll = async () => {
    if (
      !(await confirmAction(`Adds ${missing.length} people to the character library, with a look written from what the content says. No portraits are made.`, {
        title: "Add everyone to the library?",
        confirmLabel: `Add ${missing.length}`,
      }))
    )
      return;
    const r = await post({ action: "add-all", edits });
    if (r) setDone(`Added ${r.added?.length ?? 0} people to the library.`);
  };
  const portraitAll = async () => {
    const waiting = people.length - cost.portraits;
    if (
      !(await confirmAction(
        `Makes ${cost.portraits} portraits with OpenAI, about ${usd(cost.total)} (${usd(cost.each)} each), charged to your OpenAI account. Anyone not yet in the library is added first.${waiting ? ` ${waiting} people whose content doesn’t say man or woman are added without a portrait; describe them first.` : ""}`,
        { title: "Make all missing portraits?", confirmLabel: `Make ${cost.portraits} portraits (${usd(cost.total)})` },
      ))
    )
      return;
    const r = await post({ action: "portrait-all", confirm: true, edits });
    if (r) setDone(`Making ${r.queued} portraits, one at a time (about ${usd(r.cost ?? 0)}). They appear in the library as each is done.`);
  };
  const addOne = async (p: Person, portrait: boolean) => {
    if (
      portrait &&
      !(await confirmAction(`Makes one portrait of ${p.name} with OpenAI, about ${usd(cost.each)}, charged to your OpenAI account.`, {
        title: "Make a portrait?",
        confirmLabel: `Make portrait (${usd(cost.each)})`,
      }))
    )
      return;
    const r = await post({ action: portrait ? "portrait" : "add", keys: [p.key], confirm: portrait, edits: { [p.key]: edited(p) } });
    if (r) setDone(portrait ? `${p.name}: their portrait is being made.` : `${p.name} is in the library.`);
  };

  return (
    <section aria-labelledby="people-in-content" className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 id="people-in-content" className="font-serif text-xl font-semibold">
          People in your content
        </h2>
        <p className="max-w-3xl text-sm text-ink-muted">
          Named in {topics} Topics and {courses} Magazine courses, but not in the library or without a portrait. Each look is written only from what the content
          says: a man or a woman only when it says so. Adding someone is free; a portrait is made with OpenAI and costs about {usd(cost.each)}.
        </p>
      </div>
      {people.length === 0 ? (
        <p className="text-sm">Everyone your content names is in the library with a portrait.</p>
      ) : (
        <>
          <p className="text-sm font-semibold">
            {people.length} {people.length === 1 ? "person" : "people"}: {missing.length} not in the library, {people.length - missing.length} without a
            portrait. {cost.portraits} can have a portrait now; {people.length - cost.portraits} need a description first.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.secondary} disabled={busy || !missing.length} onClick={() => void addAll()}>
              <Icon name="plus" className="size-4" /> Add all ({missing.length}, free)
            </button>
            <button type="button" className={btn.primary} disabled={busy || !openai || !cost.portraits} onClick={() => void portraitAll()}>
              <Icon name="spark" className="size-4" /> Make all missing portraits ({usd(cost.total)})
            </button>
          </div>
        </>
      )}
      {problem && <ErrorNote text={problem} />}
      {done && (
        <p role="status" className="text-sm font-semibold">
          {done}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-line">
        {shown.map((p) => {
          const e = edited(p);
          const canDraw = lookSaysWho(e.look);
          return (
            <li key={p.key} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-serif text-lg font-semibold">{p.name}</p>
                {p.aliases.length > 0 && <p className="text-sm text-ink-muted">Also written: {p.aliases.join(", ")}</p>}
                <Badge tone={p.state === "missing" ? "warn" : "info"}>{p.state === "missing" ? "Not in the library" : "No portrait"}</Badge>
                <Badge tone={p.gender === "unknown" ? "neutral" : "good"}>{GENDER[p.gender]}</Badge>
              </div>
              <p className="text-sm italic">“{p.quote}”</p>
              <p className="text-sm">
                In{" "}
                {p.where.slice(0, 4).map((w, i) => (
                  <span key={`${w.kind}-${w.id}`}>
                    {i > 0 && ", "}
                    <Link href={w.kind === "topic" ? `/admin/lessons/${w.slug}/edit` : `/admin/magazine/${w.id}`} className="text-accent underline">
                      {w.title}
                    </Link>
                    <span className="text-ink-muted"> ({w.kind === "topic" ? "Topic" : "course"})</span>
                  </span>
                ))}
                {p.where.length > 4 && ` and ${p.where.length - 4} more`}
              </p>
              {p.maybe && (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  Maybe this is {p.maybe.name}, who’s already in the library.
                  <button type="button" className={btn.quiet} disabled={busy} onClick={() => void post({ action: "same-as", keys: [p.key], id: p.maybe!.id })}>
                    Same person: add “{p.name}” to {p.maybe.name}
                  </button>
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <Field label="Role">
                  <select className={input} value={e.role} onChange={(ev) => setEdits({ ...edits, [p.key]: { ...e, role: ev.target.value as CharacterRole } })}>
                    {(Object.keys(CHARACTER_ROLES) as CharacterRole[]).map((r) => (
                      <option key={r} value={r}>
                        {CHARACTER_ROLES[r]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="How they look"
                  hint={
                    canDraw
                      ? "Written from the content. Add hair, clothes or setting if you like."
                      : "The content doesn’t say man or woman. Say who they are before a portrait is made."
                  }
                >
                  <textarea
                    className={cx(input, "min-h-16 py-2")}
                    value={e.look}
                    maxLength={600}
                    onChange={(ev) => setEdits({ ...edits, [p.key]: { ...e, look: ev.target.value } })}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-1">
                {p.state === "missing" && (
                  <button type="button" className={btn.quiet} disabled={busy} onClick={() => void addOne(p, false)}>
                    <Icon name="plus" className="size-4" /> Add to the library
                  </button>
                )}
                <button
                  type="button"
                  className={btn.quiet}
                  disabled={busy || !openai || !canDraw}
                  title={!canDraw ? "Say whether they’re a man or a woman in the look first" : !openai ? "OpenAI isn’t connected" : undefined}
                  onClick={() => void addOne(p, true)}
                >
                  <Icon name="spark" className="size-4" /> {p.state === "missing" ? "Add and make portrait" : "Make portrait"} ({usd(cost.each)})
                </button>
                <button type="button" className={btn.quiet} disabled={busy} onClick={() => void post({ action: "dismiss", keys: [p.key] })}>
                  <Icon name="minus" className="size-4" /> Not a person
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {people.length > SHOWN && (
        <button type="button" className={cx(btn.secondary, "self-start")} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${people.length}`}
        </button>
      )}
      {dismissed.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Not people ({dismissed.length})</summary>
          <ul className="mt-2 flex flex-wrap gap-2">
            {dismissed.map((d) => (
              <li key={d.key} className="flex items-center gap-1 rounded-full border border-line px-3 py-1">
                {d.name}
                <button type="button" className={btn.quiet} disabled={busy} onClick={() => void post({ action: "restore", keys: [d.key] })}>
                  Bring back
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
