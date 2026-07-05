import * as THREE from 'three';
import { marketDoorAlong, marketDoorGeometry, MARKET_WALL_T } from '../../../city/buildings/interior/marketInterior';
import { MARKET_SECTION_CATALOG } from '../../../city/buildings/interior/marketSections';
import { rng2 } from '../../../core/seededRng';
import type { RenderBuckets, RenderFurniture, SlidingDoorPose } from '../BuildingRenderer';
import { type BuildingGeom, type BuildingRenderCtx, type RenderBuilding } from '../BuildingRenderer';
import type { ShopSubRenderer } from './ShopSubRenderer';

/** Colores de marca del supermercado (vivos, estilo cartelería comercial). */
const FASCIA_RED = 0xd6202a; // franja del rótulo
const PORTAL_YELLOW = 0xf2b21e; // marco de la entrada y marquesina
const BASE_GREEN = 0x3f9e4d; // zócalo verde
const ACCENT = [0xe8721c, 0x2fa8c8]; // carteles laterales (naranja / cian)
/** Paleta de vidriera: tonos saturados típicos de vidrio de colores. */
const STAINED_GLASS_COLORS = [0xb03a3a, 0x3a6bb0, 0x3aa15a, 0xd1a13a, 0x8a4fae, 0x3aa1a1];

/** Grosor de las hojas de cristal (fijas y correderas). */
const GLASS_T = 0.08;
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
    if (b.marketInterior) {
      for (const f of b.marketInterior.furniture) addMarketFurniture(K, H, f);
    }
  }
}

/** Recorre una pieza de mobiliario del súper y la vuelca en sus buckets. */
function addMarketFurniture(K: RenderBuckets, H: BuildingRenderCtx['helpers'], f: RenderFurniture): void {
  switch (f.kind) {
    case 'checkout':
      addCheckoutUnit(K, H, f);
      break;
    case 'conveyor':
      addConveyorUnit(K, H, f);
      break;
    case 'shelfAisle':
      addGondola(K, H, f, 1.4);
      break;
    case 'wallShelf':
      addGondola(K, H, f, 1.8);
      break;
    case 'produceRack':
      addFruitSection(K, H, f);
      break;
    case 'produceCrate':
      addProduceCrate(K, H, f);
      break;
    case 'fishCounter':
      addFishCounter(K, H, f);
      break;
    case 'meatCounter':
      addMeatCounter(K, H, f);
      break;
    case 'fishTable':
      addFishTable(K, H, f);
      break;
  }
}

/**
 * Cuerpo de la caja registradora (pieza `checkout`), estilo caja de súper real:
 * zócalo gris, cuerpo ROJO, tapa de acero claro, registradora oscura encima y
 * una mampara pequeña de plexi en el borde del lado de la cinta. La cinta
 * (`conveyor`) va DETRÁS (lado tienda); la normal `f.faceX/faceZ` mira a la
 * fachada, donde se coloca la trabajadora.
 */
function addCheckoutUnit(K: RenderBuckets, H: BuildingRenderCtx['helpers'], f: RenderFurniture): void {
  const nx = f.faceX;
  const nz = f.faceZ; // hacia la fachada (la salida)
  const tanx = nz;
  const tanz = -nx;
  const alongIsX = Math.abs(tanx) > 0.5;
  const across = alongIsX ? f.w : f.d; // ancho (a lo largo de la fila de cajas)
  const flow = alongIsX ? f.d : f.w; // fondo (sentido del flujo de compra)
  const put = (aOff: number, inOff: number, y: number, lenA: number, lenIn: number, hh: number): THREE.Matrix4 => {
    const x = f.x + tanx * aOff + nx * inOff;
    const z = f.z + tanz * aOff + nz * inOff;
    return H.compose(x, z, y, alongIsX ? lenA : lenIn, hh, alongIsX ? lenIn : lenA);
  };

  // Zócalo gris + cuerpo rojo (embebido en el zócalo, costados retranqueados)
  // + tapa de acero claro que remata envolviendo. El zócalo remata en 0.18, por
  // ENCIMA de la cara superior del suelo del súper (0.12): si acabaran a la
  // misma cota, sus caras serían coplanares y parpadearían en la base.
  K.conveyorMats.push(put(0, 0, 0.09, across, flow, 0.18));
  K.produceMats.push(put(0, 0, 0.49, across - 0.08, flow - 0.08, 0.66));
  K.produceColors.push(new THREE.Color(FASCIA_RED));
  K.checkoutMats.push(put(0, 0, 0.86, across + 0.02, flow + 0.02, 0.08));

  // Registradora oscura sobre la tapa (hundida 0.01), hacia el lado de la cinta.
  K.conveyorMats.push(put(across * 0.25, -flow * 0.15, 1.01, 0.32, 0.28, 0.24));
  // Mampara de plexi en el borde interior (base enterrada en la tapa).
  K.marketGlassMats.push(put(-across * 0.1, -flow / 2 + 0.06, 1.08, 0.55, GLASS_T, 0.4));
}

