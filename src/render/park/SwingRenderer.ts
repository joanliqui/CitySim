import { PLAY_FRAME, playColor, type PlayRenderCtx, type PlayRenderer, type RenderPlayItem } from './PlayRenderer';

/** Columpios: viga superior sobre dos caballetes en A, con dos asientos colgando. */
export class SwingRenderer implements PlayRenderer {
  render(item: RenderPlayItem, ctx: PlayRenderCtx): void {
    const { box, rod } = ctx.helpers;
    const beamY = 2.25;

    // Viga superior (eje X local).
    rod(item, -2.0, beamY, 0, 2.0, beamY, 0, 0.08, PLAY_FRAME);
    // Caballetes en A a cada extremo: dos patas abiertas que se juntan arriba.
    for (const x of [-1.85, 1.85]) {
      rod(item, x, 0, -0.85, x, beamY, 0, 0.08, PLAY_FRAME);
      rod(item, x, 0, 0.85, x, beamY, 0, 0.08, PLAY_FRAME);
    }
    // Dos asientos colgando de sendas cadenas.
    const seats = [-0.85, 0.85];
    for (let k = 0; k < seats.length; k++) {
      const x = seats[k];
      rod(item, x - 0.2, beamY - 0.03, 0, x - 0.2, 0.5, 0, 0.025, PLAY_FRAME);
      rod(item, x + 0.2, beamY - 0.03, 0, x + 0.2, 0.5, 0, 0.025, PLAY_FRAME);
      box(item, x, 0, 0.45, 0.52, 0.07, 0.3, playColor(item.variant + k));
    }
  }
}
