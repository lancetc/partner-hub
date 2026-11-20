"use client";

import { useMemo, useState } from "react";
import { api, useApi, type Me } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { activityDone, BLOCK_LABELS, pageBlocks, type Block, type GuideDoc, type Page } from "@/lib/magazine";
import { RELAY_TESTS, type RelayMode } from "@/lib/relay";
import {
  emptyRelayCourse,
  emptyRelayPage,
  RELAY_LIMITS,
  RELAY_SOURCE_HINTS,
  RELAY_SOURCES,
  relayOn,
  relayReviewed,
  reviewHash,
  safeRoute,
  type RelayPage,
  type RelaySource,
} from "@/lib/relayConfig";
import type { relayOutlook, RelayStreamEvent, RelayTurnView } from "@/server/relay";
import type { RelayDraft } from "@/server/relayAdmin";
import type { relayChoices } from "@/server/story";
import { AvaRelay } from "../relay/AvaRelay";
import { Icon } from "../Icon";
import { Badge, btn, ErrorNote, Field, input } from "./ui";

/*
  Ava Relay for authors (docs/ava-relay.md), in the Magazine editor: switch it on for the course, say why Ava
  belongs on a page and what she may talk about there, draft her opening line (by hand or with AI), run the test
  questions against the saved draft, and mark the answers reviewed. A page isn't published with Ava on it until
  that review has been done since its settings last changed.
*/

type Draft = { title: string; standfirst: string; doc: GuideDoc };
type Change = (fn: (d: Draft) => void, tag?: string) => void;
type Choices = ReturnType<typeof relayChoices>;
type Outlook = ReturnType<typeof relayOutlook>;

const area = cx(input, "min-h-20 py-2");
const blockName = (b: Block) => {
  const o = b as unknown as Record<string, unknown>;
  const words = ["heading", "prompt", "question", "title", "label", "statement"]
    .map((k) => o[k])
    .find((v): v is string => typeof v === "string" && v.trim().length > 0);
  return `${BLOCK_LABELS[b.type]}${words ? `: ${words.slice(0, 60)}` : ""}`;
};
const pageName = (doc: GuideDoc, p: Page) => p.title || `Page ${doc.pages.indexOf(p) + 1}`;

/** In the editor's sidebar: on or off for the course, where this page stands, and the way into its settings. */
export function RelayPanel({ draft, change, page, onOpen }: { draft: Draft; change: Change; page: Page; onOpen: () => void }) {
  const course = draft.doc.relay;
  const on = relayOn(course, page);
  const reviewed = page.relay ? relayReviewed(course, page.relay) : false;
  return (
    <section aria-labelledby="relay-h" className="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-sm ring-1 ring-line">
      <h2 id="relay-h" className="flex items-center gap-2 font-semibold">
        <Icon name="chat" className="size-4 text-accent" /> Ava Relay
      </h2>
      {!course ? (
        <>
          <p className="text-sm text-ink-muted">
            A <strong>Check in with Ava</strong> bar at the top of a story page. Learners can ask Ava about the story, or switch to work guidance with sources.
            It never scores an answer or counts towards finishing.
          </p>
          <button
            type="button"
            className={btn.secondary}
            onClick={() => {
              change((d) => void (d.doc.relay = { ...emptyRelayCourse(), enabled: true }));
              onOpen();
            }}
          >
            <Icon name="chat" className="size-4" /> Set up Ava Relay
          </button>
        </>
      ) : (
        <>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--color-action)]"
              checked={course.enabled}
              onChange={(e) => change((d) => void (d.doc.relay!.enabled = e.target.checked))}
            />
            <span>
              <span className="font-semibold">On for this course</span>
              <span className="block text-ink-muted">Pages get the bar once they have a reason for Ava to be there.</span>
            </span>
          </label>
          <p className="flex flex-wrap items-center gap-2 text-sm" role="status">
            This page:
            {!course.enabled ? (
              <Badge>Off</Badge>
            ) : on ? (
              <>
                <Badge tone="good">Ava is here</Badge>
                {reviewed ? <Badge tone="good">Reviewed</Badge> : <Badge tone="warn">Needs review</Badge>}
              </>
            ) : page.relay?.mode === "off" ? (
              <Badge>Turned off</Badge>
            ) : (
              <Badge>No reason given yet</Badge>
            )}
          </p>
          <button type="button" className={btn.secondary} onClick={onOpen}>
            <Icon name="sliders" className="size-4" /> Ava on this page
          </button>
        </>
      )}
    </section>
  );
}

