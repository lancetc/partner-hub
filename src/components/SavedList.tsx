"use client";

import Link from "next/link";
import { useHub, useHydrated } from "@/lib/store";
import { searchIndex } from "./SearchDialog";
import { SaveButton } from "./SaveButton";

export function SavedList() {
  const hydrated = useHydrated();
  const saved = useHub((s) => s.saved);
  if (!hydrated) return null;
  const items = saved.map((id) => searchIndex.find((r) => r.id === id)).filter((r) => r !== undefined);

  if (!items.length) {
    return (
      <p className="mt-8 rounded-3xl bg-muted p-6">
        Nothing saved yet. Use the bookmark on any story, lesson or resource to find it here.{" "}
        <Link href="/" className="font-semibold text-accent underline underline-offset-4">
          Browse the news
        </Link>
      </p>
    );
  }

  return (
    <ul className="mt-8 flex flex-col divide-y divide-line border-y border-line">
      {items.map((r) => (
        <li key={r.id} className="relative flex items-center gap-4 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{r.meta}</p>
            <Link href={r.href} className="font-serif text-xl font-semibold leading-snug after:absolute after:inset-0 after:content-[''] hover:underline">
              {r.title}
            </Link>
          </div>
          <SaveButton id={r.id} title={r.title} />
        </li>
      ))}
    </ul>
  );
}
