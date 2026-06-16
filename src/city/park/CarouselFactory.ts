import { PlayFactory } from './PlayFactory';
import type { PlayKind } from './types/PlayTypes';

/** La rueda donde giran: plataforma giratoria con barras radiales y eje central. */
export class CarouselFactory extends PlayFactory {
  readonly kind: PlayKind = 'carousel';
  readonly footprint = 2.8;
}
