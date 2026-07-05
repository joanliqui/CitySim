/**
 * Interior de un supermercado (nave de una sola planta), siguiendo la
 * distribución típica de un súper real: zona ABIERTA de fruta/verdura junto a
 * la entrada, pasillos de estanterías DOBLES de anchura variable, una
 * estantería simple contra el muro del fondo y una fila de cajas con mampara
 * de cristal. Datos puros (sin Three.js) — el render solo interpreta
 * `MarketInterior.furniture`.
 *
 * Trabaja en coordenadas LOCALES (along, dep): `along` es la posición a lo
 * largo de la fachada (tangente, 0 = centro de la puerta) y `dep` la
 * profundidad hacia dentro del edificio (0 = línea de fachada). `toWorld`/
 * `sizeOf` las traducen a coordenadas de mundo con los mismos vectores
 * unitarios que usa `MarketRenderer` para el casco y la puerta.
 */
import { Rng } from '../../../core/Rng';
import { rng2 } from '../../../core/seededRng';
import { SHELF_SECTIONS, type MarketSection } from './marketSections';
import type { Furniture, MarketInterior } from './types';

/** Grosor del muro perimetral de la nave (algo más grueso que el de una casa). */
export const MARKET_WALL_T = 0.3;

/** Semiancho y altura del hueco real de la puerta, compartidos por muro/marco/render. */
export function marketDoorGeometry(frontW: number, h: number): { doorHalf: number; doorTop: number } {
  return { doorHalf: Math.min(2.1, frontW * 0.08), doorTop: Math.min(h * 0.66, 4.2) };
}

/**
 * Nave ALARGADA: mucho frente pero un fondo que no da para apilar cajas +
 * góndolas + puestos del fondo hacia dentro. En ese caso el interior se GIRA
 * 90°: la puerta va pegada a un extremo de la fachada, las cajas miran al muro
 * corto de ese extremo y las secciones se reparten a lo largo de la nave.
 */
export function isMarketElongated(frontW: number, depthLen: number): boolean {
  return depthLen < NORMAL_MIN_DEPTH && frontW >= NORMAL_MIN_DEPTH;
}

/**
 * Desplazamiento LATERAL (coordenada `along`, 0 = centro de fachada) del centro
 * de la puerta. Layout normal: a un lado, alineada con el pasillo de la
 * frutería — se entra por la fruta, como en un súper real. Nave ALARGADA
 * (layout girado): pegada al extremo de la entrada, abriendo al vestíbulo de
 * las cajas. Fuente única compartida por el modelo (colocación de `b.door`),
 * el render (hueco/marco/correderas/marquesina) y las cajas de interacción.
 */
export function marketDoorAlong(frontW: number, depthLen: number): number {
  if (isMarketElongated(frontW, depthLen)) {
    return ENTRY_SIDE * (frontW / 2 - MARKET_WALL_T - END_DOOR_INSET);
  }
  return FRUIT_SIDE * (frontW / 2 - MARKET_WALL_T - FRUIT_RACK_DEPTH - FRUIT_AISLE / 2);
}

/* ── Cajas ── */
const CHECKOUT_W = 1.3;
const CHECKOUT_GAP = 1.7; // separación entre lanes (paso cómodo entre cajas)
const CHECKOUT_D = 0.7;
const CHECKOUT_DEP = 4.6; // profundidad del cuerpo de la caja desde la fachada: detrás de la caja
// (hacia la fachada) caben la TRABAJADORA y el pasillo de salida de peatones.
const CHECKOUT_DOOR_CLEAR = 1.2; // holgura entre la fila de cajas y la garganta de la puerta
const CHECKOUT_EDGE_WALK = 2.6; // paseo objetivo a cada lado de la fila de cajas (fija cuántas salen)
const CONVEYOR_LEN = 1.6;

/* ── Sección de frutería (dos tramos enfrentados junto a una pared lateral) ── */
const FRUIT_SIDE = 1; // +1 = pared derecha (lado +along); -1 = izquierda
const FRUIT_RACK_DEPTH = 1.2; // fondo de cada tramo hacia el interior
const FRUIT_AISLE = 3.8; // pasillo entre los dos tramos de frutería (la isla va en medio, con sitio para andar a los lados)
const FRUIT_WALK = 2.0; // pasillo (principal) entre la frutería y los pasillos de góndolas
const FRUIT_GAP_FRONT = 1.2; // hueco entre la zona de cajas y la frutería
const FRUIT_GAP_BACK = 1.5; // paseo entre la frutería y la carnicería del fondo
/* Isla de fruta suelta EN MEDIO de los dos tramos de frutería (pallet con montón). */
const FRUIT_ISLAND_DEPTH = 1.3; // ancho (tangente) de la isla — cabe en FRUIT_AISLE
const FRUIT_ISLAND_LEN = 2.8; // largo (a lo largo de la profundidad)
const FRUIT_ISLAND_PITCH = 6; // una isla por cada ~6 m de frutería (naves profundas: varias)

