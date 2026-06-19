import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, FURNITURE_SCALE, placeAgainstWall } from './placement';

/** Lavamanos pequeño contra pared. */
export class SinkFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    if (ctx.bathVanity) {
      const v = ctx.bathVanity;
      const alongX = v.faceX === 0;
      const off = rng.range(-0.18, 0.18);
      const basinL = 0.62 * FURNITURE_SCALE;
      const basinD = 0.42 * FURNITURE_SCALE;
      return [
        {
          kind: 'sink',
          x: v.x + (alongX ? off : 0),
          z: v.z + (alongX ? 0 : off),
          w: alongX ? basinL : basinD,
          d: alongX ? basinD : basinL,
          faceX: v.faceX,
          faceZ: v.faceZ,
          sinkMount: 'vanity',
          variant: rng.int(0, 4),
        },
      ];
    }
    const f = placeAgainstWall(ctx.usable, ctx.occupied, 0.62, 0.42, 'sink', rng);
    if (!f) return [];
    f.sinkMount = 'standalone';
    f.variant = rng.int(0, 4);
    ctx.occupied.push(footRect(f));
    return [f];
  }
}
