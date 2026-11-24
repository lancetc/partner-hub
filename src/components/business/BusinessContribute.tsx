"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { cleanNote, FICTIONALISE, STATES, type MentorNoteData } from "@/lib/notes";
import {
  COLLECTIONS,
  CONSENTS,
  DISPLAY,
  PRE_SUBMIT,
  SERVICE_MODELS,
  STAGES,
  THEMES,
  TOOLS,
  noConsents,
  type BusinessContext,
  type ConsentKey,
  type Display,
} from "@/lib/businessNotes";
import type { myBusinessNotes } from "@/server/businessNotes";
import { MentorCard, type CardView } from "../notes/MentorCard";
import { Icon } from "../Icon";
import { field, primary, secondary, showDate, UrgentRoute } from "./BusinessThread";

/*
  "Contribute a note" for Care Partner principals (docs/business-field-notes.md). Optional, private until submitted,
  and never published on anyone's behalf: the contributor chooses attribution and audience, gives each permission
  separately (all off to start), previews the card and where it would appear, answers the three pre-submit
  questions, and approves any substantive edit before it's published. Declining or withdrawing changes nothing
  about their own learning.
*/

type Mine = ReturnType<typeof myBusinessNotes>;
type Draft = {
  hook: string;
  scenario: string;
  note: string;
  phrase: string;
  consent: { audience: boolean; attribution: boolean };
  business: Partial<BusinessContext> & { consents: Record<ConsentKey, boolean> };
};
const blank = (): Draft => ({
  hook: "",
  scenario: "",
  note: "",
  phrase: "",
  consent: { audience: false, attribution: false },
  business: {
    collection: "starting",
    stage: "starting",
    theme: "first-hire",
    serviceModel: "home",
    era: "",
    context: "",
    decision: "",
    choice: "",
    believed: "",
    tried: "",
    failed: "",
    tradeoff: "",
    toolIds: [],
    display: "first",
    businessLabel: "",
    privateNote: "",
    freeText: "",
    takesQuestions: true,
    answerWindow: "",
    claims: [],
    consents: noConsents(),
  },
});
const fromNote = (d: MentorNoteData): Draft => ({
  hook: d.hook,
  scenario: d.scenario,
  note: d.note,
  phrase: d.phrase,
  consent: d.consent,
  business: { ...d.business!, consents: { ...d.business!.consents } },
});

