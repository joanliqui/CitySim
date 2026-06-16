import { Rng } from '../../core/Rng';
import type { HouseInterior } from '../CityModel';
import { BuildingFactory, type CourtyardKind, type DistrictSpec, type Footprint } from './BuildingFactory';
import { makeHouseInterior } from './interior/houseInterior';
import type { HouseType } from './types/BuildingTypes';

/** Casa baja con jardín y distribución interior (estancias + tabiques + muebles). */
export class HouseFactory extends BuildingFactory {
  readonly type: HouseType = 'house';
  readonly label = 'Casa';
  readonly pedestrianWeight = 1.6;
  readonly courtyardKind: CourtyardKind = 'green';

  protected footprint(rng: Rng, _spec: DistrictSpec): Footprint {
    return { front: rng.range(7.5, 10.5), depth: rng.range(7, 10), h: rng.range(3.4, 5.2) };
  }

  protected fillFactors(): { front: number; depth: number } {
    return { front: 0.84, depth: 0.84 };
  }

  protected buildInterior(x: number, z: number, w: number, d: number, faceX: number, faceZ: number): HouseInterior {
    return makeHouseInterior(x, z, w, d, faceX, faceZ);
  }
}
