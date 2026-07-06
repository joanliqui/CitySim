import * as THREE from 'three';
import { marketDoorAlong, marketDoorGeometry, MARKET_WALL_T } from '../../../city/buildings/interior/marketInterior';
import type { RenderBuckets, SlidingDoorPose } from '../BuildingRenderer';
import { type BuildingGeom, type BuildingRenderCtx, type RenderBuilding } from '../BuildingRenderer';
import { addCeilingLamps, addMarketFurniture, GLASS_T } from './marketFurniture';
import type { ShopSubRenderer } from './ShopSubRenderer';

/** Colores de marca del supermercado (vivos, estilo cartelería comercial). */
const FASCIA_RED = 0xd6202a; // franja del rótulo
const PORTAL_YELLOW = 0xf2b21e; // marco de la entrada y marquesina
const BASE_GREEN = 0x3f9e4d; // zócalo verde
const ACCENT = [0xe8721c, 0x2fa8c8]; // carteles laterales (naranja / cian)
/** Paleta de vidriera: tonos saturados típicos de vidrio de colores. */
const STAINED_GLASS_COLORS = [0xb03a3a, 0x3a6bb0, 0x3aa15a, 0xd1a13a, 0x8a4fae, 0x3aa1a1];

/** Anchura de las barras del marco amarillo (solo el borde, no un panel macizo). */
const FRAME_BAR = 0.45;

