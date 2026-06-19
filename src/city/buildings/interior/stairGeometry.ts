import type { Vec2 } from '../../CityModel';
import type { HouseInterior, StairCore } from './types';

/* ── Geometría pura del ojo de escalera de los edificios altos ───────────────
 * Estas funciones describen el ojo de escalera y el recorrido caminable de un
 * edificio alto SIN depender de Three.js. Son la ÚNICA fuente de verdad:
 *  - `src/render/CityMesh.ts` las usa para DIBUJAR la escalera (peldaños, mesetas).
 *  - `src/sim/PedestrianSystem.ts` las usa para que el peatón camine EXACTAMENTE
 *    por encima de la escalera dibujada al subir/bajar a su vivienda.
 * Si cambian estas fórmulas, render y simulación se mueven juntos.
 */

/** Caja en planta de un edificio (lo que necesita el cálculo del ojo). */
export interface FootprintBox {
  x: number;
  z: number;
  w: number;
  d: number;
  faceX: number;
  faceZ: number;
}

/** Ojo de escalera: rectángulo + vector unitario fachada→fondo (eje de subida). */
export interface OfficeShaft {
  x: number;
  z: number;
  depth: number;
  width: number;
  vX: number;
  vZ: number;
}

/** Cota de la cara superior del forjado sobre el `yBase` de cada planta. */
export const FLOOR_TOP = 0.18;

/** Ojo de escalera. Núcleo al fondo: rectángulo al fondo dejando rellano por
 *  delante. Núcleo lateral: rectángulo que recorre todo el fondo, dejando un
 *  rellano lateral junto a la puerta de la vivienda. */
export function officeShaft(b: FootprintBox, core: StairCore): OfficeShaft {
  const faceZ = b.faceZ !== 0;
  if (!core.side) {
    const vX = -b.faceX;
    const vZ = -b.faceZ; // dirección fachada → fondo (eje de subida)
    const coreDepth = faceZ ? core.d : core.w;
    const coreWidth = faceZ ? core.w : core.d;
    // Reservamos un rellano AMPLIO por delante (entre la puerta y el arranque de la
    // escalera) y un pequeño retranqueo contra el muro del fondo.
    const FRONT_RELLANO = 2.0;
    const BACK_INSET = 0.2;
    const depth = Math.max(2.2, coreDepth - BACK_INSET - FRONT_RELLANO);
    const width = Math.min(coreWidth - 0.8, Math.max(3.6, coreWidth * 0.6));
    const halfV = (faceZ ? b.d : b.w) / 2;
    const backX = b.x + vX * halfV;
    const backZ = b.z + vZ * halfV;
    const x = backX - vX * (BACK_INSET + depth / 2);
    const z = backZ - vZ * (BACK_INSET + depth / 2);
    return { x, z, depth, width, vX, vZ };
  }
  // ── Núcleo LATERAL: la escalera sube a lo largo del FONDO (eje perpendicular a
  // la fachada). El ojo es COMPACTO (no ocupa todo el fondo: con escalones
  // realistas un ojo enorme daría peldaños gigantes); se pega al fondo del núcleo
  // y a su muro exterior, dejando una franja de rellano lateral (lado −normal,
  // junto a la puerta de la vivienda) y el resto del fondo como suelo/pasillo. ──
  const vX = -b.faceX;
  const vZ = -b.faceZ; // eje de subida = profundidad
  const perpFull = faceZ ? b.d : b.w; // fondo total
  const coreAlong = faceZ ? core.w : core.d; // ancho del núcleo (a lo largo de fachada)
  const INSET = 0.2;
  const SIDE_RELLANO = 1.4; // franja de rellano junto a la puerta de la vivienda
  const STAIR_DEPTH = 4.8; // fondo del ojo: cabe un ida y vuelta cómodo
  const depth = Math.max(2.4, Math.min(perpFull - 2 * INSET, STAIR_DEPTH));
  const width = Math.max(2.2, coreAlong - SIDE_RELLANO - INSET);
  // Desplazamiento del centro del ojo: hacia el muro exterior (+normal) en el eje
  // del ancho, y hacia el fondo (+v) en el eje de profundidad.
  const aOff = coreAlong / 2 - INSET - width / 2;
  const dOff = perpFull / 2 - INSET - depth / 2;
  const x = faceZ ? core.x + core.nX * aOff : b.x + vX * dOff;
  const z = faceZ ? b.z + vZ * dOff : core.z + core.nZ * aOff;
  return { x, z, depth, width, vX, vZ };
}

