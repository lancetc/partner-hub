/*
  Pixel effects for the Neighbourhood Explorer, from pixelfx (github:patch-gg/pixelfx, MIT).
  Ambient effects stay put in the world (jacaranda petals, falling leaves, a bird) or on the
  screen (sun rays); one-shots celebrate (coins for points, quest complete, level up). They're drawn
  into their own pixel frame, then laid over the street.
*/

import { clearFrame, composite, createFrame, createFx, type Fx, type FxModule } from "pixelfx";
import * as petals from "pixelfx/fx/weather/cherry-blossoms";
import * as leaves from "pixelfx/fx/weather/falling-leaves";
import * as rays from "pixelfx/fx/weather/god-rays";
import * as bird from "pixelfx/fx/critters/bird";
import * as questComplete from "pixelfx/fx/ui/quest-complete";
import * as coins from "pixelfx/fx/ui/coin-collect";
import * as levelUp from "pixelfx/fx/ui/level-up";
import * as achievement from "pixelfx/fx/ui/achievement";
import { iso, VIEW, type Cam } from "./world";

const JACARANDA = ["#2a1a4a", "#4a2f80", "#7b5cc4", "#9a7be0", "#c3a9f5", "#f1e8ff"];
const GUM_LEAVES = ["#2e3d22", "#4f6a3c", "#6b8a52", "#8aa86e", "#b2c890", "#e4efcf"];

type Placed = { fx: Fx; world?: { x: number; y: number; lift: number }; screen?: { x: number; y: number } };

export class Effects {
  private frame = createFrame(VIEW.w, VIEW.h);
  private image: ImageData;
  private layer: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private ambient: Placed[] = [];
  private bursts: Placed[] = [];
  /** Small butterflies flitting over the gardens, drawn here at the street's own scale (pixelfx's are much bigger). */
  private butterflies: Butterfly[] = [];
  private time = 0;

  constructor(private reducedMotion: boolean) {
    this.layer = document.createElement("canvas");
    this.layer.width = VIEW.w;
    this.layer.height = VIEW.h;
    this.lctx = this.layer.getContext("2d")!;
    this.image = this.lctx.createImageData(VIEW.w, VIEW.h);
    if (reducedMotion) return;
    // Petals drifting down from the big jacaranda, leaves from the gums, butterflies over the gardens,
    // a bird crossing high up, and soft sun rays across the screen.
    this.ambient = [
      { fx: createFx(petals as FxModule, { palette: JACARANDA, seed: 4 }), world: { x: 7.5, y: 0.5, lift: -10 } },
      // One gum dropping leaves is plenty; more filled the screen.
      { fx: createFx(leaves as FxModule, { palette: GUM_LEAVES, seed: 3 }), world: { x: 0.5, y: 0.5, lift: -10 } },
      { fx: createFx(bird as FxModule, { seed: 3 }), world: { x: 5, y: 1, lift: 120 } },
      { fx: createFx(rays as FxModule, { seed: 3, light: 0.35 }), screen: { x: 150, y: 220 } },
    ];
    this.butterflies = [
      { x: 3.5, y: 6, phase: 0, wing: "#3cb8b9", light: "#a8e6e6" },
      { x: 12, y: 10.5, phase: 2.1, wing: "#fab53d", light: "#ffe2a6" },
      { x: 9.5, y: 7.5, phase: 4.2, wing: "#ffffff", light: "#fff4bc" },
    ];
  }

  /** Points: coins burst from a house and fly up into a counter. */
  coins(x: number, y: number, count: number) {
    this.burst(createFx(coins as FxModule, { count: Math.max(3, Math.min(12, Math.round(count / 15))), seed: 4 }), { world: { x, y, lift: 70 } });
  }
  questComplete() {
    this.burst(createFx(questComplete as FxModule, { seed: 8 }), { screen: { x: VIEW.w / 2, y: VIEW.h / 2 - 40 } });
  }
  levelUp(level: number) {
    this.burst(createFx(levelUp as FxModule, { text: `LEVEL ${level}!`, seed: 5 }), { screen: { x: VIEW.w / 2, y: VIEW.h / 2 + 40 } });
  }
  badge() {
    this.burst(createFx(achievement as FxModule, { text: "NEW BADGE", seed: 2 }), { screen: { x: VIEW.w / 2, y: 70 } });
  }

