import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, placeAgainstWall } from './placement';

/** Sillón tapizado contra una pared libre (acompaña al sofá, sin depender de él). */
export class ArmchairFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const f = placeAgainstWall(ctx.usable, ctx.occupied, 0.85, 0.82, 'armchair', rng);
    if (!f) return [];
    f.variant = rng.int(0, 7);
    ctx.occupied.push(footRect(f));
    return [f];
  }
}
