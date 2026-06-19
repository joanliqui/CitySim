import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, FURNITURE_SCALE, isFree, type Rect } from './placement';

/**
 * Mesa de comedor: pieza central de la estancia. Se coloca lo más centrada
 * posible dejando holgura a los lados largos para las sillas; si un corredor de
 * paso pisa el centro, la desplaza a lo largo de su eje largo. Manda en el resto
 * del comedor (las sillas y la alfombra se apoyan en ella vía `ctx.table`).
 */
export class DiningTableFactory implements FurnitureFactory {
  place(ctx: FurnishContext, _rng: Rng): Furniture[] {
    const U = ctx.usable;
    const uw = U.x1 - U.x0;
    const ud = U.z1 - U.z0;
    const longAlongX = uw >= ud;
    const longU = longAlongX ? uw : ud;
    const crossU = longAlongX ? ud : uw;

    // Reserva para sillas: una franja a cada lado largo y holgura en los extremos.
    const CHAIR_CLR = 0.55;
    const L = clamp(longU - 1.2, 1.0, 1.9 * FURNITURE_SCALE); // largo de la mesa
    const D = clamp(crossU - 2 * CHAIR_CLR, 0.75, 1.05 * FURNITURE_SCALE); // fondo de la mesa
    if (L < 1.0 - 1e-6 || D < 0.75 - 1e-6) return []; // no cabe mesa + sillas

    const w = longAlongX ? L : D;
    const d = longAlongX ? D : L;
    const cz0 = (U.z0 + U.z1) / 2;
    const cx0 = (U.x0 + U.x1) / 2;

    // Centro ideal y, si choca con un corredor, desplazamientos a lo largo del eje
    // largo (la mesa nunca debe quedar delante de una puerta).
    const lx = longAlongX ? 1 : 0;
    const lz = longAlongX ? 0 : 1;
    const offsets = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9];
    for (const off of offsets) {
      const x = cx0 + lx * off;
      const z = cz0 + lz * off;
      const r: Rect = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
      if (!isFree(r, U, ctx.occupied)) continue;
      const table: Furniture = { kind: 'diningTable', x, z, w, d, faceX: lx, faceZ: lz };
      ctx.table = table;
      ctx.occupied.push(footRect(table));
      return [table];
    }
    return [];
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
