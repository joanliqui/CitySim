/**
 * Secciones de un supermercado (datos puros, sin Three.js). Cada estantería (o
 * cada CARA de una góndola doble) se dedica a UNA sección; las secciones
 * frescas (fruta, pescadería, carnicería) van ligadas a su mueble propio.
 *
 * Es un concepto de TIENDA, distinto de `FoodKind` (la unidad concreta que se
 * guarda en una nevera, ver `src/city/food/FoodTypes.ts`). Más adelante, cuando
 * los NPC vayan a comprar, cada sección producirá ciertos `FoodKind` (p. ej.
 * leche/yogur/queso salen de `lacteos`) y el peatón buscará en
 * `marketInterior.furniture` la pieza cuyo `sections` contenga la que necesita.
 *
 * Para añadir una sección nueva: añade la clave a `MarketSection` y su entrada
 * al catálogo; si es de estantería, inclúyela también en `SHELF_SECTIONS`. El
 * reparto por estanterías y el render funcionan sin tocar nada más.
 */

/** Secciones de un supermercado (y de las tiendas de gremio). */
export type MarketSection =
  /* Frescos con mueble propio (frutería y mostradores del fondo). */
  | 'fruta'
  | 'pescaderia'
  | 'carniceria'
  /* Secciones de estantería (se reparten entre góndolas y estantería de pared). */
  | 'lacteos'
  | 'cereales'
  | 'panaderia'
  | 'pasta'
  | 'conservas'
  | 'snacks'
  | 'bebidas'
  | 'congelados'
  | 'higiene'
  | 'limpieza'
  | 'mascotas'
  /* Secciones EXCLUSIVAS de las tiendas de gremio (no están en `SHELF_SECTIONS`,
   * así que el súper no las reparte por sus góndolas). */
  | 'ropa'
  | 'farmacia'
  | 'electronica'
  | 'libros';

/** Propiedades de una sección. */
export interface MarketSectionDef {
  /** Nombre para UI (español). */
  label: string;
  /** Color base de los productos/cartel de la sección (hex). */
  color: number;
}

/** Tabla de secciones con su etiqueta y color. */
export const MARKET_SECTION_CATALOG: Record<MarketSection, MarketSectionDef> = {
  fruta: { label: 'Frutería', color: 0x5a9e4b },
  pescaderia: { label: 'Pescadería', color: 0x4f89b0 },
  carniceria: { label: 'Carnicería', color: 0xc0504d },
  lacteos: { label: 'Lácteos', color: 0xeae6da },
  cereales: { label: 'Cereales y desayuno', color: 0xd9a441 },
  panaderia: { label: 'Panadería', color: 0xb97a3c },
  pasta: { label: 'Pasta y arroz', color: 0xe3c84a },
  conservas: { label: 'Conservas', color: 0x8a9a5b },
  snacks: { label: 'Snacks y dulces', color: 0xd15fa6 },
  bebidas: { label: 'Bebidas', color: 0x4f6fd0 },
  congelados: { label: 'Congelados', color: 0x7fd0e8 },
  higiene: { label: 'Higiene personal', color: 0x5fc9c0 },
  limpieza: { label: 'Limpieza y droguería', color: 0x9a5fd0 },
  mascotas: { label: 'Mascotas', color: 0xd97b2f },
  ropa: { label: 'Ropa y moda', color: 0xb0507e },
  farmacia: { label: 'Parafarmacia', color: 0x58c092 },
  electronica: { label: 'Electrónica', color: 0x46566a },
  libros: { label: 'Libros y papelería', color: 0xa8703e },
};

/** Secciones que se reparten entre las estanterías (góndolas y pared). */
export const SHELF_SECTIONS: readonly MarketSection[] = [
  'lacteos',
  'cereales',
  'panaderia',
  'pasta',
  'conservas',
  'snacks',
  'bebidas',
  'congelados',
  'higiene',
  'limpieza',
  'mascotas',
];
