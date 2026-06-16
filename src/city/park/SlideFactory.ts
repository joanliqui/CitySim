import { PlayFactory } from './PlayFactory';
import type { PlayKind } from './types/PlayTypes';

/** Tobogán: escalera + plataforma + rampa de bajada. */
export class SlideFactory extends PlayFactory {
  readonly kind: PlayKind = 'slide';
  readonly footprint = 2.4;
}
