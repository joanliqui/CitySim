import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { isFree, type Rect } from './placement';

/** Planta de interior en una esquina libre del comedor (maceta + follaje). */
export class PottedPlantFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const U = ctx.usable;
    const P = 0.42; // huella de la maceta
    const corners: Array<[number, number]> = [
      [U.x0 + P / 2, U.z0 + P / 2],
      [U.x1 - P / 2, U.z0 + P / 2],
      [U.x0 + P / 2, U.z1 - P / 2],
      [U.x1 - P / 2, U.z1 - P / 2],
    ];
    // Orden de prueba aleatorio determinista (Fisher–Yates con el RNG seeded).
    for (let i = corners.length - 1; i > 0; i--) {
      const j = rng.int(0, i + 1);
      [corners[i], corners[j]] = [corners[j], corners[i]];
    }
    for (const [x, z] of corners) {
      const r: Rect = { x0: x - P / 2, x1: x + P / 2, z0: z - P / 2, z1: z + P / 2 };
      if (!isFree(r, U, ctx.occupied)) continue;
      ctx.occupied.push(r);
      return [{ kind: 'pottedPlant', x, z, w: P, d: P, faceX: 0, faceZ: 0, variant: rng.int(0, 3) }];
    }
    return [];
  }
}
