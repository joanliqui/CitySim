import { Rng } from '../../core/Rng';
import type { HouseInterior } from '../CityModel';
import { BuildingFactory, type CourtyardKind, type DistrictSpec, type Footprint } from './BuildingFactory';
import { makeHouseInterior, WALL_T } from './interior/houseInterior';
import type { HouseType } from './types/BuildingTypes';

/** Casa baja con jardín y distribución interior (estancias + tabiques + muebles). */
export class HouseFactory extends BuildingFactory {
  readonly type: HouseType = 'house';
  readonly label = 'Casa';
  readonly pedestrianWeight = 1.6;
  readonly courtyardKind: CourtyardKind = 'green';

  protected footprint(rng: Rng, _spec: DistrictSpec): Footprint {
    return { front: rng.range(9.5, 13), depth: rng.range(9, 12), h: rng.range(4.4, 6.2) };
  }

  protected fillFactors(): { front: number; depth: number } {
    return { front: 0.84, depth: 0.84 };
  }

  protected buildInterior(x: number, z: number, w: number, d: number, faceX: number, faceZ: number): HouseInterior {
    // Toda casa tiene COMO MÍNIMO 3 estancias: dormitorio, baño (la más pequeña)
    // y cocina-comedor (cocina americana en el salón de entrada). Si el interior
    // da holgura para una cocina INDEPENDIENTE además del salón-comedor, exige una
    // 4ª estancia y quedan separados. En casas muy estrechas (distrito denso) la
    // subdivisión forzada puede no alcanzar el mínimo; entonces se queda con las
    // estancias que físicamente caben.
    const usableArea = (w - 2 * WALL_T) * (d - 2 * WALL_T);
    const minRooms = usableArea >= 42 ? 4 : 3;
    return makeHouseInterior(x, z, w, d, faceX, faceZ, 0, minRooms);
  }
}
