/*
  The Neighbourhood Explorer world: an isometric Queensland street, drawn in pixel art on a
  640 by 360 canvas and scaled up with crisp pixels. The street runs off every edge of the screen
  (gardens, gum trees and the road keep going), and a camera follows the player around it.

  World coordinates: x runs down-right on screen, y runs down-left. Tile (i, j) covers [i, i+1] by
  [j, j+1]; a character standing on it is at its centre (i + 0.5, j + 0.5). "World-screen" positions
  are pixels before the camera moves them; the camera's top-left is subtracted to draw.
*/

export const N = 16;
export const VIEW = { w: 640, h: 360 } as const;
const HW = 32;
const HH = 16;
const WALL = 46;
const ROOF = 28;

export type Pt = { x: number; y: number };
export type Tile = { x: number; y: number };
export type Cam = { x: number; y: number };

export const iso = (x: number, y: number): Pt => ({ x: (x - y) * HW, y: (x + y) * HH });
export const toWorld = (wx: number, wy: number): Pt => ({ x: (wx / HW + wy / HH) / 2, y: (wy / HH - wx / HW) / 2 });

/** How far the camera may go: the whole street, with the gardens beyond it filling the corners. */
export const CAM_BOUNDS = { x0: -N * HW + 40, x1: N * HW - VIEW.w - 40, y0: -40, y1: 2 * N * HH - VIEW.h + 70 };

export type House = {
  /** The quest inside, or a neighbour's house with no quest. */
  id: string;
  quest: boolean;
  x: number;
  y: number;
  w: number;
  d: number;
  doorFace: "x" | "y";
  door: Tile;
  wall: string;
  wallShade: string;
  trim: string;
  roof: string;
  roofShade: string;
  doorColour: string;
};

const house = (h: Omit<House, "trim"> & { trim?: string }): House => ({ trim: "#ffffff", ...h });

export const houses: House[] = [
  house({ id: "dot", quest: true, x: 2, y: 2, w: 3, d: 3, doorFace: "x", door: { x: 5, y: 3 }, wall: "#f7e7c9", wallShade: "#e0c9a2", roof: "#5d6d90", roofShade: "#46526f", doorColour: "#8a4b2c" }),
  house({ id: "ron", quest: true, x: 8, y: 2, w: 3, d: 3, doorFace: "y", door: { x: 9, y: 5 }, wall: "#f3dcc0", wallShade: "#d9bb94", roof: "#a85a4e", roofShade: "#813f37", doorColour: "#2f5f4a" }),
  house({ id: "margaret", quest: true, x: 2, y: 9, w: 3, d: 3, doorFace: "x", door: { x: 5, y: 10 }, wall: "#eef1e5", wallShade: "#d0d4c2", roof: "#4c6878", roofShade: "#384f5c", doorColour: "#a8323e" }),
  house({ id: "ken", quest: true, x: 8, y: 9, w: 3, d: 3, doorFace: "y", door: { x: 9, y: 12 }, wall: "#f4dfc4", wallShade: "#d6b993", roof: "#8a5a8a", roofShade: "#694168", doorColour: "#334b78" }),
  house({ id: "n1", quest: false, x: 2, y: 13, w: 3, d: 3, doorFace: "x", door: { x: 5, y: 14 }, wall: "#e9eef4", wallShade: "#c9d1db", roof: "#7a5c48", roofShade: "#5c4536", doorColour: "#2d6a7a" }),
  house({ id: "n2", quest: false, x: 8, y: 13, w: 3, d: 3, doorFace: "x", door: { x: 11, y: 14 }, wall: "#f6e3d3", wallShade: "#dcc3ad", roof: "#4f7a5a", roofShade: "#3b5c44", doorColour: "#7a3b2f" }),
];
export const questHouses = houses.filter((h) => h.quest);

/** The gate to the next neighbourhood, at the end of the cross street. Locked for now. */
export const gate: Tile = { x: 0, y: 7 };
export const START: Tile = { x: 6, y: 14 };
/** Where the welcome sign stands (its words are laid over the canvas). */
export const SIGN: Tile = { x: 7, y: 15 };

type Ground = "grass" | "path" | "road" | "bed" | "verge";

const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;

const MAP: Ground[][] = (() => {
  const g: Ground[][] = Array.from({ length: N }, () => Array.from({ length: N }, () => "grass" as Ground));
  const set = (x: number, y: number, t: Ground) => inMap(x, y) && (g[x][y] = t);
  for (let y = 0; y < N; y++) {
    set(13, y, "road");
    set(14, y, "road");
    set(12, y, "path");
    set(6, y, "path");
    set(15, y, "verge");
  }
  for (let x = 0; x < 12; x++) set(x, 7, "path");
  for (const [x, y] of [
    [5, 3],
    [9, 5],
    [9, 6],
    [5, 10],
    [9, 12],
    [10, 12],
    [11, 12],
    [5, 14],
    [11, 14],
  ])
    set(x, y, "path");
  for (const [x, y] of [
    [2, 5],
    [3, 5],
    [4, 5],
    [5, 2],
    [5, 4],
    [11, 2],
    [11, 3],
    [11, 4],
    [8, 5],
    [10, 5],
    [5, 9],
    [5, 11],
    [2, 12],
    [3, 12],
    [4, 12],
    [8, 12],
    [11, 9],
    [11, 10],
    [11, 11],
    [5, 13],
    [5, 15],
  ])
    set(x, y, "bed");
  return g;
})();