/**
 * Cinta transportadora (pieza `conveyor`), a juego con el cuerpo de la caja:
 * zócalo gris, cuerpo rojo, marco de acero algo más bajo que la tapa de la caja
 * y la banda OSCURA de la cinta embebida en el marco. Se alarga un poco hacia
 * la caja (+normal) para que la junta quede enterrada dentro del cuerpo (sin
 * caras coplanares en el encuentro).
 */
function addConveyorUnit(K: RenderBuckets, H: BuildingRenderCtx['helpers'], f: RenderFurniture): void {
  const nx = f.faceX;
  const nz = f.faceZ; // hacia la fachada (donde está el cuerpo de la caja)
  const tanx = nz;
  const tanz = -nx;
  const alongIsX = Math.abs(tanx) > 0.5;
  const across = alongIsX ? f.w : f.d;
  const flow = alongIsX ? f.d : f.w;
  const put = (aOff: number, inOff: number, y: number, lenA: number, lenIn: number, hh: number): THREE.Matrix4 => {
    const x = f.x + tanx * aOff + nx * inOff;
    const z = f.z + tanz * aOff + nz * inOff;
    return H.compose(x, z, y, alongIsX ? lenA : lenIn, hh, alongIsX ? lenIn : lenA);
  };

  const ext = 0.06; // solape hacia la caja: la junta queda dentro del cuerpo rojo
  // Zócalo hasta 0.18: por encima de la cara superior del suelo (0.12), ver addCheckoutUnit.
  K.conveyorMats.push(put(0, ext / 2, 0.09, across, flow + ext, 0.18));
  K.produceMats.push(put(0, ext / 2, 0.49, across - 0.06, flow + ext - 0.06, 0.66));
  K.produceColors.push(new THREE.Color(FASCIA_RED));
  K.checkoutMats.push(put(0, ext / 2, 0.82, across + 0.02, flow + ext + 0.02, 0.08));
  // Banda oscura de la cinta, embebida en el marco de acero.
  K.conveyorMats.push(put(0, 0, 0.865, across - 0.16, flow - 0.2, 0.03));
}

/**
 * Góndola/estantería de súper tipo la referencia: zócalo bajo oscuro, un par de
 * montantes en los extremos, panel trasero y VARIAS baldas horizontales con
 * huecos entre ellas (los espacios donde irá la comida). Gris metálico claro
 * (reutiliza el bucket de las cajas) para el marco y las baldas; zócalo oscuro.
 *
 * La pieza es una caja larga y fina: uno de los dos lados horizontales es el
 * largo del tramo y el otro el grosor (~1 m en pasillo, menos contra el muro).
 * Como todo es axis-aligned, mapeamos (along, thick) → (X, Z) según cuál sea el
 * eje largo.
 */
