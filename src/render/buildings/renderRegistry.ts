import type { BuildingType } from '../../city/buildings/types/BuildingTypes';
import type { BuildingRenderer } from './BuildingRenderer';
import { HouseRenderer } from './HouseRenderer';
import { OfficeRenderer } from './OfficeRenderer';
import { ShopRenderer } from './ShopRenderer';

/**
 * Registro de renderers por tipo. Espejo del registro de factorías de creación
 * (`src/city/buildings/registry.ts`): añadir un tipo nuevo = registrar aquí su
 * renderer y allí su factoría, sin tocar el bucle de `CityMesh`.
 */
export const buildingRenderers: Record<BuildingType, BuildingRenderer> = {
  house: new HouseRenderer(),
  shop: new ShopRenderer(),
  office: new OfficeRenderer(),
};
