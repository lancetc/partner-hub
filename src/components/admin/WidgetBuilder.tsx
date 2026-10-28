"use client";

import { useState } from "react";
import type { Card } from "@/content/lessons";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { Widget } from "../player/Widget";
import { btn, ErrorNote, Field, input } from "./ui";

type WidgetCard = Extract<Card, { type: "widget" }>;
type Set = (fn: (c: Card) => void) => void;

const textarea = "w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[0.98rem] leading-relaxed";

/** Starting points, so it's clear what a widget can be. */
const IDEAS = [
  "An animated diagram of the steps when a client has a fall: check, call, record, report. Next step button to move through it.",
  "A calculator: drag a slider for visit length (30 to 180 minutes, steps of 15) at an illustrative $80 an hour and show the total.",
  "A sorting game: drag eight statements into “Fact” or “Opinion”, then check the answers with a short reason for each.",
  "A timeline of a client’s week with five visits; tap a visit to see what the worker noticed.",
];

async function requestWidget(body: Record<string, string | undefined>) {
  const res = await fetch("/api/admin/widgets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Claude couldn’t build the widget.");
  return data as { html: string; alt: string };
}

/**
  On the card itself: describe the widget and Claude builds it; then try it out right there and
  ask for changes in plain words. The code is in the card settings for anyone who wants it.
*/
export function WidgetBuilder({ card: c, lessonTitle, set, onSettings }: { card: WidgetCard; lessonTitle: string; set: Set; onSettings: () => void }) {
  const [busy, setBusy] = useState<"build" | "change" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [change, setChange] = useState("");
  const w = c.widget;

  async function run(kind: "build" | "change") {
    setBusy(kind);
    setError(null);
    try {
      const out = await requestWidget({
        request: w.request,
        html: kind === "change" ? w.html : undefined,
        change: kind === "change" ? change : undefined,
        lesson: lessonTitle,
        heading: c.heading,
      });
      set((x) => {
        if (x.type !== "widget") return;
        x.widget.html = out.html;
        x.widget.alt = out.alt;
        if (kind === "change") x.widget.request = `${x.widget.request}\n\nThen: ${change.trim()}`;
      });
      if (kind === "change") setChange("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const working = busy && (
    <p role="status" className="flex items-center gap-2 rounded-2xl bg-tealtint px-3 py-2 text-sm text-ink">
      <Icon name="spark" className="size-4 shrink-0 animate-pulse text-action" />
      {busy === "build" ? "Claude is building your widget. This usually takes under a minute." : "Claude is making that change…"}
    </p>
  );

  if (!w.html)
    return (
      <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3 text-sm text-ink shadow-sm ring-1 ring-line">
        <label className="font-semibold" htmlFor={`${c.id}-widget-request`}>
          Describe the widget
        </label>
        <textarea
          id={`${c.id}-widget-request`}
          rows={4}
          className={textarea}
          value={w.request}
          onChange={(e) => set((x) => x.type === "widget" && void (x.widget.request = e.target.value))}
          placeholder="What should it show, and what can the learner do with it?"
          disabled={!!busy}
        />
        {!w.request.trim() && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">Or start from an idea:</span>
            {IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => set((x) => x.type === "widget" && void (x.widget.request = idea))}
                className="rounded-xl bg-muted px-2.5 py-1.5 text-left text-xs leading-snug hover:bg-strong"
              >
                {idea}
              </button>
            ))}
          </div>
        )}
        {working}
        {error && <ErrorNote text={error} />}
        <button type="button" onClick={() => run("build")} disabled={!w.request.trim() || !!busy} className={cx(btn.primary, "self-start")}>
          <Icon name="spark" className="size-4" /> {busy ? "Building…" : "Build widget"}
        </button>
      </div>
    );

  return (
    <div className="flex flex-col gap-2 text-sm text-ink">
      <Widget html={w.html} alt={w.alt} />
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (change.trim() && !busy) run("change");
        }}
      >
        <label className="sr-only" htmlFor={`${c.id}-widget-change`}>
          Ask for a change
        </label>
        <input
          id={`${c.id}-widget-change`}
          className={cx(input, "min-w-0 flex-1 bg-surface")}
          value={change}
          onChange={(e) => setChange(e.target.value)}
          placeholder="Ask for a change, e.g. make the buttons bigger"
          disabled={!!busy}
        />
        <button type="submit" disabled={!change.trim() || !!busy} className={btn.primary}>
          {busy === "change" ? "Changing…" : "Change"}
        </button>
      </form>
      {working}
      {error && <ErrorNote text={error} />}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => run("build")}
          disabled={!!busy}
          className="inline-flex min-h-8 items-center gap-1 rounded-full bg-surface px-3 text-xs font-semibold shadow-sm ring-1 ring-line"
        >
          <Icon name="refresh" className="size-3.5" /> Build again
        </button>
        <button
          type="button"
          onClick={onSettings}
          className="inline-flex min-h-8 items-center gap-1 rounded-full bg-surface px-3 text-xs font-semibold shadow-sm ring-1 ring-line"
        >
          <Icon name="sliders" className="size-3.5" /> Description and code
        </button>
      </div>
    </div>
  );
}

/** In the card settings: the description Claude worked from, the screen reader text, and the code itself. */
export function WidgetFields({ card: c, set }: { card: WidgetCard; set: Set }) {
  const w = c.widget;
  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <p className="text-sm font-semibold">Widget</p>
      <Field label="Description for Claude" hint="What you asked for, including any changes. Build again on the card to start over from this.">
        <textarea
          rows={4}
          className={textarea}
          value={w.request}
          onChange={(e) => set((x) => x.type === "widget" && void (x.widget.request = e.target.value))}
        />
      </Field>
      <Field label="What it shows, for screen readers" hint="Claude writes this. Check it describes the widget.">
        <textarea rows={2} className={textarea} value={w.alt} onChange={(e) => set((x) => x.type === "widget" && void (x.widget.alt = e.target.value))} />
      </Field>
      <details className="rounded-2xl border border-line p-3">
        <summary className="cursor-pointer font-semibold">Code (HTML, CSS and JavaScript)</summary>
        <p className="mt-1 text-sm text-ink-muted">
          Runs in a sealed frame: it can’t reach the internet, the lesson or the learner’s account. Edits show on the card straight away.
        </p>
        <textarea
          rows={16}
          spellCheck={false}
          className={cx(textarea, "mt-2 font-mono text-xs")}
          value={w.html}
          onChange={(e) => set((x) => x.type === "widget" && void (x.widget.html = e.target.value))}
        />
      </details>
    </div>
  );
}
