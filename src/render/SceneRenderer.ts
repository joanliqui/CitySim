import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Capa reservada para el cielo, que solo ve la cámara cúbica de reflexión. */
const SKY_LAYER = 1;

/** Pase final cinematográfico: viñeta suave + ligera saturación. */
const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.42 },
    uSaturation: { value: 1.12 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSaturation;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(luma), c.rgb, uSaturation);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - uVignette * smoothstep(0.42, 0.82, d);
      gl_FragColor = c;
    }
  `,
};

/** Escena, cámara, luces y postprocesado. Los colores los anima DayNightCycle. */
export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly moon: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly lightDistance: number;
  /** Pase de bloom (DayNightCycle modula su intensidad día/noche). */
  readonly bloom: UnrealBloomPass;
  private readonly composer: EffectComposer;
  /** Captura del cielo a un cubemap para los reflejos del cristal (scene.environment). */
  private cubeCamera?: THREE.CubeCamera;
  private cubeRT?: THREE.WebGLCubeRenderTarget;

  constructor(canvas: HTMLCanvasElement, halfExtent: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd8ef);
    this.scene.fog = new THREE.Fog(0x9fd8ef, halfExtent * 1.6, halfExtent * 4);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, halfExtent * 10);
    this.camera.position.set(halfExtent * 0.9, halfExtent * 0.85, halfExtent * 0.9);
    this.camera.lookAt(0, 0, 0);

    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x7a8f6a, 0.85);
    this.scene.add(this.hemi);

    this.lightDistance = halfExtent * 1.3;
    this.sun = new THREE.DirectionalLight(0xfff2d9, 2.1);
    this.sun.position.set(halfExtent * 0.8, halfExtent * 1.1, halfExtent * 0.45);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const s = halfExtent * 1.15;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = halfExtent * 4;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);

    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0);
    this.scene.add(this.moon);

    // Postprocesado: render → bloom (solo emisores >1 en HDR) → tonemapping → viñeta.
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.55, 1);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new ShaderPass(CinematicShader));

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * Prepara la captura del cielo: marca el cielo en una capa propia y crea una
   * cámara cúbica que solo lo ve. El cubemap resultante se usa como entorno de
   * reflexión (solo afecta a materiales PBR → el cristal de las ventanas).
   */
  initSkyEnvironment(sky: THREE.Object3D): void {
    sky.traverse((o) => o.layers.enable(SKY_LAYER));
    this.cubeRT = new THREE.WebGLCubeRenderTarget(128);
    this.cubeCamera = new THREE.CubeCamera(1, this.lightDistance * 12, this.cubeRT);
    this.cubeCamera.layers.set(SKY_LAYER);
    this.scene.add(this.cubeCamera);
    this.scene.environment = this.cubeRT.texture;
    this.updateSkyEnvironment();
  }

  /** Reproyecta el cielo actual al cubemap de reflexión (llamar con baja frecuencia). */
  updateSkyEnvironment(): void {
    this.cubeCamera?.update(this.renderer, this.scene);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.composer.render();
  }
}
