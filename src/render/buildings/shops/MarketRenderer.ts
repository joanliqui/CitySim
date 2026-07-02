import * as THREE from 'three';
import { type BuildingGeom, type BuildingRenderCtx, type RenderBuilding } from '../BuildingRenderer';
import type { ShopSubRenderer } from './ShopSubRenderer';

/** Colores de marca del supermercado (vivos, estilo cartelería comercial). */
const FASCIA_RED = 0xd6202a; // franja del rótulo
const PORTAL_YELLOW = 0xf2b21e; // marco de la entrada y marquesina
const BASE_GREEN = 0x3f9e4d; // zócalo verde
const ACCENT = [0xe8721c, 0x2fa8c8]; // carteles laterales (naranja / cian)

/**
 * Supermercado: nave ancha de una planta con cartelería viva. Cuerpo claro,
 * cubierta plana, una franja roja de rótulo a todo lo ancho, escaparate y
 * puerta DOBLE de cristal transparente con marco amarillo, y un par de carteles
 * de acento. (El interior se añade en un paso posterior.)
 */
export class MarketRenderer implements ShopSubRenderer {
  render(b: RenderBuilding, variant: number, geom: BuildingGeom, ctx: BuildingRenderCtx): void {
    const { buckets: K, helpers: H } = ctx;
    const yaw = geom.faceAngle;
    const fw = geom.frontW;

    // Cuerpo de la nave (paleta clara propia de supermercado) + cubierta plana.
    K.bodyMats.push(H.compose(b.x, b.z, b.h / 2, b.w, b.h, b.d));
    K.bodyColors.push(new THREE.Color(H.palettes.building.supermarket[b.colorIdx % 6]));
    H.addFlatRoof(K.flatRoofMats, K.flatRoofColors, K.parapetMats, b, geom.roofColor, variant);

    // Base de la fachada y tangente a lo largo de ella (para repartir cartelería).
    const fx = b.x + b.faceX * (geom.frontDist + 0.06);
    const fz = b.z + b.faceZ * (geom.frontDist + 0.06);
    const tx = b.faceZ; // tangente unitaria de la fachada (perpendicular a la normal)
    const tz = -b.faceX;
    // Coloca una caja plana pegada a la fachada, empujada `out` hacia la calle y
    // desplazada `along` a lo largo de ella. `push` recibe el bucket + color.
    const at = (out: number, y: number, w: number, h: number, thick: number, along: number): THREE.Matrix4 =>
      H.composeYaw(fx + b.faceX * out + tx * along, fz + b.faceZ * out + tz * along, y, w, h, thick, yaw);
    const panel = (out: number, y: number, w: number, h: number, color: number, along = 0): void => {
      K.signMats.push(at(out, y, w, h, 0.16, along));
      K.signColors.push(new THREE.Color(color));
    };
    const glass = (out: number, y: number, w: number, h: number, along = 0): void => {
      K.marketGlassMats.push(at(out, y, w, h, 0.1, along));
    };
    const dark = (out: number, y: number, w: number, h: number, along = 0): void => {
      K.furnDarkMats.push(at(out, y, w, h, 0.12, along));
    };

    // Franja roja del rótulo (a todo lo ancho, arriba) y zócalo verde (abajo).
    panel(0.06, b.h - 0.8, fw * 0.98, 1.4, FASCIA_RED);
    panel(0.05, 0.5, fw * 0.98, 1.0, BASE_GREEN);

    // Carteles de acento a ambos lados de la entrada (naranja / cian).
    panel(0.1, b.h * 0.62, 3.4, 1.7, ACCENT[0], fw * 0.32);
    panel(0.1, b.h * 0.62, 3.4, 1.7, ACCENT[1], -fw * 0.32);

    // Escaparate acristalado a cada lado del portal (cristal transparente de verdad).
    const portalW = Math.min(7.5, fw * 0.28);
    const sideW = (fw * 0.9 - portalW) / 2 - 0.6;
    if (sideW > 1) {
      const sideOff = portalW / 2 + sideW / 2 + 0.4;
      glass(0.05, 2.6, sideW, 2.6, sideOff);
      glass(0.05, 2.6, sideW, 2.6, -sideOff);
    }

    // Portal de entrada: marco amarillo detrás.
    panel(0.1, b.h * 0.42, portalW + 1.2, b.h * 0.82, PORTAL_YELLOW);
    // Puerta DOBLE de cristal: dos hojas translúcidas...
    const doorH = Math.min(b.h * 0.66, 4.2);
    const doorY = doorH / 2 + 0.12;
    const leafOff = portalW * 0.24;
    const leafW = portalW * 0.42;
    glass(0.24, doorY, leafW, doorH, -leafOff);
    glass(0.24, doorY, leafW, doorH, leafOff);
    // ...y sus herrajes oscuros: montante central, dos jambas y dintel.
    dark(0.3, doorY, 0.16, doorH, 0);
    dark(0.3, doorY, 0.14, doorH, -portalW / 2);
    dark(0.3, doorY, 0.14, doorH, portalW / 2);
    dark(0.3, doorH + 0.12, portalW, 0.2, 0);

    // Marquesina amarilla volada sobre la entrada.
    const ax = b.x + b.faceX * (geom.frontDist + 1.1);
    const az = b.z + b.faceZ * (geom.frontDist + 1.1);
    K.awningMats.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(ax, b.h * 0.82, az),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
        new THREE.Vector3(portalW + 2.4, 0.4, 2.2),
      ),
    );
    K.awningColors.push(new THREE.Color(PORTAL_YELLOW));
  }
}
