/*
  Types for pixelfx (github:patch-gg/pixelfx, MIT), which ships plain JavaScript. Only what the
  Neighbourhood Explorer uses: frames, effect instances and compositing.
*/

declare module "pixelfx" {
  export type Frame = { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array };
  export type FxModule = { meta?: { [key: string]: unknown } };
  export type Fx = {
    meta: { [key: string]: unknown };
    /** The effect's options, read on every draw: moving x and y moves the effect. */
    options: { x?: number; y?: number; [key: string]: unknown };
    readonly t: number;
    update(dt: number): void;
    draw(frame: Frame, layer?: "back" | "front"): void;
    stop(): void;
    done(): boolean;
  };
  export function createFrame(w: number, h: number, ox?: number, oy?: number): Frame;
  export function clearFrame(f: Frame): Frame;
  export function createFx(mod: FxModule, o?: { [key: string]: unknown }): Fx;
  export function composite(f: Frame, out: Uint8ClampedArray, bg?: number | Uint32Array | null, lightK?: number): Uint8ClampedArray;
}

declare module "pixelfx/fx/*" {
  export const meta: { [key: string]: unknown };
}
