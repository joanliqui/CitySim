import { Rng } from '../../core/Rng';
import { BuildingFactory, type CourtyardKind, type DistrictSpec, type Footprint } from './BuildingFactory';
import type { ShopType } from './types/BuildingTypes';

/** Tienda baja con toldo y cartel; patio de asfalto. */
export class ShopFactory extends BuildingFactory {
  readonly type: ShopType = 'shop';
  readonly label = 'Tienda';
  readonly pedestrianWeight = 3;
  readonly courtyardKind: CourtyardKind = 'asphalt';

  protected footprint(rng: Rng, _spec: DistrictSpec): Footprint {
    return { front: rng.range(8.5, 12), depth: rng.range(7, 10), h: rng.range(4.2, 6.5) };
  }

  protected fillFactors(): { front: number; depth: number } {
    return { front: 0.88, depth: 0.9 };
  }
}
