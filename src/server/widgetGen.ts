import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { audit, type Db } from "./db";
import { canAuthor, HttpError, type User } from "./auth";
import { client, GENERATION_MODEL } from "./generate";

/*
  Widget cards: an author describes what they want (an animated diagram, a calculator, a sorting
  game) and Claude writes it as a small piece of HTML, CSS and JavaScript. The result runs in a
  sandboxed frame with no network and no access to the page or the learner's account (see
  lib/widgetFrame.ts), and the author reviews it in the editor before anyone sees it.
*/

/** Longest description or change an author can ask for in one go. */
export const MAX_REQUEST = 2000;
/** Largest widget we keep. A widget is one card, not an app. */
export const MAX_HTML = 150_000;
/** Builds per author per hour, so a stuck button can't run up a bill. */
export const BUILDS_PER_HOUR = 30;

export type WidgetInput = {
  /** What the author wants, in their own words. */
  request: string;
  /** For a change: the widget as it stands, and what to change. */
  html?: string;
  change?: string;
  /** The lesson and card it sits on, so the widget fits. */
  lesson?: string;
  heading?: string;
};

export type WidgetResult = { html: string; alt: string };

export function widgetPrompt(input: WidgetInput) {
  const brief = `You are building an interactive widget for one card of a short online lesson by Trilogy Care, an Australian aged care provider. The learners are service partners (cleaners, gardeners, other home-support workers) and care coordinators, often on a phone.
${input.lesson ? `\nLesson: ${input.lesson}` : ""}${input.heading ? `\nCard heading: ${input.heading}` : ""}

How the widget runs:
- It is an HTML fragment (markup, one <style> and one <script>) placed inside <body> of a page that is already set up. Don't write <html>, <head> or <body>.
- It runs in a sandboxed frame with no network: no external scripts, stylesheets, fonts, images or fetch calls. Draw with HTML, CSS, inline SVG or <canvas>. Plain JavaScript only, no libraries.
- The frame is the card's width (about 320 to 600 px) and grows to fit the widget's height. Keep it under about 560 px tall. No fixed widths wider than 320 px; it must work on a phone.
- These CSS variables are set for you; use them so it matches the lesson: --navy (#2d4875), --teal (#0e7c7b), --teal-light (#ddf2f3), --mist (#e8eef6), --ink (#102a43), --ink-muted (#3d5068), --line (light border colour), --white, --danger (#d32f2f), --radius (16px), --font (the body font).
- The background is white. Text must have good contrast; buttons and controls at least 44 px tall.

Make it good to use:
- Accessible: real <button>, <input> and <label> elements, keyboard-usable, visible focus, ARIA live regions for results that change. Give an SVG a <title>.
- Animation: smooth and calm. Respect prefers-reduced-motion (show the end state, or offer a step button). Animated diagrams get Play/Pause or Next step controls rather than looping forever.
- Numbers and money: Australian formats ($1,234.50). If figures are made up, label them "Illustrative figures".
- Words: warm, clear Australian English, short. Speak to the learner as "you". No exclamation marks. Don't add policy or facts the author didn't give you.
- Never ask for or store personal information. Don't use localStorage, cookies, alert(), prompt() or forms that submit.

Reply in exactly this shape, with nothing before or after:
<alt>One or two sentences describing what the widget shows and does, for screen readers.</alt>
<widget>
...the HTML fragment...
</widget>`;
  if (input.html && input.change)
    return `${brief}

The author first asked for:
<request>${input.request}</request>

This is the widget as it stands:
<current>
${input.html}
</current>

Change it as follows, keeping everything else that works:
<change>${input.change}</change>`;
  return `${brief}

The author asked for:
<request>${input.request}</request>`;
}

/** Pulls the description and the HTML out of Claude's reply. */
export function parseWidget(text: string): WidgetResult | null {
  const alt = /<alt>([\s\S]*?)<\/alt>/.exec(text)?.[1]?.trim();
  const html = /<widget>([\s\S]*?)<\/widget>/.exec(text)?.[1]?.trim();
  if (!alt || !html) return null;
  return { alt, html: html.replace(/^```(?:html)?\s*|\s*```$/g, "") };
}

export async function buildWidget(db: Db, actor: User, input: WidgetInput, now: Date): Promise<WidgetResult> {
  if (!canAuthor(actor)) throw new HttpError(403, "Only learning authors can build widgets.");
  const request = String(input?.request ?? "").trim();
  const change = input?.change ? String(input.change).trim() : "";
  if (!request) throw new HttpError(400, "Describe the widget you want first.");
  if (request.length > MAX_REQUEST || change.length > MAX_REQUEST) throw new HttpError(400, `Keep the description under ${MAX_REQUEST} characters.`);
  if (input.html && String(input.html).length > MAX_HTML) throw new HttpError(400, "This widget is too big to change. Build it again from the description.");
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = db.prepare("SELECT COUNT(*) n FROM audit WHERE actor = ? AND event = 'widget.built' AND at > ?").get(actor.id, since) as { n: number };
  if (recent.n >= BUILDS_PER_HOUR) throw new HttpError(429, "That’s a lot of widgets in an hour. Try again a little later.");

  const prompt = widgetPrompt({
    request,
    html: change ? String(input.html ?? "") : undefined,
    change: change || undefined,
    lesson: input.lesson ? String(input.lesson).slice(0, 200) : undefined,
    heading: input.heading ? String(input.heading).slice(0, 200) : undefined,
  });
  const stream = client().messages.stream({
    model: GENERATION_MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new HttpError(502, "Claude declined to build this widget. Try rewording the description.");
  if (message.stop_reason === "max_tokens") throw new HttpError(502, "The widget was too big to finish. Ask for something simpler.");
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const result = parseWidget(text);
  if (!result) throw new HttpError(502, "Claude’s reply wasn’t a widget. Try again.");
  if (result.html.length > MAX_HTML) throw new HttpError(502, "The widget came back too big. Ask for something simpler.");
  audit(db, {
    actor: actor.id,
    event: "widget.built",
    entity: "widget",
    next: { model: GENERATION_MODEL, usage: message.usage, change: Boolean(change), request: request.slice(0, 300) },
    at: now,
  });
  return result;
}
