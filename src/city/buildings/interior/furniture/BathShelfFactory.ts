import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, placeAgainstWall } from './placement';

/** Estantería abierta para toallas y botes en baños con holgura. */
export class BathShelfFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const f = placeAgainstWall(ctx.usable, ctx.occupied, rng.range(0.72, 1.05), 0.34, 'bathShelf', rng);
    if (!f) return [];
    f.variant = rng.int(0, 4);
    ctx.bathShelf = f;
    ctx.occupied.push(footRect(f));
    return [f];
  }
}