const hash = (x: number, y: number, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** The ground anywhere, inside the street or beyond it: the road and footpath carry on, the rest is lawn. */
function groundAt(x: number, y: number): Ground {
  if (inMap(x, y)) return MAP[x][y];
  if (x === 13 || x === 14) return "road";
  if (x === 12) return "path";
  if (x === 15) return "verge";
  return "grass";
}

type Thing =
  | { kind: "tree"; x: number; y: number; type: "gum" | "jacaranda" | "leafy" | "palm"; size?: number }
  | { kind: "bush"; x: number; y: number }
  | { kind: "bench"; x: number; y: number }
  | { kind: "mailbox"; x: number; y: number }
  | { kind: "sign"; x: number; y: number }
  | { kind: "gate"; x: number; y: number }
  | { kind: "van"; x: number; y: number }
  | { kind: "bin"; x: number; y: number }
  | { kind: "fence"; x: number; y: number; side: "x" | "y" };

const things: Thing[] = [
  { kind: "tree", x: 7, y: 0, type: "jacaranda", size: 1.35 },
  { kind: "tree", x: 0, y: 0, type: "gum", size: 1.3 },
  { kind: "tree", x: 11, y: 0, type: "gum" },
  { kind: "tree", x: 1, y: 6, type: "leafy" },
  { kind: "tree", x: 7, y: 6, type: "leafy", size: 0.9 },
  { kind: "tree", x: 0, y: 9, type: "gum", size: 1.15 },
  { kind: "tree", x: 7, y: 11, type: "palm" },
  { kind: "tree", x: 7, y: 14, type: "leafy" },
  { kind: "tree", x: 0, y: 14, type: "jacaranda" },
  { kind: "tree", x: 15, y: 3, type: "palm" },
  { kind: "tree", x: 15, y: 10, type: "gum", size: 1.2 },
  { kind: "bush", x: 3, y: 8 },
  { kind: "bush", x: 10, y: 8 },
  { kind: "bush", x: 7, y: 2 },
  { kind: "bush", x: 7, y: 9 },
  { kind: "bush", x: 11, y: 7 },
  { kind: "bench", x: 8, y: 8 },
  { kind: "mailbox", x: 5, y: 5 },
  { kind: "mailbox", x: 11, y: 5 },
  { kind: "mailbox", x: 5, y: 12 },
  { kind: "mailbox", x: 11, y: 13 },
  { kind: "bin", x: 7, y: 4 },
  { kind: "bin", x: 7, y: 10 },
  { kind: "sign", x: SIGN.x, y: SIGN.y },
  { kind: "gate", x: gate.x, y: gate.y },
  { kind: "van", x: 13, y: 4 },
  ...[2, 3, 4].map((x) => ({ kind: "fence" as const, x, y: 5, side: "y" as const })),
  ...[2, 3, 4].map((x) => ({ kind: "fence" as const, x, y: 12, side: "y" as const })),
  ...[2, 3, 4].map((y) => ({ kind: "fence" as const, x: 11, y, side: "x" as const })),
  ...[9, 10, 11].map((y) => ({ kind: "fence" as const, x: 11, y, side: "x" as const })),
];

export const houseAt = (t: Tile) => houses.find((h) => t.x >= h.x && t.x < h.x + h.w && t.y >= h.y && t.y < h.y + h.d);

const blocked = (() => {
  const b = new Set<string>();
  houses.forEach((h) => {
    for (let x = h.x; x < h.x + h.w; x++) for (let y = h.y; y < h.y + h.d; y++) b.add(`${x},${y}`);
  });
  things.forEach((t) => {
    if (t.kind === "fence" || t.kind === "mailbox") return;
    b.add(`${t.x},${t.y}`);
    if (t.kind === "van") b.add(`${t.x},${t.y + 1}`);
  });
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if (MAP[x][y] === "bed") b.add(`${x},${y}`);
  return b;
})();

export const walkable = (t: Tile) => inMap(t.x, t.y) && !blocked.has(`${t.x},${t.y}`);

/** The shortest walk between two tiles (four directions), not counting the start. Empty if there's no way. */
export function route(from: Tile, to: Tile): Tile[] {
  if (!walkable(to)) return [];
  const key = (t: Tile) => `${t.x},${t.y}`;
  const prev = new Map<string, Tile | null>([[key(from), null]]);
  const queue: Tile[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.x === to.x && cur.y === to.y) break;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = { x: cur.x + dx, y: cur.y + dy };
      if (!walkable(n) || prev.has(key(n))) continue;
      prev.set(key(n), cur);
      queue.push(n);
    }
  }
  if (!prev.has(key(to))) return [];
  const path: Tile[] = [];
  for (let t: Tile | null = to; t && key(t) !== key(from); t = prev.get(key(t)) ?? null) path.unshift(t);
  return path;
}

/* Drawing helpers. Everything is drawn at whole pixels for the crisp look. */

type Ctx = CanvasRenderingContext2D;
const R = Math.round;

function poly(ctx: Ctx, pts: Pt[], fill: string, stroke?: string) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(R(p.x), R(p.y)) : ctx.moveTo(R(p.x), R(p.y))));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
function line(ctx: Ctx, a: Pt, b: Pt, colour: string, w = 1) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(R(a.x) + 0.5, R(a.y) + 0.5);
  ctx.lineTo(R(b.x) + 0.5, R(b.y) + 0.5);
  ctx.stroke();
}
function rect(ctx: Ctx, x: number, y: number, w: number, h: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.fillRect(R(x), R(y), R(w), R(h));
}
function blob(ctx: Ctx, x: number, y: number, r: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(R(x), R(y), r, 0, Math.PI * 2);
  ctx.fill();
}
const up = (p: Pt, h: number): Pt => ({ x: p.x, y: p.y - h });
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/* Ground */

