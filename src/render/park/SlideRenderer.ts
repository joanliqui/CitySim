import { PLAY_FRAME, playColor, type PlayRenderCtx, type PlayRenderer, type RenderPlayItem } from './PlayRenderer';

/** Tobogán: escalera atrás (-Z), plataforma elevada y rampa que baja al frente (+Z). */
export class SlideRenderer implements PlayRenderer {
  render(item: RenderPlayItem, ctx: PlayRenderCtx): void {
    const { box, rod } = ctx.helpers;
    const color = playColor(item.variant);
    const platY = 1.46;

    // Escalera: dos montantes y peldaños, en z=-1.0.
    for (const x of [-0.5, 0.5]) rod(item, x, 0, -1.0, x, 1.7, -1.0, 0.06, PLAY_FRAME);
    for (const y of [0.45, 0.85, 1.25]) rod(item, -0.5, y, -1.0, 0.5, y, -1.0, 0.03, PLAY_FRAME);

    // Plataforma elevada y sus dos postes de apoyo delanteros.
    box(item, 0, -0.55, platY, 1.1, 0.1, 1.0, color);
    for (const x of [-0.5, 0.5]) rod(item, x, 0, -0.1, x, platY, -0.1, 0.06, PLAY_FRAME);

    // Rampa de bajada inclinada (su +Z desciende hacia el frente) + barandillas.
    const tilt = Math.atan2(1.33, 2.15);
    box(item, 0, 1.025, 0.785, 0.9, 0.08, 2.53, color, tilt);
    for (const x of [-0.45, 0.45]) box(item, x, 1.025, 0.86, 0.06, 0.22, 2.53, PLAY_FRAME, tilt);
  }
}
