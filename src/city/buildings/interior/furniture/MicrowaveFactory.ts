import { Rng } from '../../../../core/Rng';
import type { Furniture } from '../types';
import { FurnishContext, FurnitureFactory } from './FurnitureFactory';
import { footRect, FURNITURE_SCALE, placeAgainstWall } from './placement';

/**
 * Microondas: se apoya sobre la última encimera colocada (`ctx.kitchenCounter`) o,
 * si no hay ninguna, exento sobre su propio soporte contra una pared libre —su
 * huella mínima entra donde una encimera no cabría (cocinas muy pequeñas).
 */
export class MicrowaveFactory implements FurnitureFactory {
  place(ctx: FurnishContext, rng: Rng): Furniture[] {
    const c = ctx.kitchenCounter;
    if (c) {
      const alongX = c.faceX === 0; // la encimera mira en Z → su frente se extiende en X
      const bw = 0.52 * FURNITURE_SCALE; // ancho del microondas
      const bd = 0.36 * FURNITURE_SCALE; // fondo del microondas
      // Centrado sobre la encimera, algo retranqueado hacia la pared (lado −face).
      const back = (alongX ? c.d : c.w) / 2 - bd / 2 - 0.02;
      return [
        {
          kind: 'microwave',
          x: c.x - c.faceX * back,
          z: c.z - c.faceZ * back,
          w: alongX ? bw : bd,
          d: alongX ? bd : bw,
          faceX: c.faceX,
          faceZ: c.faceZ,
          variant: rng.int(0, 4),
        },
      ];
    }
    // Exento: caja pequeña sobre un soporte, contra una pared libre.
    const f = placeAgainstWall(ctx.usable, ctx.occupied, 0.52, 0.4, 'microwave', rng);
    if (!f) return [];
    f.microwaveStand = true;
    f.variant = rng.int(0, 4);
    ctx.occupied.push(footRect(f));
    return [f];
  }
}