function drawTile(ctx: Ctx, x: number, y: number, at: (x: number, y: number) => Pt) {
  const t = groundAt(x, y);
  const n = hash(x, y);
  const d = [at(x, y), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1)];
  const c = at(x + 0.5, y + 0.5);
  if (t === "grass" || t === "verge") {
    // Mown stripes, every other row a shade lighter.
    poly(ctx, d, (x + y) % 2 ? "#6fc25a" : "#66b952");
    for (let k = 0; k < 9; k++) {
      const px = c.x + (hash(x, y, k) - 0.5) * 44;
      const py = c.y + (hash(x, y, k + 9) - 0.5) * 18;
      rect(ctx, px, py, 1, 2, k % 3 ? "#4f9d40" : "#8ad66f");
    }
    if (n > 0.86) {
      // A daisy or two in the lawn.
      rect(ctx, c.x + (n - 0.9) * 120, c.y + 3, 2, 2, "#fff8d8");
      rect(ctx, c.x + (n - 0.9) * 120, c.y + 3, 1, 1, "#ffd166");
    }
  } else if (t === "path") {
    poly(ctx, d, n > 0.5 ? "#e6dcc5" : "#e0d5bc");
    // Pavers: lines along both axes.
    for (const k of [0.5]) {
      line(ctx, at(x + k, y), at(x + k, y + 1), "#cdbfa2");
      line(ctx, at(x, y + k), at(x + 1, y + k), "#cdbfa2");
    }
    poly(ctx, d, "rgba(0,0,0,0)", "#d3c6aa");
  } else if (t === "road") {
    poly(ctx, d, "#565c66");
    for (let k = 0; k < 6; k++) rect(ctx, c.x + (hash(x, y, k) - 0.5) * 48, c.y + (hash(x, y, k + 3) - 0.5) * 20, 1, 1, k % 2 ? "#6a717c" : "#4a5058");
    if (x === 13) {
      // Dashed centre line between the lanes.
      line(ctx, at(14, y + 0.2), at(14, y + 0.6), "#f4f4ee", 2);
    }
  } else if (t === "bed") {
    poly(ctx, d, "#7b5238");
    for (let k = 0; k < 14; k++) {
      const px = c.x + (hash(x, y, k) - 0.5) * 42;
      const py = c.y + (hash(x, y, k + 20) - 0.5) * 16;
      blob(ctx, px, py - 2, 3, k % 2 ? "#3f8a3a" : "#4f9d45");
    }
    const colours = ["#ff6b8b", "#ffd166", "#ffffff", "#c77dff", "#ff8c42", "#7bdff2", "#ff4f6d"];
    for (let k = 0; k < 16; k++) {
      const px = c.x + (hash(x, y, k + 40) - 0.5) * 40;
      const py = c.y + (hash(x, y, k + 60) - 0.5) * 14 - 4;
      const col = colours[Math.floor(hash(x, y, k + 80) * colours.length)];
      rect(ctx, px, py, 2, 2, col);
      rect(ctx, px, py, 1, 1, "#ffffff");
    }
  }
  // Kerb between the footpath and the road.
  if (x === 12) line(ctx, at(13, y), at(13, y + 1), "#b8bec7", 2);
}

/* Houses */

const onFace = (a: Pt, b: Pt, t: number, h: number) => up(lerp(a, b, t), h);
const quad = (a: Pt, b: Pt, t0: number, t1: number, h0: number, h1: number) => [onFace(a, b, t0, h0), onFace(a, b, t1, h0), onFace(a, b, t1, h1), onFace(a, b, t0, h1)];

function windowOn(ctx: Ctx, a: Pt, b: Pt, t0: number, t1: number) {
  poly(ctx, quad(a, b, t0 - 0.015, t1 + 0.015, 13, 33), "#ffffff");
  poly(ctx, quad(a, b, t0, t1, 15, 31), "#7cc4dc");
  poly(ctx, quad(a, b, t0, t1, 24, 31), "#a9dcec");
  // Curtains and the cross bar.
  poly(ctx, quad(a, b, t0, t0 + (t1 - t0) * 0.18, 15, 31), "#f3e2c0");
  poly(ctx, quad(a, b, t1 - (t1 - t0) * 0.18, t1, 15, 31), "#f3e2c0");
  line(ctx, onFace(a, b, (t0 + t1) / 2, 15), onFace(a, b, (t0 + t1) / 2, 31), "#ffffff");
  line(ctx, onFace(a, b, t0, 23), onFace(a, b, t1, 23), "#ffffff");
  // Sill and a flower box.
  poly(ctx, quad(a, b, t0 - 0.03, t1 + 0.03, 11, 13), "#ffffff");
  for (let k = 0; k < 5; k++) {
    const p = onFace(a, b, t0 + ((t1 - t0) * (k + 0.5)) / 5, 9);
    rect(ctx, p.x, p.y, 2, 2, k % 2 ? "#ff6b8b" : "#4f9d45");
  }
}

function siding(ctx: Ctx, a: Pt, b: Pt, colour: string) {
  for (let h = 5; h < WALL; h += 4) line(ctx, onFace(a, b, 0, h), onFace(a, b, 1, h), colour);
}

