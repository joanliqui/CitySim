/**
 * Modelo de datos puro de la ciudad. Sin dependencias de Three.js:
 * la simulación opera exclusivamente sobre estas estructuras.
 *
 * Sistema de coordenadas: plano XZ (Y es la altura). Unidades ≈ metros.
 * La ciudad es una retícula de carreteras: GRID líneas por eje, con
 * manzanas edificables entre ellas.
 */

import type { BuildingType } from './buildings/types/BuildingTypes';
import type { HouseInterior, OfficeInterior } from './buildings/interior/types';
import type { PlayKind } from './park/types/PlayTypes';
import type { TreeKind } from './vegetation/types/TreeTypes';

export const CITY = {
  /** Carreteras por eje (GRID x GRID intersecciones). */
  grid: 8,
  /** Semiancho de la calzada (2 carriles). */
  roadHalf: 4,
  /** Ancho de la acera. */
  sidewalkWidth: 3,
  /** Separación lateral del carril respecto al eje de la carretera. */
  laneOffset: 2,
} as const;

/** Radio del eje del anillo de una rotonda. */
export const ROUNDABOUT_RADIUS = 11;

/** Semiancho del corredor completo (calzada + aceras). */
export const CORRIDOR_HALF = CITY.roadHalf + CITY.sidewalkWidth; // 7
/** Distancia del eje de la carretera al eje de la acera. */
export const SIDEWALK_CENTER = CITY.roadHalf + CITY.sidewalkWidth / 2; // 5.5

/** Radio exterior del asfalto de una rotonda (borde del anillo). */
export const ROUNDABOUT_OUT = ROUNDABOUT_RADIUS + CITY.roadHalf; // 15
/** Radio del eje de la acera que rodea una rotonda. */
export const ROUNDABOUT_SW_R = ROUNDABOUT_OUT + CITY.sidewalkWidth / 2; // 16.5
/** Distancia (a lo largo de la calle) a la que la acera recta toca la curva. */
export const ROUNDABOUT_SW_CLIP = Math.sqrt(ROUNDABOUT_SW_R ** 2 - SIDEWALK_CENTER ** 2); // ≈15.56
/** Ángulo del punto de contacto acera recta ↔ arco (desde el eje de la calle). */
export const ROUNDABOUT_SW_ANGLE = Math.asin(SIDEWALK_CENTER / ROUNDABOUT_SW_R); // ≈0.34 rad

/**
 * Posición mundial de cada línea de carretera, por eje. La retícula ya NO es
 * uniforme: el generador fija estos arrays (avenidas anchas, barrios apretados),
 * así que el ancho de calzada es constante pero la separación entre calles varía.
 * Render, grafos y semáforos leen siempre estas tablas.
 */
let LAYOUT_X: number[] = uniformAxis();
let LAYOUT_Z: number[] = uniformAxis();

function uniformAxis(): number[] {
  const out: number[] = [];
  for (let i = 0; i < CITY.grid; i++) out.push((i - (CITY.grid - 1) / 2) * 44);
  return out;
}

/** Fija el trazado no uniforme de la ciudad (lo llama el generador). */
export function setCityLayout(xs: number[], zs: number[]): void {
  LAYOUT_X = xs;
  LAYOUT_Z = zs;
}

/** Coordenada X del eje de la i-ésima carretera vertical. */
export function roadX(i: number): number {
  return LAYOUT_X[i];
}

/** Coordenada Z del eje de la j-ésima carretera horizontal. */
export function roadZ(j: number): number {
  return LAYOUT_Z[j];
}

export function intersectionId(i: number, j: number): number {
  return j * CITY.grid + i;
}

export interface Vec2 {
  x: number;
  z: number;
}

export interface Intersection {
  id: number;
  i: number;
  j: number;
  x: number;
  z: number;
}

/** Eje del tráfico que circula por una carretera. */
export type RoadAxis = 'NS' | 'EW';

/**
 * Centerline curva de una arista: polilínea muestreada + longitud de arco
 * acumulada por punto. `cum[last]` es la longitud total. Si una arista no tiene
 * `curve`, es recta (camino rápido) y su geometría se deriva de `dir`/`length`.
 */
export interface EdgeCurve {
  pts: Vec2[];
  cum: number[];
}

