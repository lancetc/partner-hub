"use client";

import { cx } from "@/lib/format";
import type { ResetBlock } from "@/lib/magazine";
import { freshReset, resetApproved, type Marker } from "@/lib/reset";
import { RESET_CASES } from "@/content/resetCases";
import { members, posts } from "@/content/community";
import { btn, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for an Expectation Reset timeline (docs/expectation-reset.md): the illustrative story, the markers
  (at a story point or between two), each marker's reviewed script and the Community posts it may show, and the
  sign-off. Pinning or removing a post here never changes the post itself: it stays in the Community and follows
  its moderation.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const inner = "mt-2 grid gap-2 rounded-xl bg-surface p-3";
const lines = (v: string) => v.split("\n");
const ROLES = [
  { id: "care_coordinator", label: "Care Coordinators" },
  { id: "care_partner", label: "Care Partners" },
];
/** The Community posts that carry reuse details, with why one wouldn't show for a marker. */
const reusable = posts.filter((p) => p.learning);
function whyNot(p: (typeof posts)[number], m: Marker) {
  const l = p.learning!;
  if (l.reuse !== "approved") return "not approved for learning";
  if (!l.consent) return "no reuse consent";
  if (!l.verified) return "role not verified";
  if (!l.stages.includes(m.stage)) return "a different stage";
  if (m.roles.length && !l.roles.some((r) => m.roles.includes(r))) return "for a different role";
  return "";
}

export function ResetEdit({ block: b, update }: { block: ResetBlock; update: Update }) {
  const set = (fn: (x: ResetBlock) => void, tag?: string) => update<ResetBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const signed = resetApproved(b);
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="timeline" className="size-5" /> Expectation Reset timeline
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]" : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {signed
          ? `Signed off by ${b.approval.operations} (Care Operations), ${b.approval.quality} (Quality), ${b.approval.privacy} (Privacy) and ${b.approval.communications} (Communications) on ${b.approval.approvedOn}.`
          : "Sign-off required. This timeline can’t be published until Care Operations, Quality, Privacy and Communications sign-off and the source version are recorded below, and each marker’s script has its reviewer and dates."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Start from:</span>
        {RESET_CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={btn.secondary}
            title={c.teaches}
            onClick={() => {
              if (window.confirm(`Replace this block with “${c.name}”? What’s in the block now is lost, including any sign-off recorded.`))
                set((x) => void Object.assign(x, freshReset(c.data)));
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={b.title} maxLength={160} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction">
          <input className={input} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <Field label="The person" hint="A made-up name.">
          <input className={input} value={b.person.name} maxLength={80} onChange={(e) => set((x) => void (x.person.name = e.target.value), "pn")} />
        </Field>
        <Field label="About them">
          <input className={input} value={b.person.about} maxLength={400} onChange={(e) => set((x) => void (x.person.about = e.target.value), "pa")} />
        </Field>
        <Field label="Family member">
          <input className={input} value={b.family.name} maxLength={80} onChange={(e) => set((x) => void (x.family.name = e.target.value), "fn")} />
        </Field>
        <Field label="Relationship">
          <input className={input} value={b.family.relation} maxLength={60} onChange={(e) => set((x) => void (x.family.relation = e.target.value), "fr")} />
        </Field>
        <Field label="What the family member may be told" className="sm:col-span-2">
          <input className={input} value={b.consent} maxLength={400} onChange={(e) => set((x) => void (x.consent = e.target.value), "consent")} />
        </Field>
      </div>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The story ({b.nodes.length} points)</summary>
        <p className="text-xs text-ink-muted">Story months are positions in the story, never wait estimates. Markers sit at a point or between two.</p>
        {b.nodes.map((n, i) => (
          <div key={n.id} className={cx(inner, "sm:grid-cols-[6rem_1fr]")}>
            <Field label="Story month">
              <input
                type="number"
                min={0}
                max={36}
                className={input}
                value={n.month}
                onChange={(e) => set((x) => void (x.nodes[i].month = Number(e.target.value || 0)), `n${i}m`)}
              />
            </Field>
            <Field label="Label">
              <input className={input} value={n.label} maxLength={80} onChange={(e) => set((x) => void (x.nodes[i].label = e.target.value), `n${i}l`)} />
            </Field>
            <Field label="What’s happening" className="sm:col-span-2">
              <input className={input} value={n.summary} maxLength={400} onChange={(e) => set((x) => void (x.nodes[i].summary = e.target.value), `n${i}s`)} />
            </Field>
            <div>
              <button type="button" className={btn.quiet} onClick={() => set((x) => void x.nodes.splice(i, 1))}>
                <Icon name="trash" className="size-4" /> Remove
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() => set((x) => void x.nodes.push({ id: rid("point"), month: (x.nodes.at(-1)?.month ?? 0) + 1, label: "", summary: "" }))}
        >
          <Icon name="plus" className="size-4" /> Add a story point
        </button>
      </details>

      {b.markers.map((m, i) => {
        const put = (fn: (x: Marker) => void, tag?: string) => set((x) => fn(x.markers[i]), tag && `m${i}${tag}`);
        const between = !m.anchor.node;
        return (
          <details key={m.id} className={cx(group, "mt-3")}>
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">
              Marker: {m.label || "untitled"} · {m.subtitle}
            </summary>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Label" hint="For example, Month 4.">
                <input className={input} value={m.label} maxLength={60} onChange={(e) => put((x) => void (x.label = e.target.value), "l")} />
              </Field>
              <Field label="Story month">
                <input
                  type="number"
                  min={0}
                  max={36}
                  className={input}
                  value={m.month}
                  onChange={(e) => put((x) => void (x.month = Number(e.target.value || 0)), "mo")}
                />
              </Field>
              <Field label="Subtitle">
                <input className={input} value={m.subtitle} maxLength={120} onChange={(e) => put((x) => void (x.subtitle = e.target.value), "su")} />
              </Field>
              <Field label="Theme">
                <input className={input} value={m.theme} maxLength={80} onChange={(e) => put((x) => void (x.theme = e.target.value), "th")} />
              </Field>
              <fieldset className="flex flex-col gap-1 sm:col-span-2">
                <legend className="text-sm font-semibold">Where it sits</legend>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${m.id}-anchor`}
                    className="size-5"
                    checked={!between}
                    onChange={() => put((x) => void (x.anchor = { node: b.nodes[0]?.id ?? "", after: "", before: "" }))}
                  />
                  At a story point
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${m.id}-anchor`}
                    className="size-5"
                    checked={between}
                    onChange={() => put((x) => void (x.anchor = { node: "", after: b.nodes[0]?.id ?? "", before: b.nodes[1]?.id ?? "" }))}
                  />
                  Between two story points (not a milestone of its own)
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(between ? (["after", "before"] as const) : (["node"] as const)).map((k) => (
                    <select
                      key={k}
                      aria-label={k === "node" ? "Story point" : k === "after" ? "After" : "Before"}
                      className={input}
                      value={m.anchor[k]}
                      onChange={(e) => put((x) => void (x.anchor[k] = e.target.value))}
                    >
                      {b.nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {k === "after" ? "After: " : k === "before" ? "Before: " : ""}
                          {n.label || "untitled"}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              </fieldset>
              <Field label="Stage tag" hint="Peer posts must carry the same tag, for example awaiting-allocation.">
                <input className={input} value={m.stage} maxLength={60} onChange={(e) => put((x) => void (x.stage = e.target.value.trim()), "st")} />
              </Field>
              <fieldset className="flex flex-col gap-1">
                <legend className="text-sm font-semibold">For</legend>
                {ROLES.map((r) => (
                  <label key={r.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={m.roles.includes(r.id)}
                      onChange={(e) => put((x) => void (x.roles = e.target.checked ? [...x.roles, r.id] : x.roles.filter((y) => y !== r.id)))}
                    />
                    {r.label}
                  </label>
                ))}
              </fieldset>
              <Field label="Where the story is" className="sm:col-span-2">
                <textarea className={area} value={m.story.now} maxLength={600} onChange={(e) => put((x) => void (x.story.now = e.target.value), "sn")} />
              </Field>
              {(["known", "unknown", "changed"] as const).map((k) => (
                <Field
                  key={k}
                  label={k === "known" ? "Known, one per line" : k === "unknown" ? "Not known, one per line" : "What may have changed, one per line"}
                >
                  <textarea className={area} value={m.story[k].join("\n")} onChange={(e) => put((x) => void (x.story[k] = lines(e.target.value)), `s${k}`)} />
                </Field>
              ))}
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="size-5" checked={m.firstTake} onChange={(e) => put((x) => void (x.firstTake = e.target.checked))} />
                Ask for a private first take before the approaches
              </label>
              {m.firstTake && (
                <Field label="The question">
                  <input className={input} value={m.question} maxLength={240} onChange={(e) => put((x) => void (x.question = e.target.value), "q")} />
                </Field>
              )}
            </div>

            <div className={inner}>
              <p className="text-sm font-semibold">The reviewed approach</p>
              <Field label="Script, to the person">
                <textarea
                  className={cx(area, "min-h-28")}
                  value={m.featured.text}
                  maxLength={1200}
                  onChange={(e) => put((x) => void (x.featured.text = e.target.value), "ft")}
                />
              </Field>
              <Field label="Script, to the family member" hint="Only what the person has agreed they can be told.">
                <textarea
                  className={cx(area, "min-h-24")}
                  value={m.featured.family}
                  maxLength={1200}
                  onChange={(e) => put((x) => void (x.featured.family = e.target.value), "ff")}
                />
              </Field>
              <Field label="Why it works">
                <textarea className={area} value={m.featured.why} maxLength={600} onChange={(e) => put((x) => void (x.featured.why = e.target.value), "fw")} />
              </Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Reviewed by">
                  <input
                    className={input}
                    value={m.featured.reviewedBy}
                    maxLength={120}
                    onChange={(e) => put((x) => void (x.featured.reviewedBy = e.target.value), "fr")}
                  />
                </Field>
                <Field label="Policy or SOP id">
                  <input
                    className={input}
                    value={m.featured.policyId}
                    maxLength={80}
                    onChange={(e) => put((x) => void (x.featured.policyId = e.target.value), "fp")}
                  />
                </Field>
                <Field label="Approved on">
                  <input
                    type="date"
                    className={input}
                    value={m.featured.approvedOn}
                    onChange={(e) => put((x) => void (x.featured.approvedOn = e.target.value))}
                  />
                </Field>
                <Field label="Review due" hint="After this date it shows as under review and can’t be copied.">
                  <input
                    type="date"
                    className={input}
                    value={m.featured.reviewDue}
                    onChange={(e) => put((x) => void (x.featured.reviewDue = e.target.value))}
                  />
                </Field>
              </div>
              <Field label="If something has changed or is urgent" hint="The approved pathway. Never the Community.">
                <textarea className={area} value={m.urgent} maxLength={400} onChange={(e) => put((x) => void (x.urgent = e.target.value), "u")} />
              </Field>
              <div className="flex flex-wrap gap-4">
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" className="size-5" checked={m.allowCopy} onChange={(e) => put((x) => void (x.allowCopy = e.target.checked))} />
                  Offer “Use this phrase”
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" className="size-5" checked={m.allowSave} onChange={(e) => put((x) => void (x.allowSave = e.target.checked))} />
                  Learners can save phrases
                </label>
              </div>
            </div>

            <div className={inner}>
              <p className="text-sm font-semibold">From the Community</p>
              <p className="text-xs text-ink-muted">
                Tick the posts this marker may show, up to {m.max}. A post only appears if it’s approved for learning, consented, verified, for this stage and
                role, within its review date, and not withdrawn. Popularity never makes a post authoritative.
              </p>
              {reusable.map((p) => {
                const no = whyNot(p, m);
                const who = members.find((x) => x.id === p.authorId);
                return (
                  <label key={p.id} className="flex min-h-11 items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-5"
                      checked={m.postIds.includes(p.id)}
                      onChange={(e) => put((x) => void (x.postIds = e.target.checked ? [...x.postIds, p.id] : x.postIds.filter((y) => y !== p.id)))}
                    />
                    <span>
                      <span className="font-semibold">{p.title}</span> · {who?.role}
                      <span className="block text-ink-muted">{no ? `Won’t show: ${no}.` : "Can show."}</span>
                    </span>
                  </label>
                );
              })}
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Most to show (0 to 3)">
                  <input
                    type="number"
                    min={0}
                    max={3}
                    className={input}
                    value={m.max}
                    onChange={(e) => put((x) => void (x.max = Math.min(3, Math.max(0, Number(e.target.value || 0)))), "mx")}
                  />
                </Field>
                <Field label="When none qualify" hint={`Blank shows “More peer approaches will appear here.”`}>
                  <input className={input} value={m.fallback} maxLength={240} onChange={(e) => put((x) => void (x.fallback = e.target.value), "fb")} />
                </Field>
              </div>
            </div>
            <div className="mt-2">
              <button type="button" className={btn.quiet} onClick={() => set((x) => void x.markers.splice(i, 1))}>
                <Icon name="trash" className="size-4" /> Remove this marker
              </button>
            </div>
          </details>
        );
      })}
      <button
        type="button"
        className={cx(btn.secondary, "mt-3")}
        onClick={() =>
          set(
            (x) =>
              void x.markers.push({
                id: rid("marker"),
                anchor: { node: x.nodes[0]?.id ?? "", after: "", before: "" },
                month: x.nodes[0]?.month ?? 0,
                label: "",
                subtitle: "",
                theme: "",
                stage: "awaiting-allocation",
                roles: ["care_coordinator", "care_partner"],
                story: { now: "", known: [], unknown: [], changed: [] },
                question: "",
                firstTake: false,
                featured: { text: "", family: "", why: "", reviewedBy: "", policyId: "", approvedOn: "", reviewDue: "" },
                postIds: [],
                max: 3,
                fallback: "",
                allowCopy: true,
                allowSave: true,
                urgent: "",
              }),
          )
        }
      >
        <Icon name="plus" className="size-4" /> Add a marker
      </button>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">A free pre-onboarding chat</summary>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-5" checked={b.offer.approved} onChange={(e) => set((x) => void (x.offer.approved = e.target.checked))} />
          Trilogy Care has approved this offer, its staffing, scope, insurance and no-charge wording
        </label>
        <p className="text-xs text-ink-muted">
          Until it’s ticked, a peer post describing it says “Ask whether a pre-onboarding conversation is available”, with no promise.
        </p>
        {b.offer.approved && (
          <Field label="Its exact approved scope">
            <textarea className={area} value={b.offer.scope} maxLength={400} onChange={(e) => set((x) => void (x.offer.scope = e.target.value), "os")} />
          </Field>
        )}
      </details>

      <details className={cx(group, "mt-3")} open={!signed}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Source and sign-off</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Policy or SOP source" className="sm:col-span-2">
            <input className={input} value={b.source.title} maxLength={200} onChange={(e) => set((x) => void (x.source.title = e.target.value), "st")} />
          </Field>
          <Field label="Its version">
            <input className={input} value={b.source.version} maxLength={80} onChange={(e) => set((x) => void (x.source.version = e.target.value), "sv")} />
          </Field>
          <Field label="Content owner">
            <input className={input} value={b.approval.owner} maxLength={120} onChange={(e) => set((x) => void (x.approval.owner = e.target.value), "ao")} />
          </Field>
          <Field label="Care Operations">
            <input
              className={input}
              value={b.approval.operations}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.operations = e.target.value), "aop")}
            />
          </Field>
          <Field label="Clinical or Quality">
            <input
              className={input}
              value={b.approval.quality}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.quality = e.target.value), "aq")}
            />
          </Field>
          <Field label="Privacy">
            <input
              className={input}
              value={b.approval.privacy}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.privacy = e.target.value), "apr")}
            />
          </Field>
          <Field label="Communications">
            <input
              className={input}
              value={b.approval.communications}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.communications = e.target.value), "ac")}
            />
          </Field>
          <Field label="Signed off on">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((x) => void (x.approval.approvedOn = e.target.value))} />
          </Field>
        </div>
      </details>
    </div>
  );
}