function drawHouse(ctx: Ctx, h: House, at: (x: number, y: number) => Pt) {
  const B = at(h.x + h.w, h.y);
  const C = at(h.x + h.w, h.y + h.d);
  const D = at(h.x, h.y + h.d);
  // Shadow on the lawn.
  poly(ctx, [D, C, { x: C.x + 16, y: C.y + 4 }, { x: D.x + 16, y: D.y + 10 }], "rgba(20,40,20,0.18)");
  // Walls: down-left face in shade, down-right face in sun. Weatherboards, then corner boards.
  poly(ctx, [D, C, up(C, WALL), up(D, WALL)], h.wallShade);
  poly(ctx, [B, C, up(C, WALL), up(B, WALL)], h.wall);
  siding(ctx, D, C, "rgba(0,0,0,0.07)");
  siding(ctx, B, C, "rgba(0,0,0,0.06)");
  poly(ctx, [D, C, up(C, 3), up(D, 3)], "rgba(0,0,0,0.14)");
  poly(ctx, [B, C, up(C, 3), up(B, 3)], "rgba(0,0,0,0.1)");
  for (const p of [D, C, B]) rect(ctx, p.x - 1, p.y - WALL, 3, WALL, h.trim);

  // The front door, with windows either side.
  const [fa, fb, len] = h.doorFace === "x" ? [B, C, h.d] : [D, C, h.w];
  const [oa, ob, olen] = h.doorFace === "x" ? [D, C, h.w] : [B, C, h.d];
  const along = h.doorFace === "x" ? h.door.y - h.y : h.door.x - h.x;
  const t0 = (along + 0.32) / len;
  const t1 = (along + 0.68) / len;
  for (let i = 0; i < len; i++) if (i !== along) windowOn(ctx, fa, fb, (i + 0.22) / len, (i + 0.78) / len);
  for (let i = 0; i < olen; i++) windowOn(ctx, oa, ob, (i + 0.22) / olen, (i + 0.78) / olen);
  poly(ctx, quad(fa, fb, t0 - 0.03, t1 + 0.03, 0, 34), h.trim);
  poly(ctx, quad(fa, fb, t0, t1, 0, 32), h.doorColour);
  poly(ctx, quad(fa, fb, t0 + 0.04, t1 - 0.04, 18, 28), "rgba(255,255,255,0.18)");
  poly(ctx, quad(fa, fb, t0 + 0.04, t1 - 0.04, 5, 15), "rgba(0,0,0,0.12)");
  const knob = onFace(fa, fb, t1 - 0.05, 16);
  rect(ctx, knob.x, knob.y, 2, 2, "#ffd166");
  // Front step.
  poly(ctx, quad(fa, fb, t0 - 0.06, t1 + 0.06, -2, 1), "#d8d2c4");

  // A little verandah roof over the door, on two posts.
  const out = h.doorFace === "x" ? { x: HW * 0.5, y: HH * 0.5 } : { x: -HW * 0.5, y: HH * 0.5 };
  const pa = onFace(fa, fb, t0 - 0.12, 38);
  const pb = onFace(fa, fb, t1 + 0.12, 38);
  const pc = { x: pb.x + out.x, y: pb.y + out.y + 4 };
  const pd = { x: pa.x + out.x, y: pa.y + out.y + 4 };
  for (const p of [pd, pc]) rect(ctx, p.x - 1, p.y, 2, 38 - 4, h.trim);
  poly(ctx, [pa, pb, pc, pd], h.roof);
  poly(ctx, [pd, pc, { x: pc.x, y: pc.y + 2 }, { x: pd.x, y: pd.y + 2 }], h.trim);

  // Hip roof with a little overhang: shingle rows, a lighter ridge, a gutter along the eaves.
  const o = 0.2;
  const a = up(at(h.x - o, h.y - o), WALL);
  const b = up(at(h.x + h.w + o, h.y - o), WALL);
  const c = up(at(h.x + h.w + o, h.y + h.d + o), WALL);
  const d = up(at(h.x - o, h.y + h.d + o), WALL);
  const r1 = up(at(h.x + h.w / 2, h.y + h.d / 2 - 0.35), WALL + ROOF);
  const r2 = up(at(h.x + h.w / 2, h.y + h.d / 2 + 0.35), WALL + ROOF);
  poly(ctx, [a, b, r1], h.roofShade);
  poly(ctx, [a, d, r2, r1], h.roofShade);
  poly(ctx, [d, c, r2], h.roofShade);
  poly(ctx, [b, c, r2, r1], h.roof);
  for (let k = 1; k < 7; k++) {
    const f = k / 7;
    line(ctx, lerp(d, r2, f), lerp(c, r2, f), "rgba(0,0,0,0.12)");
    line(ctx, lerp(b, r1, f), lerp(c, r2, f), "rgba(255,255,255,0.1)");
  }
  line(ctx, r1, r2, "rgba(255,255,255,0.45)", 2);
  line(ctx, b, c, "rgba(255,255,255,0.35)");
  line(ctx, d, c, "rgba(0,0,0,0.3)", 2);
  line(ctx, c, b, "rgba(0,0,0,0.22)");
  // Chimney.
  const ch = up(at(h.x + h.w * 0.68, h.y + h.d * 0.3), WALL + ROOF - 12);
  rect(ctx, ch.x, ch.y - 14, 8, 16, "#a0705c");
  rect(ctx, ch.x + 5, ch.y - 14, 3, 16, "#83594a");
  rect(ctx, ch.x - 1, ch.y - 16, 10, 3, "#6e4b3e");
}

/* Trees, plants and street furniture */