export class MarketRenderer implements ShopSubRenderer {
  render(b: RenderBuilding, variant: number, geom: BuildingGeom, ctx: BuildingRenderCtx): void {
    const { buckets: K, helpers: H } = ctx;
    const yaw = geom.faceAngle;
    const fw = geom.frontW; // ancho a lo largo de la fachada
    const depthLen = geom.frontDist * 2; // fondo total de la nave

    // Hueco real de la puerta: mitad de ancho total, altura y desplazamiento
    // LATERAL (la puerta va a un lado, sobre el pasillo de la frutería),
    // compartidos por el muro (el agujero), el marco, las hojas correderas y el
    // modelo (`b.door` y el mobiliario) vía imports de `marketInterior`.
    const { doorHalf, doorTop } = marketDoorGeometry(fw, b.h);
    const doorAlong = marketDoorAlong(fw, depthLen);

    // Vidriera lateral: hueco largo en AMBOS muros laterales, con margen a cada
    // esquina. `s0/s1` en la coordenada local de esos muros (ver `addMarketShell`).
    const winMargin = 2.6;
    const winY0 = 1.1;
    const winY1 = b.h - 0.9;
    const wallLen = depthLen - 2 * MARKET_WALL_T;
    const winLen = wallLen - 2 * winMargin;
    const hasSideWindow = winLen > 1.8 && winY1 - winY0 > 1;
    const sideWindow = hasSideWindow ? { s0: winMargin, s1: winMargin + winLen, y0: winY0, y1: winY1 } : null;

    // Casco hueco: suelo + muros perimetrales (puerta real + vidrieras laterales).
    H.addMarketShell(b, doorHalf, doorTop, doorAlong, MARKET_WALL_T, sideWindow, K.bodyMats, K.bodyColors, K.floorMats);
    H.addFlatRoof(K.flatRoofMats, K.flatRoofColors, K.parapetMats, b, geom.roofColor, variant);

    // Fachada: línea de la pared frontal + ejes unitarios normal/tangente. Un punto
    // interior cualquiera es `frontLine - normal*dep + tangente*along` (dep=0 en la
    // fachada, creciendo hacia dentro; along=0 en el centro de la fachada).
    const frontLineX = b.x + b.faceX * geom.frontDist;
    const frontLineZ = b.z + b.faceZ * geom.frontDist;
    const tx = b.faceZ; // tangente unitaria de la fachada (perpendicular a la normal)
    const tz = -b.faceX;
    const interiorPoint = (along: number, dep: number): { x: number; z: number } => ({
      x: frontLineX - b.faceX * dep + tx * along,
      z: frontLineZ - b.faceZ * dep + tz * along,
    });
    const front = interiorPoint(0, -0.06); // punto justo delante de la fachada (para carteles)
    const fx = front.x;
    const fz = front.z;
    // Coloca una caja plana pegada a la fachada, empujada `out` hacia la calle y
    // desplazada `along` a lo largo de ella.
    const at = (out: number, y: number, w: number, h: number, thick: number, along: number): THREE.Matrix4 =>
      H.composeYaw(fx + b.faceX * out + tx * along, fz + b.faceZ * out + tz * along, y, w, h, thick, yaw);
    const panel = (out: number, y: number, w: number, h: number, color: number, along = 0): void => {
      K.signMats.push(at(out, y, w, h, 0.16, along));
      K.signColors.push(new THREE.Color(color));
    };
    const glassFixed = (out: number, y: number, w: number, h: number, along = 0): void => {
      K.marketGlassMats.push(at(out, y, w, h, GLASS_T, along));
    };
    const dark = (out: number, y: number, w: number, h: number, along = 0): void => {
      K.furnDarkMats.push(at(out, y, w, h, 0.12, along));
    };

    // Franja roja del rótulo, a todo lo ancho (arriba: pasa por encima de la
    // puerta, no hay conflicto de altura).
    panel(0.06, b.h - 0.8, fw * 0.98, 1.4, FASCIA_RED);

    // Carteles de acento, ambos en el tramo de fachada OPUESTO a la puerta
    // (sobre la zona de cajas), para no pisar el hueco ni el marco.
    const oppSgn = doorAlong >= 0 ? -1 : 1;
    panel(0.1, b.h * 0.62, 3.4, 1.7, ACCENT[0], oppSgn * fw * 0.32);
    panel(0.1, b.h * 0.62, 3.4, 1.7, ACCENT[1], oppSgn * fw * 0.1);

    // Zócalo verde: se detiene justo en el marco de la puerta (no la cruza por
    // delante), así que va partido en dos tramos a los lados del hueco.
    const doorFrameHalf = doorHalf + FRAME_BAR;
    const zMin = -fw * 0.49;
    const zMax = fw * 0.49;
    const zw1 = doorAlong - doorFrameHalf - zMin;
    const zw2 = zMax - (doorAlong + doorFrameHalf);
    if (zw1 > 0.3) panel(0.05, 0.5, zw1, 1.0, BASE_GREEN, zMin + zw1 / 2);
    if (zw2 > 0.3) panel(0.05, 0.5, zw2, 1.0, BASE_GREEN, zMax - zw2 / 2);

    // Escaparate fijo a cada lado del hueco (cristal transparente, sobre el muro
    // macizo); con la puerta a un lado, el tramo corto puede no caber y se omite.
    const gMin = -fw * 0.42;
    const gMax = fw * 0.42;
    const g1 = doorAlong - doorHalf - 0.3 - gMin;
    const g2 = gMax - (doorAlong + doorHalf + 0.3);
    if (g1 > 1) glassFixed(0.05, 2.6, g1, 2.6, gMin + g1 / 2);
    if (g2 > 1) glassFixed(0.05, 2.6, g2, 2.6, gMax - g2 / 2);

    // Marco amarillo de la entrada: solo el BORDE (tres barras finas alrededor del
    // hueco), no un panel macizo — el centro queda libre para ver las correderas.
    const frameOuterH = doorTop + FRAME_BAR;
    panel(0.1, frameOuterH / 2, FRAME_BAR, frameOuterH, PORTAL_YELLOW, doorAlong - (doorHalf + FRAME_BAR / 2)); // izquierda
    panel(0.1, frameOuterH / 2, FRAME_BAR, frameOuterH, PORTAL_YELLOW, doorAlong + doorHalf + FRAME_BAR / 2); // derecha
    panel(0.1, doorTop + FRAME_BAR / 2, doorHalf * 2 + FRAME_BAR * 2, FRAME_BAR, PORTAL_YELLOW, doorAlong); // dintel
    // Jambas y dintel oscuros, pegados al borde del hueco.
    const doorY = doorTop / 2;
    dark(0.16, doorY, 0.16, doorTop, doorAlong - doorHalf);
    dark(0.16, doorY, 0.16, doorTop, doorAlong + doorHalf);
    dark(0.16, doorTop + 0.1, doorHalf * 2 + 0.16, 0.2, doorAlong);

    // Dos hojas de cristal CORREDERAS: se deslizan por la tangente de la fachada,
    // escondiéndose tras el escaparate fijo. Pose para animarlas + matrices
    // iniciales (cerradas, ocupando cada una la mitad del hueco).
    const pose: SlidingDoorPose = {
      buildingId: b.id,
      x: fx + b.faceX * 0.05 + tx * doorAlong,
      z: fz + b.faceZ * 0.05 + tz * doorAlong,
      y: doorY,
      yaw,
      tx,
      tz,
      leafW: doorHalf,
      height: doorTop,
      depth: GLASS_T,
    };
    K.marketDoorPoses.push(pose);
    K.marketDoorLeafMats.push(slidingLeafMatrix(pose, -1), slidingLeafMatrix(pose, 1));

    // Marquesina amarilla volada sobre la entrada (desplazada con la puerta).
    const ax = b.x + b.faceX * (geom.frontDist + 1.1) + tx * doorAlong;
    const az = b.z + b.faceZ * (geom.frontDist + 1.1) + tz * doorAlong;
    K.awningMats.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(ax, b.h * 0.82, az),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
        new THREE.Vector3(doorHalf * 2 + 2.4, 0.4, 2.2),
      ),
    );
    K.awningColors.push(new THREE.Color(PORTAL_YELLOW));

    // Vidrieras laterales: cristal de colores separado por barras negras, dentro
    // del hueco real tallado en cada muro lateral.
    if (sideWindow) {
      addStainedGlassWindow(K, interiorPoint, tx, fw, winMargin, winMargin + winLen, winY0, winY1, b.colorIdx);
    }

    // Falso techo registrable (baldosas blancas + retícula fina) bajo el tejado.
    addCeilingTiles(K, interiorPoint, tx, fw, depthLen, b.h);
    // Luces colgantes del techo: una rejilla de bombillas + su cordón, repartida
    // por la nave. Mismo material que las farolas (bloom de noche).
    addCeilingLamps(K, interiorPoint, fw, depthLen, b.h);

    // Interior: zona de fruta, pasillos, estantería del fondo y cajas con mampara.
    // El render de cada pieza vive en `marketFurniture.ts` (compartido con las
    // tiendas de gremio).
    if (b.marketInterior) {
      for (const f of b.marketInterior.furniture) addMarketFurniture(K, H, f);
    }
  }
}

