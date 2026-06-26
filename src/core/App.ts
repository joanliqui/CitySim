import { generateCity } from '../city/CityGenerator';
import { apartmentCount } from '../city/CityModel';
import type * as THREE from 'three';
import { CameraRig } from '../render/CameraRig';
import { buildCityMesh, type DoorAnimator } from '../render/CityMesh';
import type { FloorLampController } from '../render/FloorLamps';
import { DayNightCycle } from '../render/DayNightCycle';
import { Sky } from '../render/Sky';
import { PedestrianMesh } from '../render/PedestrianMesh';
import { SceneRenderer } from '../render/SceneRenderer';
import { TrafficLightMesh } from '../render/TrafficLightMesh';
import { VehicleMesh } from '../render/VehicleMesh';
import { Simulation } from '../sim/Simulation';
import type { Pedestrian, Vehicle } from '../sim/agents';
import { BIG_FIVE } from '../sim/personality';
import { SOCIAL_CLASS_LABEL } from '../sim/socialClass';
import { CustomPedestrianMesh } from '../render/CustomPedestrianMesh';
import { BuildPanel, type BuildPass } from '../ui/BuildPanel';
import { CameraPanel } from '../ui/CameraPanel';
import { CharacterCreator } from '../ui/CharacterCreator';
import { Hud, type AgentDetail, type AgentInfo } from '../ui/Hud';
import { Picking, type PickResult } from '../ui/Picking';
import { RadialMenu } from '../ui/RadialMenu';
import { ActionRegistry } from '../interaction/ActionRegistry';
import { collectDoorInteractables } from '../interaction/doorInteractables';
import { InteractableRegistry } from '../interaction/InteractableRegistry';
import { InteractionController } from '../interaction/InteractionController';
import { collectFloorLampInteractables, collectFurnitureInteractables } from '../interaction/furnitureInteractables';
import { SimClock } from './Clock';

const DEFAULT_SEED = 20260611;
const DEFAULT_VEHICLES = 70;
const DEFAULT_PEDESTRIANS = 180;

const BUILD_PASSES: BuildPass[] = [
  {
    label: 'Terreno',
    detail: 'Base verde y extensión de la ciudad.',
    layers: ['ground'],
  },
  {
    label: 'Carreteras',
    detail: 'Calzadas, rotondas y ejes principales.',
    layers: ['ground', 'roads'],
  },
  {
    label: 'Aceras y marcas',
    detail: 'Aceras, pasos de cebra y líneas de carril.',
    layers: ['ground', 'roads', 'sidewalks', 'markings'],
  },
  {
    label: 'Parques y árboles',
    detail: 'Islas verdes, parques y arbolado urbano.',
    layers: ['ground', 'roads', 'sidewalks', 'markings', 'trees'],
  },
  {
    label: 'Edificios',
    detail: 'Viviendas, tiendas, oficinas y detalles de fachada.',
    layers: ['ground', 'roads', 'sidewalks', 'markings', 'trees', 'buildings', 'roofs'],
  },
  {
    label: 'Luces',
    detail: 'Farolas y semáforos de la red viaria.',
    layers: ['ground', 'roads', 'sidewalks', 'markings', 'trees', 'buildings', 'roofs', 'lamps', 'trafficLights'],
  },
  {
    label: 'Coches',
    detail: 'Vehículos circulando por el grafo de carreteras.',
    layers: ['ground', 'roads', 'sidewalks', 'markings', 'trees', 'buildings', 'roofs', 'lamps', 'trafficLights', 'vehicles'],
  },
  {
    label: 'Peatones',
    detail: 'Personas, rutas a edificios y personajes personalizados.',
    layers: ['ground', 'roads', 'sidewalks', 'markings', 'trees', 'buildings', 'roofs', 'lamps', 'trafficLights', 'vehicles', 'pedestrians'],
  },
];

