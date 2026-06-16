import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, placeAgainstWall } from './placement';

/** Aparador bajo del comedor: mueble alargado y poco profundo contra una pared libre. */
export class SideboardFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const f = placeAgainstWall(ctx.usable, ctx.occupied, rng.range(1.1, 1.7), 0.45, 'sideboard', rng);
    if (!f) return [];
    f.variant = rng.int(0, 4);
    ctx.occupied.push(footRect(f));
    return [f];
  }
}
