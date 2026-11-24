"use client";

import { useRef, type ReactNode } from "react";
import type { PassageKind } from "@/server/favourites";
import { Highlighter } from "./Highlighter";
import { SavedMarks } from "./SavedMarks";

/*
  A part of a server-drawn page where passages can be highlighted (docs/job-aids.md): a news story's body, the
  Resources library. Each highlightable part inside it carries `data-hl` with its id; `SavedMarkChips` after a part
  shows the reader's earlier highlights there. Everything else is the same as in a Magazine guide.
*/
export function HighlightArea({
  source,
  id,
  revisionId,
  className,
  off,
  children,
}: {
  source: PassageKind;
  id: string;
  /** The version the page shows, so a save from an out-of-date page is refused rather than mis-anchored. */
  revisionId?: string;
  className?: string;
  /** An author's preview of a draft: nothing to highlight, nothing marked. */
  off?: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <SavedMarks root={root} source={source} id={id} off={off}>
      <div ref={root} className={className}>
        {children}
      </div>
      <Highlighter root={root} source={source} id={id} revisionId={revisionId} disabled={off} />
    </SavedMarks>
  );
}
