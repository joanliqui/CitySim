import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, type Rect } from './placement';

/**
 * Ducha de esquina: encaja el plato + mampara en una esquina LIBRE del baño, PEGADA
 * a las dos paredes (sin holgura). Apoya en la CARA REAL de cada muro: para un muro
 * de perímetro, el borde de la estancia; para un tabique interior, medio grosor más
 * adentro (el borde de la estancia es el eje del tabique). Así la columna de ducha
 * queda montada SOBRE la pared y no metida dentro (ni atravesándola hacia la estancia
 * vecina). El muro `cx` es el del fondo (columna); el `cz`, el lateral cerrado.
 */
export class ShowerFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const R = ctx.room;
    const H = ctx.house;
    const t = H.t;
    const eps = 0.05;
    const innerX0 = H.x - H.w / 2 + t;
    const innerX1 = H.x + H.w / 2 - t;
    const innerZ0 = H.z - H.d / 2 + t;
    const innerZ1 = H.z + H.d / 2 - t;
    // Cara interior del muro de un lado (perímetro → borde de la estancia; tabique →
    // medio grosor hacia el interior, porque el borde es el eje del tabique).
    const wallFaceX = (cx: number): number => {
      const edge = cx > 0 ? R.x1 : R.x0;
      const perimeter = cx > 0 ? Math.abs(edge - innerX1) < eps : Math.abs(edge - innerX0) < eps;
      return perimeter ? edge : edge - cx * (t / 2);
    };
    const wallFaceZ = (cz: number): number => {
      const edge = cz > 0 ? R.z1 : R.z0;
      const perimeter = cz > 0 ? Math.abs(edge - innerZ1) < eps : Math.abs(edge - innerZ0) < eps;
      return perimeter ? edge : edge - cz * (t / 2);
    };

    const sw = Math.min(1.18, R.x1 - R.x0 - 0.1);
    const sd = Math.min(1.18, R.z1 - R.z0 - 0.1);
    if (sw < 0.8 || sd < 0.8) return [];

    // Esquinas en orden rotado (para variar entre baños) hasta encontrar una libre.
    const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const start = rng.int(0, 4);
    for (let k = 0; k < 4; k++) {
      const [cx, cz] = corners[(start + k) % 4];
      // La cara del plato pegada al muro se solapa 1 cm para no dejar holgura.
      const x = wallFaceX(cx) - cx * (sw / 2 - 0.01);
      const z = wallFaceZ(cz) - cz * (sd / 2 - 0.01);
      const foot: Rect = { x0: x - sw / 2, x1: x + sw / 2, z0: z - sd / 2, z1: z + sd / 2 };
      // Solo evitamos los corredores de puerta y lo ya colocado.
      if (ctx.occupied.some((o) => foot.x0 < o.x1 - 0.02 && foot.x1 > o.x0 + 0.02 && foot.z0 < o.z1 - 0.02 && foot.z1 > o.z0 + 0.02)) continue;
      // Cara abierta opuesta al muro `cx`; lateral abierto opuesto al muro `cz`.
      const f: Furniture = { kind: 'shower', x, z, w: sw, d: sd, faceX: -cx, faceZ: 0, openSign: -cz, variant: rng.int(0, 4) };
      ctx.occupied.push(footRect(f));
      return [f];
    }
    return [];
  }
}
