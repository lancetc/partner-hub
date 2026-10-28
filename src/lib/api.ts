"use client";

import { useCallback, useEffect, useState } from "react";

/** JSON request to the hub's API. Throws with the server's message on failure. */
export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? (init?.body ? "POST" : "GET"),
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    // No connection. (Saves that can wait use the outbox in lib/outbox.ts instead.)
    throw new Error("You’re offline. This needs an internet connection, so try again when you’re back online.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? `Request failed (${res.status})`), { status: res.status });
  return data as T;
}

/** Loads a GET endpoint and exposes reload; `null` url skips loading. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!url) return;
    let live = true;
    api<T>(url).then(
      (d) => {
        if (!live) return;
        setData(d);
        setError(null);
      },
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [url, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload, setData };
}

export type FollowUpListItem = {
  id: number;
  pathId: string;
  enrolmentId: number;
  stage: string | null;
  anchor: string;
  base: { slug: string; title: string } | null;
  href: string;
  pathName: string;
  stepNumber: number;
  stepCount: number;
  title: string;
  objective: string;
  durationSec: number;
  status: "available" | "in_progress" | "completed" | "upcoming" | "waiting" | "paused" | "withdrawn";
  plannedRelease: string | null;
  releasedAt: string | null;
  completedAt: string | null;
  required: boolean;
  dueAt: string | null;
  explanation: string;
  withdrawnReason: string | null;
  timezone: string;
};

export type Me = {
  user: { id: string; name: string; role: "learner" | "org_admin" | "author"; audience: string; serviceRole: string | null; language: string };
  org: { name: string };
  canAuthor: boolean;
  canReport: boolean;
  demoUsers: { id: string; name: string; label: string }[];
  demoClockOffsetDays: number;
};

export const durationLabel = (sec: number) =>
  sec < 60 ? `About ${Math.round(sec / 5) * 5} seconds` : `About ${Math.round(sec / 60)} minute${Math.round(sec / 60) === 1 ? "" : "s"}`;

export function formatWhen(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz }).format(
    new Date(iso),
  );
}
