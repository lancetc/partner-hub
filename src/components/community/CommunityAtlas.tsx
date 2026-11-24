"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { BORDER_PATH, LAND_PATH, MAP_H, MAP_W, project, STATE_VIEWS } from "@/lib/ausMap";
import {
  ATLAS_PLACES,
  ATLAS_TOPICS,
  commonGround,
  kmBetween,
  START_TOWNS,
  STATE_NAMES,
  STATES,
  TOWNS,
  type AtlasPlace,
  type AtlasTopic,
  type AusState,
  type Town,
  type TownId,
} from "@/content/communityAtlas";
import type { DigitalMemberCard } from "@/server/digitalMembers";
import type { AtlasMember } from "@/server/communityAtlas";
import Link from "next/link";
import type { DIGITAL_GROUPS, DigitalGroup } from "@/content/digitalMembers";
import { firstName, Portrait, useDigitalMemberModal } from "./DigitalMemberProfile";
import { Icon } from "../Icon";
import { AtlasRationale } from "./AtlasRationale";

/*
  Community → Atlas: the Digital Members on a map of Australia, at the town they live in, so learners can see who's
  near a place they know and who shares a topic with whom. The Digital Members are fictional, and so are their towns.
  Real Hub members appear only if they've ticked the box in Profile and settings (server/communityAtlas), at the
  nearest town they chose, with the topics they chose.

  Privacy by design (the Community Atlas brief): town-level pins only, no addresses; no device location ("Near a
  town" asks which town to start from); no map provider (the outline is drawn by the Hub, lib/ausMap); no scores or
  leaderboards. The list view shows everything the map does.
*/

type Data = { members: DigitalMemberCard[]; groups: typeof DIGITAL_GROUPS };
/** Digital Members, plus the Hub members who chose to join. */
type Group = DigitalGroup | "member";
type Pin = {
  id: string;
  kind: "digital" | "member";
  name: string;
  role: string;
  group: Group;
  portrait: string;
  hello: string | null;
  org: string | null;
  you: boolean;
  place: AtlasPlace;
  town: Town;
  x: number;
  y: number;
};
type View = { x: number; y: number; w: number };
type Lens = "everyone" | "near" | "help" | "asking";
type Cluster = { key: string; x: number; y: number; pins: Pin[] };

const FULL: View = { x: 0, y: 0, w: MAP_W };
const ASPECT = MAP_H / MAP_W;
const MIN_W = 40;

// One colour per group, worn as the ring around a portrait and in the key (never the only cue: the panel says it).
const GROUP_COLOUR: Record<Group, string> = { clients: "#008282", family: "#c2410c", business: "#7c3aed", team: "#1d4ed8", member: "#be185d" };
const GROUP_NAMES: Record<Group, string> = {
  clients: "People we support",
  family: "Family",
  business: "Business owners",
  team: "Coordinators and workers",
  member: "Hub members",
};

const LENSES: { id: Lens; label: string }[] = [
  { id: "everyone", label: "Everyone" },
  { id: "near", label: "Near a town" },
  { id: "help", label: "Can help" },
  { id: "asking", label: "Looking for help" },
];

/** Zoom to fit some map points, with room around them, keeping the map's shape. */
function fit(points: [number, number][], pad = 40): View {
  if (!points.length) return FULL;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  let w = Math.max(Math.max(...xs) - Math.min(...xs) + pad * 2, (Math.max(...ys) - Math.min(...ys) + pad * 2) / ASPECT, MIN_W);
  w = Math.min(w, MAP_W);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return clamp({ x: cx - w / 2, y: cy - (w * ASPECT) / 2, w });
}
function clamp(v: View): View {
  const w = Math.min(MAP_W, Math.max(MIN_W, v.w));
  const h = w * ASPECT;
  return { w, x: Math.min(MAP_W - w, Math.max(0, v.x)), y: Math.min(MAP_H - h, Math.max(0, v.y)) };
}
const boundsView = ([w, s, e, n]: [number, number, number, number]) => fit([project(w, n), project(e, s)], 10);

