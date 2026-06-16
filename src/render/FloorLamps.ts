import * as THREE from 'three';

/* ── Lámparas de pie encendibles ───────────────────────────────────────────
 * Hay varios TIPOS de lámpara (trípode, columna, arco, clásica), cada uno con su
 * propia geometría de pantalla emisiva (tambor cilíndrico o campana cónica). Las
 * pantallas se agrupan POR GEOMETRÍA en una `InstancedMesh` cada una (una draw
 * call por forma), pero todas comparten el mismo control de encendido: un atributo
 * POR INSTANCIA `aLampOn` (0/1) que el shader suma al emisivo. Encendida → emite
 * un cálido HDR (>1) que el bloom convierte en brillo; apagada → pantalla pálida.
 */

/** Geometría de la pantalla emisiva de una lámpara. */
export type LampShadeGeo = 'cyl' | 'cone';

/** Una pantalla emisiva: su geometría, su transform y el suelo de la lámpara (`y`). */
export interface LampShade {
  geo: LampShadeGeo;
  matrix: THREE.Matrix4;
  /** Centro en planta + suelo de la lámpara (para interactuable y estado por defecto). */
  x: number;
  z: number;
  y: number;
}

/** Centro (en planta) y suelo de una lámpara; lo usan interactuable y controlador. */
export interface FloorLampPlacement {
  x: number;
  z: number;
  y: number;
}

// Emisivo cálido al encender. Cada canal >1 para superar el umbral de bloom (=1).
const LAMP_EMISSIVE = 'vec3( 2.2, 1.72, 0.99 )';

/** Material de pantalla: difuso pálido + emisivo encendible por instancia (`aLampOn`). */
function makeShadeMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xf3e6c0, roughness: 0.55, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute float aLampOn;\nvarying float vLampOn;\n' +
      shader.vertexShader.replace('void main() {', 'void main() {\n\tvLampOn = aLampOn;');
    shader.fragmentShader = ('varying float vLampOn;\n' + shader.fragmentShader).replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vLampOn * ${LAMP_EMISSIVE};`,
    );
  };
  return m;
}

/** Geometría unitaria por tipo de pantalla (diámetro 1, alto 1; el matrix la escala). */
function shadeGeometry(geo: LampShadeGeo): THREE.BufferGeometry {
  return geo === 'cone' ? new THREE.ConeGeometry(0.5, 1, 16) : new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
}

/** Encendida por defecto: determinista por posición (≈45%), para que algunas ya brillen. */
export function defaultLampOn(p: FloorLampPlacement): boolean {
  return ((((Math.round(p.x * 7) + Math.round(p.z * 13) + Math.round(p.y)) % 100) + 100) % 100) < 45;
}

/** Dónde vive el estado emisivo de una lámpara: un atributo y su índice dentro de él. */
interface ShadeRef {
  attr: THREE.InstancedBufferAttribute;
  local: number;
}

/**
 * Construye una `InstancedMesh` por geometría de pantalla (cada una con su atributo
 * `aLampOn`) y el controlador. El índice de lámpara (orden de `shades`) se mantiene
 * para alinear con los interactuables, aunque cada pantalla viva en una malla distinta.
 */
export function buildFloorLamps(shades: LampShade[]): { meshes: THREE.InstancedMesh[]; controller: FloorLampController } {
  // Agrupa los índices de lámpara por geometría.
  const byGeo = new Map<LampShadeGeo, number[]>();
  shades.forEach((s, i) => {
    const list = byGeo.get(s.geo) ?? [];
    list.push(i);
    byGeo.set(s.geo, list);
  });

  const meshes: THREE.InstancedMesh[] = [];
  const refs: ShadeRef[] = new Array(shades.length);
  for (const [geo, idxs] of byGeo) {
    const geometry = shadeGeometry(geo);
    const mesh = new THREE.InstancedMesh(geometry, makeShadeMaterial(), idxs.length);
    mesh.castShadow = true;
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(idxs.length), 1);
    geometry.setAttribute('aLampOn', attr);
    idxs.forEach((globalI, local) => {
      mesh.setMatrixAt(local, shades[globalI].matrix);
      refs[globalI] = { attr, local };
    });
    mesh.instanceMatrix.needsUpdate = true;
    meshes.push(mesh);
  }

  const placements: FloorLampPlacement[] = shades.map((s) => ({ x: s.x, z: s.z, y: s.y }));
  return { meshes, controller: new FloorLampController(placements, refs) };
}

/**
 * Estado de encendido de cada lámpara de pie. La acción del menú radial llama a
 * `toggle(i)`; el render no cambia (solo se actualiza el atributo por instancia).
 */
export class FloorLampController {
  private readonly state: boolean[];

  constructor(
    /** Mismo orden que las lámparas; alinea índice ↔ interactuable. */
    readonly placements: FloorLampPlacement[],
    private readonly refs: ShadeRef[],
  ) {
    this.state = placements.map(defaultLampOn);
    this.state.forEach((on, i) => this.refs[i].attr.setX(this.refs[i].local, on ? 1 : 0));
    for (const attr of new Set(refs.map((r) => r.attr))) attr.needsUpdate = true;
  }

  isOn(i: number): boolean {
    return this.state[i] ?? false;
  }

  /** Enciende/apaga la lámpara `i`. */
  toggle(i: number): void {
    if (i < 0 || i >= this.state.length) return;
    this.state[i] = !this.state[i];
    const r = this.refs[i];
    r.attr.setX(r.local, this.state[i] ? 1 : 0);
    r.attr.needsUpdate = true;
  }
}
