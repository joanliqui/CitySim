import { Rng } from '../../core/Rng';
import { BuildingFactory } from './BuildingFactory';
import { HouseFactory } from './HouseFactory';
import { OfficeFactory } from './OfficeFactory';
import { ShopFactory } from './ShopFactory';
import type { BuildingType } from './types/BuildingTypes';

/**
 * Registro de factorías por tipo. Para añadir un edificio nuevo: crea su
 * factoría, su clave en `BuildingType` (CityModel) y su renderer, y regístralos
 * aquí y en el registro de render.
 */
export const buildingFactories: Record<BuildingType, BuildingFactory> = {
  house: new HouseFactory(),
  shop: new ShopFactory(),
  office: new OfficeFactory(),
};

/**
 * Orden canónico de los pesos `[casa, tienda, oficina]` de cada distrito. Debe
 * coincidir con el de `DistrictSpec.types` para que `rng.weighted` reproduzca
 * exactamente la selección original.
 */
const WEIGHT_ORDER: readonly BuildingType[] = ['house', 'shop', 'office'];

/** Elige una factoría según los pesos del distrito (reemplaza a `pickType`). */
export function pickFactory(rng: Rng, weights: [number, number, number]): BuildingFactory {
  return buildingFactories[WEIGHT_ORDER[rng.weighted(weights)]];
}
