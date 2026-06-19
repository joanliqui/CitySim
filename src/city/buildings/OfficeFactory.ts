import { Rng } from '../../core/Rng';
import type { OfficeInterior } from '../CityModel';
import { BuildingFactory, type CourtyardKind, type DistrictSpec, type Footprint } from './BuildingFactory';
import { FLOOR_H, makeOfficeInterior } from './interior/officeInterior';
import type { OfficeType } from './types/BuildingTypes';

/** Edificio alto de oficinas (la altura sale del rango `tall` del distrito). */
export class OfficeFactory extends BuildingFactory {
  readonly type: OfficeType = 'office';
  readonly label = 'Edificio';
  readonly pedestrianWeight = 1;
  readonly courtyardKind: CourtyardKind = 'asphalt';

  protected footprint(rng: Rng, spec: DistrictSpec): Footprint {
    // Huella mayor que antes: cada planta debe alojar el rellano + una vivienda.
    // La altura se cuantiza a un nº entero de plantas (FLOOR_H) para que el
    // interior multiplanta encaje exactamente. Se mantienen 3 extracciones del
    // RNG en orden (front, depth, h).
    const front = rng.range(12.5, 15.5);
    const depth = rng.range(11, 15);
    const rawH = rng.range(spec.tall[0], spec.tall[1]);
    const floors = Math.max(2, Math.round(rawH / FLOOR_H));
    return { front, depth, h: floors * FLOOR_H };
  }

  protected fillFactors(): { front: number; depth: number } {
    return { front: 0.92, depth: 0.95 };
  }

  protected buildOfficeInterior(x: number, z: number, w: number, d: number, h: number, faceX: number, faceZ: number): OfficeInterior | undefined {
    return makeOfficeInterior(x, z, w, d, h, faceX, faceZ);
  }
}
