import "server-only";
import sharp from "sharp";

/*
  Pictures are stored as WebP: turned the right way up (from the camera's orientation tag), no
  larger than MAX_SIDE on their longest side, and compressed. A 4 MB PNG screenshot or AI picture
  usually ends up a few hundred kilobytes, with no visible difference on a card or full screen.
  GIFs are left alone, since they may be animated.
*/

/** Longest side, in pixels: sharp on a large phone or a laptop, even when a picture is opened full screen. */
export const MAX_SIDE = 2400;
/** WebP quality (0 to 100); 80 keeps photos crisp at a fraction of the size. */
export const WEBP_QUALITY = 80;

export async function toWebp(input: Buffer) {
  const { data, info } = await sharp(input, { limitInputPixels: 20000 * 20000 })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
