"use client";

import { cx } from "@/lib/format";
import type { PhoneCallBlock } from "@/lib/magazine";
import {
  ACTION_KINDS,
  freshPhoneCall,
  PERMISSIONS,
  PHONE_DIMENSIONS,
  PHONE_DIM_ORDER,
  PHONE_KINDS,
  phoneApproved,
  staleSources,
  type ActionKind,
  type Permission,
  type PhoneCase,
  type PhoneDim,
  type PhoneKind,
} from "@/lib/phonecall";
import { PHONE_CALLS } from "@/content/phoneCalls";
import { btn, Field, input } from "./ui";
import type { Update } from "./MagazineEditParts";
import { RoleplaySettings } from "./MagazineRoleplayEdit";
import { Icon } from "../Icon";

/*
  The editor for a Tough Phone Call (docs/tough-phone-call.md). The scene (who's calling, the states, what's worth
  doing, what's unsafe, the safety rules, voice, and Try a reply) is the shared roleplay editor. Below it is the
  phone case: who the caller is cleared for, the case tools and what each reveals, the restricted words, how each
  move is rated, an urgent cue, the policy pack, and Finance, Care Operations, Quality and Privacy sign-off.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const area = cx(input, "min-h-20 py-2");
const today = () => new Date().toISOString().slice(0, 10);

export function PhoneCallEdit({ block: b, update }: { block: PhoneCallBlock; update: Update }) {
  const set = (fn: (x: PhoneCallBlock) => void, tag?: string) => update<PhoneCallBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const ph = (fn: (p: PhoneCase) => void, tag?: string) => set((x) => fn(x.phone), tag && `ph:${tag}`);
  const p = b.phone;
  const rated = [
    ...b.roleplay.moves.map((m) => ({ id: m.id, text: m.text, risk: false })),
    ...b.roleplay.risks.map((r) => ({ id: r.id, text: r.text, risk: true })),
  ];
  const stale = staleSources(p, today());
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="phone" className="size-5" /> Tough Phone Call
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          phoneApproved(p) && !stale.length
            ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]"
            : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {phoneApproved(p)
          ? stale.length
            ? `Signed off, but ${stale.length === 1 ? "a source is" : `${stale.length} sources are`} past the review date.`
            : "Signed off: this call can be published."
          : `A draft: it can’t be published until ${p.kind === "billing" ? "Finance, " : ""}Care Operations, Quality and Privacy sign-off is recorded below.`}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Start from a pilot scene" className="min-w-60 flex-1">
          <select
            className={input}
            value=""
            onChange={(e) => {
              const c = PHONE_CALLS.find((x) => x.id === e.target.value);
              if (c && window.confirm(`Replace this call with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, freshPhoneCall(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {PHONE_CALLS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={b.title} maxLength={160} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Kind of call">
          <select className={input} value={p.kind} onChange={(e) => ph((x) => void (x.kind = e.target.value as PhoneKind))}>
            {(Object.keys(PHONE_KINDS) as PhoneKind[]).map((k) => (
              <option key={k} value={k}>
                {PHONE_KINDS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="The caller’s name" hint="Fictional. A first name is fine.">
          <input className={input} value={b.person} maxLength={80} onChange={(e) => set((x) => void (x.person = e.target.value), "person")} />
        </Field>
        <Field label="Who they are, as the learner sees it">
          <input className={input} value={b.role} maxLength={120} onChange={(e) => set((x) => void (x.role = e.target.value), "role")} />
        </Field>
        <Field label="The client the call is about">
          <input className={input} value={p.client} maxLength={80} onChange={(e) => ph((x) => void (x.client = e.target.value), "client")} />
        </Field>
        <Field label="Who the caller says they are">
          <input className={input} value={p.claims} maxLength={200} onChange={(e) => ph((x) => void (x.claims = e.target.value), "claims")} />
        </Field>
        <Field label="The setting" className="sm:col-span-2">
          <input className={input} value={b.setting} maxLength={600} onChange={(e) => set((x) => void (x.setting = e.target.value), "setting")} />
        </Field>
      </div>

      <h4 className="mt-5 font-serif text-lg font-semibold">The call</h4>
      <RoleplaySettings block={b} update={update} />

      <h4 className="mt-5 font-serif text-lg font-semibold">The phone case</h4>
      <div className="mt-2 flex flex-col gap-3">
        <div className={group}>
          <p className="font-semibold">What the caller may be told</p>
          <p className="text-xs text-ink-muted">
            Hidden until the learner checks. Restricted words said before then, or to anyone not authorised, are a privacy breach.
          </p>
          <Field label="Permission">
            <select className={input} value={p.permission.state} onChange={(e) => ph((x) => void (x.permission.state = e.target.value as Permission))}>
              {(Object.keys(PERMISSIONS) as Permission[]).map((k) => (
                <option key={k} value={k}>
                  {PERMISSIONS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What the check shows">
            <textarea
              className={area}
              value={p.permission.detail}
              maxLength={400}
              onChange={(e) => ph((x) => void (x.permission.detail = e.target.value), "pd")}
            />
          </Field>
          <Field label="Restricted words and numbers" hint="Separate with commas. Matched as whole words, like “itemised, 260”.">
            <input
              className={input}
              value={p.restricted.join(", ")}
              onChange={(e) =>
                ph(
                  (x) =>
                    void (x.restricted = e.target.value
                      .split(",")
                      .map((w) => w.trim())
                      .filter(Boolean)),
                  "restricted",
                )
              }
            />
          </Field>
        </div>

        <div className={group}>
          <p className="font-semibold">Case tools</p>
          <p className="text-xs text-ink-muted">Each reveals only what you write here. An urgent escalation appears only once its cue has been heard.</p>
          {p.actions.map((a, i) => (
            <div key={a.id} className="grid gap-2 rounded-xl bg-surface p-3 sm:grid-cols-[12rem_1fr]">
              <Field label="Kind">
                <select className={input} value={a.kind} onChange={(e) => ph((x) => void (x.actions[i].kind = e.target.value as ActionKind))}>
                  {(Object.keys(ACTION_KINDS) as ActionKind[]).map((k) => (
                    <option key={k} value={k}>
                      {ACTION_KINDS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Label">
                <input className={input} value={a.label} maxLength={80} onChange={(e) => ph((x) => void (x.actions[i].label = e.target.value), `al${i}`)} />
              </Field>
              <Field label="What it reveals, one fact per line" className="sm:col-span-2">
                <textarea
                  className={area}
                  value={a.facts.join("\n")}
                  onChange={(e) => ph((x) => void (x.actions[i].facts = e.target.value.split("\n").slice(0, 6)), `af${i}`)}
                />
              </Field>
              <button type="button" className={cx(btn.quiet, "justify-self-start")} onClick={() => ph((x) => void x.actions.splice(i, 1))}>
                <Icon name="trash" className="size-4" /> Remove
              </button>
            </div>
          ))}
          {p.actions.length < 8 && (
            <button
              type="button"
              className={cx(btn.secondary, "self-start")}
              onClick={() => ph((x) => void x.actions.push({ id: `tool-${Date.now().toString(36)}`, kind: "record", label: "", facts: [] }))}
            >
              <Icon name="plus" className="size-4" /> Add a case tool
            </button>
          )}
        </div>

        <div className={group}>
          <p className="font-semibold">How each move is rated</p>
          <p className="text-xs text-ink-muted">
            Every good and unsafe move counts towards one of the six dimensions, and can cite a source from the policy pack.
          </p>
          {rated.map((m) => (
            <div key={m.id} className="grid gap-2 rounded-xl bg-surface p-3 sm:grid-cols-2">
              <p className="text-sm sm:col-span-2">
                <span className="font-semibold">{m.risk ? "Unsafe: " : "Good: "}</span>
                {m.text || m.id}
              </p>
              <Field label="Dimension">
                <select className={input} value={p.dims[m.id] ?? ""} onChange={(e) => ph((x) => void (x.dims[m.id] = e.target.value as PhoneDim))}>
                  <option value="">Choose…</option>
                  {PHONE_DIM_ORDER.map((d) => (
                    <option key={d} value={d}>
                      {PHONE_DIMENSIONS[d]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Source">
                <select
                  className={input}
                  value={p.cite[m.id] ?? ""}
                  onChange={(e) =>
                    ph((x) => {
                      if (e.target.value) x.cite[m.id] = e.target.value;
                      else delete x.cite[m.id];
                    })
                  }
                >
                  <option value="">None</option>
                  {p.sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </Field>
              {m.risk && (
                <Field label="A better way to say it" className="sm:col-span-2">
                  <input
                    className={input}
                    value={p.alternatives[m.id] ?? ""}
                    maxLength={400}
                    onChange={(e) => ph((x) => void (x.alternatives[m.id] = e.target.value), `alt-${m.id}`)}
                  />
                </Field>
              )}
            </div>
          ))}
        </div>

        <div className={group}>
          <p className="font-semibold">Urgent cue (optional)</p>
          <p className="text-xs text-ink-muted">
            Something the caller says, after a set reply, that means the client may be without essential help now. The learner must then use the urgent
            escalation tool (or show one of the chosen moves) before the call ends, or it’s a critical issue.
          </p>
          {p.urgent ? (
            <>
              <Field label="What the caller says">
                <textarea className={area} value={p.urgent.cue} maxLength={400} onChange={(e) => ph((x) => void (x.urgent!.cue = e.target.value), "cue")} />
              </Field>
              <Field label="After reply">
                <input
                  type="number"
                  min={0}
                  max={6}
                  className={input}
                  value={p.urgent.afterTurn}
                  onChange={(e) => ph((x) => void (x.urgent!.afterTurn = Number(e.target.value)))}
                />
              </Field>
              <Field label="The escalation tool">
                <select className={input} value={p.urgent.actionId} onChange={(e) => ph((x) => void (x.urgent!.actionId = e.target.value))}>
                  <option value="">Choose…</option>
                  {p.actions
                    .filter((a) => a.kind === "escalate")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                </select>
              </Field>
              <fieldset className="flex flex-wrap gap-3">
                <legend className="text-sm font-semibold">Moves that also count as acting on it</legend>
                {b.roleplay.moves.map((m) => (
                  <label key={m.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={p.urgent!.moveIds.includes(m.id)}
                      onChange={() =>
                        ph(
                          (x) =>
                            void (x.urgent!.moveIds = x.urgent!.moveIds.includes(m.id)
                              ? x.urgent!.moveIds.filter((y) => y !== m.id)
                              : [...x.urgent!.moveIds, m.id]),
                        )
                      }
                    />
                    {m.text || m.id}
                  </label>
                ))}
              </fieldset>
              <button type="button" className={cx(btn.quiet, "self-start")} onClick={() => ph((x) => void (x.urgent = null))}>
                Remove the urgent cue
              </button>
            </>
          ) : (
            <button
              type="button"
              className={cx(btn.secondary, "self-start")}
              onClick={() =>
                ph((x) => void (x.urgent = { cue: "", afterTurn: 1, actionId: x.actions.find((a) => a.kind === "escalate")?.id ?? "", moveIds: [] }))
              }
            >
              <Icon name="plus" className="size-4" /> Add an urgent cue
            </button>
          )}
        </div>

        <div className={group}>
          <p className="font-semibold">Policy pack</p>
          <p className="text-xs text-ink-muted">Shown to learners during the call and cited in the debrief. A source past its review date stops publishing.</p>
          {p.sources.map((s, i) => (
            <div key={s.id} className="grid gap-2 rounded-xl bg-surface p-3 sm:grid-cols-2">
              <Field label="Title" className="sm:col-span-2">
                <input className={input} value={s.title} maxLength={200} onChange={(e) => ph((x) => void (x.sources[i].title = e.target.value), `st${i}`)} />
              </Field>
              <Field label="Excerpt" className="sm:col-span-2">
                <textarea
                  className={area}
                  value={s.excerpt}
                  maxLength={800}
                  onChange={(e) => ph((x) => void (x.sources[i].excerpt = e.target.value), `se${i}`)}
                />
              </Field>
              <Field label="Web address">
                <input className={input} value={s.url} maxLength={400} onChange={(e) => ph((x) => void (x.sources[i].url = e.target.value), `su${i}`)} />
              </Field>
              <Field label="Version">
                <input className={input} value={s.version} maxLength={80} onChange={(e) => ph((x) => void (x.sources[i].version = e.target.value), `sv${i}`)} />
              </Field>
              <Field label="Effective from">
                <input type="date" className={input} value={s.effectiveFrom} onChange={(e) => ph((x) => void (x.sources[i].effectiveFrom = e.target.value))} />
              </Field>
              <Field label="Review by" hint={stale.some((x) => x.id === s.id) ? "Past its review date." : undefined}>
                <input type="date" className={input} value={s.reviewBy} onChange={(e) => ph((x) => void (x.sources[i].reviewBy = e.target.value))} />
              </Field>
              <button type="button" className={cx(btn.quiet, "justify-self-start")} onClick={() => ph((x) => void x.sources.splice(i, 1))}>
                <Icon name="trash" className="size-4" /> Remove
              </button>
            </div>
          ))}
          {p.sources.length < 8 && (
            <button
              type="button"
              className={cx(btn.secondary, "self-start")}
              onClick={() =>
                ph(
                  (x) =>
                    void x.sources.push({
                      id: `src-${Date.now().toString(36)}`,
                      title: "",
                      excerpt: "",
                      url: "",
                      version: "",
                      effectiveFrom: "",
                      reviewBy: "",
                    }),
                )
              }
            >
              <Icon name="plus" className="size-4" /> Add a source
            </button>
          )}
        </div>

        <div className={group}>
          <p className="font-semibold">Sign-off</p>
          <p className="text-xs text-ink-muted">
            Finance approves billing calls; Care Operations the service and escalation steps; Quality complaints and regulated statements; Privacy what can be
            shared with whom.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["owner", "Content owner"],
                ["finance", `Finance${p.kind === "billing" ? "" : " (billing calls)"}`],
                ["operations", "Care Operations"],
                ["quality", "Quality"],
                ["privacy", "Privacy"],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <input className={input} value={p.approval[k]} maxLength={120} onChange={(e) => ph((x) => void (x.approval[k] = e.target.value), `ap-${k}`)} />
              </Field>
            ))}
            <Field label="Date signed off">
              <input type="date" className={input} value={p.approval.approvedOn} onChange={(e) => ph((x) => void (x.approval.approvedOn = e.target.value))} />
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}
