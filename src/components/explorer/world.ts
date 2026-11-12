/*
  The Neighbourhood Explorer world: a 12 by 12 isometric suburb, drawn small on a canvas and
  scaled up with crisp pixels for the 16-bit look. Houses, gardens, footpaths, trees, a park bench,
  mailboxes and a van, and the player walking between them.

  World coordinates: x runs down-right on screen, y runs down-left. Tile (i, j) covers [i, i+1] by
  [j, j+1]; a character standing on it is at its centre (i + 0.5, j + 0.5).
*/

export const N = 12;
/** The canvas is drawn at this size, then scaled up with pixelated rendering. */
export const VIEW = { w: 480, h: 300 } as const;
const HALF_W = 18;
const HALF_H = 9;
const ORIGIN = { x: 240, y: 62 };
const WALL = 24;
const ROOF = 16;

export const iso = (x: number, y: number) => ({ x: ORIGIN.x + (x - y) * HALF_W, y: ORIGIN.y + (x + y) * HALF_H });
export const toWorld = (sx: number, sy: number) => {
  const a = (sx - ORIGIN.x) / HALF_W;
  const b = (sy - ORIGIN.y) / HALF_H;
  return { x: (a + b) / 2, y: (b - a) / 2 };
};

export type Tile = { x: number; y: number };
export type House = {
  /** The quest inside. */
  id: string;
  x: number;
  y: number;
  w: number;
  d: number;
  /** The face the front door is on: "x" faces down-right, "y" faces down-left. */
  doorFace: "x" | "y";
  /** The tile you stand on to knock. */
  door: Tile;
  wall: string;
  wallShade: string;
  roof: string;
  roofShade: string;
  door_colour: string;
};

export const houses: House[] = [
  {
    id: "dot",
    x: 2,
    y: 2,
    w: 3,
    d: 2,
    doorFace: "x",
    door: { x: 5, y: 3 },
    wall: "#f6e4c6",
    wallShade: "#dcc49e",
    roof: "#5f6f92",
    roofShade: "#46526e",
    door_colour: "#8a4b2c",
  },
  {
    id: "ron",
    x: 7,
    y: 1,
    w: 3,
    d: 2,
    doorFace: "y",
    door: { x: 8, y: 3 },
    wall: "#f2d9bd",
    wallShade: "#d6b993",
    roof: "#a65a4f",
    roofShade: "#7f4038",
    door_colour: "#2f5f4a",
  },
  {
    id: "margaret",
    x: 1,
    y: 7,
    w: 3,
    d: 2,
    doorFace: "x",
    door: { x: 4, y: 8 },
    wall: "#eef0e4",
    wallShade: "#cfd2c2",
    roof: "#4f6b7a",
    roofShade: "#3a515e",
    door_colour: "#a8323e",
  },
  {
    id: "ken",
    x: 7,
    y: 7,
    w: 3,
    d: 2,
    doorFace: "y",
    door: { x: 8, y: 9 },
    wall: "#f3dcc0",
    wallShade: "#d4b68f",
    roof: "#8c5a8a",
    roofShade: "#6a4168",
    door_colour: "#334b78",
  },
];

/** The gate to the next neighbourhood, at the end of the cross street. Locked for now. */
export const gate: Tile = { x: 0, y: 6 };

type Ground = "grass" | "path" | "road" | "bed";
type Thing =
  | { kind: "tree"; x: number; y: number; purple?: boolean; big?: boolean }
  | { kind: "bench"; x: number; y: number }
  | { kind: "mailbox"; x: number; y: number }
  | { kind: "sign"; x: number; y: number }
  | { kind: "gate"; x: number; y: number }
  | { kind: "van"; x: number; y: number }
  | { kind: "fence"; x: number; y: number };