/** Pins close together on screen become one bubble; zoom in and they separate. */
function cluster(pins: Pin[], view: View, px: number): Cluster[] {
  // Closer than a face-and-a-bit on screen, whatever the zoom and the size of the map.
  const r = (48 * view.w) / px;
  const out: Cluster[] = [];
  for (const p of pins) {
    const near = out.find((c) => Math.hypot(c.x - p.x, c.y - p.y) < r);
    if (near) {
      near.pins.push(p);
      near.x = near.pins.reduce((n, q) => n + q.x, 0) / near.pins.length;
      near.y = near.pins.reduce((n, q) => n + q.y, 0) / near.pins.length;
    } else out.push({ key: p.id, x: p.x, y: p.y, pins: [p] });
  }
  return out;
}

const townLabel = (t: Town) => `${t.name}, ${t.state}`;
const km = (n: number) =>
  n < 20 ? "in the same area" : `about ${Math.round(n / 10) * 10 < 1000 ? Math.round(n / 10) * 10 : Math.round(n / 100) * 100} km away`;
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function CommunityAtlas() {
  const { data, error } = useApi<Data>("/api/community/digital-members");
  const realApi = useApi<{ members: AtlasMember[] }>("/api/community/atlas").data;
  const profile = useDigitalMemberModal();
  const [mode, setMode] = useState<"map" | "list">("map");
  const [lens, setLens] = useState<Lens>("everyone");
  const [topic, setTopic] = useState<AtlasTopic | "">("");
  const [group, setGroup] = useState<Group | "all">("all");
  const [start, setStart] = useState<TownId | "">("");
  const [view, setView] = useState<View>(FULL);
  const [selected, setSelected] = useState<string | null>(null);
  const [crowd, setCrowd] = useState<Pin[] | null>(null);

  // Everyone the reader can see (hidden characters never reach here) who has a town, and the members who joined.
  const pins = useMemo<Pin[]>(() => {
    const at = (t: TownId) => {
      const town = TOWNS[t];
      const [x, y] = project(town.lng, town.lat);
      return { town, x, y };
    };
    const digital = (data?.members ?? []).flatMap((m): Pin[] => {
      const place = ATLAS_PLACES[m.id];
      if (!place) return [];
      return [
        {
          id: m.id,
          kind: "digital",
          name: m.name,
          role: m.role,
          group: m.group,
          portrait: m.portrait,
          hello: m.hello,
          org: null,
          you: false,
          place,
          ...at(place.town),
        },
      ];
    });
    const members = (realApi?.members ?? []).map((m): Pin => ({
      id: `member:${m.id}`,
      kind: "member",
      name: m.name,
      role: m.role,
      group: "member",
      portrait: m.portrait,
      hello: null,
      org: m.org,
      you: m.you,
      place: { town: m.town, topics: m.topics, canHelp: m.canHelp, askingAbout: m.askingAbout },
      ...at(m.town),
    }));
    return [...members, ...digital];
  }, [data, realApi]);
  const mine = pins.find((p) => p.you) ?? null;
  const anyMembers = pins.some((p) => p.kind === "member");
  const startTown = start ? TOWNS[start] : null;

  const shown = pins.filter((p) => {
    if (group !== "all" && p.group !== group) return false;
    const pool = lens === "help" ? (p.place.canHelp ?? []) : lens === "asking" ? (p.place.askingAbout ?? []) : p.place.topics;
    if ((lens === "help" || lens === "asking") && !pool.length) return false;
    return !topic || pool.includes(topic);
  });
  const ordered = startTown && lens === "near" ? [...shown].sort((a, b) => kmBetween(startTown, a.town) - kmBetween(startTown, b.town)) : shown;
  const chosen = pins.find((p) => p.id === selected) ?? null;

  // The people with most in common with whoever's chosen: the panel lists them, and the map joins up to four.
  const matches = chosen
    ? pins
        .filter((p) => p.id !== chosen.id)
        .map((p) => ({ p, g: commonGround(chosen.place, p.place), d: kmBetween(chosen.town, p.town) }))
        .filter((m) => m.g.score > 0)
        .sort((a, b) => b.g.score - a.g.score || a.d - b.d)
        .slice(0, 6)
    : [];
  // Lines only to people on screen: a filter that hides someone hides their line too.
  const lines = matches.filter((m) => shown.includes(m.p)).slice(0, 4);

  const choose = (p: Pin, zoom = false) => {
    setSelected(p.id);
    setCrowd(null);
    if (zoom) setView(fit([[p.x, p.y]], 120));
  };
  const resetFilters = () => {
    setLens("everyone");
    setTopic("");
    setGroup("all");
    setStart("");
  };

  if (error) return <p className="rounded-2xl bg-muted p-5 text-ink-muted">Couldn’t open the Atlas: {error}</p>;

  return (
    <div>
      <div className="grid gap-4 rounded-3xl bg-[#102a43] p-6 text-white sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#7fd4d4]">Community Atlas</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold">Who’s out there, and what you have in common</h2>
          <p className="mt-2 max-w-2xl text-white/80">
            The Digital Members, and Hub members who’ve chosen to join, at the towns they call home, from Broome to Hobart. Pick a topic to find common ground,
            or start from a town you know to see who’s nearby.
          </p>
          <div className="mt-3">
            <AtlasRationale />
          </div>
        </div>
        <p className="inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold lg:self-end">
          <Icon name="info" className="size-3.5" />
          Shown by town only. Your device’s location is never used.
        </p>
      </div>

      {/* Filters, in one row above the map. */}
      <div className="mt-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1">
            {LENSES.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={lens === l.id}
                onClick={() => {
                  setLens(l.id);
                  // Starting near a town: from yours, if you're on the Atlas.
                  if (l.id === "near" && !start && mine) setStart(mine.place.town);
                }}
                className={cx("min-h-9 rounded-full px-3.5 text-sm font-semibold", lens === l.id ? "bg-[#102a43] text-white" : "text-ink-muted hover:text-ink")}
              >
                {l.label}
              </button>
            ))}
          </div>
          {lens === "near" && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <span>Start from</span>
              <select
                value={start}
                onChange={(e) => {
                  const id = e.target.value as TownId | "";
                  setStart(id);
                  setSelected(null);
                  if (id) {
                    const t = TOWNS[id];
                    const near = [...pins].sort((a, b) => kmBetween(t, a.town) - kmBetween(t, b.town)).slice(0, 4);
                    setView(fit([project(t.lng, t.lat), ...near.map((p) => [p.x, p.y] as [number, number])], 50));
                  }
                }}
                className="min-h-10 rounded-full border border-line-strong bg-surface px-3 font-normal"
              >
                <option value="">Choose a town…</option>
                {STATES.map((s) => {
                  const towns = START_TOWNS.filter(([, t]) => t.state === s);
                  return towns.length ? (
                    <optgroup key={s} label={STATE_NAMES[s]}>
                      {towns.map(([id, t]) => (
                        <option key={id} value={id}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm font-semibold">
            <span>Topic</span>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value as AtlasTopic | "")}
              className="min-h-10 rounded-full border border-line-strong bg-surface px-3 font-normal"
            >
              <option value="">All topics</option>
              {ATLAS_TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <div role="group" aria-label="View as" className="ml-auto flex gap-1 rounded-full border border-line bg-surface p-1">
            {(["map", "list"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cx(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold",
                  mode === m ? "bg-tealtint text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                <Icon name={m === "map" ? "pin" : "list"} className="size-4" />
                {m === "map" ? "Map" : "List"}
              </button>
            ))}
          </div>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Who">
          {[{ id: "all" as const, label: "Everyone" }, ...(anyMembers ? [{ id: "member" as const, label: "Hub members" }] : []), ...(data?.groups ?? [])].map(
            (g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={group === g.id}
                onClick={() => setGroup(g.id)}
                className={cx(
                  "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold",
                  group === g.id ? "border-[#008282] bg-tealtint text-ink" : "border-line text-ink-muted hover:text-ink",
                )}
              >
                {g.id !== "all" && <span aria-hidden className="size-2.5 rounded-full" style={{ background: GROUP_COLOUR[g.id] }} />}
                {g.label}
              </button>
            ),
          )}
        </div>
      </div>

      <p className="mt-3 text-sm text-ink-muted" aria-live="polite">
        {data ? (
          <>
            Showing {shown.length} of {pins.length} people
            {topic && (
              <>
                {" "}
                who {lens === "help" ? "can help with" : lens === "asking" ? "are looking for help with" : "talk about"} {topic.toLowerCase()}
              </>
            )}
            {startTown && lens === "near" && <>, nearest to {startTown.name} first</>}.{" "}
            {shown.length < pins.length && (
              <button type="button" onClick={resetFilters} className="font-semibold text-[#008282] hover:underline dark:text-[#3cb8b9]">
                Show everyone
              </button>
            )}
          </>
        ) : (
          "Loading the Atlas…"
        )}
      </p>

      <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {mode === "map" ? (
          <AtlasMap
            view={view}
            setView={setView}
            pins={shown}
            chosen={chosen}
            lines={lines.map((m) => m.p)}
            startTown={lens === "near" ? startTown : null}
            onPin={(p) => choose(p)}
            onCrowd={(c) => {
              setSelected(null);
              // Zoom in to separate them; once they're in one town (or can't zoom further), list them instead.
              const spread = Math.max(...c.pins.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
              if (spread < 4 || view.w <= MIN_W * 1.7) setCrowd(c.pins);
              else {
                setCrowd(null);
                setView(
                  fit(
                    c.pins.map((p) => [p.x, p.y]),
                    15,
                  ),
                );
              }
            }}
          />
        ) : (
          <AtlasList
            pins={ordered}
            startTown={lens === "near" ? startTown : null}
            selected={selected}
            onShow={(p) => {
              setMode("map");
              choose(p, true);
            }}
            onProfile={(p) => p.kind === "digital" && profile.open(p.id)}
          />
        )}

        <aside className="flex flex-col gap-4 self-start rounded-3xl border border-line bg-surface p-5 lg:sticky lg:top-24" aria-label="About this place">
          {chosen ? (
            <ChosenPanel
              p={chosen}
              matches={matches}
              topic={topic}
              lens={lens}
              startTown={lens === "near" ? startTown : null}
              onPick={(p) => choose(p)}
              onProfile={() => chosen.kind === "digital" && profile.open(chosen.id)}
              onClose={() => setSelected(null)}
            />
          ) : crowd ? (
            <CrowdPanel pins={crowd} onPick={(p) => choose(p)} onClose={() => setCrowd(null)} />
          ) : startTown && lens === "near" ? (
            <NearPanel town={startTown} pins={ordered.slice(0, 6)} onPick={(p) => choose(p)} />
          ) : (
            <AboutPanel pins={pins} />
          )}
        </aside>
      </div>
      {profile.modal}
    </div>
  );
}

// ---------- The map ----------

function AtlasMap({
  view,
  setView,
  pins,
  chosen,
  lines,
  startTown,
  onPin,
  onCrowd,
}: {
  view: View;
  setView: (v: View) => void;
  pins: Pin[];
  chosen: Pin | null;
  lines: Pin[];
  startTown: Town | null;
  onPin: (p: Pin) => void;
  onCrowd: (c: Cluster) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(760);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx(el.clientWidth || 760));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);
  const h = view.w * ASPECT;
  const at = (x: number, y: number) => ({ left: `${((x - view.x) / view.w) * 100}%`, top: `${((y - view.y) / h) * 100}%` });
  const zoomed = view.w < MAP_W * 0.6;
  const clusters = cluster(pins, view, px);
  const zoomBy = (f: number) => {
    const cx = view.x + view.w / 2;
    const cy = view.y + h / 2;
    const w = view.w / f;
    setView(clamp({ w, x: cx - w / 2, y: cy - (w * ASPECT) / 2 }));
  };
  const unit = view.w / px; // one screen pixel, in map units

  return (
    <div>
      <div
        ref={box}
        className="relative aspect-[770/700] touch-none select-none overflow-hidden rounded-3xl border border-line bg-[#dcefee] dark:bg-[#0d2236]"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !box.current) return;
          const k = d.view.w / box.current.clientWidth;
          d.moved = true;
          setView(clamp({ w: d.view.w, x: d.view.x - (e.clientX - d.x) * k, y: d.view.y - (e.clientY - d.y) * k }));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        style={{ cursor: view.w < MAP_W ? "grab" : undefined }}
      >
        <svg viewBox={`${view.x} ${view.y} ${view.w} ${h}`} className="absolute inset-0 size-full" aria-hidden>
          <path
            d={LAND_PATH}
            className="fill-[#f7f3e8] stroke-[#9cc5c4] dark:fill-[#1c3a55] dark:stroke-[#2f5f7f]"
            strokeWidth={1.5 * unit}
            strokeLinejoin="round"
          />
          <path
            d={BORDER_PATH}
            fill="none"
            className="stroke-[#c9bfa6] dark:stroke-[#2f5f7f]"
            strokeWidth={1 * unit}
            strokeDasharray={`${4 * unit} ${3 * unit}`}
          />
          {(Object.keys(STATE_VIEWS) as AusState[]).map((s) => {
            const [x, y] = project(...STATE_VIEWS[s].label);
            return (
              <text
                key={s}
                x={x}
                y={y}
                textAnchor="middle"
                className="fill-[#8a7f66] font-mulish font-extrabold dark:fill-[#6f93ad]"
                style={{ fontSize: 11 * unit, letterSpacing: 2 * unit }}
              >
                {s}
              </text>
            );
          })}
          {/* Common ground: a few gentle curves from whoever's chosen, never a web of everyone. */}
          {chosen &&
            lines.map((p) => {
              const mx = (chosen.x + p.x) / 2;
              const my = (chosen.y + p.y) / 2 - Math.hypot(p.x - chosen.x, p.y - chosen.y) * 0.18;
              return (
                <path
                  key={p.id}
                  d={`M${chosen.x} ${chosen.y}Q${mx} ${my} ${p.x} ${p.y}`}
                  fill="none"
                  stroke="#fab53d"
                  strokeWidth={2.5 * unit}
                  strokeLinecap="round"
                  strokeDasharray={`${1 * unit} ${6 * unit}`}
                />
              );
            })}
        </svg>

        {startTown && (
          <span className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2" style={at(...project(startTown.lng, startTown.lat))}>
            <span className="grid size-8 place-items-center rounded-full bg-[#102a43] text-white shadow-lg ring-4 ring-white/70">
              <Icon name="home" className="size-4" />
            </span>
            <span className="sr-only">Starting from {startTown.name}</span>
          </span>
        )}

        {clusters.map((c) =>
          c.pins.length === 1 ? (
            <MapPin key={c.key} p={c.pins[0]} style={at(c.x, c.y)} chosen={chosen?.id === c.pins[0].id} label={zoomed} onClick={() => onPin(c.pins[0])} />
          ) : (
            <button
              key={c.key}
              type="button"
              onClick={() => onCrowd(c)}
              aria-label={`${c.pins.length} people around ${c.pins[0].town.name}: ${list(c.pins.map((p) => p.name))}. Zoom in`}
              className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center rounded-full bg-white p-1 pr-2.5 shadow-lg ring-2 ring-[#102a43]/15 hover:ring-[#008282] focus-visible:outline-3 focus-visible:outline-[#008282] motion-safe:transition-[left,top] motion-safe:duration-500 dark:bg-[#102a43]"
              style={at(c.x, c.y)}
            >
              <span className="flex -space-x-3">
                {c.pins.slice(0, 3).map((p) => (
                  <Portrait key={p.id} name={p.name} src={p.portrait} className="size-8 text-[0.6rem]" />
                ))}
              </span>
              <span className="ml-1.5 font-mulish text-sm font-extrabold text-ink">{c.pins.length}</span>
            </button>
          ),
        )}

        <div className="absolute right-3 top-3 z-30 flex flex-col overflow-hidden rounded-2xl bg-surface shadow-md">
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.6)} className="grid size-10 place-items-center hover:bg-muted">
            <Icon name="plus" className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 1.6)}
            className="grid size-10 place-items-center border-t border-line hover:bg-muted"
          >
            <Icon name="minus" className="size-4" />
          </button>
        </div>
        {pins.length === 0 && (
          <p className="absolute inset-x-6 top-1/2 z-30 -translate-y-1/2 rounded-2xl bg-surface p-4 text-center text-sm shadow-md">
            Nobody matches these filters. Try another topic, or show everyone.
          </p>
        )}
      </div>

      {/* Jump to a state, or back to the whole country. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Jump to">
        <button
          type="button"
          onClick={() => setView(FULL)}
          aria-pressed={view.w === MAP_W}
          className={cx(
            "min-h-9 rounded-full border px-3 text-sm font-semibold",
            view.w === MAP_W ? "border-[#008282] bg-tealtint" : "border-line hover:border-[#008282]",
          )}
        >
          All of Australia
        </button>
        {(Object.keys(STATE_VIEWS) as AusState[]).map((s) => (
          <button
            key={s}
            type="button"
            title={STATE_NAMES[s]}
            onClick={() => setView(boundsView(STATE_VIEWS[s].bounds))}
            className="min-h-9 rounded-full border border-line px-3 text-sm font-semibold hover:border-[#008282]"
          >
            <span aria-hidden>{s}</span>
            <span className="sr-only">{STATE_NAMES[s]}</span>
          </button>
        ))}
        <span className="ml-auto hidden text-xs text-ink-muted sm:inline">Drag to move around once you’ve zoomed in.</span>
      </div>
      <GroupKey />
    </div>
  );
}

function MapPin({ p, style, chosen, label, onClick }: { p: Pin; style: React.CSSProperties; chosen: boolean; label: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={chosen}
      aria-label={`${p.name}, ${p.role}. ${townLabel(p.town)}`}
      className={cx(
        "group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center focus-visible:outline-none motion-safe:transition-[left,top] motion-safe:duration-500",
        chosen ? "z-30" : "z-20 hover:z-30",
      )}
      style={style}
    >
      <span
        className={cx(
          "rounded-full p-[3px] shadow-md group-focus-visible:outline-3 group-focus-visible:outline-offset-2 group-focus-visible:outline-[#008282] motion-safe:transition-transform",
          chosen ? "scale-125" : "group-hover:scale-110",
        )}
        style={{ background: GROUP_COLOUR[p.group] }}
      >
        <Portrait name={p.name} src={p.portrait} className="size-9 text-xs ring-2 ring-white sm:size-10" />
      </span>
      <span
        className={cx(
          "mt-1 whitespace-nowrap rounded-full bg-surface/95 px-2 py-0.5 text-[0.7rem] font-semibold text-ink shadow-sm",
          label || chosen ? "" : "sr-only group-hover:not-sr-only group-focus-visible:not-sr-only",
        )}
      >
        {firstName(p.name)} · {p.town.name}
      </span>
    </button>
  );
}

function GroupKey() {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label="Key">
      {(Object.keys(GROUP_COLOUR) as Group[]).map((g) => (
        <li key={g} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-full ring-2 ring-white" style={{ background: GROUP_COLOUR[g] }} />
          {GROUP_NAMES[g]}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-0 w-5 border-t-[3px] border-dotted border-[#fab53d]" />
        Common ground
      </li>
    </ul>
  );
}

// ---------- The list: everything the map shows, without the map ----------

function AtlasList({
  pins,
  startTown,
  selected,
  onShow,
  onProfile,
}: {
  pins: Pin[];
  startTown: Town | null;
  selected: string | null;
  onShow: (p: Pin) => void;
  onProfile: (p: Pin) => void;
}) {
  // Nearest first when starting from a town; otherwise by state, then town.
  const sections: [string, Pin[]][] = startTown
    ? [[`Nearest to ${startTown.name}`, pins]]
    : STATES.map(
        (s) => [STATE_NAMES[s], pins.filter((p) => p.town.state === s).sort((a, b) => a.town.name.localeCompare(b.town.name))] as [string, Pin[]],
      ).filter(([, ps]) => ps.length);
  if (!pins.length) return <p className="rounded-3xl border border-line bg-surface p-6 text-ink-muted">Nobody matches these filters.</p>;
  return (
    <div className="flex flex-col gap-6">
      {sections.map(([title, ps]) => (
        <section key={title} aria-label={title}>
          <h3 className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">{title}</h3>
          <ul className="mt-2 divide-y divide-line rounded-3xl border border-line bg-surface">
            {ps.map((p) => (
              <li key={p.id} className={cx("flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap", selected === p.id && "bg-tealtint")}>
                <span className="rounded-full p-[3px]" style={{ background: GROUP_COLOUR[p.group] }}>
                  <Portrait name={p.name} src={p.portrait} className="size-11 text-sm ring-2 ring-white" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {p.name} <span className="font-normal text-ink-muted">· {townLabel(p.town)}</span>
                  </p>
                  <p className="truncate text-sm text-ink-muted">
                    {p.role}
                    {startTown && <> · {km(kmBetween(startTown, p.town))}</>}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">{p.place.topics.join(" · ")}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onShow(p)}
                    className="min-h-10 rounded-full border border-line-strong px-3 text-sm font-semibold hover:border-[#008282]"
                  >
                    Show on map
                  </button>
                  {p.kind === "digital" && (
                    <button
                      type="button"
                      onClick={() => onProfile(p)}
                      className="min-h-10 rounded-full bg-[#102a43] px-3 text-sm font-semibold text-white hover:bg-[#0b1f33]"
                    >
                      Profile
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------- The side panel ----------

const PanelTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">{children}</h3>
);

function ChosenPanel({
  p,
  matches,
  topic,
  lens,
  startTown,
  onPick,
  onProfile,
  onClose,
}: {
  p: Pin;
  matches: { p: Pin; g: ReturnType<typeof commonGround>; d: number }[];
  topic: AtlasTopic | "";
  lens: Lens;
  startTown: Town | null;
  onPick: (p: Pin) => void;
  onProfile: () => void;
  onClose: () => void;
}) {
  const first = firstName(p.name);
  // Why this person is on screen: in plain words, from the filters and their own topics.
  const why = [
    `${first} lives in ${townLabel(p.town)}. The Atlas only ever shows a town, never an address.`,
    topic && lens === "help" && `${first} can help with ${topic.toLowerCase()}, the topic you picked.`,
    topic && lens === "asking" && `${first} is looking for help with ${topic.toLowerCase()}, the topic you picked.`,
    topic && lens !== "help" && lens !== "asking" && `${first} talks about ${topic.toLowerCase()}, the topic you picked.`,
    startTown && `${first} is ${km(kmBetween(startTown, p.town))} from ${startTown.name}, the town you started from.`,
    !topic && !startTown && lens === "everyone" && `You’re seeing everyone. Pick a topic, or start from a town, to narrow it down.`,
    matches.length > 0 && `The lines join ${first} to the people ${first} has most in common with: a shared topic, or one can help where the other’s asking.`,
  ].filter(Boolean) as string[];
  return (
    <>
      <div className="flex items-start gap-3">
        <span className="rounded-full p-[3px]" style={{ background: GROUP_COLOUR[p.group] }}>
          <Portrait name={p.name} src={p.portrait} className="size-16 text-lg ring-2 ring-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-xl font-semibold leading-tight">{p.name}</p>
          <p className="text-sm text-ink-muted">{p.role}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold">
            <Icon name="pin" className="size-3.5" />
            {townLabel(p.town)}
          </p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-muted">
          <Icon name="close" className="size-4" />
        </button>
      </div>
      {p.hello ? (
        <blockquote className="border-l-4 border-[#fab53d] pl-3 font-serif italic leading-snug">“{p.hello}”</blockquote>
      ) : (
        <p className="rounded-2xl bg-muted px-3 py-2 text-sm">
          {p.you ? (
            <>
              This is you. Change what the Atlas shows, or leave it, in{" "}
              <Link href="/settings#atlas" className="font-semibold text-accent hover:underline">
                Profile and settings
              </Link>
              .
            </>
          ) : (
            <>A Hub member{p.org && <> at {p.org}</>}, on the Atlas because they chose to be.</>
          )}
        </p>
      )}

      <div>
        <PanelTitle>Talks about</PanelTitle>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {p.place.topics.map((t) => (
            <li key={t} className={cx("rounded-full border px-2.5 py-1 text-xs font-medium", t === topic ? "border-[#008282] bg-tealtint" : "border-line")}>
              {t}
            </li>
          ))}
        </ul>
        {(p.place.canHelp?.length || p.place.askingAbout?.length) && (
          <dl className="mt-3 space-y-1 text-sm">
            {p.place.canHelp?.length ? (
              <div>
                <dt className="inline font-semibold">Can help with: </dt>
                <dd className="inline">{list(p.place.canHelp.map((t) => t.toLowerCase()))}</dd>
              </div>
            ) : null}
            {p.place.askingAbout?.length ? (
              <div>
                <dt className="inline font-semibold">Looking for help with: </dt>
                <dd className="inline">{list(p.place.askingAbout.map((t) => t.toLowerCase()))}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </div>

      <details className="rounded-2xl bg-muted p-3 text-sm" open>
        <summary className="cursor-pointer font-semibold">Why you see {first}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
          {why.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </details>

      {matches.length > 0 && (
        <div>
          <PanelTitle>Common ground</PanelTitle>
          <ul className="mt-2 flex flex-col gap-1">
            {matches.map(({ p: o, g, d }) => (
              <li key={o.id}>
                <button type="button" onClick={() => onPick(o)} className="flex w-full items-start gap-2.5 rounded-2xl p-2 text-left hover:bg-muted">
                  <Portrait name={o.name} src={o.portrait} className="size-9 text-xs" />
                  <span className="min-w-0 text-sm">
                    <span className="font-semibold">{o.name}</span>
                    <span className="text-ink-muted">
                      {" "}
                      · {o.town.name}, {km(d)}
                    </span>
                    <span className="block text-ink-muted">
                      {[
                        g.shared.length > 0 && `Both talk about ${list(g.shared.map((t) => t.toLowerCase()))}`,
                        g.aHelpsB.length > 0 && `${first} could help with ${list(g.aHelpsB.map((t) => t.toLowerCase()))}`,
                        g.bHelpsA.length > 0 && `${firstName(o.name)} could help with ${list(g.bHelpsA.map((t) => t.toLowerCase()))}`,
                      ]
                        .filter(Boolean)
                        .join(". ")}
                      .
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.kind === "digital" && (
        <button type="button" onClick={onProfile} className="min-h-11 rounded-full bg-[#102a43] px-4 font-semibold text-white hover:bg-[#0b1f33]">
          Meet {first}
        </button>
      )}
    </>
  );
}

function CrowdPanel({ pins, onPick, onClose }: { pins: Pin[]; onPick: (p: Pin) => void; onClose: () => void }) {
  const towns = [...new Set(pins.map((p) => p.town.name))];
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <PanelTitle>Around {list(towns)}</PanelTitle>
          <p className="mt-1 text-sm text-ink-muted">{pins.length} people close together. Choose someone.</p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-muted">
          <Icon name="close" className="size-4" />
        </button>
      </div>
      <PeopleList pins={pins} onPick={onPick} />
    </>
  );
}

function NearPanel({ town, pins, onPick }: { town: Town; pins: Pin[]; onPick: (p: Pin) => void }) {
  return (
    <>
      <div>
        <PanelTitle>Nearest to {town.name}</PanelTitle>
        <p className="mt-1 text-sm text-ink-muted">As the crow flies, town to town. You chose the town: nothing on this device was asked where you are.</p>
      </div>
      <PeopleList pins={pins} onPick={onPick} from={town} />
    </>
  );
}

function PeopleList({ pins, onPick, from }: { pins: Pin[]; onPick: (p: Pin) => void; from?: Town }) {
  return (
    <ul className="flex flex-col gap-1">
      {pins.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => onPick(p)} className="flex w-full items-center gap-2.5 rounded-2xl p-2 text-left hover:bg-muted">
            <span className="rounded-full p-[2px]" style={{ background: GROUP_COLOUR[p.group] }}>
              <Portrait name={p.name} src={p.portrait} className="size-9 text-xs ring-2 ring-white" />
            </span>
            <span className="min-w-0 text-sm">
              <span className="block truncate font-semibold">{p.name}</span>
              <span className="block truncate text-ink-muted">{from ? `${p.town.name}, ${km(kmBetween(from, p.town))}` : p.role}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function AboutPanel({ pins }: { pins: Pin[] }) {
  const byState = STATES.map((s) => [s, pins.filter((p) => p.town.state === s).length] as const).filter(([, n]) => n);
  const joined = pins.filter((p) => p.kind === "member");
  const youreOn = joined.some((p) => p.you);
  return (
    <>
      <p className="rounded-2xl bg-tealtint p-3 text-sm">
        {youreOn
          ? "You’re on the Atlas. "
          : joined.length === 0
            ? "No Hub members have joined yet. "
            : `${joined.length} Hub ${joined.length === 1 ? "member has" : "members have"} joined. `}
        <Link href="/settings#atlas" className="font-semibold text-accent hover:underline">
          {youreOn ? "Change what it shows" : "Join the Atlas"}
        </Link>
      </p>
      <div>
        <PanelTitle>About the Atlas</PanelTitle>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
          <li>Choose a face to see who they are, what they talk about, and who they have common ground with.</li>
          <li>Faces close together join into a bubble. Choose it to zoom in.</li>
          <li>
            <strong>Near a town</strong> starts from a town you pick. The Atlas never asks your device where you are.
          </li>
          <li>The Digital Members are fictional. Hub members appear only if they choose to, at the nearest town they picked, never an address.</li>
        </ul>
      </div>
      <div>
        <PanelTitle>Where they are</PanelTitle>
        <ul className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
          {byState.map(([s, n]) => (
            <li key={s} className="flex justify-between rounded-xl bg-muted px-3 py-1.5">
              <span>{STATE_NAMES[s]}</span>
              <span className="font-semibold">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
