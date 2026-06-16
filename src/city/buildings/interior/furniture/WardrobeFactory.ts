import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, placeAgainstWall } from './placement';

/** Armario alto contra alguna pared libre. */
export class WardrobeFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const f = placeAgainstWall(ctx.usable, ctx.occupied, rng.range(1.0, 1.4), 0.6, 'wardrobe', rng);
    if (!f) return [];
    f.variant = rng.int(0, 4);
    ctx.occupied.push(footRect(f));
    return [f];
  }
}
