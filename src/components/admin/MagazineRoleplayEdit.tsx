"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { ConversationBlock, PhoneCallBlock } from "@/lib/magazine";
import { blankRoleplay, DEFAULT_STATES, DIMENSIONS, TURN_RANGE, type Dimension, type Roleplay } from "@/lib/roleplay";
import type { testTurn, voiceStatus } from "@/server/roleplay";
import { btn, ErrorNote, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The scene behind a conversation practice set to free conversation (docs/voice-roleplay.md). Everything a
  model works within is written here by a person and checked before publishing: who the character is, the
  states the scene can be in, what's worth doing, what's unsafe and the caution for it, and the situations
  that stop the scene for escalation. The block's choices stay, as the version learners can fall back to.
*/

type Voice = ReturnType<typeof voiceStatus>;
type Tested = Awaited<ReturnType<typeof testTurn>>;

export function RoleplaySettings({ block: b, update }: { block: ConversationBlock | PhoneCallBlock; update: Update }) {
  // A Tough Phone Call is always free conversation: it has no choices to fall back to, so it can't be turned off.
  const call = b.type === "phonecall";
  const scene = b.roleplay;
  const set = (fn: (s: Roleplay) => void, tag?: string) =>
    update<ConversationBlock>(b.id, (x) => void (x.roleplay && fn(x.roleplay)), tag && `${b.id}:rp:${tag}`);
  if (!scene)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink-muted">
          Each turn, readers choose what to say and see your coaching and how {b.person || "the person"} replies. Each turn needs a best response.
        </p>
        <button type="button" className={btn.secondary} onClick={() => update<ConversationBlock>(b.id, (x) => void (x.roleplay = blankRoleplay()))}>
          <Icon name="mic" className="size-4" /> Let learners say it in their own words
        </button>
        <p className="text-xs text-ink-muted">
          Adds free conversation: the learner types (or speaks) a reply and an AI plays {b.person || "the character"}, inside a scene you write. Your choices
          stay as the fallback.
        </p>
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      {!call && (
        <p className="text-sm text-ink-muted">
          <strong className="text-ink">Free conversation is on.</strong> Learners type or speak; an AI plays {b.person || "the character"} inside the scene
          below. It can only use what you write here, and it never writes the feedback: the debrief is your wording with the learner’s own words as evidence.
          The choices in the block are still there for anyone who’d rather choose, or if the character can’t reply.
        </p>
      )}
      <Field label="What they’re practising">
        <input className={input} value={scene.goal} maxLength={300} onChange={(e) => set((s) => void (s.goal = e.target.value), "goal")} />
      </Field>
      <Field label="Who the learner is in the scene" hint="Their role and why they’re there.">
        <input className={input} value={scene.learnerRole} maxLength={200} onChange={(e) => set((s) => void (s.learnerRole = e.target.value), "role")} />
      </Field>
      <Field label="What the learner would know, one fact per line" hint="Care-plan facts for this made-up person. Shown to the learner before they start.">
        <textarea
          className={cx(input, "min-h-20 py-2")}
          value={scene.facts.join("\n")}
          onChange={(e) => set((s) => void (s.facts = e.target.value.split("\n").slice(0, 8)), "facts")}
        />
      </Field>
      <Field
        label={`Who ${b.person || "the character"} is`}
        hint="Their history, preferences and what’s worrying them. A particular person, not a type. Never shown to learners. Don’t base it on a real client."
      >
        <textarea
          className={cx(input, "min-h-28 py-2")}
          value={scene.profile}
          maxLength={2000}
          onChange={(e) => set((s) => void (s.profile = e.target.value), "profile")}
        />
      </Field>
      <Field label="Their opening line">
        <textarea
          className={cx(input, "min-h-16 py-2")}
          value={scene.opening}
          maxLength={600}
          onChange={(e) => set((s) => void (s.opening = e.target.value), "opening")}
        />
      </Field>

      <fieldset className="rounded-2xl bg-muted p-3">
        <legend className="px-1 text-sm font-semibold">How the scene is going</legend>
        <Field label="Heading" hint="For a family conversation, something like “Trust in this conversation” fits better.">
          <input className={input} value={scene.meterTitle} maxLength={60} onChange={(e) => set((s) => void (s.meterTitle = e.target.value), "meter")} />
        </Field>
        <Field label="States, calmest first, one per line" hint="3 to 6. The last is reached only by a safety rule, never by the AI." className="mt-2">
          <textarea
            className={cx(input, "min-h-28 py-2")}
            value={scene.states.join("\n")}
            onChange={(e) =>
              set((s) => void ((s.states = e.target.value.split("\n").slice(0, 6)), (s.start = Math.min(s.start, Math.max(0, s.states.length - 2)))), "states")
            }
          />
        </Field>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Field label="Starts at">
            <select className={input} value={scene.start} onChange={(e) => set((s) => void (s.start = Number(e.target.value)))}>
              {scene.states.slice(0, -1).map((x, i) => (
                <option key={i} value={i}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fewest replies">
            <input
              type="number"
              min={TURN_RANGE.min}
              max={TURN_RANGE.max}
              className={input}
              value={scene.minTurns}
              onChange={(e) => set((s) => void (s.minTurns = Number(e.target.value)))}
            />
          </Field>
          <Field label="Most replies">
            <input
              type="number"
              min={TURN_RANGE.min}
              max={TURN_RANGE.max}
              className={input}
              value={scene.maxTurns}
              onChange={(e) => set((s) => void (s.maxTurns = Number(e.target.value)))}
            />
          </Field>
        </div>
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-action)]"
            checked={scene.hideMeter}
            onChange={(e) => set((s) => void (s.hideMeter = e.target.checked))}
          />
          <span>
            Hide it while they talk
            <span className="block text-xs text-ink-muted">For a harder replay. They see how the scene went, reply by reply, in the debrief.</span>
          </span>
        </label>
        <button type="button" className={cx(btn.quiet, "mt-1")} onClick={() => set((s) => void (s.states = [...DEFAULT_STATES]))}>
          Use the usual five states
        </button>
      </fieldset>

      <fieldset className="rounded-2xl bg-muted p-3">
        <legend className="px-1 text-sm font-semibold">Worth doing in this scene ({scene.moves.length})</legend>
        <p className="text-xs text-ink-muted">
          What a good reply does, in words you could point to. At least two. Any respectful wording counts; nobody has to say a set phrase.
        </p>
        {scene.moves.map((m, i) => (
          <div key={m.id} className="mt-2 grid gap-2 rounded-xl bg-surface p-2">
            <input
              aria-label={`Good move ${i + 1}`}
              className={input}
              value={m.text}
              maxLength={200}
              placeholder="Acknowledged her worry before anything else"
              onChange={(e) => set((s) => void (s.moves[i].text = e.target.value), `m${i}`)}
            />
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input
                aria-label={`Example for good move ${i + 1}`}
                className={input}
                value={m.example}
                maxLength={300}
                placeholder="How it might sound (optional)"
                onChange={(e) => set((s) => void (s.moves[i].example = e.target.value), `me${i}`)}
              />
              <button type="button" className={btn.quiet} aria-label={`Remove good move ${i + 1}`} onClick={() => set((s) => void s.moves.splice(i, 1))}>
                <Icon name="trash" className="size-4" />
              </button>
            </div>
            <select
              aria-label={`What good move ${i + 1} is about`}
              className={input}
              value={m.dimension}
              onChange={(e) => set((s) => void (s.moves[i].dimension = e.target.value as Dimension))}
            >
              {(Object.keys(DIMENSIONS) as Dimension[]).map((d) => (
                <option key={d} value={d}>
                  {DIMENSIONS[d]}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() => set((s) => void s.moves.push({ id: rid("move"), dimension: "listening", text: "", example: "" }))}
        >
          <Icon name="plus" className="size-4" /> Add
        </button>
      </fieldset>

      <fieldset className="rounded-2xl bg-muted p-3">
        <legend className="px-1 text-sm font-semibold">Unsafe in this scene ({scene.risks.length})</legend>
        <p className="text-xs text-ink-muted">
          What must never be rewarded: a false promise, arguing about what they remember, a threat, a promise outside the learner’s authority. The caution is
          what the learner reads, even if the scene seemed to calm. Check it against current policy.
        </p>
        {scene.risks.map((r, i) => (
          <div key={r.id} className="mt-2 grid gap-2 rounded-xl bg-surface p-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input
                aria-label={`Unsafe move ${i + 1}`}
                className={input}
                value={r.text}
                maxLength={200}
                placeholder="Made a promise that isn’t true"
                onChange={(e) => set((s) => void (s.risks[i].text = e.target.value), `r${i}`)}
              />
              <button type="button" className={btn.quiet} aria-label={`Remove unsafe move ${i + 1}`} onClick={() => set((s) => void s.risks.splice(i, 1))}>
                <Icon name="trash" className="size-4" />
              </button>
            </div>
            <textarea
              aria-label={`Caution for unsafe move ${i + 1}`}
              className={cx(input, "min-h-16 py-2")}
              value={r.caution}
              maxLength={600}
              placeholder="The caution the learner reads"
              onChange={(e) => set((s) => void (s.risks[i].caution = e.target.value), `rc${i}`)}
            />
          </div>
        ))}
        <button type="button" className={cx(btn.secondary, "mt-2")} onClick={() => set((s) => void s.risks.push({ id: rid("risk"), text: "", caution: "" }))}>
          <Icon name="plus" className="size-4" /> Add
        </button>
      </fieldset>

      <fieldset className="rounded-2xl bg-muted p-3">
        <legend className="px-1 text-sm font-semibold">Safety rules ({scene.safety.length})</legend>
        <p className="text-xs text-ink-muted">
          Situations that stop the conversation: an injury, a sudden change, someone missing, a threat. If a learner’s reply contains one of the phrases, the
          scene stops and they see your wording and guidance. The AI isn’t asked, so it can’t improvise. Have Quality check the guidance.
        </p>
        {scene.safety.map((r, i) => (
          <div key={r.id} className="mt-2 grid gap-2 rounded-xl bg-surface p-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input
                aria-label={`Safety rule ${i + 1}`}
                className={input}
                value={r.label}
                maxLength={80}
                placeholder="A fall or injury"
                onChange={(e) => set((s) => void (s.safety[i].label = e.target.value), `s${i}`)}
              />
              <button type="button" className={btn.quiet} aria-label={`Remove safety rule ${i + 1}`} onClick={() => set((s) => void s.safety.splice(i, 1))}>
                <Icon name="trash" className="size-4" />
              </button>
            </div>
            <textarea
              aria-label={`Phrases for safety rule ${i + 1}, one per line`}
              className={cx(input, "min-h-16 py-2")}
              value={r.phrases.join("\n")}
              placeholder={"Phrases to listen for, one per line\nshe has fallen\nbleeding"}
              onChange={(e) => set((s) => void (s.safety[i].phrases = e.target.value.split("\n").slice(0, 20)), `sp${i}`)}
            />
            <textarea
              aria-label={`What the learner sees for safety rule ${i + 1}`}
              className={cx(input, "min-h-16 py-2")}
              value={r.response}
              maxLength={600}
              placeholder="What the learner sees instead of a reply"
              onChange={(e) => set((s) => void (s.safety[i].response = e.target.value), `sr${i}`)}
            />
            <textarea
              aria-label={`Escalation guidance for safety rule ${i + 1}`}
              className={cx(input, "min-h-16 py-2")}
              value={r.guidance}
              maxLength={800}
              placeholder="The approved escalation guidance for this role"
              onChange={(e) => set((s) => void (s.safety[i].guidance = e.target.value), `sg${i}`)}
            />
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() => set((s) => void s.safety.push({ id: rid("safety"), label: "", phrases: [], response: "", guidance: "" }))}
        >
          <Icon name="plus" className="size-4" /> Add
        </button>
      </fieldset>

      <Field label="The approved guidance behind the scene" hint="Named in the debrief.">
        <input className={input} value={scene.guidanceLabel} maxLength={120} onChange={(e) => set((s) => void (s.guidanceLabel = e.target.value), "gl")} />
      </Field>
      <Field label="Link to it" hint="A page on the Hub (/resources/…) or a web address.">
        <input className={input} value={scene.guidanceHref} maxLength={300} onChange={(e) => set((s) => void (s.guidanceHref = e.target.value), "gh")} />
      </Field>

      <VoiceSwitch scene={scene} onChange={(on) => set((s) => void (s.voice = on))} />
      <TryScene block={b} />

      {!call && (
        <button
          type="button"
          className={btn.quiet}
          onClick={() => {
            if (window.confirm("Turn free conversation off for this block? The scene you’ve written here is removed. The choices stay."))
              update<ConversationBlock>(b.id, (x) => void delete x.roleplay);
          }}
        >
          Turn free conversation off
        </button>
      )}
    </div>
  );
}

/** Speaking a reply: allowed per scene, but only once a Hub administrator has switched voice on. */
function VoiceSwitch({ scene, onChange }: { scene: Roleplay; onChange: (on: boolean) => void }) {
  const { data, setData } = useApi<Voice>("/api/admin/roleplay");
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <fieldset className="rounded-2xl bg-muted p-3">
      <legend className="px-1 text-sm font-semibold">Voice</legend>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-action)]" checked={scene.voice} onChange={(e) => onChange(e.target.checked)} />
        <span>
          Let learners speak their reply
          <span className="block text-xs text-ink-muted">
            They see what was heard and can fix it before it’s sent. Typing always works, and nothing about how they sound is assessed.
          </span>
        </span>
      </label>
      {data && (
        <p className="mt-2 text-xs text-ink-muted">
          {data.voice
            ? "Voice is switched on for the Hub."
            : "Voice is switched off for the Hub, so learners can only type for now. Speaking sends a recording to OpenAI to be turned into text (the Hub doesn’t keep it); switch it on once that’s been agreed."}
          {!data.speechConnected && " OpenAI isn’t connected, so speech can’t work yet."}
        </p>
      )}
      {data?.canSwitch && (
        <button
          type="button"
          className={cx(btn.quiet, "mt-1")}
          onClick={async () => {
            setProblem(null);
            if (
              !data.voice &&
              !window.confirm(
                "Switch voice on for the whole Hub? Learners’ recordings will be sent to OpenAI for transcription. The Hub doesn’t store the audio.",
              )
            )
              return;
            try {
              setData(await api<Voice>("/api/admin/roleplay", { body: { action: "voice", on: !data.voice } }));
            } catch (e) {
              setProblem(e instanceof Error ? e.message : "That didn’t save.");
            }
          }}
        >
          {data.voice ? "Switch voice off for the Hub" : "Switch voice on for the Hub"}
        </button>
      )}
      {problem && <ErrorNote text={problem} />}
    </fieldset>
  );
}

/** Try a reply against the scene as written, and see why it came out the way it did. Nothing is stored. */
function TryScene({ block }: { block: ConversationBlock | PhoneCallBlock }) {
  const [text, setText] = useState("");
  const [out, setOut] = useState<Tested | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scene = block.roleplay!;
  return (
    <fieldset className="rounded-2xl bg-muted p-3">
      <legend className="px-1 text-sm font-semibold">Try a reply</legend>
      <p className="text-xs text-ink-muted">
        Type what a learner might say as their first reply: a good one, an unsafe one, an odd one, one that should trip a safety rule. The preview runs the
        whole conversation.
      </p>
      <textarea
        aria-label="A learner’s reply to try"
        className={cx(input, "mt-2 min-h-16 py-2")}
        value={text}
        maxLength={600}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="button"
        className={cx(btn.secondary, "mt-2")}
        disabled={busy || text.trim().length < 2}
        onClick={async () => {
          setBusy(true);
          setProblem(null);
          try {
            setOut(await api<Tested>("/api/admin/roleplay", { body: { action: "test", block, history: [], text } }));
          } catch (e) {
            const problems = (e as { problems?: string[] }).problems;
            setProblem(`${e instanceof Error ? e.message : "That didn’t run."}${problems?.length ? ` ${problems[0]}` : ""}`);
            setOut(null);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Running…" : "Run it"}
      </button>
      {problem && (
        <div className="mt-2">
          <ErrorNote text={`${problem} The scene has to be complete (see the checks) before it can run.`} />
        </div>
      )}
      {out && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm" aria-live="polite">
          <dt className="font-semibold">{block.person || "They"} said</dt>
          <dd>{out.reply}</dd>
          <dt className="font-semibold">Scene</dt>
          <dd>
            {scene.states[out.stateBefore]} → {scene.states[out.stateAfter]}. {out.why} {out.caption}
          </dd>
          <dt className="font-semibold">Worth doing</dt>
          <dd>{out.moves.length ? out.moves.map((m) => `${m.text} (“${m.quote}”)`).join("; ") : "Nothing tagged"}</dd>
          <dt className="font-semibold">Unsafe</dt>
          <dd>{out.risks.length ? out.risks.map((r) => `${r.text} (“${r.quote}”)`).join("; ") : "Nothing tagged"}</dd>
          {out.unclear && (
            <>
              <dt className="font-semibold">Unclear</dt>
              <dd>It couldn’t tell what the learner was doing, and would say so.</dd>
            </>
          )}
          {out.safety && (
            <>
              <dt className="font-semibold">Safety</dt>
              <dd>
                {out.safety.label}: {out.safety.guidance}
              </dd>
            </>
          )}
        </dl>
      )}
    </fieldset>
  );
}
