"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApi, type Me } from "@/lib/api";
import { cx } from "@/lib/format";
import { cardSounds } from "@/lib/sfx";
import { badges, LEVEL_SIZE, POINTS, quests, STEP_LABEL, type Quest } from "@/content/explorer";
import { Icon, type IconName } from "../Icon";
import { Effects } from "./effects";
import {
  cameraFor,
  drawMinimap,
  drawWorld,
  gate,
  houseAt,
  houses,
  questHouses,
  roofTop,
  route,
  screenOf,
  SIGN,
  START,
  toWorld,
  VIEW,
  walkable,
  type Cam,
  type Look,
  type PlayerState,
  type Tile,
} from "./world";

/*
  Neighbourhood Explorer: walk a pixel-art street, knock on doors and help each client with a short
  quest (what's in scope, the risks, what to do). Points, levels and badges for good reasoning.
  The street, the scores, the menu, the quest panel and the minimap share one 16:9 game screen;
  on phones the menu and panel sit below it. Progress is kept in this browser for each person.
*/

type Progress = { quests: Record<string, { points: number; perfect: boolean; at: string }>; badges: string[] };
const EMPTY: Progress = { quests: {}, badges: [] };
const storageKey = (userId: string) => `tc-explorer-${userId}`;

function load(userId: string): Progress {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Progress) };
  } catch {}
  return EMPTY;
}
function save(userId: string, p: Progress) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(p));
  } catch {}
}

const totalPoints = (p: Progress) => Object.values(p.quests).reduce((n, q) => n + q.points, 0);
const levelOf = (points: number) => Math.floor(points / LEVEL_SIZE) + 1;

type Tab = "map" | "quests" | "progress" | "badges";
type Dialog = {
  quest: Quest;
  phase: "intro" | "step" | "done";
  step: number;
  picked: number | null;
  /** Choices already tried on this step. */
  tried: number[];
  earned: number;
  perfect: boolean;
  newBadges: string[];
  replay: boolean;
};

const SPEED = 3.4;
const LOOKS: Record<string, Look> = Object.fromEntries(quests.map((q) => [q.id, q.look]));
const PLAYER_LOOK = { skin: "#f0c3a0", hair: "#5b3a24", shirt: "#1e3a5c", style: "pony" as const };

/* The game's own look: navy panels with a lighter edge, the same in light and dark. */
const panel = "rounded-2xl bg-[#1d2b4f]/95 text-white shadow-lg ring-2 ring-[#3d5288]";

