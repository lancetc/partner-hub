"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { BLOCK_REGISTRY } from "@/lib/blockRegistry";
import { BLOCK_LABELS, PAGE_TEMPLATES, type PageTemplate } from "@/lib/magazine";
import {
  AUDIENCES,
  BEAT_EVIDENCE,
  BEAT_KINDS,
  MOMENT_KINDS,
  PLAN_MODES,
  PLAN_TARGETS,
  STORY_STATUS,
  type Audience,
  type Beat,
  type BeatKind,
  type MomentKind,
  type PlanData,
  type PlanMode,
  type PlanTarget,
} from "@/lib/story";
import type { PlanDetail } from "@/server/story";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "../ui";
import { Icon } from "../../Icon";
import { area, box, Section } from "../problems/problemUi";
import { useStoryAct } from "./StoryLibraryAdmin";

/*
  A Story Plan (docs/story-plans.md): who this is happening to, what they're trying to do, which decision the
  learner makes, what comes of it, and what to do differently at work. It sits between the learning brief and the
  cards or pages, and it's never a gate: write by hand, use a short example, or go without a story.

  Suggestions here come from rules over approved profiles, episodes and the block registry, each with its reasons.
  Nothing is accepted for the author, and a missing fact stays "Needs author or source".
*/

const FIELDS: [keyof PlanData & string, string, string][] = [
  ["purpose", "Learning purpose", "Who should do what, in which work situation, and why?"],
  ["perspective", "Perspective", "Whose view does the learner hear: the older person, a coordinator, family, a supplier, a colleague?"],
  ["tension", "Tension", "What makes the right action hard in ordinary work? Mark anything invented as illustrative."],
  ["decision", "Learner decision", "Where does the learner notice, ask, say or do something? A real choice, not a theme."],
  ["effect", "Immediate and later effect", "What might the person experience afterwards? Keep a branch consequence apart from the shared story."],
  ["transfer", "Transfer", "A new but related situation that tests the same judgement, and the job aid or next action to take away."],
  ["sources", "Sources and boundaries", "The approved facts and procedure that govern the scene, and what must never be claimed without review."],
  ["checkin", "Suggested check-in", "A later update the character could give. Leave empty if it would be padding."],
  ["ava", "Ava moments", "Should Ava open this? Where would a later message change the learner’s understanding? Who should speak for themselves?"],
];