/** The ground, tile by tile. */
export const ground: Ground[][] = (() => {
  const g: Ground[][] = Array.from({ length: N }, () => Array.from({ length: N }, () => "grass" as Ground));
  const set = (x: number, y: number, t: Ground) => {
    if (x >= 0 && y >= 0 && x < N && y < N) g[x][y] = t;
  };
  for (let y = 0; y < N; y++) {
    set(10, y, "road");
    set(11, y, "road");
    set(6, y, "path");
  }
  for (let x = 0; x < 10; x++) set(x, 6, "path");
  // Front paths to each door.
  [
    [5, 3],
    [8, 3],
    [7, 3],
    [4, 8],
    [5, 8],
    [8, 9],
    [7, 9],
  ].forEach(([x, y]) => set(x, y, "path"));
  // Front gardens.
  [
    [2, 4],
    [3, 4],
    [4, 4],
    [5, 2],
    [9, 3],
    [4, 7],
    [1, 9],
    [2, 9],
    [3, 9],
    [9, 9],
  ].forEach(([x, y]) => set(x, y, "bed"));
  return g;
})();

export const things: Thing[] = [
  { kind: "tree", x: 5, y: 0, purple: true, big: true },
  { kind: "tree", x: 0, y: 1, big: true },
  { kind: "tree", x: 0, y: 4 },
  { kind: "tree", x: 3, y: 5 },
  { kind: "tree", x: 9, y: 5 },
  { kind: "tree", x: 8, y: 5 },
  { kind: "tree", x: 0, y: 10, big: true },
  { kind: "tree", x: 3, y: 11 },
  { kind: "tree", x: 9, y: 11 },
  { kind: "tree", x: 2, y: 0 },
  { kind: "bench", x: 1, y: 5 },
  { kind: "mailbox", x: 5, y: 4 },
  { kind: "mailbox", x: 9, y: 4 },
  { kind: "mailbox", x: 5, y: 9 },
  { kind: "mailbox", x: 9, y: 10 },
  { kind: "sign", x: 5, y: 11 },
  { kind: "gate", x: gate.x, y: gate.y },
  { kind: "van", x: 10, y: 4 },
  ...[2, 3, 4].map((x) => ({ kind: "fence" as const, x, y: 4 })),
  ...[1, 2, 3].map((x) => ({ kind: "fence" as const, x, y: 9 })),
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
    if (t.kind === "van") b.add(`${t.x + 1},${t.y}`);
  });
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if (ground[x][y] === "bed") b.add(`${x},${y}`);
  return b;
})();

export const walkable = (t: Tile) => t.x >= 0 && t.y >= 0 && t.x < N && t.y < N && !blocked.has(`${t.x},${t.y}`);

/** The shortest walk from one tile to another (four directions), not counting the start. Empty if there's no way. */
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

/* Drawing */

type Ctx = CanvasRenderingContext2D;

const hash = (x: number, y: number, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function poly(ctx: Ctx, pts: { x: number; y: number }[], fill: string, stroke?: string) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(Math.round(p.x), Math.round(p.y)) : ctx.moveTo(Math.round(p.x), Math.round(p.y))));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

const up = (p: { x: number; y: number }, h: number) => ({ x: p.x, y: p.y - h });
const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function tileDiamond(x: number, y: number) {
  return [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)];
}