/** Arista dirigida del grafo vial entre dos intersecciones adyacentes. */
export interface RoadEdge {
  id: number;
  from: number;
  to: number;
  /** Dirección unitaria del extremo de salida (también dirección global si es recta). */
  dirX: number;
  dirZ: number;
  axis: RoadAxis;
  /** Longitud de arco (recta: distancia euclídea; curva: longitud de la polilínea). */
  length: number;
  /** Geometría curva opcional; si falta, la arista es recta. */
  curve?: EdgeCurve;
  /** Si es una entrada de rotonda: id de la arista de anillo a la que cede el paso. */
  yieldTo?: number;
}

/** Construye una arista curva a partir de su polilínea (calcula la tabla de arco). */
export function buildEdgeCurve(pts: Vec2[]): EdgeCurve {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  }
  return { pts, cum };
}

/** Punto y tangente unitaria de una curva a distancia de arco `s` desde el inicio. */
export function sampleCurve(c: EdgeCurve, s: number, outP: Vec2, outT: Vec2): void {
  const { pts, cum } = c;
  const total = cum[cum.length - 1];
  const sc = Math.min(Math.max(s, 0), total);
  let k = 0;
  while (k < cum.length - 2 && cum[k + 1] < sc) k++;
  const segLen = cum[k + 1] - cum[k] || 1e-6;
  const t = (sc - cum[k]) / segLen;
  const a = pts[k];
  const b = pts[k + 1];
  outP.x = a.x + (b.x - a.x) * t;
  outP.z = a.z + (b.z - a.z) * t;
  outT.x = (b.x - a.x) / segLen;
  outT.z = (b.z - a.z) / segLen;
}

export type { BuildingType };
export type { Furniture, FurnitureKind, HouseInterior, InteriorWall, OfficeInterior, RoomKind, RoomRect, StairCore } from './buildings/interior/types';

export interface Building {
  id: number;
  type: BuildingType;
  name: string;
  /** Centro de la huella. */
  x: number;
  z: number;
  /** Extensión en X, Z y altura. */
  w: number;
  d: number;
  h: number;
  /** Vector unitario desde el edificio hacia su calle (fachada). */
  faceX: number;
  faceZ: number;
  colorIdx: number;
  /** Punto de la puerta sobre el eje de la acera. */
  door: Vec2;
  /** Punto de aproximación junto a la fachada (donde el peatón "entra"). */
  approach: Vec2;
  /** Nodo del grafo peatonal asociado a la puerta (lo asigna SidewalkGraph). */
  doorNode: number;
  /** Solo casas: distribución interior (estancias + tabiques). */
  interior?: HouseInterior;
  /** Solo edificios altos: rellano + escaleras + una vivienda por planta. */
  officeInterior?: OfficeInterior;
}

/**
 * Nº de apartamentos de un edificio residencial alto (una vivienda por planta,
 * la planta baja es el rellano). 0 para casas individuales u otros edificios.
 */
export function apartmentCount(b: Building): number {
  return b.officeInterior ? b.officeInterior.dwellings.length : 0;
}

export type { TreeKind };

export interface Tree {
  x: number;
  z: number;
  kind: TreeKind;
  /** Radio de la copa. */
  r: number;
  /** Altura del tronco. */
  trunk: number;
  /** Índice de tono de verde. */
  shade: number;
}

export interface Hedge {
  x: number;
  z: number;
  w: number;
  d: number;
  heading: number;
  shade: number;
}

export interface Bench {
  x: number;
  z: number;
  /** Rotacion en planta; el respaldo queda en +Z local. */
  heading: number;
  shade: number;
}

export type { PlayKind };

/**
 * Juego infantil dentro de una zona de juego (parques grandes). `heading` orienta
 * la pieza en planta (su frente mira a +Z local); `variant` fija color/forma de
 * forma determinista. Se crean a través de la factoría `src/city/park`.
 */
export interface PlayItem {
  kind: PlayKind;
  x: number;
  z: number;
  heading: number;
  variant: number;
}

/**
 * Zona de juego rectangular (superficie blanda) que agrupa varios `PlayItem`.
 * Coordenadas de mundo; el render dibuja el suelo de caucho/arena bajo los juegos.
 */
