export type HouseType = 'house';
export type ShopType = 'shop';
export type OfficeType = 'office';

export type BuildingType = HouseType | ShopType | OfficeType;

/**
 * Subtipo dentro de la familia `shop`. Todas las tiendas comparten `type: 'shop'`
 * (y con ello peso peatonal, patio y paleta a nivel de tipo), pero cada `ShopKind`
 * varía su fachada, tamaño e interior mediante una sub-factoría propia.
 *
 * Para añadir una tienda nueva (pescadería, ropa, electrónica…): añade la clave
 * aquí, su `ShopSubFactory`, su `ShopSubRenderer` y regístralos. Sin tocar bucles.
 *  - `generic`     → la tienda baja de toda la vida (toldo + cartel).
 *  - `supermarket` → nave ancha de una planta con cajas y pasillos (colocación especial).
 */
export type ShopKind = 'generic' | 'supermarket';