function addGondola(K: RenderBuckets, H: BuildingRenderCtx['helpers'], f: RenderFurniture, height: number): void {
  const alongX = f.w >= f.d;
  const length = alongX ? f.w : f.d; // largo del tramo de estantería
  const thick = alongX ? f.d : f.w; // fondo (grosor) de la góndola
  // Compone una caja dada en coordenadas locales (a lo largo del tramo / del fondo).
  const put = (a: number, t: number, y: number, lenA: number, lenT: number, h: number): THREE.Matrix4 => {
    const x = f.x + (alongX ? a : t);
    const z = f.z + (alongX ? t : a);
    return H.compose(x, z, y, alongX ? lenA : lenT, h, alongX ? lenT : lenA);
  };

  // Bandas de altura sin solaparse: el zócalo ocupa 0..baseH y el resto de la
  // estructura arranca en baseH, para que ninguna caja comparta cara (evita el
  // z-fighting que se veía en los costados).
  const baseH = 0.22;
  const postW = 0.07;
  const upperY = (baseH + height) / 2; // centro de la parte alta (baseH..height)
  const upperH = height - baseH;
  const postGapZ = length - postW * 2; // vano interior entre montantes

  // Zócalo inferior (kickplate) oscuro.
  K.furnDarkMats.push(put(0, 0, baseH / 2, length, thick, baseH));
  // Montantes verticales en los dos extremos: dan marco a la estantería.
  K.checkoutMats.push(put(length / 2 - postW / 2, 0, upperY, postW, thick, upperH));
  K.checkoutMats.push(put(-length / 2 + postW / 2, 0, upperY, postW, thick, upperH));
  // Panel trasero central, ENTRE los montantes (no los toca) y sobre el zócalo.
  K.checkoutMats.push(put(0, 0, upperY, postGapZ - 0.02, thick * 0.14, upperH));

  // Baldas horizontales con hueco entre ellas (los espacios donde irá la comida).
  const tiers = Math.max(3, Math.round((height - 0.3) / 0.4));
  const y0 = baseH + 0.13;
  const y1 = height - 0.05;
  const boardLen = postGapZ - 0.04; // encajan entre montantes sin compartir cara
  const tierYs: number[] = [];
  for (let i = 0; i < tiers; i++) {
    const y = tiers > 1 ? y0 + ((y1 - y0) * i) / (tiers - 1) : (y0 + y1) / 2;
    tierYs.push(y);
    K.checkoutMats.push(put(0, 0, y, boardLen, thick, 0.05));
  }

  // Productos: cajas genéricas del color de la SECCIÓN de cada cara (ver
  // `marketSections.ts`), en fila sobre cada balda, pegadas al panel trasero,
  // con tamaño/tono variados y algún hueco (RNG local seeded por posición).
  if (f.sections && f.sections.length > 0) {
    const rng = rng2(Math.round(f.x * 7) * 131 + Math.round(f.z * 7) + 99);
    const faceSign = alongX ? Math.sign(f.faceZ) : Math.sign(f.faceX); // cara `sections[0]` en el eje del fondo
    const sides = [
      { sign: faceSign, section: f.sections[0] },
      { sign: -faceSign, section: f.sections[1] },
    ];
    const prodD = thick * 0.3;
    const prodOff = thick * 0.07 + 0.02 + prodD / 2; // arrimado al panel trasero (semigrosor `thick*0.07`)
    const gapY = tiers > 1 ? (y1 - y0) / (tiers - 1) : 0.4; // hueco vertical entre baldas
    for (const side of sides) {
      if (!side.section) continue;
      const base = new THREE.Color(MARKET_SECTION_CATALOG[side.section].color);
      for (const y of tierYs) {
        const slots = Math.max(2, Math.floor(boardLen / 0.44));
        const slotW = boardLen / slots;
        for (let s = 0; s < slots; s++) {
          if (rng.next() < 0.12) continue; // hueco: balda no perfectamente llena
          const h = Math.min(gapY - 0.14, 0.34) * rng.range(0.7, 1);
          K.produceMats.push(
            put(-boardLen / 2 + slotW * (s + 0.5), side.sign * prodOff, y + 0.025 + h / 2, slotW - rng.range(0.08, 0.16), prodD, h),
          );
          K.produceColors.push(base.clone().offsetHSL(rng.range(-0.02, 0.02), rng.range(-0.08, 0.08), rng.range(-0.06, 0.06)));
        }
      }
    }
  }
}

/** Colores de fruta/verdura para los montones de la frutería. */
const PRODUCE_COLORS = [0xd23b2a, 0x4e9e3a, 0xe8912a, 0xf0cf3a, 0x8e3fae, 0xdd7b2a, 0xc23a5f, 0x9bbf3a];
const CRATE_GREEN = 0x3f9e4d;

/**
 * Sección de frutería contra una pared lateral (pieza `produceRack`): mueble
 * base claro, un panel trasero VERTICAL que la cierra recta por detrás, y varias
 * tarimas de cajas verdes con fruta apoyadas sobre una SUPERFICIE INCLINADA que
 * sube hacia la pared (el frente más bajo, la cara superior mirando al cliente),
 * como en la frutería de un súper real. `f.faceX/faceZ` es la normal hacia el
 * interior; el tramo corre a lo largo de la pared (eje perpendicular a esa normal).
 */