/** Matriz de una hoja corredera CERRADA (estado inicial, antes de animar). */
function slidingLeafMatrix(p: SlidingDoorPose, side: -1 | 1): THREE.Matrix4 {
  const along = (side * p.leafW) / 2;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(p.x + p.tx * along, p.y, p.z + p.tz * along),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.yaw, 0)),
    new THREE.Vector3(p.leafW, p.height, p.depth),
  );
}

/**
 * Vidriera lateral: coloca cristales de colores (uno por tramo) más un marco de
 * barras negras (perímetro + divisores entre cristales), en AMBOS muros
 * laterales (tangente ±).
 */
function addStainedGlassWindow(
  K: RenderBuckets,
  interiorPoint: (along: number, dep: number) => { x: number; z: number },
  tx: number,
  fw: number,
  depFrom: number,
  depTo: number,
  y0: number,
  y1: number,
  colorIdx: number,
): void {
  const paneLen = 1.5;
  const barW = 0.14;
  const winLen = depTo - depFrom;
  const count = Math.max(1, Math.floor((winLen + barW) / (paneLen + barW)));
  const paneActual = (winLen - (count - 1) * barW) / count;
  const along = fw / 2 - MARKET_WALL_T / 2; // distancia del centro al eje del muro lateral
  const outPoke = 0.1; // el cristal/las barras sobresalen un poco del muro
  const yMid = (y0 + y1) / 2;
  const winH = y1 - y0;

  for (const sgn of [-1, 1] as const) {
    // `tangentExt` = grosor que sobresale del muro (eje normal/tangente lateral);
    // `depthExt` = longitud a lo largo del muro (eje de profundidad). Invertirlos
    // estira la pieza por el eje equivocado (barras larguísimas cruzando la fachada).
    const put = (dep: number, tangentExt: number, depthExt: number, y: number, h: number): THREE.Matrix4 => {
      const p = interiorPoint(sgn * (along + outPoke), dep);
      return new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, y, p.z),
        new THREE.Quaternion(),
        new THREE.Vector3(tx !== 0 ? tangentExt : depthExt, h, tx !== 0 ? depthExt : tangentExt),
      );
    };

    // El hueco tallado en el muro deja repisas horizontales en y0/y1 y jambas
    // verticales en depFrom/depTo. Las barras del marco SOLAPAN ese borde del
    // hueco (`ledgeOv` hacia dentro del vano) en vez de tocarlo a ras, para que
    // ninguna cara quede coplanar con el muro (causa del ruido/parpadeo).
    const ledgeOv = 0.04;

    // Barras horizontales (dintel + antepecho): cubren la repisa del muro.
    K.furnDarkMats.push(put((depFrom + depTo) / 2, barW, winLen + barW, y1 + (barW - ledgeOv) / 2, barW + ledgeOv));
    K.furnDarkMats.push(put((depFrom + depTo) / 2, barW, winLen + barW, y0 - (barW - ledgeOv) / 2, barW + ledgeOv));

    // Barras verticales. Divisores entre cristales (dentro del vano, sin tocar el
    // muro) + tapas de los extremos, que cubren la jamba del hueco. Todas con la
    // tangente algo menor (vBarW) para quedar embebidas en las horizontales.
    const vBarW = barW - 0.02;
    for (let i = 1; i < count; i++) {
      const dep = depFrom + i * (paneActual + barW) - barW / 2;
      K.furnDarkMats.push(put(dep, vBarW, barW, yMid, winH + barW));
    }
    K.furnDarkMats.push(put(depFrom - barW / 2 + ledgeOv / 2, vBarW, barW + ledgeOv, yMid, winH + barW));
    K.furnDarkMats.push(put(depTo + barW / 2 - ledgeOv / 2, vBarW, barW + ledgeOv, yMid, winH + barW));

    // Cristales de colores, EMBEBIDOS un poco bajo el marco (bury) para que ningún
    // borde del cristal quede coplanar con una barra (era la causa del parpadeo).
    const bury = 0.03;
    for (let i = 0; i < count; i++) {
      const depCenter = depFrom + i * (paneActual + barW) + paneActual / 2;
      K.stainedGlassMats.push(put(depCenter, GLASS_T, paneActual + 2 * bury, yMid, winH + 2 * bury));
      K.stainedGlassColors.push(new THREE.Color(STAINED_GLASS_COLORS[(i + colorIdx) % STAINED_GLASS_COLORS.length]));
    }
  }
}

