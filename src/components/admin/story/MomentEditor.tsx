"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx } from "@/lib/format";
import { BEAT_PROMPTS, MOMENT_HINTS, MOMENT_KINDS, scriptOf, STORY_STATUS, TX, type MomentData, type PlacedMoment, type TransmissionBeats } from "@/lib/story";
import type { MomentDetail } from "@/server/story";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "../ui";
import { ImageLibraryDialog } from "../ImagePicker";
import { Icon } from "../../Icon";
import { CheckIn, ReturnMoment, Transmission } from "../../story/StoryMoments";
import { area, box, dateText, Section } from "../problems/problemUi";
import { useStoryAct } from "./StoryLibraryAdmin";
import type { ScriptProposal } from "@/lib/storyAssist";
import { ProposalError, ProposeButton, ScriptProposalPanel, useProposal } from "./StoryProposals";

/*
  One story moment (docs/story-plans.md): the script, why it belongs where it does, its approval, its voice and
  where it's placed. Learners only ever get an approved version, and each placement keeps the version it was
  placed with until an author updates it. A recording is made from the approved words and isn't played to anyone
  until someone has listened and confirmed it matches.
*/

type Places = {
  topics: { ref: string; title: string; places: { id: string; label: string }[] }[];
  guides: { ref: string; title: string; places: { id: string; label: string }[] }[];
};

