import { Rng } from '../../../core/Rng';
import type { ShopKind } from '../types/BuildingTypes';
import { GenericShopSubFactory } from './GenericShopSubFactory';
import type { ShopSubFactory } from './ShopSubFactory';
import { SupermarketSubFactory } from './SupermarketSubFactory';

/**
 * Registro de sub-factorías de tienda por `ShopKind`. Espejo interno del registro
 * de `BuildingType`, un nivel más abajo. Para añadir una tienda nueva: crea su
 * `ShopSubFactory`, su clave en `ShopKind` y su `ShopSubRenderer`, y regístralas
 * aquí y en el registro de render de tiendas.
 */
export const shopSubFactories: Record<ShopKind, ShopSubFactory> = {
  generic: new GenericShopSubFactory(),
  supermarket: new SupermarketSubFactory(),
};

/** Subtipos que salen en parcela normal (excluye los de colocación especial). */
const PARCEL_SHOPS: readonly ShopSubFactory[] = Object.values(shopSubFactories).filter(
  (f) => f.placement === 'parcel',
);

/**
 * Elige un subtipo de tienda de PARCELA según su `parcelWeight`. Consume una
 * extracción del RNG principal (rebaraja la ciudad respecto a antes de existir
 * los subtipos, pero mantiene el reparto reproducible para una misma seed).
 */
export function pickParcelShop(rng: Rng): ShopSubFactory {
  const i = rng.weighted(PARCEL_SHOPS.map((f) => f.parcelWeight));
  return PARCEL_SHOPS[i];
}
