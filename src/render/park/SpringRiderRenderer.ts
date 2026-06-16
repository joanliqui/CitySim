import { PLAY_FRAME, playColor, type PlayRenderCtx, type PlayRenderer, type RenderPlayItem } from './PlayRenderer';

/** Caballito con muelle: cuerpo sobre un resorte, cabeza al frente (+Z) y manillar. */
export class SpringRiderRenderer implements PlayRenderer {
  render(item: RenderPlayItem, ctx: PlayRenderCtx): void {
    const { box, rod, sphere } = ctx.helpers;
    const color = playColor(item.variant);

    // Placa de anclaje y muelle.
    box(item, 0, 0.04, 0.03, 0.5, 0.06, 0.5, PLAY_FRAME);
    rod(item, 0, 0.06, 0, 0, 0.46, 0, 0.11, playColor(item.variant + 3));

    // Cuerpo y cabeza (la cabeza asoma al frente).
    box(item, 0, 0.7, 0, 0.32, 0.34, 0.85, color);
    box(item, 0, 0.9, 0.42, 0.26, 0.3, 0.3, color);
    sphere(item, 0, 0.6, 0.98, 0.07, PLAY_FRAME); // morro

    // Manillar con agarres y reposapiés.
    rod(item, -0.2, 0.98, 0.18, 0.2, 0.98, 0.18, 0.03, PLAY_FRAME);
    for (const x of [-0.2, 0.2]) sphere(item, x, 0.18, 0.98, 0.05, playColor(item.variant + 1));
    for (const x of [-0.26, 0.26]) box(item, x, 0.5, -0.1, 0.16, 0.05, 0.18, PLAY_FRAME);
  }
}