function drawGround(ctx: Ctx) {
  for (let x = 0; x < N; x++)
    for (let y = 0; y < N; y++) {
      const t = ground[x][y];
      const n = hash(x, y);
      const fill =
        t === "grass" ? (n > 0.5 ? "#6cbf58" : "#63b450") : t === "path" ? (n > 0.5 ? "#e2d6bd" : "#d9ccb1") : t === "road" ? "#50565f" : "#7a5236";
      poly(ctx, tileDiamond(x, y), fill);
      const c = iso(x + 0.5, y + 0.5);
      if (t === "grass") {
        // Tufts.
        for (let k = 0; k < 4; k++) {
          const px = Math.round(c.x + (hash(x, y, k) - 0.5) * 18);
          const py = Math.round(c.y + (hash(x, y, k + 9) - 0.5) * 8);
          ctx.fillStyle = k % 2 ? "#4f9c40" : "#86d06c";
          ctx.fillRect(px, py, 1, 2);
        }
      } else if (t === "path") {
        ctx.fillStyle = "rgba(0,0,0,0.06)";
        ctx.fillRect(Math.round(c.x - 6 + n * 8), Math.round(c.y - 1), 3, 1);
      } else if (t === "road") {
        // Lane marks down the middle of the road.
        if (x === 10) {
          const a = iso(11, y + 0.25);
          const b = iso(11, y + 0.75);
          ctx.strokeStyle = "#f2f2f2";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(a.x), Math.round(a.y));
          ctx.lineTo(Math.round(b.x), Math.round(b.y));
          ctx.stroke();
        }
      } else if (t === "bed") {
        // Flowers.
        const colours = ["#ff6b8b", "#ffd166", "#f7f7f7", "#c77dff", "#ff8c42", "#7bdff2"];
        for (let k = 0; k < 9; k++) {
          const px = Math.round(c.x + (hash(x, y, k) - 0.5) * 22);
          const py = Math.round(c.y + (hash(x, y, k + 20) - 0.5) * 9);
          ctx.fillStyle = "#3f8a3a";
          ctx.fillRect(px, py, 2, 2);
          ctx.fillStyle = colours[Math.floor(hash(x, y, k + 40) * colours.length)];
          ctx.fillRect(px, py - 1, 2, 1);
        }
      }
    }
  // A kerb along the road.
  for (let y = 0; y < N; y++) {
    const a = iso(10, y);
    const b = iso(10, y + 1);
    ctx.strokeStyle = "#b9bec6";
    ctx.beginPath();
    ctx.moveTo(Math.round(a.x), Math.round(a.y));
    ctx.lineTo(Math.round(b.x), Math.round(b.y));
    ctx.stroke();
  }
}

/** A point on a wall face, `t` of the way along its base and `h` up. */
const onFace = (a: { x: number; y: number }, b: { x: number; y: number }, t: number, h: number) => up(lerp(a, b, t), h);

