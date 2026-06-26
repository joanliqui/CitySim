import { Rng } from '../../../../core/Rng';
import type { Furniture, RoomRect } from '../types';
import type { Rect } from './placement';

/** Geometría de la casa que contiene la estancia a amueblar. */
export interface HouseGeom {
  x: number;
  z: number;
  w: number;
  d: number;
  /** Grosor de muro. */
  t: number;
  /** Vector unitario hacia la fachada/puerta exterior. */
  faceX: number;
  faceZ: number;
}

/**
 * Estado compartido mientras se amuebla una estancia. Cada factoría lee lo que
 * necesita y engorda `occupied` (y la cama fija `bed` para que mesitas y
 * alfombra se apoyen en ella).
 */
export interface FurnishContext {
  room: RoomRect;
  house: HouseGeom;
  /** Superficie útil de la estancia (remetida medio tabique + zócalo). */
  usable: Rect;
  /** Corredores de paso frente a las puertas (no se deben invadir). */
  zones: Rect[];
  /** Huellas ya ocupadas (se va engordando a medida que se coloca). */
  occupied: Rect[];
  /** La cama, una vez colocada. */
  bed: Furniture | null;
  /** La mesa de comedor, una vez colocada (las sillas y la alfombra se apoyan en ella). */
  table?: Furniture | null;
  /** El sofá, una vez colocado (la mesa de centro y el televisor se orientan a él). */
  sofa?: Furniture | null;
  /** Mueble bajo del baño, si existe; el lavamanos puede apoyarse encima. */
  bathVanity?: Furniture | null;
  /** Estantería abierta del baño, si existe. */
  bathShelf?: Furniture | null;
  /** Último mueble bajo de cocina colocado; el microondas y los armarios altos se apoyan/cuelgan sobre él. */
  kitchenCounter?: Furniture | null;
}

/**
 * Factoría de una pieza de mobiliario. Crea y coloca su(s) pieza(s) en el
 * contexto, marca lo que ocupa y devuelve lo añadido (vacío si no cabe).
 *
 * Para añadir una pieza (escritorio, estantería, lámpara…): crea su factoría,
 * regístrala en `registry.ts` y añádela a la receta de un `*Furnisher`.
 */
export interface FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[];
}