function addFruitSection(K: RenderBuckets, H: BuildingRenderCtx['helpers'], f: RenderFurniture): void {
  const nx = f.faceX;
  const nz = f.faceZ; // hacia el interior de la tienda
  const tanx = nz;
  const tanz = -nx; // a lo largo de la pared
  const alongIsX = Math.abs(tanx) > 0.5;
  const rackLen = alongIsX ? f.w : f.d; // largo del tramo (a lo largo de la pared)
  const rackDepth = alongIsX ? f.d : f.w; // fondo hacia el interior
  // Caja axis-aligned en coordenadas locales: aOff a lo largo de la pared, inOff hacia el interior.
  const put = (aOff: number, inOff: number, y: number, lenA: number, lenIn: number, hh: number): THREE.Matrix4 => {
    const x = f.x + tanx * aOff + nx * inOff;
    const z = f.z + tanz * aOff + nz * inOff;
    return H.compose(x, z, y, alongIsX ? lenA : lenIn, hh, alongIsX ? lenIn : lenA);
  };
  // Caja INCLINADA: igual, pero girada `tilt` alrededor del eje de la pared (la
  // tangente), así su cara superior se abre hacia el cliente (+normal).
  const axis = new THREE.Vector3(tanx, 0, tanz); // unitario (|(nx,nz)| = 1)
  const putTilted = (aOff: number, inOff: number, y: number, lenA: number, lenIn: number, hh: number, tilt: number): THREE.Matrix4 => {
    const x = f.x + tanx * aOff + nx * inOff;
    const z = f.z + tanz * aOff + nz * inOff;
    const q = new THREE.Quaternion().setFromAxisAngle(axis, tilt);
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(alongIsX ? lenA : lenIn, hh, alongIsX ? lenIn : lenA));
  };

  const frontIn = rackDepth / 2; // borde hacia el cliente
  const backIn = -rackDepth / 2; // pegado a la pared
  const baseTop = 0.8;

  // Mueble base claro (plinto) + repisa superior oscura. La rampa arranca algo
  // por detrás del frente del plinto, así el BLANCO asoma por delante y todo lo
  // verde queda posado encima: primero blanco, luego verde.
  const baseDepth = rackDepth;
  K.checkoutMats.push(put(0, 0, baseTop / 2, rackLen, baseDepth, baseTop));
  K.furnDarkMats.push(put(0, 0, baseTop, rackLen + 0.02, baseDepth + 0.04, 0.06));

  // ── Rampa RECTA única (sin escalones), como el costado triangular ──
  const backThick = 0.1;
  const tilt = 0.7; // ~40° de inclinación de la rampa
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const slopeFrontIn = frontIn - 0.1; // arranque delantero (deja asomar el plinto)
  const slopeBackIn = backIn + backThick + 0.05; // remate trasero, justo delante del panel
  const run = slopeFrontIn - slopeBackIn; // recorrido horizontal de la rampa
  const rise = run * Math.tan(tilt); // subida total
  const topY = baseTop + rise; // cota del borde alto (junto a la pared)
  const slopeLen = run / cos; // largo de la rampa sobre el plano inclinado
  const midIn = (slopeFrontIn + slopeBackIn) / 2;
  const slopeMidY = (baseTop + topY) / 2;

  // Panel trasero VERTICAL (cierra recto por detrás), embebido en las mejillas,
  // con el cabecero oscuro de precios envolviéndolo en el remate. El panel acaba
  // 4 cm POR DEBAJO del remate del cabecero (queda enterrado dentro de él): si
  // ambos acabaran a la misma cota, sus caras superiores serían coplanares y
  // parpadearían vistas desde arriba.
  const panelTop = topY + 0.28;
  const panelBuriedTop = panelTop - 0.04;
  K.checkoutMats.push(put(0, backIn + backThick / 2, (baseTop + panelBuriedTop) / 2, rackLen - 0.3, backThick, panelBuriedTop - baseTop));
  K.conveyorMats.push(put(0, backIn + backThick / 2, panelTop - 0.12, rackLen - 0.1, backThick + 0.06, 0.24));

  // Tablero oscuro de la rampa: centrado SOBRE la recta de la pendiente, con los
  // extremos embebidos en las mejillas. Su cara inferior y la cara superior de la
  // mejilla son planos PARALELOS separados boardH/2 — nunca coplanares.
  const boardH = 0.06;
  K.furnDarkMats.push(putTilted(0, midIn, slopeMidY, rackLen - 0.04, slopeLen, boardH, tilt));

  // Mejillas laterales triangulares: la hipotenusa ES la recta de la rampa, de
  // (frente, plinto) a (fondo, remate). Losa cizallada (base no ortonormal:
  // extrusión vertical) extruida hacia abajo; el sobrante se entierra en el plinto.
  const cheekThick = 0.05;
  const eAlong = new THREE.Vector3(tanx, 0, tanz); // eje de la pared (grosor de la mejilla)
  const L = Math.hypot(run, rise);
  const eSlope = new THREE.Vector3((-run * nx) / L, rise / L, (-run * nz) / L); // hipotenusa frente→fondo
  const eDown = new THREE.Vector3(0, -1, 0); // extrusión vertical (cizalla respecto a la hipotenusa)
  const slabThick = rise + 0.15; // llega al plinto; el resto queda enterrado
  for (const end of [-1, 1] as const) {
    const aOff = end * (rackLen / 2 - cheekThick / 2);
    const cx = f.x + nx * midIn + tanx * aOff;
    const cz = f.z + nz * midIn + tanz * aOff;
    const m = new THREE.Matrix4().makeBasis(eAlong, eDown, eSlope);
    m.scale(new THREE.Vector3(cheekThick, slabThick, L));
    m.setPosition(cx, slopeMidY - slabThick / 2, cz); // cara superior sobre la recta de la rampa
    K.checkoutMats.push(m);
  }

  // Cajas CUADRADAS verdes en rejilla sobre la rampa (columnas a lo ancho ×
  // hileras rampa arriba), cada una con su fruta de color asomando por el borde.
  // Cada caja se desplaza `s` por la dirección de subida (û = −cos·n̂ + sin·ŷ) y
  // `lift` por la normal del plano (p̂ = sin·n̂ + cos·ŷ), hundida 0.01 en el
  // tablero (caras paralelas al tablero, nunca coplanares).
  const cSize = 0.52; // caja cuadrada
  const crateH = 0.16;
  const gapA = 0.06; // hueco entre cajas a lo ancho
  const gapS = 0.08; // hueco entre hileras rampa arriba
  const cols = Math.max(2, Math.floor((rackLen - 0.2) / (cSize + gapA)));
  const rows = Math.max(1, Math.floor((slopeLen - 0.06 + gapS) / (cSize + gapS)));
  const spanA = cols * cSize + (cols - 1) * gapA;
  const spanS = rows * cSize + (rows - 1) * gapS;
  const lift = boardH / 2 - 0.01 + crateH / 2; // posada en el tablero
  const liftF = lift + crateH / 2; // la fruta asoma media altura sobre el borde de la caja
  for (let r = 0; r < rows; r++) {
    const s = -spanS / 2 + cSize / 2 + r * (cSize + gapS); // coordenada rampa arriba
    const inC = midIn - s * cos;
    const yC = slopeMidY + s * sin;
    for (let c = 0; c < cols; c++) {
      const aOff = -spanA / 2 + cSize / 2 + c * (cSize + gapA);
      K.produceMats.push(putTilted(aOff, inC + lift * sin, yC + lift * cos, cSize, cSize, crateH, tilt));
      K.produceColors.push(new THREE.Color(CRATE_GREEN));
      const col = PRODUCE_COLORS[(c * 3 + r * 5) % PRODUCE_COLORS.length];
      K.produceMats.push(putTilted(aOff, inC + liftF * sin, yC + liftF * cos, cSize - 0.12, cSize - 0.12, 0.12, tilt));
      K.produceColors.push(new THREE.Color(col));
    }
  }
}

