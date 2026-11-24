"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { HazardScanBlock } from "@/lib/magazine";
import {
  blankReview,
  blankVariant,
  CATEGORIES,
  CONCERNS,
  coverage,
  hazardScanHardProblems,
  MIN_APPROVED,
  OBJECT_KINDS,
  REVIEW_CHECKS,
  reviewProblems,
  ROLE_ORDER,
  ROOMS,
  SCENE_ROLES,
  sceneProblems,
  VARIANT_STATUS,
  VERDICTS,
  variantProblems,
  type ActionOption,
  type Concern,
  type HazardCategory,
  type ObjectKind,
  type RoomId,
  type SceneObject,
  type SceneRole,
  type Variant,
  type VariantStatus,
  type Verdict,
} from "@/lib/hazardScan";
import { HAZARD_SOURCES, sourceStatus } from "@/lib/hazardSources";
import { SEED_SNIPPETS } from "@/content/playbooks";
import { useHydrated } from "@/lib/store";
import { SCENE_H, SCENE_PALETTE, SCENE_W, SceneArt } from "../hazard/SceneArt";
import { btn, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The Spot the Hazard editor (docs/spot-the-hazard.md): the PRD's guided author workflow, not a raw coordinate form.

  1. Purpose: who plays it, the room, the person and care-plan facts, the task, practice or assessed, the rules.
  2. Scene and items: each variant drawn live. Choose an object to edit its look, place, tap region, neutral
     description and answer key; "Place it here" moves it to where you click. Regions are outlined, and overlaps,
     edges and small targets are flagged as you go.
  3. Actions: role-specific responses for each priority hazard, with what each leaves out and its feedback.
  4. Review and publish: each variant's named reviewer and checks, its status, coverage by role, the release
     sign-off and the publication preflight. Changing an approved variant makes it a new draft version.
  5. Results and placements: totals by variant and item for this course, and every place it's live.

  AI assistance is a disabled stub: nothing is generated or sent anywhere.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const TABS = ["Purpose", "Scene and items", "Actions", "Review and publish", "Results and placements"] as const;
const n = (v: string, d: number) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);

export function HazardScanEdit({ block: b, update }: { block: HazardScanBlock; update: Update }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Purpose");
  const set = (fn: (x: HazardScanBlock) => void, tag?: string) => update<HazardScanBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const hydrated = useHydrated();
  // Dates are checked once in the browser, so the server and the browser draw the same thing first.
  const today = hydrated ? new Date().toISOString().slice(0, 10) : "2000-01-01";
  const hard = hazardScanHardProblems(b, today);
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="eye" className="size-5" /> Spot the Hazard
      </p>
      <p
        role="status"
        className={cx("mb-3 rounded-xl px-3 py-2 text-sm", hard.length ? "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]" : "bg-muted")}
      >
        {hard.length ? `Not ready to publish: ${hard.length} thing${hard.length === 1 ? "" : "s"} to resolve (see Review and publish).` : "Ready to publish."}
      </p>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Spot the Hazard editor">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx(btn.secondary, tab === t && "border-ink bg-ink text-surface")}
          >
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tab}>
        {tab === "Purpose" && <Purpose b={b} set={set} />}
        {tab === "Scene and items" && <SceneItems b={b} set={set} today={today} />}
        {tab === "Actions" && <Actions b={b} set={set} />}
        {tab === "Review and publish" && <ReviewPublish b={b} set={set} today={today} hard={hard} />}
        {tab === "Results and placements" && <Results b={b} />}
      </div>
    </div>
  );
}

type Set = (fn: (x: HazardScanBlock) => void, tag?: string) => void;