/* ── Nave ALARGADA (mucho frente, poco fondo): interior girado 90° ── */
const NORMAL_MIN_DEPTH = 16; // fondo mínimo del layout normal (cajas + góndolas + fondo apilados)
const ENTRY_SIDE = FRUIT_SIDE; // extremo de la fachada donde va la entrada del layout girado
const END_DOOR_INSET = 2.4; // centro de la puerta girada: distancia a la cara interior del muro corto
const ENTRY_WALK = 3.0; // paso de entrada entre la fachada y el arranque de la fila de cajas girada
const CROSS_CENTER_WALK = 2.4; // paseo central corrido entre los dos tramos de cada columna de góndolas

/* ── Pasillos interiores (góndolas dobles, anchura de pasillo variable) ── */
const AISLE_GAP_AFTER_CHECKOUT = 1.4;
const GONDOLA_W = 1.0;
const AISLE_W_MIN = 1.6; // anchura de pasillo (hueco entre góndolas) mínima
const AISLE_W_MAX = 2.8; // ...y máxima: de aquí sale la variedad de tamaños
const AISLE_W_AVG = (AISLE_W_MIN + AISLE_W_MAX) / 2;
const AISLE_EDGE_WALK = 3.0; // paseo objetivo a cada lado del bloque de góndolas (fija cuántas salen)
/* Paseo transversal entre el final de frutería/góndolas y el frente de los
 * puestos del fondo: las secciones se anclan al FONDO (no a una fracción de la
 * profundidad), así la nave queda igual de aprovechada sea corta o profunda. */
const AISLE_BACK_WALK = 1.2;

/* ── Estantería del fondo + margen lateral (deja ver las vidrieras) ── */
const BACK_WALL_D = 0.6;
const SIDE_MARGIN = 1.8;

/* ── Puestos con mostrador del fondo: pescadería (lado opuesto a la frutería)
 *    y carnicería (esquina del lado de la frutería). Comparten geometría. ── */
const FISH_TABLE_D = 0.7; // fondo de la mesa de trabajo (contra el muro)
const FISH_COUNTER_D = 1.4; // fondo del expositor
const FISH_WORK_GAP = 1.5; // pasillo de trabajo entre mesa y expositor
const FISH_SPLIT_GAP = 0.4; // holgura entre puestos/estantería del fondo

/* Extensión extra (hacia el fondo) de las 2 góndolas del lado de la frutería,
 * que aprovechan el hueco libre que deja el expositor (solo está en la otra mitad). */
const AISLE_EXT = 1.8;

