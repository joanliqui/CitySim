import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, placeAgainstWall } from './placement';

/**
 * Sofá: se arrima a una pared libre y mira al centro de la estancia. Es el ancla
 * del rincón de estar — la mesa de centro y el televisor se orientan a él vía
 * `ctx.sofa`.
 */
export class SofaFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const f = placeAgainstWall(ctx.usable, ctx.occupied, rng.range(1.7, 2.1), 0.85, 'sofa', rng);
    if (!f) return [];
    f.variant = rng.int(0, 7);
    ctx.sofa = f;
    ctx.occupied.push(footRect(f));
    return [f];
  }
}