/** Configuración inicial, sobreescribible por query params (?seed=&cars=&peds=). */
function readConfig(): { seed: number; vehicles: number; pedestrians: number } {
  const params = new URLSearchParams(location.search);
  const num = (key: string, fallback: number, max: number) => {
    const n = parseInt(params.get(key) ?? '', 10);
    return Number.isNaN(n) ? fallback : Math.min(Math.max(n, 0), max);
  };
  return {
    seed: num('seed', DEFAULT_SEED, 999999999),
    vehicles: num('cars', DEFAULT_VEHICLES, 300),
    pedestrians: num('peds', DEFAULT_PEDESTRIANS, 600),
  };
}

/** Orquestador: ciudad → simulación → render → UI, con bucle de paso fijo e interpolación. */
export class App {
  private readonly clock = new SimClock();
  private readonly sim: Simulation;
  private readonly renderer: SceneRenderer;
  private readonly rig: CameraRig;
  private readonly hud: Hud;
  private readonly vehicleMesh: VehicleMesh;
  private readonly pedestrianMesh: PedestrianMesh;
  private readonly customPedMesh: CustomPedestrianMesh;
  private readonly creator: CharacterCreator;
  private readonly lightMesh: TrafficLightMesh;
  private readonly dayNight: DayNightCycle;
  private readonly doors: DoorAnimator;
  private readonly floorLamps: FloorLampController;
  private readonly buildObjects: Record<string, THREE.Object3D[]>;
  private readonly billboard: THREE.Object3D | null;

