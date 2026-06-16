import type { HouseInterior, OfficeInterior, StairCore } from './types';
import { makeHouseInterior, WALL_T } from './houseInterior';

/* ── Interior de edificios altos ───────────────────────────────────────────
 * La planta baja es un rellano con escaleras; cada planta superior es una
 * vivienda (reutiliza el generador BSP de las casas). El núcleo de escaleras se
 * coloca de una de dos formas según la huella:
 *
 *  - AL FONDO (edificios profundos): franja pegada al muro opuesto a la fachada,
 *    a todo el ancho; la escalera sube en profundidad y la vivienda queda por
 *    delante. La puerta de la vivienda da al rellano del fondo.
 *
 *  - A UN LADO (edificios POCO PROFUNDOS y anchos): franja lateral que ocupa todo
 *    el fondo; la escalera sube a lo largo del fondo (más recorrido → escalones
 *    cómodos) y la vivienda queda al lado. La puerta de la vivienda da al rellano
 *    lateral. Esto evita escaleras estrechas cuando el fondo es escaso.
 *
 * No consume el RNG principal: cada vivienda usa el `rng2` local de
 * `makeHouseInterior` (con un `seedOffset` por planta para que varíen).
 */

const FLOOR_H = 3; // altura de planta (alineada con la cadencia de ventanas del render)

/**
 * @param x,z  centro de la huella del edificio
 * @param w,d  extensión en X/Z
 * @param h    altura total (múltiplo de FLOOR_H; la fija `OfficeFactory`)
 * @param faceX,faceZ vector unitario hacia la calle (fachada)
 */
const MIN_DWELLING = 2.7; // fondo mínimo de la vivienda por delante del núcleo (m)
const MIN_CORE = 3.0; // fondo mínimo del núcleo (escalera + rellano mínimos) (m)

/** Fondo (perpendicular a la fachada) mínimo para que una oficina tenga interior
 *  en vez de quedar como caja maciza. Por debajo de esto no cabe núcleo+vivienda.
 *  Lo usa el generador de ciudad para decidir cuándo fusionar filas en profundidad. */
export const OFFICE_MIN_DEPTH = MIN_CORE + MIN_DWELLING;

