import type { MarketSection } from '../interior/marketSections';
import type { ShopKind } from '../types/BuildingTypes';

/** Gremios de tienda de parcela (todo `ShopKind` salvo el fallback y el súper). */
export type SpecialtyShopKind = Exclude<ShopKind, 'generic' | 'supermarket'>;

/**
 * Spec de una tienda de gremio (datos puros). Una única `SpecialtyShopSubFactory`
 * y un único `SpecialtyShopRenderer`, parametrizados por esta spec, cubren todos
 * los gremios: para añadir uno nuevo basta su clave en `ShopKind` + una entrada
 * aquí + registrarlo en los dos registros de tienda.
 */
export interface SpecialtyShopSpec {
  kind: SpecialtyShopKind;
  /** Etiqueta en español para el nombre ("Frutería 3", "Farmacia 1", …). */
  label: string;
  /** Peso relativo en el picker de tiendas de parcela. */
  weight: number;
  /**
   * Distribución del interior (ver `shopInterior.ts`):
   *  - `shelves` → estanterías de pared + góndolas centrales.
   *  - `counter` → mostrador de servicio al fondo (carnicería/pescadería).
   *  - `produce` → expositores inclinados de fruta + islas centrales.
   */
  layout: 'shelves' | 'counter' | 'produce';
  /** Solo layout `counter`: expositor del fondo (mostrador con bandejas). */
  backCounter?: 'fishCounter' | 'meatCounter';
  /** Secciones que se reparten por las estanterías (colores del producto). */
  shelfSections: readonly MarketSection[];
  /** Color del rótulo de fachada. */
  fascia: number;
  /** Color del toldo sobre la puerta. */
  awning: number;
}

/** Catálogo de gremios: qué tiendas salen en parcela y con qué pinta. */
export const SPECIALTY_SHOPS: Record<SpecialtyShopKind, SpecialtyShopSpec> = {
  fruteria: {
    kind: 'fruteria',
    label: 'Frutería',
    weight: 1.4,
    layout: 'produce',
    shelfSections: ['fruta'],
    fascia: 0x3f9e4d,
    awning: 0x5fb56a,
  },
  carniceria: {
    kind: 'carniceria',
    label: 'Carnicería',
    weight: 1,
    layout: 'counter',
    backCounter: 'meatCounter',
    shelfSections: ['carniceria', 'conservas'],
    fascia: 0xc0504d,
    awning: 0xd97b6f,
  },
  pescaderia: {
    kind: 'pescaderia',
    label: 'Pescadería',
    weight: 1,
    layout: 'counter',
    backCounter: 'fishCounter',
    shelfSections: ['pescaderia', 'conservas'],
    fascia: 0x3f6fb0,
    awning: 0x6f9fd0,
  },
  ropa: {
    kind: 'ropa',
    label: 'Tienda de ropa',
    weight: 1.4,
    layout: 'shelves',
    shelfSections: ['ropa'],
    fascia: 0xb0507e,
    awning: 0xd07fa8,
  },
  farmacia: {
    kind: 'farmacia',
    label: 'Farmacia',
    weight: 1,
    layout: 'shelves',
    shelfSections: ['farmacia', 'higiene'],
    fascia: 0x2f9e62,
    awning: 0x4fb582,
  },
  electronica: {
    kind: 'electronica',
    label: 'Electrónica',
    weight: 1,
    layout: 'shelves',
    shelfSections: ['electronica'],
    fascia: 0x35507e,
    awning: 0x5a76a8,
  },
  libreria: {
    kind: 'libreria',
    label: 'Librería',
    weight: 1,
    layout: 'shelves',
    shelfSections: ['libros'],
    fascia: 0x8a5a2b,
    awning: 0xb08348,
  },
};
