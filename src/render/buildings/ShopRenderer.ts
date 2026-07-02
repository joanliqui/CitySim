import type { BuildingGeom, BuildingRenderCtx, BuildingRenderer, RenderBuilding } from './BuildingRenderer';
import { shopRenderers } from './shops/ShopSubRenderer';

/**
 * Render de la familia `shop`: delega en el renderer del subtipo concreto
 * (`shopKind`). Las tiendas antiguas o sin subtipo caen a la tienda genérica.
 */
export class ShopRenderer implements BuildingRenderer {
  render(b: RenderBuilding, variant: number, geom: BuildingGeom, ctx: BuildingRenderCtx): void {
    shopRenderers[b.shopKind ?? 'generic'].render(b, variant, geom, ctx);
  }
}
