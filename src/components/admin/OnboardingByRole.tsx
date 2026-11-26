"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { roleStarts } from "@/server/onboardingCourses";
import { Icon } from "../Icon";
import { btn, ErrorNote, Field, input } from "./ui";

/*
  Starting courses by role (the owner, Nov 2026): the four roles people pick from at their first sign-in, each with
  what it does first, in order: Topics, Discovery Paths and Magazine stories. Saving publishes a new version of that
  role's course (people part-way through keep the one they started) and, with a "finish within" number, makes it
  required with a due date and reminders. Work-specific courses (a cleaners' branch, say) stay on the Rules screen.
*/

type Data = ReturnType<typeof roleStarts>;
type Role = Data["roles"][number];
type Choice = Data["choices"][number];
type Item = Role["steps"][number];
type Kind = "all" | "topic" | "path" | "course";

const API = "/api/admin/onboarding/courses";
const KINDS: { value: Kind; label: string }[] = [
  { value: "all", label: "Anything" },
  { value: "topic", label: "Topics" },
  { value: "path", label: "Discovery Paths" },
  { value: "course", label: "Magazine" },
];
const shape = (title: string, items: Item[], due: string) => JSON.stringify({ title, items: items.map((i) => [i.ref, i.required, i.later]), due });

export function ByRole() {
  const { data, error, setData } = useApi<Data>(`${API}?view=roles`);
  const [saved, setSaved] = useState<string | null>(null);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-ink-muted">
        What each role does first. People get their role’s list when they first sign in, or when their role changes. Saving makes a new version: anyone part-way
        through keeps the list they started with.
      </p>
      {data.roles.map((r) => (
        <RoleCard
          // A fresh card after saving, from what the server now holds.
          key={`${r.segment}:${shape(r.title, r.steps, r.dueDays ? String(r.dueDays) : "")}`}
          role={r}
          choices={data.choices}
          saved={saved === r.segment}
          onSaved={(d) => {
            setData(d);
            setSaved(r.segment);
          }}
        />
      ))}
    </div>
  );
}

