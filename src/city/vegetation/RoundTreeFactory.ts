import { Rng } from '../../core/Rng';
import { TreeFactory } from './TreeFactory';
import type { RoundTreeKind } from './types/TreeTypes';

/** Árbol de copa redondeada (el común). En parques se ensancha (`lush`). */
export class RoundTreeFactory extends TreeFactory {
  readonly kind: RoundTreeKind = 'round';
  readonly clearanceFactor = 1;

  protected radius(rng: Rng, lush: boolean): number {
    return lush ? rng.range(1.6, 3) : rng.range(1.3, 2.4);
  }

  protected trunkHeight(rng: Rng): number {
    return rng.range(1.6, 3);
  }
}
