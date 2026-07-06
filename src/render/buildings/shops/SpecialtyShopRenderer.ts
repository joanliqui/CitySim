import * as THREE from 'three';
import { SHOP_WALL_T, shopDoorGeometry } from '../../../city/buildings/interior/shopInterior';
import type { SpecialtyShopSpec } from '../../../city/buildings/shops/specialtyShops';
import { type BuildingGeom, type BuildingRenderCtx, type RenderBuilding } from '../BuildingRenderer';
import { addCeilingLamps, addMarketFurniture, GLASS_T } from './marketFurniture';
import type { ShopSubRenderer } from './ShopSubRenderer';

/**
 * Tienda de gremio (frutería, carnicería, ropa…): local bajo con casco HUECO —
 * puerta batiente real y escaparates de cristal a ambos lados por los que se ve
 * el interior (mostrador, estanterías y el fondo propio del gremio, generados
 * en `shopInterior.ts` y pintados por `marketFurniture.ts`). El rótulo y el
 * toldo llevan los colores del gremio (spec del catálogo `specialtyShops.ts`).
 * Una única clase cubre todos los gremios, parametrizada por su spec.
 */
export class SpecialtyShopRenderer implements ShopSubRenderer {
  constructor(private readonly spec: SpecialtyShopSpec) {}

  render(b: RenderBuilding, variant: number, geom: BuildingGeom, ctx: BuildingRenderCtx): void {
    const { buckets: K, helpers: H } = ctx;
    const yaw = geom.faceAngle;
    const fw = geom.frontW; // ancho a lo largo de la fachada
    const depthLen = geom.frontDist * 2; // fondo total del local
    const t = SHOP_WALL_T;

    // Hueco real de la puerta (centrada), a juego con la hoja batiente genérica
    // que `CityMesh` pone a todos los edificios no-súper.
    const { doorHalf, doorTop } = shopDoorGeometry(b.h);

    // Escaparates: un hueco real a cada lado de la puerta, del marco a la esquina.
    const escY0 = 0.8;
    const escY1 = Math.min(3.1, b.h - 1.2);
    const inMargin = doorHalf + 0.55; // arranque junto al marco de la puerta
    const outMargin = fw / 2 - 1.1; // remate antes de la esquina
    const openings = [{ along0: -doorHalf, along1: doorHalf, y0: 0, y1: doorTop }];
    const escaparates: { c: number; len: number }[] = [];
    if (outMargin - inMargin > 1.1 && escY1 - escY0 > 1) {
      for (const sgn of [-1, 1] as const) {
        openings.push({ along0: sgn * inMargin, along1: sgn * outMargin, y0: escY0, y1: escY1 });
        escaparates.push({ c: (sgn * (inMargin + outMargin)) / 2, len: outMargin - inMargin });
      }
    }

    // Casco hueco (suelo + muros con los huecos de fachada) y cubierta plana.
    H.addShopShell(b, t, openings, K.bodyMats, K.bodyColors, K.floorMats);
    H.addFlatRoof(K.flatRoofMats, K.flatRoofColors, K.parapetMats, b, geom.roofColor, variant);
    if (variant % 2 === 0) H.addRoofFixture(K.roofBoxMats, K.roofTankMats, b, variant);

    // Fachada: línea exterior + tangente (misma convención que MarketRenderer).
    const fx = b.x + b.faceX * geom.frontDist;
    const fz = b.z + b.faceZ * geom.frontDist;
    const tx = b.faceZ;
    const tz = -b.faceX;
    const at = (out: number, y: number, w: number, h: number, thick: number, along: number): THREE.Matrix4 =>
      H.composeYaw(fx + b.faceX * out + tx * along, fz + b.faceZ * out + tz * along, y, w, h, thick, yaw);
    const interiorPoint = (along: number, dep: number): { x: number; z: number } => ({
      x: fx - b.faceX * dep + tx * along,
      z: fz - b.faceZ * dep + tz * along,
    });

    // Cristal y carpintería de cada escaparate. El cristal va en el plano medio
    // del muro, algo más corto que el hueco por arriba (el antepecho ya entierra
    // su borde inferior) para no dejar caras coplanares con las repisas del hueco.
    for (const e of escaparates) {
      K.marketGlassMats.push(at(-t / 2, (escY0 + escY1) / 2 - 0.015, e.len, escY1 - escY0 - 0.03, GLASS_T, e.c));
      // Antepecho, dintel y jambas oscuros, solapando los bordes del hueco
      // (sobresalen un poco del muro por ambas caras).
      const frameT = t + 0.1;
      K.furnDarkMats.push(at(0, escY0, e.len + 0.1, 0.18, frameT, e.c)); // antepecho
      K.furnDarkMats.push(at(0, escY1, e.len + 0.1, 0.18, frameT, e.c)); // dintel
      K.furnDarkMats.push(at(0, (escY0 + escY1) / 2, 0.14, escY1 - escY0 + 0.14, frameT, e.c - e.len / 2)); // jamba interior
      K.furnDarkMats.push(at(0, (escY0 + escY1) / 2, 0.14, escY1 - escY0 + 0.14, frameT, e.c + e.len / 2)); // jamba exterior
    }

    // Rótulo del gremio a todo lo ancho, sobre los escaparates.
    const fasciaY = Math.min(b.h - 0.55, escY1 + 0.78);
    K.signMats.push(at(0.08, fasciaY, fw * 0.96, 1.0, 0.16, 0));
    K.signColors.push(new THREE.Color(this.spec.fascia));

    // Toldo del color del gremio, volado sobre la puerta.
    K.awningMats.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(fx + b.faceX * 0.75, doorTop + 0.4, fz + b.faceZ * 0.75),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
        new THREE.Vector3(doorHalf * 2 + 1.4, 0.26, 1.5),
      ),
    );
    K.awningColors.push(new THREE.Color(this.spec.awning));

    // Locales altos: una fila de ventanas sobre el rótulo, que la fachada no
    // quede ciega hasta la cornisa.
    if (b.h >= 6.2) {
      H.addWindowRow(K.windowMats, K.windowFrameMats, b.x, b.z, b.h - 1.4, b.w, b.d, b.faceX, b.faceZ);
    }

    // Bombillas colgantes (mismo material que el súper: encendidas vía bloom).
    addCeilingLamps(K, interiorPoint, fw, depthLen, b.h);

    // Interior del gremio: mostrador, estanterías y fondo (mostrador de
    // servicio, frutería o góndolas), generado en `shopInterior.ts`.
    if (b.marketInterior) {
      for (const f of b.marketInterior.furniture) addMarketFurniture(K, H, f);
    }
  }
}