/**
 * Isla de fruta suelta (pieza `produceCrate`): un pallet/cajón oscuro con un
 * montón de fruta de colores heaped encima (capa base + montículo central),
 * tipo la isla de sandías del centro de una frutería.
 */
function addProduceCrate(K: RenderBuckets, H: BuildingRenderCtx['helpers'], f: RenderFurniture): void {
  const cx = f.x;
  const cz = f.z;
  // Pallet/cajón oscuro + reborde superior claro que envuelve el borde.
  K.furnDarkMats.push(H.compose(cx, cz, 0.27, f.w, 0.54, f.d));
  K.checkoutMats.push(H.compose(cx, cz, 0.54, f.w + 0.03, 0.06, f.d + 0.03));

  const push = (x: number, z: number, y: number, w: number, h: number, d: number, col: number): void => {
    K.produceMats.push(H.compose(x, z, y, w, h, d));
    K.produceColors.push(new THREE.Color(col));
  };
  // Capa base de fruta (rejilla de segmentos de colores).
  const nx = Math.max(2, Math.round(f.w / 0.55));
  const nz = Math.max(2, Math.round(f.d / 0.55));
  const gw = f.w - 0.12;
  const gd = f.d - 0.12;
  let idx = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = cx - gw / 2 + (i + 0.5) * (gw / nx);
      const z = cz - gd / 2 + (j + 0.5) * (gd / nz);
      push(x, z, 0.64, gw / nx - 0.04, 0.2, gd / nz - 0.04, PRODUCE_COLORS[idx++ % PRODUCE_COLORS.length]);
    }
  }
  // Montículo central (segunda capa, más pequeña) para dar volumen de "montón".
  const mw = f.w * 0.55;
  const md = f.d * 0.55;
  const mnx = Math.max(1, Math.round(mw / 0.55));
  const mnz = Math.max(1, Math.round(md / 0.55));
  for (let i = 0; i < mnx; i++) {
    for (let j = 0; j < mnz; j++) {
      const x = cx - mw / 2 + (i + 0.5) * (mw / mnx);
      const z = cz - md / 2 + (j + 0.5) * (md / mnz);
      push(x, z, 0.79, mw / mnx - 0.05, 0.18, md / mnz - 0.05, PRODUCE_COLORS[(idx++ + 3) % PRODUCE_COLORS.length]);
    }
  }
}

/* Pescadería: bandejas azules (y alguna verde lima), hielo blanco y género. */
const TRAY_BLUE = 0x6fa8d0;
const TRAY_LIME = 0xa8c93f;
const ICE_WHITE = 0xeef4f6;
/** Colores del género sobre el hielo: gambas, pescado gris, mejillón, calamar, sepia, salmonete. */
const FISH_COLORS = [0xe0855f, 0x8a97a0, 0x3a4148, 0xb392aa, 0xf0e6da, 0xc46a6a];

