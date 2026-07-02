import type { ShopKind } from '../../../city/buildings/types/BuildingTypes';
import type { BuildingGeom, BuildingRenderCtx, RenderBuilding } from '../BuildingRenderer';
import { GenericShopRenderer } from './GenericShopRenderer';
import { MarketRenderer } from './MarketRenderer';

/**
 * Estrategia de render por subtipo de tienda. Espejo del `BuildingRenderer` un
 * nivel más abajo: para añadir una tienda nueva, crea su `ShopSubRenderer` y
 * regístralo aquí (y su `ShopSubFactory` en el lado de creación).
 */
export interface ShopSubRenderer {
  render(b: RenderBuilding, variant: number, geom: BuildingGeom, ctx: BuildingRenderCtx): void;
}

/** Registro de renderers por `ShopKind`. */
export const shopRenderers: Record<ShopKind, ShopSubRenderer> = {
  generic: new GenericShopRenderer(),
  supermarket: new MarketRenderer(),
};
