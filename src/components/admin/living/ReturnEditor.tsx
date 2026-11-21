"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx } from "@/lib/format";
import {
  BEAT_KINDS,
  BEATS,
  COHORTS,
  NOTE_CAP,
  NOTE_REASONS,
  NOTE_STATUS,
  reasonText,
  RETURN_PURPOSES,
  RETURN_STATUS,
  THIN,
  type BeatKey,
  type Cohort,
  type NoteData,
  type NoteReason,
  type Placement,
  type ReturnData,
  type ReturnPurpose,
} from "@/lib/living";
import { RETURN_FIELD_LABELS, type LivingProposal, type NoteProposal, type QuestionProposal, type ReturnProposal } from "@/lib/livingAssist";
import { VERDICTS } from "@/lib/magazine";
import { AUDIENCES, type Audience } from "@/lib/story";
import type { ReturnDetail, ReturnOpening } from "@/server/living";
import { ReturnOpeningPanel } from "../../living/ReturnOpening";
import { AdminShell, Badge, btn, ErrorNote, Field, input, statusText, statusTone } from "../ui";
import { Icon } from "../../Icon";
import { area, box, dateText, Section } from "../problems/problemUi";

/*
  One return episode (docs/living-cases.md): the link between an earlier appearance and a later one, the opening a
  learner reads, why each block is on the page, the Field Note that invites people back, and the review.

  Editing here never changes what learners have. They get the copy that was approved, until it is approved again
  or withdrawn. A model can propose a field, a hook or a question; nothing is taken unless the author presses Use,
  and what they take still has to be saved and approved like anything they typed.
*/

type Form = {
  title: string;
  characterId: string;
  themeId: string;
  fromEpisode: string;
  fromGuide: string;
  fromPage: string;
  fromBlock: string;
  toEpisode: string;
  toGuide: string;
  toPage: string;
  toBlock: string;
  owner: string;
  reviewOn: string;
  data: ReturnData;
};
const formOf = (d: ReturnDetail): Form => ({
  title: d.title,
  characterId: d.characterId,
  themeId: d.themeId,
  fromEpisode: d.link.from_episode,
  fromGuide: d.link.from_guide,
  fromPage: d.link.from_page,
  fromBlock: d.link.from_block,
  toEpisode: d.link.to_episode,
  toGuide: d.link.to_guide,
  toPage: d.link.to_page,
  toBlock: d.link.to_block,
  owner: d.owner,
  reviewOn: d.reviewOn,
  data: d.data,
});
const KIND_TONE = { canon: "info", branch: "warn", work: "good" } as const;
const blank = (blockId: string): Placement => ({ blockId, beat: "", does: "", why: "", alternative: "", source: "", reviewer: "", missing: "" });

