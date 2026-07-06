import * as THREE from 'three';
import { lerpAngle } from '../city/CityModel';
import type { Pedestrian } from '../sim/agents';
import { buildCharacter, type CharacterAppearance } from './CharacterFactory';
import { PED_SCALE } from './PedestrianMesh';

interface Entry {
  /** Índice del peatón en el array de la simulación. */
  index: number;
  group: THREE.Group;
  hands: THREE.Mesh[];
  /** Rombo flotante para localizar al personaje a cualquier zoom. */
  marker: THREE.Mesh;
}

/** Altura del marcador sobre los pies (por encima de cualquier peinado). */
const MARKER_Y = 2.35;
const HAND_SWING_Z = 0.18;
const WALK_ANIM_SPEED = 0.007;
const HALF_PI = Math.PI / 2;

/**
 * Render de los personajes creados por el usuario: cada uno es un grupo
 * propio (no instanciado — son pocos y cada uno tiene peinado/colores únicos).
 * Sigue el mismo patrón de interpolación prev → actual que PedestrianMesh.
 */
export class CustomPedestrianMesh {
  readonly group = new THREE.Group();
  private readonly entries: Entry[] = [];

  constructor(private readonly pedestrians: Pedestrian[]) {}

  /** Registra el personaje del peatón `index` con su aspecto. */
  add(index: number, appearance: CharacterAppearance): void {
    const g = buildCharacter(appearance);
    g.visible = false; // hasta que la simulación lo saque por la puerta
    // Para el picking: cualquier hijo remonta hasta aquí y encuentra el índice.
    g.userData.pedIndex = index;
    g.userData.height = appearance.height;
    const hands: THREE.Mesh[] = [];
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.handSide) hands.push(o);
    });

    // Marcador: rombo brillante sin iluminar (visible también de noche y en
    // sombra); el color >1 lo hace florecer ligeramente con el bloom.
    // Sin test de profundidad: se ve A TRAVÉS de los edificios, como un
    // marcador de misión — si no, las torres del sur lo ocultan continuamente.
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x4cc9f0).multiplyScalar(1.5),
        transparent: true,
        opacity: 0.92,
        depthTest: false,
        depthWrite: false,
      }),
    );
    marker.renderOrder = 10; // tras los opacos y los conos de luz
    marker.position.y = MARKER_Y;
    g.add(marker);

    this.group.add(g);
    this.entries.push({ index, group: g, hands, marker });
  }

  /** Grupo del personaje del peatón `index`, si es un personaje personalizado. */
  groupOf(index: number): THREE.Group | null {
    return this.entries.find((e) => e.index === index)?.group ?? null;
  }

  /** `camera` permite agrandar el marcador con la distancia para que el
   *  personaje se localice a cualquier zoom. */
  update(alpha: number, timeMs: number, camera?: THREE.Camera): void {
    for (const { index, group, hands, marker } of this.entries) {
      const p = this.pedestrians[index];
      const s = p.prevScale + (p.scale - p.prevScale) * alpha;
      if (s <= 0.002) {
        group.visible = false;
        continue;
      }
      group.visible = true;
      const x = p.prevX + (p.x - p.prevX) * alpha;
      const z = p.prevZ + (p.z - p.prevZ) * alpha;
      const yInterp = p.prevY + (p.y - p.prevY) * alpha;
      const base = 0.12 + yInterp;
      const heading = lerpAngle(p.prevHeading, p.heading, alpha);
      const walking = p.state === 'walking' || p.state === 'crossing' || p.state === 'exiting' || p.state === 'entering';
      const phase = timeMs * WALK_ANIM_SPEED + index * 1.7;
      const step = Math.sin(phase);
      const bob = walking ? step * 0.05 : 0;
      const handSwing = walking ? step * HAND_SWING_Z : 0;
      // La escala base del grupo ya incluye la altura del personaje.
      const h = group.userData.height ?? 1;
      const S = s * h * PED_SCALE;
      group.scale.setScalar(S);
      // Postura: 0 de pie, 1 tumbado. Se inclina el grupo y se lleva los pies al pie
      // de la cama, a la altura del colchón (heading apunta a los pies → +footDir).
      const rec = Math.min(1, Math.max(0, p.prevRecline + (p.recline - p.prevRecline) * alpha));
      const footShift = 0.85 * S * rec;
      const fx = x + Math.sin(heading) * footShift;
      const fz = z + Math.cos(heading) * footShift;
      const lieY = yInterp + 0.12;
      const fy = base + bob + (lieY - (base + bob)) * rec;
      group.position.set(fx, fy, fz);
      group.rotation.set(-HALF_PI * rec, heading, 0, 'YXZ');
      for (const hand of hands) {
        const side = hand.userData.handSide === 'left' ? -1 : 1;
        hand.position.z = (hand.userData.handBaseZ ?? 0.04) + handSwing * side;
      }

      // Marcador: gira, flota y crece con la distancia (sin pasarse).
      marker.rotation.y = timeMs * 0.002;
      marker.position.y = MARKER_Y + Math.sin(timeMs * 0.003 + index) * 0.07;
      if (camera) {
        const d = camera.position.distanceTo(group.position);
        marker.scale.setScalar(Math.min(Math.max(d / 25, 1), 9));
      }
    }
  }
}