function RoleCard({ role, choices, saved, onSaved }: { role: Role; choices: Choice[]; saved: boolean; onSaved: (d: Data) => void }) {
  const [title, setTitle] = useState(role.title);
  const [items, setItems] = useState<Item[]>(role.steps);
  const [due, setDue] = useState(role.dueDays ? String(role.dueDays) : "");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const start = shape(role.title, role.steps, role.dueDays ? String(role.dueDays) : "");
  const dirty = shape(title, items, due) !== start;
  const words = q.trim().toLowerCase();
  const matches =
    words.length >= 2 || kind !== "all"
      ? choices
          .filter(
            (c) =>
              c.openTo.includes(role.segment) &&
              !items.some((i) => i.ref === c.ref) &&
              (kind === "all" || c.kind === kind) &&
              c.label.toLowerCase().includes(words),
          )
          .slice(0, 8)
      : [];
  const minutes = items.reduce((n, i) => n + (i.minutes || 0), 0);
  const move = (i: number, by: number) =>
    setItems((xs) => {
      const next = [...xs];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      onSaved(
        await api<Data>(API, {
          body: {
            action: "save-role",
            segment: role.segment,
            title,
            steps: items.map((i) => ({ ref: i.ref, required: i.required, later: i.later })),
            dueDays: due,
          },
        }),
      );
    } catch (e) {
      const err = e as Error & { problems?: string[] };
      setProblem(err.problems?.join(" ") ?? err.message);
    } finally {
      setBusy(false);
    }
  };
  const locked = !role.editable;

  return (
    <section aria-labelledby={`role-${role.segment}`} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`role-${role.segment}`} className="font-serif text-2xl font-semibold">
          {role.label}
        </h3>
        <span className="text-sm text-ink-muted">
          {role.enrolled === 1 ? "1 person on it" : `${role.enrolled} people on it`}
          {minutes > 0 && ` · about ${minutes} minutes`}
        </span>
      </div>
      {locked && (
        <p className="mt-1 text-sm text-ink-muted">Only {role.segment === "staff" ? "People & Culture" : "Partner Operations"} can change this one.</p>
      )}

      <Field label="What people see it called" className="mt-3 max-w-xl">
        <input
          className={input}
          value={title}
          maxLength={90}
          disabled={locked}
          placeholder={`Getting started as a ${role.label}`}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <h4 className="mt-4 text-sm font-semibold">In this order</h4>
      {items.length ? (
        <ol className="mt-1 flex flex-col gap-1.5">
          {items.map((it, i) => (
            <li key={it.ref} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-muted/60 px-3 py-2">
              <span className="w-5 text-right font-semibold text-ink-muted">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{it.title}</span>
                <span className="text-xs text-ink-muted">
                  {it.kindLabel}
                  {it.minutes ? ` · ${it.minutes} min` : ""}
                </span>
              </span>
              {/* Today or Later (the owner, Nov 2026): a short course to start with, a longer one when they're ready. */}
              <span role="group" aria-label={`When ${it.title} is for`} className="inline-flex rounded-full bg-surface p-0.5 ring-1 ring-line">
                {([false, true] as const).map((later) => (
                  <button
                    key={String(later)}
                    type="button"
                    aria-pressed={it.later === later}
                    disabled={locked}
                    onClick={() => setItems((xs) => xs.map((x, n) => (n === i ? { ...x, later } : x)))}
                    className={cx(
                      "min-h-9 rounded-full px-3 text-sm font-semibold",
                      it.later === later ? (later ? "bg-[#fab53d] text-[#3d2a00]" : "bg-[#008282] text-white") : "text-ink-muted hover:bg-muted",
                    )}
                  >
                    {later ? "Later" : "Today"}
                  </button>
                ))}
              </span>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={it.required}
                  disabled={locked}
                  onChange={(e) => setItems((xs) => xs.map((x, n) => (n === i ? { ...x, required: e.target.checked } : x)))}
                />
                Required
              </label>
              <span className="flex">
                <button type="button" className={btn.quiet} aria-label={`Move ${it.title} up`} disabled={locked || i === 0} onClick={() => move(i, -1)}>
                  <Icon name="arrow-up" className="size-4" />
                </button>
                <button
                  type="button"
                  className={btn.quiet}
                  aria-label={`Move ${it.title} down`}
                  disabled={locked || i === items.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <Icon name="arrow-down" className="size-4" />
                </button>
                <button
                  type="button"
                  className={btn.quiet}
                  aria-label={`Remove ${it.title}`}
                  disabled={locked}
                  onClick={() => setItems((xs) => xs.filter((_, n) => n !== i))}
                >
                  <Icon name="close" className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1 rounded-2xl bg-muted/60 px-3 py-2 text-sm text-ink-muted">Nothing yet. Add a Topic, Discovery Path or Magazine story below.</p>
      )}

      {!locked && items.length < 12 && (
        <div className="mt-3 rounded-2xl border border-dashed border-line-strong p-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Add" className="w-44">
              <select className={input} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Find by name" className="min-w-[14rem] flex-1">
              <input type="search" className={input} value={q} placeholder="Type at least two letters" onChange={(e) => setQ(e.target.value)} />
            </Field>
          </div>
          {matches.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {matches.map((c) => (
                <li key={c.ref}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-muted"
                    onClick={() => {
                      setItems((xs) => [
                        ...xs,
                        { ref: c.ref, kind: c.kind, kindLabel: c.kindLabel, title: c.label, required: true, later: false, minutes: c.minutes ?? 0 },
                      ]);
                      setQ("");
                    }}
                  >
                    <Icon name="plus" className="size-4 shrink-0 text-accent" />
                    <span className="min-w-0 flex-1">{c.label}</span>
                    <span className="text-xs text-ink-muted">
                      {c.kindLabel}
                      {c.minutes ? ` · ${c.minutes} min` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(words.length >= 2 || kind !== "all") && !matches.length && (
            <p className="mt-2 text-sm text-ink-muted">Nothing matches that {role.label}s can open.</p>
          )}
        </div>
      )}

      <Field
        label="Finish within (days)"
        hint="Leave it empty to recommend it, with no due date. A number makes it required, with a due date and reminders."
        className="mt-4 max-w-md"
      >
        <input
          type="number"
          min={1}
          max={365}
          className={cx(input.replace("w-full", ""), "w-28")}
          value={due}
          disabled={locked}
          onChange={(e) => setDue(e.target.value)}
        />
      </Field>
      {role.also.length > 0 && (
        <p className="mt-3 text-sm text-ink-muted">
          Some {role.label}s also get a work-specific course: {role.also.join(", ")}. Change those under Rules.
        </p>
      )}

      {problem && (
        <div className="mt-3">
          <ErrorNote text={problem} />
        </div>
      )}
      {!locked && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className={btn.primary} disabled={!dirty || busy || !items.length} onClick={save}>
            {busy ? "Saving…" : `Save for ${role.label}s`}
          </button>
          {dirty && (
            <button
              type="button"
              className={btn.quiet}
              onClick={() => {
                setTitle(role.title);
                setItems(role.steps);
                setDue(role.dueDays ? String(role.dueDays) : "");
                setProblem(null);
              }}
            >
              Undo changes
            </button>
          )}
          {saved && !dirty && (
            <p role="status" className="text-sm text-ink-muted">
              Saved. New {role.label}s get this list.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
