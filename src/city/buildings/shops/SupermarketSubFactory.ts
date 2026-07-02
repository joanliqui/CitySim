import { Rng } from '../../../core/Rng';
import type { MarketInterior } from '../interior/types';
import type { DistrictSpec, Footprint } from '../BuildingFactory';
import type { ShopKind } from '../types/BuildingTypes';
import type { ShopSubFactory } from './ShopSubFactory';

/**
 * Supermercado: nave ancha de UNA sola planta. Se coloca en un pase especial
 * (`placeSupermarkets`), no por el peso de tienda del distrito, porque su fachada
 * es mucho más ancha que una parcela normal.
 */
export class SupermarketSubFactory implements ShopSubFactory {
  readonly shopKind: ShopKind = 'supermarket';
  readonly label = 'Supermercado';
  readonly placement = 'special' as const;
  readonly parcelWeight = 0; // no participa en el picker de parcela

  footprint(rng: Rng, _spec: DistrictSpec): Footprint {
    // Ancho grande, fondo medio, altura baja de nave. Consume 3 valores del RNG
    // (front, depth, h) como el resto de footprints.
    return { front: rng.range(26, 32), depth: rng.range(16, 20), h: rng.range(7, 8) };
  }

  fillFactors(): { front: number; depth: number } {
    // Rellena casi todo el lado y buena parte del fondo de la manzana.
    return { front: 0.95, depth: 0.9 };
  }

  buildMarketInterior(
    _x: number,
    _z: number,
    _w: number,
    _d: number,
    _faceX: number,
    _faceZ: number,
  ): MarketInterior | undefined {
    // El interior (cajas + pasillos) llega en el siguiente paso; por ahora la nave
    // se renderiza como caja maciza.
    return undefined;
  }
}
