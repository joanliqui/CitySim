import { Rng } from '../../core/Rng';
import {
  CORRIDOR_HALF,
  SIDEWALK_CENTER,
  type Building,
  type District,
  type HouseInterior,
  type OfficeInterior,
} from '../CityModel';
import {
  FRONT_EDGE,
  insideBuildableRect,
  overlapsBuilding,
  overlapsClearance,
  type BuildableRect,
  type ClearanceCircle,
  type SideTag,
} from './placement';
import type { BuildingType } from './types/BuildingTypes';

/**
 * Especificación de un distrito edificable. El tercer peso de `types`
 * ([casa, tienda, OFICINA]) controla cuántos edificios ALTOS salen. Vive aquí
 * porque tanto las factorías (rango `tall`) como `DISTRICTS` lo usan.
 */
export interface DistrictSpec {
  /** Anchura objetivo de parcela: grande = pocas y amplias; pequeña = apretadas. */
  parcel: number;
  /** Pesos de tipo [casa, tienda, oficina]. */
  types: [number, number, number];
  /** Rango de altura de oficinas/edificios altos. */
  tall: [number, number];
  /** Árboles de patio interior por manzana. */
  courtyard: number;
}

/** Suelo de patio que aporta un edificio: césped (casas) o asfalto (comercial). */
export type CourtyardKind = 'green' | 'asphalt';

/** Dimensiones base de un edificio antes de ajustarlas al tramo disponible. */
export interface Footprint {
  /** Anchura de fachada (a lo largo de la calle). */
  front: number;
  /** Fondo (perpendicular a la calle). */
  depth: number;
  /** Altura. */
  h: number;
}

/** Contexto de colocación de un edificio en un lado de manzana. */
export interface BuildContext {
  side: SideTag;
  /** Coordenada del centro del hueco a lo largo de la calle. */
  center: number;
  /** Longitud del tramo asignado a este edificio. */
  segLen: number;
  /** Fondo disponible hacia el interior de la manzana. */
  maxDepth: number;
  /** Coordenada del eje de la calle a la que mira el edificio. */
  roadLine: number;
  district: Exclude<District, 'park'>;
  spec: DistrictSpec;
  buildable: BuildableRect;
  clearances: ClearanceCircle[];
  /** Edificios ya colocados (para evitar solapes). */
  buildings: Building[];
  /** Contador compartido por tipo (para numerar los nombres). */
  typeCount: Record<BuildingType, number>;
}

/**
 * Factoría abstracta de edificios. Encapsula la lógica COMPARTIDA de colocación
 * (orientación de fachada, puerta/aproximación, ajuste al tramo, colisiones,
 * color y nombre) y delega en cada subtipo solo lo que cambia: dimensiones,
 * factores de relleno, etiqueta, paleta e interior.
 *
 * Para añadir un tipo nuevo (casino, hospital, comisaría…) basta con extender
 * esta clase, definir sus hooks y registrarla en `registry.ts`.
 */
export abstract class BuildingFactory {
  /** Discriminante del edificio (debe coincidir con la clave del registro). */
  abstract readonly type: BuildingType;
  /** Etiqueta en español para el nombre ("Casa 1", "Tienda 3", …). */
  abstract readonly label: string;
  /** Peso de atracción para los destinos de los peatones. */
  abstract readonly pedestrianWeight: number;
  /** Suelo del patio que aporta este tipo a su manzana. */
  abstract readonly courtyardKind: CourtyardKind;

  /** Dimensiones base. Consume el RNG en el orden: front, depth, h. */
  protected abstract footprint(rng: Rng, spec: DistrictSpec): Footprint;
  /** Factores de relleno del tramo/fondo disponibles. */
  protected abstract fillFactors(): { front: number; depth: number };
  /** Interior (solo casas lo sobreescriben). No consume el RNG principal. */
  protected buildInterior(_x: number, _z: number, _w: number, _d: number, _faceX: number, _faceZ: number): HouseInterior | undefined {
    return undefined;
  }
  /** Interior multiplanta (solo edificios altos lo sobreescriben). No consume el RNG principal. */
  protected buildOfficeInterior(
    _x: number,
    _z: number,
    _w: number,
    _d: number,
    _h: number,
    _faceX: number,
    _faceZ: number,
  ): OfficeInterior | undefined {
    return undefined;
  }

  /**
   * Construye un edificio en el contexto dado, o devuelve null si no encaja.
   * Orden de consumo del RNG principal (debe mantenerse para reproducibilidad):
   * footprint (front, depth, h) → along (solo si hay holgura) → colorIdx.
   */
  build(rng: Rng, ctx: BuildContext): Building | null {
    const { side, center, segLen, maxDepth, roadLine, buildable, clearances, buildings, typeCount, spec } = ctx;

    const fp = this.footprint(rng, spec);
    const fill = this.fillFactors();
    const front = Math.min(Math.max(fp.front, segLen * fill.front), segLen - 1.0);
    const depth = Math.min(Math.max(fp.depth, maxDepth * fill.depth), maxDepth);
    if (front < 4 || depth < 2.5) return null;

    // Pequeña holgura lateral aleatoria dentro del tramo.
    const slack = (segLen - 1.6 - front) / 2;
    const along = center + (slack > 0 ? rng.range(-slack, slack) : 0);

    let x = 0;
    let z = 0;
    let faceX = 0;
    let faceZ = 0;
    let doorX = 0;
    let doorZ = 0;
    let w: number;
    let d: number;

    if (side === 'N' || side === 'S') {
      w = front;
      d = depth;
      x = along;
      doorX = along;
      if (side === 'N') {
        z = roadLine + FRONT_EDGE + depth / 2;
        faceZ = -1;
        doorZ = roadLine + SIDEWALK_CENTER;
      } else {
        z = roadLine - FRONT_EDGE - depth / 2;
        faceZ = 1;
        doorZ = roadLine - SIDEWALK_CENTER;
      }
    } else {
      w = depth;
      d = front;
      z = along;
      doorZ = along;
      if (side === 'W') {
        x = roadLine + FRONT_EDGE + depth / 2;
        faceX = -1;
        doorX = roadLine + SIDEWALK_CENTER;
      } else {
        x = roadLine - FRONT_EDGE - depth / 2;
        faceX = 1;
        doorX = roadLine - SIDEWALK_CENTER;
      }
    }

    if (!insideBuildableRect(x, z, w, d, buildable)) return null;
    if (overlapsClearance(x, z, w, d, clearances)) return null;
    if (overlapsBuilding(x, z, w, d, buildings)) return null;

    typeCount[this.type]++;
    const approachDist = CORRIDOR_HALF + 0.6;
    const interior = this.buildInterior(x, z, w, d, faceX, faceZ);
    const officeInterior = this.buildOfficeInterior(x, z, w, d, fp.h, faceX, faceZ);
    return {
      id: 0,
      type: this.type,
      name: `${this.label} ${typeCount[this.type]}`,
      x,
      z,
      w,
      d,
      h: fp.h,
      faceX,
      faceZ,
      colorIdx: rng.int(0, 6),
      door: { x: doorX, z: doorZ },
      approach: {
        x: faceX !== 0 ? doorX - faceX * (approachDist - SIDEWALK_CENTER) : doorX,
        z: faceZ !== 0 ? doorZ - faceZ * (approachDist - SIDEWALK_CENTER) : doorZ,
      },
      doorNode: -1,
      interior,
      officeInterior,
    };
  }
}