/**
 * Expositor de la pescadería (pieza `fishCounter`): mostrador inox con una
 * bandeja superior LIGERAMENTE inclinada hacia el cliente, cubierta de cajas
 * azules/lima llenas de hielo blanco con el género de color encima, y un
 * cristal bajo al frente, como el mostrador de una pescadería real.
 * `f.faceX/faceZ` es la normal hacia la tienda (el cliente).
 */
function addFishCounter(K: RenderBuckets, H: BuildingRenderCtx['helpers'], f: RenderFurniture): void {
  const nx = f.faceX;
  const nz = f.faceZ; // hacia el cliente
  const tanx = nz;
  const tanz = -nx; // a lo largo del mostrador
  const alongIsX = Math.abs(tanx) > 0.5;
  const len = alongIsX ? f.w : f.d; // largo del mostrador
  const depth = alongIsX ? f.d : f.w; // fondo
  const put = (aOff: number, inOff: number, y: number, lenA: number, lenIn: number, hh: number): THREE.Matrix4 => {
    const x = f.x + tanx * aOff + nx * inOff;
    const z = f.z + tanz * aOff + nz * inOff;
    return H.compose(x, z, y, alongIsX ? lenA : lenIn, hh, alongIsX ? lenIn : lenA);
  };
  const axis = new THREE.Vector3(tanx, 0, tanz);
  const putTilted = (aOff: number, inOff: number, y: number, lenA: number, lenIn: number, hh: number, tilt: number): THREE.Matrix4 => {
    const x = f.x + tanx * aOff + nx * inOff;
    const z = f.z + tanz * aOff + nz * inOff;
    const q = new THREE.Quaternion().setFromAxisAngle(axis, tilt);
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(alongIsX ? lenA : lenIn, hh, alongIsX ? lenIn : lenA));
  };
  const frontIn = depth / 2;

  // Mueble base inox + canto de acero oscuro envolvente (todo metálico).
  const baseTop = 0.8;
  K.checkoutMats.push(put(0, 0, baseTop / 2, len, depth, baseTop));
  K.conveyorMats.push(put(0, 0, baseTop, len + 0.02, depth + 0.04, 0.06));

  // Bandeja superior apenas inclinada hacia el cliente (~8°), plancha de acero.
  const tilt = 0.14;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const boardH = 0.05;
  const boardY = baseTop + 0.12;
  const slopeLen = (depth - 0.12) / cos;
  K.conveyorMats.push(putTilted(0, 0, boardY, len - 0.06, slopeLen, boardH, tilt));

  // Rejilla de cajas con hielo y género, posadas en el tablero (hundidas 0.01,
  // caras paralelas al tablero — nunca coplanares).
  const trayS = 0.55;
  const trayH = 0.12;
  const gap = 0.06;
  const cols = Math.max(2, Math.floor((len - 0.2) / (trayS + gap)));
  const rows = Math.max(1, Math.floor(slopeLen / (trayS + gap)));
  const spanA = cols * trayS + (cols - 1) * gap;
  const spanS = rows * trayS + (rows - 1) * gap;
  const lift = boardH / 2 - 0.01 + trayH / 2;
  const liftIce = lift + trayH / 2 - 0.02; // el hielo asoma por el borde de la caja
  const liftFish = liftIce + 0.06; // el género, medio hundido en el hielo
  const putOn = (aOff: number, s: number, liftK: number, lenA: number, lenIn: number, hh: number): THREE.Matrix4 =>
    putTilted(aOff, -s * cos + liftK * sin, boardY + s * sin + liftK * cos, lenA, lenIn, hh, tilt);
  for (let r = 0; r < rows; r++) {
    const s = -spanS / 2 + trayS / 2 + r * (trayS + gap);
    for (let c = 0; c < cols; c++) {
      const aOff = -spanA / 2 + trayS / 2 + c * (trayS + gap);
      // Bandejas azules, con un grupo verde lima en un extremo (como la referencia).
      const trayCol = c >= cols - 2 ? TRAY_LIME : TRAY_BLUE;
      K.produceMats.push(putOn(aOff, s, lift, trayS, trayS, trayH));
      K.produceColors.push(new THREE.Color(trayCol));
      K.produceMats.push(putOn(aOff, s, liftIce, trayS - 0.1, trayS - 0.1, 0.1));
      K.produceColors.push(new THREE.Color(ICE_WHITE));
      // Peces low-poly sobre el hielo: 3 por bandeja, tumbados en paralelo con
      // la cabeza hacia el cliente (rampa abajo), una especie/color por bandeja.
      // Cada pez = cuerpo + cola más fina y baja, solapada 0.02 dentro del
      // cuerpo (su cara de arranque queda embebida, nunca coplanar) y ambos
      // hundidos 0.015 en el hielo.
      const fishCol = new THREE.Color(FISH_COLORS[(c * 2 + r) % FISH_COLORS.length]);
      for (let k = 0; k < 3; k++) {
        const aF = aOff + (k - 1) * 0.13;
        const sF = s - 0.02;
        K.produceMats.push(putOn(aF, sF - 0.05, liftFish, 0.09, 0.2, 0.05)); // cuerpo
        K.produceColors.push(fishCol);
        K.produceMats.push(putOn(aF, sF + 0.08, liftFish - 0.01, 0.04, 0.1, 0.03)); // cola
        K.produceColors.push(fishCol);
      }
    }
  }

  // Cristal bajo al frente del mostrador, con la base enterrada en el canto oscuro.
  K.marketGlassMats.push(put(0, frontIn - 0.08, baseTop + 0.26, len - 0.12, GLASS_T, 0.5));
}