export function Explorer() {
  const me = useApi<Me>("/api/me").data;
  const userId = me?.user.id ?? null;
  // Each person's progress: read from this browser once we know who's signed in, held here once played.
  const [played, setPlayed] = useState<Record<string, Progress>>({});
  const progress = userId ? (played[userId] ?? (typeof window === "undefined" ? EMPTY : load(userId))) : EMPTY;
  const setProgress = (p: Progress) => userId && setPlayed((all) => ({ ...all, [userId]: p }));

  const [tab, setTab] = useState<Tab>("map");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [atDoor, setAtDoor] = useState<string | null>(null);

  const done = new Set(Object.keys(progress.quests));
  const points = totalPoints(progress);
  const level = levelOf(points);
  const toNext = (points % LEVEL_SIZE) / LEVEL_SIZE;
  const unlocked = done.size === quests.length;
  const next = quests.find((q) => !done.has(q.id)) ?? null;

  /* The world loop: the player walks, the camera follows, everything is redrawn each frame. */
  const canvas = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const player = useRef<PlayerState>({ x: START.x + 0.5, y: START.y + 0.5, facing: "right", walking: false, t: 0 });
  const cam = useRef<Cam>(cameraFor(START.x + 0.5, START.y + 0.5));
  const path = useRef<Tile[]>([]);
  const hover = useRef<Tile | null>(null);
  /** A quest to open when the player reaches its door. */
  const heading = useRef<string | null>(null);
  const atDoorRef = useRef<string | null>(null);
  const markers = useRef<Record<string, HTMLElement | null>>({});
  const signLabel = useRef<HTMLSpanElement>(null);
  const gateLabel = useRef<HTMLButtonElement>(null);
  const effects = useRef<Effects | null>(null);
  // What the drawing loop needs from React, kept current after each render.
  const loopState = useRef({ unlocked, done });
  const openRef = useRef<(id: string) => void>(() => {});
  /** Celebrations to play once the quest window closes. */
  const celebrate = useRef<{ house: string; points: number; levelUp: number | null; badge: boolean } | null>(null);
  useEffect(() => {
    loopState.current = { unlocked, done };
  });

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    effects.current = new Effects(reduced);
    const mctx = mini.current?.getContext("2d");
    let last = performance.now();
    let frame = 0;
    let time = 0;
    // Lay a DOM element over a canvas position (in canvas pixels), hiding it when it's off screen.
    // With `keepIn`, a marker whose roof is just above the screen slides down to stay in view.
    const lay = (el: HTMLElement | null, x: number, y: number, keepIn = false) => {
      if (!el) return;
      const off = x < -40 || x > VIEW.w + 40 || y < (keepIn ? -110 : -10) || y > VIEW.h + 60;
      el.style.visibility = off ? "hidden" : "visible";
      if (keepIn && el.parentElement) {
        const tall = ((el.offsetHeight + 6) / el.parentElement.clientHeight) * VIEW.h;
        y = Math.max(y, tall);
      }
      el.style.left = `${(x / VIEW.w) * 100}%`;
      el.style.top = `${(y / VIEW.h) * 100}%`;
    };
    const tick = (now: number) => {
      // Walking keeps its speed on a slow device; effects step at most a tenth of a second at a time.
      const dt = Math.min(0.3, (now - last) / 1000);
      last = now;
      time += dt;
      const p = player.current;
      p.t += dt;
      const nextTile = path.current[0];
      if (nextTile) {
        const tx = nextTile.x + 0.5;
        const ty = nextTile.y + 0.5;
        const dx = tx - p.x;
        const dy = ty - p.y;
        const dist = Math.hypot(dx, dy);
        const step = SPEED * dt;
        // Screen direction: x - y runs left to right.
        if (Math.abs(dx - dy) > 0.01) p.facing = dx - dy > 0 ? "right" : "left";
        if (dist <= step) {
          p.x = tx;
          p.y = ty;
          path.current.shift();
        } else {
          p.x += (dx / dist) * step;
          p.y += (dy / dist) * step;
        }
        p.walking = true;
      } else p.walking = false;

      // The camera eases after the player, staying within the street.
      const want = cameraFor(p.x, p.y);
      const k = reduced ? 1 : Math.min(1, dt * 5);
      cam.current = { x: cam.current.x + (want.x - cam.current.x) * k, y: cam.current.y + (want.y - cam.current.y) * k };
      const c = { x: Math.round(cam.current.x), y: Math.round(cam.current.y) };

      // Standing on a doorstep: offer to knock, or open the quest we were heading for.
      const here = { x: Math.floor(p.x), y: Math.floor(p.y) };
      const door = !p.walking ? questHouses.find((h) => h.door.x === here.x && h.door.y === here.y)?.id ?? null : null;
      if (door !== atDoorRef.current) {
        atDoorRef.current = door;
        setAtDoor(door);
      }
      if (door && heading.current === door) {
        heading.current = null;
        openRef.current(door);
      }

      const st = loopState.current;
      drawWorld(ctx, { cam: c, player: p, route: path.current, hover: hover.current, unlocked: st.unlocked, looks: LOOKS, done: st.done, time });
      effects.current?.draw(ctx, c, Math.min(0.1, dt));
      for (const h of questHouses) {
        const s = roofTop(c, h);
        lay(markers.current[h.id], s.x, s.y, true);
      }
      const sg = screenOf(c, SIGN.x + 0.5, SIGN.y + 0.5, 24);
      lay(signLabel.current, sg.x, sg.y);
      const gt = screenOf(c, gate.x + 0.5, gate.y + 0.5, 50);
      lay(gateLabel.current, gt.x, gt.y);
      if (mctx && frame++ % 4 === 0) drawMinimap(mctx, mini.current!.width, p, st.done);
      raf = requestAnimationFrame(tick);
    };
    let raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const here = (): Tile => ({ x: Math.floor(player.current.x), y: Math.floor(player.current.y) });

  /** Walk to a tile. Returns false if there's no way there. */
  const walkTo = useCallback((to: Tile) => {
    const from = { x: Math.floor(player.current.x), y: Math.floor(player.current.y) };
    // Finish the step in progress first, so the walk starts from a tile centre.
    const steps = route(path.current[0] ?? from, to);
    if (!steps.length && !(to.x === from.x && to.y === from.y)) return false;
    path.current = path.current[0] ? [path.current[0], ...steps] : steps;
    return true;
  }, []);

  const goToQuest = useCallback(
    (id: string) => {
      const h = houses.find((x) => x.id === id)!;
      setNotice(null);
      const p = here();
      if (p.x === h.door.x && p.y === h.door.y && !path.current.length) {
        openRef.current(id);
        return;
      }
      heading.current = id;
      walkTo(h.door);
    },
    [walkTo],
  );

  const openQuest = (id: string) => {
    const quest = quests.find((q) => q.id === id)!;
    setDialog({ quest, phase: "intro", step: 0, picked: null, tried: [], earned: 0, perfect: true, newBadges: [], replay: Boolean(progress.quests[id]) });
  };
  useEffect(() => {
    openRef.current = openQuest;
  });

  /** A click or tap on the street: walk there, or to the door of the house that was clicked. */
  const onWorldClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const w = toWorld(((e.clientX - r.left) / r.width) * VIEW.w + cam.current.x, ((e.clientY - r.top) / r.height) * VIEW.h + cam.current.y);
    const t = { x: Math.floor(w.x), y: Math.floor(w.y) };
    const h = houseAt(t);
    if (h?.quest) return goToQuest(h.id);
    if (h) return setNotice("Nobody needs a visit at this house today.");
    if (t.x === gate.x && t.y === gate.y) return showGate();
    heading.current = null;
    if (!walkTo(t)) setNotice("You can’t walk there. Try the footpath or the grass.");
    else setNotice(null);
  };
  const onWorldMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const w = toWorld(((e.clientX - r.left) / r.width) * VIEW.w + cam.current.x, ((e.clientY - r.top) / r.height) * VIEW.h + cam.current.y);
    const t = { x: Math.floor(w.x), y: Math.floor(w.y) };
    hover.current = walkable(t) || houseAt(t)?.quest ? t : null;
  };

  const showGate = () =>
    setNotice(
      unlocked
        ? "You’ve helped everyone here. The next neighbourhood, with more complex situations, is coming soon."
        : `The next neighbourhood unlocks when you’ve finished all four houses. ${quests.length - done.size} to go.`,
    );

  /** Arrow keys move along the grid; Enter knocks on the door you're standing at. */
  const onKey = (e: React.KeyboardEvent) => {
    const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const d = dirs[e.key];
    if (d) {
      e.preventDefault();
      if (path.current.length) return;
      const p = here();
      const n = { x: p.x + d[0], y: p.y + d[1] };
      if (walkable(n)) path.current = [n];
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && atDoor) {
      e.preventDefault();
      openQuest(atDoor);
    }
  };

  /* The quest itself. */
  const choose = (i: number) => {
    if (!dialog || dialog.picked !== null) return;
    const step = dialog.quest.steps[dialog.step];
    const best = step.choices[i].verdict === "best";
    if (best) cardSounds.ready();
    else cardSounds.settle();
    setDialog({
      ...dialog,
      picked: i,
      earned: dialog.earned + (best ? (dialog.tried.length ? POINTS.later : POINTS.first) : 0),
      perfect: dialog.perfect && (best ? dialog.tried.length === 0 : false),
    });
  };
  const tryAgain = () => dialog && setDialog({ ...dialog, tried: [...dialog.tried, dialog.picked!], picked: null });
  const advance = () => {
    if (!dialog) return;
    if (dialog.step + 1 < dialog.quest.steps.length) {
      setDialog({ ...dialog, step: dialog.step + 1, picked: null, tried: [] });
      return;
    }
    // Finished: points and badges are kept the first time a quest is done.
    cardSounds.swipe("next");
    if (dialog.replay || !userId) {
      celebrate.current = { house: dialog.quest.id, points: 0, levelUp: null, badge: false };
      setDialog({ ...dialog, phase: "done" });
      return;
    }
    const total = dialog.earned + POINTS.questBonus;
    const quests_ = { ...progress.quests, [dialog.quest.id]: { points: total, perfect: dialog.perfect, at: new Date().toISOString() } };
    const earned = new Set(progress.badges);
    const award = (id: string, when: boolean) => when && earned.add(id);
    award("first-knock", Object.keys(quests_).length >= 1);
    award("scope-keeper", Boolean(quests_.dot));
    award("safe-hands", Boolean(quests_.ron));
    award("sharp-eye", Boolean(quests_.margaret));
    award("good-neighbour", Boolean(quests_.ken));
    award("first-try", Object.values(quests_).some((q) => q.perfect));
    award("local", quests.every((q) => quests_[q.id]));
    const next_: Progress = { quests: quests_, badges: [...earned] };
    const newBadges = [...earned].filter((b) => !progress.badges.includes(b));
    const newLevel = levelOf(totalPoints(next_));
    celebrate.current = { house: dialog.quest.id, points: total, levelUp: newLevel > level ? newLevel : null, badge: newBadges.length > 0 };
    save(userId, next_);
    setProgress(next_);
    setDialog({ ...dialog, earned: total, phase: "done", newBadges });
  };
  /** Closing the quest window: back on the street, the celebrations play. */
  const closeDialog = (d: Dialog | null) => {
    setDialog(d);
    if (d) return;
    const cel = celebrate.current;
    celebrate.current = null;
    if (!cel || !effects.current) return;
    const h = houses.find((x) => x.id === cel.house)!;
    effects.current.questComplete();
    if (cel.points) effects.current.coins(h.door.x + 0.5, h.door.y + 0.5, cel.points);
    if (cel.levelUp) effects.current.levelUp(cel.levelUp);
    else if (cel.badge) effects.current.badge();
  };

  const tabs: { id: Tab; label: string; icon: IconName; count?: number }[] = [
    { id: "map", label: "Map", icon: "pin" },
    { id: "quests", label: "Quests", icon: "checklist", count: quests.length - done.size },
    { id: "progress", label: "Progress", icon: "layers" },
    { id: "badges", label: "Badges", icon: "star" },
  ];

  const menu = (
    <nav aria-label="Game" className={cx(panel, "p-2")}>
      <ul className="grid grid-cols-4 gap-1.5 lg:flex lg:flex-col">
        {tabs.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "relative flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 font-mulish text-sm font-extrabold sm:flex-row sm:gap-2.5 sm:px-3 sm:text-base lg:min-h-11 lg:justify-start",
                tab === t.id ? "bg-[#cdeffa] text-[#102a43]" : "text-white hover:bg-white/10",
              )}
            >
              <Icon name={t.icon} className="size-5" />
              {t.label}
              {t.count ? (
                <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-[#e5484d] text-xs font-bold text-white sm:static sm:ml-auto sm:size-6">{t.count}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );

  const side = (
    <>
      {tab === "map" &&
        (next ? (
          <section className="overflow-hidden rounded-2xl bg-white text-[#102a43] shadow-lg ring-2 ring-[#3d5288]">
            <div className="flex items-center gap-3 bg-[#2a2350] p-3.5 text-white">
              <Portrait look={next.look} className="size-14 shrink-0 rounded-xl bg-white/10" />
              <div>
                <p className="text-sm text-white/80">Next quest</p>
                <h2 className="font-mulish text-xl font-extrabold leading-tight">{next.title}</h2>
              </div>
            </div>
            <div className="p-3.5">
              <p className="leading-snug">{next.teaser}</p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {next.steps.map((s) => (
                  <li key={s.kind} className="flex min-h-10 items-center gap-2.5 rounded-xl border border-[#d6dde8] px-3 text-sm font-semibold">
                    <Icon name={s.kind === "scope" ? "target" : s.kind === "risk" ? "shield" : "chat"} className="size-4 text-[#2d4875]" />
                    {STEP_LABEL[s.kind]}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => goToQuest(next.id)}
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2e7d32] font-mulish text-lg font-extrabold text-white hover:bg-[#276b2b]"
              >
                Start quest <Icon name="arrow-right" className="size-5" />
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl bg-white p-4 text-[#102a43] shadow-lg ring-2 ring-[#3d5288]">
            <h2 className="font-mulish text-xl font-extrabold">Street done!</h2>
            <p className="mt-1 text-[#3d5068]">You’ve helped everyone here. Replay any house from Quests, or check your badges.</p>
          </section>
        ))}

      {tab === "quests" && (
        <ul className="flex flex-col gap-2">
          {quests.map((q) => {
            const r = progress.quests[q.id];
            return (
              <li key={q.id} className="flex items-center gap-3 rounded-2xl bg-white p-2.5 text-[#102a43] shadow ring-2 ring-[#3d5288]">
                <Portrait look={q.look} className="size-11 shrink-0 rounded-xl bg-[#e8eef6]" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{q.title}</p>
                  <p className="text-xs text-[#3d5068]">{r ? `Done · ${r.points} pts${r.perfect ? " · all right first time" : ""}` : "Not started"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => goToQuest(q.id)}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-[#9fb0c8] px-3 text-sm font-semibold hover:bg-[#e8eef6]"
                >
                  {r ? "Replay" : "Go"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "progress" && (
        <section className="rounded-2xl bg-white p-4 text-[#102a43] shadow-lg ring-2 ring-[#3d5288]">
          <h2 className="font-mulish text-xl font-extrabold">Your progress</h2>
          <p className="mt-1 text-[#3d5068]">
            Level {level} · {points} points · {LEVEL_SIZE - (points % LEVEL_SIZE)} to the next level
          </p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {quests.map((q) => {
              const r = progress.quests[q.id];
              const max = q.steps.length * POINTS.first + POINTS.questBonus;
              return (
                <li key={q.id}>
                  <p className="flex justify-between text-sm font-semibold">
                    <span>{q.client}</span>
                    <span className="tabular-nums text-[#3d5068]">
                      {r?.points ?? 0}/{max}
                    </span>
                  </p>
                  <span className="mt-1 block h-2 overflow-hidden rounded-full bg-[#e8eef6]">
                    <span className="block h-full rounded-full bg-[#0e7c7b]" style={{ width: `${((r?.points ?? 0) / max) * 100}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-[#3d5068]">Saved in this browser. Getting a step right first time earns the most points.</p>
        </section>
      )}

      {tab === "badges" && (
        <ul className="grid grid-cols-2 gap-2">
          {badges.map((b) => {
            const has = progress.badges.includes(b.id);
            return (
              <li key={b.id} className={cx("rounded-2xl p-2.5 text-center shadow ring-2", has ? "bg-[#fff6d6] text-[#102a43] ring-[#ffc72c]" : "bg-white text-[#102a43] ring-[#3d5288]")}>
                <span className={cx("mx-auto grid size-9 place-items-center rounded-full", has ? "bg-[#ffc72c]" : "bg-[#e8eef6] text-[#5a6b85]")}>
                  <Icon name={has ? "star" : "lock"} className="size-5" />
                </span>
                <p className="mt-1 text-sm font-bold leading-tight">{b.name}</p>
                <p className="mt-0.5 text-xs text-[#3d5068]">{b.description}</p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 pb-10 pt-4 sm:px-6 lg:pt-6">
      {/* The game screen: as wide as the page allows, but never taller than the window. */}
      <div className="mx-auto w-full max-w-[calc((100dvh-6.5rem)*16/9)]">
        {/* On phones the title sits above the game, leaving the small screen for the street. */}
        <h1 className="mb-2 font-mulish text-2xl font-black text-ink sm:hidden">Neighbourhood Explorer</h1>
        <div
          className="relative aspect-video w-full overflow-clip rounded-3xl bg-[#5aa64c] shadow-xl ring-4 ring-[#1d2b4f] outline-none focus-visible:ring-focus"
          tabIndex={0}
          role="application"
          aria-label="The neighbourhood. Click or tap to walk, or use the arrow keys. Press Enter at a door to knock."
          onKeyDown={onKey}
        >
          <canvas
            ref={canvas}
            width={VIEW.w}
            height={VIEW.h}
            onClick={onWorldClick}
            onPointerMove={onWorldMove}
            onPointerLeave={() => (hover.current = null)}
            className="absolute inset-0 size-full cursor-pointer"
            style={{ imageRendering: "pixelated" }}
          />

          {/* Who lives where: a portrait over each house, moving with the street. */}
          {questHouses.map((h) => {
            const q = quests.find((x) => x.id === h.id)!;
            const isDone = done.has(h.id);
            return (
              <button
                key={h.id}
                ref={(el) => {
                  markers.current[h.id] = el;
                }}
                type="button"
                onClick={() => goToQuest(h.id)}
                aria-label={`${q.client}’s house: ${q.title}${isDone ? ", done" : ""}. Walk there`}
                className="explorer-marker invisible absolute -translate-x-1/2 -translate-y-full"
              >
                <span className="relative block rounded-full bg-white p-1 shadow-lg ring-[3px] ring-[#1d2b4f]">
                  <Portrait look={q.look} className="size-10 sm:size-14 lg:size-16" />
                  <span
                    className={cx(
                      "absolute -right-2 -top-2 grid size-6 place-items-center rounded-full font-mulish text-sm font-black ring-[3px] ring-white sm:size-8 sm:text-lg",
                      isDone ? "bg-[#2e9e4f] text-white" : "bg-[#ffc72c] text-[#102a43]",
                    )}
                  >
                    {isDone ? <Icon name="check" className="size-4" /> : "!"}
                  </span>
                </span>
                <span className="mx-auto block h-2.5 w-0 border-x-[8px] border-t-[9px] border-x-transparent border-t-white" />
              </button>
            );
          })}
          <span
            ref={signLabel}
            aria-hidden
            className="pointer-events-none invisible absolute -translate-x-1/2 -translate-y-full whitespace-nowrap text-center font-mulish text-[0.55rem] font-black leading-tight text-[#3d2614] sm:text-sm lg:text-base"
          >
            Welcome to
            <br />
            the Neighbourhood
          </span>
          <button
            ref={gateLabel}
            type="button"
            onClick={showGate}
            className="invisible absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-[#1d2b4f]/90 px-2.5 py-1 text-[0.6rem] font-bold text-white shadow sm:text-sm"
          >
            {unlocked ? "Next neighbourhood" : "🔒 Next neighbourhood"}
          </button>

          {/* The game's panels, over the street on larger screens. */}
          <div className="pointer-events-none absolute inset-0 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="pointer-events-auto flex flex-col gap-3">
                <div className={cx(panel, "hidden items-center gap-3 px-4 py-2.5 sm:flex")}>
                  <span className="grid size-8 place-items-center rounded-xl bg-[#f26a36] sm:size-11">
                    <Icon name="home" className="size-5 sm:size-7" />
                  </span>
                  <h1 className="font-mulish text-sm font-black leading-[1.05] sm:text-xl lg:text-2xl">
                    Neighbourhood
                    <br />
                    Explorer
                  </h1>
                </div>
                <div className="hidden w-44 lg:block">{menu}</div>
              </div>
              <div className="pointer-events-auto flex flex-col items-end gap-3">
                <div className="flex items-center gap-2">
                  <span className={cx(panel, "inline-flex min-h-9 items-center gap-2 px-3 font-mulish font-black sm:min-h-12 sm:px-4 sm:text-xl")}>
                    <Icon name="star" className="size-4 text-[#ffc72c] sm:size-6" /> {points} pts
                  </span>
                  <span className={cx(panel, "hidden min-h-12 items-center gap-3 py-1 pl-4 pr-1.5 font-mulish text-lg font-black sm:inline-flex")}>
                    Lv {level}
                    <span className="flex gap-0.5" role="img" aria-label={`${Math.round(toNext * 100)}% of the way to level ${level + 1}`}>
                      {Array.from({ length: 8 }, (_, i) => (
                        <span key={i} className={cx("h-4 w-2.5 rounded-sm", i < Math.round(toNext * 8) ? "bg-[#4cc3c9]" : "bg-white/20")} />
                      ))}
                    </span>
                    <Portrait look={PLAYER_LOOK} className="size-9 rounded-full bg-white/10 ring-2 ring-white/70" />
                  </span>
                </div>
                <div className="hidden w-[19rem] lg:block">{side}</div>
              </div>
            </div>
          </div>

          {/* Minimap. */}
          <canvas
            ref={mini}
            width={128}
            height={128}
            aria-hidden
            className="absolute bottom-3 right-3 hidden size-28 rounded-2xl bg-[#2f6b3a] shadow-xl ring-4 ring-white sm:block lg:bottom-4 lg:right-4 lg:size-36"
          />
          {/* Knocking, and notes. */}
          {atDoor && !dialog && (
            <button
              type="button"
              onClick={() => openQuest(atDoor)}
              className="absolute bottom-4 left-1/2 inline-flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-[#2e7d32] px-6 font-mulish text-lg font-extrabold text-white shadow-xl ring-4 ring-white/70"
            >
              Knock on {quests.find((q) => q.id === atDoor)!.client}’s door
            </button>
          )}
          {notice && !atDoor && (
            <p role="status" className={cx(panel, "absolute bottom-4 left-4 max-w-md px-4 py-2.5 text-sm")}>
              {notice}
            </p>
          )}
        </div>
        <p className="mt-2 text-sm text-ink-muted">Click or tap to walk. Arrow keys work too. Visit a house with a ! to start its quest. Demonstration content.</p>

        {/* On smaller screens the menu and panel sit below the game. */}
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 lg:hidden">
          {menu}
          {side}
        </div>
      </div>

      {dialog && <QuestDialog d={dialog} onChoose={choose} onTryAgain={tryAgain} onNext={advance} setDialog={closeDialog} />}

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .explorer-marker > span:first-child { animation: explorer-bob 2.2s ease-in-out infinite; }
        }
        @keyframes explorer-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      `}</style>
    </div>
  );
}

/** The conversation at the door: what the client says, three steps of choices, then how it went. */
function QuestDialog({
  d,
  onChoose,
  onTryAgain,
  onNext,
  setDialog,
}: {
  d: Dialog;
  onChoose: (i: number) => void;
  onTryAgain: () => void;
  onNext: () => void;
  setDialog: (d: Dialog | null) => void;
}) {
  const q = d.quest;
  const step = q.steps[d.step];
  const picked = d.picked !== null ? step.choices[d.picked] : null;
  const close = () => setDialog(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, [d.phase, d.step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDialog(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setDialog]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgb(10_26_46/0.6)] p-3" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quest-title"
        className="flex max-h-[calc(100dvh-1.5rem)] w-[min(40rem,100%)] flex-col overflow-hidden rounded-3xl bg-surface text-ink shadow-2xl ring-4 ring-[#33467a]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 bg-[#2a2350] px-5 py-4 text-white">
          <Portrait look={q.look} className="size-14 shrink-0 rounded-xl bg-white/10" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/75">
              {d.phase === "intro" ? "At the door" : d.phase === "step" ? `Step ${d.step + 1} of ${q.steps.length} · ${STEP_LABEL[step.kind]}` : "Quest complete"}
            </p>
            <h2 id="quest-title" className="font-mulish text-xl font-extrabold leading-tight">
              {q.title}
            </h2>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="grid size-11 place-items-center rounded-full hover:bg-white/10">
            <Icon name="close" className="size-5" />
          </button>
        </header>
        {d.phase === "step" && (
          <div className="flex gap-1 bg-[#2a2350] px-5 pb-3" aria-hidden>
            {q.steps.map((_, i) => (
              <span key={i} className={cx("h-1.5 flex-1 rounded-full", i < d.step ? "bg-[#4cc3c9]" : i === d.step ? "bg-[#ffc72c]" : "bg-white/20")} />
            ))}
          </div>
        )}

        <div className="overflow-y-auto p-5">
          {d.phase === "intro" && (
            <>
              <div className="flex flex-col gap-2">
                {q.opening.map((line, i) => (
                  <p
                    key={i}
                    className={cx(
                      "rounded-2xl px-4 py-3",
                      line.startsWith("(") ? "bg-muted italic text-ink-muted" : "rounded-tl-sm bg-[#f3eefc] text-[#2a2350] dark:bg-muted dark:text-ink",
                    )}
                  >
                    {line.startsWith("(") ? line.slice(1, -1) : <>“{line}”</>}
                  </p>
                ))}
              </div>
              {d.replay && <p className="mt-3 text-sm text-ink-muted">You’ve done this one. Play it again for practice; your first score is kept.</p>}
              <button ref={first} type="button" onClick={() => setDialog({ ...d, phase: "step" })} className={cx(primary, "mt-5")}>
                What do you do? <Icon name="arrow-right" className="size-5" />
              </button>
            </>
          )}

          {d.phase === "step" && (
            <>
              <p className="text-lg font-semibold">{step.prompt}</p>
              <ul className="mt-4 flex flex-col gap-2">
                {step.choices.map((c, i) => {
                  const chosen = d.picked === i;
                  const ruledOut = d.tried.includes(i);
                  return (
                    <li key={i}>
                      <button
                        ref={i === 0 ? first : undefined}
                        type="button"
                        disabled={d.picked !== null || ruledOut}
                        onClick={() => onChoose(i)}
                        className={cx(
                          "flex min-h-12 w-full items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left font-medium transition-colors",
                          chosen && c.verdict === "best" && "border-[#2e9e4f] bg-[#e5f5ea] text-[#14532d]",
                          chosen && c.verdict === "partly" && "border-[#d89b1e] bg-[#fff6d6] text-[#5c3d00]",
                          chosen && c.verdict === "no" && "border-[#d64545] bg-[#fde8e8] text-[#7a1d1d]",
                          !chosen && !ruledOut && d.picked === null && "border-line-strong hover:border-action hover:bg-tealtint",
                          (ruledOut || (d.picked !== null && !chosen)) && "border-line opacity-50",
                        )}
                      >
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted font-mulish text-sm font-extrabold text-ink">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span>{c.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {picked && (
                <div
                  role="status"
                  className={cx(
                    "mt-4 rounded-2xl p-4",
                    picked.verdict === "best" ? "bg-[#e5f5ea] text-[#14532d]" : picked.verdict === "partly" ? "bg-[#fff6d6] text-[#5c3d00]" : "bg-[#fde8e8] text-[#7a1d1d]",
                  )}
                >
                  <p className="font-bold">
                    {picked.verdict === "best"
                      ? `Good call! +${d.tried.length ? POINTS.later : POINTS.first} pts`
                      : picked.verdict === "partly"
                        ? "Close, but not quite."
                        : "Not this time."}
                  </p>
                  <p className="mt-1">{picked.feedback}</p>
                  <div className="mt-3">
                    {picked.verdict === "best" ? (
                      <button type="button" onClick={onNext} className={primary}>
                        {d.step + 1 < q.steps.length ? "Next step" : "See how you did"} <Icon name="arrow-right" className="size-5" />
                      </button>
                    ) : (
                      <button type="button" onClick={onTryAgain} className={primary}>
                        Try again
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {d.phase === "done" && (
            <>
              <div className="flex items-center gap-4 rounded-2xl bg-[#fff6d6] p-4 text-[#102a43]">
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#ffc72c]">
                  <Icon name="star" className="size-7" />
                </span>
                <div>
                  <p className="font-mulish text-2xl font-extrabold">{d.replay ? "Practice round done" : `+${d.earned} pts`}</p>
                  <p>
                    {d.perfect ? "Every step right first time. " : ""}
                    {d.replay ? "Your first score is kept." : `Including a ${POINTS.questBonus}-point bonus for finishing.`}
                  </p>
                </div>
              </div>
              {d.newBadges.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-2 font-semibold">
                  New badge{d.newBadges.length > 1 ? "s" : ""}:
                  {d.newBadges.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#ffc72c] px-3 py-1 text-sm text-[#102a43]">
                      <Icon name="star" className="size-3.5" /> {badges.find((b) => b.id === id)?.name}
                    </span>
                  ))}
                </p>
              )}
              <h3 className="mt-5 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Take this with you</h3>
              <p className="mt-1 text-lg">{q.takeaway}</p>
              <Link
                href={`/learning/${q.topic.slug}`}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted"
              >
                <Icon name="book" className="size-4" /> Learn more: {q.topic.title}
              </Link>
              <button ref={first} type="button" onClick={close} className={cx(primary, "mt-4 w-full")}>
                Back to the street
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const primary = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2e7d32] px-5 font-bold text-white hover:bg-[#276b2b]";

/** A client's portrait: a simple face in their colours. */
function Portrait({ look, className }: { look: Quest["look"]; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cx("block", className)} aria-hidden>
      <circle cx="24" cy="24" r="24" fill="#cdeffa" />
      <path d="M8 48c0-10 7-15 16-15s16 5 16 15z" fill={look.shirt} />
      <rect x="20" y="28" width="8" height="7" rx="3" fill={look.skin} />
      <circle cx="24" cy="21" r="10" fill={look.skin} />
      {look.hat ? (
        <>
          <ellipse cx="24" cy="13" rx="15" ry="3.5" fill="#b08d57" />
          <path d="M14 13c0-7 4-9 10-9s10 2 10 9z" fill="#c9a66b" />
          <rect x="14" y="11" width="20" height="2.5" fill="#6e4a2c" />
        </>
      ) : (
        <>
          <path d="M13 21c-1-9 5-13 11-13s12 4 11 13c-2-5-6-7-11-7s-9 2-11 7z" fill={look.hair} />
          <circle cx="24" cy="8.5" r="4.5" fill={look.hair} />
        </>
      )}
      <circle cx="20" cy="21.5" r="1.3" fill="#2b2b2b" />
      <circle cx="28" cy="21.5" r="1.3" fill="#2b2b2b" />
      {look.glasses && (
        <g fill="none" stroke="#3d2b1f" strokeWidth="1.2">
          <circle cx="20" cy="21.5" r="3.3" />
          <circle cx="28" cy="21.5" r="3.3" />
          <path d="M23.3 21.5h1.4" />
        </g>
      )}
      <path d="M20.5 26.5q3.5 2.5 7 0" fill="none" stroke="#8a4b3a" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="17.5" cy="25" r="1.6" fill="#f08a8a" opacity="0.45" />
      <circle cx="30.5" cy="25" r="1.6" fill="#f08a8a" opacity="0.45" />
    </svg>
  );
}
