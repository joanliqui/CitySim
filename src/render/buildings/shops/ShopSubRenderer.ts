import { SPECIALTY_SHOPS } from '../../../city/buildings/shops/specialtyShops';
import type { ShopKind } from '../../../city/buildings/types/BuildingTypes';
import type { BuildingGeom, BuildingRenderCtx, RenderBuilding } from '../BuildingRenderer';
import { GenericShopRenderer } from './GenericShopRenderer';
import { MarketRenderer } from './MarketRenderer';
import { SpecialtyShopRenderer } from './SpecialtyShopRenderer';

/**
 * Estrategia de render por subtipo de tienda. Espejo del `BuildingRenderer` un
 * nivel más abajo: para añadir una tienda nueva, crea su `ShopSubRenderer` y
 * regístralo aquí (y su `ShopSubFactory` en el lado de creación). Los gremios
 * comparten `SpecialtyShopRenderer`, parametrizado por su spec del catálogo.
 */
export interface ShopSubRenderer {
  render(b: RenderBuilding, variant: number, geom: BuildingGeom, ctx: BuildingRenderCtx): void;
}

/** Registro de renderers por `ShopKind`. */
export const shopRenderers: Record<ShopKind, ShopSubRenderer> = {
  generic: new GenericShopRenderer(),
  supermarket: new MarketRenderer(),
  fruteria: new SpecialtyShopRenderer(SPECIALTY_SHOPS.fruteria),
  carniceria: new SpecialtyShopRenderer(SPECIALTY_SHOPS.carniceria),
  pescaderia: new SpecialtyShopRenderer(SPECIALTY_SHOPS.pescaderia),
  ropa: new SpecialtyShopRenderer(SPECIALTY_SHOPS.ropa),
  farmacia: new SpecialtyShopRenderer(SPECIALTY_SHOPS.farmacia),
  electronica: new SpecialtyShopRenderer(SPECIALTY_SHOPS.electronica),
  libreria: new SpecialtyShopRenderer(SPECIALTY_SHOPS.libreria),
};
