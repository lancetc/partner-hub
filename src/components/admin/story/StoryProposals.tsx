"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { BLOCK_LABELS } from "@/lib/magazine";
import { BEAT_KINDS, BEAT_PROMPTS, type Beat, type MomentData, type PlanData, type TransmissionBeats } from "@/lib/story";
import {
  CONCERN_KINDS,
  PLAN_TEXT_FIELDS,
  type ContinuityProposal,
  type EpisodeProposal,
  type PlanProposal,
  type Proposal,
  type ProposedBeat,
  type ScriptProposal,
  type UsedFact,
} from "@/lib/storyAssist";
import { Badge, btn, ErrorNote } from "../ui";
import { Icon } from "../../Icon";

/*
  AI proposals in the Story Plan screens (docs/story-plans.md, step 6). A proposal is shown beside what the author
  already has, a piece at a time. Nothing is taken unless the author presses Use, and what they take lands in the
  editor like anything they typed: it still has to be saved, and an episode or a script still has to be approved.
*/

/** Asks for one proposal and holds it until the author is finished with it. */
export function useProposal<T extends Proposal>() {
  const [proposal, setProposal] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      setProposal(await api<T>("/api/admin/story", { body: { action: "propose", ...body } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nothing could be proposed.");
    } finally {
      setBusy(false);
    }
  };
  return { proposal, busy, error, ask, clear: () => setProposal(null) };
}

const panel = "flex flex-col gap-3 rounded-2xl bg-tealtint p-4";
const row = "rounded-xl bg-surface p-3 ring-1 ring-line";

export function ProposeButton({ busy, onClick, children, disabled }: { busy: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={btn.secondary} disabled={busy || disabled} onClick={onClick}>
      <Icon name="spark" className="size-4" /> {busy ? "Thinking…" : children}
    </button>
  );
}

/** What a proposal leaned on, what is still missing, and what was taken out of it. */
function Grounds({ used, missing, dropped, guidance = [] }: { used: UsedFact[]; missing: string[]; dropped: string[]; guidance?: string[] }) {
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <p className="font-semibold">Approved facts it used</p>
        {used.length ? (
          <ul className="mt-1 flex flex-col gap-1">
            {used.map((u) => (
              <li key={u.ref}>
                {u.text} <span className="text-ink-muted">({origin(u)})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-ink-muted">None cited. Read it as unsupported until you’ve checked it against the profiles.</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {guidance.length > 0 && (
          <div>
            <p className="font-semibold">States work guidance: needs an approved source, or to go</p>
            <ul className="mt-1 list-disc pl-5">
              {guidance.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        )}
        {missing.length > 0 && (
          <div>
            <p className="font-semibold">Needs author or source</p>
            <ul className="mt-1 list-disc pl-5">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {dropped.length > 0 && (
          <div>
            <p className="font-semibold">Taken out, because it isn’t on the Hub’s lists</p>
            <ul className="mt-1 list-disc pl-5 text-ink-muted">
              {dropped.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** Where a cited fact or episode comes from, in words. */
const origin = (u: UsedFact) => (u.episode ? "an approved episode" : `${u.character}, profile version ${u.revision}`);
/** A model's sentence without the ids it cited in square brackets: the citation is shown beside it instead. */
const plain = (s: string) => s.replace(/\s?\[[\w:-]{2,60}\]/g, "");

function Header({ title, note, onClose }: { title: string; note?: string; onClose: () => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-ink-muted">
          {note ?? "A proposal from the approved story. Take what helps, a piece at a time. Nothing changes until you press Use, and then Save."}
        </p>
      </div>
      <button type="button" className={btn.quiet} onClick={onClose}>
        Discard
      </button>
    </div>
  );
}

/** One field: what's there now, what's proposed, and a button to take it. */
function Swap({ label, now, next, onUse }: { label: string; now: string; next: string; onUse: () => void }) {
  const same = now.trim() === next.trim();
  return (
    <div className={row}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        {same ? (
          <Badge tone="good">In use</Badge>
        ) : (
          <button type="button" className={btn.secondary} onClick={onUse}>
            Use
          </button>
        )}
      </div>
      {!same && now && <p className="mt-1 text-sm text-ink-muted">Now: {now}</p>}
      <p className="mt-1 whitespace-pre-wrap">{next}</p>
    </div>
  );
}

const PLAN_LABELS: Record<(typeof PLAN_TEXT_FIELDS)[number], string> = {
  perspective: "Perspective",
  tension: "Tension",
  decision: "Learner decision",
  effect: "Immediate and later effect",
  transfer: "Transfer",
  checkin: "Suggested check-in",
  ava: "Ava moments",
};
const asBeat = (b: ProposedBeat, id: string): Beat => ({
  id,
  kind: b.kind,
  text: b.text,
  characterId: b.characterId,
  episodeId: b.episodeId,
  action: b.action,
  source: b.source,
  blocks: b.blocks,
  evidence: b.evidence,
  hypothetical: b.hypothetical,
  momentIds: [],
});

export function PlanProposalPanel({
  p,
  x,
  setX,
  names,
  onClose,
}: {
  p: PlanProposal;
  x: PlanData;
  setX: (next: PlanData) => void;
  names: Map<string, string>;
  onClose: () => void;
}) {
  const fresh = () => `beat${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const anchorName = p.anchorId === "new" ? "A new character" : p.anchorId ? (names.get(p.anchorId) ?? p.anchorId) : "No continuing character";
  return (
    <div className={panel}>
      <Header title="A proposed plan" onClose={onClose} />
      {p.anchorOffered && (
        <div className={row}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Who it happens to: {anchorName}</p>
            {x.anchorId === p.anchorId ? (
              <Badge tone="good">In use</Badge>
            ) : (
              <button type="button" className={btn.secondary} onClick={() => setX({ ...x, anchorId: p.anchorId })}>
                Use
              </button>
            )}
          </div>
          {p.anchorWhy && <p className="mt-1 text-sm">{p.anchorWhy}</p>}
        </div>
      )}
      {PLAN_TEXT_FIELDS.filter((k) => p.fields[k]).map((k) => (
        <Swap key={k} label={PLAN_LABELS[k]} now={x[k]} next={p.fields[k]!} onUse={() => setX({ ...x, [k]: p.fields[k]! })} />
      ))}
      <div className={row}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Beats ({p.beats.length})</p>
          <button
            type="button"
            className={btn.secondary}
            onClick={() => setX({ ...x, beats: p.beats.map((b) => asBeat(b, fresh())) })}
            title="Your own beats are replaced. Undo by not saving."
          >
            Replace my beats with these
          </button>
        </div>
        <ol className="mt-2 flex flex-col gap-2">
          {p.beats.map((b) => (
            <li key={b.id} className="rounded-lg bg-muted p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">{BEAT_KINDS[b.kind]}</Badge>
                {b.characterId && <Badge>{names.get(b.characterId) ?? b.characterId}</Badge>}
                {b.hypothetical && <Badge>Depends on the learner’s choice: never shared story</Badge>}
                {b.guidance && <Badge tone="warn">Relies on work guidance: name its source</Badge>}
                <button type="button" className={cx(btn.quiet, "ml-auto")} onClick={() => setX({ ...x, beats: [...x.beats, asBeat(b, fresh())] })}>
                  <Icon name="plus" className="size-4" /> Add this beat
                </button>
              </div>
              <p className="mt-1.5">{b.text}</p>
              {b.action && (
                <p className="mt-1">
                  <span className="text-ink-muted">The learner: </span>
                  {b.action}
                </p>
              )}
              {b.blocks.length > 0 && (
                <p className="mt-1">
                  <span className="text-ink-muted">Blocks: </span>
                  {b.blocks.map((t) => BLOCK_LABELS[t as keyof typeof BLOCK_LABELS] ?? t).join(", ")}
                </p>
              )}
              {b.why && (
                <p className="mt-1 text-ink-muted">
                  <span className="font-semibold">Why here: </span>
                  {b.why}
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>
      <Grounds used={p.used} missing={p.missing} dropped={p.dropped} />
    </div>
  );
}

export function ContinuityPanel({ p, beats, onClose }: { p: ContinuityProposal; beats: Beat[]; onClose: () => void }) {
  const where = (id: string) => {
    const i = beats.findIndex((b) => b.id === id);
    return i < 0 ? "The plan as a whole" : `Beat ${i + 1}: ${BEAT_KINDS[beats[i].kind]}`;
  };
  return (
    <div className={panel}>
      <Header
        title="A second look at continuity"
        note="A second reader’s view of the plan against the approved story. Nothing here changes the plan: edit the beats yourself where you agree."
        onClose={onClose}
      />
      {p.concerns.length ? (
        <ol className="flex flex-col gap-2">
          {p.concerns.map((c, i) => (
            <li key={i} className={row}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="warn">{CONCERN_KINDS[c.kind]}</Badge>
                <span className="text-ink-muted">{where(c.beatId)}</span>
              </div>
              <p className="mt-1.5">{plain(c.text)}</p>
              {c.fact && (
                <p className="mt-1 text-sm text-ink-muted">
                  {c.fact.episode ? "Approved episode" : "Approved fact"}: {c.fact.text} ({origin(c.fact)})
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className={row}>It found nothing to raise. That is one reader’s view, not a clearance: the checks above still apply.</p>
      )}
      <p className="text-sm text-ink-muted">These are a second reader’s suggestions. They don’t hold anything up, and they aren’t recorded against the plan.</p>
      {p.dropped.length > 0 && <Grounds used={[]} missing={[]} dropped={p.dropped} />}
    </div>
  );
}

export function ScriptProposalPanel({ p, x, setX, onClose }: { p: ScriptProposal; x: MomentData; setX: (next: MomentData) => void; onClose: () => void }) {
  const beats = p.beats;
  const all = () =>
    setX({
      ...x,
      ...(beats ? { beats } : { text: p.text }),
      ...(p.nextAction && { nextAction: p.nextAction }),
      ...(p.newInfo && { newInfo: p.newInfo }),
      ...(p.questions.length && { questions: p.questions.map((q, i) => ({ ...q, id: `q${Date.now().toString(36)}${i}` })) }),
    });
  return (
    <div className={panel}>
      <Header title="A proposed script" onClose={onClose} />
      {beats ? (
        (Object.keys(BEAT_PROMPTS) as (keyof TransmissionBeats)[]).map((k) => (
          <Swap key={k} label={BEAT_PROMPTS[k].label} now={x.beats[k]} next={beats[k]} onUse={() => setX({ ...x, beats: { ...x.beats, [k]: beats[k] } })} />
        ))
      ) : (
        <Swap label={p.moment === "check_in" ? "The update" : "The script"} now={x.text} next={p.text} onUse={() => setX({ ...x, text: p.text })} />
      )}
      {p.newInfo && <Swap label="New information" now={x.newInfo} next={p.newInfo} onUse={() => setX({ ...x, newInfo: p.newInfo })} />}
      {p.nextAction && (
        <Swap label="What the learner does next" now={x.nextAction} next={p.nextAction} onUse={() => setX({ ...x, nextAction: p.nextAction })} />
      )}
      {p.questions.length > 0 && (
        <div className={row}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Questions a learner can choose ({p.questions.length})</p>
            <button
              type="button"
              className={btn.secondary}
              onClick={() => setX({ ...x, questions: p.questions.map((q, i) => ({ ...q, id: `q${Date.now().toString(36)}${i}` })) })}
              title="Your own questions are replaced."
            >
              Replace my questions with these
            </button>
          </div>
          <dl className="mt-2 flex flex-col gap-2 text-sm">
            {p.questions.map((q) => (
              <div key={q.id}>
                <dt className="font-semibold">{q.label}</dt>
                <dd>{q.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <div>
        <button type="button" className={btn.primary} onClick={all}>
          Use all of it
        </button>
      </div>
      <Grounds used={p.used} missing={p.missing} dropped={p.dropped} guidance={p.guidance} />
      <p className="text-sm text-ink-muted">
        Taking it changes the draft only. The approved version learners get, and any recording made from it, stay as they are until you approve this one.
      </p>
    </div>
  );
}

/** A drafted episode, read before it goes into the form. */
export function EpisodeProposalPanel({ p, names, onUse, onClose }: { p: EpisodeProposal; names: Map<string, string>; onUse: () => void; onClose: () => void }) {
  return (
    <div className={panel}>
      <Header title="A proposed next episode" onClose={onClose} />
      <div className={row}>
        <p className="font-semibold">
          {p.title}
          {p.whenLabel && <span className="font-normal text-ink-muted"> · {p.whenLabel}</span>}
        </p>
        <p className="mt-1">{p.summary}</p>
        {p.changes && (
          <p className="mt-1 text-sm">
            <span className="text-ink-muted">What’s different afterwards: </span>
            {p.changes}
          </p>
        )}
        <p className="mt-1 text-sm text-ink-muted">With: {p.people.map((x) => `${names.get(x.characterId) ?? x.characterId} (${x.role})`).join(", ")}</p>
      </div>
      {p.boundaries.length > 0 && (
        <div className={row}>
          <p className="text-sm font-semibold">Read it against what must never be claimed</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {p.boundaries.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      <Grounds used={p.used} missing={p.missing} dropped={p.dropped} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn.primary} onClick={onUse}>
          Put it in the form to edit
        </button>
        <span className="text-sm text-ink-muted">It is saved as a draft episode. It becomes shared history only when a steward approves it.</span>
      </div>
    </div>
  );
}

export { ErrorNote as ProposalError };
