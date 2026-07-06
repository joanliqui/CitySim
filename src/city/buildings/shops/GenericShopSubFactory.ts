import { Rng } from '../../../core/Rng';
import type { DistrictSpec, Footprint } from '../BuildingFactory';
import type { ShopKind } from '../types/BuildingTypes';
import type { ShopSubFactory } from './ShopSubFactory';

/**
 * Tienda baja sin gremio (toldo + cartel, caja maciza). Ya NO sale en parcela
 * (peso 0): la sustituyen las tiendas de gremio de `specialtyShops.ts`. Se
 * conserva como fallback de los hooks abstractos y del render sin `shopKind`.
 */
export class GenericShopSubFactory implements ShopSubFactory {
  readonly shopKind: ShopKind = 'generic';
  readonly label = 'Tienda';
  readonly placement = 'parcel' as const;
  readonly parcelWeight = 0;

  footprint(rng: Rng, _spec: DistrictSpec): Footprint {
    return { front: rng.range(10.5, 14.5), depth: rng.range(9, 12), h: rng.range(4.6, 7) };
  }

  fillFactors(): { front: number; depth: number } {
    return { front: 0.88, depth: 0.9 };
  }
}