function Purpose({ b, set }: { b: HazardScanBlock; set: Set }) {
  const text = (label: string, value: string, apply: (x: HazardScanBlock, v: string) => void, tag: string, hint?: string, long = false) => (
    <Field label={label} hint={hint}>
      {long ? (
        <textarea className={cx(input, "min-h-24 py-2")} value={value} onChange={(e) => set((x) => apply(x, e.target.value), tag)} />
      ) : (
        <input className={input} value={value} onChange={(e) => set((x) => apply(x, e.target.value), tag)} />
      )}
    </Field>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className={group}>
        {text("Title", b.title, (x, v) => void (x.title = v), "title")}
        {text("Introduction", b.intro, (x, v) => void (x.intro = v), "intro", undefined, true)}
        {text("Learning objective", b.objective, (x, v) => void (x.objective = v), "objective", "Notice → judge priority → respond within the role.", true)}
        <div className="grid gap-3 sm:grid-cols-2">
          {text(
            "Scene family id",
            b.familyId,
            (x, v) =>
              void (x.familyId = v
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "-")
                .slice(0, 48)),
            "family",
            "Stable across releases.",
          )}
          {text("Release", b.release, (x, v) => void (x.release = v.slice(0, 20)), "release", "What reviewers sign off. Change it for a new release.")}
        </div>
        <Field
          label="Format"
          hint="Guided practice: feedback and retries, no pass or fail. An assessed check needs a governed Question Pool placement, which isn’t built yet, so it can’t be published."
        >
          <select className={input} value={b.mode} onChange={(e) => set((x) => void (x.mode = e.target.value === "assessed" ? "assessed" : "practice"))}>
            <option value="practice">Guided practice</option>
            <option value="assessed">Assessed check (not available yet)</option>
          </select>
        </Field>
      </div>
      <div className={group}>
        <p className="font-semibold">Who plays it</p>
        <p className="text-sm text-ink-muted">
          A learner plays the role their Hub audience maps to (Care Partners as workers, coordinators and staff as coordinators), if it’s offered here.
        </p>
        {ROLE_ORDER.map((r) => (
          <label key={r} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5"
              checked={b.roles.includes(r)}
              onChange={(e) =>
                set((x) => void (x.roles = e.target.checked ? ROLE_ORDER.filter((y) => y === r || x.roles.includes(y)) : x.roles.filter((y) => y !== r)))
              }
            />
            {SCENE_ROLES[r]}
          </label>
        ))}
      </div>
      <div className={group}>
        <p className="font-semibold">Set the scene</p>
        <Field label="Room">
          <select className={input} value={b.room} onChange={(e) => set((x) => void (x.room = e.target.value as RoomId))}>
            {(Object.keys(ROOMS) as RoomId[]).map((r) => (
              <option key={r} value={r}>
                {ROOMS[r].label}
              </option>
            ))}
          </select>
        </Field>
        {text(
          "The person",
          b.person.name,
          (x, v) => void (x.person.name = v),
          "person",
          "A recurring character from the library, keeping their established facts.",
        )}
        {text(`About ${b.person.name || "them"}`, b.person.about, (x, v) => void (x.person.about = v), "about", undefined, true)}
        {text("From the care plan", b.carePlan, (x, v) => void (x.carePlan = v), "careplan", "What the worker would know. Fictional.", true)}
        {text("What the learner is about to do", b.task, (x, v) => void (x.task = v), "task", undefined, true)}
        <p className="text-sm font-semibold">Areas of the room (for List the room, in this order)</p>
        {b.areas.map((a, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              className={cx(input, "w-40")}
              aria-label={`Area ${i + 1} id`}
              value={a.id}
              onChange={(e) => set((x) => void (x.areas[i].id = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")), `area-id-${i}`)}
            />
            <input
              className={cx(input, "min-w-0 flex-1")}
              aria-label={`Area ${i + 1} name`}
              value={a.label}
              onChange={(e) => set((x) => void (x.areas[i].label = e.target.value), `area-${i}`)}
            />
            <button type="button" className={btn.quiet} onClick={() => set((x) => void x.areas.splice(i, 1))}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className={cx(btn.quiet, "self-start")} onClick={() => set((x) => void x.areas.push({ id: rid("area"), label: "" }))}>
          <Icon name="plus" className="size-4" /> Add an area
        </button>
      </div>
      <div className={group}>
        <p className="font-semibold">Rules for every variant</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["minHazards", "Fewest hazards"],
              ["maxHazards", "Most hazards"],
              ["minSafe", "Fewest safe, everyday items"],
              ["minHigh", "Hazards to deal with first, at least"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input
                className={input}
                inputMode="numeric"
                value={b.rules[k]}
                onChange={(e) => set((x) => void (x.rules[k] = Math.max(0, Math.min(10, Math.floor(n(e.target.value, 0))))), k)}
              />
            </Field>
          ))}
          <Field label="Action questions per attempt">
            <select className={input} value={b.rules.decisions} onChange={(e) => set((x) => void (x.rules.decisions = e.target.value === "2" ? 2 : 1))}>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5" checked={b.askReason} onChange={(e) => set((x) => void (x.askReason = e.target.checked))} />
          Learners can say why they flagged something (trip or fall, equipment, infection control, other, not sure)
        </label>
      </div>
      <div className={group}>
        {text("Why it matters (the debrief)", b.debrief, (x, v) => void (x.debrief = v), "debrief", undefined, true)}
        <p className="text-sm font-semibold">Job Aids shown with the debrief</p>
        <datalist id={`${b.id}-aids`}>
          {SEED_SNIPPETS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.data.title}
            </option>
          ))}
        </datalist>
        {b.jobAids.map((a, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[14rem_1fr_auto]">
            <input
              className={input}
              list={`${b.id}-aids`}
              aria-label={`Job Aid ${i + 1}`}
              value={a.snippetId}
              onChange={(e) => set((x) => void (x.jobAids[i].snippetId = e.target.value), `aid-${i}`)}
            />
            <input
              className={input}
              aria-label={`Why Job Aid ${i + 1} belongs here`}
              value={a.why}
              onChange={(e) => set((x) => void (x.jobAids[i].why = e.target.value), `aid-why-${i}`)}
            />
            <button type="button" className={btn.quiet} onClick={() => set((x) => void x.jobAids.splice(i, 1))}>
              Remove
            </button>
          </div>
        ))}
        {b.jobAids.length < 3 && (
          <button type="button" className={cx(btn.quiet, "self-start")} onClick={() => set((x) => void x.jobAids.push({ snippetId: "", why: "" }))}>
            <Icon name="plus" className="size-4" /> Add a Job Aid
          </button>
        )}
      </div>
    </div>
  );
}

