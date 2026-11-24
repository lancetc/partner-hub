"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx } from "@/lib/format";
import type { HazardScanBlock } from "@/lib/magazine";
import {
  askedDecisions,
  buildDebrief,
  chooseVariant,
  cleanFlags,
  CONCERNS,
  emptyScanState,
  learnerVariant,
  REASONS,
  roleFor,
  SCENE_ROLES,
  SCENE_VERSION,
  SCORER_VERSION,
  scoreFindings,
  VERDICTS,
  type Debrief,
  type ItemResult,
  type LearnerVariant,
  type Reason,
  type SceneRole,
  type ScanView,
  type Variant,
} from "@/lib/hazardScan";
import { hazardSource } from "@/lib/hazardSources";
import type { HazardScanView } from "@/server/hazardScan";
import { SCENE_PALETTE, SceneArt } from "../hazard/SceneArt";
import { Icon } from "../Icon";
import { AidSection } from "../playbooks/AidSection";

/*
  Spot the Hazard, as learners use it (docs/spot-the-hazard.md). A short observation exercise, not a pixel hunt:
  scan a drawn room (or List the room, by area), flag what needs attention with an optional reason, say what you'd
  deal with first, submit, see what you found, what's worth another look and what isn't a hazard here, then choose
  what you'd do within your role. No timer, no drag or pinch: every object is a button, zoom is buttons, and the list
  route has the same items and scoring. Status is announced in words; markers carry a number and a shape, never
  colour alone.

  The learner's page holds the room and its neutral descriptions only. The server picks and freezes the variant,
  scores the findings against the answer key and sends the reveal. In the editor's preview it runs locally against
  the block as written (any variant that isn't retired), and stores nothing.
*/

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const good = "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const warn = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const plain = "bg-muted text-ink";
const ZOOMS = [1, 1.5, 2];

type Call = (body: Record<string, unknown>) => Promise<ScanView>;

/** The editor's preview: the same steps, computed locally from the block as written. Nothing is stored. */
function previewEngine(b: HazardScanBlock, role: SceneRole, fixed: string) {
  const pool = (r: SceneRole) => b.variants.filter((v) => v.status !== "retired" && (!v.roles.length || v.roles.includes(r)));
  let attemptNo = 0;
  const seen: string[] = [];
  let variant: Variant | null = null;
  let repeat = false;
  let st = emptyScanState();
  let status: ScanView["status"] = "new";
  let findings: ScanView["findings"] = null;
  let debrief: Debrief | null = null;
  const toView = (): ScanView => ({
    attemptId: variant ? `preview-${attemptNo}` : null,
    attemptNo,
    status,
    role,
    roleLabel: SCENE_ROLES[role],
    available: pool(role).length > 0,
    variant: variant ? learnerVariant(b, variant) : null,
    repeat,
    state: st,
    findings,
    questions: variant && status !== "active" && status !== "new" ? askedDecisions(b, variant, role, st.flags) : [],
    debrief,
    attempts: attemptNo,
    versions: {
      scene: SCENE_VERSION,
      scorer: SCORER_VERSION,
      family: b.familyId,
      release: b.release,
      variant: variant?.id ?? "",
      variantVersion: variant?.version ?? 0,
    },
  });
  const begin = () => {
    attemptNo += 1;
    const chosen = fixed ? (b.variants.find((v) => v.id === fixed) ?? null) : chooseVariant(pool(role), seen, `preview:${attemptNo}`)?.variant;
    if (!chosen) throw new Error("No variant to preview: add one, or un-retire one.");
    repeat = !fixed && pool(role).every((v) => seen.includes(v.id));
    variant = chosen;
    seen.push(chosen.id);
    st = emptyScanState();
    status = "active";
    findings = null;
    debrief = null;
  };
  const call: Call = async (body) => {
    const a = body.action;
    if (a === "start" && status === "new") begin();
    else if (a === "retry" && (status === "submitted" || status === "completed")) begin();
    else if (a === "findings" && status === "active" && variant) {
      const flags = cleanFlags(variant, body.flags);
      st = { ...st, flags, priority: typeof body.priority === "string" ? body.priority : "" };
      findings = scoreFindings(variant, flags, st.priority);
      status = "found";
    } else if (a === "respond" && status === "found" && variant) {
      const chosen = (body.chosen ?? {}) as Record<string, string>;
      st = { ...st, chosen };
      debrief = buildDebrief(b, variant, role, st.flags, st.priority, chosen);
      status = "submitted";
    } else if (a === "viewed" && status === "submitted") status = "completed";
    return toView();
  };
  return { call, view: toView };
}

