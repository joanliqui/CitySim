import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, isFree, type Rect } from './placement';

/** Mesa de centro baja, delante del sofá (requiere sofá). */
export class CoffeeTableFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const sofa = ctx.sofa;
    if (!sofa || (sofa.faceX === 0 && sofa.faceZ === 0)) return [];

    const alongX = sofa.faceX !== 0; // el sofá mira en X → mesa con su largo en Z
    const L = 0.95; // largo (paralelo al sofá)
    const D = 0.5; // fondo
    const w = alongX ? D : L;
    const d = alongX ? L : D;
    // Delante del sofá: medio fondo del sofá + holgura para las piernas.
    const sofaDepth = alongX ? sofa.w : sofa.d;
    const off = sofaDepth / 2 + 0.45 + D / 2;
    const x = sofa.x + sofa.faceX * off;
    const z = sofa.z + sofa.faceZ * off;
    const r: Rect = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
    if (!isFree(r, ctx.usable, ctx.occupied)) return [];
    const f: Furniture = { kind: 'coffeeTable', x, z, w, d, faceX: sofa.faceX, faceZ: sofa.faceZ, variant: rng.int(0, 4) };
    ctx.occupied.push(footRect(f));
    return [f];
  }
}
