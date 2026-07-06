import { Rng } from '../../../core/Rng';
import { makeShopInterior } from '../interior/shopInterior';
import type { MarketInterior } from '../interior/types';
import type { DistrictSpec, Footprint } from '../BuildingFactory';
import type { ShopKind } from '../types/BuildingTypes';
import type { ShopSubFactory } from './ShopSubFactory';
import type { SpecialtyShopSpec } from './specialtyShops';

/**
 * Tienda de gremio (frutería, carnicería, ropa…): local bajo de parcela normal,
 * con interior propio según su spec del catálogo (`specialtyShops.ts`). Una
 * única clase cubre todos los gremios — cada instancia se registra con su spec.
 */
export class SpecialtyShopSubFactory implements ShopSubFactory {
  readonly shopKind: ShopKind;
  readonly label: string;
  readonly placement = 'parcel' as const;
  readonly parcelWeight: number;

  constructor(private readonly spec: SpecialtyShopSpec) {
    this.shopKind = spec.kind;
    this.label = spec.label;
    this.parcelWeight = spec.weight;
  }

  footprint(rng: Rng, _spec: DistrictSpec): Footprint {
    // Mismos rangos (y mismo consumo del RNG) que la tienda genérica a la que
    // sustituyen: la trama de la ciudad no cambia, solo el gremio de cada local.
    return { front: rng.range(10.5, 14.5), depth: rng.range(9, 12), h: rng.range(4.6, 7) };
  }

  fillFactors(): { front: number; depth: number } {
    return { front: 0.88, depth: 0.9 };
  }

  /** Interior del local (reutiliza `MarketInterior`). No consume el RNG principal. */
  buildMarketInterior(x: number, z: number, w: number, d: number, _h: number, faceX: number, faceZ: number): MarketInterior {
    return makeShopInterior(this.spec, x, z, w, d, faceX, faceZ);
  }
}
