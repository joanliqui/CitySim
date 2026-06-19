import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, FURNITURE_SCALE, isFree, placeAgainstWall, type Rect } from './placement';

/**
 * Televisor sobre un mueble bajo. Si hay sofá, se coloca contra la pared que el
 * sofá MIRA (queda enfrentado a él) y alineado con su centro; si no, contra
 * cualquier pared libre. La pantalla mira hacia donde se sienta uno (al sofá).
 */
export class TvFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const U = ctx.usable;
    const LEN = 1.2; // ancho del mueble (base; placeAgainstWall lo escala)
    const DEP = 0.4; // fondo del mueble

    const sofa = ctx.sofa;
    if (sofa && (sofa.faceX !== 0 || sofa.faceZ !== 0)) {
      // Pieza ya escalada para la colocación explícita frente al sofá.
      const tvLen = LEN * FURNITURE_SCALE;
      const tvDep = DEP * FURNITURE_SCALE;
      // Pared enfrentada al sofá (en la dirección a la que mira) y centrado en él.
      const fx = sofa.faceX;
      const fz = sofa.faceZ;
      let x: number;
      let z: number;
      let w: number;
      let d: number;
      if (fx !== 0) {
        x = fx > 0 ? U.x1 - tvDep / 2 : U.x0 + tvDep / 2;
        z = clamp(sofa.z, U.z0 + tvLen / 2, U.z1 - tvLen / 2);
        w = tvDep;
        d = tvLen;
      } else {
        z = fz > 0 ? U.z1 - tvDep / 2 : U.z0 + tvDep / 2;
        x = clamp(sofa.x, U.x0 + tvLen / 2, U.x1 - tvLen / 2);
        w = tvLen;
        d = tvDep;
      }
      const r: Rect = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
      if (isFree(r, U, ctx.occupied)) {
        const tv: Furniture = { kind: 'tv', x, z, w, d, faceX: -fx, faceZ: -fz, variant: rng.int(0, 3) };
        ctx.occupied.push(footRect(tv));
        return [tv];
      }
    }

    // Sin sofá (o pared ocupada): contra cualquier pared libre.
    const f = placeAgainstWall(U, ctx.occupied, LEN, DEP, 'tv', rng);
    if (!f) return [];
    f.variant = rng.int(0, 3);
    ctx.occupied.push(footRect(f));
    return [f];
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