export function SpotTheHazard({
  block: b,
  guideId,
  preview = false,
  place = "magazine",
  onFinished,
}: {
  block: HazardScanBlock;
  guideId: string;
  preview?: boolean;
  place?: string;
  onFinished?: (d: Debrief) => void;
}) {
  const url = `/api/magazine/${guideId}/hazardscan`;
  const loaded = useApi<HazardScanView>(preview ? null : `${url}?block=${b.id}`);
  // The preview's own controls: which role, and optionally which variant to show.
  const [pRole, setPRole] = useState<SceneRole>(roleFor(b, "partner"));
  const [pVariant, setPVariant] = useState("");
  const [engine, setEngine] = useState(() => (preview ? previewEngine(b, roleFor(b, "partner"), "") : null));
  const [v, setV] = useState<ScanView | null>(preview ? (engine?.view() ?? null) : null);
  if (!preview && loaded.data && v === null) setV(loaded.data);
  // Once the learner has done something, each new step takes the focus (not on first load).
  const acted = useRef(false);

  const call = useCallback<Call>(
    async (body) => {
      if (body.action) acted.current = true;
      return engine ? engine.call(body) : api<ScanView>(url, { body: { blockId: b.id, place, ...body } });
    },
    [engine, url, b.id, place],
  );
  const resetPreview = (role: SceneRole, variant: string) => {
    const e = previewEngine(b, role, variant);
    setEngine(e);
    setV(e.view());
  };

  if (!preview && loaded.error)
    return (
      <Shell b={b}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  return (
    <Shell b={b}>
      {preview && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-dashed border-line-strong p-3 text-sm">
          <p className="w-full font-semibold">Preview (nothing is saved). Every variant that isn’t retired can be shown here, drafts included.</p>
          <label className="flex flex-col gap-1">
            Role
            <select
              className="min-h-11 rounded-xl border border-line-strong bg-surface px-2"
              value={pRole}
              onChange={(e) => {
                setPRole(e.target.value as SceneRole);
                resetPreview(e.target.value as SceneRole, pVariant);
              }}
            >
              {b.roles.map((r) => (
                <option key={r} value={r}>
                  {SCENE_ROLES[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Variant
            <select
              className="min-h-11 rounded-xl border border-line-strong bg-surface px-2"
              value={pVariant}
              onChange={(e) => {
                setPVariant(e.target.value);
                resetPreview(pRole, e.target.value);
              }}
            >
              <option value="">As the server would choose</option>
              {b.variants
                .filter((x) => x.status !== "retired")
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label || x.id} (v{x.version}, {x.status})
                  </option>
                ))}
            </select>
          </label>
        </div>
      )}
      {!v ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <Attempt
          key={`${v.attemptId ?? "new"}`}
          b={b}
          v={v}
          setV={setV}
          call={call}
          acted={acted}
          preview={preview}
          guideId={guideId}
          place={place}
          onFinished={onFinished}
        />
      )}
    </Shell>
  );
}

function Shell({ b, children }: { b: HazardScanBlock; children: React.ReactNode }) {
  return (
    <section
      className="flex w-full flex-col gap-4 rounded-3xl border border-line-strong bg-surface p-4 shadow-sm sm:p-6"
      aria-label={`Spot the Hazard: ${b.title}`}
    >
      <div>
        <p className="mb-1 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
          <Icon name="eye" className="size-5" /> Spot the Hazard
        </p>
        <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
        {b.intro && <p className="mt-1 text-ink-muted">{b.intro}</p>}
        <p className="mt-2 inline-flex flex-wrap gap-x-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold">
          <span>Practice</span>
          <span aria-hidden>·</span>
          <span>A drawn, fictional room</span>
          <span aria-hidden>·</span>
          <span>No timer</span>
        </p>
      </div>
      {children}
    </section>
  );
}

function Attempt({
  b,
  v,
  setV,
  call,
  acted,
  preview,
  guideId,
  place,
  onFinished,
}: {
  b: HazardScanBlock;
  v: ScanView;
  setV: (v: ScanView) => void;
  call: Call;
  acted: React.RefObject<boolean>;
  preview: boolean;
  guideId: string;
  place: string;
  onFinished?: (d: Debrief) => void;
}) {
  const [flags, setFlags] = useState(v.state.flags);
  const [priority, setPriority] = useState(v.state.priority);
  const [route, setRoute] = useState<"image" | "list">(v.state.route);
  const [chosen, setChosen] = useState<Record<string, string>>(v.state.chosen);
  const [said, setSaid] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const viewed = useRef(false);

  // Saves the flags while scanning, a moment after the last change. A refresh resumes them.
  useEffect(() => {
    if (preview || !dirty.current || v.status !== "active") return;
    const t = setTimeout(() => {
      dirty.current = false;
      call({ flags, priority, route }).catch(() => undefined);
    }, 700);
    return () => clearTimeout(t);
  }, [flags, priority, route, preview, v.status, call]);
  // Moving to a new step puts focus on its heading, so a screen reader starts there.
  useEffect(() => {
    if (acted.current) heading.current?.focus();
  }, [v.status, acted]);
  // Completion needs the debrief seen: once it's on screen, say so (once).
  useEffect(() => {
    if (!v.debrief || viewed.current || (v.status !== "submitted" && v.status !== "completed")) return;
    viewed.current = true;
    const d = v.debrief;
    if (v.status === "completed") return;
    call({ action: "viewed" })
      .then((next) => {
        setV(next);
        onFinished?.(d);
      })
      .catch(() => undefined);
  }, [v.debrief, v.status, call, setV, onFinished]);

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      setV(await call(body));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const room = v.variant;
  const labelOf = (id: string) => room?.objects.find((o) => o.id === id)?.label ?? id;
  const toggle = (id: string) => {
    dirty.current = true;
    const on = flags.some((f) => f.id === id);
    const next = on ? flags.filter((f) => f.id !== id) : [...flags, { id, reason: "" as const }];
    setFlags(next);
    if (on && priority === id) setPriority("");
    setSaid(`${labelOf(id)} ${on ? "removed" : "flagged"}. You have flagged ${next.length} ${next.length === 1 ? "thing" : "things"}.`);
  };
  const setReason = (id: string, reason: Reason | "") => {
    dirty.current = true;
    setFlags((fs) => fs.map((f) => (f.id === id ? { ...f, reason } : f)));
  };

  // ---------- Set the scene ----------
  if (v.status === "new")
    return (
      <div className="flex flex-col gap-4">
        <SceneSet b={b} role={v.roleLabel} />
        <div className={box}>
          <p className="font-semibold">How it works</p>
          <ol className="mt-1 list-decimal pl-5 text-sm">
            <li>Look around the room, or use List the room to go through it area by area.</li>
            <li>Flag anything that needs attention. You can say why, and change your mind.</li>
            <li>Say which you’d deal with first, then submit your findings.</li>
            <li>See what you found, then choose what you’d do next in your role.</li>
          </ol>
          <p className="mt-2 text-sm text-ink-muted">Not everything in someone’s home is a hazard. Flagging everything won’t help.</p>
        </div>
        {!v.available && !preview ? (
          <p className={cx(warn, "rounded-2xl p-3")} role="status">
            This scene is being reviewed, so there’s no room to scan right now.
          </p>
        ) : (
          <div>
            <button type="button" className={primary} disabled={busy} onClick={() => run({ action: "start" })}>
              <Icon name="eye" className="size-4" /> Scan the room
            </button>
          </div>
        )}
        {problem && <p role="alert">{problem}</p>}
      </div>
    );
  if (!room) return null;

  const flagNo = (id: string) => flags.findIndex((f) => f.id === id) + 1;
  const d = v.debrief;

  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>
      {v.repeat && v.status === "active" && (
        <p className={cx(plain, "rounded-2xl p-3 text-sm")}>
          You’ve seen every approved room for this scene, so this one is a repeat. The things in it may be in the same places.
        </p>
      )}

      {/* ---------- Find and classify ---------- */}
      {v.status === "active" && (
        <>
          <details className={box}>
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">The scene: {b.person.name}, and what you’re doing</summary>
            <SceneSet b={b} role={v.roleLabel} />
          </details>
          <h4 ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
            Scan the room
          </h4>
          <p className="text-sm">
            Choose anything that needs attention to flag it, and choose it again to remove the flag. Use List the room to go through it by area instead.
          </p>
          <RouteSwitch
            route={route}
            set={(r) => {
              dirty.current = true;
              setRoute(r);
              setSaid(r === "list" ? "Showing the room as a list, by area." : "Showing the picture of the room.");
            }}
          />
          {route === "image" ? (
            <Picture
              b={b}
              room={room}
              flagNo={flagNo}
              onToggle={toggle}
              onMiss={() => setSaid("Nothing to flag there. Choose an object, or use List the room.")}
            />
          ) : (
            <RoomList b={b} room={room} flagged={(id) => flagNo(id) > 0} onToggle={toggle} />
          )}
          <p className="text-sm font-semibold" aria-hidden>
            You have flagged {flags.length} {flags.length === 1 ? "thing" : "things"}.
          </p>
          {flags.length > 0 && (
            <div className={box}>
              <p className="font-semibold">What you’ve flagged</p>
              <ol className="mt-2 flex flex-col gap-2">
                {flags.map((f, i) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink font-mulish text-sm font-extrabold text-surface">{i + 1}</span>
                    <span className="min-w-0 flex-1 font-semibold">{labelOf(f.id)}</span>
                    {b.askReason && (
                      <select
                        aria-label={`Why you flagged ${labelOf(f.id)} (optional)`}
                        className="min-h-11 rounded-xl border border-line-strong bg-surface px-2 text-sm"
                        value={f.reason}
                        onChange={(e) => setReason(f.id, e.target.value as Reason | "")}
                      >
                        <option value="">Why? (optional)</option>
                        {(Object.keys(REASONS) as Reason[]).map((r) => (
                          <option key={r} value={r}>
                            {REASONS[r]}
                          </option>
                        ))}
                      </select>
                    )}
                    <button type="button" className={cx(secondary, "min-h-11 px-3 text-sm")} onClick={() => toggle(f.id)}>
                      Remove<span className="sr-only"> {labelOf(f.id)}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <fieldset className="mt-4">
                <legend className="font-semibold">Which would you deal with first?</legend>
                <div className="mt-2 flex flex-col gap-1">
                  {[...flags.map((f) => ({ id: f.id, label: labelOf(f.id) })), { id: "unsure", label: "I’m not sure" }].map((o) => (
                    <label key={o.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-muted">
                      <input
                        type="radio"
                        name={`priority-${v.attemptId}`}
                        className="size-5"
                        checked={priority === o.id}
                        onChange={() => {
                          dirty.current = true;
                          setPriority(o.id);
                        }}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={primary}
              disabled={busy}
              onClick={async () => {
                if (!flags.length && !(await confirmAction("You haven’t flagged anything. Submit your findings anyway?", { confirmLabel: "Submit" }))) return;
                if (flags.length && !priority) return setProblem("Say which you’d deal with first, or that you’re not sure.");
                await run({ action: "findings", flags, priority, route });
              }}
            >
              Submit findings
            </button>
            <span className="text-sm text-ink-muted">You’ll see the answers once you submit.</span>
          </div>
          {problem && (
            <p role="alert" className={cx(warn, "rounded-xl px-3 py-2 text-sm")}>
              {problem}
            </p>
          )}
        </>
      )}

      {/* ---------- The reveal, and what you'd do next ---------- */}
      {v.status === "found" && v.findings && (
        <>
          <h4 ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
            What you found
          </h4>
          <Reveal b={b} room={room} findings={v.findings} preview={preview} unclear={v.state.unclear} report={(id) => run({ action: "unclear", item: id })} />
          <div className="flex flex-col gap-4">
            <h4 className="font-serif text-xl font-semibold">What would you do next?</h4>
            <p className="text-sm">
              You’re a {v.roleLabel.toLowerCase()}. {b.carePlan && `From the care plan: ${b.carePlan}`}
            </p>
            {v.questions.map((q) => (
              <fieldset key={q.id} className={box}>
                <legend className="px-1 font-semibold">{q.prompt}</legend>
                <p className="mt-1 text-sm text-ink-muted">
                  {q.hazard.found ? `You flagged “${q.hazard.label}”.` : `You didn’t flag “${q.hazard.label}”. Here it is.`}
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  {q.options.map((o) => (
                    <label key={o.id} className="flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 hover:bg-muted">
                      <input
                        type="radio"
                        name={`${v.attemptId}-${q.id}`}
                        className="mt-1 size-5 shrink-0"
                        checked={chosen[q.id] === o.id}
                        onChange={() => setChosen((c) => ({ ...c, [q.id]: o.id }))}
                      />
                      <span>{o.text}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <div>
              <button
                type="button"
                className={primary}
                disabled={busy || v.questions.some((q) => !chosen[q.id])}
                onClick={() => run({ action: "respond", chosen })}
              >
                See your debrief
              </button>
              {v.questions.some((q) => !chosen[q.id]) && <p className="mt-1 text-sm text-ink-muted">Choose a response for each question.</p>}
            </div>
            {problem && <p role="alert">{problem}</p>}
          </div>
        </>
      )}

      {/* ---------- Debrief ---------- */}
      {d && (v.status === "submitted" || v.status === "completed") && (
        <DebriefView
          b={b}
          d={d}
          room={room}
          heading={heading}
          preview={preview}
          guideId={guideId}
          place={place}
          busy={busy}
          retry={() => run({ action: "retry", from: v.attemptId })}
        />
      )}
      {problem && (v.status === "submitted" || v.status === "completed") && (
        <p role="alert" className={cx(warn, "rounded-xl px-3 py-2 text-sm")}>
          {problem}
        </p>
      )}
    </div>
  );
}

function SceneSet({ b, role }: { b: HazardScanBlock; role: string }) {
  return (
    <div className="flex flex-col gap-2">
      {b.task && <p className="text-[1.05rem]">{b.task}</p>}
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold">You’re playing</dt>
        <dd>{role}</dd>
        {b.person.about && (
          <>
            <dt className="font-semibold">About {b.person.name}</dt>
            <dd>{b.person.about}</dd>
          </>
        )}
        {b.carePlan && (
          <>
            <dt className="font-semibold">From the care plan</dt>
            <dd>{b.carePlan}</dd>
          </>
        )}
      </dl>
      <p className="text-xs text-ink-muted">Not everything in the room is yours to change: it’s {b.person.name}’s home.</p>
    </div>
  );
}

function RouteSwitch({ route, set }: { route: "image" | "list"; set: (r: "image" | "list") => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="How to look at the room">
      {(
        [
          ["image", "Picture", "image"],
          ["list", "List the room", "list"],
        ] as const
      ).map(([r, label, icon]) => (
        <button
          key={r}
          type="button"
          aria-pressed={route === r}
          onClick={() => set(r)}
          className={cx(secondary, route === r && "border-ink bg-ink text-surface hover:bg-ink")}
        >
          <Icon name={icon} className="size-4" /> {label}
        </button>
      ))}
    </div>
  );
}

/** The room as a picture: every object is a button over its tap region. Zoom is buttons; the box scrolls when zoomed. */
function Picture({
  b,
  room,
  flagNo,
  onToggle,
  onMiss,
  marks,
}: {
  b: HazardScanBlock;
  room: LearnerVariant;
  flagNo?: (id: string) => number;
  onToggle?: (id: string) => void;
  onMiss?: () => void;
  /** After submission: a shape and a word on each object, instead of buttons. */
  marks?: Record<string, "found" | "missed" | "mistaken" | "safe">;
}) {
  const [zoom, setZoom] = useState(1);
  const ids = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Zoom">
        <button
          type="button"
          className={cx(secondary, "min-w-11 px-3")}
          disabled={zoom === ZOOMS[0]}
          onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])}
        >
          <Icon name="minus" className="size-4" />
          <span className="sr-only">Zoom out</span>
        </button>
        <button
          type="button"
          className={cx(secondary, "min-w-11 px-3")}
          disabled={zoom === ZOOMS.at(-1)}
          onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])}
        >
          <Icon name="plus" className="size-4" />
          <span className="sr-only">Zoom in</span>
        </button>
        <span className="text-sm text-ink-muted" aria-live="polite">
          {zoom === 1 ? "Whole room" : `Zoomed ${zoom}×: scroll to look around`}
        </span>
      </div>
      <div className={cx("max-h-[75vh] overflow-auto rounded-2xl ring-1 ring-line", SCENE_PALETTE)}>
        <div
          className="relative aspect-[3/2]"
          style={{ width: `${zoom * 100}%` }}
          onClick={(e) => {
            if (onMiss && !(e.target as HTMLElement).closest("button")) onMiss();
          }}
        >
          <div className="absolute inset-0 bg-[var(--hz-wall)]">
            <SceneArt
              room={b.room}
              dim={room.dim}
              objects={room.objects}
              label={`${b.title}: a drawing of the room. Each thing in it is a button; the list route describes them all.`}
            />
          </div>
          {room.objects.map((o) => {
            const n = flagNo?.(o.id) ?? 0;
            const mark = marks?.[o.id];
            const style = { left: `${o.x - o.hit.w / 2}%`, top: `${o.y - o.hit.h / 2}%`, width: `${o.hit.w}%`, height: `${o.hit.h}%` };
            if (marks)
              return mark && mark !== "safe" ? (
                <span key={o.id} aria-hidden className="pointer-events-none absolute grid place-items-center" style={style}>
                  <Mark kind={mark} />
                </span>
              ) : null;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={n > 0}
                aria-label={`${o.label}${n ? `, flagged ${n}` : ""}`}
                aria-describedby={`${ids}-${o.id}`}
                onClick={() => onToggle?.(o.id)}
                className={cx(
                  "absolute grid place-items-center rounded-xl outline-offset-2 focus-visible:outline-4 focus-visible:outline-[#0b57d0] hover:bg-white/15",
                  n > 0 && "ring-4 ring-ink ring-offset-2 ring-offset-white contrast-more:ring-8",
                )}
                style={style}
              >
                <span id={`${ids}-${o.id}`} className="sr-only">
                  {o.description}
                </span>
                {n > 0 && (
                  <span
                    className="grid size-8 place-items-center rounded-full bg-ink font-mulish text-sm font-extrabold text-white ring-[3px] ring-white"
                    aria-hidden
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const MARK = {
  found: { label: "Found", icon: "circle-check", cls: "bg-[#0f5b3a] text-white" },
  missed: { label: "Missed", icon: "alert", cls: "bg-[#7a3d00] text-white border-2 border-dashed border-white" },
  mistaken: { label: "Not a hazard", icon: "close", cls: "bg-[#3a3631] text-white" },
} as const;
function Mark({ kind }: { kind: keyof typeof MARK }) {
  const m = MARK[kind];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold shadow-md ring-2 ring-white", m.cls)}>
      <Icon name={m.icon} className="size-3.5" />
      {m.label}
    </span>
  );
}

/** List the room: the same objects and the same flags, by area, each with its neutral description. */
function RoomList({
  b,
  room,
  flagged,
  onToggle,
}: {
  b: HazardScanBlock;
  room: LearnerVariant;
  flagged: (id: string) => boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {b.areas.map((a) => {
        const here = room.objects.filter((o) => o.area === a.id);
        if (!here.length) return null;
        return (
          <fieldset key={a.id} className={box}>
            <legend className="px-1 font-semibold">{a.label}</legend>
            <ul className="mt-1 flex flex-col gap-1">
              {here.map((o) => (
                <li key={o.id}>
                  <label className="flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 hover:bg-muted">
                    <input type="checkbox" className="mt-1 size-5 shrink-0" checked={flagged(o.id)} onChange={() => onToggle(o.id)} />
                    <span>
                      <span className="font-semibold">{o.label}</span>
                      <span className="block text-sm">{o.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        );
      })}
    </div>
  );
}

function ItemList({
  title,
  icon,
  items,
  tone,
  empty,
  unclear,
  report,
  preview,
}: {
  title: string;
  icon: "circle-check" | "alert" | "info";
  items: ItemResult[];
  tone: string;
  empty: string;
  unclear: string[];
  report: (id: string) => void;
  preview: boolean;
}) {
  return (
    <div className={cx(tone, "rounded-2xl p-4")}>
      <p className="flex items-center gap-2 font-semibold">
        <Icon name={icon} className="size-5" /> {title} ({items.length})
      </p>
      {items.length ? (
        <ul className="mt-2 flex flex-col gap-3">
          {items.map((x) => (
            <li key={x.id}>
              <p className="font-semibold">
                {x.label}
                {x.critical && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-xs text-surface">Before anything else</span>}
              </p>
              <p className="text-sm">{x.explain}</p>
              {x.reasonFits === false && x.reason && (
                <p className="text-sm italic">
                  You said {REASONS[x.reason].toLowerCase()}; it’s mainly {x.category ? REASONS[x.category].toLowerCase() : "something else"}.
                </p>
              )}
              {!preview &&
                (unclear.includes(x.id) ? (
                  <p className="text-xs">Thanks: noted as unclear for the content owner.</p>
                ) : (
                  <button type="button" className="mt-1 min-h-11 text-xs font-semibold underline" onClick={() => report(x.id)}>
                    This seemed unclear<span className="sr-only">: {x.label}</span>
                  </button>
                ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm">{empty}</p>
      )}
    </div>
  );
}

function Reveal({
  b,
  room,
  findings: f,
  preview,
  unclear,
  report,
}: {
  b: HazardScanBlock;
  room: LearnerVariant;
  findings: NonNullable<ScanView["findings"]>;
  preview: boolean;
  unclear: string[];
  report: (id: string) => void;
}) {
  const marks: Record<string, "found" | "missed" | "mistaken" | "safe"> = {};
  for (const x of f.found) marks[x.id] = "found";
  for (const x of f.missed) marks[x.id] = "missed";
  for (const x of f.mistaken) marks[x.id] = "mistaken";
  return (
    <div className="flex flex-col gap-3">
      {f.notes.length > 0 && <p className={cx(plain, "rounded-2xl p-3")}>{f.notes.join(" ")}</p>}
      <ItemList title="Found" icon="circle-check" items={f.found} tone={good} empty="Nothing yet." unclear={unclear} report={report} preview={preview} />
      <ItemList
        title="Worth another look"
        icon="alert"
        items={f.missed}
        tone={warn}
        empty="You didn’t miss anything."
        unclear={unclear}
        report={report}
        preview={preview}
      />
      <ItemList
        title="Not a hazard in this context"
        icon="info"
        items={f.mistaken}
        tone={plain}
        empty="Nothing you flagged was a false alarm."
        unclear={unclear}
        report={report}
        preview={preview}
      />
      <p className={cx(plain, "rounded-2xl p-3 text-sm")}>
        <span className="font-semibold">What comes first: </span>
        {f.priorityNote}
      </p>
      <details className={box}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Show them on the picture</summary>
        <Picture b={b} room={room} marks={marks} />
      </details>
    </div>
  );
}

function DebriefView({
  b,
  d,
  room,
  heading,
  preview,
  guideId,
  place,
  busy,
  retry,
}: {
  b: HazardScanBlock;
  d: Debrief;
  room: LearnerVariant;
  heading: React.RefObject<HTMLHeadingElement | null>;
  preview: boolean;
  guideId: string;
  place: string;
  busy: boolean;
  retry: () => void;
}) {
  const f = d.findings;
  const sources = [...new Set([...f.found, ...f.missed, ...f.mistaken].map((x) => x.source).concat(d.decisions.map((x) => x.source)))]
    .map((id) => hazardSource(id))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const marks: Record<string, "found" | "missed" | "mistaken" | "safe"> = {};
  for (const x of f.found) marks[x.id] = "found";
  for (const x of f.missed) marks[x.id] = "missed";
  for (const x of f.mistaken) marks[x.id] = "mistaken";
  return (
    <div className="flex flex-col gap-4">
      <h4 ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
        Your debrief
      </h4>
      <ul className="flex flex-col gap-2">
        {d.dims.map((x) => (
          <li key={x.dim} className={cx(box, "flex flex-col gap-1")}>
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{x.label}</span>
              <span className="rounded-full bg-muted px-3 py-0.5 text-sm font-semibold">{x.words}</span>
            </p>
            {x.why && <p className="text-sm">{x.why}</p>}
          </li>
        ))}
      </ul>
      <div className={box}>
        <p className="font-semibold">What you noticed</p>
        <p className="text-sm">{f.found.length ? f.found.map((x) => x.label).join("; ") : "Nothing that needed attention."}</p>
      </div>
      <div className={box}>
        <p className="font-semibold">What you missed</p>
        {f.missed.length || f.mistaken.length ? (
          <ul className="mt-1 flex flex-col gap-2 text-sm">
            {f.missed.map((x) => (
              <li key={x.id}>
                <span className="font-semibold">{x.label}:</span> {x.explain}
              </li>
            ))}
            {f.mistaken.map((x) => (
              <li key={x.id}>
                <span className="font-semibold">{x.label} (not a hazard here):</span> {x.explain}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">Nothing.</p>
        )}
      </div>
      <div className={box}>
        <p className="font-semibold">What you would do</p>
        <ul className="mt-1 flex flex-col gap-3 text-sm">
          {d.decisions.map((x) => (
            <li key={x.id}>
              <p className="font-semibold">{x.hazard.label}</p>
              {x.chosen && (
                <>
                  <p>You chose: “{x.chosen.text}”</p>
                  <p className={cx(x.chosen.verdict === "best" ? good : x.chosen.verdict === "acceptable" ? warn : plain, "mt-1 rounded-xl px-3 py-2")}>
                    <span className="font-semibold">{VERDICTS[x.chosen.verdict]}.</span> {x.chosen.feedback}
                  </p>
                  {x.chosen.ignores.length > 0 && (
                    <p className="mt-1">What it leaves out: {x.chosen.ignores.map((c) => CONCERNS[c].toLowerCase()).join("; ")}.</p>
                  )}
                  {x.chosen.verdict !== "best" && x.best.length > 0 && <p className="mt-1">A stronger response: “{x.best[0]}”</p>}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
      {d.matters && (
        <div className={cx(good, "rounded-2xl p-4")}>
          <p className="font-semibold">Why it matters</p>
          <p className="text-sm">{d.matters}</p>
        </div>
      )}
      <details className={box}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Review the scene</summary>
        <Picture b={b} room={room} marks={marks} />
        <p className="mt-2 text-sm font-semibold">Things that weren’t hazards here</p>
        <ul className="list-disc pl-5 text-sm">
          {f.safe.map((x) => (
            <li key={x.id}>
              <span className="font-semibold">{x.label}:</span> {x.explain}
            </li>
          ))}
        </ul>
      </details>
      {b.jobAids.map((a) => (
        <div key={a.snippetId}>
          <AidSection snippetId={a.snippetId} why={a.why} place={place.startsWith("topic:") ? place : `magazine:${guideId}`} preview={preview} />
        </div>
      ))}
      {sources.length > 0 && (
        <details className={box}>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Guidance and sources</summary>
          <ul className="list-disc pl-5 text-sm">
            {sources.map((s) => (
              <li key={s.id}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                    {s.title}
                  </a>
                ) : (
                  s.title
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-ink-muted">Trilogy Care’s current procedures and the person’s care plan decide what to do in a real home.</p>
        </details>
      )}
      <p className="text-xs text-ink-muted">
        Practice: a visual practice completion, not a pass or a competence check. Versions: scene {d.versions.scene}, scorer {d.versions.scorer}, release{" "}
        {d.versions.release}, room {d.versions.variant} v{d.versions.variantVersion}.
      </p>
      <div>
        <button type="button" className={secondary} disabled={busy} onClick={retry}>
          <Icon name="refresh" className="size-4" /> Try another room
        </button>
        <p className="mt-1 text-xs text-ink-muted">A new attempt, in a room you haven’t seen if there is one. This one is kept as it is.</p>
      </div>
    </div>
  );
}

/**
  A scene placed on a Topic card by reference (lessons.ts `sceneRef`): the published Magazine block and the learner's
  own attempt, loaded from the course. Shown only to people who can read that course.
*/
export function TopicSpotTheHazard({ guide, block, why, topic }: { guide: string; block: string; why?: string; topic: string }) {
  const loaded = useApi<HazardScanView>(`/api/magazine/${encodeURIComponent(guide)}/hazardscan?block=${encodeURIComponent(block)}&embed=1`);
  if (loaded.error) return <p className="rounded-2xl bg-muted px-4 py-3 text-sm">This practice scene isn’t available to you here. {loaded.error}</p>;
  const v = loaded.data;
  if (!v?.block || !v.guideId) return <div aria-hidden className="h-40 w-full animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />;
  return (
    <div className="text-left">
      {why && <p className="mb-2 text-sm font-semibold">{why}</p>}
      <SpotTheHazard block={v.block} guideId={v.guideId} place={`topic:${topic}`} />
    </div>
  );
}
