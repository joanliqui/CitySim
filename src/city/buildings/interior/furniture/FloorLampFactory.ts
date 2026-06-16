import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { isFree, type Rect } from './placement';

/** Lámpara de pie en una esquina libre del salón (pie fino, poca huella). */
export class FloorLampFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const U = ctx.usable;
    const P = 0.46; // huella de la base/patas
    const corners: Array<[number, number]> = [
      [U.x0 + P / 2, U.z0 + P / 2],
      [U.x1 - P / 2, U.z0 + P / 2],
      [U.x0 + P / 2, U.z1 - P / 2],
      [U.x1 - P / 2, U.z1 - P / 2],
    ];
    for (let i = corners.length - 1; i > 0; i--) {
      const j = rng.int(0, i + 1);
      [corners[i], corners[j]] = [corners[j], corners[i]];
    }
    const cx = (U.x0 + U.x1) / 2;
    const cz = (U.z0 + U.z1) / 2;
    for (const [x, z] of corners) {
      const r: Rect = { x0: x - P / 2, x1: x + P / 2, z0: z - P / 2, z1: z + P / 2 };
      if (!isFree(r, U, ctx.occupied)) continue;
      ctx.occupied.push(r);
      // `faceX/faceZ` apunta al INTERIOR de la sala (eje dominante hacia el centro):
      // las lámparas con brazo (el arco) lo extienden por ahí para no cruzar la pared.
      const dx = cx - x;
      const dz = cz - z;
      const faceX = Math.abs(dx) >= Math.abs(dz) ? Math.sign(dx) || 1 : 0;
      const faceZ = faceX === 0 ? Math.sign(dz) || 1 : 0;
      return [{ kind: 'floorLamp', x, z, w: P, d: P, faceX, faceZ, variant: rng.int(0, 4) }];
    }
    return [];
  }
}
