import * as THREE from 'three';
import { lerpAngle } from '../city/CityModel';
import type { Vehicle } from '../sim/agents';

const CAR_COLORS = [0xd64545, 0x4576d6, 0xe8e8e8, 0x3d3f44, 0xe0b133, 0x53a85e, 0x9054b3, 0xd47f3a];
const PICK_BOUNDS_RADIUS = 10000;
const HEADLIGHT_OFF = 0x3a3428;
const HEADLIGHT_ON = 0xfff0b0;
const BODY_HALF_Z = 4.45 / 2;
const HEADLIGHT_FRONT_OFFSET = 0.12;
const HEADLIGHT_X = 0.62;
const HEADLIGHT_Y = 0.82;
const HEADLIGHT_R = 0.18;

interface CarVariant {
  body: THREE.Vector3Tuple;
  cabin: THREE.Vector3Tuple;
  wheelX: number;
  frontZ: number;
  rearZ: number;
  wheelScale: number;
  spoiler: boolean;
  roofBox: boolean;
}

const CAR_VARIANTS: CarVariant[] = [
  { body: [1, 1, 1], cabin: [1, 1, 1], wheelX: 1, frontZ: 1.45, rearZ: -1.45, wheelScale: 1, spoiler: false, roofBox: false },
  { body: [1.08, 0.72, 1.15], cabin: [0.88, 0.72, 0.82], wheelX: 1.08, frontZ: 1.68, rearZ: -1.68, wheelScale: 0.92, spoiler: true, roofBox: false },
  { body: [1.08, 1.16, 1.05], cabin: [1.06, 1.15, 1.12], wheelX: 1.08, frontZ: 1.52, rearZ: -1.52, wheelScale: 1.08, spoiler: false, roofBox: true },
];

/**
 * Render de los coches: carrocería + cabina + 4 ruedas, todo instanciado.
 * Las posiciones se interpolan entre el paso de simulación anterior y el actual.
 */
export class VehicleMesh {
  readonly group = new THREE.Group();
  /** Malla usada para el picking (instanceId = índice del vehículo). */
  readonly pickMesh: THREE.InstancedMesh;

  private readonly body: THREE.InstancedMesh;
  private readonly cabin: THREE.InstancedMesh;
  private readonly wheels: THREE.InstancedMesh;
  private readonly spoilers: THREE.InstancedMesh;
  private readonly roofBoxes: THREE.InstancedMesh;
  private readonly headlights: THREE.InstancedMesh;
  private readonly headlightBeams: THREE.InstancedMesh;
  private readonly headlightMaterial: THREE.MeshBasicMaterial;
  private readonly beamMaterial: THREE.MeshBasicMaterial;
  private readonly variants: CarVariant[];
  private lastHeadlightLevel = -1;

  private readonly mat = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();
  private readonly color = new THREE.Color();

