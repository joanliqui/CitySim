import * as THREE from 'three';

/**
 * Fábrica de personajes personalizados: construye el mismo low-poly
 * (piernas + torso + brazos + cabeza + peinado) tanto para la vista previa
 * del creador como para el peatón en el mundo.
 */

export interface CharacterAppearance {
  hairStyle: string; // id de HAIR_STYLES
  hairColor: number;
  skinColor: number;
  shirtColor: number;
  pantsColor: number;
  /** Escala global del personaje (altura), 0.85–1.15. */
  height: number;
}

export interface HairStyle {
  id: string;
  label: string;
  /** Construye el peinado centrado en la cabeza (origen = centro de la cabeza). */
  build: (mat: THREE.Material) => THREE.Object3D;
}

/* Mismas proporciones que el peatón instanciado: cabeza en y≈1.62. */
const HEAD_Y = 1.62;
const HEAD_R = 0.24;
const HAND_X = 0.42;
const HAND_Y = 0.7;
const HAND_Z = 0.04;
const HAND_R = 0.105;

export const HAIR_COLORS = [0x2b2018, 0x5a3825, 0x9c6b3a, 0xd9a441, 0xb14a32, 0x8a8f99, 0xe8e4dc, 0x4f7fd6, 0xc24f9a];
export const SKIN_COLORS = [0xf5d3b3, 0xe0b58f, 0xc68d5e, 0x9c6b44, 0x6f4a2f];
export const SHIRT_PALETTE = [0xd6584f, 0x4f7fd6, 0x57b06a, 0xe0b73d, 0x9a5fc2, 0xd87fa8, 0x5fc2b8, 0x8a8f99, 0x2c2f33, 0xf0ede6];
export const PANTS_COLORS = [0x3a4a63, 0x2c2f33, 0x6b6f78, 0x7a5c3e, 0x4a6b4f, 0xd9d4c8];

export const DEFAULT_APPEARANCE: CharacterAppearance = {
  hairStyle: 'corto',
  hairColor: HAIR_COLORS[0],
  skinColor: SKIN_COLORS[1],
  shirtColor: SHIRT_PALETTE[1],
  pantsColor: PANTS_COLORS[0],
  height: 1,
};

/** Casquete superior de la cabeza (base de varios peinados). */
function cap(mat: THREE.Material, r = HEAD_R + 0.035, squash = 0.85): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  m.scale.y = squash;
  m.position.y = 0.02;
  return m;
}

export const HAIR_STYLES: HairStyle[] = [
  { id: 'calvo', label: 'Calvo', build: () => new THREE.Group() },
  { id: 'corto', label: 'Corto', build: (mat) => cap(mat) },
  {
    id: 'melena',
    label: 'Melena',
    build: (mat) => {
      const g = new THREE.Group();
      g.add(cap(mat, HEAD_R + 0.045, 0.9));
      // Cortina trasera y laterales.
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.14), mat);
      back.position.set(0, -0.1, -0.17);
      const sideGeo = new THREE.BoxGeometry(0.1, 0.34, 0.3);
      const left = new THREE.Mesh(sideGeo, mat);
      left.position.set(-0.21, -0.06, -0.05);
      const right = new THREE.Mesh(sideGeo, mat);
      right.position.set(0.21, -0.06, -0.05);
      g.add(back, left, right);
      return g;
    },
  },
  {
    id: 'mono',
    label: 'Moño',
    build: (mat) => {
      const g = new THREE.Group();
      g.add(cap(mat));
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mat);
      bun.position.set(0, 0.24, -0.06);
      g.add(bun);
      return g;
    },
  },
  {
    id: 'coleta',
    label: 'Coleta',
    build: (mat) => {
      const g = new THREE.Group();
      g.add(cap(mat));
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 3, 6), mat);
      tail.position.set(0, -0.04, -0.26);
      tail.rotation.x = 0.45;
      g.add(tail);
      return g;
    },
  },
  {
    id: 'mohawk',
    label: 'Cresta',
    build: (mat) => {
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.46), mat);
      crest.position.y = 0.18;
      return crest;
    },
  },
  {
    id: 'afro',
    label: 'Afro',
    build: (mat) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), mat);
      m.position.y = 0.11;
      return m;
    },
  },
  {
    id: 'gorra',
    label: 'Gorra',
    build: (mat) => {
      const g = new THREE.Group();
      g.add(cap(mat, HEAD_R + 0.04, 0.7));
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.2), mat);
      brim.position.set(0, 0.05, 0.27);
      g.add(brim);
      return g;
    },
  },
];

export function hairStyleById(id: string): HairStyle {
  return HAIR_STYLES.find((h) => h.id === id) ?? HAIR_STYLES[1];
}

/**
 * Construye el grupo del personaje (origen en los pies, mirando a +Z).
 * El llamador es dueño del grupo: usar disposeCharacter al desecharlo.
 */
export function buildCharacter(a: CharacterAppearance): THREE.Group {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: a.skinColor });
  const shirt = new THREE.MeshLambertMaterial({ color: a.shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: a.pantsColor });
  const hair = new THREE.MeshLambertMaterial({ color: a.hairColor });

  // Piernas (pantalón): dos cápsulas finas.
  const legGeo = new THREE.CapsuleGeometry(0.1, 0.36, 3, 6);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, pants);
    leg.position.set(side * 0.13, 0.32, 0);
    group.add(leg);
  }

  // Torso (camiseta), mismas medidas que el peatón instanciado.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 3, 8), shirt);
  torso.position.y = 0.95;
  group.add(torso);

  // Brazos.
  const armGeo = new THREE.CapsuleGeometry(0.075, 0.42, 3, 6);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, shirt);
    arm.position.set(side * 0.38, 0.98, 0);
    arm.rotation.z = side * 0.12;
    group.add(arm);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(HAND_R, 8, 6), skin);
    hand.position.set(side * HAND_X, HAND_Y, HAND_Z);
    hand.userData.handSide = side < 0 ? 'left' : 'right';
    hand.userData.handBaseZ = HAND_Z;
    group.add(hand);
  }

  // Cabeza + peinado.
  const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 12, 10), skin);
  head.position.y = HEAD_Y;
  group.add(head);
  const hairMesh = hairStyleById(a.hairStyle).build(hair);
  hairMesh.position.y += HEAD_Y;
  group.add(hairMesh);

  group.scale.setScalar(a.height);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return group;
}

/** Libera geometrías y materiales de un personaje construido con buildCharacter. */
export function disposeCharacter(group: THREE.Group): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}
