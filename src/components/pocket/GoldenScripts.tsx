"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cx, formatDate } from "@/lib/format";
import { scriptCopyText, TOOL_STATUS } from "@/lib/pocketPlaybook";
import type { ToolDetail } from "@/server/pocketPlaybook";
import { Icon } from "../Icon";
import { pocketEvent } from "./pocketApi";

/*
  Tool C, Golden Scripts: "Notes to a Younger Me" (docs/pocket-playbook.md). Short, reviewed openings for a hard
  moment, each with its fact slots, what to check first, what not to promise and the next step. Copying puts the
  wording on the clipboard with its [placeholders] visible and a "verify before use" cue: never a client's details,
  and nothing is saved. A script is a starting phrase, followed by listening and checking.
*/

type Script = ToolDetail["scripts"][number];
const afterRender = (fn: () => void) => window.setTimeout(fn, 0);

/** The opening, with each [placeholder] marked so it's seen as something to fill in, not read out. */
function Opening({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\])/);
  return (
    <p className="font-serif text-xl leading-snug">
      “
      {parts.map((p, i) =>
        /^\[.+\]$/.test(p) ? (
          <mark key={i} className="rounded bg-[#fff1cc] px-1 font-sans text-base font-semibold text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
      ”
    </p>
  );
}

export function GoldenScripts({ scripts, place, open, onOpenTool }: { scripts: Script[]; place: string; open?: string; onOpenTool?: (id: string) => void }) {
  const [shown, setShown] = useState<string>(() => open ?? "");
  const [copied, setCopied] = useState("");
  const opened = useRef(new Set<string>());
  const show = (id: string) => {
    setShown(id);
    if (!opened.current.has(id)) {
      opened.current.add(id);
      pocketEvent({ event: "script_opened", scriptId: id, place });
    }
  };
  // Opened at a script (from search): show it, in view, once. On a page, #script-<id> does the same.
  useEffect(() => {
    const target = open || (window.location.hash.startsWith("#script-") ? window.location.hash.slice(8) : "");
    if (!target || !scripts.some((s) => s.id === target)) return;
    // Known only once the page is in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    show(target);
    afterRender(() => document.getElementById(`script-${target}`)?.scrollIntoView({ block: "start" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scripts]);

  if (!scripts.length) return <p>There are no scripts for your role yet.</p>;
  return (
    <div>
      <p className="text-sm text-ink-muted">A starting phrase, then listen and check. Adapt it to the person; never read it word for word.</p>
      <ul className="mt-3 flex flex-col gap-3">
        {scripts.map((s) => {
          const isOpen = shown === s.id;
          return (
            <li key={s.id} id={`script-${s.id}`} className="scroll-mt-28 rounded-2xl border border-line bg-surface">
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`script-body-${s.id}`}
                  onClick={() => (isOpen ? setShown("") : show(s.id))}
                  className="flex min-h-14 w-full items-center gap-3 p-4 text-left"
                >
                  <Icon name="chat" className="size-5 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 font-semibold">{s.trigger}</span>
                  <Icon name="chevron-down" className={cx("size-4 shrink-0 transition-transform motion-reduce:transition-none", isOpen && "rotate-180")} />
                </button>
              </h3>
              {isOpen && (
                <div id={`script-body-${s.id}`} className="border-t border-line p-4">
                  <p className="text-sm text-ink-muted">{s.intent}</p>
                  <div className="mt-2">
                    <Opening text={s.opening} />
                  </div>
                  {s.slots.length > 0 && (
                    <dl className="mt-2 text-sm">
                      {s.slots.map((sl) => (
                        <div key={sl.key} className="flex gap-1">
                          <dt className="font-semibold">[{sl.label}]:</dt>
                          <dd>{sl.hint}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <p className="mt-3 rounded-xl bg-tealtint p-3 text-sm">
                    <span className="font-semibold">Check before saying this:</span> {s.check}
                  </p>
                  <p className="mt-2 flex items-start gap-2 rounded-xl bg-muted p-3 text-sm">
                    <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                    <span>
                      <span className="font-semibold">Don’t:</span> {s.guardrail}
                    </span>
                  </p>
                  <p className="mt-2 text-sm">
                    <span className="font-semibold">Next:</span> {s.next}
                  </p>
                  {s.related.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-x-4 text-sm">
                      {s.related.map((r) =>
                        r.kind === "tool" && onOpenTool ? (
                          <li key={r.id}>
                            <button type="button" onClick={() => onOpenTool(r.id)} className="min-h-11 font-semibold text-accent underline underline-offset-2">
                              Open {r.label}
                            </button>
                          </li>
                        ) : (
                          <li key={r.id}>
                            <Link href={`/tools/${r.id}`} className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
                              {r.kind === "aid" ? "Job Aid: " : "Open "}
                              {r.label}
                            </Link>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(scriptCopyText(s));
                          setCopied(s.id);
                          pocketEvent({ event: "script_copied", scriptId: s.id, place });
                        } catch {
                          setCopied("");
                        }
                      }}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted"
                    >
                      <Icon name="copy" className="size-4" /> Copy, with placeholders
                    </button>
                    <span role="status" className="text-sm">
                      {copied === s.id ? "Copied with [placeholders] and “Verify before use”. Nothing is saved." : ""}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-ink-muted">
                    {TOOL_STATUS[s.status]} · version {s.version} · owner {s.owner}, reviewer {s.reviewer} · {s.source}
                    {s.reviewOn ? ` · review by ${formatDate(s.reviewOn)}` : ""}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