  private burst(fx: Fx, where: Omit<Placed, "fx">) {
    // Celebrations play even with reduced motion, but only one at a time there.
    if (this.reducedMotion) this.bursts = [];
    this.bursts.push({ fx, ...where });
  }

  /** Steps every effect on, then draws them over the street. */
  draw(ctx: CanvasRenderingContext2D, cam: Cam, dt: number) {
    this.time += dt;
    if (!this.ambient.length && !this.bursts.length) return;
    clearFrame(this.frame);
    const place = (p: Placed) => {
      if (p.world) {
        const s = iso(p.world.x, p.world.y);
        p.fx.options.x = Math.round(s.x - cam.x);
        p.fx.options.y = Math.round(s.y - cam.y - p.world.lift);
      } else if (p.screen) {
        p.fx.options.x = p.screen.x;
        p.fx.options.y = p.screen.y;
      }
      p.fx.update(dt);
      p.fx.draw(this.frame, "front");
    };
    this.ambient.forEach(place);
    this.bursts.forEach(place);
    this.bursts = this.bursts.filter((b) => !b.fx.done());
    composite(this.frame, this.image.data, null, 1);
    this.lctx.putImageData(this.image, 0, 0);
    ctx.drawImage(this.layer, 0, 0);
    for (const b of this.butterflies) drawButterfly(ctx, b, cam, this.time);
  }
}

type Butterfly = { x: number; y: number; phase: number; wing: string; light: string };

/** A butterfly about 9 px across, wandering a loop above its garden with quick wingbeats. */
function drawButterfly(ctx: CanvasRenderingContext2D, b: Butterfly, cam: Cam, time: number) {
  const a = time * 0.9 + b.phase;
  const home = iso(b.x, b.y);
  const x = Math.round(home.x - cam.x + 26 * Math.sin(a) + 6 * Math.sin(3 * a));
  const y = Math.round(home.y - cam.y - 22 + 10 * Math.sin(2 * a + 0.4) + 2 * Math.sin(time * 5 + b.phase));
  if (x < -10 || y < -10 || x > VIEW.w + 10 || y > VIEW.h + 30) return;
  const open = Math.floor(time * 9 + b.phase * 3) % 3 !== 0;
  const dark = "#2a2238";
  const px = (dx: number, dy: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + dx, y + dy, 1, 1);
  };
  // A small shadow on the ground below.
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(x - 2, y + 20, 4, 1);
  for (const s of [-1, 1]) {
    if (open) {
      // Forewing with a dark tip, then the smaller hindwing below it.
      px(s * 1, -2, b.wing);
      px(s * 2, -2, b.wing);
      px(s * 2, -3, b.light);
      px(s * 3, -3, dark);
      px(s * 4, -3, dark);
      px(s * 3, -2, b.light);
      px(s * 4, -2, b.wing);
      px(s * 1, -1, b.wing);
      px(s * 2, -1, b.wing);
      px(s * 3, -1, b.wing);
      px(s * 1, 0, b.wing);
      px(s * 2, 0, b.light);
      px(s * 2, 1, dark);
    } else {
      // Wings up, seen edge-on.
      px(s * 1, -4, dark);
      px(s * 1, -3, b.wing);
      px(s * 1, -2, b.light);
      px(s * 1, -1, b.wing);
    }
  }
  // Body and antennae.
  for (let dy = -2; dy <= 1; dy++) px(0, dy, dark);
  px(-1, -4, dark);
  px(1, -4, dark);
}
