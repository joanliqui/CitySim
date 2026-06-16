import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, isFree, overlapArea, type Rect } from './placement';

/**
 * Alfombra. En el dormitorio va a los pies de la cama; en el comedor va centrada
 * BAJO la mesa (más grande que su huella). Es plana, así que puede solaparse con
 * su ancla (cama o mesa), pero respeta corredores y otros muebles altos.
 */
export class RugFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    if (ctx.bed) return this.atBedFoot(ctx, ctx.bed, rng);
    if (ctx.table) return this.underTable(ctx, ctx.table, rng);
    return [];
  }

  /** Alfombra a los pies de la cama. */
  private atBedFoot(ctx: FurnishContext, bed: Furniture, rng: Rng): Furniture[] {
    const longAlongX = bed.faceX !== 0;
    // Punto a los pies, algo separado de la cama.
    const footX = bed.x + bed.faceX * (bed.w / 2 + 0.5);
    const footZ = bed.z + bed.faceZ * (bed.d / 2 + 0.5);
    const rw = longAlongX ? 1.1 : 1.6;
    const rd = longAlongX ? 1.6 : 1.1;
    const r: Rect = { x0: footX - rw / 2, x1: footX + rw / 2, z0: footZ - rd / 2, z1: footZ + rd / 2 };
    // La alfombra es plana: ignora la cama, pero respeta el resto (corredores, muebles).
    const others = ctx.occupied.filter((o) => overlapArea(o, footRect(bed)) === 0);
    if (!isFree(r, ctx.usable, others, 0.02)) return [];
    return [{ kind: 'rug', x: footX, z: footZ, w: rw, d: rd, faceX: bed.faceX, faceZ: bed.faceZ, variant: rng.int(0, 5) }];
  }

  /** Alfombra centrada bajo la mesa de comedor, sobresaliendo bajo las sillas. */
  private underTable(ctx: FurnishContext, table: Furniture, rng: Rng): Furniture[] {
    const U = ctx.usable;
    const rw = Math.min(table.w + 1.0, U.x1 - U.x0 - 0.1);
    const rd = Math.min(table.d + 1.0, U.z1 - U.z0 - 0.1);
    if (rw < 0.8 || rd < 0.8) return [];
    // Plana y bajo la mesa: solo se recorta para no salirse de la estancia útil.
    const x = Math.max(U.x0 + rw / 2, Math.min(U.x1 - rw / 2, table.x));
    const z = Math.max(U.z0 + rd / 2, Math.min(U.z1 - rd / 2, table.z));
    return [{ kind: 'rug', x, z, w: rw, d: rd, faceX: 0, faceZ: 0, variant: rng.int(0, 5) }];
  }
}