/* Carnicería: bandejas blancas (con alguna negra) y cortes de carne. */
const TRAY_WHITE = 0xe9e7e2;
const TRAY_DARK = 0x35353a;
/** Colores de los cortes: ternera, cerdo rosado, buey, pollo pálido, salchicha, embutido. */
const MEAT_COLORS = [0xb03636, 0xd8707a, 0x8e3030, 0xe8c9a0, 0xc4574e, 0x9e4848];

/**
 * Expositor de la carnicería (pieza `meatCounter`): mismo mostrador metálico
 * que la pescadería (base inox, plancha inclinada ~8°, cristal bajo al frente),
 * pero con bandejas blancas/negras SIN hielo y dos cortes de carne por bandeja
 * (una pieza grande y otra menor, del mismo color = mismo tipo de carne).
 */
function addMeatCounter(K: RenderBuckets, H: BuildingRenderCtx['helpers'], f: RenderFurniture): void {
  const nx = f.faceX;
  const nz = f.faceZ; // hacia el cliente
  const tanx = nz;
  const tanz = -nx; // a lo largo del mostrador
  const alongIsX = Math.abs(tanx) > 0.5;
  const len = alongIsX ? f.w : f.d;
  const depth = alongIsX ? f.d : f.w;
  const put = (aOff: number, inOff: number, y: number, lenA: number, lenIn: number, hh: number): THREE.Matrix4 => {
    const x = f.x + tanx * aOff + nx * inOff;
    const z = f.z + tanz * aOff + nz * inOff;
    return H.compose(x, z, y, alongIsX ? lenA : lenIn, hh, alongIsX ? lenIn : lenA);
  };
  const axis = new THREE.Vector3(tanx, 0, tanz);
  const putTilted = (aOff: number, inOff: number, y: number, lenA: number, lenIn: number, hh: number, tilt: number): THREE.Matrix4 => {
    const x = f.x + tanx * aOff + nx * inOff;
    const z = f.z + tanz * aOff + nz * inOff;
    const q = new THREE.Quaternion().setFromAxisAngle(axis, tilt);
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(alongIsX ? lenA : lenIn, hh, alongIsX ? lenIn : lenA));
  };
  const frontIn = depth / 2;

  // Mueble base inox + canto de acero oscuro envolvente (todo metálico).
  const baseTop = 0.8;
  K.checkoutMats.push(put(0, 0, baseTop / 2, len, depth, baseTop));
  K.conveyorMats.push(put(0, 0, baseTop, len + 0.02, depth + 0.04, 0.06));

  // Plancha superior apenas inclinada hacia el cliente (~8°).
  const tilt = 0.14;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const boardH = 0.05;
  const boardY = baseTop + 0.12;
  const slopeLen = (depth - 0.12) / cos;
  K.conveyorMats.push(putTilted(0, 0, boardY, len - 0.06, slopeLen, boardH, tilt));

  // Rejilla de bandejas con cortes de carne (hundidas 0.01 en la plancha).
  const trayS = 0.55;
  const trayH = 0.12;
  const gap = 0.06;
  const cols = Math.max(2, Math.floor((len - 0.2) / (trayS + gap)));
  const rows = Math.max(1, Math.floor(slopeLen / (trayS + gap)));
  const spanA = cols * trayS + (cols - 1) * gap;
  const spanS = rows * trayS + (rows - 1) * gap;
  const lift = boardH / 2 - 0.01 + trayH / 2;
  const liftMeat = lift + 0.04; // cortes dentro de la bandeja, asomando por el borde
  const putOn = (aOff: number, s: number, liftK: number, lenA: number, lenIn: number, hh: number): THREE.Matrix4 =>
    putTilted(aOff, -s * cos + liftK * sin, boardY + s * sin + liftK * cos, lenA, lenIn, hh, tilt);
  for (let r = 0; r < rows; r++) {
    const s = -spanS / 2 + trayS / 2 + r * (trayS + gap);
    for (let c = 0; c < cols; c++) {
      const aOff = -spanA / 2 + trayS / 2 + c * (trayS + gap);
      // Bandejas blancas con alguna negra intercalada.
      K.produceMats.push(putOn(aOff, s, lift, trayS, trayS, trayH));
      K.produceColors.push(new THREE.Color((c + r) % 3 === 0 ? TRAY_DARK : TRAY_WHITE));
      // Dos cortes por bandeja, mismo color (mismo tipo de carne).
      const meatCol = new THREE.Color(MEAT_COLORS[(c * 2 + r) % MEAT_COLORS.length]);
      K.produceMats.push(putOn(aOff - 0.09, s - 0.02, liftMeat, 0.18, 0.3, 0.07));
      K.produceColors.push(meatCol);
      K.produceMats.push(putOn(aOff + 0.12, s + 0.04, liftMeat, 0.14, 0.2, 0.07));
      K.produceColors.push(meatCol);
    }
  }

  // Cristal bajo al frente del mostrador, con la base enterrada en el canto oscuro.
  K.marketGlassMats.push(put(0, frontIn - 0.08, baseTop + 0.26, len - 0.12, GLASS_T, 0.5));
}

