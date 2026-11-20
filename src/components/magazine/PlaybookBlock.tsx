"use client";

import type { PlaybookBlock } from "@/lib/magazine";
import { AidSection } from "../playbooks/AidSection";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  A Live SOP playbook in a Magazine course (docs/live-playbooks.md). The block stores only which snippet to show;
  the content is resolved when it's read, so every course placing this snippet shows the same current approved
  release, and a withdrawal reaches all of them at once. In the editor's preview nothing is recorded.
*/
export function PlaybookBlockView({ block: b, ctx }: { block: PlaybookBlock; ctx: InteractiveContext }) {
  // A specially styled section with the essential action and a way to the full aid (docs/job-aids.md).
  return <AidSection snippetId={b.snippetId} why={b.why} preview={ctx.preview} place="magazine" />;
}
