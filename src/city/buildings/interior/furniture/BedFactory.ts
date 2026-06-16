import { Rng } from '../../../../core/Rng';
import type { Furniture, RoomRect } from '../types';
import type { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, overlapArea, type Rect } from './placement';

/**
 * Cama: se arrima a una pared de la estancia que NO quede delante de ninguna
 * puerta. Evalúa ambas orientaciones y las cuatro esquinas y elige la posición
 * que menos invade los corredores de paso (`zones`). Manda en el resto del
 * amueblado, así que se coloca la primera y fija `ctx.bed`.
 */
export class BedFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const { house: h } = ctx;
    const bed = placeBed(ctx.room, h.x, h.z, h.w, h.d, h.t, ctx.zones, rng);
    if (!bed) return [];
    ctx.bed = bed;
    ctx.occupied.push(footRect(bed));
    return [bed];
  }
}

function placeBed(room: RoomRect, bx: number, bz: number, bw: number, bd: number, t: number, zones: Rect[], rng: Rng): Furniture | null {
  // Superficie útil: la estancia remetida medio tabique + un pequeño zócalo.
  const inset = t / 2 + 0.06;
  const ux0 = room.x0 + inset;
  const ux1 = room.x1 - inset;
  const uz0 = room.z0 + inset;
  const uz1 = room.z1 - inset;
  const uw = ux1 - ux0;
  const ud = uz1 - uz0;

  const BED_LEN = 2.0; // largo de colchón + estructura

  // Caras interiores de los muros perimetrales: arrimar el cabecero a un muro
  // exterior cuando se pueda (no llevan puertas interiores).
  const innerX0 = bx - bw / 2 + t;
  const innerX1 = bx + bw / 2 - t;
  const innerZ0 = bz - bd / 2 + t;
  const innerZ1 = bz + bd / 2 - t;
  const near = (a: number, b: number) => Math.abs(a - b) < 0.2;

  type Cand = { x: number; z: number; headX: number; headZ: number; fw: number; fd: number; double: boolean; ext: number };
  const cands: Cand[] = [];

  // Genera candidatos para una orientación (largo a lo largo de X o de Z).
  const consider = (longAlongX: boolean): void => {
    const longUsable = longAlongX ? uw : ud;
    const cross = longAlongX ? ud : uw;
    if (longUsable < BED_LEN - 0.05) return; // no cabe el largo de la cama
    const longLen = Math.min(BED_LEN, longUsable);
    const isDouble = cross >= 2.6;
    const bedW = isDouble ? 1.5 : 0.95;
    if (bedW > cross - 0.1) return; // ni la individual entra de través
    const fw = longAlongX ? longLen : bedW;
    const fd = longAlongX ? bedW : longLen;
    const half = longLen / 2;
    if (longAlongX) {
      for (const hx of [-1, 1] as const) {
        const cx = hx < 0 ? ux0 + half : ux1 - half;
        const headWall = hx < 0 ? room.x0 : room.x1;
        const ext = near(headWall, innerX0) || near(headWall, innerX1) ? 1 : 0;
        for (const sz of [-1, 1] as const) {
          const cz = sz < 0 ? uz0 + bedW / 2 : uz1 - bedW / 2;
          cands.push({ x: cx, z: cz, headX: hx, headZ: 0, fw, fd, double: isDouble, ext });
        }
      }
    } else {
      for (const hz of [-1, 1] as const) {
        const cz = hz < 0 ? uz0 + half : uz1 - half;
        const headWall = hz < 0 ? room.z0 : room.z1;
        const ext = near(headWall, innerZ0) || near(headWall, innerZ1) ? 1 : 0;
        for (const sx of [-1, 1] as const) {
          const cx = sx < 0 ? ux0 + bedW / 2 : ux1 - bedW / 2;
          cands.push({ x: cx, z: cz, headX: 0, headZ: hz, fw, fd, double: isDouble, ext });
        }
      }
    }
  };
  consider(true);
  consider(false);
  if (cands.length === 0) return null;

  // Mejor candidato: el que menos invade los corredores de paso; a igualdad,
  // cabecero contra muro exterior, con desempate aleatorio determinista.
  let best: Cand | null = null;
  let bestKey = -Infinity;
  for (const c of cands) {
    const foot: Rect = { x0: c.x - c.fw / 2, x1: c.x + c.fw / 2, z0: c.z - c.fd / 2, z1: c.z + c.fd / 2 };
    let invade = 0;
    for (const zn of zones) invade += overlapArea(foot, zn);
    const key = -invade * 1000 + c.ext * 10 + rng.next();
    if (key > bestKey) {
      bestKey = key;
      best = c;
    }
  }
  if (!best) return null;

  // `faceX/faceZ` apunta hacia los pies (opuesto al cabecero).
  return { kind: 'bed', x: best.x, z: best.z, w: best.fw, d: best.fd, faceX: -best.headX, faceZ: -best.headZ, double: best.double };
}
