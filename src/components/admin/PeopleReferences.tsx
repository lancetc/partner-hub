"use client";

import { useEffect } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { plainText } from "@/lib/richText";

/*
  "People on this page": before a new picture is made, the characters a piece of content names, from the character
  library (their official portrait) and the image library (pictures that mention them). Tapping one makes it a
  reference, sent with the description so the person keeps the same look (server/imageGen, GPT Image only); "Use"
  puts that picture straight in instead. Nothing here costs anything: only Generate does.
*/

type Picture = { src: string; width: number; height: number };
type LibraryPhoto = Picture & { name?: string; title?: string; alt?: string };
type Character = { id: string; name: string; aliases: string[]; portrait: string; hidden?: boolean };

const NOT_NAMES = new Set(
  (
    "A An The This That These Those It Its I You Your We Our They Their He She His Her What When Where Why How Who Which If But And Or So Then Now " +
    "Today Tomorrow Yesterday Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September " +
    "October November December Day Week Trilogy Care Partner Partners Coordinator Coordinators Support Home Hub Topic Card Step Module Part Page Chapter " +
    "Microsoft Google Australia Australian Medicare Commission Act Rules Quality Standards Aged Service Services Serious Incident Incidents Response Scheme " +
    "Management System Systems Priority Policy Procedure Learning Guide Course"
  ).split(" "),
);

/** The people (and other proper names) some content mentions: capitalised words that don't just start a sentence. */
export function namesIn(...pieces: string[]): string[] {
  const text = pieces.map((t) => plainText(t ?? "")).join(". ");
  const seen = new Map<string, number>();
  for (const m of text.matchAll(/(?<=(?:^|[^.!?])\s)([A-Z][a-z]{2,})(?:['’]s)?\b/g)) {
    const w = m[1];
    if (!NOT_NAMES.has(w)) seen.set(w, (seen.get(w) ?? 0) + 1);
  }
  // A name that only ever starts a sentence ("Ayla notices… Ayla tells…"): counted when it's there twice and never
  // written in lower case, which keeps out everyday words like "Choose" or "Before".
  const starts = new Map<string, number>();
  for (const m of text.matchAll(/(?:^|[.!?]\s+)([A-Z][a-z]{2,})(?:['’]s)?\b/g)) starts.set(m[1], (starts.get(m[1]) ?? 0) + 1);
  for (const [w, n] of starts)
    if (!seen.has(w) && n >= 2 && !NOT_NAMES.has(w) && !new RegExp(`\\b${w.toLowerCase()}\\b`).test(text)) seen.set(w, n);
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, 4);
}

const mentions = (names: string[], text: string) => names.some((w) => new RegExp(`\\b${w}(?:['’]?s)?\\b`, "i").test(text));

/** Character portraits for those names first, then library pictures that mention them; each one choosable as a reference. */
export function PeopleReferences({
  names,
  chosen,
  onChosen,
  onUse,
  onShown,
  noun = "page",
}: {
  names: string[];
  /** The references chosen so far; null until the author changes them (the character portraits start chosen). */
  chosen: string[] | null;
  onChosen: (srcs: string[]) => void;
  onUse: (p: Picture, alt: string) => void;
  /** The character portraits chosen by default, for a caller that sends them before the author changes anything. */
  onShown?: (srcs: string[]) => void;
  noun?: string;
}) {
  const library = useApi<{ uploads: LibraryPhoto[] }>("/api/admin/uploads").data?.uploads ?? [];
  const characters = useApi<{ characters: Character[] }>("/api/admin/characters").data?.characters ?? [];
  const portraits = characters
    .filter((ch) => ch.portrait && !ch.hidden && [ch.name, ...(ch.aliases ?? [])].some((n) => mentions(names, n)))
    .map((ch) => ({ src: ch.portrait, width: 1024, height: 1024, label: `${ch.name} (character)`, alt: `Portrait of ${ch.name}` }));
  const found = names.length
    ? library
        .filter((ph) => !portraits.some((x) => x.src === ph.src) && mentions(names, [ph.name, ph.title, ph.alt].filter(Boolean).join(" ")))
        .slice(0, 8)
        .map((ph) => ({ ...ph, label: ph.title || ph.src.split("/").pop() || "", alt: ph.alt ?? "" }))
    : [];
  const tiles = [...portraits, ...found];
  const picked = chosen ?? portraits.map((x) => x.src).slice(0, 4);
  const defaults = portraits
    .map((x) => x.src)
    .slice(0, 4)
    .join("|");
  useEffect(() => {
    onShown?.(defaults ? defaults.split("|") : []);
  }, [defaults, onShown]);
  const toggle = (src: string) => onChosen(picked.includes(src) ? picked.filter((x) => x !== src) : [...picked, src].slice(-4));
  return (
    <div>
      <p className="text-sm font-semibold">People on this {noun}</p>
      {tiles.length ? (
        <>
          <p className="text-xs text-ink-muted">
            Tap up to 4 to use as references, so {names.slice(0, 2).join(" and ") || "they"} look the same in the new picture. Character portraits come first.
          </p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {tiles.map((ph) => {
              const on = picked.includes(ph.src);
              return (
                <div key={ph.src} className="flex flex-col gap-1">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(ph.src)}
                    title={ph.label}
                    aria-label={`${on ? "Stop using" : "Use"} ${ph.label} as a reference`}
                    className={cx(
                      "relative aspect-[4/3] overflow-hidden rounded-xl border-2",
                      on ? "border-action ring-2 ring-action/30" : "border-transparent hover:border-line-strong",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ph.src} alt="" className="size-full object-cover" />
                    {on && <span className="absolute left-1 top-1 rounded-full bg-action px-1.5 py-0.5 text-[0.6rem] font-bold text-on-action">Reference</span>}
                  </button>
                  <button type="button" className="text-[0.7rem] font-semibold text-accent hover:underline" onClick={() => onUse(ph, ph.alt)}>
                    Use this picture
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-xs text-ink-muted">
          {names.length ? `Nothing in the character or image library mentions ${names.slice(0, 3).join(", ")} yet.` : `No names on this ${noun} to look for.`}{" "}
          Make a new picture below.
        </p>
      )}
    </div>
  );
}