export function BusinessContribute() {
  const mine = useApi<Mine>("/api/business-notes?mine=1");
  const [draft, setDraft] = useState<Draft>(blank);
  const [id, setId] = useState("");
  const [path, setPath] = useState<"guided" | "free">("guided");
  const [status, setStatus] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [preview, setPreview] = useState(false);
  const [flipped, setFlipped] = useState(false);

  if (mine.error)
    return (
      <p className="mt-6 rounded-3xl bg-surface p-6 ring-1 ring-line">
        Contributing a Business Field Note is for verified Care Partner principals. If you own a Care Partner business and can’t contribute, ask Partnerships to
        confirm your business-owner access.
      </p>
    );

  const set = (k: keyof Draft, v: unknown) => setDraft({ ...draft, [k]: v });
  const setB = (k: keyof Draft["business"], v: unknown) => setDraft({ ...draft, business: { ...draft.business, [k]: v } });
  const call = async <T,>(body: Record<string, unknown>, done: string): Promise<T | null> => {
    setStatus("");
    setProblems([]);
    try {
      const r = await api<T & { route?: string }>("/api/business-notes", { body: { contribute: true, ...body } });
      if (r.route === "urgent") {
        setUrgent(true);
        return null;
      }
      setStatus(done);
      mine.reload();
      return r;
    } catch (e) {
      const p = (e as { problems?: string[] }).problems;
      if (p) setProblems(p);
      setStatus(e instanceof Error ? e.message : "That didn’t work.");
      return null;
    }
  };
  const save = async () => {
    const r = await call<{ note: { id: string } }>({ action: "draft", id: id || undefined, data: draft }, "Draft saved. Only you can see it.");
    if (r) setId(r.note.id);
    return r;
  };
  const previewCard = {
    id: "preview",
    version: 1,
    state: "reviewed",
    label: "Peer experience · reviewed for the deck",
    data: cleanNote({
      ...draft,
      badge: "CP",
      rank: "10",
      authorName: authorFor(draft.business.display ?? "first", draft.business.businessLabel ?? ""),
      authorRole: "Care Partner principal",
    }),
    canCopy: true,
    helpful: 0,
    mineHelpful: false,
    saved: false,
    thread: "",
    updatedAt: "",
    preview: true,
  } as unknown as CardView;
  const b = draft.business;

  return (
    <div className="mt-6 flex flex-col gap-8">
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      <section aria-labelledby="mine-h">
        <h2 id="mine-h" className="font-serif text-2xl font-semibold">
          Your notes
        </h2>
        {!mine.data ? (
          <p className="text-ink-muted">Loading…</p>
        ) : mine.data.notes.length === 0 ? (
          <p className="text-ink-muted">You haven’t started one. Whether you contribute or not makes no difference to your learning or access.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {mine.data.notes.map((n) => (
              <MyNote
                key={n.latest.id}
                n={n}
                onEdit={() => {
                  setId(n.latest.id);
                  setDraft(fromNote(n.latest.data));
                  document.getElementById("form-h")?.focus();
                }}
                call={call}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="form-h" className="rounded-3xl bg-surface p-4 ring-1 ring-line sm:p-6">
        <h2 id="form-h" tabIndex={-1} className="font-serif text-2xl font-semibold outline-none">
          {id ? "Edit your draft" : "Contribute a note"}
        </h2>
        <p className="mt-1 rounded-xl bg-[#fff1cc] p-3 text-sm text-[#4a3400]">
          {FICTIONALISE} Don’t share current or future prices, fee schedules, margins, pay offers, customer lists or territory plans: a private calculation
          belongs in a Work Tool.
        </p>
        <div className="mt-3 flex gap-2" role="group" aria-label="How would you like to write it?">
          <button
            type="button"
            aria-pressed={path === "guided"}
            className={cx(secondary, path === "guided" && "bg-muted ring-2 ring-action")}
            onClick={() => setPath("guided")}
          >
            Guided questions
          </button>
          <button
            type="button"
            aria-pressed={path === "free"}
            className={cx(secondary, path === "free" && "bg-muted ring-2 ring-action")}
            onClick={() => setPath("free")}
          >
            Write freely
          </button>
        </div>

        {path === "free" && (
          <Area
            label="Tell it in your own words"
            hint="What happened in the business, what you believed, what you decided, what worked, what failed, what changed and what you’d tell your younger self. An editor will suggest how it fits the card, and you approve every word before it’s published."
            value={b.freeText ?? ""}
            max={4000}
            onChange={(v) => setB("freeText", v)}
          />
        )}

        <fieldset className="mt-4 flex flex-col gap-3">
          <legend className="font-semibold">1. The moment</legend>
          <Text label="Title, in your words" hint="One line, first person: “I thought…”" value={draft.hook} max={160} onChange={(v) => set("hook", v)} />
          <Area label="What was happening (one to three sentences)" value={draft.scenario} max={500} onChange={(v) => set("scenario", v)} />
          <Area label="The one decision it’s about" value={b.decision ?? ""} max={300} onChange={(v) => setB("decision", v)} />
          <Text label="A question for the reader before they flip (optional)" value={b.choice ?? ""} max={240} onChange={(v) => setB("choice", v)} />
        </fieldset>

        <fieldset className="mt-4 flex flex-col gap-3">
          <legend className="font-semibold">2. What you believed, tried and learned</legend>
          <Area label="What I believed then" value={b.believed ?? ""} max={500} onChange={(v) => setB("believed", v)} />
          <Area label="What I tried" value={b.tried ?? ""} max={500} onChange={(v) => setB("tried", v)} />
          <Area
            label="What didn’t work, or surprised me"
            hint="This is what makes a card useful."
            value={b.failed ?? ""}
            max={500}
            onChange={(v) => setB("failed", v)}
          />
          <Area label="The trade-off" value={b.tradeoff ?? ""} max={400} onChange={(v) => setB("tradeoff", v)} />
          <Area label="My note to my younger self" value={draft.note} max={900} onChange={(v) => set("note", v)} />
          <Text label="One thing a reader could try" value={draft.phrase} max={400} onChange={(v) => set("phrase", v)} />
        </fieldset>

        <fieldset className="mt-4 flex flex-col gap-3">
          <legend className="font-semibold">3. Context, so readers can judge if it fits them</legend>
          <div className="flex flex-wrap gap-3">
            <Pick
              label="Collection"
              value={b.collection ?? "starting"}
              options={Object.entries(COLLECTIONS)
                .filter(([k]) => k !== "continues")
                .map(([k, v]) => [k, v.title])}
              onChange={(v) => setB("collection", v)}
            />
            <Pick label="Business stage" value={b.stage ?? "starting"} options={Object.entries(STAGES)} onChange={(v) => setB("stage", v)} />
            <Pick label="Decision" value={b.theme ?? "first-hire"} options={Object.entries(THEMES)} onChange={(v) => setB("theme", v)} />
            <Pick label="Service model" value={b.serviceModel ?? "home"} options={Object.entries(SERVICE_MODELS)} onChange={(v) => setB("serviceModel", v)} />
          </div>
          <Text
            label="When (roughly)"
            hint="“Our second year”, or a year. Not a specific date."
            value={b.era ?? ""}
            max={80}
            onChange={(v) => setB("era", v)}
          />
          <Text
            label="Broad context (optional)"
            hint="“Regional, home-based”. Never a small suburb, a supplier or a date together."
            value={b.context ?? ""}
            max={160}
            onChange={(v) => setB("context", v)}
          />
          <fieldset>
            <legend className="text-sm font-semibold">Related Work Tools (up to three)</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {(Object.keys(TOOLS) as (keyof typeof TOOLS)[]).map((t) => (
                <label key={t} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={(b.toolIds ?? []).includes(t)}
                    onChange={(e) => setB("toolIds", e.target.checked ? [...(b.toolIds ?? []), t].slice(0, 3) : (b.toolIds ?? []).filter((x) => x !== t))}
                  />
                  {TOOLS[t].title}
                </label>
              ))}
            </div>
          </fieldset>
          <Area
            label="Anything that must stay private (editors only)"
            hint="Never shown, quoted or exported. Tell us what to leave out."
            value={b.privateNote ?? ""}
            max={600}
            onChange={(v) => setB("privateNote", v)}
          />
        </fieldset>

        <fieldset className="mt-4 flex flex-col gap-3">
          <legend className="font-semibold">4. How it’s attributed, and who sees it</legend>
          <Pick label="How your name appears" value={b.display ?? "first"} options={Object.entries(DISPLAY)} onChange={(v) => setB("display", v)} />
          {b.display === "first" && (
            <Text label="Business label (optional)" value={b.businessLabel ?? ""} max={80} onChange={(v) => setB("businessLabel", v)} />
          )}
          <p className="text-sm text-ink-muted">
            Audience: verified Care Partner principals only. A wider version would be a separate, reviewed adaptation, and you’d be asked first.
          </p>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5"
              checked={draft.consent.audience}
              onChange={(e) => set("consent", { ...draft.consent, audience: e.target.checked })}
            />
            I agree to my story (the text) being shared with verified principals
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5"
              checked={draft.consent.attribution}
              onChange={(e) => set("consent", { ...draft.consent, attribution: e.target.checked })}
            />
            I agree to it being attributed as shown in the preview
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5" checked={b.takesQuestions ?? true} onChange={(e) => setB("takesQuestions", e.target.checked)} />
            I’m happy to see questions about it (I don’t have to answer)
          </label>
        </fieldset>

        <fieldset className="mt-4">
          <legend className="font-semibold">5. Other permissions, each separate and off unless you turn it on</legend>
          <div className="mt-1 flex flex-col">
            {(Object.keys(CONSENTS) as ConsentKey[]).map((k) => (
              <label key={k} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={b.consents[k]}
                  onChange={(e) => setB("consents", { ...b.consents, [k]: e.target.checked })}
                />
                {CONSENTS[k]}
              </label>
            ))}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            No recording, voice or synthetic voice is made from this form. Any audio would need its own consent review and a full transcript.
          </p>
        </fieldset>

        {problems.length > 0 && (
          <ul role="alert" className="mt-4 list-disc rounded-xl bg-[#fde7e4] p-3 pl-8 text-[#5c1410]">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {urgent && <div className="mt-4">{<UrgentRoute />}</div>}
        {status && !problems.length && <p className="mt-4 rounded-xl bg-muted p-2 text-sm">{status}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={secondary} onClick={() => void save()}>
            Save draft
          </button>
          <button type="button" className={secondary} aria-expanded={preview} onClick={() => setPreview(!preview)}>
            <Icon name="eye" className="size-4" /> {preview ? "Hide preview" : "Preview the card"}
          </button>
          <button
            type="button"
            className={primary}
            onClick={async () => {
              const r = await save();
              if (r) setChecking(true);
            }}
          >
            Submit for review
          </button>
        </div>

        {checking && (
          <div className="mt-4 rounded-2xl bg-bg p-4 ring-1 ring-line" role="group" aria-labelledby="contrib-check-h">
            <p id="contrib-check-h" className="font-semibold">
              Before you submit, check:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {PRE_SUBMIT.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={primary}
                onClick={async () => {
                  const r = await call(
                    { action: "submit", id, checked: true },
                    "Submitted. An editor will review it, and you’ll approve any changes before it’s published.",
                  );
                  if (r) {
                    setChecking(false);
                    setDraft(blank());
                    setId("");
                  }
                }}
              >
                I’ve checked: submit it
              </button>
              <button type="button" className={secondary} onClick={() => setChecking(false)}>
                Edit it first
              </button>
            </div>
          </div>
        )}

        {preview && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,34rem)_1fr]">
            <MentorCard c={previewCard} position="Preview" flipped={flipped} onFlip={setFlipped} preview />
            <div className="rounded-2xl bg-bg p-4 ring-1 ring-line">
              <p className="font-semibold">Where it would appear, once reviewed</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                <li>The Business Field Notes deck, for verified principals only.</li>
                <li>Its own discussion thread, the same one everywhere.</li>
                <li>Principals’ Pocket Decks, if they save it.</li>
                <li>
                  {b.consents.crossFormat ? "Business decks in Magazine courses (you allowed this)." : "Not in Magazine courses (you haven’t allowed this)."}
                </li>
                <li>
                  {b.consents.promotion
                    ? "A notification or webinar mention could name the card (you allowed this)."
                    : "Notifications say only that a card you follow has a check-in: never your words."}
                </li>
              </ul>
            </div>
          </div>
        )}
      </section>
      <p className="text-sm text-ink-muted">
        <Link href="/business-notes" className="font-semibold text-accent underline">
          Back to the deck
        </Link>
      </p>
    </div>
  );
}

const authorFor = (display: Display, label: string) =>
  display === "anonymous" ? "A Care Partner principal" : display === "name" ? "Your full name" : `Your first name${label ? ` · ${label}` : ""}`;

function MyNote({ n, onEdit, call }: { n: Mine["notes"][number]; onEdit: () => void; call: (b: Record<string, unknown>, done: string) => Promise<unknown> }) {
  const [chapter, setChapter] = useState({ title: "", dated: "", whatChanged: "", nowThink: "", correction: false, correctionNote: "" });
  const [writing, setWriting] = useState(false);
  const [checked, setChecked] = useState(false);
  const d = n.latest.data;
  const on = (Object.keys(CONSENTS) as ConsentKey[]).filter((k) => d.business?.consents[k]);
  return (
    <li className="rounded-3xl bg-surface p-4 ring-1 ring-line">
      <p className="font-serif text-lg font-semibold">{d.hook || "Untitled draft"}</p>
      <p className="text-sm text-ink-muted">
        {STATES[n.latest.state]}
        {n.published && n.published.version !== n.latest.version && ` · version ${n.published.version} is published`}
        {n.latest.reason && ` · ${n.latest.reason}`}
      </p>
      {(n.screen.identifying.length > 0 || n.screen.commercial.length > 0) && (
        <p className="mt-2 rounded-xl bg-[#fff1cc] p-2 text-sm text-[#4a3400]">
          An editor will check: {[...n.screen.identifying, ...n.screen.commercial].join("; ")}. You can edit it to take that out.
        </p>
      )}
      {n.latest.state === "draft" && n.problems.length > 0 && <p className="mt-1 text-sm text-ink-muted">Still to do: {n.problems.join(" ")}</p>}
      {n.editorVersion && (
        <div className="mt-3 rounded-2xl bg-bg p-3 ring-1 ring-line">
          <p className="font-semibold">An editor suggested new wording</p>
          <p className="mt-1 text-sm">
            <span className="font-semibold">Title:</span> {n.editorVersion.data.hook}
          </p>
          <p className="mt-1 text-sm">
            <span className="font-semibold">Note:</span> {n.editorVersion.data.note}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={primary}
              onClick={() => void call({ action: "approve-edits", id: n.latest.id }, "Approved. It goes back for the final check.")}
            >
              Approve this wording
            </button>
            <button type="button" className={secondary} onClick={() => void call({ action: "decline-edits", id: n.latest.id }, "Kept your own wording.")}>
              Keep my wording
            </button>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {n.latest.state === "draft" && (
          <button type="button" className={secondary} onClick={onEdit}>
            <Icon name="pen" className="size-4" /> Edit draft
          </button>
        )}
        {n.published && !writing && (
          <button type="button" className={secondary} onClick={() => setWriting(true)}>
            <Icon name="calendar" className="size-4" /> Write a check-in
          </button>
        )}
        {n.latest.state !== "withdrawn" && (
          <button
            type="button"
            className={secondary}
            onClick={() => {
              if (window.confirm("Withdraw this note everywhere? Readers who saved it will see that it’s been withdrawn."))
                void call({ action: "withdraw", id: n.latest.id }, "Withdrawn everywhere.");
            }}
          >
            Withdraw
          </button>
        )}
      </div>
      {on.length > 0 && n.latest.state !== "withdrawn" && (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">Change a permission</summary>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {on.map((k) => (
              <li key={k} className="flex flex-wrap items-center gap-2">
                {CONSENTS[k]}
                <button
                  type="button"
                  className={cx(secondary, "min-h-9 px-3 text-sm")}
                  onClick={() => void call({ action: "consent", id: n.latest.id, [k]: false }, "Turned off, everywhere.")}
                >
                  Turn off
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {n.chapters.length > 0 && (
        <ul className="mt-2 text-sm">
          {n.chapters.map((c) => (
            <li key={`${c.number}-${c.version}`}>
              Check-in {c.number} ({c.data.title}): {c.state}
              {c.state === "changes" && (
                <button
                  type="button"
                  className={cx(secondary, "ml-2 min-h-9 px-3 text-sm")}
                  onClick={() => void call({ action: "chapter-approve", id: n.latest.id, number: c.number }, "Approved.")}
                >
                  Approve the edited check-in
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {writing && (
        <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-bg p-3 ring-1 ring-line">
          <Text label="Check-in title" hint="“Eight weeks later”" value={chapter.title} max={120} onChange={(v) => setChapter({ ...chapter, title: v })} />
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Dated</span>
            <input type="date" className={field} value={chapter.dated} onChange={(e) => setChapter({ ...chapter, dated: e.target.value })} />
          </label>
          <Area label="What changed since the card" value={chapter.whatChanged} max={1200} onChange={(v) => setChapter({ ...chapter, whatChanged: v })} />
          <Area label="What I think now" value={chapter.nowThink} max={800} onChange={(v) => setChapter({ ...chapter, nowThink: v })} />
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5" checked={chapter.correction} onChange={(e) => setChapter({ ...chapter, correction: e.target.checked })} />
            This corrects a fact in the original card
          </label>
          {chapter.correction && (
            <Text label="What the correction is" value={chapter.correctionNote} max={300} onChange={(v) => setChapter({ ...chapter, correctionNote: v })} />
          )}
          <fieldset className="text-sm">
            <legend className="font-semibold">Before you submit, check:</legend>
            <ul className="list-disc pl-5">
              {PRE_SUBMIT.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            <label className="mt-1 flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              I’ve checked
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primary}
              disabled={!checked}
              onClick={() =>
                void call({ action: "chapter", id: n.latest.id, data: chapter, checked }, "Check-in submitted for review.").then((r) => {
                  if (r) setWriting(false);
                })
              }
            >
              Submit the check-in
            </button>
            <button type="button" className={secondary} onClick={() => setWriting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {n.consents.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Consent record</summary>
          <ul className="mt-1">
            {n.consents.map((c, i) => (
              <li key={i}>
                {showDate(c.at)} · version {c.version} · {c.change}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function Text({ label, hint, value, max, onChange }: { label: string; hint?: string; value: string; max: number; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-semibold">{label}</span>
      {hint && <span className="text-sm text-ink-muted">{hint}</span>}
      <input className={field} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Area({ label, hint, value, max, onChange }: { label: string; hint?: string; value: string; max: number; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-semibold">{label}</span>
      {hint && <span className="text-sm text-ink-muted">{hint}</span>}
      <textarea className={cx(field, "min-h-24")} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Pick({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold">{label}</span>
      <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}
