import * as THREE from 'three';
import { lerpAngle } from '../city/CityModel';
import type { Pedestrian } from '../sim/agents';

const SHIRT_COLORS = [0xd6584f, 0x4f7fd6, 0x57b06a, 0xe0b73d, 0x9a5fc2, 0xd87fa8, 0x5fc2b8, 0x8a8f99];
const PICK_BOUNDS_RADIUS = 10000;
const HAND_X = 0.42;
const HAND_Y = 0.7;
const HAND_Z = 0.04;
const HAND_R = 0.105;
const HAND_SWING_Z = 0.18;
const WALK_ANIM_SPEED = 0.007;

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

  update(alpha: number, timeMs: number): void {
    for (let i = 0; i < this.count; i++) {
      const p = this.pedestrians[i];
      const s = p.prevScale + (p.scale - p.prevScale) * alpha;
      if (s <= 0.002) {
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
      const heading = lerpAngle(p.prevHeading, p.heading, alpha);
      const walking = p.state === 'walking' || p.state === 'crossing' || p.state === 'exiting' || p.state === 'entering';
      const phase = timeMs * WALK_ANIM_SPEED + i * 1.7;
      const step = Math.sin(phase);
      const bob = walking ? step * 0.05 : 0;
      const handSwing = walking ? step * HAND_SWING_Z : 0;

      this.quat.setFromEuler(this.euler.set(0, heading, 0));
      this.mat.compose(this.pos.set(x, 0.12 + bob, z), this.quat, this.scl.set(s, s, s));
      this.body.setMatrixAt(i, this.mat);
      this.mat.compose(this.pos.set(x, 0.12 + bob + 1.62 * s, z), this.quat, this.scl.set(s, s, s));
      this.head.setMatrixAt(i, this.mat);

      const sin = Math.sin(heading);
      const cos = Math.cos(heading);
      for (const side of [-1, 1]) {
        const localX = side * HAND_X * s;
        const localZ = (HAND_Z + handSwing * side) * s;
        const hx = x + cos * localX + sin * localZ;
        const hz = z - sin * localX + cos * localZ;
        this.mat.compose(this.pos.set(hx, 0.12 + bob + HAND_Y * s, hz), this.quat, this.scl.set(s, s, s));
        this.hands.setMatrixAt(i * 2 + (side < 0 ? 0 : 1), this.mat);
      }
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
    this.hands.instanceMatrix.needsUpdate = true;
  }
}
