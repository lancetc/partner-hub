"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  AUDIENCES,
  CAST_ROLES,
  FORMATS,
  MOMENT_HINTS,
  MOMENT_KINDS,
  PROVENANCE,
  STORY_STATUS,
  type AppearanceKind,
  type Audience,
  type CastRole,
  type MomentKind,
  type Profile,
} from "@/lib/story";
import type { CharacterDetail } from "@/server/story";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "../ui";
import { Icon } from "../../Icon";
import { area, box, dateText, Section } from "../problems/problemUi";
import { canonBadge, useStoryAct, type StoryAct } from "./StoryLibraryAdmin";

/*
  One character's shared story (docs/story-plans.md): the profile and its approved facts, the episodes they're in,
  where they appear, and the moments they speak in. The draft is free to edit; learners and other authors only
  ever get the approved version, and approving a change shows everything that already tells the story.
*/

const TABS = { profile: "Profile", timeline: "Story timeline", appearances: "Appearances", moments: "Moments and check-ins" } as const;
type Tab = keyof typeof TABS;
type Props = { d: CharacterDetail; act: StoryAct; busy: boolean };
type Voices = {
  topic: { name: string };
  voices: { voiceId: string; name: string; description: string }[];
  openai: { id: string; label: string }[];
  note: string | null;
};
type Places = { topics: { ref: string; title: string }[]; guides: { ref: string; title: string; places: { id: string; label: string }[] }[] };

export function CharacterStory({ id }: { id: string }) {
  const c = useApi<CharacterDetail>(`/api/admin/story?view=character&id=${encodeURIComponent(id)}`);
  const { act, error, busy } = useStoryAct(c.reload);
  const [tab, setTab] = useState<Tab>("profile");
  const back = { href: "/admin/characters", label: "Characters and stories" };
  if (c.error)
    return (
      <AdminShell title="Character" back={back}>
        <ErrorNote text={c.error} />
      </AdminShell>
    );
  if (!c.data)
    return (
      <AdminShell title="Character" back={back}>
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  const d = c.data;
  const p = { d, act, busy };
  return (
    <AdminShell title={d.name} back={back}>
      <div className="-mt-3 flex flex-wrap items-center gap-2">
        {canonBadge({ approved: Boolean(d.approved), changed: d.changes.length > 0 })}
        <Badge>{PROVENANCE[d.draft.provenance]}</Badge>
        {d.sample && <Badge>Sample</Badge>}
        {d.revision > 0 && <span className="text-sm text-ink-muted">Approved version {d.revision}</span>}
      </div>
      <div role="tablist" aria-label="Sections" className="mt-5 flex gap-1 overflow-x-auto border-b border-line pb-px">
        {(Object.keys(TABS) as Tab[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cx(
              "min-h-11 shrink-0 rounded-t-xl border-b-2 px-3 text-sm font-semibold",
              tab === k ? "border-action bg-tealtint text-ink" : "border-transparent text-ink-muted hover:bg-muted hover:text-ink",
            )}
          >
            {TABS[k]}
          </button>
        ))}
      </div>
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      <div className="mt-6">
        {tab === "profile" && <ProfileTab key={JSON.stringify([d.draft, d.steward, d.audience])} {...p} />}
        {tab === "timeline" && <TimelineTab {...p} />}
        {tab === "appearances" && <AppearancesTab {...p} />}
        {tab === "moments" && <MomentsTab {...p} />}
      </div>
    </AdminShell>
  );
}

// ---------------------------------------------------------------------------------------------

