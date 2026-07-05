import * as THREE from 'three';
import type { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Sky } from './Sky';

/** Duración por defecto de un día completo en segundos de simulación. */
const DEFAULT_DAY_LENGTH = 300;
const START_HOUR = 9;

/** Paradas de color del cielo (cartoon: saturado y con contraste). */
const TOP_DAY = new THREE.Color(0x2fb4ff);
const TOP_DUSK = new THREE.Color(0x6a4fd0);
const TOP_NIGHT = new THREE.Color(0x111c4e);
const HOR_DAY = new THREE.Color(0xc4f4ff);
const HOR_DUSK = new THREE.Color(0xff9a45);
const HOR_NIGHT = new THREE.Color(0x33487e);
const SUN_DAY = new THREE.Color(0xfff3d4);
const SUN_LOW = new THREE.Color(0xff8a3c);
const HEMI_SKY_DAY = new THREE.Color(0xc6ecff);
const HEMI_SKY_NIGHT = new THREE.Color(0x32437a);
const HEMI_GND_DAY = new THREE.Color(0x7a8f6a);
const HEMI_GND_NIGHT = new THREE.Color(0x2a3050);
const WINDOW_DAY = new THREE.Color(0x37495c);
const WINDOW_NIGHT = new THREE.Color(0x6b5a35);
const WINDOW_GLOW = new THREE.Color(0xffb347);
/** Reflejo diurno sutil de las ventanas (queda por debajo del umbral de bloom). */
const WINDOW_SHEEN = new THREE.Color(0x8fc3e8);
const LAMP_OFF = new THREE.Color(0x41454c);
const LAMP_ON = new THREE.Color(0xffe9a3);
/** Luces del supermercado: al revés que las farolas (encendidas de DÍA, apagadas de noche). */
const MARKET_LAMP_OFF = new THREE.Color(0x35383d);
const MARKET_LAMP_ON = new THREE.Color(0xfff2d0);

export interface DayNightTargets {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  moon: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: Sky;
  /** Material compartido de todas las ventanas (cristal reflectante; se ilumina de noche). */
  windowMaterial: THREE.MeshStandardMaterial;
  /** Material compartido de las bombillas de las farolas. */
  lampMaterial: THREE.MeshBasicMaterial;
  /** Material de los conos de luz de las farolas. */
  lampConeMaterial: THREE.MeshBasicMaterial;
  /** Material compartido de las bombillas colgantes del supermercado (encendidas
   *  de día, apagadas de noche: al revés que las farolas). */
  marketLampMaterial: THREE.MeshBasicMaterial;
  /** Pase de bloom: más intenso de noche. */
  bloom: UnrealBloomPass;
  lightDistance: number;
}

/**
 * Ciclo día/noche dirigido por el tiempo de simulación: mueve el sol y la luna,
 * mezcla los colores del cielo/niebla/luces y enciende ventanas y farolas.
 */
export class DayNightCycle {
  /** Hora del día [0, 24). */
  hour = START_HOUR;
  nightLevel = 0;
  /** Segundos de simulación que dura un día completo. */
  dayLength = DEFAULT_DAY_LENGTH;
  /** Desfase en horas aplicado sobre el tiempo de simulación (permite fijar la hora). */
  private hourOffset = START_HOUR;

  private readonly sunDir = new THREE.Vector3();
  private readonly moonDir = new THREE.Vector3();
  private readonly top = new THREE.Color();
  private readonly horizon = new THREE.Color();
  private readonly sunColor = new THREE.Color();
  private readonly tmpColor = new THREE.Color();

  constructor(private readonly t: DayNightTargets) {}

  /** Fija la hora actual sin alterar el tiempo de simulación. */
  setHour(hour: number, simTime: number): void {
    this.hourOffset = hour - (simTime / this.dayLength) * 24;
    this.update(simTime);
  }

  /** Cambia la duración del día conservando la hora actual. */
  setDayLength(seconds: number, simTime: number): void {
    const current = this.hour;
    this.dayLength = seconds;
    this.setHour(current, simTime);
  }

