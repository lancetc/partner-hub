"use client";

import { useEffect, useState } from "react";
import { findCharacter, type PortraitEntry } from "@/lib/characters";
import { cx } from "@/lib/format";

/*
  Portraits from the character photo library (docs/character-photos.md), found by the name a scenario uses. The
  roster is fetched once per page and shared. A name without a portrait shows nothing extra, so a scenario reads
  exactly as before. The name is always written beside the picture, so the picture itself is decorative.
*/

let roster: Promise<PortraitEntry[]> | null = null;
const load = () =>
  (roster ??= fetch("/api/characters", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ characters: PortraitEntry[] }>) : { characters: [] }))
    .then((d) => d.characters)
    .catch(() => {
      roster = null;
      return [];
    }));

export function useCharacterPortraits() {
  const [list, setList] = useState<PortraitEntry[]>([]);
  useEffect(() => {
    let live = true;
    void load().then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, []);
  return list;
}

export function CharacterPortrait({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const list = useCharacterPortraits();
  const c = findCharacter(list, name);
  if (!c) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are
    <img
      src={c.portrait}
      alt=""
      aria-hidden
      loading="lazy"
      className={cx(
        "shrink-0 rounded-full bg-muted object-cover ring-2 ring-surface",
        size === "sm" ? "size-10" : size === "lg" ? "size-20" : "size-14",
        className,
      )}
    />
  );
}

/** A scenario's "who this is about" card content, with the people's portraits beside it when the library has them. */
export function CharacterRow({ names, children, size = "md" }: { names: string[]; children: React.ReactNode; size?: "sm" | "md" | "lg" }) {
  const list = useCharacterPortraits();
  const found = names.filter((n) => n && findCharacter(list, n));
  if (!found.length) return <>{children}</>;
  return (
    <div className="flex items-start gap-3">
      <div className="flex shrink-0 -space-x-3">
        {found.slice(0, 2).map((n) => (
          <CharacterPortrait key={n} name={n} size={size} />
        ))}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