function ProfileTab({ d, act, busy }: Props) {
  const [p, setP] = useState<Profile>(d.draft);
  const [steward, setSteward] = useState(d.steward);
  const [audience, setAudience] = useState<Audience[]>(d.audience);
  const [note, setNote] = useState("");
  const voices = useApi<Voices>(d.voiceReady ? "/api/admin/story?view=voices" : null).data;
  const dirty = JSON.stringify([p, steward, audience]) !== JSON.stringify([d.draft, d.steward, d.audience]);
  const fact = (i: number, patch: Partial<Profile["facts"][number]>) => setP({ ...p, facts: p.facts.map((f, n) => (n === i ? { ...f, ...patch } : f)) });
  const rel = (i: number, patch: Partial<Profile["relationships"][number]>) =>
    setP({ ...p, relationships: p.relationships.map((r, n) => (n === i ? { ...r, ...patch } : r)) });
  const uid = (x: string) => `${x}${Date.now().toString(36)}`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void act({ action: "save-profile", id: d.id, profile: p, steward, audience });
      }}
    >
      <Section title="Who they are" hint="A person with goals, choices and a point of view. Never only the problem a course needs.">
        <div className={cx(box, "grid gap-3 sm:grid-cols-2")}>
          <Field label="Their part in stories">
            <input className={input} value={p.narrativeRole} onChange={(e) => setP({ ...p, narrativeRole: e.target.value })} />
          </Field>
          <Field label="Pronouns" hint="As given.">
            <input className={input} value={p.pronouns} onChange={(e) => setP({ ...p, pronouns: e.target.value })} />
          </Field>
          <Field label="Summary" className="sm:col-span-2">
            <textarea className={area} value={p.summary} onChange={(e) => setP({ ...p, summary: e.target.value })} />
          </Field>
          <Field label="What matters to them" className="sm:col-span-2">
            <textarea className={area} value={p.matters} onChange={(e) => setP({ ...p, matters: e.target.value })} />
          </Field>
          <Field label="Where they come from" hint="A reviewed composite never carries identifying detail from a real case.">
            <select className={input} value={p.provenance} onChange={(e) => setP({ ...p, provenance: e.target.value as Profile["provenance"] })}>
              {Object.entries(PROVENANCE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Steward" hint="Who looks after this person’s shared story. A named Hub user means only they, or a superadmin, can approve changes.">
            <input className={input} value={steward} onChange={(e) => setSteward(e.target.value)} />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-semibold">Who may see them</legend>
            <p className="text-xs text-ink-muted">None ticked means everyone. A character is never suggested, shown or listed outside these audiences.</p>
            <div className="mt-1 flex flex-wrap gap-4">
              {(Object.keys(AUDIENCES) as Audience[]).map((a) => (
                <label key={a} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={audience.includes(a)}
                    onChange={(e) => setAudience(e.target.checked ? [...audience, a] : audience.filter((x) => x !== a))}
                  />
                  {AUDIENCES[a]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Section>

      <Section
        title="Approved facts"
        hint="What every story has to stay consistent with. Keep each to one thing, and say where it comes from."
        aside={
          <button type="button" className={btn.secondary} onClick={() => setP({ ...p, facts: [...p.facts, { id: uid("f"), text: "", source: "" }] })}>
            <Icon name="plus" className="size-4" /> Add a fact
          </button>
        }
      >
        <ul className="flex flex-col gap-2">
          {p.facts.map((f, i) => (
            <li key={f.id} className={cx(box, "grid gap-2 sm:grid-cols-[1fr_16rem_auto]")}>
              <input aria-label="Fact" className={input} value={f.text} onChange={(e) => fact(i, { text: e.target.value })} placeholder="A fact" />
              <input
                aria-label="Source"
                className={input}
                value={f.source}
                onChange={(e) => fact(i, { source: e.target.value })}
                placeholder="Where it comes from"
              />
              <button
                type="button"
                className={btn.quiet}
                aria-label="Remove this fact"
                onClick={() => setP({ ...p, facts: p.facts.filter((_, n) => n !== i) })}
              >
                <Icon name="trash" className="size-4" />
              </button>
            </li>
          ))}
          {!p.facts.length && <li className={cx(box, "text-ink-muted")}>No facts yet.</li>}
        </ul>
      </Section>

      <Section
        title="Relationships"
        aside={
          <button
            type="button"
            className={btn.secondary}
            onClick={() => setP({ ...p, relationships: [...p.relationships, { id: uid("r"), name: "", relation: "", note: "" }] })}
          >
            <Icon name="plus" className="size-4" /> Add a relationship
          </button>
        }
      >
        <ul className="flex flex-col gap-2">
          {p.relationships.map((r, i) => (
            <li key={r.id} className={cx(box, "grid gap-2 sm:grid-cols-[12rem_12rem_1fr_auto]")}>
              <input aria-label="Name" className={input} value={r.name} onChange={(e) => rel(i, { name: e.target.value })} placeholder="Name" />
              <input
                aria-label="Relationship"
                className={input}
                value={r.relation}
                onChange={(e) => rel(i, { relation: e.target.value })}
                placeholder="daughter, cleaner…"
              />
              <input aria-label="Note" className={input} value={r.note} onChange={(e) => rel(i, { note: e.target.value })} placeholder="Note" />
              <button
                type="button"
                className={btn.quiet}
                aria-label="Remove this relationship"
                onClick={() => setP({ ...p, relationships: p.relationships.filter((_, n) => n !== i) })}
              >
                <Icon name="trash" className="size-4" />
              </button>
            </li>
          ))}
          {!p.relationships.length && <li className={cx(box, "text-ink-muted")}>None recorded.</li>}
        </ul>
      </Section>

      <Section title="How to write, show and voice them">
        <div className={cx(box, "grid gap-3 sm:grid-cols-2")}>
          <Field label="Portrayal notes">
            <textarea className={area} value={p.portrayal} onChange={(e) => setP({ ...p, portrayal: e.target.value })} />
          </Field>
          <Field label="Never, without review" hint="What they must not be shown claiming or going through.">
            <textarea className={area} value={p.never} onChange={(e) => setP({ ...p, never: e.target.value })} />
          </Field>
          <Field label="Visual guide" hint="Face, clothing, props and settings, so the pictures stay one person." className="sm:col-span-2">
            <textarea className={area} value={p.visual} onChange={(e) => setP({ ...p, visual: e.target.value })} />
          </Field>
          <Field
            label="Voice"
            hint={
              d.voiceReady
                ? `An approved synthetic voice, kept the same across episodes. With none chosen, recordings use the Hub’s narrator (${d.narrator}).`
                : "No voice provider is connected, so check-ins are text only."
            }
          >
            <select
              className={input}
              value={p.voice.id}
              onChange={(e) => {
                const v = voices?.voices.find((x) => x.voiceId === e.target.value);
                const o = voices?.openai.find((x) => `openai:${x.id}` === e.target.value);
                setP({ ...p, voice: { ...p.voice, id: e.target.value, name: v?.name ?? o?.label ?? "" } });
              }}
            >
              <option value="">The Hub’s narrator</option>
              {p.voice.id && !voices && <option value={p.voice.id}>{p.voice.name || "The chosen voice"}</option>}
              {voices && voices.voices.length > 0 && (
                <optgroup label="ElevenLabs">
                  {voices.voices.map((v) => (
                    <option key={v.voiceId} value={v.voiceId}>
                      {v.name}
                      {v.description ? ` · ${v.description}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {voices && voices.openai.length > 0 && (
                <optgroup label="OpenAI">
                  {voices.openai.map((v) => (
                    <option key={v.id} value={`openai:${v.id}`}>
                      {v.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
          <Field label="Why this voice" hint="Changing a voice is an editorial change: say why.">
            <input className={input} value={p.voice.reason} onChange={(e) => setP({ ...p, voice: { ...p.voice, reason: e.target.value } })} />
          </Field>
          {voices?.note && <p className="text-sm text-ink-muted sm:col-span-2">{voices.note}</p>}
        </div>
        <div className="mt-3">
          <button className={btn.primary} disabled={busy || !dirty}>
            Save draft
          </button>
        </div>
      </Section>

      <Section
        title="Approve as shared story"
        hint="Approving makes this the version stories are checked against. Everything already published keeps the version it was approved with."
      >
        <div className={box}>
          {dirty && <p className="text-sm text-ink-muted">Save the draft first.</p>}
          {!dirty && d.problems.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {d.problems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
          {!dirty && !d.problems.length && d.approved && !d.changes.length && (
            <p className="text-sm text-ink-muted">The draft matches approved version {d.revision}.</p>
          )}
          {!dirty && d.changes.length > 0 && (
            <>
              <p className="font-semibold">What changes</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {d.changes.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          )}
          {!dirty && (d.changes.length > 0 || !d.approved) && d.impact.length > 0 && (
            <>
              <p className="mt-3 font-semibold">What already tells this story</p>
              <p className="text-sm text-ink-muted">
                Check each still holds. None of them changes by itself: a placed moment keeps the words it was approved with.
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {d.impact.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          )}
          {!dirty && !d.problems.length && (!d.approved || d.changes.length > 0) && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              {d.approved && (
                <Field label="Why it’s changing" className="min-w-0 flex-1 basis-72">
                  <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              )}
              <button
                type="button"
                className={btn.primary}
                disabled={busy || !d.canApprove}
                onClick={async () => {
                  if (await act({ action: "approve-profile", id: d.id, note })) setNote("");
                }}
              >
                <Icon name="circle-check" className="size-4" /> Approve
              </button>
              {!d.canApprove && <span className="text-sm text-ink-muted">{d.steward} is the steward: ask them to approve.</span>}
            </div>
          )}
          {d.revisions.length > 0 && (
            <ol className="mt-4 border-t border-line pt-3 text-sm text-ink-muted">
              {d.revisions.map((r) => (
                <li key={r.number}>
                  Version {r.number} · {dateText(r.approvedAt)}
                  {r.note ? ` · ${r.note}` : ""}
                </li>
              ))}
            </ol>
          )}
        </div>
      </Section>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------

const blankEpisode = (characterId: string) => ({
  episodeId: "",
  title: "",
  whenLabel: "",
  seq: "",
  summary: "",
  changes: "",
  source: "",
  people: [{ characterId, role: "focus" as CastRole }],
});

function TimelineTab({ d, act, busy }: Props) {
  const [form, setForm] = useState<ReturnType<typeof blankEpisode> | null>(null);
  const cast = (id: string) => form?.people.find((p) => p.characterId === id);
  return (
    <>
      <Section
        title="Episodes, in story order"
        hint="An approved episode is shared history. The order is the story’s: an earlier event can be written and published later without changing it."
        aside={
          <button type="button" className={btn.secondary} onClick={() => setForm(blankEpisode(d.id))}>
            <Icon name="plus" className="size-4" /> Propose an episode
          </button>
        }
      >
        <ol className="flex flex-col gap-3">
          {d.episodes.map((e) => (
            <li key={e.id} className={box}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm tabular-nums text-ink-muted">{e.seq}</span>
                <Badge tone={e.status === "approved" ? "good" : e.status === "retired" ? "bad" : "warn"}>{STORY_STATUS[e.status]}</Badge>
                {e.sample && <Badge>Sample</Badge>}
                {e.whenLabel && <span className="text-sm text-ink-muted">{e.whenLabel}</span>}
              </div>
              <p className="mt-1 font-serif text-lg font-semibold">{e.title}</p>
              <p className="mt-1">{e.summary}</p>
              {e.changes && <p className="mt-1 text-sm text-ink-muted">Afterwards: {e.changes}</p>}
              <p className="mt-1 text-sm text-ink-muted">
                With{" "}
                {e.people.map((p) => `${d.cast.find((c) => c.id === p.characterId)?.name ?? p.characterId} (${CAST_ROLES[p.role].toLowerCase()})`).join(", ")}
                {e.source ? ` · ${e.source}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  className={btn.quiet}
                  onClick={() =>
                    setForm({
                      episodeId: e.id,
                      title: e.title,
                      whenLabel: e.whenLabel,
                      seq: String(e.seq),
                      summary: e.summary,
                      changes: e.changes,
                      source: e.source,
                      people: e.people,
                    })
                  }
                >
                  <Icon name="pen" className="size-4" /> Edit
                </button>
                {e.status !== "approved" && (
                  <button
                    type="button"
                    className={btn.quiet}
                    disabled={busy}
                    onClick={() => act({ action: "episode-status", episodeId: e.id, status: "approved" })}
                  >
                    <Icon name="circle-check" className="size-4" /> Approve as shared history
                  </button>
                )}
                {e.status === "approved" && (
                  <button
                    type="button"
                    className={btn.quiet}
                    disabled={busy}
                    onClick={() => act({ action: "episode-status", episodeId: e.id, status: "retired" })}
                  >
                    Retire
                  </button>
                )}
              </div>
            </li>
          ))}
          {!d.episodes.length && <li className={cx(box, "text-ink-muted")}>No episodes yet.</li>}
        </ol>
      </Section>
      {form && (
        <Section title={form.episodeId ? "Edit the episode" : "Propose an episode"}>
          <form
            className={cx(box, "grid gap-3 sm:grid-cols-2")}
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ action: "save-episode", ...form, seq: Number(form.seq) || 0 })) setForm(null);
            }}
          >
            <Field label="Title">
              <input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="When, in the story" hint="In words: “A few weeks later”.">
              <input className={input} value={form.whenLabel} onChange={(e) => setForm({ ...form, whenLabel: e.target.value })} />
            </Field>
            <Field
              label="Place in the story"
              hint={`A number: lower is earlier. So far: ${d.allEpisodes.map((e) => `${e.seq} ${e.title}`).join("; ") || "none"}.`}
              className="sm:col-span-2"
            >
              <input
                className={cx(input, "sm:w-40")}
                inputMode="decimal"
                value={form.seq}
                onChange={(e) => setForm({ ...form, seq: e.target.value })}
                required
              />
            </Field>
            <Field label="Summary" hint="Makes sense on its own, and gives away nothing that comes later." className="sm:col-span-2">
              <textarea className={area} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </Field>
            <Field label="What’s different afterwards">
              <input className={input} value={form.changes} onChange={(e) => setForm({ ...form, changes: e.target.value })} />
            </Field>
            <Field label="Source and approval notes">
              <input className={input} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </Field>
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-semibold">Who’s in it</legend>
              <div className="mt-1 flex flex-col gap-1.5">
                {d.cast.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-3">
                    <label className="flex w-40 items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={Boolean(cast(c.id))}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            people: e.target.checked
                              ? [...form.people, { characterId: c.id, role: "supporting" }]
                              : form.people.filter((p) => p.characterId !== c.id),
                          })
                        }
                      />
                      {c.name}
                    </label>
                    {cast(c.id) && (
                      <select
                        aria-label={`${c.name}’s part`}
                        className={cx(input, "w-48")}
                        value={cast(c.id)!.role}
                        onChange={(e) =>
                          setForm({ ...form, people: form.people.map((p) => (p.characterId === c.id ? { ...p, role: e.target.value as CastRole } : p)) })
                        }
                      >
                        {Object.entries(CAST_ROLES).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
            <div className="flex gap-2 sm:col-span-2">
              <button className={btn.primary} disabled={busy}>
                Save
              </button>
              <button type="button" className={btn.quiet} onClick={() => setForm(null)}>
                Cancel
              </button>
            </div>
          </form>
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function AppearancesTab({ d, act, busy }: Props) {
  const [form, setForm] = useState({
    episodeId: "",
    kind: "topic" as AppearanceKind,
    ref: "",
    pageId: "",
    type: "focus" as CastRole,
    summary: "",
    label: "",
    href: "",
  });
  const places = useApi<Places>("/api/admin/story?view=places").data;
  const guide = places?.guides.find((g) => g.ref === form.ref);
  return (
    <>
      <Section
        title="Where they appear"
        hint="Each appearance links an episode to the Topic, course or page that tells it. A learner’s history only ever lists the ones they’re allowed to open."
      >
        <ul className="flex flex-col gap-3">
          {d.appearances.map((a) => (
            <li key={a.id} className={cx(box, "flex flex-wrap items-center gap-3")}>
              <div className="min-w-0 flex-1 basis-72">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{a.format}</Badge>
                  <Badge tone="info">{CAST_ROLES[a.type]}</Badge>
                  {!a.found && <Badge tone="bad">No longer there</Badge>}
                </div>
                <p className="mt-1 font-semibold">{a.label}</p>
                <p className="text-sm text-ink-muted">
                  Tells “{d.allEpisodes.find((e) => e.id === a.episodeId)?.title ?? a.episodeId}”{a.version ? ` · linked at version ${a.version}` : ""}
                </p>
                {a.summary && <p className="mt-1 text-sm">{a.summary}</p>}
              </div>
              {a.href && (
                <Link href={a.href} className={btn.quiet}>
                  Open
                </Link>
              )}
              <button type="button" className={btn.quiet} disabled={busy} onClick={() => act({ action: "remove-appearance", appearanceId: a.id })}>
                <Icon name="trash" className="size-4" /> Remove
              </button>
            </li>
          ))}
          {!d.appearances.length && <li className={cx(box, "text-ink-muted")}>No appearances linked yet.</li>}
        </ul>
      </Section>
      <Section title="Link an appearance">
        <form
          className={cx(box, "grid gap-3 sm:grid-cols-2")}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: "save-appearance", id: d.id, ...form })) setForm({ ...form, ref: "", pageId: "", summary: "", label: "", href: "" });
          }}
        >
          <Field label="Episode it tells">
            <select className={input} value={form.episodeId} onChange={(e) => setForm({ ...form, episodeId: e.target.value })} required>
              <option value="">Choose…</option>
              {d.allEpisodes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.seq} · {e.title}
                  {e.status === "approved" ? "" : ` (${STORY_STATUS[e.status].toLowerCase()})`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Where">
            <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AppearanceKind, ref: "", pageId: "" })}>
              {Object.entries(FORMATS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {form.kind === "other" ? (
            <>
              <Field label="Name">
                <input className={input} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
              </Field>
              <Field label="Hub path" hint="Starts with a slash: /play/coordinators-day">
                <input className={input} value={form.href} onChange={(e) => setForm({ ...form, href: e.target.value })} required />
              </Field>
            </>
          ) : (
            <Field label={form.kind === "topic" ? "Topic" : "Course"} className={form.kind === "page" ? "" : "sm:col-span-2"}>
              <select className={input} value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value, pageId: "" })} required>
                <option value="">Choose…</option>
                {(form.kind === "topic" ? places?.topics : places?.guides)?.map((t) => (
                  <option key={t.ref} value={t.ref}>
                    {t.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {form.kind === "page" && (
            <Field label="Page">
              <select className={input} value={form.pageId} onChange={(e) => setForm({ ...form, pageId: e.target.value })} required>
                <option value="">Choose…</option>
                {guide?.places
                  .filter((p) => p.id.startsWith("page:"))
                  .map((p) => (
                    <option key={p.id} value={p.id.slice(5)}>
                      {p.label.replace(/: top of the page$/, "")}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label="Their part">
            <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CastRole })}>
              {Object.entries(CAST_ROLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="History summary" hint="What a learner sees in the history. Leave empty to use the episode’s summary.">
            <input className={input} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </Field>
          <div>
            <button className={btn.secondary} disabled={busy}>
              Link
            </button>
          </div>
        </form>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function MomentsTab({ d, act, busy }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<MomentKind>("check_in");
  return (
    <>
      <Section
        title="Story moments"
        hint="What this person says in a Topic or a course: an opening transmission, a return with something new, a response, a debrief, or a later check-in."
      >
        <ul className="flex flex-col gap-3">
          {d.moments.map((m) => (
            <li key={m.id} className={cx(box, "flex flex-wrap items-center gap-3")}>
              <div className="min-w-0 flex-1 basis-72">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">{MOMENT_KINDS[m.kind]}</Badge>
                  <Badge tone={m.status === "approved" ? (m.changed ? "warn" : "good") : m.status === "retired" ? "bad" : "warn"}>
                    {m.status === "approved"
                      ? m.changed
                        ? `Approved v${m.revision}, with unapproved changes`
                        : `Approved v${m.revision}`
                      : STORY_STATUS[m.status]}
                  </Badge>
                  {m.audio !== "none" && (
                    <Badge tone={m.audio === "checked" ? "good" : "warn"}>{m.audio === "checked" ? "Voiced" : "Recording to check"}</Badge>
                  )}
                  {m.sample && <Badge>Sample</Badge>}
                  {!m.speaks && <Badge>Features {d.name}</Badge>}
                </div>
                <Link href={`/admin/characters/moments/${m.id}`} className="mt-1 block font-semibold underline-offset-2 hover:underline">
                  {m.title}
                </Link>
                <p className="text-sm text-ink-muted">
                  {m.placements ? `Placed in ${m.placements} ${m.placements === 1 ? "spot" : "spots"}` : "Not placed anywhere"}
                </p>
              </div>
            </li>
          ))}
          {!d.moments.length && <li className={cx(box, "text-ink-muted")}>None yet.</li>}
        </ul>
      </Section>
      <Section title={`A new moment in ${d.name}’s voice`}>
        <form
          className={cx(box, "flex flex-wrap items-end gap-3")}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act({ action: "save-moment", kind, speakerId: d.id, data: {} });
            if (r?.id) router.push(`/admin/characters/moments/${String(r.id)}`);
          }}
        >
          <Field label="Kind" hint={MOMENT_HINTS[kind]} className="min-w-0 flex-1 basis-80">
            <select className={input} value={kind} onChange={(e) => setKind(e.target.value as MomentKind)}>
              {Object.entries(MOMENT_KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <button className={btn.primary} disabled={busy}>
            Start writing
          </button>
        </form>
      </Section>
    </>
  );
}