/** A video's picture size, read in the browser: the upload keeps it. Captions have none. */
const videoSize = (file: File) =>
  new Promise<{ width: number; height: number }>((resolve) => {
    if (!file.type.startsWith("video/")) return resolve({ width: 0, height: 0 });
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (width: number, height: number) => {
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
    v.onerror = () => done(0, 0);
    v.src = url;
  });

async function upload(file: File) {
  const size = await videoSize(file);
  if (file.type.startsWith("video/") && !size.width) throw new Error("That video couldn’t be read. Try an MP4 or WebM.");
  const form = new FormData();
  form.set("file", file);
  form.set("width", String(size.width));
  form.set("height", String(size.height));
  const r = await fetch("/api/admin/uploads", { method: "POST", body: form });
  const j = (await r.json().catch(() => ({}))) as { src?: string; error?: string };
  if (!r.ok || !j.src) throw new Error(j.error ?? "That file couldn’t be uploaded.");
  return j.src;
}

export function MomentEditor({ id }: { id: string }) {
  const m = useApi<MomentDetail>(`/api/admin/story?view=moment&id=${encodeURIComponent(id)}`);
  const { act, error, busy } = useStoryAct(m.reload);
  const back = {
    href: m.data ? `/admin/characters/${m.data.speaker.id}` : "/admin/characters",
    label: m.data ? m.data.speaker.name : "Characters and stories",
  };
  if (m.error)
    return (
      <AdminShell title="Story moment" back={back}>
        <ErrorNote text={m.error} />
      </AdminShell>
    );
  if (!m.data)
    return (
      <AdminShell title="Story moment" back={back}>
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  return <Editor key={`${m.data.id}:${m.data.revision}:${JSON.stringify(m.data.draft)}`} d={m.data} act={act} busy={busy} error={error} back={back} />;
}

function Editor({
  d,
  act,
  busy,
  error,
  back,
}: {
  d: MomentDetail;
  act: ReturnType<typeof useStoryAct>["act"];
  busy: boolean;
  error: string | null;
  back: { href: string; label: string };
}) {
  const [x, setX] = useState<MomentData>(d.draft);
  const [featuredId, setFeatured] = useState(d.featuredId);
  const [episodeId, setEpisode] = useState(d.episodeId);
  const [picking, setPicking] = useState<"poster" | "endFrame" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  // An AI draft of the script (step 6), from the saved moment and the approved story up to it.
  const ai = useProposal<ScriptProposal>();
  const [place, setPlace] = useState({ kind: "guide" as "topic" | "guide", ref: "", place: "", position: "before" });
  const places = useApi<Places>("/api/admin/story?view=places").data;
  const dirty = JSON.stringify([x, featuredId, episodeId]) !== JSON.stringify([d.draft, d.featuredId, d.episodeId]);
  const opening = d.kind === "opening_transmission";
  const beat = (k: keyof TransmissionBeats, v: string) => setX({ ...x, beats: { ...x.beats, [k]: v } });
  const video = (patch: Partial<MomentData["video"]>) => setX({ ...x, video: { ...x.video, ...patch } });
  const file = (field: "src" | "captions") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadError(null);
    try {
      // A new video or new captions has to be checked against the script again.
      video({ [field]: await upload(f), checked: false });
    } catch (err) {
      setUploadError((err as Error).message);
    }
  };
  const script = scriptOf(d.kind, x);
  const featured = d.cast.find((c) => c.id === featuredId);
  const preview: PlacedMoment = {
    placementId: "preview",
    preview: true,
    momentId: d.id,
    revision: d.revision,
    kind: d.kind,
    place: "",
    position: "before",
    speaker: { id: d.speaker.id, name: d.speaker.name, role: d.speaker.role },
    featured: featured ? { id: featured.id, name: featured.name } : null,
    whenLabel: x.whenLabel,
    role: x.role,
    script,
    nextAction: x.nextAction,
    instruction: x.beats.instruction,
    questions: x.questions,
    hypothetical: x.hypothetical,
    video: opening && x.video.src ? { src: x.video.src, poster: x.video.poster, captions: x.video.captions, endFrame: x.video.endFrame } : null,
    audio: { script: d.audio.script?.src ?? null, answers: Object.fromEntries(Object.entries(d.audio.answers ?? {}).map(([k, v]) => [k, v.src])) },
  };
  const clips = [
    ...(d.audio.script ? [{ key: "script", label: "The script", src: d.audio.script.src }] : []),
    ...Object.entries(d.audio.answers ?? {}).map(([k, v]) => ({ key: k, label: d.approved?.questions.find((q) => q.id === k)?.label ?? k, src: v.src })),
  ];
  const target = (place.kind === "topic" ? places?.topics : places?.guides)?.find((t) => t.ref === place.ref);
  const toRecord = d.approved ? (opening && d.approved.video.src ? 0 : 1) + d.approved.questions.length : 0;

  return (
    <AdminShell title={x.title || MOMENT_KINDS[d.kind]} back={back}>
      <div className="-mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="info">{MOMENT_KINDS[d.kind]}</Badge>
        <Badge tone={d.status === "approved" ? (d.changed ? "warn" : "good") : d.status === "retired" ? "bad" : "warn"}>
          {d.status === "approved" ? (d.changed ? `Approved v${d.revision}, with unapproved changes` : `Approved v${d.revision}`) : STORY_STATUS[d.status]}
        </Badge>
        {d.sample && <Badge>Sample</Badge>}
        <span className="text-sm text-ink-muted">Spoken by {d.speaker.name}</span>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-ink-muted">{MOMENT_HINTS[d.kind]}</p>
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: "save-moment", id: d.id, featuredId, episodeId, data: x });
        }}
      >
        <Section
          title="Why it’s here"
          hint="A moment earns its place by moving the person’s story and the learner’s judgement forward. If nothing has changed, there’s nothing to say."
        >
          <div className={cx(box, "grid gap-3 sm:grid-cols-2")}>
            <Field label="Working title">
              <input className={input} value={x.title} onChange={(e) => setX({ ...x, title: e.target.value })} />
            </Field>
            <Field label="Episode" hint="The approved episode this belongs to. It also sets where a history opened from here stops.">
              <select className={input} value={episodeId} onChange={(e) => setEpisode(e.target.value)}>
                <option value="">None</option>
                {d.episodes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                    {e.status === "approved" ? "" : ` (${STORY_STATUS[e.status].toLowerCase()})`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Why this placement helps the learner’s decision" className="sm:col-span-2">
              <textarea className={area} value={x.purpose} onChange={(e) => setX({ ...x, purpose: e.target.value })} />
            </Field>
            <Field label="Featured person" hint="Who it’s about, if not the speaker.">
              <select className={input} value={featuredId} onChange={(e) => setFeatured(e.target.value)}>
                <option value="">Nobody else</option>
                {d.cast
                  .filter((c) => c.id !== d.speaker.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Approved facts and source" hint="What this rests on. A story supplies no new rule.">
              <input className={input} value={x.source} onChange={(e) => setX({ ...x, source: e.target.value })} />
            </Field>
            {(opening || d.kind === "new_information") && (
              <Field
                label="Who the learner is at this point"
                hint="The coordinator making the call, an observer, a colleague reviewing: and what they know so far."
                className="sm:col-span-2"
              >
                <input className={input} value={x.role} onChange={(e) => setX({ ...x, role: e.target.value })} />
              </Field>
            )}
            {d.kind === "new_information" && (
              <Field label="The new information" className="sm:col-span-2">
                <textarea className={area} value={x.newInfo} onChange={(e) => setX({ ...x, newInfo: e.target.value })} />
              </Field>
            )}
            {d.kind === "check_in" && (
              <Field label="When, in the story" hint="In words: “A few weeks later”.">
                <input className={input} value={x.whenLabel} onChange={(e) => setX({ ...x, whenLabel: e.target.value })} />
              </Field>
            )}
          </div>
        </Section>

        <Section
          title="What they say"
          hint={`${script.length} of 1,200 characters. Every word is shown to the learner as text, whether or not it’s also spoken.`}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ProposeButton busy={ai.busy} onClick={() => void ai.ask({ kind: "script", id: d.id })}>
              Draft the script with AI
            </ProposeButton>
            <span className="text-sm text-ink-muted">
              From the saved purpose and the approved story up to this moment{dirty ? ". Save first to include your latest changes" : ""}. You decide what to
              keep.
            </span>
          </div>
          {ai.error && (
            <div className="mb-3">
              <ProposalError text={ai.error} />
            </div>
          )}
          {ai.proposal && (
            <div className="mb-3">
              <ScriptProposalPanel p={ai.proposal} x={x} setX={setX} onClose={ai.clear} />
            </div>
          )}
          <div className={cx(box, "grid gap-3")}>
            {opening ? (
              (Object.keys(BEAT_PROMPTS) as (keyof TransmissionBeats)[]).map((k) => (
                <Field key={k} label={BEAT_PROMPTS[k].label} hint={BEAT_PROMPTS[k].hint}>
                  <textarea className={cx(area, "min-h-16")} value={x.beats[k]} onChange={(e) => beat(k, e.target.value)} />
                </Field>
              ))
            ) : (
              <Field label={d.kind === "check_in" ? "The update" : "The script"}>
                <textarea className={cx(area, "min-h-32")} value={x.text} onChange={(e) => setX({ ...x, text: e.target.value })} />
              </Field>
            )}
            {d.kind !== "check_in" && d.kind !== "person_response" && (
              <Field
                label={opening ? "The Begin button: what the learner does next" : "What the learner does next"}
                hint={opening ? "Shown as “Begin: …”." : "Optional."}
              >
                <input className={input} value={x.nextAction} onChange={(e) => setX({ ...x, nextAction: e.target.value })} />
              </Field>
            )}
            {d.kind === "person_response" && (
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 size-4" checked={x.hypothetical} onChange={(e) => setX({ ...x, hypothetical: e.target.checked })} />
                <span>
                  <span className="font-semibold">This depends on what the learner chose</span>
                  <span className="block text-sm text-ink-muted">
                    It’s shown as one possible response inside the practice, and never becomes part of the shared story.
                  </span>
                </span>
              </label>
            )}
          </div>
        </Section>

        {d.kind === "check_in" && (
          <Section
            title="Questions the learner can ask"
            hint="Up to four, each with an answer you’ve written. This is a bounded reply, not a chat: nothing here is generated when a learner asks."
            aside={
              x.questions.length < 4 && (
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => setX({ ...x, questions: [...x.questions, { id: `q${Date.now().toString(36)}`, label: "", answer: "" }] })}
                >
                  <Icon name="plus" className="size-4" /> Add a question
                </button>
              )
            }
          >
            <ul className="flex flex-col gap-2">
              {x.questions.map((q, i) => (
                <li key={q.id} className={cx(box, "grid gap-2")}>
                  <input
                    aria-label="Question"
                    className={input}
                    value={q.label}
                    placeholder="How did you feel about the plan?"
                    onChange={(e) => setX({ ...x, questions: x.questions.map((y, n) => (n === i ? { ...y, label: e.target.value } : y)) })}
                  />
                  <textarea
                    aria-label="Answer"
                    className={area}
                    value={q.answer}
                    placeholder="The approved answer, in their voice"
                    onChange={(e) => setX({ ...x, questions: x.questions.map((y, n) => (n === i ? { ...y, answer: e.target.value } : y)) })}
                  />
                  <div>
                    <button type="button" className={btn.quiet} onClick={() => setX({ ...x, questions: x.questions.filter((_, n) => n !== i) })}>
                      <Icon name="trash" className="size-4" /> Remove
                    </button>
                  </div>
                </li>
              ))}
              {!x.questions.length && <li className={cx(box, "text-ink-muted")}>No questions. An update on its own is fine.</li>}
            </ul>
          </Section>
        )}

        {opening && (
          <Section
            title="The video and the still"
            hint={`Optional. With a video, the transmission ends with one pulse of interference, the picture goes, the stage stays empty for ${TX.hold / 1000} seconds, then the still fades in with Begin. Without one, the learner gets the words and Begin.`}
          >
            <div className={cx(box, "grid gap-3 sm:grid-cols-2")}>
              <Field label="Video" hint="An approved MP4, WebM or MOV, up to 250 MB. A voice alone doesn’t make a talking video: upload the finished clip.">
                <input type="file" accept="video/mp4,video/webm,video/quicktime" className="text-sm" onChange={file("src")} />
              </Field>
              <Field label="Captions" hint="A WebVTT file that matches the video.">
                <input type="file" accept=".vtt,text/vtt" className="text-sm" onChange={file("captions")} />
              </Field>
              {uploadError && <p className="text-sm text-danger sm:col-span-2">{uploadError}</p>}
              <div className="flex flex-wrap items-center gap-2 text-sm sm:col-span-2">
                <Badge tone={x.video.src ? "good" : "neutral"}>{x.video.src ? "Video added" : "No video"}</Badge>
                <Badge tone={x.video.captions ? "good" : "neutral"}>{x.video.captions ? "Captions added" : "No captions"}</Badge>
                {x.video.src && (
                  <button type="button" className={btn.quiet} onClick={() => video({ src: "", captions: "", checked: false })}>
                    <Icon name="trash" className="size-4" /> Remove the video
                  </button>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold">The still that appears afterwards</p>
                <p className="text-xs text-ink-muted">Chosen separately from the video’s first frame. It must be the same person, in the same approved look.</p>
                <div className="mt-2 flex items-center gap-3">
                  {x.video.poster && (
                    // eslint-disable-next-line @next/next/no-img-element -- a library picture, shown as it is
                    <img src={x.video.poster} alt="" className="aspect-video w-32 rounded-lg object-cover" />
                  )}
                  <button type="button" className={btn.secondary} onClick={() => setPicking("poster")}>
                    <Icon name="image" className="size-4" /> {x.video.poster ? "Change" : "Choose the still"}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold">End-frame still (optional)</p>
                <p className="text-xs text-ink-muted">
                  The last picture of the video, shown under the interference. Without one, the player’s own last frame is used.
                </p>
                <div className="mt-2 flex items-center gap-3">
                  {x.video.endFrame && (
                    // eslint-disable-next-line @next/next/no-img-element -- a library picture, shown as it is
                    <img src={x.video.endFrame} alt="" className="aspect-video w-32 rounded-lg object-cover" />
                  )}
                  <button type="button" className={btn.secondary} onClick={() => setPicking("endFrame")}>
                    <Icon name="image" className="size-4" /> {x.video.endFrame ? "Change" : "Choose"}
                  </button>
                </div>
              </div>
              {x.video.src && (
                <label className="flex items-start gap-2 sm:col-span-2">
                  <input type="checkbox" className="mt-1 size-4" checked={x.video.checked} onChange={(e) => video({ checked: e.target.checked })} />
                  <span>
                    <span className="font-semibold">I’ve watched it: the video and captions match the script, and the still is the same person</span>
                    <span className="block text-sm text-ink-muted">Without this the transmission can’t be approved with its video.</span>
                  </span>
                </label>
              )}
            </div>
            <ImageLibraryDialog
              open={picking !== null}
              onClose={() => setPicking(null)}
              onPick={(p) => {
                if (picking) video({ [picking]: p.src, checked: false });
                setPicking(null);
              }}
            />
          </Section>
        )}

        <Section
          title="Preview"
          hint="As a learner will meet it, from the draft on this page. Nothing here is recorded."
          aside={
            opening && (
              <button type="button" className={btn.secondary} onClick={() => setPreviewKey(previewKey + 1)}>
                <Icon name="refresh" className="size-4" /> Reset the preview
              </button>
            )
          }
        >
          <div className="max-w-2xl">
            {opening ? <Transmission key={previewKey} m={preview} /> : d.kind === "check_in" ? <CheckIn m={preview} /> : <ReturnMoment m={preview} />}
          </div>
        </Section>

        <Section title="Save and approve">
          {!dirty && d.problems.length > 0 && (
            <ul className="mb-3 list-disc rounded-2xl border border-gold bg-gold/10 p-4 pl-8 text-sm">
              {d.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className={btn.primary} disabled={busy || !dirty}>
              Save draft
            </button>
            <button
              type="button"
              className={btn.secondary}
              disabled={busy || dirty || d.problems.length > 0 || (d.status === "approved" && !d.changed)}
              onClick={() => act({ action: "approve-moment", id: d.id })}
            >
              <Icon name="circle-check" className="size-4" /> {d.revision ? `Approve as version ${d.revision + 1}` : "Approve"}
            </button>
            {d.status === "retired" ? (
              <button type="button" className={btn.quiet} disabled={busy} onClick={() => act({ action: "moment-status", id: d.id, status: "restore" })}>
                Restore
              </button>
            ) : (
              d.revision > 0 && (
                <button
                  type="button"
                  className={btn.quiet}
                  disabled={busy}
                  onClick={async () => {
                    if (await confirmAction("Retire this moment? It stops showing everywhere it’s placed. You can restore it.", { confirmLabel: "Retire" }))
                      void act({ action: "moment-status", id: d.id, status: "retired" });
                  }}
                >
                  Retire
                </button>
              )
            )}
            {dirty && <span className="text-sm text-ink-muted">Save before approving.</span>}
          </div>
          {d.changed && d.revision > 0 && (
            <p className="mt-2 text-sm text-ink-muted">
              Learners still get version {d.revision}. A new version starts without a recording, and each placement keeps its version until you update it.
            </p>
          )}
        </Section>
      </form>

      {d.revision > 0 && (
        <Section
          title="Voice"
          hint="Recorded from the approved words, in the speaker’s voice. Only that text is sent to the voice provider. Learners hear nothing until you’ve listened and confirmed it matches."
        >
          <div className={box}>
            <p className="text-sm">
              <span className="text-ink-muted">Voice: </span>
              {d.voice.name}
            </p>
            {!d.voice.ready && <p className="mt-1 text-sm text-ink-muted">No voice provider is connected. The moment works as text.</p>}
            {clips.length > 0 && (
              <ul className="mt-3 flex flex-col gap-3">
                {clips.map((c) => (
                  <li key={c.key}>
                    <p className="text-sm font-semibold">{c.label}</p>
                    <audio controls preload="none" src={c.src} className="mt-1 w-full max-w-md" />
                  </li>
                ))}
              </ul>
            )}
            {clips.length > 0 && (
              <label className="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={Boolean(d.audio.checked)}
                  disabled={busy}
                  onChange={(e) => act({ action: "check-audio", id: d.id, on: e.target.checked })}
                />
                <span>
                  <span className="font-semibold">I’ve listened: every recording matches its approved words</span>
                  <span className="block text-sm text-ink-muted">
                    {d.audio.checked ? `Confirmed ${dateText(d.audio.checked.at)}. Learners can play it.` : "Until this is ticked, learners get the text only."}
                  </span>
                </span>
              </label>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {d.voice.ready && d.status === "approved" && toRecord > 0 && (
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirmAction(
                        `Record version ${d.revision} now? That’s ${toRecord} ${toRecord === 1 ? "recording" : "recordings"} from the voice provider, which is charged to the Hub’s account.`,
                        { confirmLabel: "Record" },
                      )
                    )
                      void act({ action: "generate-audio", id: d.id });
                  }}
                >
                  <Icon name="mic" className="size-4" /> {clips.length ? "Record again" : `Record ${toRecord === 1 ? "it" : `${toRecord} clips`}`}
                </button>
              )}
              {clips.length > 0 && (
                <button type="button" className={btn.quiet} disabled={busy} onClick={() => act({ action: "remove-audio", id: d.id })}>
                  <Icon name="trash" className="size-4" /> Text only
                </button>
              )}
            </div>
            {busy && <p className="mt-2 text-sm text-ink-muted">Working… a recording can take a little while.</p>}
          </div>
        </Section>
      )}

      {d.revision > 0 && (
        <Section
          title="Where it’s placed"
          hint="Beside a Topic card, at the top of a Magazine page, or before or after a block. Don’t interrupt a decision before the learner has made it. Opening a moment never counts towards completion."
        >
          <ul className="flex flex-col gap-2">
            {d.placements.map((p) => (
              <li key={p.id} className={cx(box, "flex flex-wrap items-center gap-3")}>
                <div className="min-w-0 flex-1 basis-72">
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-sm text-ink-muted">
                    {p.kind === "guide" && !p.where.endsWith("top of the page") ? `${p.position === "after" ? "After" : "Before"} ` : ""}
                    {p.where} · shows version {p.revision}
                  </p>
                </div>
                {!p.found && <Badge tone="bad">That place has gone</Badge>}
                {p.behind && (
                  <button type="button" className={btn.secondary} disabled={busy} onClick={() => act({ action: "repin", placementId: p.id })}>
                    Update to version {d.revision}
                  </button>
                )}
                {p.href && (
                  <Link href={p.href} className={btn.quiet}>
                    Open
                  </Link>
                )}
                <button type="button" className={btn.quiet} disabled={busy} onClick={() => act({ action: "unplace", placementId: p.id })}>
                  <Icon name="trash" className="size-4" /> Remove
                </button>
              </li>
            ))}
            {!d.placements.length && <li className={cx(box, "text-ink-muted")}>Not placed anywhere yet.</li>}
          </ul>
          {d.status === "approved" && (
            <form
              className={cx(box, "mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_1fr_1fr_9rem_auto]")}
              onSubmit={async (e) => {
                e.preventDefault();
                if (await act({ action: "place", id: d.id, ...place })) setPlace({ ...place, place: "" });
              }}
            >
              <Field label="In a">
                <select
                  className={input}
                  value={place.kind}
                  onChange={(e) => setPlace({ kind: e.target.value as "topic" | "guide", ref: "", place: "", position: "before" })}
                >
                  <option value="guide">Magazine course</option>
                  <option value="topic">Topic</option>
                </select>
              </Field>
              <Field label={place.kind === "topic" ? "Topic" : "Course"}>
                <select className={input} value={place.ref} onChange={(e) => setPlace({ ...place, ref: e.target.value, place: "" })} required>
                  <option value="">Choose…</option>
                  {(place.kind === "topic" ? places?.topics : places?.guides)?.map((t) => (
                    <option key={t.ref} value={t.ref}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={place.kind === "topic" ? "On the card" : "At"}>
                <select className={input} value={place.place} onChange={(e) => setPlace({ ...place, place: e.target.value })} required>
                  <option value="">Choose…</option>
                  {target?.places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Position">
                <select
                  className={input}
                  value={place.position}
                  disabled={place.kind === "topic" || place.place.startsWith("page:")}
                  onChange={(e) => setPlace({ ...place, position: e.target.value })}
                >
                  <option value="before">Before it</option>
                  <option value="after">After it</option>
                </select>
              </Field>
              <div className="flex items-end">
                <button className={btn.secondary} disabled={busy}>
                  Place
                </button>
              </div>
            </form>
          )}
        </Section>
      )}
    </AdminShell>
  );
}
