import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, placeAgainstWall } from './placement';

/**
 * Vitrocerámica: módulo de mueble bajo con encimera y la placa de cocción
 * EMPOTRADA a ras, contra una pared libre (no un electrodoméstico exento). La
 * huella es la de una sección de encimera para que case con los armarios bajos.
 */
export class StoveFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const f = placeAgainstWall(ctx.usable, ctx.occupied, rng.range(0.85, 1.05), 0.6, 'stove', rng);
    if (!f) return [];
    f.variant = rng.int(0, 4);
    ctx.occupied.push(footRect(f));
    return [f];
  }
}
