export type HouseType = 'house';
export type ShopType = 'shop';
export type OfficeType = 'office';

export type BuildingType = HouseType | ShopType | OfficeType;

/**
 * Subtipo dentro de la familia `shop`. Todas las tiendas comparten `type: 'shop'`
 * (y con ello peso peatonal, patio y paleta a nivel de tipo), pero cada `ShopKind`
 * varía su fachada, tamaño e interior mediante una sub-factoría propia.
 *
 * Para añadir una tienda nueva: añade la clave aquí, su `ShopSubFactory`, su
 * `ShopSubRenderer` y regístralos. Sin tocar bucles. Los gremios de parcela
 * (frutería…librería) comparten factoría/renderer parametrizados por su spec en
 * `specialtyShops.ts` — para uno nuevo basta la clave + su entrada del catálogo.
 *  - `generic`     → la tienda baja antigua sin gremio (solo fallback, ya no sale).
 *  - `supermarket` → nave ancha de una planta con cajas y pasillos (colocación especial).
 *  - resto         → tiendas de gremio en parcela normal, con interior propio.
 */
export type ShopKind =
  | 'generic'
  | 'supermarket'
  | 'fruteria'
  | 'carniceria'
  | 'pescaderia'
  | 'ropa'
  | 'farmacia'
  | 'electronica'
  | 'libreria';
