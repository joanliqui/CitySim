import { Rng } from '../../core/Rng';
import { TreeFactory } from './TreeFactory';
import type { PalmTreeKind } from './types/TreeTypes';

/** Palmera: tronco alto y fronds amplias; gran holgura para no invadir calles. */
export class PalmTreeFactory extends TreeFactory {
  readonly kind: PalmTreeKind = 'palm';
  readonly clearanceFactor = 2.7;

  protected radius(rng: Rng, _lush: boolean): number {
    return rng.range(1.7, 2.5);
  }

  protected trunkHeight(rng: Rng): number {
    return rng.range(8.5, 13.5);
  }
}
