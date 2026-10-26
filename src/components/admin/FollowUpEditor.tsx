"use client";

import { useState } from "react";
import type { FollowUpContent, FollowUpStage } from "@/content/followups";
import { stageLabel } from "@/content/followups";
import type { Tone } from "@/content/lessons";
import type { IconName, VisualVariant } from "@/content/stories";
import { api, durationLabel, useApi, type Me } from "@/lib/api";
import { CardVisual } from "../player/CardVisual";
import { Icon } from "../Icon";
import { AdminShell, Badge, btn, ErrorNote, Field, input, statusText, statusTone } from "./ui";

type Data = { content: FollowUpContent; versions: { version: number; status: string; created_at: string }[]; issues: string[] };

const variants: VisualVariant[] = ["petals", "rings", "grid", "wave", "dots", "arc"];
const tones: Tone[] = ["teal", "navy", "warm", "gold", "sky"];
const icons: IconName[] = ["clock", "shield", "heart", "leaf", "chat", "home", "spark", "doc", "people", "sun", "route", "book"];

/** Edits a short follow up built from the standard card types: question, explain, takeaway. */
export function FollowUpEditor({ id }: { id: string }) {
  const me = useApi<Me>("/api/me").data;
  const { data, error, setData } = useApi<Data>(`/api/admin/follow-ups/${id}`);
  const [draft, setDraft] = useState<FollowUpContent | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const stamp = data ? `${data.content.version}:${data.content.status}` : null;
  if (data && stamp !== loaded) {
    setLoaded(stamp);
    setDraft(data.content);
  }

  if (error) return <AdminShell title="Follow up" back={{ href: "/admin/schedules", label: "Spaced schedules" }}><ErrorNote text={error} /></AdminShell>;
  if (!data || !draft) return <AdminShell title="Follow up" back={{ href: "/admin/schedules", label: "Spaced schedules" }}><p className="text-ink-muted">Loading…</p></AdminShell>;

  const editable = Boolean(me?.canAuthor);
  const set = (c: Partial<FollowUpContent>) => setDraft({ ...draft, ...c });
  const setQ = (c: Partial<FollowUpContent["question"]>) => set({ question: { ...draft.question, ...c } });
  const setOption = (i: number, c: Partial<FollowUpContent["question"]["options"][number]>) =>
    setQ({ options: draft.question.options.map((o, j) => (j === i ? { ...o, ...c } : c.correct ? { ...o, correct: false } : o)) });

  async function save(approve: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<Data>(`/api/admin/follow-ups/${id}`, { method: "PUT", body: { content: draft, approve } });
      setData({ ...data!, content: r.content, issues: r.issues, versions: data!.versions });
      setMessage({ kind: "ok", text: approve ? `Approved as version ${r.content.version}. Paths pick it up when they’re next published.` : `Saved as draft version ${r.content.version}.` });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const v = draft.question.visual;

  return (
    <AdminShell title={draft.title || "Untitled follow up"} back={{ href: "/admin/schedules", label: "Spaced schedules" }}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(data.content.status)}>
          {statusText[data.content.status]} · version {data.content.version}
        </Badge>
        {draft.draftWording && <Badge tone="warn">Draft operational wording</Badge>}
        <span className="ml-auto" />
        {editable && (
          <>
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => save(false)}>
              Save draft
            </button>
            <button type="button" className={btn.primary} disabled={busy} onClick={() => save(true)}>
              Approve
            </button>
          </>
        )}
      </div>
      {data.content.status === "approved" && editable && <p className="mt-2 text-sm text-ink-muted">Approved versions don’t change. Saving creates version {data.content.version + 1}.</p>}
      {message && <div className="mt-3">{message.kind === "error" ? <ErrorNote text={message.text} /> : <p role="status" className="rounded-2xl bg-tealtint p-3">{message.text}</p>}</div>}

      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <fieldset disabled={!editable} className="flex min-w-0 flex-col gap-6">
          <section className="grid gap-4 rounded-3xl border border-line p-5 sm:grid-cols-2">
            <Field label="Title" className="sm:col-span-2">
              <input className={input} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <Field label="Stage">
              <select className={input} value={draft.stage} onChange={(e) => set({ stage: e.target.value as FollowUpStage })}>
                {Object.entries(stageLabel).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Concept tag" hint="Groups first attempt accuracy in reports.">
              <input className={input} value={draft.concept} onChange={(e) => set({ concept: e.target.value })} />
            </Field>
            <Field label="Learning objective" className="sm:col-span-2">
              <input className={input} value={draft.objective} onChange={(e) => set({ objective: e.target.value })} />
            </Field>
            <Field label="Written for role" hint="Leave as everyone unless this is an approved role variant.">
              <select className={input} value={draft.role ?? ""} onChange={(e) => set({ role: e.target.value || undefined })}>
                <option value="">Everyone (default)</option>
                {["cleaning", "gardening", "physiotherapy", "nursing", "personal-care", "coordinator"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Estimated duration (seconds)" hint={durationLabel(draft.durationSec)}>
              <input type="number" min={15} max={180} className={input} value={draft.durationSec} onChange={(e) => set({ durationSec: Number(e.target.value) || 60 })} />
            </Field>
          </section>

          <section className="flex flex-col gap-4 rounded-3xl border border-line p-5">
            <h2 className="font-serif text-xl font-semibold">1 · Question first</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Label">
                <input className={input} value={draft.question.label} onChange={(e) => setQ({ label: e.target.value })} />
              </Field>
              <Field label="Heading" hint="About three to eight words.">
                <input className={input} value={draft.question.heading} onChange={(e) => setQ({ heading: e.target.value })} />
              </Field>
              <Field label="Situation" className="sm:col-span-2" hint={`${draft.question.body.split(/\s+/).filter(Boolean).length} words. Aim for 15 to 40.`}>
                <textarea rows={2} className={input + " py-2"} value={draft.question.body} onChange={(e) => setQ({ body: e.target.value })} />
              </Field>
              <Field label="Question" className="sm:col-span-2">
                <input className={input} value={draft.question.prompt} onChange={(e) => setQ({ prompt: e.target.value })} />
              </Field>
            </div>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-semibold">Options and feedback (feedback explains the consequence)</legend>
              {draft.question.options.map((o, i) => (
                <div key={o.id} className="grid gap-2 rounded-2xl bg-muted p-3 sm:grid-cols-[auto_minmax(0,1fr)]">
                  <label className="flex items-center gap-2 text-sm font-medium sm:row-span-2">
                    <input type="radio" name="correct" checked={o.correct} onChange={() => setOption(i, { correct: true })} className="size-5 accent-[var(--action)]" />
                    Better choice
                  </label>
                  <input className={input} placeholder={`Option ${o.id.toUpperCase()}`} aria-label={`Option ${o.id.toUpperCase()} text`} value={o.label} onChange={(e) => setOption(i, { label: e.target.value })} />
                  <textarea rows={2} className={input + " py-2"} placeholder="Feedback and consequence" aria-label={`Option ${o.id.toUpperCase()} feedback`} value={o.feedback} onChange={(e) => setOption(i, { feedback: e.target.value })} />
                  {draft.question.options.length > 2 && (
                    <button type="button" className={btn.quiet + " justify-self-start"} onClick={() => setQ({ options: draft.question.options.filter((_, j) => j !== i) })}>
                      Remove option
                    </button>
                  )}
                </div>
              ))}
              {draft.question.options.length < 4 && (
                <button
                  type="button"
                  className={btn.quiet + " self-start"}
                  onClick={() => setQ({ options: [...draft.question.options, { id: "abcd"[draft.question.options.length], label: "", correct: false, feedback: "" }] })}
                >
                  <Icon name="plus" className="size-4" /> Add option
                </button>
              )}
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Visual">
                <select
                  className={input}
                  value={v.kind}
                  onChange={(e) =>
                    setQ({
                      visual:
                        e.target.value === "none"
                          ? { kind: "none" }
                          : e.target.value === "words"
                            ? { kind: "words", words: [draft.question.heading || "Key words"], tone: "teal", alt: "" }
                            : { kind: "illustration", variant: "rings", tone: "teal", icon: "spark", alt: "" },
                    })
                  }
                >
                  <option value="illustration">Illustration</option>
                  <option value="words">Key words</option>
                  <option value="none">None</option>
                </select>
              </Field>
              {v.kind === "illustration" && (
                <>
                  <Field label="Pattern">
                    <select className={input} value={v.variant} onChange={(e) => setQ({ visual: { ...v, variant: e.target.value as VisualVariant } })}>
                      {variants.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </Field>
                  <Field label="Colour">
                    <select className={input} value={v.tone} onChange={(e) => setQ({ visual: { ...v, tone: e.target.value as Tone } })}>
                      {tones.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </Field>
                  <Field label="Icon">
                    <select className={input} value={v.icon} onChange={(e) => setQ({ visual: { ...v, icon: e.target.value as IconName } })}>
                      {icons.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </Field>
                </>
              )}
              {v.kind === "words" && (
                <Field label="Words (one per line)" className="sm:col-span-3">
                  <textarea rows={3} className={input + " py-2"} value={v.words.join("\n")} onChange={(e) => setQ({ visual: { ...v, words: e.target.value.split("\n") } })} />
                </Field>
              )}
              {v.kind !== "none" && (
                <Field label="Text alternative" className="sm:col-span-4">
                  <input className={input} value={v.alt} onChange={(e) => setQ({ visual: { ...v, alt: e.target.value } })} />
                </Field>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-3xl border border-line p-5">
            <h2 className="font-serif text-xl font-semibold">2 · Explain (optional)</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Heading">
                <input className={input} value={draft.explain?.heading ?? ""} onChange={(e) => set({ explain: { heading: e.target.value, body: draft.explain?.body ?? "", script: draft.explain?.script } })} />
              </Field>
              <Field label="On-screen text" className="sm:col-span-2">
                <textarea rows={2} className={input + " py-2"} value={draft.explain?.body ?? ""} onChange={(e) => set({ explain: { heading: draft.explain?.heading ?? "", body: e.target.value, script: draft.explain?.script } })} />
              </Field>
              <Field label="Narration script (separate from on-screen text; shown as transcript)" className="sm:col-span-2">
                <textarea
                  rows={3}
                  className={input + " py-2"}
                  value={draft.explain?.script ?? ""}
                  onChange={(e) => set({ explain: { heading: draft.explain?.heading ?? "", body: draft.explain?.body ?? "", script: e.target.value || undefined } })}
                />
              </Field>
            </div>
            {draft.explain && !draft.explain.heading && !draft.explain.body && (
              <button type="button" className={btn.quiet + " self-start"} onClick={() => set({ explain: undefined })}>
                Skip the explain card
              </button>
            )}
          </section>

          <section className="grid gap-4 rounded-3xl border border-line p-5 sm:grid-cols-2">
            <h2 className="font-serif text-xl font-semibold sm:col-span-2">3 · Takeaway</h2>
            <Field label="One practical action" className="sm:col-span-2">
              <input className={input} value={draft.takeaway.action} onChange={(e) => set({ takeaway: { ...draft.takeaway, action: e.target.value } })} />
            </Field>
            <Field label="Approved reference title">
              <input
                className={input}
                value={draft.takeaway.reference?.title ?? ""}
                onChange={(e) => set({ takeaway: { ...draft.takeaway, reference: { url: "", issuer: "", ...draft.takeaway.reference, title: e.target.value } } })}
              />
            </Field>
            <Field label="Reference link">
              <input
                className={input}
                value={draft.takeaway.reference?.url ?? ""}
                onChange={(e) => set({ takeaway: { ...draft.takeaway, reference: { title: "", issuer: "", ...draft.takeaway.reference, url: e.target.value } } })}
              />
            </Field>
            <Field label="Issued by" className="sm:col-span-2">
              <input
                className={input}
                value={draft.takeaway.reference?.issuer ?? ""}
                onChange={(e) => set({ takeaway: { ...draft.takeaway, reference: { title: "", url: "", ...draft.takeaway.reference, issuer: e.target.value } } })}
              />
            </Field>
            <label className="flex min-h-11 items-center gap-2 sm:col-span-2">
              <input type="checkbox" checked={draft.draftWording} onChange={(e) => set({ draftWording: e.target.checked })} className="size-5 accent-[var(--action)]" />
              Operational wording still needs subject matter approval (shown to learners as draft)
            </label>
            {draft.sources.length > 0 && (
              <div className="text-sm sm:col-span-2">
                <p className="font-semibold">Written from</p>
                <ul className="list-disc pl-5 text-ink-muted">
                  {draft.sources.map((s) => (
                    <li key={s.url}>{s.title}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </fieldset>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-20 xl:self-start">
          <div className="rounded-[2rem] border border-line bg-surface p-4 shadow-sm">
            <p className="font-mulish text-xs font-bold text-ink-muted">Card preview</p>
            <div className="mt-3 flex flex-col gap-3">
              {v.kind !== "none" && <CardVisual visual={v} className="aspect-[16/10]" />}
              <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{draft.question.label}</p>
              <p className="font-serif text-2xl font-semibold leading-tight">{draft.question.heading || "Heading"}</p>
              <p>{draft.question.body}</p>
              <p className="font-semibold">{draft.question.prompt}</p>
              {draft.question.options.map((o) => (
                <p key={o.id} className="rounded-2xl border-2 border-line px-3 py-2">
                  {o.label || <span className="text-ink-muted">Option {o.id.toUpperCase()}</span>}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-line p-4 text-sm">
            <p className="font-semibold">Checks before approval</p>
            {data.issues.length ? (
              <ul className="mt-1 list-disc pl-5">
                {data.issues.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-ink-muted">The saved version passes the checks.</p>
            )}
          </div>
          <div className="rounded-3xl border border-line p-4 text-sm">
            <p className="font-semibold">Versions</p>
            <ul className="mt-1">
              {data.versions.map((x) => (
                <li key={x.version}>
                  v{x.version} · {statusText[x.status]} · {new Date(x.created_at).toLocaleDateString("en-AU")}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </AdminShell>
  );
}
