import { Rng } from '../../../core/Rng';
import type { MarketInterior } from '../interior/types';
import type { DistrictSpec, Footprint } from '../BuildingFactory';
import type { ShopKind } from '../types/BuildingTypes';

/**
 * Sub-factoría de un subtipo de tienda. Todas las tiendas comparten la colocación
 * y los metadatos de nivel `BuildingType` (peso peatonal, patio, paleta) que viven
 * en `ShopFactory`; cada `ShopSubFactory` solo aporta lo que varía por subtipo:
 * dimensiones, factores de relleno, etiqueta e interior.
 *
 * `ShopFactory.place()` (el cuerpo compartido de `BuildingFactory`) usa estos
 * hooks en lugar de los suyos cuando construye una tienda.
 */
export interface ShopSubFactory {
  /** Discriminante del subtipo (debe coincidir con la clave del registro). */
  readonly shopKind: ShopKind;
  /** Etiqueta en español para el nombre ("Tienda 3", "Supermercado 1", …). */
  readonly label: string;
  /**
   * Cómo se coloca este subtipo:
   *  - `parcel`  → sale por el peso `shop` del distrito, en una parcela normal.
   *  - `special` → se coloca en un pase aparte (nave grande); excluido del picker.
   */
  readonly placement: 'parcel' | 'special';
  /** Peso relativo para elegir entre subtipos de parcela (ignorado si `special`). */
  readonly parcelWeight: number;

  /** Dimensiones base. Consume el RNG en el orden: front, depth, h. */
  footprint(rng: Rng, spec: DistrictSpec): Footprint;
  /** Factores de relleno del tramo/fondo disponibles. */
  fillFactors(): { front: number; depth: number };
  /** Interior de supermercado (solo el súper lo implementa). No consume el RNG principal. */
  buildMarketInterior?(
    x: number,
    z: number,
    w: number,
    d: number,
    faceX: number,
    faceZ: number,
  ): MarketInterior | undefined;
}