export function makeMarketInterior(
  x: number,
  z: number,
  w: number,
  d: number,
  faceX: number,
  faceZ: number,
  h: number,
): MarketInterior {
  const frontW = faceX !== 0 ? d : w; // ancho a lo largo de la fachada (ver BuildingGeom)
  const frontDist = (faceX !== 0 ? w : d) / 2; // semiprofundidad hacia la calle
  const depthLen = frontDist * 2;
  const t = MARKET_WALL_T;

  // Tangente de la fachada (misma convención que MarketRenderer) y línea de fachada.
  const tx = faceZ;
  const tz = -faceX;
  const frontLineX = x + faceX * frontDist;
  const frontLineZ = z + faceZ * frontDist;
  const toWorld = (along: number, dep: number): { x: number; z: number } => ({
    x: frontLineX - faceX * dep + tx * along,
    z: frontLineZ - faceZ * dep + tz * along,
  });
  // El eje "along" (tangente) y "dep" (normal) son siempre ejes del mundo (X o Z),
  // así que su tamaño local se traduce en línea recta a w/d de mundo.
  const sizeOf = (alongExtent: number, depExtent: number): { w: number; d: number } =>
    faceZ !== 0 ? { w: alongExtent, d: depExtent } : { w: depExtent, d: alongExtent };

  const rng = rng2(Math.round(x * 10) * 31 + Math.round(z * 10) + 555);
  const furniture: Furniture[] = [];

  // Nave alargada: el fondo no da para el layout normal → interior girado 90°,
  // con las secciones repartidas A LO LARGO de la nave.
  if (isMarketElongated(frontW, depthLen)) {
    buildElongatedInterior(furniture, rng, x, z, frontW, depthLen, tx, tz, t);
    assignSections(furniture, rng);
    return { wallT: t, furniture };
  }

  // Fila de cajas SOLO en el tramo de fachada opuesto a la puerta (que está a un
  // lado, sobre el pasillo de la frutería): la garganta de entrada queda libre y
  // el pasillo de salida corre entre las cajas y la fachada.
  const { doorHalf } = marketDoorGeometry(frontW, h);
  const doorAlong = marketDoorAlong(frontW, depthLen);
  const coMin = FRUIT_SIDE > 0 ? -frontW / 2 + SIDE_MARGIN : doorAlong + doorHalf + CHECKOUT_DOOR_CLEAR;
  const coMax = FRUIT_SIDE > 0 ? doorAlong - doorHalf - CHECKOUT_DOOR_CLEAR : frontW / 2 - SIDE_MARGIN;
  addCheckouts(furniture, toWorld, sizeOf, coMin, coMax, faceX, faceZ);

  // Fin de la zona de cajas hacia el interior: la CINTA va detrás del cuerpo de
  // la caja (lado tienda), así que marca ella el final.
  const checkoutEndDep = CHECKOUT_DEP + CHECKOUT_D / 2 + CONVEYOR_LEN;
  const backWallDep = depthLen - t - BACK_WALL_D / 2 - 0.3;
  // Línea frontal de los puestos con mostrador del fondo (pescadería/carnicería):
  // frutería y góndolas terminan a un paseo fijo de ella, sea cual sea la
  // profundidad de la nave.
  const serviceFrontDep = backWallDep - FISH_TABLE_D / 2 - FISH_WORK_GAP - FISH_COUNTER_D;

  // Sección de frutería contra la pared lateral FRUIT_SIDE (mueble base +
  // tarimas escalonadas; el render construye las tarimas a partir de esta pieza).
  const fruitDepFrom = checkoutEndDep + FRUIT_GAP_FRONT;
  const fruitDepTo = serviceFrontDep - FRUIT_GAP_BACK;
  if (fruitDepTo - fruitDepFrom > 2) {
    addFruitSection(furniture, toWorld, sizeOf, tx, tz, FRUIT_SIDE, frontW, t, fruitDepFrom, fruitDepTo);
  }

  // Pasillos: dejan sitio a la frutería (dos tramos + su pasillo) en su lado y
  // al margen de vidrieras en el otro. Anclados al frente y rematados a un
  // paseo fijo de los puestos del fondo.
  const fruitZone = t + 2 * FRUIT_RACK_DEPTH + FRUIT_AISLE + FRUIT_WALK;
  const aisleMin = FRUIT_SIDE < 0 ? -frontW / 2 + fruitZone : -frontW / 2 + SIDE_MARGIN;
  const aisleMax = FRUIT_SIDE > 0 ? frontW / 2 - fruitZone : frontW / 2 - SIDE_MARGIN;
  const aisleDepFrom = checkoutEndDep + AISLE_GAP_AFTER_CHECKOUT;
  const aisleDepTo = serviceFrontDep - AISLE_BACK_WALK;
  // Las 2 góndolas del lado de la frutería pueden alargarse hacia el fondo (ahí
  // no hay expositor de pescadería), sin llegar a la estantería de pared.
  const aisleDepToExt = Math.min(aisleDepTo + AISLE_EXT, backWallDep - BACK_WALL_D / 2 - 1.2);
  if (aisleDepTo - aisleDepFrom > 2 && aisleMax - aisleMin > 2) {
    addAisles(furniture, toWorld, sizeOf, rng, aisleMin, aisleMax, aisleDepFrom, aisleDepTo, aisleDepToExt, tx, tz, FRUIT_SIDE);
  }

  // Islas de fruta suelta EN MEDIO de los dos tramos de frutería (pallet con
  // montón); en fruterías largas salen varias, repartidas a lo largo del pasillo.
  if (fruitDepTo - fruitDepFrom > 2) {
    addFruitIslands(furniture, toWorld, sizeOf, tx, tz, FRUIT_SIDE, frontW, t, fruitDepFrom, fruitDepTo);
  }

  // Fondo del súper (pescadería, estantería de pared y carnicería).
  if (backWallDep - aisleDepFrom > 1 && aisleMax - aisleMin > 1) {
    addBackZone(furniture, toWorld, sizeOf, faceX, faceZ, aisleMin, aisleMax, backWallDep, frontW, t);
  }

  assignSections(furniture, rng);
  return { wallT: t, furniture };
}

/**
 * Reparte las SECCIONES del súper entre el mobiliario ya colocado (ver
 * `marketSections.ts`): los frescos van ligados a su mueble (frutería,
 * pescadería, carnicería) y las secciones de estantería se barajan (RNG local:
 * cada súper ordena sus pasillos distinto) y se asignan en orden, una por CARA
 * de góndola (dos por `shelfAisle`, una por `wallShelf`), repitiendo ciclo si
 * hay más caras que secciones.
 */
