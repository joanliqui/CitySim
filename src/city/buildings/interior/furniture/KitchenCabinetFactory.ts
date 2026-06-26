import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { FURNITURE_SCALE } from './placement';

/**
 * Armario alto de pared: se cuelga sobre la última encimera colocada
 * (`ctx.kitchenCounter`), a ras de la misma pared. Como va en alto no compite por
 * el suelo; sin encimera de referencia no se coloca.
 */
export class KitchenCabinetFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const c = ctx.kitchenCounter;
    if (!c) return [];
    const alongX = c.faceX === 0; // la encimera mira en Z → el frente se extiende en X
    const along = alongX ? c.w : c.d; // largo de la encimera a lo largo de la pared
    const depth = 0.34 * FURNITURE_SCALE; // fondo (menor que el de la encimera)
    const counterDepth = alongX ? c.d : c.w;
    // A ras de la pared (lado −face): retranqueo respecto al centro de la encimera.
    const back = (counterDepth - depth) / 2;
    return [
      {
        kind: 'kitchenCabinet',
        x: c.x - c.faceX * back,
        z: c.z - c.faceZ * back,
        w: alongX ? along * 0.9 : depth,
        d: alongX ? depth : along * 0.9,
        faceX: c.faceX,
        faceZ: c.faceZ,
        variant: rng.int(0, 4),
      },
    ];
  }
}
