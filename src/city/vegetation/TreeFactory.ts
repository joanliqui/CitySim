import { Rng } from '../../core/Rng';
import type { Tree } from '../CityModel';
import type { TreeKind } from './types/TreeTypes';

/**
 * Factoría abstracta de árboles. Encapsula la creación común de un `Tree` y
 * delega en cada especie solo lo que cambia: radio de copa, altura de tronco y
 * el factor de holgura con el que debe encajar en una zona verde.
 *
 * Para añadir una especie (ciprés, sauce…): extiende esta clase, define sus
 * rangos y regístrala en `registry.ts` (y su renderer en `src/render/vegetation`).
 */
export abstract class TreeFactory {
  /** Discriminante de la especie (clave del registro). */
  abstract readonly kind: TreeKind;
  /** Factor sobre el radio para comprobar que la copa cabe en la zona verde. */
  abstract readonly clearanceFactor: number;

  /** Radio de copa. `lush` ensancha algunas especies en parques. */
  protected abstract radius(rng: Rng, lush: boolean): number;
  /** Altura de tronco. */
  protected abstract trunkHeight(rng: Rng): number;

  /**
   * Crea un árbol. Orden de consumo del RNG (debe mantenerse para
   * reproducibilidad): radius → trunkHeight → shade. La especie ya se eligió
   * antes (en `pickTreeFactory`, que consume el sorteo de tipo).
   */
  make(rng: Rng, x: number, z: number, lush: boolean): Tree {
    return { x, z, kind: this.kind, r: this.radius(rng, lush), trunk: this.trunkHeight(rng), shade: rng.int(0, 3) };
  }
}