function assignSections(furniture: Furniture[], rng: Rng): void {
  const deck: MarketSection[] = [...SHELF_SECTIONS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  let next = 0;
  const deal = (): MarketSection => deck[next++ % deck.length];

  for (const f of furniture) {
    switch (f.kind) {
      case 'shelfAisle':
        f.sections = [deal(), deal()];
        break;
      case 'wallShelf':
        f.sections = [deal()];
        break;
      case 'produceRack':
      case 'produceCrate':
        f.sections = ['fruta'];
        break;
      case 'fishCounter':
        f.sections = ['pescaderia'];
        break;
      case 'meatCounter':
        f.sections = ['carniceria'];
        break;
    }
  }
}

/**
 * Fondo del súper, en tres zonas: PESCADERÍA en la mitad opuesta a la frutería,
 * estantería de pared en el centro (mitad de la frutería) y CARNICERÍA en la
 * esquina del lado de la frutería. Compartido por el layout normal y el girado
 * (en el girado, `frontW` es el ancho del frame girado, es decir, el fondo real).
 */
function addBackZone(
  furniture: Furniture[],
  toWorld: (along: number, dep: number) => { x: number; z: number },
  sizeOf: (alongExtent: number, depExtent: number) => { w: number; d: number },
  faceX: number,
  faceZ: number,
  aisleMin: number,
  aisleMax: number,
  backWallDep: number,
  frontW: number,
  t: number,
): void {
  const mid = (aisleMin + aisleMax) / 2;
  const shelfMin = FRUIT_SIDE > 0 ? mid + FISH_SPLIT_GAP : aisleMin;
  const shelfMax = FRUIT_SIDE > 0 ? aisleMax : mid - FISH_SPLIT_GAP;
  const p = toWorld((shelfMin + shelfMax) / 2, backWallDep);
  const sz = sizeOf(shelfMax - shelfMin, BACK_WALL_D);
  furniture.push({ kind: 'wallShelf', x: p.x, z: p.z, w: sz.w, d: sz.d, faceX, faceZ });

  const fishMin = FRUIT_SIDE > 0 ? aisleMin : mid + FISH_SPLIT_GAP;
  const fishMax = FRUIT_SIDE > 0 ? mid - FISH_SPLIT_GAP : aisleMax;
  addServiceSection(furniture, toWorld, sizeOf, faceX, faceZ, fishMin, fishMax, backWallDep, 'fishCounter');

  const cornerAlong = frontW / 2 - t - 0.3; // esquina interior, junto a la pared de la frutería
  const meatMin = FRUIT_SIDE > 0 ? aisleMax + FISH_SPLIT_GAP : -cornerAlong;
  const meatMax = FRUIT_SIDE > 0 ? cornerAlong : aisleMin - FISH_SPLIT_GAP;
  addServiceSection(furniture, toWorld, sizeOf, faceX, faceZ, meatMin, meatMax, backWallDep, 'meatCounter');
}

/**
 * Interior de una nave ALARGADA, girado 90°: la "fachada" del layout es el muro
 * corto del extremo `ENTRY_SIDE` (la puerta real queda en la fachada de calle,
 * pegada a ese extremo, abriendo al vestíbulo de las cajas). A lo largo de la
 * nave se suceden: cajas mirando al muro corto, frutería TRANSVERSAL (dos
 * tramos enfrentados que cruzan la nave, con las islas en medio), góndolas
 * LARGAS en el sentido de la nave y los puestos del fondo contra el muro corto
 * opuesto. Reutiliza las mismas piezas y helpers que el layout normal.
 */
function buildElongatedInterior(
  furniture: Furniture[],
  rng: Rng,
  x: number,
  z: number,
  frontW: number,
  depthLen: number,
  tx: number,
  tz: number,
  t: number,
): void {
  // Frame girado: normal = tangente de la fachada real, hacia el extremo de la
  // entrada. `along` cruza la nave (la fachada de calle queda en along < 0) y
  // `dep` recorre el largo desde el muro corto de la entrada.
  const faceX2 = ENTRY_SIDE * tx;
  const faceZ2 = ENTRY_SIDE * tz;
  const t2x = faceZ2;
  const t2z = -faceX2;
  const width2 = depthLen; // "ancho de fachada" del frame girado = fondo real
  const depth2 = frontW; // "fondo" del frame girado = largo de la nave
  const endLineX = x + faceX2 * (depth2 / 2);
  const endLineZ = z + faceZ2 * (depth2 / 2);
  const toWorld = (along: number, dep: number): { x: number; z: number } => ({
    x: endLineX - faceX2 * dep + t2x * along,
    z: endLineZ - faceZ2 * dep + t2z * along,
  });
  const sizeOf = (alongExtent: number, depExtent: number): { w: number; d: number } =>
    faceZ2 !== 0 ? { w: alongExtent, d: depExtent } : { w: depExtent, d: alongExtent };

  // Cajas: pocas, mirando al muro corto de la entrada. El paso de entrada queda
  // del lado de la calle (junto a la puerta real) y el margen normal al otro.
  addCheckouts(furniture, toWorld, sizeOf, -width2 / 2 + ENTRY_WALK, width2 / 2 - SIDE_MARGIN, faceX2, faceZ2);

  const checkoutEndDep = CHECKOUT_DEP + CHECKOUT_D / 2 + CONVEYOR_LEN;
  const backWallDep = depth2 - t - BACK_WALL_D / 2 - 0.3;
  const serviceFrontDep = backWallDep - FISH_TABLE_D / 2 - FISH_WORK_GAP - FISH_COUNTER_D;

  // Frutería transversal tras las cajas: dos baldas enfrentadas que cruzan la
  // nave, PARTIDAS en dos tramos por el paseo central (alineado con el de las
  // góndolas, así el corredor del medio recorre la nave entera sin cortes).
  const rackLen = width2 - 2 * SIDE_MARGIN;
  const fruitDepFrom = checkoutEndDep + FRUIT_GAP_FRONT;
  const fruitDepTo = fruitDepFrom + 2 * FRUIT_RACK_DEPTH + FRUIT_AISLE;
  const fruitFits = rackLen > 3 && fruitDepTo + FRUIT_WALK + 2 < serviceFrontDep - AISLE_BACK_WALK;
  if (fruitFits) {
    const segLen = (rackLen - CROSS_CENTER_WALK) / 2;
    const segs =
      segLen >= 1.6
        ? [
            { mid: -(CROSS_CENTER_WALK + segLen) / 2, len: segLen },
            { mid: (CROSS_CENTER_WALK + segLen) / 2, len: segLen },
          ]
        : [{ mid: 0, len: rackLen }]; // nave muy estrecha: balda entera (no hay sitio para partirla)
    for (const s of segs) {
      const sz = sizeOf(s.len, FRUIT_RACK_DEPTH);
      const p1 = toWorld(s.mid, fruitDepFrom + FRUIT_RACK_DEPTH / 2);
      furniture.push({ kind: 'produceRack', x: p1.x, z: p1.z, w: sz.w, d: sz.d, faceX: -faceX2, faceZ: -faceZ2 });
      const p2 = toWorld(s.mid, fruitDepTo - FRUIT_RACK_DEPTH / 2);
      furniture.push({ kind: 'produceRack', x: p2.x, z: p2.z, w: sz.w, d: sz.d, faceX: faceX2, faceZ: faceZ2 });
    }

    // Islas de fruta suelta FUERA del paseo central: centradas en los tramos
    // (si solo toca una, en el tramo del fondo, el opuesto a la calle). La isla
    // se encoge si hace falta para caber en el tramo con un poco de holgura.
    const islandDep = fruitDepFrom + FRUIT_RACK_DEPTH + FRUIT_AISLE / 2;
    const spots = segs.filter((s) => s.len - 0.4 >= 2.0);
    const count = Math.min(spots.length, Math.max(1, Math.floor(rackLen / FRUIT_ISLAND_PITCH)));
    for (let i = 0; i < count; i++) {
      const s = spots[count === 1 ? spots.length - 1 : i];
      const islandSz = sizeOf(Math.min(FRUIT_ISLAND_LEN, s.len - 0.4), FRUIT_ISLAND_DEPTH);
      const p = toWorld(s.mid, islandDep);
      furniture.push({ kind: 'produceCrate', x: p.x, z: p.z, w: islandSz.w, d: islandSz.d, faceX: -faceX2, faceZ: -faceZ2 });
    }
  }

  // Góndolas TRANSVERSALES en columnas repartidas a lo largo de la nave, tras
  // la frutería (o tras las cajas si la frutería no cupo), rematadas a un
  // paseo de los puestos del fondo.
  const aisleMin = -width2 / 2 + SIDE_MARGIN;
  const aisleMax = width2 / 2 - SIDE_MARGIN;
  const aisleDepFrom = fruitFits ? fruitDepTo + FRUIT_WALK : checkoutEndDep + AISLE_GAP_AFTER_CHECKOUT;
  const aisleDepTo = serviceFrontDep - AISLE_BACK_WALK;
  if (aisleDepTo - aisleDepFrom > 2 && aisleMax - aisleMin > 2) {
    addCrossAisles(furniture, toWorld, sizeOf, rng, aisleMin, aisleMax, aisleDepFrom, aisleDepTo, faceX2, faceZ2);
  }

  // Fondo contra el muro corto opuesto a la entrada: pescadería y carnicería a
  // los lados. En la nave estrecha no hay esquina de frutería ni sitio para la
  // estantería de pared entre ambas (el reparto en tres zonas del layout normal
  // no cabe en este ancho).
  if (backWallDep - aisleDepFrom > 1 && aisleMax - aisleMin > 1) {
    const mid = (aisleMin + aisleMax) / 2;
    addServiceSection(furniture, toWorld, sizeOf, faceX2, faceZ2, aisleMin, mid - FISH_SPLIT_GAP, backWallDep, 'fishCounter');
    addServiceSection(furniture, toWorld, sizeOf, faceX2, faceZ2, mid + FISH_SPLIT_GAP, aisleMax, backWallDep, 'meatCounter');
  }
}

/** Fila de cajas registradoras con cinta, mirando a la fachada, centrada en la
 *  banda `alongMin..alongMax` (el tramo libre de la garganta de la puerta). */
function addCheckouts(
  furniture: Furniture[],
  toWorld: (along: number, dep: number) => { x: number; z: number },
  sizeOf: (alongExtent: number, depExtent: number) => { w: number; d: number },
  alongMin: number,
  alongMax: number,
  faceX: number,
  faceZ: number,
): void {
  const alongUsable = alongMax - alongMin;
  // Nº de cajas proporcional al frente disponible (apunta a dejar
  // ~CHECKOUT_EDGE_WALK a cada lado de la fila), acotado por las que caben.
  const fitCount = Math.floor((alongUsable + CHECKOUT_GAP) / (CHECKOUT_W + CHECKOUT_GAP));
  const targetCount = Math.round((alongUsable - 2 * CHECKOUT_EDGE_WALK + CHECKOUT_GAP) / (CHECKOUT_W + CHECKOUT_GAP));
  const count = Math.max(2, Math.min(fitCount, targetCount));
  const span = count * CHECKOUT_W + (count - 1) * CHECKOUT_GAP;
  const start = (alongMin + alongMax) / 2 - span / 2 + CHECKOUT_W / 2;

  for (let i = 0; i < count; i++) {
    const along = start + i * (CHECKOUT_W + CHECKOUT_GAP);
    const counterP = toWorld(along, CHECKOUT_DEP);
    const counterSz = sizeOf(CHECKOUT_W, CHECKOUT_D);
    furniture.push({ kind: 'checkout', x: counterP.x, z: counterP.z, w: counterSz.w, d: counterSz.d, faceX, faceZ });
    // Cinta transportadora DETRÁS del cuerpo (lado tienda): el cliente descarga
    // desde el interior, la caja queda hacia la salida y detrás de ella (hacia
    // la fachada) se pone la trabajadora.
    const beltP = toWorld(along, CHECKOUT_DEP + CHECKOUT_D / 2 + CONVEYOR_LEN / 2);
    const beltSz = sizeOf(CHECKOUT_W * 0.7, CONVEYOR_LEN);
    furniture.push({ kind: 'conveyor', x: beltP.x, z: beltP.z, w: beltSz.w, d: beltSz.d, faceX, faceZ });
  }
}

/**
 * Sección de frutería contra una pared lateral (`sgn`: +1 derecha, -1 izquierda).
 * Emite UNA pieza `produceRack` con su huella y su normal hacia el interior; el
 * render construye el mueble base y las tarimas escalonadas de cajas con fruta.
 * Corre a lo largo del fondo (eje de profundidad) entre `depFrom` y `depTo`.
 */
function addFruitSection(
  furniture: Furniture[],
  toWorld: (along: number, dep: number) => { x: number; z: number },
  sizeOf: (alongExtent: number, depExtent: number) => { w: number; d: number },
  tx: number,
  tz: number,
  sgn: number,
  frontW: number,
  t: number,
  depFrom: number,
  depTo: number,
): void {
  const depCenter = (depFrom + depTo) / 2;
  const rackLen = depTo - depFrom;
  const sz = sizeOf(FRUIT_RACK_DEPTH, rackLen); // extensión tangente (fondo) × profundidad (largo)
  const wallAlong = frontW / 2 - t; // cara interior del muro lateral

  // Tramo 1: pegado a la pared, mira hacia el interior (normal −sgn·tangente).
  const along1 = sgn * (wallAlong - FRUIT_RACK_DEPTH / 2);
  const p1 = toWorld(along1, depCenter);
  furniture.push({ kind: 'produceRack', x: p1.x, z: p1.z, w: sz.w, d: sz.d, faceX: -sgn * tx, faceZ: -sgn * tz });

  // Tramo 2: enfrente, tras el pasillo, mira de vuelta hacia el tramo 1 (normal +sgn·tangente).
  const along2 = sgn * (wallAlong - FRUIT_RACK_DEPTH - FRUIT_AISLE - FRUIT_RACK_DEPTH / 2);
  const p2 = toWorld(along2, depCenter);
  furniture.push({ kind: 'produceRack', x: p2.x, z: p2.z, w: sz.w, d: sz.d, faceX: sgn * tx, faceZ: sgn * tz });
}

/**
 * Islas de fruta suelta (pallet con montón), centradas en el pasillo que hay
 * ENTRE los dos tramos de frutería (a mitad de `FRUIT_AISLE`). Una isla por
 * cada `FRUIT_ISLAND_PITCH` metros de frutería, repartidas uniformemente a lo
 * largo del tramo `depFrom..depTo` (una sola, centrada, en fruterías cortas).
 */
function addFruitIslands(
  furniture: Furniture[],
  toWorld: (along: number, dep: number) => { x: number; z: number },
  sizeOf: (alongExtent: number, depExtent: number) => { w: number; d: number },
  tx: number,
  tz: number,
  sgn: number,
  frontW: number,
  t: number,
  depFrom: number,
  depTo: number,
): void {
  const wallAlong = frontW / 2 - t; // cara interior del muro lateral
  const midAlong = sgn * (wallAlong - FRUIT_RACK_DEPTH - FRUIT_AISLE / 2); // centro del pasillo de frutería
  const sz = sizeOf(FRUIT_ISLAND_DEPTH, FRUIT_ISLAND_LEN);
  const len = depTo - depFrom;
  const count = Math.max(1, Math.floor(len / FRUIT_ISLAND_PITCH));
  for (let i = 0; i < count; i++) {
    const p = toWorld(midAlong, depFrom + (len * (i + 0.5)) / count);
    furniture.push({ kind: 'produceCrate', x: p.x, z: p.z, w: sz.w, d: sz.d, faceX: -sgn * tx, faceZ: -sgn * tz });
  }
}

/**
 * Puesto con mostrador al fondo del súper (pescadería o carnicería): mesa de
 * trabajo (inox) contra el muro del fondo, donde se ponen los trabajadores, y
 * expositor delante, mirando a la tienda, con un pasillo de trabajo entre
 * ambos. El render construye las bandejas (hielo/pescado o carne) según
 * `counterKind`.
 */
function addServiceSection(
  furniture: Furniture[],
  toWorld: (along: number, dep: number) => { x: number; z: number },
  sizeOf: (alongExtent: number, depExtent: number) => { w: number; d: number },
  faceX: number,
  faceZ: number,
  alongMin: number,
  alongMax: number,
  backWallDep: number,
  counterKind: 'fishCounter' | 'meatCounter',
): void {
  const width = alongMax - alongMin;
  if (width < 3) return; // sin sitio para un puesto con sentido
  const mid = (alongMin + alongMax) / 2;

  // Mesa de trabajo contra el muro del fondo (misma cota que la estantería de pared).
  const tP = toWorld(mid, backWallDep);
  const tSz = sizeOf(width, FISH_TABLE_D);
  furniture.push({ kind: 'fishTable', x: tP.x, z: tP.z, w: tSz.w, d: tSz.d, faceX, faceZ });

  // Expositor delante, mirando hacia la tienda, con el pasillo de trabajo detrás.
  const counterDep = backWallDep - FISH_TABLE_D / 2 - FISH_WORK_GAP - FISH_COUNTER_D / 2;
  const cP = toWorld(mid, counterDep);
  const cSz = sizeOf(width, FISH_COUNTER_D);
  furniture.push({ kind: counterKind, x: cP.x, z: cP.z, w: cSz.w, d: cSz.d, faceX, faceZ });
}

/**
 * Pasillos interiores: góndolas dobles paralelas, con el HUECO entre ellas
 * (la anchura del pasillo) variando por góndola (RNG local, seeded por
 * posición) entre `AISLE_W_MIN` y `AISLE_W_MAX` — así salen pasillos de
 * distinto tamaño, no una rejilla uniforme. El NÚMERO de góndolas es
 * proporcional al ancho disponible: pasillos de anchura media más
 * ~`AISLE_EDGE_WALK` de paseo a cada lado del bloque.
 */
function addAisles(
  furniture: Furniture[],
  toWorld: (along: number, dep: number) => { x: number; z: number },
  sizeOf: (alongExtent: number, depExtent: number) => { w: number; d: number },
  rng: Rng,
  alongMin: number,
  alongMax: number,
  depFrom: number,
  depTo: number,
  /** Fin extendido para las 2 góndolas del lado de la frutería. */
  depToExt: number,
  tx: number,
  tz: number,
  fruitSide: number,
): void {
  const available = alongMax - alongMin;
  const targetCount = Math.max(2, Math.round((available - 2 * AISLE_EDGE_WALK + AISLE_W_AVG) / (GONDOLA_W + AISLE_W_AVG)));
  const centers: number[] = [];
  let cursor = 0;
  centers.push(cursor + GONDOLA_W / 2);
  cursor += GONDOLA_W;
  while (centers.length < targetCount && cursor + AISLE_W_MIN + GONDOLA_W <= available) {
    cursor += rng.range(AISLE_W_MIN, AISLE_W_MAX);
    centers.push(cursor + GONDOLA_W / 2);
    cursor += GONDOLA_W;
  }
  // Centra el bloque de góndolas en el hueco disponible.
  const leftEdge = centers[0] - GONDOLA_W / 2;
  const occupied = centers[centers.length - 1] + GONDOLA_W / 2 - leftEdge;
  const shift = alongMin + (available - occupied) / 2 - leftEdge;

  const mid = (alongMin + alongMax) / 2; // frontera pescadería/estantería del fondo
  for (let i = 0; i < centers.length; i++) {
    // Las 2 góndolas más cercanas a la frutería se alargan hasta `depToExt`,
    // pero SOLO si quedan enteras en la mitad de la estantería de pared: en la
    // otra mitad el fondo lo ocupa el expositor de la pescadería.
    const along = centers[i] + shift;
    const nearFruit = fruitSide > 0 ? i >= centers.length - 2 : i < 2;
    const clearOfFish =
      fruitSide > 0 ? along - GONDOLA_W / 2 >= mid + FISH_SPLIT_GAP : along + GONDOLA_W / 2 <= mid - FISH_SPLIT_GAP;
    const dTo = nearFruit && clearOfFish ? depToExt : depTo;
    const p = toWorld(along, (depFrom + dTo) / 2);
    const sz = sizeOf(GONDOLA_W, dTo - depFrom);
    furniture.push({ kind: 'shelfAisle', x: p.x, z: p.z, w: sz.w, d: sz.d, faceX: tx, faceZ: tz });
  }
}

/**
 * Góndolas de una nave ALARGADA (frame girado): TRANSVERSALES, cruzando la
 * nave, en columnas repartidas a lo largo con pasillo de anchura variable
 * entre ellas (mismo espaciado RNG que `addAisles`, aquí sobre el eje del
 * largo). Cada columna va partida en dos tramos por un paseo central corrido —
 * el grid clásico de súper con pasillo del medio. Si la nave es muy estrecha,
 * un único tramo a todo el ancho.
 */
function addCrossAisles(
  furniture: Furniture[],
  toWorld: (along: number, dep: number) => { x: number; z: number },
  sizeOf: (alongExtent: number, depExtent: number) => { w: number; d: number },
  rng: Rng,
  /** Banda transversal disponible (eje `along` del frame girado). */
  alongMin: number,
  alongMax: number,
  /** Tramo del largo de la nave (eje `dep`) que ocupan las columnas. */
  depFrom: number,
  depTo: number,
  /** Normal del frame girado: las estanterías miran a lo largo de la nave. */
  faceX: number,
  faceZ: number,
): void {
  const length = depTo - depFrom;
  const targetCount = Math.max(2, Math.round((length - 2 * AISLE_EDGE_WALK + AISLE_W_AVG) / (GONDOLA_W + AISLE_W_AVG)));
  const centers: number[] = [];
  let cursor = 0;
  centers.push(cursor + GONDOLA_W / 2);
  cursor += GONDOLA_W;
  while (centers.length < targetCount && cursor + AISLE_W_MIN + GONDOLA_W <= length) {
    cursor += rng.range(AISLE_W_MIN, AISLE_W_MAX);
    centers.push(cursor + GONDOLA_W / 2);
    cursor += GONDOLA_W;
  }
  // Centra el bloque de columnas en el tramo disponible del largo.
  const occupied = centers[centers.length - 1] + GONDOLA_W / 2;
  const shift = depFrom + (length - occupied) / 2;

  const crossAvail = alongMax - alongMin;
  const bandLen = (crossAvail - CROSS_CENTER_WALK) / 2;
  const bands =
    bandLen >= 1.6
      ? [
          { mid: alongMin + bandLen / 2, len: bandLen },
          { mid: alongMax - bandLen / 2, len: bandLen },
        ]
      : [{ mid: (alongMin + alongMax) / 2, len: crossAvail }];
  for (const c of centers) {
    for (const band of bands) {
      const p = toWorld(band.mid, c + shift);
      const sz = sizeOf(band.len, GONDOLA_W);
      furniture.push({ kind: 'shelfAisle', x: p.x, z: p.z, w: sz.w, d: sz.d, faceX, faceZ });
    }
  }
}
