import { PLAY_FRAME, playColor, type PlayRenderCtx, type PlayRenderer, type RenderPlayItem } from './PlayRenderer';

/** La rueda donde giran: plataforma circular, eje central y barras radiales con agarres. */
export class CarouselRenderer implements PlayRenderer {
  render(item: RenderPlayItem, ctx: PlayRenderCtx): void {
    const { rod, sphere } = ctx.helpers;
    const color = playColor(item.variant);
    const R = 2.0; // radio de las barras/agarres
    const spokes = 6;

    // Plataforma giratoria (cilindro chato) sobre un eje.
    rod(item, 0, 0.12, 0, 0, 0.34, 0, 2.3, color);
    rod(item, 0, 0.3, 0, 0, 1.5, 0, 0.09, PLAY_FRAME);
    sphere(item, 0, 0, 1.56, 0.16, playColor(item.variant + 3));

    // Barras radiales desde lo alto del eje hasta agarres verticales en el borde.
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * Math.PI * 2;
      const ex = Math.cos(a) * R;
      const ez = Math.sin(a) * R;
      rod(item, 0, 1.45, 0, ex, 0.6, ez, 0.04, PLAY_FRAME);
      rod(item, ex, 0.34, ez, ex, 0.9, ez, 0.045, PLAY_FRAME);
      sphere(item, ex, ez, 0.96, 0.08, color);
    }
  }
}
