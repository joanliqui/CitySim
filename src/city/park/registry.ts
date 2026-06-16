import { Rng } from '../../core/Rng';
import type { PlayItem } from '../CityModel';
import { CarouselFactory } from './CarouselFactory';
import { PlayFactory } from './PlayFactory';
import { SlideFactory } from './SlideFactory';
import { SpringFactory } from './SpringFactory';
import { SwingFactory } from './SwingFactory';
import type { PlayKind } from './types/PlayTypes';

/** Registro de factorías por juego. Espejo de `src/render/park/playRenderRegistry.ts`. */
export const playFactories: Record<PlayKind, PlayFactory> = {
  swing: new SwingFactory(),
  slide: new SlideFactory(),
  spring: new SpringFactory(),
  carousel: new CarouselFactory(),
};

/** Crea un juego del tipo dado en (x,z) mirando a `heading`. */
export function makePlayItem(rng: Rng, kind: PlayKind, x: number, z: number, heading: number): PlayItem {
  return playFactories[kind].make(rng, x, z, heading);
}

/** Huella en planta del juego (radio aproximado), para separar piezas. */
export function playFootprint(kind: PlayKind): number {
  return playFactories[kind].footprint;
}
