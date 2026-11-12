/*
  Pixel effects for the Neighbourhood Explorer, from pixelfx (github:patch-gg/pixelfx, MIT).
  Ambient effects stay put in the world (jacaranda petals, falling leaves, butterflies) or on the
  screen (sun rays); one-shots celebrate (coins for points, quest complete, level up). They're drawn
  into their own pixel frame, then laid over the street.
*/

import { clearFrame, composite, createFrame, createFx, type Fx, type FxModule } from "pixelfx";
import * as petals from "pixelfx/fx/weather/cherry-blossoms";
import * as leaves from "pixelfx/fx/weather/falling-leaves";
import * as rays from "pixelfx/fx/weather/god-rays";
import * as butterfly from "pixelfx/fx/critters/butterfly";
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
      { fx: createFx(petals as FxModule, { palette: JACARANDA, seed: 9 }), world: { x: 0.5, y: 14.5, lift: -10 } },
      { fx: createFx(leaves as FxModule, { palette: GUM_LEAVES, seed: 3 }), world: { x: 0.5, y: 0.5, lift: -10 } },
      { fx: createFx(leaves as FxModule, { palette: GUM_LEAVES, seed: 6 }), world: { x: 15.5, y: 10.5, lift: -10 } },
      { fx: createFx(butterfly as FxModule, { seed: 2 }), world: { x: 3.5, y: 6, lift: 18 } },
      { fx: createFx(butterfly as FxModule, { seed: 5, palette: ["#2a1405", "#5c3008", "#9a5a0e", "#d48e18", "#f5b92c", "#ffde5e", "#fff4bc"] }), world: { x: 12, y: 10.5, lift: 18 } },
      { fx: createFx(bird as FxModule, { seed: 3 }), world: { x: 5, y: 1, lift: 120 } },
      { fx: createFx(rays as FxModule, { seed: 3, light: 0.35 }), screen: { x: 150, y: 220 } },
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
  }
}
