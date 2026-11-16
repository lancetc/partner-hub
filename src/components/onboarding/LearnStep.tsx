"use client";

import { useEffect, useId, useState } from "react";
import { cleanInterest, MAX_INTEREST, type SampleProgress, type SampleTopicItem } from "@/lib/sampleTopic";
import { Icon } from "../Icon";
import { cx } from "@/lib/format";

/*
  "What would you like to learn?" They type a few words, and a short sample topic is built for them
  (by Claude when it's connected, else from a starter template) and added to their learning. While
  it's being built, a friendly progress screen shows what's happening.
*/

const SUGGESTIONS = ["Talking with clients living with dementia", "Spotting signs a client is unwell", "Writing clear visit notes", "Looking after yourself at work"];

/** What the building screen says, as the topic comes together. */
const LINES = ["Reading what you’d like to learn", "Planning the main ideas", "Writing your cards", "Adding a quick check", "Putting it all together"];

type Done = { type: "done"; topic: SampleTopicItem };
type Failed = { type: "error"; error: string };

async function build(interest: string, onEvent: (e: SampleProgress) => void): Promise<SampleTopicItem> {
  let res: Response;
  try {
    res = await fetch("/api/me/sample-topics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ interest }) });
  } catch {
    throw new Error("You’re offline. Building a topic needs an internet connection, so try again when you’re back online.");
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "We couldn’t build your topic just now.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let topic: SampleTopicItem | null = null;
  // Read to the end of the stream (the server closes it after "done").
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const e = JSON.parse(line) as SampleProgress | Done | Failed;
      if (e.type === "done") topic = e.topic;
      else if (e.type === "error") throw new Error(e.error);
      else onEvent(e);
    }
  }
  if (!topic) throw new Error("We couldn’t build your topic just now.");
  return topic;
}

export function LearnStep({
  onBuilt,
  onSkip,
  skipLabel = "Skip for now",
  heading = "What would you like to learn?",
}: {
  onBuilt: (topic: SampleTopicItem) => void | Promise<void>;
  onSkip?: () => void;
  skipLabel?: string;
  heading?: string;
}) {
  const id = useId();
  const [interest, setInterest] = useState("");
  const [state, setState] = useState<"idle" | "building" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [cards, setCards] = useState(0);
  const [template, setTemplate] = useState(false);
  const [line, setLine] = useState(0);
  const usable = Boolean(cleanInterest(interest));

  // Move the friendly message along while it builds, so a longer wait still feels alive.
  useEffect(() => {
    if (state !== "building") return;
    const timer = window.setInterval(() => setLine((n) => Math.min(n + 1, LINES.length - 1)), 3500);
    return () => window.clearInterval(timer);
  }, [state]);

  async function start() {
    if (!usable) return;
    setState("building");
    setProblem(null);
    setCards(0);
    setTemplate(false);
    setLine(0);
    try {
      const topic = await build(interest, (e) => {
        if (e.type === "cards") setCards(e.count);
        if (e.type === "phase" && e.phase === "template") setTemplate(true);
        if (e.type === "phase" && (e.phase === "checking" || e.phase === "fixing")) setLine(LINES.length - 1);
      });
      await onBuilt(topic);
    } catch (e) {
      setProblem((e as Error).message);
      setState("error");
    }
  }

  if (state === "building")
    return (
      <section className="flex flex-col items-center gap-5 py-6 text-center" aria-live="polite" aria-busy="true">
        <span className="relative grid size-24 place-items-center rounded-full bg-tealtint">
          <span className="absolute inset-0 rounded-full border-4 border-action/25 border-t-action motion-safe:animate-spin" aria-hidden />
          <Icon name="spark" className="size-9 text-action motion-safe:animate-pulse" />
        </span>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Building your topic…</h1>
        <p className="max-w-md text-lg">
          {template ? "Putting together a starter topic for you" : LINES[line]}
          {cards > 0 && !template && ` · ${cards} ${cards === 1 ? "card" : "cards"} so far`}
        </p>
        <p className="max-w-md text-ink-muted">
          A short topic on <strong className="text-ink">{cleanInterest(interest)}</strong>. It usually takes under a minute. It’ll be waiting in Discovery Paths
          when it’s ready.
        </p>
      </section>
    );

  return (
    <section className="flex flex-col gap-5">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{heading}</h1>
      <p className="text-lg">Tell us in a few words and we’ll build you a short sample topic. It’s a quick way to see how learning works here.</p>
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="font-semibold">
          I’d like to learn about…
        </label>
        <textarea
          id={id}
          rows={2}
          maxLength={MAX_INTEREST}
          value={interest}
          onChange={(e) => setInterest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void start();
            }
          }}
          placeholder="For example: supporting clients after a fall"
          className="w-full rounded-2xl border border-line-strong bg-surface p-3 text-lg"
        />
      </div>
      <div>
        <p className="text-sm text-ink-muted">Or pick one to try</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => setInterest(s)}
                aria-pressed={interest === s}
                className={cx("min-h-10 rounded-full border px-3 text-sm font-medium hover:bg-muted", interest === s ? "border-action bg-tealtint" : "border-line-strong")}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {state === "error" && problem && (
        <p role="alert" className="flex gap-2 rounded-2xl border border-danger/60 p-3">
          <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-danger" />
          <span>
            {problem} You can try again, or skip this for now.
          </span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {onSkip && (
          <button type="button" onClick={onSkip} className="inline-flex min-h-12 items-center rounded-full border border-line-strong px-5 font-medium hover:bg-muted">
            {skipLabel}
          </button>
        )}
        <button
          type="button"
          onClick={start}
          disabled={!usable}
          className="ml-auto inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-action px-6 text-lg font-semibold text-on-action hover:bg-action-hover disabled:opacity-45 sm:flex-none"
        >
          <Icon name="spark" className="size-5" /> {state === "error" ? "Try again" : "Build my topic"}
        </button>
      </div>
    </section>
  );
}
