import * as THREE from 'three';
import { lerpAngle } from '../city/CityModel';
import type { Pedestrian } from '../sim/agents';

export const SHIRT_COLORS = [0xd6584f, 0x4f7fd6, 0x57b06a, 0xe0b73d, 0x9a5fc2, 0xd87fa8, 0x5fc2b8, 0x8a8f99];
const PICK_BOUNDS_RADIUS = 10000;
/**
 * Factor de altura del peatón: un poco más bajitos para que quepan holgadamente
 * bajo las puertas (que ahora son más altas). Lo comparten ambos renders de
 * peatón (estándar y personalizado) para que mantengan la misma estatura.
 */
export const PED_SCALE = 0.88;
const HAND_X = 0.42;
const HAND_Y = 0.7;
const HAND_Z = 0.04;
const HAND_R = 0.105;
const HAND_SWING_Z = 0.18;
const WALK_ANIM_SPEED = 0.007;
const HALF_PI = Math.PI / 2;
const BODY_R = 0.32; // radio de la cápsula del cuerpo (para apoyarla en el colchón)
const BODY_CENTER_Y = 0.75; // altura local del centro de la cápsula (geometría trasladada)
const HEAD_OFFSET_Y = 0.87; // de centro de cuerpo a centro de cabeza (1.62 − 0.75)

/**
 * Render de peatones: cuerpo (cápsula) + cabeza, instanciados.
 * La escala anima la entrada/salida de edificios y un leve balanceo al caminar.
 */
export class PedestrianMesh {
  readonly group = new THREE.Group();
  readonly pickMesh: THREE.InstancedMesh;

  private readonly body: THREE.InstancedMesh;
  private readonly head: THREE.InstancedMesh;
  private readonly hands: THREE.InstancedMesh;
  /** Cuenta congelada al construir: los peatones añadidos después (personajes
   *  personalizados) se renderizan en CustomPedestrianMesh, no aquí. */
  private readonly count: number;

  private readonly mat = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scl = new THREE.Vector3();
  private readonly euler = new THREE.Euler();
  private readonly off = new THREE.Vector3();

