"use client";

import { useEffect, useState } from "react";
import type { DigitalMemberCard } from "@/server/digitalMembers";
import { firstName, useDigitalMemberModal } from "./DigitalMemberProfile";

/*
  A caption for a picture of one of the Digital Members (Community → Digital Members): when an article's cover is a
  member's portrait, their name, what they do and their approach, in their own words, sit across the bottom of it,
  with a button to meet them. Any other picture gets nothing. The list is fetched once per page and shared.
*/

let members: Promise<DigitalMemberCard[]> | null = null;
const load = () =>
  (members ??= fetch("/api/community/digital-members", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ members: DigitalMemberCard[] }>) : { members: [] }))
    .then((d) => d.members)
    .catch(() => {
      members = null;
      return [];
    }));

function useMemberPictured(src: string | null | undefined) {
  const [list, setList] = useState<DigitalMemberCard[]>([]);
  useEffect(() => {
    if (!src) return;
    let live = true;
    void load().then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, [src]);
  return src ? (list.find((m) => m.portrait && m.portrait === src) ?? null) : null;
}

/** Goes inside the picture's frame (which needs `relative`): a figcaption over its lower edge. */
export function MemberCaption({ src }: { src: string | null | undefined }) {
  const m = useMemberPictured(src);
  const profile = useDigitalMemberModal();
  if (!m) return null;
  return (
    <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#06223a]/90 via-[#06223a]/60 to-transparent px-5 pb-4 pt-16 text-white sm:px-6 sm:pb-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 max-w-xl">
          <p className="font-serif text-xl font-semibold leading-tight [text-shadow:0_1px_8px_rgb(0_0_0/0.35)]">
            {m.name}
            <span className="ml-2 font-sans text-sm font-normal text-white/80">{m.role}</span>
          </p>
          <p className="mt-1 hidden font-serif text-[1.02rem] italic leading-snug text-white/95 sm:line-clamp-2">“{m.approach}”</p>
        </div>
        <button
          type="button"
          onClick={() => profile.open(m.id)}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-semibold backdrop-blur-sm hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Meet {firstName(m.name)} <span aria-hidden>→</span>
        </button>
      </div>
      {profile.modal}
    </figcaption>
  );
}
