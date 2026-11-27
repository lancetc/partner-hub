"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { AUDIENCES, PLAN_MODES, PLAN_TARGETS, STORY_STATUS, type PlanMode } from "@/lib/story";
import type { StoryLibrary } from "@/server/story";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "../ui";
import { Icon } from "../../Icon";
import { box, Section } from "../problems/problemUi";

/*
  Characters and stories (docs/story-plans.md): the people who return across Topics and Magazine courses, the
  story they share, and the plans that use them. Everyone here is fictional. A character's shared story changes
  only when an editor approves it; nothing a learner chooses in a practice activity ever does.
*/

export type StoryAct = (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
/** One change at a time: post it, read the view again, and show what went wrong in words. */
export function useStoryAct(reload: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act: StoryAct = async (body) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<Record<string, unknown>>("/api/admin/story", { body });
      reload();
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { act, error, busy };
}
export const canonBadge = (c: { approved: boolean; changed: boolean }) =>
  c.approved ? (
    c.changed ? (
      <Badge tone="warn">Approved, with unapproved changes</Badge>
    ) : (
      <Badge tone="good">Approved</Badge>
    )
  ) : (
    <Badge tone="warn">Draft: not yet approved</Badge>
  );

export function StoryLibraryAdmin() {
  const lib = useApi<StoryLibrary>("/api/admin/story");
  const { act, error, busy } = useStoryAct(lib.reload);
  const router = useRouter();
  const [adding, setAdding] = useState<"character" | "plan" | null>(null);
  const [who, setWho] = useState({ id: "", name: "" });
  const [plan, setPlan] = useState({ title: "", mode: "story" as PlanMode });

  if (lib.error)
    return (
      <AdminShell title="Characters and stories">
        <ErrorNote text={lib.error} />
      </AdminShell>
    );
  if (!lib.data)
    return (
      <AdminShell title="Characters and stories">
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  const d = lib.data;
  const names = new Map(d.characters.map((c) => [c.id, c.name]));

  return (
    <AdminShell title="Characters and stories">
      <p className="max-w-3xl text-ink-muted">
        The people who return across Topics and Magazine courses, and the story they share. Everyone here is fictional. A character’s shared story changes only
        when an editor approves it: a learner’s choice in a practice activity never does.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btn.primary} onClick={() => setAdding(adding === "plan" ? null : "plan")}>
          <Icon name="plus" className="size-4" /> New story plan
        </button>
        <button type="button" className={btn.secondary} onClick={() => setAdding(adding === "character" ? null : "character")}>
          <Icon name="plus" className="size-4" /> Start a character’s story
        </button>
        <Link href="/admin/images/characters" className={btn.secondary}>
          <Icon name="image" className="size-4" /> Character photos
        </Link>
        <Link href="/admin/characters/returns" className={btn.secondary}>
          <Icon name="refresh" className="size-4" /> Return episodes
        </Link>
        <Link href="/admin/characters/report" className={btn.secondary}>
          <Icon name="gauge" className="size-4" /> Story report
        </Link>
      </div>
      {error && (
        <div className="mt-3">
          <ErrorNote text={error} />
        </div>
      )}

      {adding === "plan" && (
        <form
          className={cx(box, "mt-4 grid gap-3 sm:grid-cols-[1fr_16rem_auto]")}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act({ action: "save-plan", title: plan.title, data: { mode: plan.mode } });
            if (r?.id) router.push(`/admin/characters/plans/${String(r.id)}`);
          }}
        >
          <Field label="What the learning is for" hint="A working title. A Story Plan is never required: write the Topic or course first if you’d rather.">
            <input className={input} value={plan.title} onChange={(e) => setPlan({ ...plan, title: e.target.value })} required minLength={4} />
          </Field>
          <Field label="Start with">
            <select className={input} value={plan.mode} onChange={(e) => setPlan({ ...plan, mode: e.target.value as PlanMode })}>
              {Object.entries(PLAN_MODES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-start pt-6">
            <button className={btn.primary} disabled={busy}>
              Create
            </button>
          </div>
        </form>
      )}
      {adding === "character" && (
        <form
          className={cx(box, "mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]")}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act({ action: "start-profile", id: who.id || undefined, name: who.name });
            if (r?.id) router.push(`/admin/characters/${String(r.id)}`);
          }}
        >
          <Field label="Someone already in the photo library">
            <select className={input} value={who.id} onChange={(e) => setWho({ id: e.target.value, name: "" })}>
              <option value="">Choose…</option>
              {d.others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Or a new person" hint="Fictional, or a reviewed composite. Never a real client or colleague.">
            <input className={input} value={who.name} onChange={(e) => setWho({ id: "", name: e.target.value })} placeholder="A name" />
          </Field>
          <div className="flex items-start pt-6">
            <button className={btn.primary} disabled={busy || (!who.id && who.name.trim().length < 2)}>
              Start
            </button>
          </div>
        </form>
      )}

      <Section title="Characters" hint="A story profile is a draft until it’s approved. Only approved characters can speak in a Topic or a course.">
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {d.characters.map((c) => (
            <li key={c.id} className={cx(box, "flex flex-col")}>
              <div className="flex items-start gap-3">
                {c.portrait ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a library picture, shown as it is
                  <img src={c.portrait} alt="" className="size-14 shrink-0 rounded-full object-cover" />
                ) : (
                  <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted font-serif text-xl font-semibold">
                    {c.name.charAt(0)}
                  </span>
                )}
                <div className="min-w-0">
                  <Link
                    href={`/admin/characters/${c.id}`}
                    className="font-serif text-xl font-semibold transition-colors hover:text-[#007f7e] dark:hover:text-[#7fd6d2]"
                  >
                    {c.name}
                  </Link>
                  <p className="text-sm text-ink-muted">{c.narrativeRole || "No role in stories written yet"}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {canonBadge(c)}
                {c.sample && <Badge>Sample</Badge>}
              </div>
              <p className="mt-2 line-clamp-3 text-sm">{c.summary}</p>
              <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-1 pt-3 text-sm">
                <div className="col-span-2">
                  <dt className="inline text-ink-muted">Last approved event: </dt>
                  <dd className="inline">{c.lastEvent || "None yet"}</dd>
                </div>
                <div>
                  <dt className="inline text-ink-muted">Appears in: </dt>
                  <dd className="inline tabular-nums">{c.appearances}</dd>
                </div>
                <div>
                  <dt className="inline text-ink-muted">Moments: </dt>
                  <dd className="inline tabular-nums">{c.moments}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="inline text-ink-muted">Steward: </dt>
                  <dd className="inline">{c.steward || "None named"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="inline text-ink-muted">For: </dt>
                  <dd className="inline">{c.audience.length ? c.audience.map((a) => AUDIENCES[a]).join(", ") : "Everyone"}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        {d.characters.some((c) => c.sample) && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted p-3 text-sm">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" /> “Sample” marks the fictional pilot. It’s approved so the pilot can be tried, and it’s yours
            to edit: review each profile before using it with real learners. Approving your own version removes the mark.
          </p>
        )}
      </Section>

      <Section
        title="The story so far"
        hint="Episodes in story order, which isn’t the order they were written or published in. Open a character to add or change one."
      >
        <ol className={cx(box, "flex flex-col divide-y divide-line")}>
          {d.episodes.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
              <span className="w-10 shrink-0 text-sm tabular-nums text-ink-muted">{e.seq}</span>
              <span className="font-semibold">{e.title}</span>
              {e.whenLabel && <span className="text-sm text-ink-muted">{e.whenLabel}</span>}
              <span className="text-sm text-ink-muted">· {e.people.map((p) => names.get(p.characterId) ?? p.characterId).join(", ")}</span>
              <span className="ml-auto flex gap-1.5">
                <Badge tone={e.status === "approved" ? "good" : e.status === "retired" ? "bad" : "warn"}>{STORY_STATUS[e.status]}</Badge>
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Story plans" hint="A plan sits between what needs to change and the cards or pages that will teach it.">
        {!d.plans.length ? (
          <p className={cx(box, "text-ink-muted")}>No plans yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {d.plans.map((p) => (
              <li key={p.id} className={cx(box, "flex flex-wrap items-center gap-3")}>
                <Link
                  href={`/admin/characters/plans/${p.id}`}
                  className="min-w-0 flex-1 basis-72 font-serif text-lg font-semibold transition-colors hover:text-[#007f7e] dark:hover:text-[#7fd6d2]"
                >
                  {p.title}
                </Link>
                <span className="text-sm text-ink-muted">
                  {PLAN_MODES[p.mode]} · {PLAN_TARGETS[p.target]}
                  {p.anchor ? ` · ${p.anchor}` : ""}
                </span>
                {p.sample && <Badge>Sample</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AdminShell>
  );
}