const blankObject = (kind: ObjectKind, area: string): SceneObject => ({
  id: rid(kind).replace(/[^a-z0-9-]/g, ""),
  concept: kind,
  kind,
  look: OBJECT_KINDS[kind].looks[0],
  x: 50,
  y: 50,
  scale: 1,
  hit: { w: 12, h: 14 },
  area,
  label: OBJECT_KINDS[kind].label,
  description: "",
  key: { hazard: false, category: "", priority: 0, critical: false, weight: 1, feature: "", explain: "", source: "" },
});

/** Changing what a learner sees or is scored on: an approved variant becomes a new draft version, reviewed again. */
function changeVariant(x: HazardScanBlock, vid: string, fn: (v: Variant) => void) {
  const v = x.variants.find((y) => y.id === vid);
  if (!v) return;
  fn(v);
  if (v.status === "approved" || v.status === "review") {
    if (v.status === "approved") v.version += 1;
    v.status = "draft";
    v.review = blankReview();
  }
}

function SceneItems({ b, set, today }: { b: HazardScanBlock; set: Set; today: string }) {
  const [vid, setVid] = useState(b.variants[0]?.id ?? "");
  const [sel, setSel] = useState("");
  const [placing, setPlacing] = useState(false);
  const [addKind, setAddKind] = useState<ObjectKind>("plant");
  const v = b.variants.find((x) => x.id === vid) ?? b.variants[0];
  const sv = (fn: (v: Variant) => void, tag?: string) => v && set((x) => changeVariant(x, v.id, fn), tag && `${v.id}:${tag}`);
  const o = v?.objects.find((x) => x.id === sel);
  const so = (fn: (o: SceneObject) => void, tag?: string) => o && sv((y) => fn(y.objects.find((z) => z.id === o.id)!), tag && `${o.id}:${tag}`);
  const problems = v ? variantProblems(b, v, today) : [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Variants">
        {b.variants.map((x, i) => (
          <button
            key={x.id}
            type="button"
            aria-pressed={x.id === v?.id}
            onClick={() => (setVid(x.id), setSel(""))}
            className={cx(btn.secondary, x.id === v?.id && "border-ink bg-ink text-surface")}
          >
            {i + 1}. {x.label || x.id}{" "}
            <span className="text-xs">
              (v{x.version}, {VARIANT_STATUS[x.status].toLowerCase()})
            </span>
          </button>
        ))}
        <button
          type="button"
          className={btn.quiet}
          onClick={() => {
            const id = rid("variant");
            set((x) => void x.variants.push(blankVariant(id, `Variant ${x.variants.length + 1}`)));
            setVid(id);
          }}
        >
          <Icon name="plus" className="size-4" /> New variant
        </button>
        {v && (
          <button
            type="button"
            className={btn.quiet}
            onClick={() => {
              const id = rid("variant");
              set((x) => void x.variants.push({ ...structuredClone(v), id, version: 1, label: `${v.label} (copy)`, status: "draft", review: blankReview() }));
              setVid(id);
            }}
          >
            <Icon name="copy" className="size-4" /> Duplicate
          </button>
        )}
        {v && b.variants.indexOf(v) > 0 && (
          <button
            type="button"
            className={btn.quiet}
            onClick={() =>
              set((x) => {
                const i = x.variants.findIndex((y) => y.id === v.id);
                if (i > 0) [x.variants[i - 1], x.variants[i]] = [x.variants[i], x.variants[i - 1]];
              })
            }
          >
            <Icon name="arrow-left" className="size-4" /> Move earlier
          </button>
        )}
      </div>
      {!v ? (
        <p className="text-sm">Add a variant to start drawing the room.</p>
      ) : (
        <>
          {v.status !== "draft" && (
            <p className="rounded-xl bg-muted px-3 py-2 text-sm">
              This variant is {VARIANT_STATUS[v.status].toLowerCase()}. Changing what it shows or how it’s scored makes it a new draft
              {v.status === "approved" ? ` (version ${v.version + 1})` : ""}, reviewed again. Attempts already made keep the version they had.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Variant name (authors only)">
              <input
                className={input}
                value={v.label}
                onChange={(e) => set((x) => void (x.variants.find((y) => y.id === v.id)!.label = e.target.value), `${v.id}:label`)}
              />
            </Field>
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-semibold">Roles this variant suits (none ticked: every role)</p>
              <div className="flex flex-wrap gap-3">
                {b.roles.map((r) => (
                  <label key={r} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={v.roles.includes(r)}
                      onChange={(e) => sv((y) => void (y.roles = e.target.checked ? [...y.roles, r] : y.roles.filter((z) => z !== r)))}
                    />
                    {SCENE_ROLES[r]}
                  </label>
                ))}
              </div>
            </div>
          </div>
          {ROOMS[b.room].dimmable && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={v.dim} onChange={(e) => sv((y) => void (y.dim = e.target.checked))} />
              Draw the hallway dim
            </label>
          )}
          <p className="text-sm text-ink-muted">
            {placing
              ? "Click the picture where the selected object should go."
              : "Choose an object on the picture or in the list. Regions: solid for hazards, dashed for safe items."}
          </p>
          <div className={cx("relative aspect-[3/2] w-full overflow-hidden rounded-2xl ring-1 ring-line", SCENE_PALETTE, placing && "cursor-crosshair")}>
            <div className="absolute inset-0 bg-[var(--hz-wall)]">
              <SceneArt room={b.room} dim={v.dim} objects={v.objects} label={`Variant ${v.label}`}>
                {v.objects.map((x) => (
                  <g key={x.id} pointerEvents="none">
                    <rect
                      x={((x.x - x.hit.w / 2) / 100) * SCENE_W}
                      y={((x.y - x.hit.h / 2) / 100) * SCENE_H}
                      width={(x.hit.w / 100) * SCENE_W}
                      height={(x.hit.h / 100) * SCENE_H}
                      fill={x.id === sel ? "rgb(11 87 208 / 0.18)" : "none"}
                      stroke={x.key.hazard ? "#b3261e" : "#0b57d0"}
                      strokeWidth={x.id === sel ? 6 : 3}
                      strokeDasharray={x.key.hazard ? undefined : "10 8"}
                    />
                    <text
                      x={((x.x - x.hit.w / 2) / 100) * SCENE_W + 6}
                      y={((x.y - x.hit.h / 2) / 100) * SCENE_H + 22}
                      fontSize={20}
                      fontWeight={700}
                      fill="#111"
                      stroke="#fff"
                      strokeWidth={4}
                      paintOrder="stroke"
                    >
                      {x.label}
                    </text>
                  </g>
                ))}
              </SceneArt>
            </div>
            <button
              type="button"
              aria-label={placing ? "Place the selected object where you click" : "Choose an object by clicking it"}
              className="absolute inset-0"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const px = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10;
                const py = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
                if (placing && o) {
                  so((y) => {
                    y.x = px;
                    y.y = py;
                  });
                  setPlacing(false);
                  return;
                }
                const hit = [...v.objects].reverse().find((x) => Math.abs(x.x - px) <= x.hit.w / 2 && Math.abs(x.y - py) <= x.hit.h / 2);
                if (hit) setSel(hit.id);
              }}
            />
          </div>
          {problems.length > 0 && (
            <ul className="list-disc rounded-xl bg-[#fff1cc] py-2 pl-8 pr-3 text-sm text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Add an object">
              <select className={input} value={addKind} onChange={(e) => setAddKind(e.target.value as ObjectKind)}>
                {(Object.keys(OBJECT_KINDS) as ObjectKind[]).map((k) => (
                  <option key={k} value={k}>
                    {OBJECT_KINDS[k].label}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              className={btn.secondary}
              onClick={() => {
                const ob = blankObject(addKind, b.areas[0]?.id ?? "");
                sv((y) => void y.objects.push(ob));
                setSel(ob.id);
              }}
            >
              <Icon name="plus" className="size-4" /> Add
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {v.objects.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  aria-expanded={x.id === sel}
                  onClick={() => setSel(x.id === sel ? "" : x.id)}
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-muted px-3 text-left text-sm"
                >
                  <span className="font-semibold">{x.label || x.id}</span>
                  <span>
                    {x.key.hazard ? `Hazard · ${CATEGORIES[x.key.category || "other"]} · priority ${x.key.priority}` : "Safe in this context"} · {x.x}%, {x.y}%
                  </span>
                </button>
                {x.id === sel && o && (
                  <ObjectFields
                    b={b}
                    o={o}
                    so={so}
                    remove={() => (sv((y) => void (y.objects = y.objects.filter((z) => z.id !== x.id))), setSel(""))}
                    place={() => setPlacing(true)}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ObjectFields({
  b,
  o,
  so,
  remove,
  place,
}: {
  b: HazardScanBlock;
  o: SceneObject;
  so: (fn: (o: SceneObject) => void, tag?: string) => void;
  remove: () => void;
  place: () => void;
}) {
  const num = (label: string, value: number, apply: (o: SceneObject, v: number) => void, tag: string) => (
    <Field label={label}>
      <input className={input} inputMode="decimal" value={value} onChange={(e) => so((y) => apply(y, n(e.target.value, value)), tag)} />
    </Field>
  );
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-line p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Short name (neutral)">
          <input className={input} value={o.label} onChange={(e) => so((y) => void (y.label = e.target.value), "label")} />
        </Field>
        <Field label="Where it is">
          <select className={input} value={o.area} onChange={(e) => so((y) => void (y.area = e.target.value))}>
            <option value="">Choose…</option>
            {b.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="What a sighted learner can see" hint="For the list and screen readers. Describe it; never say whether it’s a hazard.">
        <textarea
          className={cx(input, "min-h-20 py-2")}
          value={o.description}
          onChange={(e) => so((y) => void (y.description = e.target.value), "description")}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Drawing">
          <select
            className={input}
            value={o.kind}
            onChange={(e) =>
              so((y) => {
                y.kind = e.target.value as ObjectKind;
                y.look = OBJECT_KINDS[y.kind].looks[0];
              })
            }
          >
            {(Object.keys(OBJECT_KINDS) as ObjectKind[]).map((k) => (
              <option key={k} value={k}>
                {OBJECT_KINDS[k].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Look">
          <select className={input} value={o.look} onChange={(e) => so((y) => void (y.look = e.target.value))}>
            {OBJECT_KINDS[o.kind].looks.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Concept (same thing across variants)">
          <input
            className={input}
            value={o.concept}
            onChange={(e) => so((y) => void (y.concept = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")), "concept")}
          />
        </Field>
        {num("Across (%)", o.x, (y, v) => void (y.x = Math.max(0, Math.min(100, v))), "x")}
        {num("Down (%)", o.y, (y, v) => void (y.y = Math.max(0, Math.min(100, v))), "y")}
        {num("Size", o.scale, (y, v) => void (y.scale = Math.max(0.4, Math.min(2.5, v))), "scale")}
        {num("Tap region width (%)", o.hit.w, (y, v) => void (y.hit.w = Math.max(2, Math.min(60, v))), "w")}
        {num("Tap region height (%)", o.hit.h, (y, v) => void (y.hit.h = Math.max(2, Math.min(60, v))), "h")}
        <div className="flex items-end">
          <button type="button" className={btn.secondary} onClick={place}>
            <Icon name="target" className="size-4" /> Place it on the picture
          </button>
        </div>
      </div>
      <fieldset className="flex flex-col gap-3 rounded-xl bg-muted p-3">
        <legend className="px-1 font-semibold">Answer key (never sent to learners before they submit)</legend>
        <div className="flex flex-wrap gap-4">
          {[
            [true, "A hazard in this scene"],
            [false, "Safe in this context"],
          ].map(([h, label]) => (
            <label key={String(h)} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                className="size-5"
                checked={o.key.hazard === h}
                onChange={() =>
                  so((y) => {
                    y.key.hazard = h as boolean;
                    y.key.category = h ? y.key.category || "fall" : "";
                    y.key.priority = h ? y.key.priority || 2 : 0;
                    if (!h) y.key.critical = false;
                  })
                }
              />
              {label as string}
            </label>
          ))}
        </div>
        {o.key.hazard && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Category">
              <select className={input} value={o.key.category} onChange={(e) => so((y) => void (y.key.category = e.target.value as HazardCategory))}>
                {(Object.keys(CATEGORIES) as HazardCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIES[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select className={input} value={o.key.priority} onChange={(e) => so((y) => void (y.key.priority = Number(e.target.value) as 1 | 2 | 3))}>
                <option value={3}>3: deal with it first</option>
                <option value={2}>2: this visit</option>
                <option value={1}>1: worth raising</option>
              </select>
            </Field>
            <Field label="Weight (importance, not size)">
              <select className={input} value={o.key.weight} onChange={(e) => so((y) => void (y.key.weight = Number(e.target.value) as 1 | 2 | 3))}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </Field>
            <label className="flex min-h-11 items-center gap-2 sm:col-span-3">
              <input type="checkbox" className="size-5" checked={o.key.critical} onChange={(e) => so((y) => void (y.key.critical = e.target.checked))} />
              Critical: missing it caps recognition (only where the approved policy supports it)
            </label>
          </div>
        )}
        {o.key.hazard && (
          <Field label="Exactly what is depicted" hint="For the reviewer to check against the drawing.">
            <textarea
              className={cx(input, "min-h-16 py-2")}
              value={o.key.feature}
              onChange={(e) => so((y) => void (y.key.feature = e.target.value), "feature")}
            />
          </Field>
        )}
        <Field label={o.key.hazard ? "Why it matters in this scene" : "Why it isn’t a hazard here"}>
          <textarea
            className={cx(input, "min-h-16 py-2")}
            value={o.key.explain}
            onChange={(e) => so((y) => void (y.key.explain = e.target.value), "explain")}
          />
        </Field>
        <Field label="Source">
          <select className={input} value={o.key.source} onChange={(e) => so((y) => void (y.key.source = e.target.value))}>
            <option value="">Choose…</option>
            {HAZARD_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
                {s.placeholder ? " (placeholder)" : ""}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>
      <button type="button" className={cx(btn.quiet, "self-start text-danger")} onClick={remove}>
        <Icon name="trash" className="size-4" /> Remove from this variant
      </button>
    </div>
  );
}

function Actions({ b, set }: { b: HazardScanBlock; set: Set }) {
  const concepts = [...new Set(b.variants.flatMap((v) => v.objects.filter((o) => o.key.hazard).map((o) => o.concept)))];
  // Actions decide scoring: changing one makes every variant asking it a new draft.
  const sd = (i: number, fn: (x: HazardScanBlock) => void, tag?: string) =>
    set((x) => {
      const concept = x.decisions[i]?.concept;
      fn(x);
      for (const v of x.variants) if (v.objects.some((o) => o.concept === concept && o.key.hazard)) changeVariant(x, v.id, () => undefined);
    }, tag);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        For each hazard concept that can come first, the responses a learner in each role can choose. Leave an option’s roles unticked to offer it to every
        role. Each role needs at least two options and one best one. Changing an action sends the variants that ask it back to draft.
      </p>
      {b.decisions.map((d, i) => (
        <div key={d.id} className={group}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="About (hazard concept)">
              <select className={input} value={d.concept} onChange={(e) => sd(i, (x) => void (x.decisions[i].concept = e.target.value))}>
                {[...new Set([d.concept, ...concepts])].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source">
              <select className={input} value={d.source} onChange={(e) => sd(i, (x) => void (x.decisions[i].source = e.target.value))}>
                <option value="">Choose…</option>
                {HAZARD_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Question">
            <input className={input} value={d.prompt} onChange={(e) => sd(i, (x) => void (x.decisions[i].prompt = e.target.value), `${d.id}:prompt`)} />
          </Field>
          {d.options.map((op, j) => (
            <OptionFields
              key={op.id}
              b={b}
              op={op}
              set={(fn, tag) => sd(i, (x) => fn(x.decisions[i].options[j]), tag && `${op.id}:${tag}`)}
              remove={() => sd(i, (x) => void x.decisions[i].options.splice(j, 1))}
            />
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btn.quiet}
              onClick={() =>
                sd(i, (x) => void x.decisions[i].options.push({ id: rid("option"), text: "", roles: [], verdict: "acceptable", ignores: [], feedback: "" }))
              }
            >
              <Icon name="plus" className="size-4" /> Add a response
            </button>
            <button type="button" className={btn.quiet} onClick={() => sd(i, (x) => void x.decisions.splice(i, 1))}>
              <Icon name="trash" className="size-4" /> Remove this action
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className={cx(btn.secondary, "self-start")}
        onClick={() => set((x) => void x.decisions.push({ id: rid("action"), concept: concepts[0] ?? "", prompt: "", source: "", options: [] }))}
      >
        <Icon name="plus" className="size-4" /> Add an action
      </button>
    </div>
  );
}

function OptionFields({
  b,
  op,
  set,
  remove,
}: {
  b: HazardScanBlock;
  op: ActionOption;
  set: (fn: (o: ActionOption) => void, tag?: string) => void;
  remove: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
      <Field label="Response">
        <textarea className={cx(input, "min-h-16 py-2")} value={op.text} onChange={(e) => set((o) => void (o.text = e.target.value), "text")} />
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Judged as">
          <select className={input} value={op.verdict} onChange={(e) => set((o) => void (o.verdict = e.target.value as Verdict))}>
            {(Object.keys(VERDICTS) as Verdict[]).map((k) => (
              <option key={k} value={k}>
                {VERDICTS[k]}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap gap-3 text-sm">
          {b.roles.map((r) => (
            <label key={r} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="size-5"
                checked={op.roles.includes(r)}
                onChange={(e) => set((o) => void (o.roles = e.target.checked ? [...o.roles, r] : o.roles.filter((z: SceneRole) => z !== r)))}
              />
              {SCENE_ROLES[r]}
            </label>
          ))}
        </div>
      </div>
      <p className="text-sm font-semibold">What it leaves out</p>
      <div className="flex flex-wrap gap-3 text-sm">
        {(Object.keys(CONCERNS) as Concern[]).map((c) => (
          <label key={c} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5"
              checked={op.ignores.includes(c)}
              onChange={(e) => set((o) => void (o.ignores = e.target.checked ? [...o.ignores, c] : o.ignores.filter((z) => z !== c)))}
            />
            {CONCERNS[c]}
          </label>
        ))}
      </div>
      <Field label="Feedback">
        <textarea className={cx(input, "min-h-16 py-2")} value={op.feedback} onChange={(e) => set((o) => void (o.feedback = e.target.value), "feedback")} />
      </Field>
      <button type="button" className={cx(btn.quiet, "self-start")} onClick={remove}>
        Remove this response
      </button>
    </div>
  );
}

function ReviewPublish({ b, set, today, hard }: { b: HazardScanBlock; set: Set; today: string; hard: string[] }) {
  const sp = sceneProblems(b);
  return (
    <div className="flex flex-col gap-4">
      <div className={group}>
        <p className="font-semibold">AI assistance</p>
        <button type="button" className={btn.secondary} disabled aria-describedby={`${b.id}-ai-note`}>
          <Icon name="spark" className="size-4" /> Suggest hazards, variants and feedback
        </button>
        <p id={`${b.id}-ai-note`} className="text-sm text-ink-muted">
          Not available in this release, and nothing is sent anywhere. When it is: every suggestion is labelled Unverified until a person checks it, you see
          what would be sent before anything is, a real client’s home is never sent, and nothing it proposes can publish a hazard, object or answer without
          review.
        </p>
      </div>
      {b.variants.map((v) => {
        const vp = variantProblems(b, v, today);
        const rp = reviewProblems(v);
        const sr = (fn: (v: Variant) => void, tag?: string) => set((x) => fn(x.variants.find((y) => y.id === v.id)!), tag && `${v.id}:${tag}`);
        return (
          <div key={v.id} className={group}>
            <p className="font-semibold">
              {v.label || v.id} <span className="text-sm font-normal">(version {v.version})</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Named reviewer">
                <input className={input} value={v.review.reviewer} onChange={(e) => sr((y) => void (y.review.reviewer = e.target.value), "reviewer")} />
              </Field>
              <Field label="Reviewed on">
                <input type="date" className={input} value={v.review.reviewedOn} onChange={(e) => sr((y) => void (y.review.reviewedOn = e.target.value))} />
              </Field>
              <Field label="Status">
                <select
                  className={input}
                  value={v.status}
                  onChange={(e) => {
                    const s = e.target.value as VariantStatus;
                    sr((y) => void (y.status = s));
                  }}
                >
                  {(Object.keys(VARIANT_STATUS) as VariantStatus[]).map((s) => (
                    <option key={s} value={s} disabled={s === "approved" && (vp.length > 0 || rp.length > 0)}>
                      {VARIANT_STATUS[s]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-semibold">The reviewer checked, on the drawing as learners see it</legend>
              {REVIEW_CHECKS.map(([k, label]) => (
                <label key={k} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-5" checked={v.review[k]} onChange={(e) => sr((y) => void (y.review[k] = e.target.checked))} />
                  {label}
                </label>
              ))}
            </fieldset>
            <Field label="Review note">
              <input className={input} value={v.review.note} onChange={(e) => sr((y) => void (y.review.note = e.target.value), "note")} />
            </Field>
            {(vp.length > 0 || rp.length > 0) && (
              <details>
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Why it can’t be approved yet ({vp.length + rp.length})</summary>
                <ul className="list-disc pl-5 text-sm">
                  {[...vp, ...rp].map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}
      <div className={group}>
        <p className="font-semibold">Coverage</p>
        <ul className="list-disc pl-5 text-sm">
          {coverage(b, today).map((c) => (
            <li key={c.role}>
              {SCENE_ROLES[c.role]}: {c.note}
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-muted">
          At least {MIN_APPROVED} approved variants are needed, so a retry can be a different room. Learners are told when a room repeats.
        </p>
      </div>
      <div className={group}>
        <p className="font-semibold">Release sign-off</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["quality", "Quality (safety, infection and clinical claims)"],
              ["policy", "Policy owner (the procedures cited)"],
              ["learning", "Learning reviewer (accessibility and feedback)"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input className={input} value={b.approval[k]} onChange={(e) => set((x) => void (x.approval[k] = e.target.value), `approval-${k}`)} />
            </Field>
          ))}
          <Field label="Release they reviewed">
            <input
              className={input}
              value={b.approval.releaseReviewed}
              onChange={(e) => set((x) => void (x.approval.releaseReviewed = e.target.value), "approval-release")}
            />
          </Field>
          <Field label="Approved on">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((x) => void (x.approval.approvedOn = e.target.value))} />
          </Field>
          <Field label="Review by">
            <input type="date" className={input} value={b.approval.reviewBy} onChange={(e) => set((x) => void (x.approval.reviewBy = e.target.value))} />
          </Field>
        </div>
      </div>
      <div className={group}>
        <p className="font-semibold">Sources this scene rests on</p>
        <ul className="list-disc pl-5 text-sm">
          {[...new Set(b.variants.flatMap((v) => v.objects.map((o) => o.key.source)).concat(b.decisions.map((d) => d.source)))].filter(Boolean).map((id) => {
            const s = HAZARD_SOURCES.find((x) => x.id === id);
            return (
              <li key={id}>
                {s?.title ?? id}: {sourceStatus(id, today).replace("-", " ")}
                {s?.placeholder ? " (placeholder: replace before approving)" : ""}
              </li>
            );
          })}
        </ul>
      </div>
      <div className={group}>
        <p className="font-semibold">Publication preflight</p>
        {hard.length ? (
          <ul className="list-disc pl-5 text-sm">
            {[...new Set([...sp, ...hard])].map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">Every check passes.</p>
        )}
      </div>
    </div>
  );
}

type Stats = {
  blocks: {
    blockId: string;
    attempts: number;
    people: number;
    submitted: number;
    completed: number;
    retries: number;
    repeats: number;
    routes: { image: number; list: number; both: number };
    variants: {
      variantId: string;
      version: number;
      attempts: number;
      submitted: number;
      people: number;
      suppressed: boolean;
      items: { id: string; label: string; hazard: boolean; found: number; missed: number; mistaken: number; unclear: number }[] | null;
      choices: Record<string, number> | null;
    }[];
  }[];
};
type Placements = {
  scenes: { guideId: string; block: string; release: string; placements: { label: string }[]; variants: { id: string; version: number; reviewer: string }[] }[];
};

function Results({ b }: { b: HazardScanBlock }) {
  const { id: guideId } = useParams<{ id: string }>();
  const stats = useApi<Stats>(guideId ? `/api/magazine/${guideId}/hazardscan?stats=1` : null);
  const live = useApi<Placements>("/api/admin/hazard-scenes");
  const s = stats.data?.blocks.find((x) => x.blockId === b.id);
  const here = live.data?.scenes.find((x) => x.guideId === guideId && x.block === b.id);
  const text = (id: string) => b.decisions.flatMap((d) => d.options).find((o) => o.id === id)?.text ?? id;
  return (
    <div className="flex flex-col gap-4">
      <div className={group}>
        <p className="font-semibold">Where it’s live</p>
        {here ? (
          <ul className="list-disc pl-5 text-sm">
            {here.placements.map((p) => (
              <li key={p.label}>{p.label}</li>
            ))}
            <li>
              Release {here.release}, approved variants: {here.variants.map((v) => `${v.id} v${v.version} (${v.reviewer})`).join("; ") || "none"}
            </li>
          </ul>
        ) : (
          <p className="text-sm">Not live: the published version of this course doesn’t have this scene.</p>
        )}
        <p className="text-sm text-ink-muted">
          For every live scene and the sources it rests on, use GET /api/admin/hazard-scenes (with ?source= to trace one source).
        </p>
      </div>
      <div className={group}>
        <p className="font-semibold">Results</p>
        {!s ? (
          <p className="text-sm">No attempts yet.</p>
        ) : (
          <>
            <p className="text-sm">
              {s.attempts} attempts by {s.people} {s.people === 1 ? "person" : "people"}; {s.submitted} submitted findings, {s.completed} completed, {s.retries}{" "}
              retries, {s.repeats} repeats. Route: picture {s.routes.image}, list {s.routes.list}, both {s.routes.both}.
            </p>
            {s.variants.map((v) => (
              <div key={`${v.variantId}@${v.version}`} className="rounded-xl bg-surface p-3 text-sm">
                <p className="font-semibold">
                  {v.variantId} v{v.version}: {v.submitted} submitted by {v.people} {v.people === 1 ? "person" : "people"}
                </p>
                {v.suppressed || !v.items ? (
                  <p>Fewer than five people: only counts are shown.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="mt-2 w-full text-left">
                      <thead>
                        <tr>
                          <th className="pr-3">Item</th>
                          <th className="pr-3">Found</th>
                          <th className="pr-3">Missed</th>
                          <th className="pr-3">Flagged, not a hazard</th>
                          <th>Unclear</th>
                        </tr>
                      </thead>
                      <tbody>
                        {v.items.map((it) => (
                          <tr key={it.id}>
                            <td className="pr-3">
                              {it.label} {it.hazard ? "(hazard)" : "(safe)"}
                            </td>
                            <td className="pr-3">{it.hazard ? it.found : "–"}</td>
                            <td className="pr-3">{it.hazard ? it.missed : "–"}</td>
                            <td className="pr-3">{it.hazard ? "–" : it.mistaken}</td>
                            <td>{it.unclear}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {v.choices && (
                      <ul className="mt-2 list-disc pl-5">
                        {Object.entries(v.choices).map(([id, c]) => (
                          <li key={id}>
                            {c} × “{text(id)}”
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
            <p className="text-xs text-ink-muted">
              A safe item many people flag, or a hazard many miss, may need a clearer drawing or a broader region. It’s a QA signal, not a judgement of
              learners.
            </p>
          </>
        )}
        {stats.error && <p className="text-sm">The results couldn’t be loaded: {stats.error}</p>}
      </div>
    </div>
  );
}