export function StoryPlanEditor({ id }: { id: string }) {
  const plan = useApi<PlanDetail>(`/api/admin/story?view=plan&id=${encodeURIComponent(id)}`);
  const { act, error, busy } = useStoryAct(plan.reload);
  const back = { href: "/admin/characters", label: "Characters and stories" };
  if (plan.error)
    return (
      <AdminShell title="Story plan" back={back}>
        <ErrorNote text={plan.error} />
      </AdminShell>
    );
  if (!plan.data)
    return (
      <AdminShell title="Story plan" back={back}>
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  return <Editor key={JSON.stringify([plan.data.title, plan.data.data])} d={plan.data} act={act} busy={busy} error={error} back={back} />;
}

function Editor({
  d,
  act,
  busy,
  error,
  back,
}: {
  d: PlanDetail;
  act: ReturnType<typeof useStoryAct>["act"];
  busy: boolean;
  error: string | null;
  back: { href: string; label: string };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(d.title);
  const [x, setX] = useState<PlanData>(d.data);
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState<{ beatId: string; kind: MomentKind; speakerId: string } | null>(null);
  const dirty = JSON.stringify([title, x]) !== JSON.stringify([d.title, d.data]);
  const save = (data: PlanData = x) => act({ action: "save-plan", id: d.id, title, data });
  const beat = (i: number, patch: Partial<Beat>) => setX({ ...x, beats: x.beats.map((b, n) => (n === i ? { ...b, ...patch } : b)) });
  const move = (i: number, by: number) => {
    const beats = [...x.beats];
    const [b] = beats.splice(i, 1);
    beats.splice(i + by, 0, b);
    setX({ ...x, beats });
  };
  const top = d.suggestions.fits[0];
  const story = x.mode !== "none";
  const outline = new Map(d.outline.map((o) => [o.beatId, o]));
  const open = d.warnings.filter((w) => !d.data.resolved[w.id]);

  return (
    <AdminShell title={title || "Story plan"} back={back}>
      <div className="-mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="info">{PLAN_MODES[d.data.mode]}</Badge>
        <Badge>{PLAN_TARGETS[d.data.target]}</Badge>
        {d.sample && <Badge>Sample</Badge>}
        {d.themeId && (
          <Link href={`/admin/problems/${d.themeId}`} className="text-sm underline underline-offset-2">
            From a Problem desk theme
          </Link>
        )}
      </div>
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}

      <Section title="What kind of plan" hint="A story is one way to teach a decision. A rate, a date or a procedure usually needs a short example, or none.">
        <div className={cx(box, "grid gap-3 sm:grid-cols-2 lg:grid-cols-4")}>
          <Field label="Title" className="sm:col-span-2 lg:col-span-4">
            <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Approach">
            <select className={input} value={x.mode} onChange={(e) => setX({ ...x, mode: e.target.value as PlanMode })}>
              {Object.entries(PLAN_MODES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="It becomes a">
            <select className={input} value={x.target} onChange={(e) => setX({ ...x, target: e.target.value as PlanTarget })}>
              {Object.entries(PLAN_TARGETS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="For" hint="Characters outside this audience aren’t offered.">
            <select className={input} value={x.audience} onChange={(e) => setX({ ...x, audience: e.target.value as Audience | "" })}>
              <option value="">Everyone</option>
              {Object.entries(AUDIENCES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <button type="button" className={btn.primary} disabled={busy || !dirty} onClick={() => save()}>
              Save
            </button>
          </div>
        </div>
        {!story && (
          <p className="mt-3 rounded-2xl bg-tealtint p-4">
            No story. That’s a complete answer for a job aid or a reference page, and you can come back and add one later without losing anything you’ve
            written.
          </p>
        )}
      </Section>

      {story && (
        <>
          <Section title="The plan" hint="Rough notes are fine. Anything you don’t know yet stays empty: needs author or source.">
            <div className={cx(box, "grid gap-3 sm:grid-cols-2")}>
              {FIELDS.map(([k, label, hint]) => (
                <Field key={k} label={label} hint={hint} className={k === "purpose" ? "sm:col-span-2" : ""}>
                  <textarea className={area} value={x[k] as string} onChange={(e) => setX({ ...x, [k]: e.target.value })} />
                </Field>
              ))}
            </div>
          </Section>

          <Section
            title="Story anchor: who is this happening to?"
            hint="Suggestions are filtered to approved characters this audience may see, then ranked on how their approved story connects to the behaviour. Save the plan to refresh them."
          >
            {d.anchor && (
              <div className={cx(box, "mb-3")}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="good">Chosen</Badge>
                  <Link href={`/admin/characters/${d.anchor.id}`} className="font-serif text-lg font-semibold underline-offset-2 hover:underline">
                    {d.anchor.name}
                  </Link>
                </div>
                <p className="mt-1 text-sm">{d.anchor.summary}</p>
                <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="font-semibold">Approved facts</p>
                    <ul className="list-disc pl-5">
                      {d.anchor.facts.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold">Existing appearances and timeline</p>
                    <ul className="list-disc pl-5">
                      {d.anchor.episodes.map((e) => (
                        <li key={e.title}>
                          {e.title}
                          {e.whenLabel ? ` (${e.whenLabel.toLowerCase()})` : ""}
                        </li>
                      ))}
                      {d.anchor.appearances.map((a) => (
                        <li key={a.label}>
                          {a.format}: {a.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {d.suggestions.fits.map((s) => (
                <li key={s.id} className={cx(box, "flex flex-wrap items-start gap-3")}>
                  <div className="min-w-0 flex-1 basis-72">
                    <p className="font-semibold">{s.name}</p>
                    {s.reasons.map((r) => (
                      <p key={r} className="mt-0.5 text-sm">
                        {r}
                      </p>
                    ))}
                    {s.tensions.map((t) => (
                      <p key={t} className="mt-0.5 flex items-start gap-1.5 text-sm text-warm">
                        <Icon name="alert" className="mt-0.5 size-4 shrink-0" /> {t}
                      </p>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={x.anchorId === s.id ? btn.quiet : btn.secondary}
                    disabled={busy || x.anchorId === s.id}
                    onClick={() => save({ ...x, anchorId: s.id })}
                  >
                    {x.anchorId === s.id ? "Chosen" : `Use ${s.name}`}
                  </button>
                </li>
              ))}
              {d.suggestions.withheld.map((w) => (
                <li key={w.id} className={cx(box, "text-sm text-ink-muted")}>
                  <span className="font-semibold text-ink">{w.name}</span> isn’t offered: {w.reason}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={x.anchorId === "new" ? btn.primary : btn.secondary}
                disabled={busy}
                onClick={() => save({ ...x, anchorId: "new" })}
              >
                Create a new character
              </button>
              <button type="button" className={x.anchorId === "" ? btn.primary : btn.secondary} disabled={busy} onClick={() => save({ ...x, anchorId: "" })}>
                No continuing character
              </button>
              {x.anchorId === "new" && (
                <Link href="/admin/characters" className={btn.quiet}>
                  Start their story profile
                </Link>
              )}
            </div>
            {x.anchorId && x.anchorId !== "new" && top && top.id !== x.anchorId && (
              <Field label="Why this character, and not the first suggestion" hint="Your call. The reason is kept with the plan." className="mt-3">
                <input className={input} value={x.anchorNote} onChange={(e) => setX({ ...x, anchorNote: e.target.value })} />
              </Field>
            )}
          </Section>

          <Section
            title="Story beats"
            hint="Person’s goal → work situation → complication or clue → learner choice → consequence → another perspective → transfer. Reorder, drop or add. A beat, a page pattern and a block are three different things."
            aside={
              <button
                type="button"
                className={btn.secondary}
                onClick={() =>
                  setX({
                    ...x,
                    beats: [
                      ...x.beats,
                      {
                        id: `beat${Date.now().toString(36)}`,
                        kind: "situation",
                        text: "",
                        characterId: "",
                        episodeId: "",
                        action: "",
                        source: "",
                        blocks: [],
                        evidence: "explanation",
                        hypothetical: false,
                        momentIds: [],
                      },
                    ],
                  })
                }
              >
                <Icon name="plus" className="size-4" /> Add a beat
              </button>
            }
          >
            <ol className="flex flex-col gap-3">
              {x.beats.map((b, i) => {
                const o = outline.get(b.id);
                return (
                  <li key={b.id} className={box}>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label={`${i + 1}. Beat`}>
                        <select className={input} value={b.kind} onChange={(e) => beat(i, { kind: e.target.value as BeatKind })}>
                          {Object.entries(BEAT_KINDS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Who">
                        <select className={input} value={b.characterId} onChange={(e) => beat(i, { characterId: e.target.value })}>
                          <option value="">Nobody in particular</option>
                          {d.cast.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                              {c.approved ? "" : " (draft)"}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Episode">
                        <select className={input} value={b.episodeId} onChange={(e) => beat(i, { episodeId: e.target.value })}>
                          <option value="">None</option>
                          {d.episodes.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.title}
                              {e.status === "approved" ? "" : ` (${STORY_STATUS[e.status].toLowerCase()})`}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="This is">
                        <select className={input} value={b.evidence} onChange={(e) => beat(i, { evidence: e.target.value as Beat["evidence"] })}>
                          {Object.entries(BEAT_EVIDENCE).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="What happens" className="sm:col-span-2">
                        <textarea className={cx(area, "min-h-16")} value={b.text} onChange={(e) => beat(i, { text: e.target.value })} />
                      </Field>
                      <Field label="What the learner does" hint="Empty for a beat that’s only read or heard." className="sm:col-span-2">
                        <textarea className={cx(area, "min-h-16")} value={b.action} onChange={(e) => beat(i, { action: e.target.value })} />
                      </Field>
                      <Field label="Activity" hint="Only blocks the Hub has. Leave it to the suggestion, or choose." className="sm:col-span-2">
                        <select className={input} value={b.blocks[0] ?? ""} onChange={(e) => beat(i, { blocks: e.target.value ? [e.target.value] : [] })}>
                          <option value="">Suggest one for me</option>
                          {BLOCK_REGISTRY.map((c) => (
                            <option key={c.type} value={c.type}>
                              {BLOCK_LABELS[c.type]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {b.kind === "consequence" && (
                        <label className="flex items-start gap-2 sm:col-span-2">
                          <input
                            type="checkbox"
                            className="mt-1 size-4"
                            checked={b.hypothetical}
                            onChange={(e) => beat(i, { hypothetical: e.target.checked })}
                          />
                          <span className="text-sm">
                            <span className="font-semibold">Depends on the learner’s choice</span>
                            <span className="block text-ink-muted">A possible consequence inside their attempt. It never joins the shared story.</span>
                          </span>
                        </label>
                      )}
                    </div>
                    {o && o.blocks.length > 0 && (
                      <div className="mt-3 rounded-xl bg-muted p-3 text-sm">
                        <p className="font-semibold">Why this block here?</p>
                        {o.blocks.map((k) => (
                          <p key={k.type} className="mt-0.5">
                            <span className="font-semibold">{k.label}.</span> {k.why}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {b.momentIds.map((mid) => {
                        const m = d.moments.find((y) => y.id === mid);
                        return m ? (
                          <span key={mid} className="inline-flex items-center gap-1 rounded-full border border-line-strong py-0.5 pl-3 pr-1 text-sm">
                            <Link href={`/admin/characters/moments/${mid}`} className="font-medium underline-offset-2 hover:underline">
                              {MOMENT_KINDS[m.kind]}: {m.title}
                            </Link>
                            {m.status !== "approved" && <Badge tone="warn">{STORY_STATUS[m.status]}</Badge>}
                            <button
                              type="button"
                              aria-label="Take this moment off the beat"
                              className="inline-flex size-8 items-center justify-center rounded-full hover:bg-muted"
                              onClick={() => beat(i, { momentIds: b.momentIds.filter((y) => y !== mid) })}
                            >
                              <Icon name="close" className="size-3.5" />
                            </button>
                          </span>
                        ) : null;
                      })}
                      <select
                        aria-label="Add a story moment to this beat"
                        className={cx(input, "w-auto max-w-full")}
                        value=""
                        onChange={(e) => {
                          if (e.target.value === "new")
                            setFresh({ beatId: b.id, kind: "new_information", speakerId: d.cast.find((c) => c.approved)?.id ?? "" });
                          else if (e.target.value) beat(i, { momentIds: [...b.momentIds, e.target.value] });
                        }}
                      >
                        <option value="">Add story moment…</option>
                        {d.moments
                          .filter((m) => !b.momentIds.includes(m.id))
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {MOMENT_KINDS[m.kind]}: {m.title}
                            </option>
                          ))}
                        <option value="new">Write a new one…</option>
                      </select>
                      <span className="ml-auto flex gap-1">
                        <button type="button" className={btn.quiet} disabled={i === 0} aria-label="Move this beat earlier" onClick={() => move(i, -1)}>
                          ↑
                        </button>
                        <button
                          type="button"
                          className={btn.quiet}
                          disabled={i === x.beats.length - 1}
                          aria-label="Move this beat later"
                          onClick={() => move(i, 1)}
                        >
                          ↓
                        </button>
                        <button type="button" className={btn.quiet} onClick={() => setX({ ...x, beats: x.beats.filter((_, n) => n !== i) })}>
                          <Icon name="trash" className="size-4" /> Remove
                        </button>
                      </span>
                    </div>
                    {fresh?.beatId === b.id && (
                      <form
                        className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-muted p-3"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const made = await act({ action: "save-moment", kind: fresh.kind, speakerId: fresh.speakerId, planId: d.id, data: {} });
                          if (!made?.id) return;
                          await act({
                            action: "save-plan",
                            id: d.id,
                            title,
                            data: { ...x, beats: x.beats.map((y) => (y.id === b.id ? { ...y, momentIds: [...y.momentIds, String(made.id)] } : y)) },
                          });
                          router.push(`/admin/characters/moments/${String(made.id)}`);
                        }}
                      >
                        <Field label="Kind">
                          <select className={input} value={fresh.kind} onChange={(e) => setFresh({ ...fresh, kind: e.target.value as MomentKind })}>
                            {Object.entries(MOMENT_KINDS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Who speaks">
                          <select className={input} value={fresh.speakerId} onChange={(e) => setFresh({ ...fresh, speakerId: e.target.value })} required>
                            {d.cast.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <button className={btn.secondary} disabled={busy}>
                          Save the plan and write it
                        </button>
                        <button type="button" className={btn.quiet} onClick={() => setFresh(null)}>
                          Cancel
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
              {!x.beats.length && <li className={cx(box, "text-ink-muted")}>No beats. A short example can be a single beat.</li>}
            </ol>
            <div className="mt-3">
              <button type="button" className={btn.primary} disabled={busy || !dirty} onClick={() => save()}>
                Save
              </button>
            </div>
          </Section>

          <Section
            title="Check continuity"
            hint="Against approved profiles and episodes, as last saved. A warning can be fixed, or answered with a recorded explanation. A blocked item has to be fixed."
            aside={
              <button type="button" className={btn.secondary} disabled={busy} onClick={() => save()}>
                <Icon name="refresh" className="size-4" /> Check again
              </button>
            }
          >
            {!d.warnings.length ? (
              <p className={cx(box, "flex items-center gap-2")}>
                <Icon name="circle-check" className="size-5 text-success" /> Nothing to flag in the saved plan.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {d.warnings.map((w) => {
                  const done = d.data.resolved[w.id];
                  return (
                    <li key={w.id} className={cx(box, w.level === "block" && "border-danger/60")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={w.level === "block" ? "bad" : done ? "good" : "warn"}>
                          {w.level === "block" ? "Blocked" : done ? "Answered" : "Check"}
                        </Badge>
                      </div>
                      <p className="mt-1">{w.text}</p>
                      {done && <p className="mt-1 text-sm text-ink-muted">Editor’s answer: {done}</p>}
                      {!done && w.level !== "block" && (
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <input
                            aria-label="Your explanation"
                            className={cx(input, "min-w-0 flex-1 basis-72")}
                            placeholder="Or explain why it stands"
                            value={answer[w.id] ?? ""}
                            onChange={(e) => setAnswer({ ...answer, [w.id]: e.target.value })}
                          />
                          <button
                            type="button"
                            className={btn.secondary}
                            disabled={busy || (answer[w.id] ?? "").trim().length < 5}
                            onClick={() => save({ ...x, resolved: { ...x.resolved, [w.id]: answer[w.id] } })}
                          >
                            Record
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {open.length === 0 && d.warnings.length > 0 && <p className="mt-2 text-sm text-ink-muted">Every warning has an answer on the record.</p>}
          </Section>

          <Section
            title={x.target === "topic" ? "Topic card outline" : "Magazine page outline"}
            hint={
              x.target === "topic"
                ? "A short, mobile-first sequence. Don’t give every beat its own card: keep each card to one action."
                : "A page for each beat that needs one, with the blocks chosen inside the page. Combine or drop pages as you write."
            }
          >
            {!d.outline.length ? (
              <p className={cx(box, "text-ink-muted")}>Write a beat or two and save, and the outline appears here.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {d.outline.map((s, i) => (
                  <li key={s.beatId} className={box}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">
                        {x.target === "topic" ? "Card" : "Page"} {i + 1}
                      </span>
                      <Badge>{s.beat}</Badge>
                      {x.target !== "topic" && <Badge tone="info">{PAGE_TEMPLATES[s.pattern as PageTemplate]?.label ?? s.pattern}</Badge>}
                      <Badge>{s.evidence}</Badge>
                      {s.moments > 0 && (
                        <Badge tone="good">
                          {s.moments} story {s.moments === 1 ? "moment" : "moments"}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 font-semibold">{s.title}</p>
                    {s.blocks.map((b) => (
                      <p key={b.type} className="mt-1 text-sm">
                        <span className="font-semibold">
                          {x.target === "topic"
                            ? b.topicCard
                              ? `${b.topicCard} card`
                              : `A content card (the Magazine’s ${b.label} has no Topic card)`
                            : b.label}
                          .
                        </span>{" "}
                        {b.why}
                      </p>
                    ))}
                  </li>
                ))}
              </ol>
            )}
            {x.target !== "topic" && (
              <div className={cx(box, "mt-3")}>
                {d.guide ? (
                  <p>
                    The Magazine draft for this plan:{" "}
                    <Link href={`/admin/magazine/${d.guide.id}`} className="font-semibold underline underline-offset-2">
                      {d.guide.title}
                    </Link>
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-ink-muted">
                      Starts an ordinary Magazine draft with a page for each step, each beat’s text as a note to write from. Nothing is published, and the
                      blocks are yours to add.
                    </p>
                    <button
                      type="button"
                      className={cx(btn.secondary, "mt-2")}
                      disabled={busy || dirty || !d.outline.length || d.warnings.some((w) => w.level === "block")}
                      onClick={async () => {
                        const out = await act({ action: "plan-course", id: d.id });
                        if (out?.guideId) router.push(`/admin/magazine/${String(out.guideId)}`);
                      }}
                    >
                      <Icon name="magazine" className="size-4" /> Start the Magazine draft
                    </button>
                  </>
                )}
              </div>
            )}
          </Section>
        </>
      )}
    </AdminShell>
  );
}
