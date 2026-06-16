import type { PlayKind } from '../../city/park/types/PlayTypes';
import { CarouselRenderer } from './CarouselRenderer';
import { SlideRenderer } from './SlideRenderer';
import { SpringRiderRenderer } from './SpringRiderRenderer';
import { SwingRenderer } from './SwingRenderer';
import type { PlayRenderer } from './PlayRenderer';

/** Registro de renderers por juego. Espejo de `src/city/park/registry.ts`. */
export const playRenderers: Record<PlayKind, PlayRenderer> = {
  swing: new SwingRenderer(),
  slide: new SlideRenderer(),
  spring: new SpringRiderRenderer(),
  carousel: new CarouselRenderer(),
};