export function makeOfficeInterior(
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  faceX: number,
  faceZ: number,
): OfficeInterior | undefined {
  const floorCount = Math.max(2, Math.round(h / FLOOR_H));

  // `perp` = fondo (perpendicular a la fachada); `along` = ancho (a lo largo de
  // la fachada). Si ni siquiera cabe núcleo + vivienda en el fondo, no se genera
  // interior (caja maciza): no podemos engordarlo sin pisar la acera/vecinos.
  const faceZmode = faceZ !== 0;
  const perp = faceZmode ? d : w;
  const along = faceZmode ? w : d;
  if (perp < MIN_CORE + MIN_DWELLING) return undefined;

  // Núcleo a un LADO (en vez de al fondo) cuando el edificio es poco profundo
  // —las escaleras al fondo saldrían estrechas— y hay ancho de sobra para alojar
  // el núcleo lateral + la vivienda al lado.
  const SIDE_MAX_PERP = 9.0;
  const useSide = perp < SIDE_MAX_PERP && along >= MIN_CORE + MIN_DWELLING + 0.3;

  let core: StairCore;
  let dx: number;
  let dz: number;
  let dw: number;
  let dd: number;
  let dFaceX: number;
  let dFaceZ: number;

  if (!useSide) {
    // ── Núcleo AL FONDO ──
    // Fondo del núcleo: lo más amplio posible (dos tramos + meseta + rellano),
    // dejando siempre al menos MIN_DWELLING de fondo a la vivienda por delante.
    const coreDepth = Math.max(MIN_CORE, Math.min(5.2, perp - MIN_DWELLING));
    const nX = -faceX;
    const nZ = -faceZ; // vivienda→núcleo = hacia el fondo
    if (faceZmode) {
      core = { x, z: z - faceZ * (d / 2 - coreDepth / 2), w, d: coreDepth, side: false, nX, nZ };
      dw = w;
      dd = d - coreDepth;
      dx = x;
      dz = z + faceZ * (coreDepth / 2);
    } else {
      core = { x: x - faceX * (w / 2 - coreDepth / 2), z, w: coreDepth, d, side: false, nX, nZ };
      dw = w - coreDepth;
      dd = d;
      dx = x + faceX * (coreDepth / 2);
      dz = z;
    }
    dFaceX = nX;
    dFaceZ = nZ;
  } else {
    // ── Núcleo A UN LADO ──
    // El núcleo ocupa todo el fondo y una franja de ancho a un lado; la escalera
    // sube a lo largo del fondo. La vivienda ocupa el resto del ancho, todo el fondo.
    const coreW = Math.max(MIN_CORE, Math.min(5.2, along - MIN_DWELLING));
    // R = lateral unitario ("derecha" de la calle). Lado determinista por posición
    // para variar a qué lado cae el núcleo sin perder reproducibilidad.
    const Rx = -faceZ;
    const Rz = faceX;
    const sideSign = ((Math.round(x * 10) + Math.round(z * 10)) & 1) === 0 ? 1 : -1;
    const nX = sideSign * Rx; // vivienda→núcleo = hacia el lateral
    const nZ = sideSign * Rz;
    const off = along / 2 - coreW / 2; // desplazamiento del núcleo hacia su lado
    const ccx = x + nX * off;
    const ccz = z + nZ * off;
    if (faceZmode) {
      // along = X, perp = Z. Núcleo: ancho coreW en X, todo el fondo d en Z.
      core = { x: ccx, z: ccz, w: coreW, d, side: true, nX, nZ };
      dw = along - coreW;
      dd = d;
      dx = x - nX * (coreW / 2); // vivienda al lado opuesto del núcleo
      dz = z;
    } else {
      // along = Z, perp = X. Núcleo: todo el fondo w en X, ancho coreW en Z.
      core = { x: ccx, z: ccz, w, d: coreW, side: true, nX, nZ };
      dd = along - coreW;
      dw = w;
      dx = x;
      dz = z - nZ * (coreW / 2);
    }
    dFaceX = nX; // la puerta de la vivienda mira al rellano lateral
    dFaceZ = nZ;
  }

  // El muro del núcleo se dibuja CENTRADO en el borde de la vivienda, mientras que
  // los muros perimetrales se dibujan hacia DENTRO desde el borde. El BSP mete los
  // tabiques `WALL_T` desde el borde del rect, así que llegan a ras del perímetro
  // pero se quedan `WALL_T/2` cortos del muro del núcleo (dejando un hueco). Para
  // igualarlo, extendemos la vivienda media pared hacia el núcleo: así el BSP cae
  // justo sobre la cara interior del muro del núcleo y los tabiques conectan.
  const ext = WALL_T / 2;
  if (dFaceX !== 0) {
    dw += ext;
    dx += dFaceX * (ext / 2);
  } else {
    dd += ext;
    dz += dFaceZ * (ext / 2);
  }

  // Una vivienda por planta superior, con distribución distinta (seedOffset = planta).
  // Su puerta da al rellano (al fondo o lateral según el caso): pasamos la dirección
  // VIVIENDA→NÚCLEO para que el BSP deje libre ese muro (donde irá la puerta).
  // Cada vivienda tiene al menos 3 estancias (una puede ser pequeña: el baño).
  const dwellings: HouseInterior[] = [];
  for (let f = 1; f < floorCount; f++) {
    dwellings.push(makeHouseInterior(dx, dz, dw, dd, dFaceX, dFaceZ, f, 3));
  }

  return { floorH: FLOOR_H, floorCount, core, dwellings };
}