function drawTree(ctx: Ctx, t: { x: number; y: number; type: "gum" | "jacaranda" | "leafy" | "palm"; size?: number }, at: (x: number, y: number) => Pt) {
  const c = at(t.x + 0.5, t.y + 0.5);
  const s = t.size ?? 1;
  ctx.fillStyle = "rgba(20,40,20,0.2)";
  ctx.beginPath();
  ctx.ellipse(R(c.x + 6), R(c.y + 1), 22 * s, 8 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  if (t.type === "palm") {
    // A curving trunk, then fronds.
    for (let k = 0; k < 16; k++) rect(ctx, c.x - 2 + Math.sin(k / 5) * 4, c.y - k * 3.2 * s, 5, 4, k % 2 ? "#8a6a44" : "#a07d52");
    const top = { x: c.x + Math.sin(3) * 4, y: c.y - 50 * s };
    for (let k = 0; k < 7; k++) {
      const ang = (k / 7) * Math.PI * 2;
      for (let j = 1; j < 9; j++) {
        const px = top.x + Math.cos(ang) * j * 3 * s;
        const py = top.y + Math.sin(ang) * j * 1.6 * s + j * j * 0.18;
        rect(ctx, px, py, 3, 2, j % 2 ? "#3f8a3a" : "#5aa64c");
      }
    }
    blob(ctx, top.x, top.y, 3, "#6e4a2c");
    return;
  }
  const trunk = t.type === "gum" ? ["#e9e4d8", "#c9c0ad"] : ["#7a5a3c", "#5e4430"];
  rect(ctx, c.x - 3, c.y - 30 * s, 6, 30 * s, trunk[0]);
  rect(ctx, c.x + 1, c.y - 30 * s, 2, 30 * s, trunk[1]);
  if (t.type === "gum") {
    // Gum branches, then sparse clumps of grey-green leaves.
    line(ctx, { x: c.x, y: c.y - 26 * s }, { x: c.x - 14 * s, y: c.y - 44 * s }, trunk[0], 3);
    line(ctx, { x: c.x, y: c.y - 22 * s }, { x: c.x + 16 * s, y: c.y - 40 * s }, trunk[0], 3);
  }
  const pal =
    t.type === "jacaranda"
      ? ["#5d3f9e", "#7b5cc4", "#9a7be0", "#c3a9f5"]
      : t.type === "gum"
        ? ["#4f6a3c", "#6b8a52", "#8aa86e", "#b2c890"]
        : ["#2f6e34", "#3f8a3a", "#56a84a", "#82c96a"];
  const top = c.y - 44 * s;
  const clumps =
    t.type === "gum"
      ? [
          [-16, -2, 11],
          [14, -6, 12],
          [0, -14, 12],
          [-6, 4, 9],
          [8, 6, 8],
        ]
      : [
          [-14, 4, 14],
          [14, 4, 14],
          [0, -8, 17],
          [-8, -2, 12],
          [9, -4, 12],
          [0, 8, 12],
        ];
  for (const [dx, dy, r] of clumps) blob(ctx, c.x + dx * s, top + dy * s + 3, r * s, pal[0]);
  for (const [dx, dy, r] of clumps) blob(ctx, c.x + dx * s - 2, top + dy * s, r * s * 0.86, pal[1]);
  for (const [dx, dy, r] of clumps) blob(ctx, c.x + dx * s - 4, top + dy * s - 3, r * s * 0.55, pal[2]);
  // Speckled highlights.
  for (let k = 0; k < 40; k++) {
    const px = c.x + (hash(t.x, t.y, k) - 0.5) * 50 * s;
    const py = top + (hash(t.x, t.y, k + 7) - 0.5) * 34 * s;
    rect(ctx, px, py, 2, 2, k % 3 ? pal[2] : pal[3]);
  }
  if (t.type === "jacaranda") {
    // Fallen petals on the lawn beneath.
    for (let k = 0; k < 26; k++) rect(ctx, c.x + (hash(t.x, t.y, k + 30) - 0.5) * 70, c.y + (hash(t.x, t.y, k + 50) - 0.5) * 22, 2, 1, k % 2 ? "#9a7be0" : "#c3a9f5");
  }
}

function drawBush(ctx: Ctx, x: number, y: number, at: (x: number, y: number) => Pt) {
  const c = at(x + 0.5, y + 0.5);
  ctx.fillStyle = "rgba(20,40,20,0.18)";
  ctx.beginPath();
  ctx.ellipse(R(c.x + 3), R(c.y + 1), 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [dx, dy, r, col] of [
    [-8, -6, 9, "#3a7f37"],
    [8, -6, 9, "#3a7f37"],
    [0, -12, 10, "#4f9d45"],
    [-4, -14, 6, "#6dbb59"],
  ] as const)
    blob(ctx, c.x + dx, c.y + dy, r, col);
  for (let k = 0; k < 6; k++) rect(ctx, c.x + (hash(x, y, k) - 0.5) * 22, c.y - 8 + (hash(x, y, k + 3) - 0.5) * 12, 2, 2, k % 2 ? "#ffd166" : "#ff8fab");
}

function drawFence(ctx: Ctx, x: number, y: number, side: "x" | "y", at: (x: number, y: number) => Pt) {
  const [a, b] = side === "y" ? [at(x, y + 1), at(x + 1, y + 1)] : [at(x + 1, y), at(x + 1, y + 1)];
  line(ctx, up(a, 9), up(b, 9), "#e7e7e7", 2);
  line(ctx, up(a, 4), up(b, 4), "#e7e7e7", 2);
  for (let k = 0; k <= 6; k++) {
    const p = lerp(a, b, k / 6);
    rect(ctx, p.x - 1, p.y - 14, 3, 14, "#ffffff");
    rect(ctx, p.x + 1, p.y - 14, 1, 14, "#d9d9d9");
    rect(ctx, p.x, p.y - 15, 1, 1, "#ffffff");
  }
}

function drawThing(ctx: Ctx, t: Thing, at: (x: number, y: number) => Pt, unlocked: boolean) {
  const c = at(t.x + 0.5, t.y + 0.5);
  switch (t.kind) {
    case "tree":
      return drawTree(ctx, t, at);
    case "bush":
      return drawBush(ctx, t.x, t.y, at);
    case "fence":
      return drawFence(ctx, t.x, t.y, t.side, at);
    case "bench":
      rect(ctx, c.x - 15, c.y - 10, 30, 4, "#9a6438");
      rect(ctx, c.x - 15, c.y - 18, 30, 4, "#9a6438");
      rect(ctx, c.x - 15, c.y - 10, 30, 1, "#b87d4c");
      rect(ctx, c.x - 13, c.y - 6, 2, 6, "#3e3328");
      rect(ctx, c.x + 11, c.y - 6, 2, 6, "#3e3328");
      return;
    case "mailbox":
      rect(ctx, c.x + 8, c.y - 12, 2, 12, "#5a4a3a");
      rect(ctx, c.x + 4, c.y - 20, 10, 8, "#d64545");
      rect(ctx, c.x + 4, c.y - 20, 10, 2, "#ef6a6a");
      rect(ctx, c.x + 6, c.y - 17, 6, 1, "#ffffff");
      return;
    case "bin":
      rect(ctx, c.x - 6, c.y - 16, 12, 16, "#2f5f4a");
      rect(ctx, c.x - 7, c.y - 18, 14, 3, "#e0b030");
      rect(ctx, c.x + 3, c.y - 16, 3, 16, "#244a3a");
      return;
    case "sign":
      rect(ctx, c.x - 20, c.y - 14, 4, 14, "#6e4a2c");
      rect(ctx, c.x + 16, c.y - 14, 4, 14, "#6e4a2c");
      rect(ctx, c.x - 26, c.y - 36, 52, 24, "#c98f55");
      rect(ctx, c.x - 26, c.y - 36, 52, 3, "#e6b47c");
      rect(ctx, c.x - 26, c.y - 15, 52, 3, "#9a6a3c");
      return;
    case "gate":
      rect(ctx, c.x - 20, c.y - 40, 5, 40, "#6e4a2c");
      rect(ctx, c.x + 16, c.y - 40, 5, 40, "#6e4a2c");
      rect(ctx, c.x - 22, c.y - 44, 45, 6, "#7f573a");
      for (let k = 0; k < 8; k++) rect(ctx, c.x - 13 + k * 4, c.y - 32, 2, 30, unlocked ? "#7cc865" : "#cfd3d8");
      if (!unlocked) {
        rect(ctx, c.x - 4, c.y - 20, 9, 8, "#ffd166");
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 2;
        ctx.strokeRect(R(c.x - 2), R(c.y - 25), 5, 5);
      }
      return;
    case "van": {
      // A white van parked along the kerb, nose down the street.
      const A0 = at(t.x + 0.15, t.y + 0.1);
      const B0 = at(t.x + 0.85, t.y + 0.1);
      const C0 = at(t.x + 0.85, t.y + 1.9);
      const D0 = at(t.x + 0.15, t.y + 1.9);
      const H = 22;
      poly(ctx, [D0, C0, { x: C0.x + 10, y: C0.y + 3 }, { x: D0.x + 10, y: D0.y + 3 }], "rgba(0,0,0,0.25)");
      poly(ctx, [D0, C0, up(C0, H), up(D0, H)], "#d9dde2");
      poly(ctx, [B0, C0, up(C0, H), up(B0, H)], "#f4f6f8");
      poly(ctx, [up(A0, H), up(B0, H), up(C0, H), up(D0, H)], "#ffffff");
      poly(ctx, quad(B0, C0, 0.05, 0.95, 6, 9), "#0e7c7b");
      for (let k = 0; k < 3; k++) poly(ctx, quad(B0, C0, 0.1 + k * 0.27, 0.32 + k * 0.27, 12, 19), "#7d98a8");
      poly(ctx, quad(D0, C0, 0.12, 0.88, 12, 19), "#6f8796");
      for (const p of [lerp(B0, C0, 0.2), lerp(B0, C0, 0.8)]) blob(ctx, p.x, p.y, 4, "#2b2b2b");
      return;
    }
  }
}

/* Characters */

export type Look = { skin: string; hair: string; shirt: string; pants?: string; glasses?: boolean; hat?: boolean; style?: "pony" | "short" | "bun" };
export type PlayerState = { x: number; y: number; facing: "left" | "right"; walking: boolean; t: number };

/** A person about 34 px tall, feet at (x, y). Walking swings the legs and arms. */
function drawPerson(ctx: Ctx, x: number, y: number, o: Look & { flip?: boolean; walking?: boolean; t?: number; backpack?: boolean; wave?: boolean }) {
  const f = o.flip ? -1 : 1;
  const px = (dx: number, dy: number, w: number, h: number, col: string) => rect(ctx, f === 1 ? x + dx : x - dx - w, y + dy, w, h, col);
  const step = o.walking ? Math.floor((o.t ?? 0) * 8) % 4 : 0;
  const swing = o.walking ? [0, 2, 0, -2][step] : 0;
  const bob = o.walking && step % 2 === 1 ? -1 : 0;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(R(x), R(y), 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  const pants = o.pants ?? "#2b3a52";
  // Legs and shoes.
  px(-4, -11 + Math.min(0, -swing) + bob, 3, 11, pants);
  px(1, -11 + Math.min(0, swing) + bob, 3, 11, pants);
  px(-5 - (swing > 0 ? 1 : 0), -2 + bob, 5, 2, "#3a2a1e");
  px(1 + (swing < 0 ? 1 : 0), -2 + bob, 5, 2, "#3a2a1e");
  const by = -22 + bob;
  // Backpack behind.
  if (o.backpack) {
    px(-9, by + 1, 5, 10, "#2f7fbf");
    px(-9, by + 1, 5, 2, "#4fa2df");
  }
  // Body, collar and shading.
  px(-6, by, 12, 12, o.shirt);
  px(3, by, 3, 12, "rgba(0,0,0,0.18)");
  px(-2, by, 4, 2, "#ffffff");
  // Arms.
  if (o.wave) {
    px(6, by - 8, 3, 9, o.shirt);
    px(6, by - 11, 3, 3, o.skin);
  } else {
    px(6, by + 1 - swing, 3, 9, o.shirt);
    px(6, by + 10 - swing, 3, 3, o.skin);
  }
  px(-9, by + 1 + swing, 3, 9, o.shirt);
  px(-9, by + 10 + swing, 3, 3, o.skin);
  if (o.backpack) px(-6, by + 1, 2, 9, "#1f5f99");
  // Head.
  const hy = by - 12;
  px(-1, hy + 9, 3, 3, o.skin);
  px(-5, hy, 11, 10, o.skin);
  px(4, hy + 2, 2, 7, "rgba(0,0,0,0.08)");
  // Hair.
  if (o.hat) {
    px(-8, hy - 1, 17, 2, "#b08d57");
    px(-5, hy - 6, 11, 5, "#c9a66b");
    px(-5, hy - 3, 11, 1, "#6e4a2c");
  } else {
    px(-6, hy - 2, 13, 4, o.hair);
    px(-6, hy, 3, 6, o.hair);
    if (o.style === "bun") px(-3, hy - 6, 6, 5, o.hair);
    if (o.style === "pony") {
      px(-9, hy + 1, 4, 3, o.hair);
      px(-10, hy + 3, 3, 6, o.hair);
    }
  }
  // Face: eyes, glasses, a smile.
  px(1, hy + 4, 1, 2, "#2b2b2b");
  px(4, hy + 4, 1, 2, "#2b2b2b");
  if (o.glasses) {
    px(0, hy + 3, 3, 1, "#3d2b1f");
    px(3, hy + 3, 3, 1, "#3d2b1f");
  }
  px(2, hy + 7, 2, 1, "#a0523d");
  px(-1, hy + 6, 2, 1, "rgba(240,120,120,0.5)");
}

const PLAYER: Look = { skin: "#f0c3a0", hair: "#5b3a24", shirt: "#1e3a5c", style: "pony" };

/* The whole scene. The ground and everything standing on it are painted once into cached images;
   each frame just places those images (in depth order, so people pass behind houses and trees)
   and draws the people. Painting thousands of little shapes every frame was far too slow. */

type Sprite = { canvas: HTMLCanvasElement; ox: number; oy: number };
const sprites = new Map<string, Sprite>();
/** A cached image of something standing at `anchor` (world-screen pixels), with room around it. */
function sprite(key: string, box: readonly [number, number, number, number], anchor: Pt, paint: (ctx: Ctx, at: (x: number, y: number) => Pt) => void): Sprite {
  let s = sprites.get(key);
  if (!s) {
    const [w, h, ox, oy] = box;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    paint(canvas.getContext("2d")!, (x, y) => {
      const p = iso(x, y);
      return { x: p.x - anchor.x + ox, y: p.y - anchor.y + oy };
    });
    s = { canvas, ox, oy };
    sprites.set(key, s);
  }
  return s;
}
// Image sizes [width, height, anchor x, anchor y] for each kind of thing.
const BOX = {
  house: [300, 210, 150, 125],
  tree: [170, 160, 85, 125],
  bush: [60, 50, 30, 36],
  fence: [80, 60, 40, 40],
  van: [170, 110, 85, 55],
  small: [90, 80, 45, 64],
} as const;

/** All the ground the camera can ever show, painted once. */
const GROUND = { x: CAM_BOUNDS.x0 - 16, y: CAM_BOUNDS.y0 - 16, w: CAM_BOUNDS.x1 - CAM_BOUNDS.x0 + VIEW.w + 32, h: CAM_BOUNDS.y1 - CAM_BOUNDS.y0 + VIEW.h + 32 };
const GROUND_TILES = (() => {
  const cs = [toWorld(GROUND.x, GROUND.y), toWorld(GROUND.x + GROUND.w, GROUND.y), toWorld(GROUND.x, GROUND.y + GROUND.h + 140), toWorld(GROUND.x + GROUND.w, GROUND.y + GROUND.h + 140)];
  return {
    x0: Math.floor(Math.min(...cs.map((p) => p.x))) - 2,
    x1: Math.ceil(Math.max(...cs.map((p) => p.x))) + 2,
    y0: Math.floor(Math.min(...cs.map((p) => p.y))) - 2,
    y1: Math.ceil(Math.max(...cs.map((p) => p.y))) + 2,
  };
})();
let ground: HTMLCanvasElement | null = null;
function groundLayer() {
  if (ground) return ground;
  ground = document.createElement("canvas");
  ground.width = GROUND.w;
  ground.height = GROUND.h;
  const g = ground.getContext("2d")!;
  g.fillStyle = "#5aa64c";
  g.fillRect(0, 0, GROUND.w, GROUND.h);
  const at = (x: number, y: number): Pt => {
    const p = iso(x, y);
    return { x: p.x - GROUND.x, y: p.y - GROUND.y };
  };
  const { x0, x1, y0, y1 } = GROUND_TILES;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) drawTile(g, x, y, at);
  return ground;
}

type Outside = { x: number; y: number; kind: "bush" } | { x: number; y: number; kind: "tree"; type: "gum" | "jacaranda" | "leafy" | "palm"; size: number };
/** Gardens beyond the street: trees and shrubs on the lawns all the way to the edge. */
const outside = (() => {
  const list: Outside[] = [];
  const { x0, x1, y0, y1 } = GROUND_TILES;
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      if (inMap(x, y) || groundAt(x, y) !== "grass") continue;
      const n = hash(x, y, 7);
      if (n > 0.62) list.push({ x, y, kind: "tree", type: n > 0.95 ? "jacaranda" : n > 0.86 ? "palm" : n > 0.74 ? "gum" : "leafy", size: 0.85 + hash(x, y, 8) * 0.45 });
      else if (n > 0.45) list.push({ x, y, kind: "bush" });
    }
  return list;
})();