/**
 * Falso techo registrable: una placa blanca continua bajo el tejado + una
 * retícula fina de líneas grises que la divide en baldosas (estilo techo de
 * oficina/súper). Las líneas van apenas por debajo del intradós de la placa,
 * embebidas en ella para no compartir cara.
 */
function addCeilingTiles(
  K: RenderBuckets,
  interiorPoint: (along: number, dep: number) => { x: number; z: number },
  tx: number,
  fw: number,
  depthLen: number,
  h: number,
): void {
  const t = MARKET_WALL_T;
  const inAlong = fw - 2 * t; // ancho interior (a lo largo de la fachada)
  const inDep = depthLen - 2 * t; // fondo interior
  const ceilY = h - 0.5; // cota del falso techo (bajo el tejado, sobre los cordones)
  const plateH = 0.08;

  // Compone una caja dada en coordenadas locales (along, dep) del súper.
  const box = (along: number, dep: number, y: number, alongExt: number, depExt: number, hh: number): THREE.Matrix4 => {
    const p = interiorPoint(along, dep);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, y, p.z),
      new THREE.Quaternion(),
      new THREE.Vector3(tx !== 0 ? alongExt : depExt, hh, tx !== 0 ? depExt : alongExt),
    );
  };

  // Placa blanca continua.
  K.marketCeilingMats.push(box(0, depthLen / 2, ceilY, inAlong, inDep, plateH));

  // Retícula: líneas finas justo bajo el intradós de la placa (embebidas en ella).
  const tile = 1.2; // tamaño aproximado de baldosa
  const lineW = 0.04;
  const lineH = 0.03;
  const lineY = ceilY - plateH / 2 - 0.005;
  const nA = Math.max(1, Math.round(inAlong / tile));
  const nD = Math.max(1, Math.round(inDep / tile));
  for (let i = 1; i < nA; i++) {
    const a = -inAlong / 2 + (i * inAlong) / nA;
    K.marketCeilingLineMats.push(box(a, depthLen / 2, lineY, lineW, inDep, lineH));
  }
  for (let j = 1; j < nD; j++) {
    const dep = t + (j * inDep) / nD;
    K.marketCeilingLineMats.push(box(0, dep, lineY, inAlong, lineW, lineH));
  }
}
