import { Rng } from '../../../core/Rng';
import type { ShopKind } from '../types/BuildingTypes';
import { GenericShopSubFactory } from './GenericShopSubFactory';
import type { ShopSubFactory } from './ShopSubFactory';
import { SpecialtyShopSubFactory } from './SpecialtyShopSubFactory';
import { SPECIALTY_SHOPS } from './specialtyShops';
import { SupermarketSubFactory } from './SupermarketSubFactory';

/**
 * Registro de sub-factorías de tienda por `ShopKind`. Espejo interno del registro
 * de `BuildingType`, un nivel más abajo. Para añadir una tienda nueva: crea su
 * `ShopSubFactory`, su clave en `ShopKind` y su `ShopSubRenderer`, y regístralas
 * aquí y en el registro de render de tiendas (los gremios comparten factoría
 * parametrizada por su spec de `specialtyShops.ts`).
 */
export const shopSubFactories: Record<ShopKind, ShopSubFactory> = {
  generic: new GenericShopSubFactory(),
  supermarket: new SupermarketSubFactory(),
  fruteria: new SpecialtyShopSubFactory(SPECIALTY_SHOPS.fruteria),
  carniceria: new SpecialtyShopSubFactory(SPECIALTY_SHOPS.carniceria),
  pescaderia: new SpecialtyShopSubFactory(SPECIALTY_SHOPS.pescaderia),
  ropa: new SpecialtyShopSubFactory(SPECIALTY_SHOPS.ropa),
  farmacia: new SpecialtyShopSubFactory(SPECIALTY_SHOPS.farmacia),
  electronica: new SpecialtyShopSubFactory(SPECIALTY_SHOPS.electronica),
  libreria: new SpecialtyShopSubFactory(SPECIALTY_SHOPS.libreria),
};

/** Subtipos que salen en parcela normal (excluye especiales y pesos 0). */
const PARCEL_SHOPS: readonly ShopSubFactory[] = Object.values(shopSubFactories).filter(
  (f) => f.placement === 'parcel' && f.parcelWeight > 0,
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
