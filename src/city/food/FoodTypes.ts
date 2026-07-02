/**
 * Catálogo de comida (datos puros, sin Three.js ni representación 3D por ahora).
 * Cada tipo de comida ocupa un ESPACIO distinto en la nevera (`size`, en unidades
 * abstractas de volumen) y, de cara a los sistemas de necesidades, aporta
 * `nourishment` (alimentación) e `hydration` (hidratación) al consumirse.
 *
 * Para añadir una comida nueva: añade la clave a `FoodKind` y su entrada al
 * `FOOD_CATALOG`. El resto (almacenaje en nevera, reparto) funciona sin tocar nada.
 */

/** Tipos de comida que se pueden almacenar. */
export type FoodKind =
  | 'manzana'
  | 'pan'
  | 'leche'
  | 'huevos'
  | 'queso'
  | 'pollo'
  | 'pescado'
  | 'tomate'
  | 'lechuga'
  | 'yogur'
  | 'zumo'
  | 'sandia';

/** Propiedades de un tipo de comida. */
export interface FoodDef {
  /** Nombre para UI (español). */
  label: string;
  /** Espacio que ocupa una unidad en la nevera (unidades abstractas de volumen). */
  size: number;
  /** Puntos de alimentación (0–100) que restaura al comerla. */
  nourishment: number;
  /** Puntos de hidratación (0–100) que restaura al consumirla. */
  hydration: number;
}

/** Tabla de tipos de comida con su tamaño y aporte. */
export const FOOD_CATALOG: Record<FoodKind, FoodDef> = {
  manzana: { label: 'Manzana', size: 4, nourishment: 8, hydration: 6 },
  pan: { label: 'Pan', size: 10, nourishment: 20, hydration: 0 },
  leche: { label: 'Leche', size: 14, nourishment: 10, hydration: 25 },
  huevos: { label: 'Huevos', size: 12, nourishment: 18, hydration: 2 },
  queso: { label: 'Queso', size: 8, nourishment: 22, hydration: 2 },
  pollo: { label: 'Pollo', size: 20, nourishment: 35, hydration: 5 },
  pescado: { label: 'Pescado', size: 16, nourishment: 30, hydration: 5 },
  tomate: { label: 'Tomate', size: 5, nourishment: 6, hydration: 12 },
  lechuga: { label: 'Lechuga', size: 9, nourishment: 5, hydration: 18 },
  yogur: { label: 'Yogur', size: 6, nourishment: 9, hydration: 12 },
  zumo: { label: 'Zumo', size: 13, nourishment: 8, hydration: 28 },
  sandia: { label: 'Sandía', size: 30, nourishment: 12, hydration: 40 },
};

/** Todas las claves del catálogo (para iterar / elegir al azar). */
export const FOOD_KINDS = Object.keys(FOOD_CATALOG) as FoodKind[];
