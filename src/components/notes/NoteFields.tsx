"use client";

import { cx } from "@/lib/format";
import {
  BADGES,
  FICTIONALISE,
  NOTE_AUDIENCES,
  noteProblems,
  RANKS,
  TOPICS,
  type Badge,
  type MentorNoteData,
  type NoteAudience,
  type Rank,
  type Topic,
} from "@/lib/notes";

/*
  The fields of a mentor note, shared by "Leave a note behind" and the editors' library. A contributor sees the
  four parts, who may see it, how it's attributed and their consent; an editor also sets the badge, rank, linked
  policy and Community thread.
*/

const input = "min-h-11 w-full rounded-xl border border-line-strong bg-bg px-3";
const area = "min-h-24 w-full rounded-xl border border-line-strong bg-bg px-3 py-2";

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1", className)}>
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export function NoteFields({ value: v, onChange, editor }: { value: MentorNoteData; onChange: (d: MentorNoteData) => void; editor?: boolean }) {
  const set = (p: Partial<MentorNoteData>) => onChange({ ...v, ...p });
  const toggle = <T extends string>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const problems = noteProblems(v);
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-2xl bg-[#fff1cc] p-3 text-sm text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]">{FICTIONALISE}</p>
      <Field label="The moment, in your words" hint="First person, like: “I thought saying yes to everything made me a good Care Partner.”">
        <input className={input} value={v.hook} maxLength={160} onChange={(e) => set({ hook: e.target.value })} />
      </Field>
      <Field label="The situation (fictionalised, one to three sentences)">
        <textarea className={area} value={v.scenario} maxLength={500} onChange={(e) => set({ scenario: e.target.value })} />
      </Field>
      <Field label="What you got wrong or found hard, and what you learned" hint="Your note to your week-three self.">
        <textarea className={cx(area, "min-h-32")} value={v.note} maxLength={900} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      <Field label="A phrase or action to adapt (optional)">
        <textarea className={area} value={v.phrase} maxLength={400} onChange={(e) => set({ phrase: e.target.value })} />
      </Field>
      <Field
        label="What approved guidance supports any rule it mentions (optional)"
        hint="An editor can link the current policy instead of the note repeating it."
      >
        <input className={input} value={v.policyNote} maxLength={300} onChange={(e) => set({ policyNote: e.target.value })} />
      </Field>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="text-sm font-semibold">Topic</legend>
        {(Object.keys(TOPICS) as Topic[]).map((t) => (
          <label key={t} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={v.topics.includes(t)} onChange={() => set({ topics: toggle(v.topics, t) })} />
            {TOPICS[t]}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="text-sm font-semibold">Who may see this</legend>
        {(Object.keys(NOTE_AUDIENCES) as NoteAudience[]).map((a) => (
          <label key={a} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={v.audiences.includes(a)} onChange={() => set({ audiences: toggle(v.audiences, a) })} />
            {NOTE_AUDIENCES[a]}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Your name as shown" hint="For example, first name and initial.">
          <input className={input} value={v.authorName} maxLength={60} onChange={(e) => set({ authorName: e.target.value })} />
        </Field>
        <Field label="Your role">
          <input className={input} value={v.authorRole} maxLength={80} onChange={(e) => set({ authorRole: e.target.value })} />
        </Field>
        <Field label="Experience (optional, broad)" hint="Like “five years in community care”.">
          <input className={input} value={v.experience} maxLength={80} onChange={(e) => set({ experience: e.target.value })} />
        </Field>
      </div>
      {editor && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Badge">
            <select className={input} value={v.badge} onChange={(e) => set({ badge: e.target.value as Badge })}>
              {(Object.keys(BADGES) as Badge[]).map((x) => (
                <option key={x} value={x}>
                  {x} · {BADGES[x]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rank" hint="An editorial motif, never a score from job title, tenure or votes.">
            <select className={input} value={v.rank} onChange={(e) => set({ rank: e.target.value as Rank })}>
              {(Object.keys(RANKS) as Rank[]).map((x) => (
                <option key={x} value={x}>
                  {x} · {RANKS[x]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Policy IDs" hint="Comma-separated.">
            <input
              className={input}
              value={v.policyIds.join(", ")}
              onChange={(e) =>
                set({
                  policyIds: e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field label="Community thread ID">
            <input className={input} value={v.communityPostId} maxLength={80} onChange={(e) => set({ communityPostId: e.target.value })} />
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-5" checked={v.illustrative} onChange={(e) => set({ illustrative: e.target.checked })} />
            Illustrative card (a fictional mentor)
          </label>
        </div>
      )}
      <fieldset className="flex flex-col gap-1 rounded-2xl bg-muted p-3">
        <legend className="px-1 text-sm font-semibold">Your consent</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={v.consent.audience}
            onChange={(e) => set({ consent: { ...v.consent, audience: e.target.checked } })}
          />
          I agree to this note being shown to the people I’ve chosen above, after review.
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={v.consent.attribution}
            onChange={(e) => set({ consent: { ...v.consent, attribution: e.target.checked } })}
          />
          I agree to it showing my name and role as written above.
        </label>
        <p className="text-xs text-ink-muted">
          You can ask for a correction or withdraw it at any time. Editors may suggest edits, and you approve the final wording.
        </p>
      </fieldset>
      {problems.length > 0 && (
        <ul className="list-disc rounded-2xl bg-bg p-3 pl-8 text-sm ring-1 ring-line">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
