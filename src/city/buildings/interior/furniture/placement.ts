import { Rng } from '../../../../core/Rng';
import type { Furniture, FurnitureKind } from '../types';

/** Rectángulo axis-aligned en planta. */
export type Rect = { x0: number; z0: number; x1: number; z1: number };

/** Huella (rectángulo en planta) de un mueble. */
export function footRect(f: Furniture): Rect {
  return { x0: f.x - f.w / 2, x1: f.x + f.w / 2, z0: f.z - f.d / 2, z1: f.z + f.d / 2 };
}

/** Área de solape entre dos rectángulos axis-aligned (0 si no se tocan). */
export function overlapArea(a: Rect, b: Rect): number {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return ox > 0 && oz > 0 ? ox * oz : 0;
}

/** ¿`r` queda dentro de `U` y libre (a `gap` de todo lo ocupado)? */
export function isFree(r: Rect, U: Rect, occupied: Rect[], gap = 0.08): boolean {
  if (r.x0 < U.x0 - 1e-6 || r.x1 > U.x1 + 1e-6 || r.z0 < U.z0 - 1e-6 || r.z1 > U.z1 + 1e-6) return false;
  for (const o of occupied) {
    const ox = Math.min(r.x1, o.x1) - Math.max(r.x0, o.x0);
    const oz = Math.min(r.z1, o.z1) - Math.max(r.z0, o.z0);
    if (ox > -gap && oz > -gap) return false;
  }
  return true;
}

/**
 * Coloca un mueble (largo `L` × fondo `D`) de espaldas a alguna pared de la
 * estancia útil `U`, en un hueco libre elegido al azar. El frente mira al centro.
 * Compartido por armario y cómoda.
 */
export function placeAgainstWall(U: Rect, occupied: Rect[], L: number, D: number, kind: FurnitureKind, rng: Rng): Furniture | null {
  type Slot = { x: number; z: number; w: number; d: number; faceX: number; faceZ: number };
  const slots: Slot[] = [];
  const STEP = 0.2;

  // Paredes en X (mueble de fondo D en x, largo L en z).
  for (const faceX of [1, -1] as const) {
    const x = faceX > 0 ? U.x0 + D / 2 : U.x1 - D / 2;
    for (let cz = U.z0 + L / 2; cz <= U.z1 - L / 2 + 1e-6; cz += STEP) {
      const r: Rect = { x0: x - D / 2, x1: x + D / 2, z0: cz - L / 2, z1: cz + L / 2 };
      if (isFree(r, U, occupied)) slots.push({ x, z: cz, w: D, d: L, faceX, faceZ: 0 });
    }
  }
  // Paredes en Z (mueble de fondo D en z, largo L en x).
  for (const faceZ of [1, -1] as const) {
    const z = faceZ > 0 ? U.z0 + D / 2 : U.z1 - D / 2;
    for (let cx = U.x0 + L / 2; cx <= U.x1 - L / 2 + 1e-6; cx += STEP) {
      const r: Rect = { x0: cx - L / 2, x1: cx + L / 2, z0: z - D / 2, z1: z + D / 2 };
      if (isFree(r, U, occupied)) slots.push({ x: cx, z, w: L, d: D, faceX: 0, faceZ });
    }
  }
  if (slots.length === 0) return null;
  const s = slots[rng.int(0, slots.length)];
  return { kind, x: s.x, z: s.z, w: s.w, d: s.d, faceX: s.faceX, faceZ: s.faceZ };
}