export interface Playground {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Carácter de una manzana: parque, residencial (casas), mixto o denso (torres). */
export type District = 'park' | 'residential' | 'mixed' | 'dense';

/**
 * Manzana de la retícula (entre las líneas bi..bi+1 y bj..bj+1) y su distrito.
 * El render decide el suelo del patio según la composición real de la manzana:
 * cualquier edificio → asfalto gris; solo casas → césped con valla.
 */
export interface Block {
  bi: number;
  bj: number;
  district: District;
}

/**
 * Región rectangular del parque central, en bloques: ocupa las columnas
 * [bi0, bi0+w) y filas [bj0, bj0+h). Las carreteras INTERIORES a esta región se
 * eliminan para que las manzanas-parque se fundan en un único parque grande.
 */
export interface ParkRect {
  bi0: number;
  bj0: number;
  w: number;
  h: number;
}

export type MergeRect = ParkRect;

/** ¿La intersección (i,j) está estrictamente DENTRO del parque (sin calles)? */
export function parkInteriorNode(park: ParkRect, i: number, j: number): boolean {
  return rectInteriorNode(park, i, j);
}

/**
 * ¿El tramo de carretera se ha eliminado por ser interior del parque?
 * `axis` 'h' = línea horizontal `line` (=j), tramo entre columnas `seg` y `seg+1`.
 * `axis` 'v' = línea vertical `line` (=i), tramo entre filas `seg` y `seg+1`.
 * (Un tramo es interior si separa dos manzanas-parque.)
 */
export function parkSegRemoved(park: ParkRect, axis: 'h' | 'v', line: number, seg: number): boolean {
  return rectSegRemoved(park, axis, line, seg);
}

export function rectInteriorNode(rect: ParkRect, i: number, j: number): boolean {
  return i > rect.bi0 && i < rect.bi0 + rect.w && j > rect.bj0 && j < rect.bj0 + rect.h;
}

export function rectSegRemoved(rect: ParkRect, axis: 'h' | 'v', line: number, seg: number): boolean {
  if (axis === 'h') {
    return line > rect.bj0 && line < rect.bj0 + rect.h && seg >= rect.bi0 && seg < rect.bi0 + rect.w;
  }
  return line > rect.bi0 && line < rect.bi0 + rect.w && seg >= rect.bj0 && seg < rect.bj0 + rect.h;
}

export function removedInteriorNode(rects: readonly ParkRect[], i: number, j: number): boolean {
  return rects.some((r) => rectInteriorNode(r, i, j));
}

export function removedRoadSegment(rects: readonly ParkRect[], axis: 'h' | 'v', line: number, seg: number): boolean {
  return rects.some((r) => rectSegRemoved(r, axis, line, seg));
}

export interface CityModel {
  intersections: Intersection[];
  edges: RoadEdge[];
  /** Por intersección, ids de aristas salientes. */
  outgoing: number[][];
  buildings: Building[];
  trees: Tree[];
  /** Setos recortados que bordean las manzanas-parque. */
  hedges: Hedge[];
  /** Bancos colocados en manzanas-parque. */
  benches: Bench[];
  /** Juegos infantiles colocados en las zonas de juego de los parques grandes. */
  playItems: PlayItem[];
  /** Zonas de juego (superficie blanda) que agrupan los juegos. */
  playgrounds: Playground[];
  /** Manzanas con su distrito (para suelo de patio y vallas). */
  blocks: Block[];
  /** Región rectangular del parque central (carreteras interiores eliminadas). */
  park: ParkRect;
  /** Supermanzanas no-parque que eliminan calles interiores para romper la reticula. */
  mergedBlocks: MergeRect[];
  /** Semiextensión total de la ciudad (para suelo, cámara y niebla). */
  halfExtent: number;
  /** Pasos de cebra existentes (no todos los cruces los tienen en los 4 lados). */
  crosswalks: Set<number>;
  /** Intersecciones convertidas en rotonda (sin semáforo, ceder el paso). */
  roundabouts: Set<number>;
}

/** Clave de un paso de cebra concreto: (cruce, eje cruzado, lado de la acera). */
export function crosswalkKey(i: number, j: number, axis: RoadAxis, side: number): number {
  return (intersectionId(i, j) * 2 + (axis === 'NS' ? 0 : 1)) * 2 + (side < 0 ? 0 : 1);
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
