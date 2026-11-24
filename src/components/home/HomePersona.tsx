"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useApi } from "@/lib/api";
import type { DigitalMemberCard } from "@/server/digitalMembers";
import { useDigitalMemberModal } from "../community/DigitalMemberProfile";
import { Icon } from "../Icon";

/*
  A Digital Member on the homepage cover (Community → Digital Members): a different one on each page load, so
  people get to know the faces they'll meet in training. Floats on the right of the picture on wide screens;
  nothing shows until the list has loaded, so the cover never jumps.
*/

let dice: number | null = null;
const rollDice = () => (dice ??= Math.random());
const noRoll = () => null;
const noSubscribe = () => () => {};

/*
  Closed with its ×, the card stays away for the rest of the browser session (sessionStorage), on every homepage
  visit. A new session brings it back.
*/
const CLOSED_KEY = "tc-persona-closed";
const closedListeners = new Set<() => void>();
const onClosedChange = (fn: () => void) => {
  closedListeners.add(fn);
  return () => void closedListeners.delete(fn);
};
const isClosed = () => {
  try {
    return sessionStorage.getItem(CLOSED_KEY) === "1";
  } catch {
    return false;
  }
};
const closedOnServer = () => true;
function closeForSession() {
  try {
    sessionStorage.setItem(CLOSED_KEY, "1");
  } catch {}
  closedListeners.forEach((fn) => fn());
}

const firstName = (name: string) => (/^(mr|mrs|ms)\b/i.test(name) ? name : name.split(" ")[0]);

export function HomePersona() {
  const data = useApi<{ members: DigitalMemberCard[] }>("/api/community/digital-members").data;
  // Picked in the browser only (never while the page is built ahead), and again each time the homepage is opened.
  const roll = useSyncExternalStore(noSubscribe, rollDice, noRoll);
  useEffect(() => () => void (dice = null), []);
  const closed = useSyncExternalStore(onClosedChange, isClosed, closedOnServer);
  const profile = useDigitalMemberModal();
  const pool = (data?.members ?? []).filter((m) => m.portrait);
  const m = pool.length && roll !== null ? pool[Math.floor(roll * pool.length)] : null;
  if (!m || closed) return null;
  return (
    // A portrait card, taller than it is wide: the face fills it, with who they are over a shade at the bottom. The whole card opens their profile.
    <aside aria-label="Meet a digital member" className="hub-persona-in pointer-events-auto relative">
      {/* Beside the card's link, not inside it, so closing never opens the profile. */}
      <button
        type="button"
        onClick={closeForSession}
        aria-label="Close, and don’t show digital members again this session"
        title="Hide for this session"
        className="absolute right-2.5 top-2.5 z-10 grid size-7 place-items-center rounded-full bg-[#06223a]/55 text-white/90 backdrop-blur-sm transition hover:bg-[#06223a]/80 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <Icon name="close" className="size-3.5" />
      </button>
      <Link
        href={`/community/digital/${m.id}`}
        onClick={profile.onCardClick(m.id)}
        className="group relative block aspect-[4/5] w-[13rem] overflow-hidden rounded-3xl bg-[#102a43] text-white shadow-[0_22px_48px_-14px_rgb(6_34_58/0.7)] ring-1 ring-white/30 transition hover:-translate-y-0.5 hover:shadow-[0_28px_56px_-14px_rgb(6_34_58/0.8)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are */}
        <img src={m.portrait} alt="" className="absolute inset-0 size-full object-cover object-[50%_25%] transition duration-500 group-hover:scale-[1.03]" />
        <span aria-hidden className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-[#06223a]/60 to-transparent" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#06223a] via-[#06223a]/75 to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 font-mulish text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-[#006b6b]">
          Digital member
        </span>
        <span className="absolute inset-x-0 bottom-0 p-3.5">
          <span className="block font-serif text-xl font-semibold leading-tight [text-shadow:0_1px_8px_rgb(0_0_0/0.4)]">{m.name}</span>
          <span className="mt-0.5 block text-[0.7rem] text-white/80">{m.role}</span>
          <span className="mt-1.5 line-clamp-2 block font-serif text-[0.8rem] italic leading-snug text-white/95">“{m.hello}”</span>
          <span className="mt-1.5 inline-flex items-center gap-1 text-[0.8rem] font-semibold text-[#7fd4d4] group-hover:underline">
            Get to know {firstName(m.name)} <span aria-hidden>→</span>
          </span>
        </span>
      </Link>
      {profile.modal}
    </aside>
  );
}
