"use client";

import { cx } from "@/lib/format";
import { PAGE_TEMPLATES, templatePage, type PageTemplate } from "@/lib/magazine";
import { Icon, type IconName } from "../Icon";

/*
  The page templates as cards: "What should the learner be able to do on this page?" Each names the
  learner action, shows the page's starting sections (its composition) and a Hub example. Used when
  starting a Magazine and when adding a page.
*/

export type TemplateChoice = PageTemplate | "assessment";

const ICONS: Record<TemplateChoice, IconName> = {
  decide: "target",
  do: "checklist",
  notice: "eye",
  adapt: "refresh",
  say: "chat",
  blank: "doc",
  assessment: "clipboard",
};

/** The sections a template starts with, for the card's preview. */
const outline = (t: TemplateChoice) => templatePage(t, (p) => p).sections.map((s) => s.title);

export function TemplatePicker({
  value,
  onChange,
  assessment = false,
  name = "page-template",
}: {
  value: TemplateChoice;
  onChange: (t: TemplateChoice) => void;
  /** Also offer an assessment page (the Hub's quiz). */
  assessment?: boolean;
  name?: string;
}) {
  const choices: TemplateChoice[] = [...(Object.keys(PAGE_TEMPLATES) as PageTemplate[]), ...(assessment ? (["assessment"] as const) : [])];
  return (
    <fieldset>
      <legend className="text-sm font-semibold">What should the learner be able to do on this page?</legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {choices.map((t) => {
          const info =
            t === "assessment"
              ? { label: "Assessment", title: "The Hub’s quiz", action: "Show what they’ve learnt, with the quiz’s pass mark and retakes.", example: "" }
              : PAGE_TEMPLATES[t];
          return (
            <label
              key={t}
              className={cx(
                "flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                value === t ? "border-action bg-tealtint" : "border-line hover:bg-muted",
              )}
            >
              <span className="flex items-center gap-2">
                <input type="radio" name={name} checked={value === t} onChange={() => onChange(t)} className="size-4 accent-[var(--color-action)]" />
                <Icon name={ICONS[t]} className="size-5 text-accent" />
                <span className="font-semibold">{info.label}</span>
                <span className="text-sm text-ink-muted">· {info.title}</span>
              </span>
              <span className="text-sm">{info.action}</span>
              <ol className="flex flex-wrap gap-1" aria-label="Starting sections">
                {outline(t).map((s, i) => (
                  <li key={i} className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink-muted ring-1 ring-line">
                    {s}
                  </li>
                ))}
              </ol>
              {info.example && <span className="text-xs text-ink-muted">For example: {info.example}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
