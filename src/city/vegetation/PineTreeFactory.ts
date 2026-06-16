import { Rng } from '../../core/Rng';
import { TreeFactory } from './TreeFactory';
import type { PineTreeKind } from './types/TreeTypes';

/** Pino: copa cónica esbelta; necesita algo menos de holgura que el radio. */
export class PineTreeFactory extends TreeFactory {
  readonly kind: PineTreeKind = 'pine';
  readonly clearanceFactor = 0.95;

  protected radius(rng: Rng, _lush: boolean): number {
    return rng.range(1.5, 2.3);
  }

  protected trunkHeight(rng: Rng): number {
    return rng.range(2.4, 4.0);
  }
}
