import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, placeAgainstWall } from './placement';

/**
 * Encimera con armarios bajos: mueble alargado y poco profundo contra una pared
 * libre. Queda fijado en `ctx.kitchenCounter` para que el microondas se apoye y
 * los armarios altos se cuelguen encima.
 */
export class KitchenCounterFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const f = placeAgainstWall(ctx.usable, ctx.occupied, rng.range(1.0, 1.8), 0.6, 'kitchenCounter', rng);
    if (!f) return [];
    f.variant = rng.int(0, 4);
    ctx.kitchenCounter = f;
    ctx.occupied.push(footRect(f));
    return [f];
  }
}
