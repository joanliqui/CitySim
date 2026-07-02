import { Rng } from '../../core/Rng';
import type { Building } from '../CityModel';
import { BuildingFactory, type BuildContext, type CourtyardKind, type DistrictSpec, type Footprint } from './BuildingFactory';
import { pickParcelShop, shopSubFactories } from './shops/shopRegistry';
import type { ShopSubFactory } from './shops/ShopSubFactory';
import type { ShopKind, ShopType } from './types/BuildingTypes';

/**
 * Factoría de la familia `shop`. No fija forma ni interior propios: delega en una
 * `ShopSubFactory` elegida por `pickVariant` (subtipo de parcela). Los metadatos
 * de nivel de tipo (peso peatonal, patio, paleta) sí viven aquí, comunes a todas
 * las tiendas.
 */
export class ShopFactory extends BuildingFactory {
  readonly type: ShopType = 'shop';
  readonly label = 'Tienda';
  readonly pedestrianWeight = 3;
  readonly courtyardKind: CourtyardKind = 'asphalt';

  /** En parcela normal, elige un subtipo por peso (consume 1 extracción del RNG). */
  protected override pickVariant(rng: Rng): ShopSubFactory {
    return pickParcelShop(rng);
  }

  // Fallbacks: en la práctica no se usan (una tienda siempre resuelve una variante),
  // pero `BuildingFactory` los declara abstractos. Delegan en la tienda genérica.
  protected footprint(rng: Rng, spec: DistrictSpec): Footprint {
    return shopSubFactories.generic.footprint(rng, spec);
  }

  protected fillFactors(): { front: number; depth: number } {
    return shopSubFactories.generic.fillFactors();
  }

  /**
   * Construye una tienda de un subtipo CONCRETO (usado por el pase especial del
   * supermercado). `skipOverlap` omite el chequeo de solape con otros edificios:
   * el pase demuele después lo que la nave pise.
   */
  buildSpecial(rng: Rng, ctx: BuildContext, kind: ShopKind, skipOverlap = true): Building | null {
    return this.place(rng, ctx, shopSubFactories[kind], skipOverlap);
  }
}