const boxOf = (t: Thing) => (t.kind === "tree" ? BOX.tree : t.kind === "bush" ? BOX.bush : t.kind === "fence" ? BOX.fence : t.kind === "van" ? BOX.van : BOX.small);

export function drawWorld(
  ctx: Ctx,
  opts: { cam: Cam; player: PlayerState; route: Tile[]; hover: Tile | null; unlocked: boolean; looks: Record<string, Look>; done: Set<string>; time: number },
) {
  const { cam } = opts;
  const at = (x: number, y: number): Pt => {
    const p = iso(x, y);
    return { x: p.x - cam.x, y: p.y - cam.y };
  };
  ctx.fillStyle = "#5aa64c";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.drawImage(groundLayer(), GROUND.x - cam.x, GROUND.y - cam.y);

  if (opts.hover) poly(ctx, [at(opts.hover.x, opts.hover.y), at(opts.hover.x + 1, opts.hover.y), at(opts.hover.x + 1, opts.hover.y + 1), at(opts.hover.x, opts.hover.y + 1)], "rgba(255,255,255,0.2)", "rgba(255,255,255,0.85)");
  // Footsteps to where the player is going.
  opts.route.forEach((t, i) => {
    const c = at(t.x + 0.5, t.y + 0.5);
    const last = i === opts.route.length - 1;
    ctx.fillStyle = last ? "#ffffff" : "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.ellipse(R(c.x), R(c.y), last ? 6 : 3, last ? 3 : 2, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  type Item = { depth: number; draw: () => void };
  const items: Item[] = [];
  // Place a cached image, skipping it when it's nowhere near the screen.
  const place = (s: Sprite, anchor: Pt) => {
    const x = anchor.x - cam.x - s.ox;
    const y = anchor.y - cam.y - s.oy;
    if (x > VIEW.w || y > VIEW.h || x + s.canvas.width < 0 || y + s.canvas.height < 0) return;
    ctx.drawImage(s.canvas, x, y);
  };
  houses.forEach((h) => {
    const depth = h.x + h.w + h.y + h.d - 1;
    const anchor = iso(h.x + h.w / 2, h.y + h.d / 2);
    items.push({ depth, draw: () => place(sprite(`house:${h.id}`, BOX.house, anchor, (c, a) => drawHouse(c, h, a)), anchor) });
    // The client waits on the porch until their quest is done, then waves from it.
    const look = opts.looks[h.id];
    if (look) {
      // On the porch: just outside the front wall, beside the doorway, so they don't stand where the player knocks.
      const p = h.doorFace === "x" ? at(h.door.x + 0.2, h.door.y + 0.18) : at(h.door.x + 0.18, h.door.y + 0.2);
      const done = opts.done.has(h.id);
      items.push({ depth: depth + 0.05, draw: () => drawPerson(ctx, p.x, p.y, { ...look, flip: h.doorFace === "y", wave: done && Math.floor(opts.time * 2) % 2 === 0 }) });
    }
  });
  things.forEach((t) => {
    const anchor = iso(t.x + 0.5, t.y + 0.5);
    const key = `${t.kind}:${t.x},${t.y}${t.kind === "fence" ? t.side : ""}${t.kind === "gate" && opts.unlocked ? ":open" : ""}`;
    items.push({
      depth: t.kind === "fence" ? t.x + t.y + 1.9 : t.kind === "van" ? t.x + t.y + 2.4 : t.x + t.y + 1,
      draw: () => place(sprite(key, boxOf(t), anchor, (c, a) => drawThing(c, t, a, opts.unlocked)), anchor),
    });
  });
  outside.forEach((t) => {
    const anchor = iso(t.x + 0.5, t.y + 0.5);
    const paint = (c: Ctx, a: (x: number, y: number) => Pt) => (t.kind === "tree" ? drawTree(c, t, a) : drawBush(c, t.x, t.y, a));
    items.push({ depth: t.x + t.y + 1, draw: () => place(sprite(`out:${t.x},${t.y}`, t.kind === "tree" ? BOX.tree : BOX.bush, anchor, paint), anchor) });
  });
  const p = opts.player;
  const pp = at(p.x, p.y);
  items.push({ depth: p.x + p.y + 0.06, draw: () => drawPerson(ctx, pp.x, pp.y, { ...PLAYER, flip: p.facing === "left", walking: p.walking, t: p.t, backpack: true }) });
  items.sort((a, b) => a.depth - b.depth).forEach((i) => i.draw());
}

/** A screen position (canvas pixels, after the camera) for laying markers and labels over the canvas. */
export function screenOf(cam: Cam, x: number, y: number, lift = 0): Pt {
  const p = iso(x, y);
  return { x: p.x - cam.x, y: p.y - cam.y - lift };
}
/** Above the middle of a house's roof. */
export const roofTop = (cam: Cam, h: House) => screenOf(cam, h.x + h.w / 2, h.y + h.d / 2, WALL + ROOF + 18);

/** The camera centred on a point, kept within the street. */
export function cameraFor(x: number, y: number): Cam {
  const p = iso(x, y);
  return {
    x: Math.max(CAM_BOUNDS.x0, Math.min(CAM_BOUNDS.x1, p.x - VIEW.w / 2)),
    y: Math.max(CAM_BOUNDS.y0, Math.min(CAM_BOUNDS.y1, p.y - VIEW.h / 2 - 20)),
  };
}

/** A small overhead map: houses, paths, road and where the player is. */
export function drawMinimap(ctx: Ctx, size: number, player: PlayerState, done: Set<string>) {
  const s = size / N;
  ctx.clearRect(0, 0, size, size);
  for (let x = 0; x < N; x++)
    for (let y = 0; y < N; y++) {
      const t = MAP[x][y];
      ctx.fillStyle = t === "grass" || t === "verge" ? "#5aa64c" : t === "path" ? "#e6dcc5" : t === "road" ? "#565c66" : "#a36b45";
      ctx.fillRect(x * s, y * s, s + 0.5, s + 0.5);
    }
  houses.forEach((h) => {
    ctx.fillStyle = !h.quest ? "#c9c0ad" : done.has(h.id) ? "#7cc865" : "#f2b66d";
    ctx.fillRect(h.x * s + 1, h.y * s + 1, h.w * s - 2, h.d * s - 2);
  });
  ctx.fillStyle = "#1e88e5";
  ctx.beginPath();
  ctx.arc(player.x * s, player.y * s, Math.max(3, s * 0.5), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();
}
