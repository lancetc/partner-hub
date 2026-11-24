"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { placeFromUrl } from "./pocketApi";
import { PocketTool } from "./PocketTool";

/** A Pocket tool's own page (docs/pocket-playbook.md): the same tool as in the Companion Drawer, at its canonical address. */
export function PocketToolPage({ id }: { id: string }) {
  const [place, setPlace] = useState<string | null>(null);
  useEffect(() => {
    // Where it was opened from (?from=home…) is known only in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlace(placeFromUrl());
  }, []);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 lg:pt-8">
      <Link href="/tools" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> Work Tools
      </Link>
      {place ? <PocketTool id={id} place={place} /> : <p className="mt-4 text-ink-muted">Loading…</p>}
    </div>
  );
}