/** Reparto de un ida y vuelta en el fondo del ojo `shaftD` para subir `floorH`:
 *  escalones de tamaño realista (contrahuella ≈0.18, huella ≈0.27), una meseta de
 *  giro al fondo y un rellano de planta al frente con el resto del fondo. */
export function stairLayout(shaftD: number, floorH: number) {
  const halfRise = floorH / 2;
  const RISE = 0.18; // contrahuella objetivo
  const GOING = 0.27; // huella objetivo
  const N = Math.max(3, Math.round(halfRise / RISE)); // escalones por tramo
  const rise = halfRise / N;
  const landBack = Math.min(1.4, Math.max(1.0, shaftD * 0.3)); // meseta de giro (fondo)
  const availRun = Math.max(0.6, shaftD - landBack);
  const going = Math.min(GOING, availRun / N);
  const flightRun = going * N;
  const frontLand = Math.max(0, shaftD - landBack - flightRun); // rellano de planta (frente)
  return { N, rise, going, halfRise, landBack, flightRun, frontLand };
}

/** Punto 3D del recorrido (coordenadas de mundo + cota de la superficie pisable). */
export interface StairPoint {
  x: number;
  z: number;
  y: number;
}

/**
 * Polilínea caminable que sube de la planta `floor-1` a la `floor` por el ojo de
 * escalera, siguiendo el ida-y-vuelta que dibuja `addStairwell`: rellano de planta
 * → Tramo 1 (un lado, sube media planta) → meseta de giro al fondo → Tramo 2 (lado
 * opuesto, sube la otra media) → rellano de la planta superior. La `y` es la cota
 * de la superficie pisada (cara superior del peldaño/meseta/forjado).
 */
export function stairWaypoints(shaft: OfficeShaft, floorH: number, floor: number): StairPoint[] {
  const { x: sx, z: sz, depth: shaftD, width: shaftW, vX, vZ } = shaft;
  const uX = -vZ; // eje transversal (ancho del ojo)
  const uZ = vX;
  const { halfRise, landBack, flightRun, frontLand } = stairLayout(shaftD, floorH);
  const uOff = shaftW * 0.3; // separación de cada tramo respecto al ojo central
  const yBase = (floor - 1) * floorH;
  const frontX = sx - vX * (shaftD / 2);
  const frontZ = sz - vZ * (shaftD / 2);
  // Punto del frame local (s a lo largo del eje de subida desde el frente, o transversal).
  const at = (s: number, o: number, y: number): StairPoint => ({
    x: frontX + vX * s + uX * o,
    z: frontZ + vZ * s + uZ * o,
    y,
  });
  const topLower = yBase + FLOOR_TOP; // rellano de planta inferior
  const topTurn = yBase + halfRise; // meseta de giro al fondo
  const topUpper = yBase + floorH + FLOOR_TOP; // rellano de planta superior
  return [
    at(frontLand / 2, 0, topLower), // rellano de planta inferior (frente)
    at(frontLand, uOff, topLower), // arranque del Tramo 1
    at(frontLand + flightRun, uOff, topTurn), // fin del Tramo 1 (fondo)
    at(frontLand + flightRun + landBack / 2, 0, topTurn), // centro de la meseta de giro
    at(frontLand + flightRun, -uOff, topTurn), // arranque del Tramo 2 (fondo, lado opuesto)
    at(frontLand, -uOff, topUpper), // fin del Tramo 2 (frente, planta superior)
    at(frontLand / 2, 0, topUpper), // rellano de planta superior (frente)
  ];
}

/** Cota de la superficie pisable de una planta (0 = baja; >0 = plantas altas). */
export function floorSurfaceY(floor: number, floorH: number): number {
  return floor <= 0 ? 0 : floor * floorH + FLOOR_TOP;
}

/**
 * Punto donde se queda de pie un peatón dentro de una vivienda: el centro de la
 * estancia de mayor área. Determinista (sin RNG) para no perturbar la ciudad.
 */
export function interiorStandPoint(interior: HouseInterior): Vec2 {
  let best = interior.rooms[0];
  let bestArea = best ? (best.x1 - best.x0) * (best.z1 - best.z0) : 0;
  for (const r of interior.rooms) {
    const a = (r.x1 - r.x0) * (r.z1 - r.z0);
    if (a > bestArea) {
      bestArea = a;
      best = r;
    }
  }
  if (!best) return { x: 0, z: 0 };
  return { x: (best.x0 + best.x1) / 2, z: (best.z0 + best.z1) / 2 };
}
