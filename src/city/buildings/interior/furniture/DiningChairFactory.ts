import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, isFree, overlapArea, type Rect } from './placement';

/**
 * Sillas alrededor de la mesa de comedor: una fila a cada lado largo y, si hay
 * fondo de sobra, una en cada cabecera. Cada silla se arrima a la mesa (queda
 * dentro de la tolerancia de colisión, como las mesitas con la cama) y mira
 * hacia ella. Se omite la que caiga sobre un corredor o sobre otro mueble.
 */
export class DiningChairFactory implements FurnitureFactory {
  place(ctx: FurnishContext, _rng: Rng): Furniture[] {
    const t = ctx.table;
    if (!t) return [];
    const out: Furniture[] = [];
    const CW = 0.46; // huella de la silla
    const GAP = 0.05; // separación silla↔mesa (cae en la tolerancia de colisión)

    const longAlongX = t.faceX !== 0; // eje largo de la mesa
    const tableL = longAlongX ? t.w : t.d;
    const tableD = longAlongX ? t.d : t.w;
    // Vectores unitarios a lo largo y a través de la mesa.
    const lx = longAlongX ? 1 : 0;
    const lz = longAlongX ? 0 : 1;
    const cxv = longAlongX ? 0 : 1;
    const czv = longAlongX ? 1 : 0;

    // Las sillas pueden tocar la mesa: exime su huella de la comprobación.
    const others = ctx.occupied.filter((o) => overlapArea(o, footRect(t)) === 0);

    const tryPlace = (x: number, z: number, faceX: number, faceZ: number): void => {
      const r: Rect = { x0: x - CW / 2, x1: x + CW / 2, z0: z - CW / 2, z1: z + CW / 2 };
      if (!isFree(r, ctx.usable, others)) return;
      const chair: Furniture = { kind: 'diningChair', x, z, w: CW, d: CW, faceX, faceZ };
      out.push(chair);
      ctx.occupied.push(r);
    };

    // Filas a los lados largos.
    const n = Math.max(1, Math.min(4, Math.floor(tableL / 0.62)));
    const spacing = tableL / n;
    const crossOff = tableD / 2 + CW / 2 + GAP;
    for (const sgn of [1, -1] as const) {
      for (let i = 0; i < n; i++) {
        const pos = (i - (n - 1) / 2) * spacing;
        const x = t.x + lx * pos + cxv * sgn * crossOff;
        const z = t.z + lz * pos + czv * sgn * crossOff;
        tryPlace(x, z, -cxv * sgn, -czv * sgn); // mira hacia la mesa
      }
    }

    // Cabeceras (extremos del eje largo) si la mesa tiene fondo suficiente.
    if (tableD >= 0.78) {
      const longOff = tableL / 2 + CW / 2 + GAP;
      for (const sgn of [1, -1] as const) {
        const x = t.x + lx * sgn * longOff;
        const z = t.z + lz * sgn * longOff;
        tryPlace(x, z, -lx * sgn, -lz * sgn);
      }
    }

    return out;
  }
}