  private selected: PickResult = null;
  private lastFrame = performance.now();
  private fps = 60;
  private hudTimer = 0;
  private envTimer = 0;

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement) {
    const config = readConfig();
    const model = generateCity(config.seed);
    this.sim = new Simulation(model, { vehicles: config.vehicles, pedestrians: config.pedestrians, seed: config.seed });

    this.renderer = new SceneRenderer(canvas, model.halfExtent);
    const city = buildCityMesh(model);
    this.doors = city.doors;
    this.floorLamps = city.floorLamps;
    this.renderer.scene.add(city.group);
    this.billboard = city.group.getObjectByName('billboard') ?? null;

    const sky = new Sky(model.halfExtent, config.seed);
    this.renderer.scene.add(sky.group);
    // Cubemap del cielo para los reflejos del cristal de las ventanas.
    this.renderer.initSkyEnvironment(sky.group);
    this.dayNight = new DayNightCycle({
      scene: this.renderer.scene,
      sun: this.renderer.sun,
      moon: this.renderer.moon,
      hemi: this.renderer.hemi,
      sky,
      windowMaterial: city.windowMaterial,
      lampMaterial: city.lampMaterial,
      lampConeMaterial: city.lampConeMaterial,
      bloom: this.renderer.bloom,
      lightDistance: this.renderer.lightDistance,
    });

    this.vehicleMesh = new VehicleMesh(this.sim.vehicleSystem.vehicles);
    this.pedestrianMesh = new PedestrianMesh(this.sim.pedestrianSystem.pedestrians);
    this.customPedMesh = new CustomPedestrianMesh(this.sim.pedestrianSystem.pedestrians);
    this.lightMesh = new TrafficLightMesh(this.sim.lights, this.sim.model.roundabouts, [this.sim.model.park, ...this.sim.model.mergedBlocks]);
    this.renderer.scene.add(this.vehicleMesh.group, this.pedestrianMesh.group, this.customPedMesh.group, this.lightMesh.group);
    this.buildObjects = {
      ground: [city.layers.ground],
      roads: [city.layers.roads],
      sidewalks: [city.layers.sidewalks],
      markings: [city.layers.markings],
      trees: [city.layers.trees],
      buildings: [city.layers.buildings],
      roofs: [city.layers.roofs],
      lamps: [city.layers.lamps],
      trafficLights: [this.lightMesh.group],
      vehicles: [this.vehicleMesh.group],
      pedestrians: [this.pedestrianMesh.group, this.customPedMesh.group],
    };

    this.rig = new CameraRig(this.renderer.camera, canvas, model.halfExtent, () => this.select(null));

    this.hud = new Hud(hudRoot, {
      onTogglePause: () => {
        this.clock.paused = !this.clock.paused;
        this.hud.setPaused(this.clock.paused);
      },
      onSpeed: (speed) => {
        this.clock.speed = speed;
      },
      onRelease: () => this.select(null),
      getSettings: () => ({
        hour: this.dayNight.hour,
        dayLength: this.dayNight.dayLength,
        seed: config.seed,
        vehicles: config.vehicles,
        pedestrians: config.pedestrians,
      }),
      onSetHour: (hour) => this.dayNight.setHour(hour, this.clock.time),
      onSetDayLength: (seconds) => this.dayNight.setDayLength(seconds, this.clock.time),
      onRegenerate: (seed, vehicles, pedestrians) => {
        location.search = `?seed=${seed}&cars=${vehicles}&peds=${pedestrians}`;
      },
      onCreateCharacter: () => this.creator.open(),
      onAgentAction: (id) => this.runAgentAction(id),
      onFocusHome: () => {
        if (this.selected?.kind === 'pedestrian') {
          const p = this.sim.pedestrianSystem.pedestrians[this.selected.index];
          this.focusBuilding(p.home);
        }
      },
    });

    // Creador de personajes: al confirmar, el peatón nace en la simulación
    // (al final del array → índices estables) y la cámara lo sigue.
    this.creator = new CharacterCreator(hudRoot, (appearance, personality) => {
      const index = this.sim.pedestrianSystem.spawnCustom(personality);
      this.customPedMesh.add(index, appearance);
      this.select({ kind: 'pedestrian', index }, true);
    });

    new BuildPanel(hudRoot, BUILD_PASSES, {
      onApply: (visibleLayers) => this.applyBuildLayers(visibleLayers),
      onFocusBillboard: () => this.focusBillboard(),
    });

    new CameraPanel(hudRoot, {
      getFlySpeed: () => this.rig.flySpeedValue,
      onSetFlySpeed: (value) => this.rig.setFlySpeed(value),
    });

    new Picking(
      canvas,
      this.renderer.camera,
      this.vehicleMesh.pickMesh,
      this.pedestrianMesh.pickMesh,
      this.customPedMesh.group,
      this.sim.pedestrianSystem.pedestrians,
      (result) => this.select(result),
    );

    // Menú radial contextual (clic derecho): objetos interactuables + sus acciones.
    const interactables = new InteractableRegistry();
    interactables.addAll(collectDoorInteractables(model));
    interactables.addAll(collectFurnitureInteractables(model));
    interactables.addAll(collectFloorLampInteractables(this.floorLamps.placements));
    const actions = new ActionRegistry();
    actions.register('door', (interactable) => {
      const data = interactable.data as { doorIndex?: number } | undefined;
      const doorIndex = data?.doorIndex;
      const open = typeof doorIndex === 'number' && this.doors.isOpen(doorIndex);
      return [
        {
          id: 'toggle',
          label: open ? 'Cerrar' : 'Abrir',
          icon: '▯',
          run: () => {
            if (typeof doorIndex === 'number') this.doors.toggle(doorIndex);
          },
        },
      ];
    });
    actions.registerActions('wardrobe', [
      {
        id: 'open',
        label: 'Abrir',
        icon: '🚪',
        run: ({ interactable }) => console.log('[Interacción] Abrir armario', interactable.id, interactable.data),
      },
    ]);
    actions.register('floorLamp', (interactable) => {
      const i = (interactable.data as { index: number }).index;
      const on = this.floorLamps.isOn(i);
      return [
        {
          id: 'toggle',
          label: on ? 'Apagar' : 'Encender',
          icon: '💡',
          run: () => this.floorLamps.toggle(i),
        },
      ];
    });
    new InteractionController(canvas, this.renderer.camera, interactables, actions, new RadialMenu(hudRoot));
    window.addEventListener('keydown', (e) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') this.select(null);
      if (e.key === ' ') {
        this.clock.paused = !this.clock.paused;
        this.hud.setPaused(this.clock.paused);
        e.preventDefault();
      }
    });
  }

  private select(result: PickResult, closeUp = false): void {
    this.selected = result;
    if (!result) {
      this.rig.follow(null);
      this.hud.showAgent(null);
      return;
    }
    const agent =
      result.kind === 'vehicle'
        ? this.sim.vehicleSystem.vehicles[result.index]
        : this.sim.pedestrianSystem.pedestrians[result.index];
    // Se puede seleccionar a quien está dentro de un edificio (ver su ficha), pero
    // la cámara no lo sigue hasta dentro: solo se sigue a agentes a la vista.
    const insidePed = result.kind === 'pedestrian' && agent.state === 'inside';
    if (insidePed) this.rig.follow(null);
    else this.rig.follow(() => ({ x: agent.x, z: agent.z }), closeUp);
  }

  private applyBuildLayers(visibleLayers: Set<string>): void {
    for (const [id, objects] of Object.entries(this.buildObjects)) {
      const visible = visibleLayers.has(id);
      for (const obj of objects) obj.visible = visible;
    }
  }

  private focusBillboard(): void {
    if (!this.billboard) return;
    this.select(null);
    this.billboard.traverseAncestors((obj) => {
      obj.visible = true;
    });
    this.billboard.visible = true;

    const yaw = this.billboard.rotation.y;
    const frontX = Math.sin(yaw);
    const frontZ = Math.cos(yaw);
    const targetY = 12.6;
    const distance = 24;

    this.renderer.camera.position.set(
      this.billboard.position.x + frontX * distance,
      targetY + 0.4,
      this.billboard.position.z + frontZ * distance,
    );
    this.rig.controls.target.set(this.billboard.position.x, targetY, this.billboard.position.z);
    this.rig.controls.update();
  }

  private focusBuilding(b: import('../city/CityModel').Building): void {
    this.select(null);
    const faceX = b.faceX ?? 0;
    const faceZ = b.faceZ ?? 1;
    const targetY = Math.max(b.h * 0.5, 4);
    const distance = Math.max(b.w ?? 8, b.d ?? 8) * 1.8 + 12;
    this.renderer.camera.position.set(b.x + faceX * distance, targetY + 8, b.z + faceZ * distance);
    this.rig.controls.target.set(b.x, targetY, b.z);
    this.rig.controls.update();
  }

  private agentInfo(): AgentInfo | null {
    if (!this.selected) return null;
    if (this.selected.kind === 'vehicle') {
      const v: Vehicle = this.sim.vehicleSystem.vehicles[this.selected.index];
      const status =
        v.state === 'stopped'
          ? v.atLight
            ? 'Detenido en semáforo'
            : 'Detenido'
          : v.state === 'braking'
            ? 'Frenando'
            : 'Circulando';
      return {
        icon: '🚗',
        title: `Coche #${v.id + 1}`,
        status,
        detail: `${Math.round(v.v * 3.6)} km/h`,
      };
    }
    const p: Pedestrian = this.sim.pedestrianSystem.pedestrians[this.selected.index];
    const dest = p.building.name;
    const statusMap: Record<Pedestrian['state'], string> = {
      walking: `Caminando hacia ${dest}`,
      waiting: 'Esperando para cruzar',
      crossing: 'Cruzando la calle',
      entering: `Entrando en ${dest}`,
      exiting: `Saliendo a la calle`,
      inside: `Dentro de ${dest}`,
    };
    const energyPct = Math.round(p.energy);
    const status = p.sleeping ? 'Durmiendo' : statusMap[p.state];
    const detail = p.sleeping
      ? `Durmiendo · energía ${energyPct}%`
      : p.state === 'inside'
        ? `Energía ${energyPct}% · saldrá en ${Math.max(0, p.timer).toFixed(0)} s`
        : `Destino: ${dest} · energía ${energyPct}%`;
    return {
      icon: '🚶',
      title: `Peatón #${p.id + 1}`,
      status,
      detail,
      details: homeDetails(p),
      stats: BIG_FIVE.map((t) => ({ label: t.label, value: p.personality[t.id] })),
      actions: [{ id: 'go-home', label: '🏠 Ir a casa' }],
    };
  }

  /** Ejecuta una acción contextual sobre el peatón seleccionado. */
  private runAgentAction(id: string): void {
    if (!this.selected || this.selected.kind !== 'pedestrian') return;
    if (id === 'go-home') this.sim.pedestrianSystem.goHome(this.selected.index);
  }

  /** Utilidad de depuración: coloca la cámara mirando a un punto. */
  viewFrom(x: number, y: number, z: number, tx = 0, tz = 0): void {
    this.renderer.camera.position.set(x, y, z);
    this.rig.controls.target.set(tx, 1, tz);
  }

  /** Utilidad de depuración: selecciona un agente por tipo e índice. */
  debugSelect(kind: 'vehicle' | 'pedestrian' | null, index = 0): void {
    this.select(kind ? { kind, index } : null);
  }

  start(): void {
    const frame = (now: number) => {
      const realDt = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      this.fps += (1 / Math.max(realDt, 1e-4) - this.fps) * 0.05;

      const steps = this.clock.tick(realDt);
      for (let k = 0; k < steps; k++) {
        this.clock.advance();
        this.sim.step(this.clock.fixedDt, this.clock.time, this.dayNight.hour);
      }

      const alpha = this.clock.alpha;
      this.vehicleMesh.update(alpha);
      this.pedestrianMesh.update(alpha, now);
      this.customPedMesh.update(alpha, now, this.renderer.camera);
      // Puertas de calle: abrir las que algún peatón está cruzando este frame
      // (además del toggle manual del menú). El índice de puerta = building.id.
      this.doors.clearAuto();
      for (const ped of this.sim.pedestrianSystem.pedestrians) {
        if (ped.facadeDoorOpen) this.doors.setAuto(ped.building.id, true);
      }
      this.doors.update(realDt);
      this.lightMesh.update(this.clock.time);
      this.dayNight.update(this.clock.time);
      // Refrescar el reflejo del cielo de vez en cuando (el cielo cambia despacio).
      this.envTimer -= realDt;
      if (this.envTimer <= 0) {
        this.envTimer = 0.5;
        this.renderer.updateSkyEnvironment();
      }
      this.vehicleMesh.setHeadlightLevel(this.dayNight.nightLevel);
      this.rig.update(Math.min(realDt, 0.1));

      // Si el peatón seguido entra en un edificio, mantenemos la ficha (informativa).
      this.hudTimer -= realDt;
      if (this.hudTimer <= 0) {
        this.hudTimer = 0.25;
        this.hud.setStats(this.sim.stats(), this.fps, this.dayNight.clockText);
        this.hud.showAgent(this.agentInfo());
      }

      this.renderer.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

/**
 * Datos del hogar para la ficha. En apartamentos muestra el edificio y la
 * planta, más un código tipo postal (p. ej. "E16-3" = Edificio 16, planta 3;
 * "C8" = Casa 8).
 */
function homeDetails(p: Pedestrian): AgentDetail[] {
  const home = p.home;
  const apts = apartmentCount(home);
  const numMatch = home.name.match(/\d+/);
  const num = numMatch ? numMatch[0] : String(home.id);
  const prefix = (home.name.trim()[0] ?? 'X').toUpperCase();

  if (apts > 0 && p.homeUnit > 0) {
    return [
      { label: 'Clase', value: SOCIAL_CLASS_LABEL[p.socialClass] },
      { label: 'Edificio', value: home.name, focusHome: true },
      { label: 'Apartamento', value: `Planta ${p.homeUnit} de ${apts}` },
      { label: 'Código', value: `${prefix}${num}-${p.homeUnit}` },
    ];
  }
  return [
    { label: 'Clase', value: SOCIAL_CLASS_LABEL[p.socialClass] },
    { label: 'Hogar', value: home.name, focusHome: true },
    { label: 'Tipo', value: 'Casa' },
    { label: 'Código', value: `${prefix}${num}` },
  ];
}
