import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';

/** Toallas dobladas y pequeños botes sobre mueble o estantería. */
export class TowelStackFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const base = ctx.bathShelf ?? ctx.bathVanity;
    if (!base) return [];
    const alongX = base.faceX === 0;
    const side = rng.next() < 0.5 ? -1 : 1;
    const x = base.x + (alongX ? side * base.w * 0.24 : 0);
    const z = base.z + (alongX ? 0 : side * base.d * 0.24);
    return [{ kind: 'towelStack', x, z, w: 0.34, d: 0.26, faceX: base.faceX, faceZ: base.faceZ, variant: rng.int(0, 5) }];
  }
}
