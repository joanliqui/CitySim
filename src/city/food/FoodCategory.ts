/**
 * Categorías de sección de un supermercado (datos puros, sin Three.js). Cada
 * pasillo del súper se dedica a UNA categoría; es un concepto de TIENDA, distinto
 * de `FoodKind` (la unidad concreta que se guarda en una nevera, ver `FoodTypes`).
 * Más adelante se enlazarán (cada categoría producirá ciertos `FoodKind`).
 *
 * Para añadir una sección nueva: añade la clave a `FoodCategory` y su entrada al
 * `FOOD_CATEGORY_CATALOG`. El reparto de pasillos funciona sin tocar nada más.
 */

/** Secciones de comida de un supermercado. */
export type FoodCategory =
  | 'carne'
  | 'pescado'
  | 'fruta'
  | 'verdura'
  | 'cereales'
  | 'lacteos'
  | 'bebidas';

/** Propiedades de una sección. */
export interface FoodCategoryDef {
  /** Nombre para UI (español). */
  label: string;
  /** Color representativo del cartel/estanterías de la sección (hex). */
  color: number;
}

/** Tabla de secciones con su etiqueta y color de cartel. */
export const FOOD_CATEGORY_CATALOG: Record<FoodCategory, FoodCategoryDef> = {
  carne: { label: 'Carnicería', color: 0xc0504d },
  pescado: { label: 'Pescadería', color: 0x4f89b0 },
  fruta: { label: 'Frutería', color: 0xe0a53a },
  verdura: { label: 'Verdulería', color: 0x5a9e4b },
  cereales: { label: 'Cereales', color: 0xc9a86a },
  lacteos: { label: 'Lácteos', color: 0xe8e4d8 },
  bebidas: { label: 'Bebidas', color: 0x6f6fb0 },
};

/** Todas las claves del catálogo (para iterar / repartir por pasillos). */
export const FOOD_CATEGORIES = Object.keys(FOOD_CATEGORY_CATALOG) as FoodCategory[];
