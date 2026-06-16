import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, placeAgainstWall } from './placement';

/** Librería alta y poco profunda contra una pared libre (con libros de colores). */
export class BookshelfFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const f = placeAgainstWall(ctx.usable, ctx.occupied, rng.range(0.9, 1.3), 0.32, 'bookshelf', rng);
    if (!f) return [];
    f.variant = rng.int(0, 7);
    ctx.occupied.push(footRect(f));
    return [f];
  }
}
