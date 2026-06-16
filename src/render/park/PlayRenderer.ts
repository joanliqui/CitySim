import * as THREE from 'three';
import type { CityModel } from '../../city/CityModel';

/** Un juego tal y como lo ve el render (alias del tipo del modelo). */
export type RenderPlayItem = CityModel['playItems'][number];

/**
 * Acumuladores de matrices/colores del render de juegos. Tres `InstancedMesh`
 * compartidas (cajas, cilindros, esferas), todas con color por instancia, para
 * que cualquier juego pueda usar plásticos de colores y metal con un draw call
 * por primitiva.
 */
export interface PlayRenderBuckets {
  boxMats: THREE.Matrix4[];
  boxColors: THREE.Color[];
  cylMats: THREE.Matrix4[];
  cylColors: THREE.Color[];
  sphereMats: THREE.Matrix4[];
  sphereColors: THREE.Color[];
}

/**
 * Helpers de geometría (definidos en `CityMesh`) inyectados en cada renderer. Todo
 * se especifica en coordenadas LOCALES del juego (origen en su base, +Z al frente);
 * el helper aplica el `heading` de la pieza. `y` es la altura (eje Y mundial).
 */
export interface PlayRenderHelpers {
  /** Caja: posición y tamaño locales; `yawLocal`/`rx`/`rz` giran/inclinan la pieza. */
  box(
    item: RenderPlayItem,
    lx: number,
    lz: number,
    y: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
    rx?: number,
    yawLocal?: number,
    rz?: number,
  ): void;
  /** Cilindro (radio `r`) entre dos puntos locales: postes, cadenas, barras. */
  rod(item: RenderPlayItem, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, color: number): void;
  /** Esfera de radio `r` en coordenadas locales. */
  sphere(item: RenderPlayItem, lx: number, lz: number, y: number, r: number, color: number): void;
}

export interface PlayRenderCtx {
  buckets: PlayRenderBuckets;
  helpers: PlayRenderHelpers;
}

/**
 * Estrategia de render por juego. Para añadir uno: crea su renderer y regístralo
 * en `playRenderRegistry.ts` (y su factoría en `src/city/park`).
 */
export interface PlayRenderer {
  render(item: RenderPlayItem, ctx: PlayRenderCtx): void;
}

/** Paleta de plásticos vivos; el `variant` del juego elige el tono. */
export const PLAY_COLORS = [0xd64541, 0x2e86de, 0xf6c544, 0x46b455, 0xe8833a, 0x8e5bbf];
/** Metal pintado de la estructura (postes, vigas, cadenas). */
export const PLAY_FRAME = 0x6b7178;

export function playColor(variant: number): number {
  return PLAY_COLORS[variant % PLAY_COLORS.length];
}
