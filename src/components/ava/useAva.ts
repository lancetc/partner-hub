"use client";

import { useApi } from "@/lib/api";
import type { WordTiming } from "@/lib/wordTimings";

type Ava = {
  name: string;
  portrait: string | null;
  video: { src: string; poster: string | null; transcript?: string | null; words?: WordTiming[] | null } | null;
};

/** Ava's name and portrait for her transmission window (server/ava.ts), and, given one of her lines, its talking video when it's ready. */
export function useAva(key?: string): Ava & { loaded: boolean } {
  const { data } = useApi<Ava>(key ? `/api/ava?key=${encodeURIComponent(key)}` : "/api/ava");
  return data ? { ...data, loaded: true } : { name: "Ava", portrait: null, video: null, loaded: false };
}
