import * as THREE from 'three';
import { Rng } from '../core/Rng';

/**
 * Cielo estilo cartoon: esfera con shader de degradado saturado, disco solar
 * nítido con halo, luna y estrellas procedurales, más nubes low-poly a la deriva.
 */
export class Sky {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly clouds: THREE.InstancedMesh;
  private readonly cloudMaterial: THREE.MeshBasicMaterial;
  private readonly puffs: Array<{ x: number; y: number; z: number; s: THREE.Vector3; speed: number }> = [];
  private readonly wrap: number;

  private readonly mat4 = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly vec = new THREE.Vector3();

  constructor(halfExtent: number, seed: number) {
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x35b6ff) },
        uHorizon: { value: new THREE.Color(0xbdf3ff) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(0xfff3d8) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uNight: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uMoonDir;
        uniform float uNight;
        varying vec3 vDir;

        void main() {
          vec3 d = normalize(vDir);
          // Degradado con banda de horizonte amplia (look cartoon, alto contraste).
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.55, pow(h, 0.8)));

          // Sol: disco de borde nítido + halo suave.
          float sd = dot(d, uSunDir);
          float disc = smoothstep(0.99935, 0.99965, sd);
          float halo = pow(max(sd, 0.0), 60.0) * 0.45 + pow(max(sd, 0.0), 8.0) * 0.12;
          col += uSunColor * (disc * 1.6 + halo);

          // Luna: disco más pequeño y frío.
          float md = dot(d, uMoonDir);
          float moon = smoothstep(0.99965, 0.99985, md);
          float moonHalo = pow(max(md, 0.0), 90.0) * 0.25;
          col += vec3(0.82, 0.88, 1.0) * (moon * 1.2 + moonHalo) * uNight;

          // Estrellas procedurales, solo de noche y sobre el horizonte.
          if (uNight > 0.02 && d.y > 0.02) {
            vec3 p = d * 170.0;
            vec3 ip = floor(p);
            float rnd = fract(sin(dot(ip, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            float s = smoothstep(0.14, 0.0, length(fract(p) - 0.5)) * step(0.994, rnd);
            col += vec3(1.0, 0.96, 0.88) * s * uNight * smoothstep(0.02, 0.2, d.y);
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(halfExtent * 4.5, 32, 16), this.material);
    this.group.add(dome);

    // Nubes: cúmulos de esferas achatadas, material plano (no les afecta la luz).
    const rng = new Rng(seed);
    this.wrap = halfExtent * 1.9;
    for (let c = 0; c < 14; c++) {
      const cx = rng.range(-this.wrap, this.wrap);
      const cz = rng.range(-this.wrap, this.wrap);
      const cy = rng.range(58, 92);
      const speed = rng.range(1.2, 2.6);
      const puffCount = rng.int(3, 6);
      for (let k = 0; k < puffCount; k++) {
        const r = rng.range(5, 11);
        this.puffs.push({
          x: cx + rng.range(-12, 12),
          y: cy + rng.range(-2, 2),
          z: cz + rng.range(-5, 5),
          s: new THREE.Vector3(r * 1.5, r * 0.55, r),
          speed,
        });
      }
    }
    this.cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.clouds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), this.cloudMaterial, this.puffs.length);
    this.group.add(this.clouds);
  }

  update(
    time: number,
    sunDir: THREE.Vector3,
    moonDir: THREE.Vector3,
    top: THREE.Color,
    horizon: THREE.Color,
    sunColor: THREE.Color,
    night: number,
  ): void {
    const u = this.material.uniforms;
    (u.uTop.value as THREE.Color).copy(top);
    (u.uHorizon.value as THREE.Color).copy(horizon);
    (u.uSunDir.value as THREE.Vector3).copy(sunDir);
    (u.uSunColor.value as THREE.Color).copy(sunColor);
    (u.uMoonDir.value as THREE.Vector3).copy(moonDir);
    u.uNight.value = night;

    // Las nubes pasan de blanco brillante a azul oscuro por la noche.
    this.cloudMaterial.color.setRGB(1 - night * 0.62, 1 - night * 0.58, 1 - night * 0.4);

    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      const x = wrapCoord(p.x + time * p.speed, this.wrap);
      this.mat4.compose(this.vec.set(x, p.y, p.z), this.quat, p.s);
      this.clouds.setMatrixAt(i, this.mat4);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }
}

function wrapCoord(v: number, limit: number): number {
  const span = limit * 2;
  return ((((v + limit) % span) + span) % span) - limit;
}