  update(simTime: number): void {
    this.hour = ((((simTime / this.dayLength) * 24 + this.hourOffset) % 24) + 24) % 24;

    // Sol: sale a las 6:00 por el este y se pone a las 20:00 por el oeste.
    const st = (this.hour - 6) / 14;
    const theta = Math.PI * st;
    this.sunDir.set(Math.cos(theta), Math.sin(theta), 0.32).normalize();
    // Luna: trayectoria opuesta durante la noche.
    const mt = (((this.hour - 20 + 24) % 24) / 10) * Math.PI;
    this.moonDir.set(Math.cos(mt), Math.sin(mt), -0.25).normalize();

    const e = this.sunDir.y;
    // Mezcla noche → atardecer → día según la elevación solar.
    const t1 = smoothstep(-0.22, 0.0, e);
    const t2 = smoothstep(0.08, 0.4, e);
    const night = 1 - smoothstep(-0.1, 0.1, e);
    this.nightLevel = night;

    this.top.copy(TOP_NIGHT).lerp(TOP_DUSK, t1).lerp(TOP_DAY, t2);
    this.horizon.copy(HOR_NIGHT).lerp(HOR_DUSK, t1).lerp(HOR_DAY, t2);
    this.sunColor.copy(SUN_LOW).lerp(SUN_DAY, t2);

    const { scene, sun, moon, hemi, sky, windowMaterial, lampMaterial, lampConeMaterial, marketLampMaterial, bloom, lightDistance } = this.t;

    sun.intensity = 2.4 * smoothstep(0.0, 0.28, e);
    sun.color.copy(this.sunColor);
    sun.position.copy(this.sunDir).multiplyScalar(lightDistance);
    sun.castShadow = e > 0.02;

    moon.intensity = 0.55 * night;
    moon.position.copy(this.moonDir).multiplyScalar(lightDistance);

    hemi.intensity = 0.55 + 0.4 * t2;
    hemi.color.copy(HEMI_SKY_NIGHT).lerp(HEMI_SKY_DAY, t2);
    hemi.groundColor.copy(HEMI_GND_NIGHT).lerp(HEMI_GND_DAY, t2);

    if (scene.fog) scene.fog.color.copy(this.horizon);
    if (scene.background instanceof THREE.Color) scene.background.copy(this.horizon);

    // Ventanas: de día el reflejo del cielo (scene.environment) hace casi todo el
    // trabajo, así que el emisivo diurno es mínimo; de noche, brillo cálido (>1 → bloom).
    // Menos reflejo especular de noche para que destaque el brillo interior.
    windowMaterial.color.copy(this.tmpColor.copy(WINDOW_DAY).lerp(WINDOW_NIGHT, night));
    windowMaterial.envMapIntensity = 1.0 - 0.7 * night;
    windowMaterial.emissive
      .copy(this.tmpColor.copy(WINDOW_SHEEN).multiplyScalar(0.12 * (1 - night)))
      .add(this.tmpColor.copy(WINDOW_GLOW).multiplyScalar(night * 1.8));

    lampMaterial.color.copy(this.tmpColor.copy(LAMP_OFF).lerp(LAMP_ON, night)).multiplyScalar(1 + night * 1.2);
    lampConeMaterial.opacity = night * 0.14;

    // Luces del supermercado: encendidas de día, apagadas de noche (al revés que
    // las farolas). Sin cono de luz propio (solo la bombilla).
    const day = 1 - night;
    marketLampMaterial.color.copy(this.tmpColor.copy(MARKET_LAMP_OFF).lerp(MARKET_LAMP_ON, day)).multiplyScalar(1 + day * 1.2);

    // Bloom cinematográfico: sutil de día, marcado de noche.
    bloom.strength = 0.13 + 0.28 * night;

    sky.update(simTime, this.sunDir, this.moonDir, this.top, this.horizon, this.sunColor, night);
  }

  /** Hora formateada HH:MM para el HUD. */
  get clockText(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}
