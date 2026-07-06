import * as THREE from 'three';
import type { Pedestrian } from '../sim/agents';
import { SHIRT_COLORS, type PedestrianMesh } from './PedestrianMesh';
import type { CustomPedestrianMesh } from './CustomPedestrianMesh';

/** Fracción de píxeles que dibuja el punteado (densidad del fantasma). */
const DITHER_ALPHA = 0.45;
/** Piel, a juego con cabeza/manos del render estándar. */
const SKIN_COLOR = 0xe0b58f;
/** Altura local del centro de la cabeza sobre los pies (0.75 + 0.87). */
const HEAD_Y = 1.62;
/** Tras la ciudad opaca: el z-buffer debe estar completo antes del test invertido. */
const GHOST_RENDER_ORDER = 5;
/**
 * Sesgo de profundidad hacia la cámara (metros en espacio de vista). Debe superar
 * la máxima separación entre partes del propio peatón (~0.9 m mano–torso): sin él,
 * el cuerpo se "ocluye a sí mismo" (y el z-fighting con la instancia real motea al
 * peatón visible). Con el sesgo, solo geometría realmente interpuesta a más de
 * ~1 m (paredes, tejados, árboles) activa el fantasma.
 */
const GHOST_DEPTH_BIAS = 1.2;

/**
 * Material del fantasma: solo pasa el test de profundidad donde la escena ya
 * escribió algo MÁS CERCANO (`GreaterDepth`) — es decir, únicamente donde el
 * peatón está ocluido — y descarta píxeles con una matriz de Bayer 4×4
 * (screen-door dithering). Todo por el pipeline opaco: sin blending, sin
 * sorting y sin tocar los materiales de la ciudad.
 */
function makeGhostMaterial(color: number): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ color, fog: false });
  mat.depthFunc = THREE.GreaterDepth;
  mat.depthWrite = false;
  mat.onBeforeCompile = (shader) => {
    // Acerca la profundidad del fragmento a la cámara SIN mover su posición en
    // pantalla: se reproyecta el punto de vista sesgado y solo se sustituye el z
    // NDC (reescalado por el w original). El clamp evita que cruce el plano near.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      /* glsl */ `
      #include <project_vertex>
      vec4 ghostBiased = projectionMatrix * vec4(mvPosition.xy, mvPosition.z + ${GHOST_DEPTH_BIAS.toFixed(4)}, 1.0);
      gl_Position.z = max(ghostBiased.z / ghostBiased.w * gl_Position.w, -gl_Position.w);
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      /* glsl */ `
      float ghostBayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
      float ghostBayer4(vec2 a) { return ghostBayer2(0.5 * a) * 0.25 + ghostBayer2(a); }
      void main() {
        if (ghostBayer4(gl_FragCoord.xy) >= ${DITHER_ALPHA.toFixed(4)}) discard;
      `,
    );
  };
  return mat;
}

/**
 * Silueta "rayos X" del peatón seguido: réplica de cuerpo/cabeza/manos que
 * solo se ve, punteada, a través de la geometría que lo tapa (paredes,
 * tejados, árboles...). Copia la pose ya interpolada de PedestrianMesh, así
 * que hereda gratis el balanceo al andar, la postura tumbada y la escala de
 * entrada/salida. Para personajes personalizados (que no están en las
 * instancias) usa la silueta genérica sobre la transform de su grupo.
 */
export class GhostPedestrian {
  readonly group = new THREE.Group();

  private target = -1;
  private readonly body: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly handL: THREE.Mesh;
  private readonly handR: THREE.Mesh;
  private readonly bodyMat: THREE.MeshBasicMaterial;

  private static readonly HEAD_OFFSET = new THREE.Matrix4().makeTranslation(0, HEAD_Y, 0);
  private static readonly COLLAPSED = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);

  constructor(
    private readonly pedestrians: Pedestrian[],
    private readonly pedMesh: PedestrianMesh,
    private readonly customMesh: CustomPedestrianMesh,
  ) {
    const parts = pedMesh.partGeometries();
    this.bodyMat = makeGhostMaterial(0xffffff);
    const skinMat = makeGhostMaterial(SKIN_COLOR);
    this.body = new THREE.Mesh(parts.body, this.bodyMat);
    this.head = new THREE.Mesh(parts.head, skinMat);
    this.handL = new THREE.Mesh(parts.hand, skinMat);
    this.handR = new THREE.Mesh(parts.hand, skinMat);
    for (const mesh of [this.body, this.head, this.handL, this.handR]) {
      mesh.matrixAutoUpdate = false; // las matrices se copian ya compuestas
      mesh.renderOrder = GHOST_RENDER_ORDER;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.group.visible = false;
  }

  /** Activa el fantasma para el peatón `index` (null lo apaga). */
  setTarget(index: number | null): void {
    this.target = index ?? -1;
    this.group.visible = this.target >= 0;
    if (this.target < 0) return;
    this.bodyMat.color.setHex(SHIRT_COLORS[this.pedestrians[this.target].colorIdx % SHIRT_COLORS.length]);
    this.collapse(); // evita un frame con la pose del objetivo anterior
  }

  /** Llamar tras PedestrianMesh/CustomPedestrianMesh.update (copia sus poses). */
  update(): void {
    if (this.target < 0) return;
    if (this.pedMesh.copyPoseTo(this.target, this.body, this.head, this.handL, this.handR)) return;
    // Personaje personalizado: silueta genérica sobre la transform de su grupo
    // (la escala del grupo ya incluye estatura y PED_SCALE).
    const g = this.customMesh.groupOf(this.target);
    if (!g || !g.visible) {
      this.collapse();
      return;
    }
    this.body.matrix.compose(g.position, g.quaternion, g.scale);
    this.head.matrix.copy(this.body.matrix).multiply(GhostPedestrian.HEAD_OFFSET);
    this.handL.matrix.copy(GhostPedestrian.COLLAPSED);
    this.handR.matrix.copy(GhostPedestrian.COLLAPSED);
  }

  private collapse(): void {
    for (const mesh of [this.body, this.head, this.handL, this.handR]) {
      mesh.matrix.copy(GhostPedestrian.COLLAPSED);
    }
  }
}