  constructor(private readonly pedestrians: Pedestrian[]) {
    const n = pedestrians.length;
    this.count = n;

    const bodyGeo = new THREE.CapsuleGeometry(0.32, 0.75, 3, 8);
    bodyGeo.translate(0, 0.75, 0);
    this.body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
    this.body.castShadow = true;
    for (let i = 0; i < n; i++) {
      this.body.setColorAt(i, new THREE.Color(SHIRT_COLORS[pedestrians[i].colorIdx % SHIRT_COLORS.length]));
    }
    this.body.instanceColor!.needsUpdate = true;

    this.head = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.24, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xe0b58f }),
      n,
    );
    this.hands = new THREE.InstancedMesh(
      new THREE.SphereGeometry(HAND_R, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xe0b58f }),
      n * 2,
    );
    this.hands.castShadow = true;

    // Sin frustum culling: three calcula la esfera envolvente UNA vez, en el
    // primer render — y ahí todos los peatones están 'inside' (matrices
    // colapsadas en el origen), así que quedaba una esfera de radio 0 y la
    // malla entera se descartaba en cuanto el centro del mapa salía de cámara
    // (las sombras sí se veían: usan el frustum del sol). Las instancias
    // cubren toda la ciudad en todo momento; descartarlas en bloque no aporta.
    this.body.frustumCulled = false;
    this.head.frustumCulled = false;
    this.hands.frustumCulled = false;
    this.body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), PICK_BOUNDS_RADIUS);
    this.head.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), PICK_BOUNDS_RADIUS);
    this.hands.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), PICK_BOUNDS_RADIUS);

    this.group.add(this.body, this.head, this.hands);
    this.pickMesh = this.body;
  }

  /** Geometrías compartidas con el fantasma "rayos X" (misma silueta que las instancias). */
  partGeometries(): { body: THREE.BufferGeometry; head: THREE.BufferGeometry; hand: THREE.BufferGeometry } {
    return { body: this.body.geometry, head: this.head.geometry, hand: this.hands.geometry };
  }

  /**
   * Copia la pose ya interpolada (tras update) del peatón `i` a los meshes del
   * fantasma. Devuelve false si `i` no es una instancia de este render (peatón
   * personalizado, que vive en CustomPedestrianMesh).
   */
  copyPoseTo(i: number, body: THREE.Object3D, head: THREE.Object3D, handL: THREE.Object3D, handR: THREE.Object3D): boolean {
    if (i < 0 || i >= this.count) return false;
    this.body.getMatrixAt(i, body.matrix);
    this.head.getMatrixAt(i, head.matrix);
    this.hands.getMatrixAt(i * 2, handL.matrix);
    this.hands.getMatrixAt(i * 2 + 1, handR.matrix);
    return true;
  }

  update(alpha: number, timeMs: number): void {
    for (let i = 0; i < this.count; i++) {
      const p = this.pedestrians[i];
      const sRaw = p.prevScale + (p.scale - p.prevScale) * alpha;
      const s = sRaw * PED_SCALE;
      if (sRaw <= 0.002) {
        // Oculta la instancia colapsándola.
        this.mat.makeScale(0.0001, 0.0001, 0.0001);
        this.body.setMatrixAt(i, this.mat);
        this.head.setMatrixAt(i, this.mat);
        this.hands.setMatrixAt(i * 2, this.mat);
        this.hands.setMatrixAt(i * 2 + 1, this.mat);
        continue;
      }
      const x = p.prevX + (p.x - p.prevX) * alpha;
      const z = p.prevZ + (p.z - p.prevZ) * alpha;
      // Cota (planta baja = 0; >0 al subir escaleras / vivir en plantas altas).
      const yInterp = p.prevY + (p.y - p.prevY) * alpha;
      const base = 0.12 + yInterp;
      const heading = lerpAngle(p.prevHeading, p.heading, alpha);
      const walking = p.state === 'walking' || p.state === 'crossing' || p.state === 'exiting' || p.state === 'entering';
      const phase = timeMs * WALK_ANIM_SPEED + i * 1.7;
      const step = Math.sin(phase);
      const bob = walking ? step * 0.05 : 0;
      const handSwing = walking ? step * HAND_SWING_Z : 0;

      // Postura: 0 de pie, 1 tumbado. Se inclina el cuerpo (pitch) y se baja el
      // centro hasta el colchón; cabeza y manos se derivan girando con el cuerpo.
      const rec = Math.min(1, Math.max(0, p.prevRecline + (p.recline - p.prevRecline) * alpha));
      this.quat.setFromEuler(this.euler.set(-HALF_PI * rec, heading, 0, 'YXZ'));
      const cyStand = base + bob + BODY_CENTER_Y * s;
      const cyLie = yInterp + BODY_R * s;
      const cy = cyStand + (cyLie - cyStand) * rec; // centro de la cápsula

      // Cuerpo: pos = centro − R·(0, 0.75s, 0) (la geometría tiene el centro en y=0.75).
      this.off.set(0, BODY_CENTER_Y * s, 0).applyQuaternion(this.quat);
      this.mat.compose(this.pos.set(x - this.off.x, cy - this.off.y, z - this.off.z), this.quat, this.scl.set(s, s, s));
      this.body.setMatrixAt(i, this.mat);

      // Cabeza: a 0.87s del centro a lo largo del eje del cuerpo.
      this.off.set(0, HEAD_OFFSET_Y * s, 0).applyQuaternion(this.quat);
      this.mat.compose(this.pos.set(x + this.off.x, cy + this.off.y, z + this.off.z), this.quat, this.scl.set(s, s, s));
      this.head.setMatrixAt(i, this.mat);

      // Manos: offset desde el centro del cuerpo, girado por la orientación del cuerpo.
      for (const side of [-1, 1]) {
        this.off.set(side * HAND_X, HAND_Y - BODY_CENTER_Y, HAND_Z + handSwing * side).multiplyScalar(s).applyQuaternion(this.quat);
        this.mat.compose(this.pos.set(x + this.off.x, cy + this.off.y, z + this.off.z), this.quat, this.scl.set(s, s, s));
        this.hands.setMatrixAt(i * 2 + (side < 0 ? 0 : 1), this.mat);
      }
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
    this.hands.instanceMatrix.needsUpdate = true;
  }
}
