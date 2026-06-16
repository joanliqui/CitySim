import { PlayFactory } from './PlayFactory';
import type { PlayKind } from './types/PlayTypes';

/** Columpios: estructura en A con dos asientos colgando de una viga. */
export class SwingFactory extends PlayFactory {
  readonly kind: PlayKind = 'swing';
  readonly footprint = 2.6;
}
