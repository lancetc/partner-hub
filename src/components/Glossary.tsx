"use client";

import { useMemo, useState } from "react";
import { glossary, termId, type GlossaryTerm } from "@/content/glossary";
import { cx } from "@/lib/format";
import { Icon } from "./Icon";

/*
  The glossary: search across every term, or narrow to one section. Each term has its own
  anchor (/resources/glossary#care-partner) so other pages can link to it.
*/

const words = (t: GlossaryTerm) => [t.term, t.full, t.definition, ...(t.list ?? [])].join(" ").toLowerCase();

/** Marks where the search matches, so learners can see why a term came up. */
function Hit({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q ? (
          <mark key={i} className="rounded bg-gold/40 px-0.5 text-inherit">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

export function Glossary() {
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<string | null>(null);
  const q = query.trim().toLowerCase();

  const sections = useMemo(
    () =>
      glossary
        .filter((s) => !only || s.id === only)
        .map((s) => ({ ...s, terms: s.terms.filter((t) => !q || words(t).includes(q)) }))
        .filter((s) => s.terms.length),
    [q, only],
  );
  const found = sections.reduce((n, s) => n + s.terms.length, 0);

  return (
    <>
      {/* Search and section filters stay in reach while scrolling a long list. */}
      <div className="sticky top-16 z-10 -mx-4 mt-6 border-b border-line bg-bg/95 px-4 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
        <label className="flex items-center gap-2 rounded-full border border-line-strong bg-surface px-4 sm:max-w-md">
          <Icon name="search" className="size-4 shrink-0 text-ink-muted" />
          <span className="sr-only">Search the glossary</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms, such as NOA or rollover"
            className="min-h-11 w-full bg-transparent outline-none placeholder:text-ink-muted"
          />
        </label>
        <div role="group" aria-label="Show one section" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ id: null, title: "All" }, ...glossary].map((s) => {
            const on = only === s.id;
            return (
              <button
                key={s.id ?? "all"}
                type="button"
                aria-pressed={on}
                onClick={() => setOnly(s.id)}
                className={cx(
                  "min-h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors",
                  on ? "bg-action text-on-action" : "bg-surface text-ink ring-1 ring-line hover:ring-action",
                )}
              >
                {s.title}
              </button>
            );
          })}
        </div>
      </div>

      <p role="status" className="sr-only">
        {q || only ? `${found} ${found === 1 ? "term" : "terms"} shown` : ""}
      </p>

      {!found ? (
        <div className="mt-10 rounded-3xl border border-dashed border-line-strong p-8 text-center">
          <p className="font-serif text-xl font-semibold">No terms match “{query.trim()}”</p>
          <p className="mt-1 text-ink-muted">Try a shorter word, or an abbreviation such as SAH.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOnly(null);
            }}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
          >
            Show all terms
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6 pb-12">
          {sections.map((s) => (
            <section key={s.id} aria-labelledby={`g-${s.id}`} className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
              <h2 id={`g-${s.id}`} className="flex items-center gap-3 font-serif text-2xl font-semibold">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-2xl bg-tealtint text-accent">
                  <Icon name={s.icon} className="size-5" />
                </span>
                {s.title}
              </h2>
              <dl className="mt-4 grid gap-x-8 md:grid-cols-2">
                {s.terms.map((t) => (
                  <div
                    key={t.term}
                    id={termId(t)}
                    className="-mx-3 scroll-mt-48 rounded-2xl border-t border-line px-3 py-4 transition-colors hover:border-transparent hover:bg-tealtint target:border-transparent target:bg-tealtint"
                  >
                    <dt>
                      <span className="font-mulish text-lg font-extrabold text-ink">
                        <Hit text={t.term} q={q} />
                      </span>
                      {t.full && (
                        <span className="ml-2 text-sm font-semibold text-accent">
                          <Hit text={t.full} q={q} />
                        </span>
                      )}
                    </dt>
                    <dd className="mt-1 text-ink-muted">
                      <Hit text={t.definition} q={q} />
                      {t.list && (
                        <ul className="mt-2 flex flex-col gap-1">
                          {t.list.map((l) => (
                            <li key={l} className="flex gap-2">
                              <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
                              <span>
                                <Hit text={l} q={q} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