function Text({ label, hint, value, onChange, rows = 3 }: { label: string; hint?: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold">{label}</span>
      <textarea className={area} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export function ReturnEditor({ id }: { id: string }) {
  const loaded = useApi<ReturnDetail>(`/api/admin/living?id=${encodeURIComponent(id)}`);
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState("");
  const [note, setNote] = useState<NoteData | null>(null);
  const [savedNote, setSavedNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [beat, setBeat] = useState<BeatKey | null>(null);
  const [proposal, setProposal] = useState<LivingProposal | { kind: "none"; reason: string } | null>(null);
  const [asking, setAsking] = useState("");
  const [reason, setReason] = useState("");
  const d = loaded.data;
  // The editor starts from what's saved, once. After that the author's typing is theirs until they save.
  useEffect(() => {
    if (!d || form) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(formOf(d));
    setSaved(JSON.stringify(formOf(d)));
    setNote(d.note.data);
    setSavedNote(JSON.stringify(d.note.data));
  }, [d, form]);

  const back = { href: "/admin/characters/returns", label: "Return episodes" };
  if (loaded.error)
    return (
      <AdminShell title="Return episode" back={back}>
        <ErrorNote text={loaded.error} />
      </AdminShell>
    );
  if (!d || !form || !note)
    return (
      <AdminShell title="Return episode" back={back}>
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );

  const dirty = JSON.stringify(form) !== saved;
  const noteDirty = JSON.stringify(note) !== savedNote;
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const setData = (patch: Partial<ReturnData>) => setForm({ ...form, data: { ...form.data, ...patch } });
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<Record<string, unknown>>("/api/admin/living", { body: { id, ...body } });
      loaded.reload();
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if ((await post({ action: "save", ...form })) !== null) setSaved(JSON.stringify(form));
  };
  const saveNote = async () => {
    if ((await post({ action: "save-note", data: note })) !== null) setSavedNote(JSON.stringify(note));
  };
  const propose = async (kind: "return" | "note" | "question") => {
    setAsking(kind);
    setError(null);
    try {
      setProposal(
        await api<LivingProposal | { kind: "none"; reason: string }>("/api/admin/living", {
          body: { action: "propose", kind, id, title: form.title, data: form.data, note },
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking("");
    }
  };

  const guide = (gid: string) => d.guides.find((g) => g.id === gid);
  const page = (gid: string, pid: string) => guide(gid)?.pages.find((p) => p.id === pid);
  const who = d.characters.find((c) => c.id === form.characterId);
  const episodesFor = d.episodes.filter((e) => !form.characterId || e.people.includes(form.characterId));
  const toEp = d.episodes.find((e) => e.id === form.toEpisode);
  const fromEp = d.episodes.find((e) => e.id === form.fromEpisode);
  const placementOf = (blockId: string) => form.data.placements.find((p) => p.blockId === blockId) ?? blank(blockId);
  const setPlacement = (blockId: string, patch: Partial<Placement>) => {
    const next = { ...placementOf(blockId), ...patch };
    setData({ placements: [...form.data.placements.filter((p) => p.blockId !== blockId), next] });
  };
  const opening = (mine: string | null): ReturnOpening => ({
    id: d.id,
    preview: true,
    character: d.character ? { id: d.character.id, name: d.character.name, portrait: "" } : null,
    whenLabel: toEp?.whenLabel ?? "",
    recap: form.data.recap,
    changed: form.data.changed,
    role: form.data.role,
    decide: form.data.decide,
    mine,
    returning: Boolean(mine),
    earlier: d.earlier && fromEp ? { title: fromEp.title, href: "#" } : null,
    episode: form.toEpisode,
    transferBlock: form.toBlock,
    revisionId: "",
    noteId: "",
  });
  const firstLine = Object.values(form.data.reflections)[0] ?? null;
  const pickedBeat = beat ? d.map.find((m) => m.key === beat) : null;

  return (
    <AdminShell title={form.title || "Return episode"} back={back}>
      <div className="flex flex-wrap items-center gap-2">
        {d.sample && <Badge tone="warn">Sample: fictional pilot material</Badge>}
        <Badge tone={d.status === "approved" ? (d.approved?.changed ? "warn" : "good") : d.status === "withdrawn" ? "bad" : "neutral"}>
          {d.status === "approved" && d.approved?.changed ? "Approved, with unapproved changes" : RETURN_STATUS[d.status]}
        </Badge>
        {d.approved && <span className="text-sm text-ink-muted">Learners have the copy approved {dateText(d.approved.at)}.</span>}
        {d.course && (
          <>
            <Link href={`/admin/magazine/${d.course.id}`} className={btn.quiet}>
              <Icon name="pen" className="size-4" /> Edit the course
            </Link>
            <Link href={`/magazine/draft/${d.course.id}/${d.link.to_page}`} className={btn.quiet}>
              <Icon name="eye" className="size-4" /> Preview the page
            </Link>
          </>
        )}
      </div>
      {d.questionMoved && (
        <p className="mt-3 rounded-2xl border border-gold bg-gold/15 p-3 text-sm">
          The published page now asks a different question from the one this return was approved with. Learning figures are kept apart by question, so nothing
          is mixed, but the return should be looked at and approved again.
        </p>
      )}

      <div className="sticky top-16 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sm">
        <button type="button" className={btn.primary} disabled={busy || !dirty} onClick={save}>
          {dirty ? "Save changes" : "Saved"}
        </button>
        <span role="status" className="text-sm text-ink-muted">
          {dirty ? "You have unsaved changes. Checks and the episode map use what’s saved." : "Checks and the episode map are up to date."}
        </span>
      </div>
      {error && (
        <div className="mt-3">
          <ErrorNote text={error} />
        </div>
      )}
      {proposal?.kind === "none" && (
        <div className="mt-3 rounded-2xl bg-tealtint p-4">
          <p className="font-semibold">Nothing was proposed, and no model was asked</p>
          <p className="mt-1">{proposal.reason}</p>
          <button type="button" className={cx(btn.quiet, "mt-1")} onClick={() => setProposal(null)}>
            Close
          </button>
        </div>
      )}

      <Section title="1. Start and purpose" hint="A return answers a work problem. Start from a response decision if there is one; a return is never required.">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Working title">
            <input className={input} value={form.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Problem desk theme" hint="Optional. Links the return to its response decision and the Signal Room.">
            <select className={input} value={form.themeId} onChange={(e) => set({ themeId: e.target.value })}>
              <option value="">Not linked to a theme</option>
              {d.themes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {d.theme && (
          <div className={cx(box, "mt-3 text-sm")}>
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {d.theme.title}
              <Badge tone={d.theme.decided ? "good" : "warn"}>{d.theme.decided ? "Response decision approved" : "Response decision not approved"}</Badge>
            </p>
            <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-[9rem_1fr]">
              <dt className="font-semibold">Behaviour wanted</dt>
              <dd className="text-ink-muted">{d.theme.desired || "Not recorded"}</dd>
              <dt className="font-semibold">Barrier</dt>
              <dd className="text-ink-muted">{d.theme.barrier || "Not recorded"}</dd>
              <dt className="font-semibold">Work measure</dt>
              <dd className="text-ink-muted">{d.theme.measure || "None named"}</dd>
            </dl>
            <Link href={`/admin/problems/${d.theme.id}`} className="font-semibold text-accent underline underline-offset-2">
              Open the decision
            </Link>
          </div>
        )}
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Field label="What the return is for">
            <select className={input} value={form.data.purpose} onChange={(e) => setData({ purpose: e.target.value as ReturnPurpose })}>
              {Object.entries(RETURN_PURPOSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <div />
          <Text label="Work behaviour wanted" value={form.data.behaviour} onChange={(v) => setData({ behaviour: v })} rows={2} />
          <Text label="Barrier, and how sure anyone is" value={form.data.barrier} onChange={(v) => setData({ barrier: v })} rows={2} />
          <Text
            label="Why a return is useful here"
            hint="And what else was considered. A process fix, a Job Aid or no learning at all can be the better answer."
            value={form.data.why}
            onChange={(v) => setData({ why: v })}
          />
        </div>
      </Section>

      <Section
        title="2. Who it happens to"
        hint="An approved character whose story already connects to the behaviour. A new person, or no returning person, is always allowed."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Returning character">
            <select className={input} value={form.characterId} onChange={(e) => set({ characterId: e.target.value })}>
              <option value="">No returning character</option>
              {d.characters.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.approved}>
                  {c.name} · {c.approved ? `${c.episodes} approved ${c.episodes === 1 ? "episode" : "episodes"}` : "profile not approved"}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Link href="/admin/characters" className={btn.quiet}>
              <Icon name="people" className="size-4" /> Characters and Story Plans, for a new person
            </Link>
          </div>
          <Text
            label="Why this person fits"
            hint="How their approved story connects to the behaviour, and what stays consistent. Not “learners like them”."
            value={form.data.characterFit}
            onChange={(v) => setData({ characterFit: v })}
          />
          {who && d.character?.steward && (
            <p className={cx(box, "text-sm text-ink-muted")}>
              {who.name}’s steward is <strong className="text-ink">{d.character.steward}</strong>. A return for this person is approved by the steward (or any
              learning author, where the steward is a team). A new event in their story is a separate approval, on their Story timeline.
            </p>
          )}
        </div>
      </Section>

      <Section
        title="3. The two episodes and their pages"
        hint="Story order comes from the episodes. The pages are ordinary Magazine pages: a return adds no new page type."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={cx(box, "flex flex-col gap-3")}>
            <p className="font-semibold">Earlier: where learners first met them</p>
            <Field label="Episode">
              <select className={input} value={form.fromEpisode} onChange={(e) => set({ fromEpisode: e.target.value })}>
                <option value="">Choose</option>
                {episodesFor.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                    {!e.approved && " (proposed, not approved)"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Course" hint="Optional. Linking the earlier activity is what makes someone eligible for the Field Note.">
              <select className={input} value={form.fromGuide} onChange={(e) => set({ fromGuide: e.target.value, fromPage: "", fromBlock: "" })}>
                <option value="">None</option>
                {d.guides
                  .filter((g) => g.id !== form.toGuide)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title} ({statusText[g.status] ?? g.status})
                    </option>
                  ))}
              </select>
            </Field>
            {form.fromGuide && (
              <Field label="The earlier decision">
                <select
                  className={input}
                  value={`${form.fromPage}|${form.fromBlock}`}
                  onChange={(e) => {
                    const [p, b] = e.target.value.split("|");
                    set({ fromPage: p ?? "", fromBlock: b ?? "" });
                  }}
                >
                  <option value="|">Choose</option>
                  {guide(form.fromGuide)?.pages.flatMap((p) =>
                    p.decisions.map((b) => (
                      <option key={`${p.id}|${b.id}`} value={`${p.id}|${b.id}`}>
                        {p.title}: {b.label}
                      </option>
                    )),
                  )}
                </select>
              </Field>
            )}
          </div>
          <div className={cx(box, "flex flex-col gap-3")}>
            <p className="font-semibold">The return</p>
            <Field label="Episode">
              <select className={input} value={form.toEpisode} onChange={(e) => set({ toEpisode: e.target.value })}>
                <option value="">Choose</option>
                {episodesFor.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                    {!e.approved && " (proposed, not approved)"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Course">
              <select className={input} value={form.toGuide} onChange={(e) => set({ toGuide: e.target.value, toPage: "", toBlock: "" })}>
                <option value="">Choose</option>
                {d.guides.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title} ({statusText[g.status] ?? g.status})
                  </option>
                ))}
              </select>
            </Field>
            {form.toGuide && (
              <Field label="Page">
                <select className={input} value={form.toPage} onChange={(e) => set({ toPage: e.target.value, toBlock: "" })}>
                  <option value="">Choose</option>
                  {guide(form.toGuide)?.pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {form.toPage && (
              <Field label="The transfer activity" hint="An existing decision question on that page.">
                <select className={input} value={form.toBlock} onChange={(e) => set({ toBlock: e.target.value })}>
                  <option value="">Choose</option>
                  {page(form.toGuide, form.toPage)?.decisions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {d.course && (
              <p className="text-sm text-ink-muted">
                <Badge tone={statusTone(d.course.status)}>{statusText[d.course.status] ?? d.course.status}</Badge>{" "}
                {d.course.published ? "Learners can open this page." : "Not published: nobody can open it yet."}
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section
        title="4. The episode"
        hint="Kept as separate fields so shared story and one learner’s practice are never run together."
        aside={
          <button type="button" className={btn.secondary} disabled={Boolean(asking)} onClick={() => propose("return")}>
            <Icon name="spark" className="size-4" /> {asking === "return" ? "Thinking…" : "Propose the opening"}
          </button>
        }
      >
        {proposal?.kind === "return" && (
          <OpeningProposal p={proposal} take={(field, text) => setData({ [field]: text } as Partial<ReturnData>)} close={() => setProposal(null)} />
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          <Text
            label="Where we left this person"
            hint="Two sentences, safe to read without the first story, and giving nothing away that comes later."
            value={form.data.recap}
            onChange={(v) => setData({ recap: v })}
          />
          <Text
            label="What has changed"
            hint="One approved development. If it’s new, it needs an approved episode first."
            value={form.data.changed}
            onChange={(v) => setData({ changed: v })}
          />
          <Text label="The learner’s role" value={form.data.role} onChange={(v) => setData({ role: v })} rows={2} />
          <Text label="Whose view it’s told from" value={form.data.perspective} onChange={(v) => setData({ perspective: v })} rows={2} />
          <Text
            label="What the learner must decide"
            hint="With the information they have now."
            value={form.data.decide}
            onChange={(v) => setData({ decide: v })}
          />
          <Text
            label="What each choice leads to"
            hint="Feedback on one learner’s attempt. It never becomes what happened to the person."
            value={form.data.consequences}
            onChange={(v) => setData({ consequences: v })}
          />
          <Text
            label="A next event, if one is proposed"
            hint="A proposal for the shared story. It is not canon until a steward approves it as an episode, and nothing here does that."
            value={form.data.nextEvent}
            onChange={(v) => setData({ nextEvent: v })}
            rows={2}
          />
          <Text label="Next action at work" value={form.data.workAction} onChange={(v) => setData({ workAction: v })} rows={2} />
        </div>
      </Section>

      <Section
        title="5. A different question"
        hint="The return has to ask for a new judgement. Repeating the first question tests memory of the story."
        aside={
          <button type="button" className={btn.secondary} disabled={Boolean(asking)} onClick={() => propose("question")}>
            <Icon name="spark" className="size-4" /> {asking === "question" ? "Thinking…" : "Propose an alternate question"}
          </button>
        }
      >
        {proposal?.kind === "question" && (
          <QuestionDraft
            p={proposal}
            apply={async () => {
              if (
                !(await confirmAction(
                  "This replaces the wording, options and feedback of the transfer activity in the course’s draft. Learners keep the published version until the course is published again.",
                  { confirmLabel: "Use this question" },
                ))
              )
                return;
              if ((await post({ action: "apply-question", question: proposal })) !== null) setProposal(null);
            }}
            close={() => setProposal(null)}
          />
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {[
            { label: "The first question", q: d.first, none: "No earlier activity is linked." },
            { label: "The return’s question", q: d.second, none: "No transfer activity is chosen." },
          ].map((x) => (
            <div key={x.label} className={box}>
              <p className="text-sm font-semibold text-ink-muted">{x.label}</p>
              {x.q ? (
                <>
                  <p className="mt-1 font-semibold">{x.q.prompt}</p>
                  <ul className="mt-1 flex flex-col gap-1 text-sm">
                    {x.q.choices.map((c) => (
                      <li key={c.id}>
                        <Badge tone={c.verdict === "best" ? "good" : c.verdict === "risky" ? "warn" : "neutral"}>
                          {VERDICTS[c.verdict as keyof typeof VERDICTS] ?? c.verdict}
                        </Badge>{" "}
                        {c.text}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-1 text-ink-muted">{x.none}</p>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Text label="Shared principle" value={form.data.principle} onChange={(v) => setData({ principle: v })} rows={2} />
          <Text
            label="New work cues"
            hint="What looks different about this situation at work."
            value={form.data.cues}
            onChange={(v) => setData({ cues: v })}
            rows={2}
          />
          <Text label="Different plausible mistake" value={form.data.mistake} onChange={(v) => setData({ mistake: v })} rows={2} />
          <Text label="What would count as transfer" value={form.data.transfer} onChange={(v) => setData({ transfer: v })} rows={2} />
          <Text
            label="Approved response criteria"
            hint="What makes an answer the best one, and who confirmed it. The activity owns any scoring; this page is practice unless the course says otherwise."
            value={form.data.criteria}
            onChange={(v) => setData({ criteria: v })}
          />
        </div>
        {d.first && (
          <div className="mt-4">
            <h3 className="font-semibold">A private line for a returning learner</h3>
            <p className="text-sm text-ink-muted">
              Shown only to the person who made that choice the first time, marked as theirs. It never changes the page for anyone else, and someone with no
              earlier answer sees the same page without it.
            </p>
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              {d.first.choices.map((c) => (
                <Text
                  key={c.id}
                  label={`If they chose: “${c.text}”`}
                  value={form.data.reflections[c.id] ?? ""}
                  onChange={(v) => setData({ reflections: { ...form.data.reflections, [c.id]: v } })}
                  rows={2}
                />
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section
        title="6. Why this block here?"
        hint="Every block on the return page, as the Hub has it. What a block can and can’t show comes from the block registry; the reason is yours."
        aside={
          d.reportLink ? (
            <Link href={d.reportLink} className={btn.secondary}>
              <Icon name="gauge" className="size-4" /> View current scored outcomes and data
            </Link>
          ) : undefined
        }
      >
        {!d.blocks.length ? (
          <p className={box}>Choose and save the return page to list its blocks.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {d.blocks.map((b) => {
              const p = placementOf(b.id);
              return (
                <li key={b.id} className={box}>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{b.label}</span>
                    <span className="font-mono text-xs text-ink-muted">{b.id}</span>
                    {!b.known && <Badge tone="bad">Needs implementation: not a block the Hub has</Badge>}
                    {b.evidence && <Badge tone="info">Evidence: {b.evidence}</Badge>}
                  </p>
                  {b.known && (
                    <p className="mt-1 text-sm text-ink-muted">
                      With this kind of block a learner: {b.does.toLowerCase()}. Records: {b.events.join(", ") || "nothing"} ({b.visibility}). It can’t
                      establish: {b.cannot.toLowerCase()}
                      {b.signoff && ` Sign-off: ${b.signoff}.`}
                    </p>
                  )}
                  <div className="mt-2 grid gap-3 lg:grid-cols-3">
                    <Field label="Story beat">
                      <select className={input} value={p.beat} onChange={(e) => setPlacement(b.id, { beat: e.target.value as BeatKey | "" })}>
                        <option value="">Not on the map</option>
                        {(Object.keys(BEATS) as BeatKey[]).map((k) => (
                          <option key={k} value={k}>
                            {BEATS[k].label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="What the learner does here" className="lg:col-span-2">
                      <input className={input} value={p.does} onChange={(e) => setPlacement(b.id, { does: e.target.value })} />
                    </Field>
                    <label className="flex flex-col gap-1 lg:col-span-3">
                      <span className="text-sm font-semibold">Why this block fits the behaviour and the barrier</span>
                      <textarea className={area} rows={2} value={p.why} onChange={(e) => setPlacement(b.id, { why: e.target.value })} />
                    </label>
                    <Field label="A credible alternative">
                      <input className={input} value={p.alternative} onChange={(e) => setPlacement(b.id, { alternative: e.target.value })} />
                    </Field>
                    <Field label="Approved source or canon">
                      <input className={input} value={p.source} onChange={(e) => setPlacement(b.id, { source: e.target.value })} />
                    </Field>
                    <Field label="Reviewer">
                      <input className={input} value={p.reviewer} onChange={(e) => setPlacement(b.id, { reviewer: e.target.value })} />
                    </Field>
                    <Field label="Missing inputs" className="lg:col-span-3">
                      <input className={input} value={p.missing} onChange={(e) => setPlacement(b.id, { missing: e.target.value })} />
                    </Field>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title="7. Episode map"
        hint="From what’s saved. Each beat says whether it is shared story or one learner’s practice. Not every case has every beat."
      >
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          {d.map.map((m, i) => {
            const there = Boolean(m.text) || m.blocks.length > 0;
            return (
              <li key={m.key}>
                <button
                  type="button"
                  aria-pressed={beat === m.key}
                  onClick={() => setBeat(beat === m.key ? null : m.key)}
                  className={cx(
                    "flex h-full w-full flex-col gap-1 rounded-2xl border p-3 text-left transition",
                    beat === m.key ? "border-action ring-1 ring-action" : "border-line hover:border-line-strong",
                    there ? "bg-surface" : "border-dashed bg-muted text-ink-muted",
                  )}
                >
                  <span className="text-xs font-semibold text-ink-muted">Step {i + 1}</span>
                  <span className="font-semibold leading-snug">{m.label}</span>
                  <span className="self-start">
                    <Badge tone={KIND_TONE[m.kind]}>{BEAT_KINDS[m.kind]}</Badge>
                  </span>
                  <span className="text-sm text-ink-muted">
                    {there
                      ? `${m.blocks.length} ${m.blocks.length === 1 ? "block" : "blocks"}${m.moments.length ? `, ${m.moments.length} story moment` : ""}`
                      : "Not in this case"}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {pickedBeat && (
          <div className={cx(box, "mt-3")}>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{pickedBeat.label}</span>
              <Badge tone={KIND_TONE[pickedBeat.kind]}>{BEAT_KINDS[pickedBeat.kind]}</Badge>
            </p>
            <p className="text-sm text-ink-muted">{pickedBeat.hint}</p>
            {pickedBeat.text && <p className="mt-2">{pickedBeat.text}</p>}
            {pickedBeat.blocks.length > 0 && (
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {pickedBeat.blocks.map((b) => (
                  <li key={b.id}>
                    <span className="font-semibold">{b.label}</span>
                    {b.evidence && <span className="text-ink-muted"> · produces: {b.evidence.toLowerCase()}</span>}
                    <span className="block text-ink-muted">{b.why}</span>
                    {b.source && <span className="block text-ink-muted">Source: {b.source}</span>}
                  </li>
                ))}
              </ul>
            )}
            {pickedBeat.moments.map((m) => (
              <p key={m.id} className="mt-2 text-sm">
                <Link href={`/admin/characters/moments/${m.id}`} className="font-semibold text-accent underline underline-offset-2">
                  {m.title || "Story moment"}
                </Link>{" "}
                <Badge tone={m.approved ? "good" : "warn"}>{m.approved ? "Approved" : "Not approved"}</Badge>
                {m.hypothetical && <span className="text-ink-muted"> One possible response in a learner’s practice.</span>}
                <span className="block text-ink-muted">“{m.text}”</span>
              </p>
            ))}
            {pickedBeat.key === "response" && !pickedBeat.moments.length && (
              <p className="mt-2 text-sm text-ink-muted">
                No story moment is placed on this page. Approve the person’s response in{" "}
                <Link href="/admin/characters" className="font-semibold text-accent underline underline-offset-2">
                  Characters and stories
                </Link>{" "}
                and place it there.
              </p>
            )}
          </div>
        )}
      </Section>

      <Section
        title="8. Field Note"
        hint="A quiet, optional invitation back, in the Hub only. One per person for this return; a person gets at most one Field Note of any kind in the cap period."
        aside={
          <button type="button" className={btn.secondary} disabled={Boolean(asking)} onClick={() => propose("note")}>
            <Icon name="spark" className="size-4" /> {asking === "note" ? "Thinking…" : "Propose a hook"}
          </button>
        }
      >
        {proposal?.kind === "note" && <HookDraft p={proposal} take={(hook) => setNote({ ...note, hook })} close={() => setProposal(null)} />}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={cx(box, "flex flex-col gap-3")}>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">The note</span>
              <Badge tone={d.note.status === "live" ? (d.note.changed ? "warn" : "good") : d.note.status === "withdrawn" ? "bad" : "neutral"}>
                {d.note.status === "live" && d.note.changed ? "Released, with unreleased changes" : NOTE_STATUS[d.note.status]}
              </Badge>
            </p>
            <Field label="Why it’s relevant">
              <select className={input} value={note.reason} onChange={(e) => setNote({ ...note, reason: e.target.value as NoteReason })}>
                {(Object.keys(NOTE_REASONS) as NoteReason[]).map((k) => (
                  <option key={k} value={k}>
                    {reasonText(k, d.character?.name ?? "")}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">One-line hook</span>
              <textarea className={area} rows={2} maxLength={200} value={note.hook} onChange={(e) => setNote({ ...note, hook: e.target.value })} />
              <span className="text-xs text-ink-muted">
                {note.hook.length} of 160. It may be read on a shared screen, so it never mentions what the learner answered.
              </span>
            </label>
            <fieldset>
              <legend className="text-sm font-semibold">Who it goes to</legend>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {(Object.keys(AUDIENCES) as Audience[]).map((a) => (
                  <label key={a} className="inline-flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={note.audience.includes(a)}
                      onChange={(e) => setNote({ ...note, audience: e.target.checked ? [...note.audience, a] : note.audience.filter((x) => x !== a) })}
                    />
                    {AUDIENCES[a]}
                  </label>
                ))}
              </div>
              <span className="text-xs text-ink-muted">
                None ticked: everyone the course is shared with. Only ever people who answered the earlier decision.
              </span>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Days after the earlier decision">
                <input
                  type="number"
                  min={0}
                  max={180}
                  className={input}
                  value={note.delayDays}
                  onChange={(e) => setNote({ ...note, delayDays: Number(e.target.value) })}
                />
              </Field>
              <Field label="About how long (min)">
                <input
                  type="number"
                  min={1}
                  max={60}
                  className={input}
                  value={note.minutes}
                  onChange={(e) => setNote({ ...note, minutes: Number(e.target.value) })}
                />
              </Field>
              <Field label="Goes quiet after (days)">
                <input
                  type="number"
                  min={7}
                  max={365}
                  className={input}
                  value={note.expiresDays}
                  onChange={(e) => setNote({ ...note, expiresDays: Number(e.target.value) })}
                />
              </Field>
            </div>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="font-semibold">Trigger</dt>
              <dd className="text-ink-muted">Answering the earlier decision. The delay runs from their first answer.</dd>
              <dt className="font-semibold">Delivery</dt>
              <dd className="text-ink-muted">
                In the Hub only: the Field Notes panel and the Inbox. No email, SMS or push. It arrives when the person next uses the Hub after it falls due.
              </dd>
              <dt className="font-semibold">Frequency cap</dt>
              <dd className="text-ink-muted">
                {NOTE_CAP.count} Field Note per person in {NOTE_CAP.days} days, across every note. A second waits its turn.
              </dd>
              <dt className="font-semibold">Required?</dt>
              <dd className="text-ink-muted">No. Assigning something is a separate decision made elsewhere.</dd>
              <dt className="font-semibold">Not sent to</dt>
              <dd className="text-ink-muted">Anyone who has already answered the return, or who can’t open its page.</dd>
            </dl>
            {d.note.problems.length > 0 && (
              <ul className="list-disc pl-5 text-sm">
                {d.note.problems.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn.secondary} disabled={busy || !noteDirty} onClick={saveNote}>
                {noteDirty ? "Save the note" : "Note saved"}
              </button>
              {d.note.status !== "live" || d.note.changed ? (
                <button
                  type="button"
                  className={btn.primary}
                  disabled={busy || noteDirty || !d.note.id}
                  onClick={async () => {
                    if (
                      await confirmAction(
                        "Release this note? People who have answered the earlier decision will get it in the Hub once it falls due. Nothing is emailed.",
                        { confirmLabel: "Release" },
                      )
                    )
                      await post({ action: "release-note" });
                  }}
                >
                  {d.note.status === "live" ? "Release the changes" : "Release the note"}
                </button>
              ) : null}
            </div>
            {d.note.status === "live" && (
              <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
                <Field label="Withdraw it, with a reason" className="min-w-56 flex-1">
                  <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
                <button
                  type="button"
                  className={btn.danger}
                  disabled={busy || reason.trim().length < 10}
                  onClick={async () => (await post({ action: "withdraw-note", reason })) !== null && setReason("")}
                >
                  Withdraw the note
                </button>
              </div>
            )}
            {d.note.status === "withdrawn" && d.note.withdrawnReason && <p className="text-sm text-ink-muted">Withdrawn: {d.note.withdrawnReason}</p>}
            {d.note.deliveries && (
              <p className="text-sm">
                <strong>So far:</strong> {d.note.deliveries.eligible} became eligible, {d.note.deliveries.delivered} received it, {d.note.deliveries.opened}{" "}
                opened it, {d.note.deliveries.dismissed} dismissed it.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <p className="font-semibold">What a learner gets</p>
            <div className="rounded-2xl bg-muted p-4 ring-1 ring-line">
              <p className="font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-accent">
                {reasonText(note.reason, d.character?.name ?? "")}
              </p>
              <p className="mt-1 font-serif text-lg font-semibold">{d.course?.title ?? form.title}</p>
              <p className="mt-1">{note.hook || "The hook goes here."}</p>
              <p className="mt-2 text-sm text-ink-muted">About {note.minutes} min · Optional</p>
            </div>
            <p className="text-sm font-semibold">Opening the page, having answered the first story</p>
            <ReturnOpeningPanel opening={opening(firstLine)} />
            <p className="text-sm font-semibold">Opening the page, new to this person</p>
            <ReturnOpeningPanel opening={{ ...opening(null), earlier: null }} />
          </div>
        </div>
      </Section>

      <Section
        title="9. Review and approve"
        hint="Approval pins the character’s profile version, the two episodes and the question as they are now. Learners get that copy."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div className={box}>
            <p className="font-semibold">{d.problems.blocking.length ? "Before it can be approved" : "Nothing is blocking approval"}</p>
            {d.problems.blocking.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {d.problems.blocking.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            {d.problems.warnings.length > 0 && (
              <>
                <p className="mt-3 text-sm font-semibold text-ink-muted">For the reviewer to look at</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-ink-muted">
                  {d.problems.warnings.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className={cx(box, "flex flex-col gap-3")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Owner">
                <input className={input} value={form.owner} onChange={(e) => set({ owner: e.target.value })} />
              </Field>
              <Field label="Review on">
                <input type="date" className={input} value={form.reviewOn} onChange={(e) => set({ reviewOn: e.target.value })} />
              </Field>
            </div>
            <p className="text-sm text-ink-muted">
              Who checks what: the character steward for continuity and any new shared event; Quality and the operational owner for work claims, answer criteria
              and feedback; the publisher for audience, spoilers and the note. Approving here does not publish the course.
            </p>
            <div className="flex flex-wrap gap-2">
              {d.status !== "withdrawn" && (
                <button
                  type="button"
                  className={btn.primary}
                  disabled={busy || dirty || !d.canApprove || d.problems.blocking.length > 0}
                  onClick={() => post({ action: "approve" })}
                  title={!d.canApprove ? "Only the steward or a superadmin can approve this" : dirty ? "Save your changes first" : undefined}
                >
                  {d.approved ? "Approve again" : "Approve the return"}
                </button>
              )}
              {d.status === "withdrawn" && (
                <button type="button" className={btn.secondary} disabled={busy} onClick={() => post({ action: "reopen" })}>
                  Reopen as a draft
                </button>
              )}
            </div>
            {!d.canApprove && (
              <p className="text-sm text-ink-muted">Only {d.character?.steward || "the steward"} or a superadmin can approve a return for this character.</p>
            )}
            {d.status === "approved" && (
              <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
                <Field label="Withdraw the return, with a reason" className="min-w-56 flex-1">
                  <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
                <button
                  type="button"
                  className={btn.danger}
                  disabled={busy || reason.trim().length < 10}
                  onClick={async () => {
                    if (
                      await confirmAction(
                        "Withdraw this return? Its opening stops showing on the page and its Field Note is taken back. Completions and answers are untouched.",
                        { confirmLabel: "Withdraw", danger: true },
                      )
                    )
                      if ((await post({ action: "withdraw", reason })) !== null) setReason("");
                  }}
                >
                  Withdraw
                </button>
              </div>
            )}
          </div>
        </div>
        {d.evidence && d.evidence.versions.length > 0 && (
          <div className={cx(box, "mt-3")}>
            <p className="font-semibold">What the Hub’s records show so far</p>
            <p className="text-sm text-ink-muted">First answers on the return’s question. Unscored practice: not an assessed result, and not a work result.</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {d.evidence.versions.flatMap((v) =>
                (Object.keys(COHORTS) as Cohort[]).map((k) => (
                  <li key={`${v.revisionId}-${k}`}>
                    Version {v.revision}, {COHORTS[k].toLowerCase()}: <strong>{v.cohorts[k].n}</strong>{" "}
                    {v.cohorts[k].n < THIN ? `(fewer than ${THIN}: no split shown)` : `· ${v.cohorts[k].first.best} chose the best answer first`}
                  </li>
                )),
              )}
            </ul>
            {d.reportLink && (
              <Link href={d.reportLink} className="mt-2 inline-flex min-h-10 items-center font-semibold text-accent underline underline-offset-2">
                The full figures, in the Signal Room
              </Link>
            )}
          </div>
        )}
      </Section>
    </AdminShell>
  );
}

const panel = "mb-3 flex flex-col gap-3 rounded-2xl bg-tealtint p-4";
const row = "rounded-xl bg-surface p-3 ring-1 ring-line";
function Dropped({ dropped, missing = [] }: { dropped: string[]; missing?: string[] }) {
  return (
    <>
      {missing.length > 0 && (
        <div className="text-sm">
          <p className="font-semibold">Still needed from an owner</p>
          <ul className="list-disc pl-5">
            {missing.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {dropped.length > 0 && (
        <div className="text-sm">
          <p className="font-semibold">Taken out before you saw it</p>
          <ul className="list-disc pl-5">
            {dropped.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
const Head = ({ close }: { close: () => void }) => (
  <div className="flex flex-wrap items-center justify-between gap-2">
    <p className="font-semibold">An AI draft, for you to take or leave a piece at a time. Nothing has been saved.</p>
    <button type="button" className={btn.quiet} onClick={close}>
      Close
    </button>
  </div>
);

function OpeningProposal({ p, take, close }: { p: ReturnProposal; take: (field: string, text: string) => void; close: () => void }) {
  const [used, setUsed] = useState<string[]>([]);
  return (
    <div className={panel}>
      <Head close={close} />
      {p.rationale && <p className="text-sm">{p.rationale}</p>}
      {!p.fields.length && <p>Nothing usable came back.</p>}
      {p.fields.map((f) => (
        <div key={f.field} className={row}>
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {RETURN_FIELD_LABELS[f.field]}
            {f.needsSource && <Badge tone="warn">States a rule: needs an approved source</Badge>}
          </p>
          <p className="mt-1">{f.text}</p>
          <button
            type="button"
            className={cx(btn.quiet, "mt-1")}
            disabled={used.includes(f.field)}
            onClick={() => {
              take(f.field, f.text);
              setUsed([...used, f.field]);
            }}
          >
            {used.includes(f.field) ? "In the editor: save to keep it" : "Use this field"}
          </button>
        </div>
      ))}
      <div className="text-sm">
        <p className="font-semibold">What it leaned on</p>
        {p.used.length ? (
          <ul className="list-disc pl-5">
            {p.used.map((u) => (
              <li key={u.ref}>
                {u.character}
                {u.episode ? " (episode)" : `, profile version ${u.revision}`}: {u.text}
              </li>
            ))}
          </ul>
        ) : (
          <p>It cited no approved fact. Read it as unsupported.</p>
        )}
      </div>
      <Dropped dropped={p.dropped} missing={p.missing} />
    </div>
  );
}

function HookDraft({ p, take, close }: { p: NoteProposal; take: (hook: string) => void; close: () => void }) {
  return (
    <div className={panel}>
      <Head close={close} />
      {!p.hooks.length && <p>Nothing usable came back.</p>}
      {p.hooks.map((h) => (
        <div key={h} className={row}>
          <p>{h}</p>
          <button type="button" className={cx(btn.quiet, "mt-1")} onClick={() => take(h)}>
            Use this hook
          </button>
        </div>
      ))}
      <Dropped dropped={p.dropped} />
    </div>
  );
}

function QuestionDraft({ p, apply, close }: { p: QuestionProposal; apply: () => void; close: () => void }) {
  return (
    <div className={panel}>
      <Head close={close} />
      {p.rationale && <p className="text-sm">{p.rationale}</p>}
      {p.prompt ? (
        <div className={row}>
          {p.context && <p className="text-sm text-ink-muted">{p.context}</p>}
          <p className="font-semibold">{p.prompt}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {p.choices.map((c) => (
              <li key={c.id}>
                <Badge tone={c.verdict === "best" ? "good" : c.verdict === "risky" ? "warn" : "neutral"}>{VERDICTS[c.verdict]}</Badge> {c.text}
                {c.needsSource && (
                  <>
                    {" "}
                    <Badge tone="warn">States a rule: needs an approved source</Badge>
                  </>
                )}
                <span className="block text-sm text-ink-muted">{c.feedback}</span>
              </li>
            ))}
          </ul>
          <button type="button" className={cx(btn.secondary, "mt-2")} onClick={apply}>
            Use this as the transfer question
          </button>
          <p className="mt-1 text-xs text-ink-muted">
            Changes only that one activity in the course’s draft. Quality still confirms the criteria and every line of feedback.
          </p>
        </div>
      ) : (
        <p>The draft was turned away, so no question is offered.</p>
      )}
      <Dropped dropped={p.dropped} missing={p.missing} />
    </div>
  );
}