function windowOn(ctx: Ctx, a: { x: number; y: number }, b: { x: number; y: number }, t0: number, t1: number) {
  const q = [onFace(a, b, t0, 7), onFace(a, b, t1, 7), onFace(a, b, t1, 15), onFace(a, b, t0, 15)];
  poly(ctx, q, "#ffffff");
  const inner = [onFace(a, b, t0 + 0.02, 8), onFace(a, b, t1 - 0.02, 8), onFace(a, b, t1 - 0.02, 14), onFace(a, b, t0 + 0.02, 14)];
  poly(ctx, inner, "#9fd6ea");
  const m = onFace(a, b, (t0 + t1) / 2, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(Math.round(m.x), Math.round(m.y - 6), 1, 6);
}

function drawHouse(ctx: Ctx, h: House) {
  const B = iso(h.x + h.w, h.y);
  const C = iso(h.x + h.w, h.y + h.d);
  const D = iso(h.x, h.y + h.d);
  // Shadow.
  poly(ctx, [D, C, { x: C.x + 6, y: C.y + 2 }, { x: D.x + 6, y: D.y + 4 }], "rgba(0,0,0,0.14)");
  // Walls: the down-left face (y) is in shade, the down-right face (x) in sun.
  poly(ctx, [D, C, up(C, WALL), up(D, WALL)], h.wallShade);
  poly(ctx, [B, C, up(C, WALL), up(B, WALL)], h.wall);
  // Skirting.
  poly(ctx, [D, C, up(C, 2), up(D, 2)], "rgba(0,0,0,0.12)");
  poly(ctx, [B, C, up(C, 2), up(B, 2)], "rgba(0,0,0,0.08)");
  // Windows and the front door.
  windowOn(ctx, D, C, 0.12, 0.34);
  windowOn(ctx, B, C, 0.1, 0.32);
  const [fa, fb, len] = h.doorFace === "x" ? [B, C, h.d] : [D, C, h.w];
  const along = h.doorFace === "x" ? h.door.y - h.y : h.door.x - h.x;
  const t0 = (along + 0.3) / len;
  const t1 = (along + 0.7) / len;
  if (h.doorFace === "y") windowOn(ctx, D, C, Math.min(0.9, t1 + 0.08), Math.min(0.97, t1 + 0.28));
  else windowOn(ctx, B, C, Math.min(0.62, t0 - 0.3), Math.min(0.84, t0 - 0.08));
  poly(ctx, [onFace(fa, fb, t0, 0), onFace(fa, fb, t1, 0), onFace(fa, fb, t1, 15), onFace(fa, fb, t0, 15)], h.door_colour);
  const knob = onFace(fa, fb, t1 - 0.06, 7);
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(Math.round(knob.x), Math.round(knob.y), 1, 1);
  // A little porch roof over the door.
  poly(ctx, [onFace(fa, fb, t0 - 0.05, 17), onFace(fa, fb, t1 + 0.05, 17), onFace(fa, fb, t1 + 0.05, 19), onFace(fa, fb, t0 - 0.05, 19)], "#ffffff");

  // Hip roof, ridge along the longer side, with a small overhang.
  const o = 0.12;
  const a = up(iso(h.x - o, h.y - o), WALL);
  const b = up(iso(h.x + h.w + o, h.y - o), WALL);
  const c = up(iso(h.x + h.w + o, h.y + h.d + o), WALL);
  const d = up(iso(h.x - o, h.y + h.d + o), WALL);
  if (h.w >= h.d) {
    const r1 = up(iso(h.x + h.d / 2, h.y + h.d / 2), WALL + ROOF);
    const r2 = up(iso(h.x + h.w - h.d / 2, h.y + h.d / 2), WALL + ROOF);
    poly(ctx, [a, b, r2, r1], h.roofShade);
    poly(ctx, [a, d, r1], h.roofShade);
    poly(ctx, [d, c, r2, r1], h.roofShade);
    poly(ctx, [b, c, r2], h.roof);
    // Tile lines on the front slope.
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    for (let k = 1; k < 4; k++) {
      const p = lerp(d, r1, k / 4);
      const q = lerp(c, r2, k / 4);
      ctx.beginPath();
      ctx.moveTo(Math.round(p.x), Math.round(p.y));
      ctx.lineTo(Math.round(q.x), Math.round(q.y));
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(Math.round(r1.x), Math.round(r1.y));
    ctx.lineTo(Math.round(r2.x), Math.round(r2.y));
    ctx.stroke();
  } else {
    const r1 = up(iso(h.x + h.w / 2, h.y + h.w / 2), WALL + ROOF);
    const r2 = up(iso(h.x + h.w / 2, h.y + h.d - h.w / 2), WALL + ROOF);
    poly(ctx, [a, d, r2, r1], h.roofShade);
    poly(ctx, [a, b, r1], h.roofShade);
    poly(ctx, [b, c, r2, r1], h.roof);
    poly(ctx, [d, c, r2], h.roofShade);
  }
  // Chimney.
  const ch = up(iso(h.x + h.w * 0.75, h.y + h.d * 0.35), WALL + ROOF - 4);
  ctx.fillStyle = "#8c6a5a";
  ctx.fillRect(Math.round(ch.x), Math.round(ch.y - 6), 4, 7);
  ctx.fillStyle = "#6e5244";
  ctx.fillRect(Math.round(ch.x), Math.round(ch.y - 7), 4, 1);
}

function blob(ctx: Ctx, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
  ctx.fill();
}

function drawTree(ctx: Ctx, t: { x: number; y: number; purple?: boolean; big?: boolean }) {
  const c = iso(t.x + 0.5, t.y + 0.5);
  const s = t.big ? 1.25 : 1;
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(Math.round(c.x + 3), Math.round(c.y), 11 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7a5a3c";
  ctx.fillRect(Math.round(c.x - 1), Math.round(c.y - 14 * s), 3, Math.round(14 * s));
  const [dark, mid, light] = t.purple ? ["#7b5cc4", "#9a7be0", "#c3a9f5"] : ["#3f8a3a", "#56a84a", "#7cc865"];
  const top = c.y - 18 * s;
  blob(ctx, c.x - 6 * s, top + 4, 7 * s, dark);
  blob(ctx, c.x + 6 * s, top + 4, 7 * s, dark);
  blob(ctx, c.x, top - 2, 9 * s, mid);
  blob(ctx, c.x - 4 * s, top + 2, 6 * s, mid);
  blob(ctx, c.x + 4 * s, top + 1, 6 * s, mid);
  blob(ctx, c.x - 2 * s, top - 4 * s, 4 * s, light);
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = light;
    ctx.fillRect(Math.round(c.x + (hash(t.x, t.y, k) - 0.5) * 16 * s), Math.round(top + (hash(t.x, t.y, k + 5) - 0.5) * 12 * s), 1, 1);
  }
}

function drawFence(ctx: Ctx, x: number, y: number) {
  // White pickets along the tile's down-left edge.
  const a = iso(x, y + 1);
  const b = iso(x + 1, y + 1);
  for (let k = 0; k <= 4; k++) {
    const p = lerp(a, b, k / 4);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(Math.round(p.x), Math.round(p.y - 6), 1, 6);
  }
  ctx.strokeStyle = "#f4f4f4";
  ctx.beginPath();
  ctx.moveTo(Math.round(a.x), Math.round(a.y - 4));
  ctx.lineTo(Math.round(b.x), Math.round(b.y - 4));
  ctx.stroke();
}

function drawThing(ctx: Ctx, t: Thing, unlocked: boolean) {
  const c = iso(t.x + 0.5, t.y + 0.5);
  switch (t.kind) {
    case "tree":
      return drawTree(ctx, t);
    case "fence":
      return drawFence(ctx, t.x, t.y);
    case "bench":
      ctx.fillStyle = "#8a5a32";
      ctx.fillRect(Math.round(c.x - 7), Math.round(c.y - 5), 14, 2);
      ctx.fillRect(Math.round(c.x - 7), Math.round(c.y - 9), 14, 2);
      ctx.fillStyle = "#4a3a2a";
      ctx.fillRect(Math.round(c.x - 6), Math.round(c.y - 3), 1, 3);
      ctx.fillRect(Math.round(c.x + 5), Math.round(c.y - 3), 1, 3);
      return;
    case "mailbox":
      ctx.fillStyle = "#5a4a3a";
      ctx.fillRect(Math.round(c.x + 4), Math.round(c.y - 6), 1, 6);
      ctx.fillStyle = "#d64545";
      ctx.fillRect(Math.round(c.x + 2), Math.round(c.y - 10), 5, 4);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(Math.round(c.x + 3), Math.round(c.y - 9), 3, 1);
      return;
    case "sign":
      ctx.fillStyle = "#6e4a2c";
      ctx.fillRect(Math.round(c.x - 9), Math.round(c.y - 8), 2, 8);
      ctx.fillRect(Math.round(c.x + 8), Math.round(c.y - 8), 2, 8);
      ctx.fillStyle = "#c98f55";
      ctx.fillRect(Math.round(c.x - 12), Math.round(c.y - 18), 25, 11);
      ctx.fillStyle = "#e6b47c";
      ctx.fillRect(Math.round(c.x - 11), Math.round(c.y - 17), 23, 2);
      ctx.fillStyle = "#6e4a2c";
      for (let k = 0; k < 3; k++) ctx.fillRect(Math.round(c.x - 8), Math.round(c.y - 14 + k * 2), 16 - k * 4, 1);
      return;
    case "gate":
      ctx.fillStyle = "#6e4a2c";
      ctx.fillRect(Math.round(c.x - 10), Math.round(c.y - 20), 3, 20);
      ctx.fillRect(Math.round(c.x + 8), Math.round(c.y - 20), 3, 20);
      ctx.fillRect(Math.round(c.x - 11), Math.round(c.y - 22), 23, 3);
      ctx.fillStyle = unlocked ? "#7cc865" : "#cfd3d8";
      for (let k = 0; k < 5; k++) ctx.fillRect(Math.round(c.x - 6 + k * 3), Math.round(c.y - 16), 1, 14);
      if (!unlocked) {
        ctx.fillStyle = "#ffd166";
        ctx.fillRect(Math.round(c.x - 2), Math.round(c.y - 10), 5, 4);
        ctx.strokeStyle = "#ffd166";
        ctx.strokeRect(Math.round(c.x - 1) + 0.5, Math.round(c.y - 13) + 0.5, 2, 3);
      }
      return;
    case "van": {
      const base = iso(t.x + 1, t.y + 0.5);
      poly(ctx, [{ x: base.x - 20, y: base.y + 2 }, { x: base.x + 16, y: base.y - 6 }, { x: base.x + 22, y: base.y - 3 }, { x: base.x - 14, y: base.y + 5 }], "rgba(0,0,0,0.2)");
      // Body.
      poly(
        ctx,
        [
          { x: base.x - 18, y: base.y - 1 },
          { x: base.x + 14, y: base.y - 9 },
          { x: base.x + 14, y: base.y - 21 },
          { x: base.x - 18, y: base.y - 13 },
        ],
        "#f4f6f8",
      );
      poly(
        ctx,
        [
          { x: base.x + 14, y: base.y - 9 },
          { x: base.x + 20, y: base.y - 6 },
          { x: base.x + 20, y: base.y - 16 },
          { x: base.x + 14, y: base.y - 21 },
        ],
        "#d9dde2",
      );
      poly(
        ctx,
        [
          { x: base.x - 18, y: base.y - 13 },
          { x: base.x + 14, y: base.y - 21 },
          { x: base.x + 20, y: base.y - 16 },
          { x: base.x - 12, y: base.y - 9 },
        ],
        "#ffffff",
      );
      // Windows and a teal stripe.
      poly(
        ctx,
        [
          { x: base.x + 15, y: base.y - 12 },
          { x: base.x + 19, y: base.y - 10 },
          { x: base.x + 19, y: base.y - 15 },
          { x: base.x + 15, y: base.y - 18 },
        ],
        "#6f8796",
      );
      for (let k = 0; k < 3; k++)
        poly(
          ctx,
          [
            { x: base.x - 14 + k * 9, y: base.y - 9 - k * 2 },
            { x: base.x - 8 + k * 9, y: base.y - 11 - k * 2 },
            { x: base.x - 8 + k * 9, y: base.y - 15 - k * 2 },
            { x: base.x - 14 + k * 9, y: base.y - 13 - k * 2 },
          ],
          "#8aa5b5",
        );
      poly(
        ctx,
        [
          { x: base.x - 18, y: base.y - 4 },
          { x: base.x + 14, y: base.y - 12 },
          { x: base.x + 14, y: base.y - 10 },
          { x: base.x - 18, y: base.y - 2 },
        ],
        "#0e7c7b",
      );
      ctx.fillStyle = "#222";
      blob(ctx, base.x - 11, base.y - 1, 2.5, "#2b2b2b");
      blob(ctx, base.x + 8, base.y - 6, 2.5, "#2b2b2b");
      return;
    }
  }
}

/* Characters, as tiny pixel sprites. */

const PLAYER = [
  "....hhh.....",
  "...hhhhh....",
  "..hhhhhhh...",
  "..hhsssshh..",
  "..hsesesh.h.",
  "...sssss..h.",
  "....sss.....",
  "..ccccccb...",
  ".sccccccbb..",
  ".sccccccbb..",
  ".sccccccbb..",
  "..pppppp....",
  "..pp..pp....",
  "..pp..pp....",
  "..oo..oo....",
];
const PLAYER_STEP = [
  "....hhh.....",
  "...hhhhh....",
  "..hhhhhhh...",
  "..hhsssshh..",
  "..hsesesh.h.",
  "...sssss..h.",
  "....sss.....",
  "..ccccccb...",
  ".sccccccbb..",
  ".sccccccbb..",
  "..ccccccsb..",
  "..pppppp....",
  "..pp...pp...",
  ".pp....pp...",
  ".oo.....oo..",
];
const PLAYER_COLOURS: Record<string, string> = {
  h: "#5b3a24",
  s: "#f0c3a0",
  e: "#2b2b2b",
  c: "#1e3a5c",
  b: "#2f7fbf",
  p: "#2b3a52",
  o: "#3a2a1e",
};

function drawSprite(ctx: Ctx, rows: string[], colours: Record<string, string>, x: number, y: number, flip: boolean) {
  const w = rows[0].length;
  rows.forEach((row, r) => {
    for (let i = 0; i < w; i++) {
      const ch = row[flip ? w - 1 - i : i];
      if (ch === ".") continue;
      ctx.fillStyle = colours[ch];
      ctx.fillRect(Math.round(x + i), Math.round(y + r), 1, 1);
    }
  });
}

export type PlayerState = { x: number; y: number; facing: "left" | "right"; walking: boolean; t: number };

function drawPlayer(ctx: Ctx, p: PlayerState) {
  const c = iso(p.x, p.y);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  ctx.ellipse(Math.round(c.x), Math.round(c.y), 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  const frame = p.walking && Math.floor(p.t * 8) % 2 === 1 ? PLAYER_STEP : PLAYER;
  const bob = p.walking && Math.floor(p.t * 8) % 2 === 1 ? -1 : 0;
  drawSprite(ctx, frame, PLAYER_COLOURS, c.x - 6, c.y - 15 + bob, p.facing === "left");
}

/** Everything in the world, back to front. `route` dots show where the player is heading. */
export function drawWorld(ctx: Ctx, opts: { player: PlayerState; route: Tile[]; hover: Tile | null; unlocked: boolean }) {
  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  // Sky-ish backdrop beyond the edge of the map.
  ctx.fillStyle = "#4f9a43";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  for (let k = 0; k < 140; k++) {
    ctx.fillStyle = k % 3 ? "#468c3b" : "#5aa64c";
    ctx.fillRect(Math.floor(hash(k, 1) * VIEW.w), Math.floor(hash(k, 2) * VIEW.h), 2, 1);
  }
  drawGround(ctx);

  if (opts.hover) {
    poly(ctx, tileDiamond(opts.hover.x, opts.hover.y), "rgba(255,255,255,0.18)", "rgba(255,255,255,0.7)");
  }
  // Footsteps to where the player is going.
  opts.route.forEach((t, i) => {
    const c = iso(t.x + 0.5, t.y + 0.5);
    ctx.fillStyle = i === opts.route.length - 1 ? "#ffffff" : "rgba(255,255,255,0.75)";
    ctx.fillRect(Math.round(c.x - 1), Math.round(c.y - 1), 3, 2);
  });

  type Item = { depth: number; draw: () => void };
  const items: Item[] = [];
  houses.forEach((h) => items.push({ depth: h.x + h.w + h.y + h.d - 1, draw: () => drawHouse(ctx, h) }));
  things.forEach((t) =>
    items.push({
      depth: t.kind === "fence" ? t.x + t.y + 1.9 : t.kind === "van" ? t.x + t.y + 1.8 : t.x + t.y + 1,
      draw: () => drawThing(ctx, t, opts.unlocked),
    }),
  );
  items.push({ depth: opts.player.x + opts.player.y + 0.05, draw: () => drawPlayer(ctx, opts.player) });
  items.sort((a, b) => a.depth - b.depth).forEach((i) => i.draw());
}

/** Where a house's marker sits, as a fraction of the canvas: above the middle of its roof. */
export function markerSpot(h: House) {
  const p = up(iso(h.x + h.w / 2, h.y + h.d / 2), WALL + ROOF + 10);
  return { left: p.x / VIEW.w, top: p.y / VIEW.h };
}

/** Where a thing sits on the canvas, as a fraction, for labels over it. */
export function spot(t: Tile, lift = 0) {
  const p = iso(t.x + 0.5, t.y + 0.5);
  return { left: p.x / VIEW.w, top: (p.y - lift) / VIEW.h };
}

/** A small overhead map: houses, paths, road and where the player is. */
export function drawMinimap(ctx: Ctx, size: number, player: PlayerState, done: Set<string>) {
  const s = size / N;
  ctx.clearRect(0, 0, size, size);
  for (let x = 0; x < N; x++)
    for (let y = 0; y < N; y++) {
      const t = ground[x][y];
      ctx.fillStyle = t === "grass" ? "#5aa64c" : t === "path" ? "#e2d6bd" : t === "road" ? "#50565f" : "#a36b45";
      ctx.fillRect(x * s, y * s, s + 0.5, s + 0.5);
    }
  houses.forEach((h) => {
    ctx.fillStyle = done.has(h.id) ? "#7cc865" : "#f2b66d";
    ctx.fillRect(h.x * s + 1, h.y * s + 1, h.w * s - 2, h.d * s - 2);
  });
  ctx.fillStyle = "#1e88e5";
  ctx.beginPath();
  ctx.arc(player.x * s, player.y * s, Math.max(2.5, s * 0.45), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