/** One preview question, answered against the saved draft. Nothing it does is kept. */
async function previewAsk(body: Record<string, unknown>): Promise<{ turn: RelayTurnView | null; error: string }> {
  const res = await fetch("/api/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "ask", ...body }),
    cache: "no-store",
  });
  if (!res.ok) return { turn: null, error: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That couldn’t be asked." };
  let turn: RelayTurnView | null = null;
  let error = "";
  for (const line of (await res.text()).split("\n")) {
    if (!line.trim()) continue;
    const e = JSON.parse(line) as RelayStreamEvent;
    if (e.type === "final") turn = e.turn;
    if (e.type === "error") error = e.message;
  }
  return { turn, error };
}

type TestResult = { id: string; question: string; expect: string; mode: RelayMode; state: "before" | "after"; turn: RelayTurnView | null; error: string };

/** Everything about Ava on one page, with the course's settings beside it and the relay itself to try. */
export function RelayManager({
  guideId,
  draft,
  change,
  pageId,
  flush,
  onClose,
}: {
  guideId: string;
  draft: Draft;
  change: Change;
  pageId: string;
  flush: () => Promise<boolean>;
  onClose: () => void;
}) {
  const doc = draft.doc;
  const [at, setAt] = useState(pageId);
  const page = doc.pages.find((p) => p.id === at) ?? doc.pages[0];
  const course = doc.relay ?? emptyRelayCourse();
  const cfg = page.relay ?? emptyRelayPage();
  const me = useApi<Me>("/api/me").data;
  const choices = useApi<Choices>("/api/admin/relay?view=choices").data;
  const [saved, setSaved] = useState(0);
  const outlook = useApi<Outlook>(`/api/admin/relay?view=outlook&guide=${encodeURIComponent(guideId)}&page=${encodeURIComponent(page.id)}&v=${saved}`).data;
  const [proposal, setProposal] = useState<RelayDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [after, setAfter] = useState(false);
  const [choice, setChoice] = useState("");
  const [watched, setWatched] = useState(false);
  const [calm, setCalm] = useState(false);
  const [as, setAs] = useState("");
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState("");

  const edit = (fn: (r: RelayPage) => void) =>
    change((d) => {
      const p = d.doc.pages.find((x) => x.id === page.id);
      if (!p) return;
      p.relay ??= emptyRelayPage();
      fn(p.relay);
    }, `relay:${page.id}`);
  const editCourse = (fn: (c: NonNullable<GuideDoc["relay"]>) => void) =>
    change((d) => {
      d.doc.relay ??= emptyRelayCourse();
      fn(d.doc.relay);
    }, "relay:course");

  const blocks = useMemo(() => pageBlocks(page), [page]);
  const activities = useMemo(() => blocks.filter((b) => activityDone(b, {}) === false), [blocks]);
  const linked = blocks.find((b) => b.id === cfg.activity);
  const on = relayOn(course, page);
  const reviewed = relayReviewed(course, cfg);
  // The answers a preview pretends the learner has given: the linked activity attempted, or every activity on the page.
  const answers = useMemo(() => {
    if (!after) return {};
    const done = (b: Block): [string, string] =>
      b.type === "decision" ? [b.id, (b.id === linked?.id && choice) || b.choices[0]?.id || ""] : [`done:${b.id}`, "1"];
    return Object.fromEntries((linked ? [linked] : activities).map(done));
  }, [after, linked, choice, activities]);
  const preview = { guideId, answers, watched, as };

  // The preview and the outlook read the saved draft: save first, then look.
  const save = async () => {
    const ok = await flush();
    if (ok) setSaved((n) => n + 1);
    else setProblem("The draft couldn’t be saved, so the preview would be out of date. Try again.");
    return ok;
  };
  const goPage = (id: string) => {
    setAt(id);
    setResults([]);
    setProposal(null);
    setProblem(null);
  };

  const aiDraft = async () => {
    setDrafting(true);
    setProblem(null);
    try {
      if (!(await save())) return;
      setProposal(await api<RelayDraft>("/api/admin/relay", { body: { action: "draft", guideId, pageId: page.id } }));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Nothing could be drafted.");
    } finally {
      setDrafting(false);
    }
  };

  const runTests = async () => {
    setProblem(null);
    if (!(await save())) return;
    const out: TestResult[] = [];
    setResults([]);
    for (const state of ["before", "after"] as const) {
      const stateAnswers =
        state === "before"
          ? {}
          : Object.fromEntries((linked ? [linked] : activities).map((b) => (b.type === "decision" ? [b.id, b.choices[0]?.id ?? ""] : [`done:${b.id}`, "1"])));
      for (const t of RELAY_TESTS) {
        // The failure cases don't change with the attempt; asking them once is enough.
        if (state === "after" && t.mode === "work") continue;
        if (t.mode === "work" && !course.work) continue;
        setRunning(`${state === "before" ? "Before" : "After"} the attempt: “${t.question}”`);
        const r = await previewAsk({ pageId: page.id, mode: t.mode, text: t.question, preview: { guideId, answers: stateAnswers, watched, as }, turns: [] });
        out.push({ ...t, state, ...r });
        setResults([...out]);
        if (r.error && !r.turn && out.length === 1) {
          // Nothing is connected, or the page isn't ready: one clear message beats eight of the same.
          setProblem(r.error);
          setRunning("");
          return;
        }
      }
    }
    setRunning("");
  };

  const markReviewed = () =>
    edit((r) => {
      r.reviewed = { by: me?.user.name ?? "An author", at: new Date().toISOString(), hash: reviewHash(doc.relay, r) };
    });

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="relay-manage-h" className="fixed inset-0 z-50 overflow-y-auto bg-[#0b1626]/70 p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 rounded-3xl bg-bg p-5 shadow-2xl sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="relay-manage-h" className="flex items-center gap-2 font-serif text-2xl font-semibold">
              <Icon name="chat" className="size-6 text-accent" /> Ava Relay
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              Ava is a guide on the side: she helps a learner notice, question and get ready for the next decision. She never gives the answer to something they
              haven’t attempted, and opening her changes no score and finishes nothing. If the page’s own activity already does the job, leave her off.
            </p>
          </div>
          <button type="button" className={btn.quiet} onClick={onClose}>
            Close
          </button>
        </div>
        {problem && <ErrorNote text={problem} />}
        {outlook && (!outlook.hubOn || !outlook.avaApproved || !outlook.provider) && (
          <p className="rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-line" role="status">
            {!outlook.hubOn && "Ava Relay is switched off for the whole Hub (Administration → Ava Relay). "}
            {!outlook.avaApproved && "Ava has no approved story profile yet (Characters and stories), so learners can’t reach her. "}
            {!outlook.provider && "Neither Claude nor OpenAI is connected on this server, so Ava can’t answer and the test questions can’t run."}
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            {/* The course */}
            <section aria-labelledby="relay-course-h" className="flex flex-col gap-4 rounded-3xl bg-surface p-5 ring-1 ring-line">
              <h3 id="relay-course-h" className="font-semibold">
                The course
              </h3>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--color-action)]"
                  checked={course.enabled}
                  onChange={(e) => editCourse((c) => void (c.enabled = e.target.checked))}
                />
                <span>
                  <span className="font-semibold">Ava Relay is on for this course</span>
                  <span className="block text-ink-muted">
                    One bar at the top of each page that has a reason for her. No floating button, no second launcher.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--color-action)]"
                  checked={course.work}
                  onChange={(e) => editCourse((c) => void (c.work = e.target.checked))}
                />
                <span>
                  <span className="font-semibold">Offer Work guidance</span>
                  <span className="block text-ink-muted">
                    A second tab where Ava looks for approved guidance and shows its source. With nothing to cite, she says so and gives the route.
                  </span>
                </span>
              </label>
              {course.work && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-semibold">Approved collections she may search</legend>
                  {(Object.keys(RELAY_SOURCES) as RelaySource[]).map((k) => (
                    <label key={k} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-[var(--color-action)]"
                        checked={course.sources.includes(k)}
                        onChange={(e) =>
                          editCourse((c) => void (c.sources = e.target.checked ? [...new Set([...c.sources, k])] : c.sources.filter((x) => x !== k)))
                        }
                      />
                      <span>
                        {RELAY_SOURCES[k]}
                        <span className="block text-xs text-ink-muted">{RELAY_SOURCE_HINTS[k]}</span>
                      </span>
                    </label>
                  ))}
                  <p className="text-xs text-ink-muted">
                    Each learner only gets sources their own role can open. Stories, characters and news are never searched.
                  </p>
                </fieldset>
              )}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">Approved routes for a real concern</p>
                <p className="text-xs text-ink-muted">
                  Shown when a question is a real complaint, incident or urgent worry, with a note that the chat has submitted nothing. A page on the Hub, a web
                  address, an email or a phone link.
                </p>
                {course.routes.map((r, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                    <input
                      className={input}
                      aria-label={`Route ${i + 1} label`}
                      placeholder="Incident Submission Form"
                      value={r.label}
                      onChange={(e) => editCourse((c) => void (c.routes[i].label = e.target.value))}
                    />
                    <input
                      className={cx(input, r.href && !safeRoute(r.href) && "border-danger")}
                      aria-label={`Route ${i + 1} link`}
                      aria-invalid={Boolean(r.href) && !safeRoute(r.href)}
                      placeholder="/topics/incident-form"
                      value={r.href}
                      onChange={(e) => editCourse((c) => void (c.routes[i].href = e.target.value))}
                    />
                    <button
                      type="button"
                      className={btn.quiet}
                      onClick={() => editCourse((c) => void c.routes.splice(i, 1))}
                      aria-label={`Remove route ${i + 1}`}
                    >
                      <Icon name="trash" className="size-4" />
                    </button>
                  </div>
                ))}
                {course.routes.length < RELAY_LIMITS.routes && (
                  <button type="button" className={cx(btn.quiet, "self-start")} onClick={() => editCourse((c) => void c.routes.push({ label: "", href: "" }))}>
                    <Icon name="plus" className="size-4" /> Add a route
                  </button>
                )}
              </div>
            </section>

            {/* The page */}
            <section aria-labelledby="relay-page-h" className="flex flex-col gap-4 rounded-3xl bg-surface p-5 ring-1 ring-line">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="relay-page-h" className="font-semibold">
                  This page
                </h3>
                {doc.pages.length > 1 && (
                  <select className={cx(input, "w-auto")} aria-label="Page" value={page.id} onChange={(e) => goPage(e.target.value)}>
                    {doc.pages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {pageName(doc, p)}
                        {relayOn(course, p) ? " · Ava is here" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <Field
                label="Why is Ava on this page?"
                hint="Which behaviour, question or decision does she help the learner think through? This is the reason for the placement: with none, the page has no bar."
              >
                <textarea
                  className={area}
                  maxLength={RELAY_LIMITS.purpose}
                  value={cfg.purpose}
                  onChange={(e) => edit((r) => void (r.purpose = e.target.value))}
                />
              </Field>
              <Field
                label="On this page"
                hint={
                  page.kind === "assessment"
                    ? "An assessment page has no bar unless you turn it on here."
                    : "On by default once there’s a reason. Turn it off where a guide would distract."
                }
              >
                <select
                  className={input}
                  value={cfg.mode ?? ""}
                  onChange={(e) => edit((r) => (e.target.value ? void (r.mode = e.target.value as "on" | "off") : void delete r.mode))}
                >
                  <option value="">{page.kind === "assessment" ? "Off (an assessment page)" : "On when there’s a reason"}</option>
                  <option value="on">On</option>
                  <option value="off">Off for this page</option>
                </select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Story Plan beat" hint="The beat this page tells, in your words.">
                  <input className={input} maxLength={RELAY_LIMITS.beat} value={cfg.beat} onChange={(e) => edit((r) => void (r.beat = e.target.value))} />
                </Field>
                <Field label="Where the page sits in the story" hint="Ava is given nothing later than this episode.">
                  <select className={input} value={cfg.episode} onChange={(e) => edit((r) => void (r.episode = e.target.value))}>
                    <option value="">Not set: Ava only knows the page</option>
                    {choices?.episodes.map((ep) => (
                      <option key={ep.id} value={ep.id}>
                        {ep.title}
                        {ep.whenLabel ? ` (${ep.whenLabel})` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="The activity her hints are for" hint="Until the learner attempts it, Ava has its question and options and none of its feedback.">
                <select className={input} value={cfg.activity} onChange={(e) => edit((r) => void (r.activity = e.target.value))}>
                  <option value="">Every activity on the page</option>
                  {activities.map((b) => (
                    <option key={b.id} value={b.id}>
                      {blockName(b)}
                    </option>
                  ))}
                </select>
              </Field>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-semibold">People she may talk about, from their approved story</legend>
                {!choices ? (
                  <p className="text-sm text-ink-muted">Loading…</p>
                ) : !choices.people.length ? (
                  <p className="text-sm text-ink-muted">No one has an approved story profile yet (Characters and stories).</p>
                ) : (
                  choices.people.map((p) => {
                    const pick = cfg.characters.find((c) => c.id === p.id);
                    return (
                      <div key={p.id} className="rounded-2xl px-3 py-2 ring-1 ring-line">
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 accent-[var(--color-action)]"
                            checked={Boolean(pick)}
                            disabled={!pick && cfg.characters.length >= RELAY_LIMITS.characters}
                            onChange={(e) =>
                              edit(
                                (r) =>
                                  void (r.characters = e.target.checked
                                    ? [...r.characters, { id: p.id, revision: p.revision }]
                                    : r.characters.filter((c) => c.id !== p.id)),
                              )
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-semibold">{p.name}</span>
                            <span className="text-ink-muted"> · {p.role || "No role given"}</span>
                            {pick && (
                              <span className="ml-1 text-xs text-ink-muted">
                                · profile version {pick.revision || p.revision}
                                {pick.revision > 0 && pick.revision < p.revision && (
                                  <button
                                    type="button"
                                    className="ml-1 font-semibold text-accent underline"
                                    onClick={() =>
                                      edit((r) => void (r.characters = r.characters.map((c) => (c.id === p.id ? { ...c, revision: p.revision } : c))))
                                    }
                                  >
                                    Update to version {p.revision}
                                  </button>
                                )}
                              </span>
                            )}
                          </span>
                        </label>
                        {pick && p.facts.length > 0 && (
                          <details className="mt-1 pl-6 text-sm">
                            <summary className="cursor-pointer text-ink-muted">Facts Ava may mention ({p.facts.length})</summary>
                            <ul className="mt-1 list-disc pl-5 text-ink-muted">
                              {p.facts.map((f) => (
                                <li key={f}>{f}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    );
                  })
                )}
              </fieldset>

              {/* Allowed reveals */}
              <div className="flex flex-col gap-2 rounded-2xl bg-muted p-4 text-sm">
                <p className="font-semibold">What Ava can reveal, and when</p>
                {!outlook ? (
                  <p className="text-ink-muted">Loading…</p>
                ) : (
                  <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)]">
                    <dt className="font-semibold">Now</dt>
                    <dd className="text-ink-muted">
                      What’s on the page (about {outlook.now.words} words)
                      {outlook.now.earlierPages
                        ? `, a short recap of ${outlook.now.earlierPages} earlier page${outlook.now.earlierPages === 1 ? "" : "s"}`
                        : ""}
                      {outlook.now.people.length
                        ? `, and ${outlook.now.people.map((p) => `${p.name}’s story (${p.episodes} episode${p.episodes === 1 ? "" : "s"})`).join(", ")}`
                        : ""}
                      .
                    </dd>
                    <dt className="font-semibold">After an attempt</dt>
                    <dd className="text-ink-muted">
                      {outlook.afterAttempt.activities.length
                        ? `The approved feedback on what they chose in: ${outlook.afterAttempt.activities.map((a) => a.label.toLowerCase()).join(", ")}.`
                        : "This page has no activity, so there is no feedback to hold back."}
                      {outlook.afterAttempt.held
                        ? ` And ${outlook.afterAttempt.held} block${outlook.afterAttempt.held === 1 ? "" : "s"} you’ve held back below.`
                        : ""}
                    </dd>
                    <dt className="font-semibold">Not on this page</dt>
                    <dd className="text-ink-muted">
                      {outlook.later.pages} later page{outlook.later.pages === 1 ? "" : "s"} and {outlook.later.episodes} later episode
                      {outlook.later.episodes === 1 ? "" : "s"}. Ava is never given these here.
                    </dd>
                  </dl>
                )}
                <details>
                  <summary className="cursor-pointer font-semibold">Hold a block back until the attempt ({cfg.hold.length})</summary>
                  <p className="mt-1 text-xs text-ink-muted">
                    For a block on this page that gives the game away, such as “What happened next”. Learners can still read it; Ava just won’t bring it up
                    first.
                  </p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {blocks
                      .filter((b) => activityDone(b, {}) !== false)
                      .map((b) => (
                        <label key={b.id} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 accent-[var(--color-action)]"
                            checked={cfg.hold.includes(b.id)}
                            onChange={(e) => edit((r) => void (r.hold = e.target.checked ? [...r.hold, b.id] : r.hold.filter((x) => x !== b.id)))}
                          />
                          {blockName(b)}
                        </label>
                      ))}
                  </div>
                </details>
                <p className="text-xs text-ink-muted">This describes the saved draft. It updates when you run a test or open the preview.</p>
              </div>

              {/* Opening line and suggested questions */}
              <Field label="Ava’s opening line" hint="What she says when the relay opens. No answer, no policy, nothing that happens later.">
                <textarea
                  className={area}
                  maxLength={RELAY_LIMITS.opening}
                  value={cfg.opening}
                  onChange={(e) => edit((r) => void (r.opening = e.target.value))}
                />
              </Field>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">Suggested questions</p>
                <p className="text-xs text-ink-muted">Up to three shortcuts a learner can tap in story mode. Work guidance uses fixed ones.</p>
                {[0, 1, 2].map((i) => (
                  <input
                    key={i}
                    className={input}
                    aria-label={`Suggested question ${i + 1}`}
                    maxLength={RELAY_LIMITS.prompt}
                    placeholder={["Give me a hint", "What matters to Dot?", "Why is Fiona worried?"][i]}
                    value={cfg.prompts[i] ?? ""}
                    onChange={(e) =>
                      edit((r) => {
                        const next = [0, 1, 2].map((j) => (j === i ? e.target.value : (r.prompts[j] ?? "")));
                        r.prompts = next.filter((x, j) => x.trim() || next.slice(j + 1).some((y) => y.trim()));
                      })
                    }
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={btn.secondary} disabled={drafting} onClick={() => void aiDraft()}>
                  <Icon name="spark" className="size-4" /> {drafting ? "Drafting…" : "Draft with AI"}
                </button>
                <span className="text-xs text-ink-muted">A proposal from the saved page and the approved people. You decide what to keep.</span>
              </div>
              {proposal && (
                <div className="flex flex-col gap-2 rounded-2xl bg-tealtint p-4 text-sm">
                  <p className="font-semibold">A proposal to review</p>
                  <p>“{proposal.opening}”</p>
                  <ul className="list-disc pl-5">
                    {proposal.prompts.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                  <p className="text-ink-muted">
                    <span className="font-semibold text-ink">Why Ava helps here:</span> {proposal.rationale}
                  </p>
                  {proposal.claims.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {proposal.claims.map((c) => (
                        <li key={c.claim} className="flex items-start gap-2">
                          <Badge tone={c.supported ? "neutral" : "warn"}>
                            {c.support === "page" ? "Says: on the page" : c.support === "people" ? "Says: approved story" : "No support given"}
                          </Badge>
                          <span>{c.claim}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="font-semibold">
                    {proposal.claims.some((c) => !c.supported)
                      ? "Something in the line has no support on the page or in an approved story. Fix it before using it."
                      : "Where each fact comes from is the drafting model’s own account, and it can be wrong. Read the line against the page before you use it."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={btn.primary}
                      onClick={() => {
                        edit((r) => {
                          r.opening = proposal.opening;
                          r.prompts = proposal.prompts;
                        });
                        setProposal(null);
                      }}
                    >
                      Use these
                    </button>
                    <button type="button" className={btn.quiet} onClick={() => setProposal(null)}>
                      Discard
                    </button>
                  </div>
                </div>
              )}
              <Field label="Steer away from" hint="Topics for Ava to redirect on this page, in your words.">
                <textarea
                  className={area}
                  maxLength={RELAY_LIMITS.redirect}
                  value={cfg.redirect}
                  onChange={(e) => edit((r) => void (r.redirect = e.target.value))}
                />
              </Field>
              <Field label="Reviewer notes" hint="For reviewers only. Never shown to learners, and never given to Ava.">
                <textarea className={area} maxLength={RELAY_LIMITS.notes} value={cfg.notes} onChange={(e) => edit((r) => void (r.notes = e.target.value))} />
              </Field>
            </section>
          </div>

          {/* Try it, test it, review it */}
          <div className="flex flex-col gap-5 lg:sticky lg:top-4 lg:self-start">
            <section aria-labelledby="relay-try-h" className="flex flex-col gap-3 rounded-3xl bg-surface p-5 ring-1 ring-line">
              <h3 id="relay-try-h" className="font-semibold">
                Preview as a learner
              </h3>
              {!on ? (
                <p className="text-sm text-ink-muted">
                  {!course.enabled ? "Switch Ava Relay on for the course to try it." : "Give the page a reason for Ava, and the bar appears here."}
                </p>
              ) : (
                <>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="size-4 accent-[var(--color-action)]" checked={after} onChange={(e) => setAfter(e.target.checked)} />
                      After the attempt
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="size-4 accent-[var(--color-action)]" checked={calm} onChange={(e) => setCalm(e.target.checked)} />
                      Reduced motion
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="size-4 accent-[var(--color-action)]" checked={watched} onChange={(e) => setWatched(e.target.checked)} />
                      Has watched Ava’s opening
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="shrink-0">Reading as</span>
                      <select className={cx(input, "min-h-9")} value={as} onChange={(e) => setAs(e.target.value)}>
                        <option value="">Me (an author)</option>
                        <option value="partner">A Care Partner</option>
                        <option value="coordinator">A care coordinator</option>
                        <option value="staff">Trilogy Care staff</option>
                      </select>
                    </label>
                  </div>
                  {after && linked?.type === "decision" && (
                    <label className="flex flex-col gap-1 text-sm">
                      They chose
                      <select className={input} value={choice || linked.choices[0]?.id} onChange={(e) => setChoice(e.target.value)}>
                        {linked.choices.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.text.slice(0, 80)} ({c.verdict})
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <AvaRelay
                    key={`${page.id}:${after}:${choice}:${watched}:${as}:${calm}`}
                    slug=""
                    revisionId="draft"
                    pageId={page.id}
                    preview={preview}
                    reducedMotion={calm || undefined}
                    beforeDial={save}
                  />
                  <p className="text-xs text-ink-muted">
                    The real relay, on the saved draft. Nothing you ask here is kept or counted. For the phone layout, use Preview in the editor’s top bar.
                  </p>
                </>
              )}
            </section>

            <section aria-labelledby="relay-test-h" className="flex flex-col gap-3 rounded-3xl bg-surface p-5 ring-1 ring-line">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="relay-test-h" className="font-semibold">
                  Test questions
                </h3>
                {on && (reviewed ? <Badge tone="good">Reviewed</Badge> : <Badge tone="warn">Needs review</Badge>)}
              </div>
              <p className="text-sm text-ink-muted">
                Likely questions and the ways it could go wrong, asked before and after the attempt. Read the answers, then mark them reviewed. Changing
                anything Ava is given here asks for the review again.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={btn.secondary} disabled={!on || Boolean(running)} onClick={() => void runTests()}>
                  <Icon name="play" className="size-4" /> {running ? "Asking…" : results.length ? "Run them again" : "Run the test questions"}
                </button>
                <button type="button" className={btn.primary} disabled={!on || reviewed || !results.length || Boolean(running)} onClick={markReviewed}>
                  <Icon name="check" className="size-4" /> Mark reviewed
                </button>
              </div>
              <p className="text-xs text-ink-muted" role="status">
                {running ||
                  (cfg.reviewed && reviewed
                    ? `Reviewed by ${cfg.reviewed.by} on ${formatDate(cfg.reviewed.at)}.`
                    : cfg.reviewed
                      ? "Changed since it was last reviewed."
                      : "")}
              </p>
              {results.length > 0 && (
                <ol className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1">
                  {results.map((r) => (
                    <li key={`${r.state}:${r.id}`} className="rounded-2xl px-3 py-2.5 text-sm ring-1 ring-line">
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                        <Badge>{r.mode === "story" ? "Story" : "Work"}</Badge>
                        {r.mode === "story" && <Badge>{r.state === "before" ? "Before the attempt" : "After the attempt"}</Badge>}
                        {r.turn?.kindLabel && <Badge tone="info">{r.turn.kindLabel}</Badge>}
                      </p>
                      <p className="mt-1.5 font-semibold">“{r.question}”</p>
                      <p className="mt-1 whitespace-pre-wrap">{r.turn ? r.turn.text.replace(/\s?\[[SFC]\d{1,2}\]/g, "") : r.error}</p>
                      {r.turn && r.turn.people.length + r.turn.feedback.length > 0 && (
                        <p className="mt-1 text-xs text-ink-muted">
                          Cites: {[...r.turn.feedback.map(() => "the approved feedback"), ...r.turn.people.map((p) => `${p.name}’s approved story`)].join(", ")}
                        </p>
                      )}
                      {r.turn && r.turn.sources.length > 0 && (
                        <p className="mt-1 text-xs text-ink-muted">Sources: {r.turn.sources.map((s) => `${s.title} (${s.meta})`).join("; ")}</p>
                      )}
                      {r.turn?.route && <p className="mt-1 text-xs text-ink-muted">With the route card{r.turn.route.urgent ? " and the 000 line" : ""}.</p>}
                      <p className="mt-1.5 text-xs text-ink-muted">
                        <span className="font-semibold">A good answer:</span> {r.expect}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
