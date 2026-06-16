import { PlayFactory } from './PlayFactory';
import type { PlayKind } from './types/PlayTypes';

/** Caballito con muelle (balancín individual sobre resorte). */
export class SpringFactory extends PlayFactory {
  readonly kind: PlayKind = 'spring';
  readonly footprint = 1.0;
}
