"use client";

import { api } from "@/lib/api";

/** A use event from a page (docs/job-aids.md). Never holds up what the person is doing, and never fails loudly. */
export const aidEvent = (body: { event: string; snippetId?: string; sourceKind?: string; sourceId?: string; place?: string }) =>
  void api("/api/favourites", { body: { action: "event", key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, ...body } }).catch(
    () => undefined,
  );

export const eventKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
