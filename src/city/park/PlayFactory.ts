import { Rng } from '../../core/Rng';
import type { PlayItem } from '../CityModel';
import type { PlayKind } from './types/PlayTypes';

/**
 * Factoría abstracta de juegos de parque. Espejo de `TreeFactory`/`BuildingFactory`:
 * encapsula la creación común de un `PlayItem` y delega en cada juego solo lo que
 * cambia (su huella en planta, para separarlo de sus vecinos en la zona de juego).
 *
 * Para añadir un juego: extiende esta clase, define su `footprint` y regístrala en
 * `registry.ts` (y su renderer en `src/render/park`).
 */
export abstract class PlayFactory {
  /** Discriminante del juego (clave del registro). */
  abstract readonly kind: PlayKind;
  /** Radio aproximado en planta; separa las piezas dentro de la zona de juego. */
  abstract readonly footprint: number;

  /** Crea un juego en (x,z) mirando a `heading`. Consume un único `rng.int` (variant). */
  make(rng: Rng, x: number, z: number, heading: number): PlayItem {
    return { kind: this.kind, x, z, heading, variant: rng.int(0, 6) };
  }
}
