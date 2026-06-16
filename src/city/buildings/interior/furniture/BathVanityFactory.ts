import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, placeAgainstWall } from './placement';

/** Mueble bajo de baño con cajones; en baños amplios soporta el lavamanos. */
export class BathVanityFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const usableW = ctx.usable.x1 - ctx.usable.x0;
    const usableD = ctx.usable.z1 - ctx.usable.z0;
    const len = Math.min(rng.range(1.25, 1.9), Math.max(1.05, Math.max(usableW, usableD) - 0.45));
    const f = placeAgainstWall(ctx.usable, ctx.occupied, len, 0.52, 'bathVanity', rng);
    if (!f) return [];
    f.variant = rng.int(0, 4);
    ctx.bathVanity = f;
    ctx.occupied.push(footRect(f));
    return [f];
  }
}
