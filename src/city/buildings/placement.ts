import { CORRIDOR_HALF, type Building } from '../CityModel';

export const SETBACK = 1.4; // distancia de la fachada al borde del corredor
export const FRONT_EDGE = CORRIDOR_HALF + SETBACK; // distancia del eje de la calle a la fachada
export const SIDE_INSET = 2.0; // separación de cada fila de edificios respecto a las esquinas
export const BUILDING_GAP = 0.35; // separacion minima entre huellas de edificios

/** Lado de la manzana al que mira una fila de edificios. */
export type SideTag = 'N' | 'S' | 'W' | 'E';

/** Borde edificable de una manzana (dentro de los corredores). */
export interface BuildableRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Círculo de exclusión (p. ej. alrededor de una rotonda) donde no se construye. */
export interface ClearanceCircle {
  x: number;
  z: number;
  r: number;
}

export function insideBuildableRect(x: number, z: number, w: number, d: number, rect: BuildableRect): boolean {
  const halfW = w / 2;
  const halfD = d / 2;
  return x - halfW >= rect.x0 && x + halfW <= rect.x1 && z - halfD >= rect.z0 && z + halfD <= rect.z1;
}

export function overlapsClearance(x: number, z: number, w: number, d: number, clearances: ClearanceCircle[]): boolean {
  const halfW = w / 2;
  const halfD = d / 2;
  for (const c of clearances) {
    const dx = Math.max(Math.abs(c.x - x) - halfW, 0);
    const dz = Math.max(Math.abs(c.z - z) - halfD, 0);
    if (dx * dx + dz * dz < c.r * c.r) return true;
  }
  return false;
}

export function overlapsBuilding(x: number, z: number, w: number, d: number, buildings: Building[]): boolean {
  const minX = x - w / 2 - BUILDING_GAP;
  const maxX = x + w / 2 + BUILDING_GAP;
  const minZ = z - d / 2 - BUILDING_GAP;
  const maxZ = z + d / 2 + BUILDING_GAP;
  for (const b of buildings) {
    if (maxX <= b.x - b.w / 2 || minX >= b.x + b.w / 2) continue;
    if (maxZ <= b.z - b.d / 2 || minZ >= b.z + b.d / 2) continue;
    return true;
  }
  return false;
}