/**
 * Mesa de trabajo de pescadería/carnicería (pieza `fishTable`): bloque inox
 * largo con tablero oscuro y unas cajas de género encima, contra el muro del fondo.
 */
function addFishTable(K: RenderBuckets, H: BuildingRenderCtx['helpers'], f: RenderFurniture): void {
  const nx = f.faceX;
  const nz = f.faceZ;
  const tanx = nz;
  const tanz = -nx;
  const alongIsX = Math.abs(tanx) > 0.5;
  const len = alongIsX ? f.w : f.d;
  const depth = alongIsX ? f.d : f.w;
  const put = (aOff: number, inOff: number, y: number, lenA: number, lenIn: number, hh: number): THREE.Matrix4 => {
    const x = f.x + tanx * aOff + nx * inOff;
    const z = f.z + tanz * aOff + nz * inOff;
    return H.compose(x, z, y, alongIsX ? lenA : lenIn, hh, alongIsX ? lenIn : lenA);
  };

  // Bloque inox + tablero de acero oscuro envolvente (todo metálico).
  const h = 0.9;
  K.checkoutMats.push(put(0, 0, h / 2, len, depth, h));
  K.conveyorMats.push(put(0, 0, h, len + 0.02, depth + 0.03, 0.05));

  // Unas cajas de género repartidas sobre la mesa (hundidas 0.01 en el tablero).
  const crateW = 0.55;
  const crateH = 0.24;
  const count = Math.max(2, Math.floor(len / 2.2));
  for (let i = 0; i < count; i++) {
    const aOff = -len / 2 + ((i + 0.5) * len) / count;
    K.produceMats.push(put(aOff, 0, h + 0.015 + crateH / 2, crateW, depth - 0.25, crateH));
    K.produceColors.push(new THREE.Color(i % 2 === 0 ? TRAY_LIME : TRAY_BLUE));
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
 * Rejilla de góndolas… no: rejilla de VIDRIERA. Coloca cristales de colores
 * (uno por tramo) más un marco de barras negras (perímetro + divisores entre
 * cristales), en AMBOS muros laterales (tangente ±).
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

/** Rejilla de bombillas colgantes del techo, con su cordón (mismo material que las farolas). */
function addCeilingLamps(
  K: RenderBuckets,
  interiorPoint: (along: number, dep: number) => { x: number; z: number },
  fw: number,
  depthLen: number,
  h: number,
): void {
  const spacing = 4.6;
  const margin = 3;
  const cols = Math.max(1, Math.round((fw - 2 * margin) / spacing) + 1);
  const rows = Math.max(1, Math.round((depthLen - 2 * margin) / spacing) + 1);
  const ceilY = h - 0.55;
  const cordLen = 1.3;
  const bulbY = ceilY - cordLen;
  const bulbSize = 0.42;

  for (let r = 0; r < rows; r++) {
    const dep = rows === 1 ? depthLen / 2 : margin + (r * (depthLen - 2 * margin)) / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const along = cols === 1 ? 0 : -fw / 2 + margin + (c * (fw - 2 * margin)) / (cols - 1);
      const p = interiorPoint(along, dep);
      K.furnDarkMats.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, (ceilY + bulbY) / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(0.05, cordLen, 0.05)));
      K.marketLampMats.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, bulbY, p.z), new THREE.Quaternion(), new THREE.Vector3(bulbSize, bulbSize, bulbSize)));
    }
  }
}