  constructor(private readonly vehicles: Vehicle[]) {
    const n = vehicles.length;
    this.variants = vehicles.map((v) => CAR_VARIANTS[v.id % CAR_VARIANTS.length]);

    const bodyGeo = new THREE.BoxGeometry(1.95, 1.05, 4.45);
    bodyGeo.translate(0, 0.9, 0);
    this.body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
    this.body.castShadow = true;
    for (let i = 0; i < n; i++) {
      this.body.setColorAt(i, new THREE.Color(CAR_COLORS[vehicles[i].colorIdx % CAR_COLORS.length]));
    }
    this.body.instanceColor!.needsUpdate = true;

    const cabinGeo = new THREE.BoxGeometry(1.75, 0.85, 2.2);
    cabinGeo.translate(0, 1.85, -0.25);
    this.cabin = new THREE.InstancedMesh(cabinGeo, new THREE.MeshLambertMaterial({ color: 0x202830 }), n);

    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    this.wheels = new THREE.InstancedMesh(wheelGeo, new THREE.MeshLambertMaterial({ color: 0x17181a }), n * 4);

    const spoilerGeo = new THREE.BoxGeometry(1.55, 0.12, 0.24);
    spoilerGeo.translate(0, 1.42, -2.0);
    this.spoilers = new THREE.InstancedMesh(spoilerGeo, new THREE.MeshLambertMaterial({ color: 0x1f2328 }), n);

    const roofBoxGeo = new THREE.BoxGeometry(1.2, 0.24, 1.35);
    roofBoxGeo.translate(0, 2.48, -0.18);
    this.roofBoxes = new THREE.InstancedMesh(roofBoxGeo, new THREE.MeshLambertMaterial({ color: 0x3a4652 }), n);

    this.headlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    this.headlights = new THREE.InstancedMesh(new THREE.SphereGeometry(HEADLIGHT_R, 10, 8), this.headlightMaterial, n * 2);
    for (let i = 0; i < n * 2; i++) this.headlights.setColorAt(i, new THREE.Color(HEADLIGHT_OFF));
    this.headlights.instanceColor!.needsUpdate = true;

    const beamGeo = new THREE.ConeGeometry(0.62, 5.2, 10, 1, true);
    beamGeo.rotateX(Math.PI / 2);
    beamGeo.translate(0, 0, 2.7);
    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xffedb0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.headlightBeams = new THREE.InstancedMesh(beamGeo, this.beamMaterial, n * 2);
    this.headlightBeams.renderOrder = 4;

    for (const mesh of [this.body, this.cabin, this.wheels, this.spoilers, this.roofBoxes, this.headlights, this.headlightBeams]) {
      mesh.frustumCulled = false;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), PICK_BOUNDS_RADIUS);
    }

    this.group.add(this.body, this.cabin, this.wheels, this.spoilers, this.roofBoxes, this.headlights, this.headlightBeams);
    this.pickMesh = this.body;
  }

  setHeadlightLevel(level: number): void {
    const l = Math.min(Math.max(level, 0), 1);
    if (Math.abs(l - this.lastHeadlightLevel) > 0.01) {
      this.lastHeadlightLevel = l;
      this.color.setHex(HEADLIGHT_OFF).lerp(new THREE.Color(HEADLIGHT_ON), l).multiplyScalar(1 + l * 2.4);
      for (let i = 0; i < this.vehicles.length * 2; i++) this.headlights.setColorAt(i, this.color);
      if (this.headlights.instanceColor) this.headlights.instanceColor.needsUpdate = true;
    }
    this.beamMaterial.opacity = l * 0.16;
  }

  update(alpha: number): void {
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      const variant = this.variants[i];
      const x = v.prevX + (v.x - v.prevX) * alpha;
      const z = v.prevZ + (v.z - v.prevZ) * alpha;
      const heading = lerpAngle(v.prevHeading, v.heading, alpha);

      this.quat.setFromEuler(this.euler.set(0, heading, 0));
      this.mat.compose(this.pos.set(x, 0.05, z), this.quat, this.scale.set(variant.body[0], variant.body[1], variant.body[2]));
      this.body.setMatrixAt(i, this.mat);
      this.mat.compose(this.pos.set(x, 0.05, z), this.quat, this.scale.set(variant.cabin[0], variant.cabin[1], variant.cabin[2]));
      this.cabin.setMatrixAt(i, this.mat);

      const sin = Math.sin(heading);
      const cos = Math.cos(heading);
      const wheelOffsets: Array<[number, number]> = [
        [-variant.wheelX, variant.frontZ],
        [variant.wheelX, variant.frontZ],
        [-variant.wheelX, variant.rearZ],
        [variant.wheelX, variant.rearZ],
      ];
      for (let w = 0; w < 4; w++) {
        const [lx, lz] = wheelOffsets[w];
        const wx = x + lx * cos + lz * sin;
        const wz = -lx * sin + lz * cos + z;
        this.mat.compose(this.pos.set(wx, 0.43, wz), this.quat, this.scale.set(variant.wheelScale, variant.wheelScale, variant.wheelScale));
        this.wheels.setMatrixAt(i * 4 + w, this.mat);
      }

      this.mat.compose(
        this.pos.set(x, 0.05, z),
        this.quat,
        variant.spoiler ? this.scale.set(variant.body[0], variant.body[1], variant.body[2]) : this.scale.set(0.0001, 0.0001, 0.0001),
      );
      this.spoilers.setMatrixAt(i, this.mat);
      this.mat.compose(
        this.pos.set(x, 0.05, z),
        this.quat,
        variant.roofBox ? this.scale.set(variant.body[0], variant.body[1], variant.body[2]) : this.scale.set(0.0001, 0.0001, 0.0001),
      );
      this.roofBoxes.setMatrixAt(i, this.mat);

      for (const side of [-1, 1]) {
        const lx = side * HEADLIGHT_X * variant.body[0];
        const lz = BODY_HALF_Z * variant.body[2] + HEADLIGHT_FRONT_OFFSET;
        const hx = x + lx * cos + lz * sin;
        const hz = -lx * sin + lz * cos + z;
        const idx = i * 2 + (side < 0 ? 0 : 1);
        this.mat.compose(this.pos.set(hx, HEADLIGHT_Y * variant.body[1], hz), this.quat, this.scale.set(1.35, 0.72, 0.45));
        this.headlights.setMatrixAt(idx, this.mat);
        this.mat.compose(this.pos.set(hx + sin * 0.04, (HEADLIGHT_Y - 0.1) * variant.body[1], hz + cos * 0.04), this.quat, this.scale.set(1, 1, 1));
        this.headlightBeams.setMatrixAt(idx, this.mat);
      }
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.cabin.instanceMatrix.needsUpdate = true;
    this.wheels.instanceMatrix.needsUpdate = true;
    this.spoilers.instanceMatrix.needsUpdate = true;
    this.roofBoxes.instanceMatrix.needsUpdate = true;
    this.headlights.instanceMatrix.needsUpdate = true;
    this.headlightBeams.instanceMatrix.needsUpdate = true;
  }
}
