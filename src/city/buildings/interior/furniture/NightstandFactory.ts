import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, FURNITURE_SCALE, isFree, overlapArea, type Rect } from './placement';

/** Mesitas de noche a ambos lados del cabecero (una sola si solo cabe una). */
export class NightstandFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const bed = ctx.bed;
    if (!bed) return [];
    const out: Furniture[] = [];
    const NS = 0.5 * FURNITURE_SCALE; // lado de la mesita
    // Eje largo de la cama = dirección de `face` (hacia los pies); cabecero opuesto.
    const longAlongX = bed.faceX !== 0;
    const headX = -bed.faceX;
    const headZ = -bed.faceZ;
    // Centro del cabecero (extremo de la cama hacia la pared).
    const hx = bed.x + headX * (bed.w / 2 - NS / 2);
    const hz = bed.z + headZ * (bed.d / 2 - NS / 2);
    // Perpendicular al eje largo, para separar a izquierda/derecha.
    const perpX = longAlongX ? 0 : 1;
    const perpZ = longAlongX ? 1 : 0;
    const crossHalf = (longAlongX ? bed.d : bed.w) / 2;
    const offset = crossHalf + NS / 2 + 0.06;

    // La mesita va PEGADA a la cama (la separación 0.06 cae dentro de la
    // tolerancia de colisión), así que, como la alfombra, exime la huella de la
    // cama de la comprobación y solo respeta corredores y otros muebles.
    const others = ctx.occupied.filter((o) => overlapArea(o, footRect(bed)) === 0);
    const sides = rng.next() < 0.5 ? [1, -1] : [-1, 1]; // orden aleatorio
    for (const sgn of sides) {
      const x = hx + perpX * offset * sgn;
      const z = hz + perpZ * offset * sgn;
      const r: Rect = { x0: x - NS / 2, x1: x + NS / 2, z0: z - NS / 2, z1: z + NS / 2 };
      if (!isFree(r, ctx.usable, others)) continue;
      out.push({ kind: 'nightstand', x, z, w: NS, d: NS, faceX: bed.faceX, faceZ: bed.faceZ });
      ctx.occupied.push(r);
    }
    return out;
  }
}
