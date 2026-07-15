import { generateCity } from '../city/CityGenerator';
import { apartmentCount, DEFAULT_SHOP_HOURS, isOpenAt, type Building, type Furniture } from '../city/CityModel';
import { MARKET_SECTION_CATALOG } from '../city/buildings/interior/marketSections';
import { SPECIALTY_SHOPS, type SpecialtyShopKind } from '../city/buildings/shops/specialtyShops';
import type * as THREE from 'three';
import { CameraRig } from '../render/CameraRig';
import { buildCityMesh, type DoorAnimator, type SlidingDoorAnimator } from '../render/CityMesh';
import type { FloorLampController } from '../render/FloorLamps';
import type { ShopLights } from '../render/ShopLights';
import { DayNightCycle } from '../render/DayNightCycle';
import { Sky } from '../render/Sky';
import { PedestrianMesh } from '../render/PedestrianMesh';
import { SceneRenderer } from '../render/SceneRenderer';
import { TrafficLightMesh } from '../render/TrafficLightMesh';
import { VehicleMesh } from '../render/VehicleMesh';
import { Simulation } from '../sim/Simulation';
import type { Pedestrian, Vehicle } from '../sim/agents';
import { BIG_FIVE } from '../sim/personality';
import { taskDefs } from '../sim/routine/registry';
import { BOOST_CAP, type TaskCtx } from '../sim/routine/TaskDef';
import { SOCIAL_CLASS_LABEL } from '../sim/socialClass';
import { CustomPedestrianMesh } from '../render/CustomPedestrianMesh';
import { GhostPedestrian } from '../render/GhostPedestrian';
import { BuildPanel, type BuildPass } from '../ui/BuildPanel';
import { CameraPanel } from '../ui/CameraPanel';
import { CharacterCreator } from '../ui/CharacterCreator';
import { FridgePopup } from '../ui/FridgePopup';
import { Hud, type AgentDetail, type AgentInfo, type RoutineTaskInfo } from '../ui/Hud';
import { Picking, type PickResult } from '../ui/Picking';
import { RadialMenu } from '../ui/RadialMenu';
import { ActionRegistry } from '../interaction/ActionRegistry';
import { collectDoorInteractables, collectMarketDoorInteractables } from '../interaction/doorInteractables';
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
  private readonly ghost: GhostPedestrian;
  private readonly creator: CharacterCreator;
  private readonly lightMesh: TrafficLightMesh;
  private readonly dayNight: DayNightCycle;
  private readonly doors: DoorAnimator;
  private readonly marketDoors: SlidingDoorAnimator;
  private readonly floorLamps: FloorLampController;
  private readonly shopLights: ShopLights;
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
    this.marketDoors = city.marketDoors;
    this.floorLamps = city.floorLamps;
    this.shopLights = city.shopLights;
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
    this.ghost = new GhostPedestrian(this.sim.pedestrianSystem.pedestrians, this.pedestrianMesh, this.customPedMesh);
    this.lightMesh = new TrafficLightMesh(this.sim.lights, this.sim.model.roundabouts, [this.sim.model.park, ...this.sim.model.mergedBlocks]);
    this.renderer.scene.add(this.vehicleMesh.group, this.pedestrianMesh.group, this.customPedMesh.group, this.ghost.group, this.lightMesh.group);
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
      // Enlace de la ficha (p. ej. el trabajador de una tienda): selecciona y
      // sigue al peatón exactamente igual que al pulsarlo en la escena.
      onSelectPedestrian: (index) => {
        if (this.sim.pedestrianSystem.pedestrians[index]) this.select({ kind: 'pedestrian', index });
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
      city.layers.buildings,
      model.buildings,
      (result) => this.select(result),
    );

    // Menú radial contextual (clic derecho): objetos interactuables + sus acciones.
    const interactables = new InteractableRegistry();
    interactables.addAll(collectDoorInteractables(model));
    interactables.addAll(collectMarketDoorInteractables(model));
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
    actions.register('marketDoor', (interactable) => {
      const data = interactable.data as { buildingId?: number } | undefined;
      const buildingId = data?.buildingId;
      const open = typeof buildingId === 'number' && this.marketDoors.isOpen(buildingId);
      return [
        {
          id: 'toggle',
          label: open ? 'Cerrar' : 'Abrir',
          icon: '▯',
          run: () => {
            if (typeof buildingId === 'number') this.marketDoors.toggle(buildingId);
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
    const fridgePopup = new FridgePopup(hudRoot);
    actions.register('fridge', (interactable) => {
      const data = interactable.data as { building?: string; furniture?: Furniture } | undefined;
      const store = data?.furniture?.food;
      if (!store) return [];
      const title = data?.building ? `Nevera · ${data.building}` : 'Nevera';
      return [{ id: 'open', label: 'Abrir', icon: '🧊', run: () => fridgePopup.open(store, title) }];
    });
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
      this.ghost.setTarget(null);
      this.hud.showAgent(null);
      return;
    }
    // Tienda: solo ficha informativa (sin seguimiento de cámara ni silueta).
    if (result.kind === 'building') {
      this.ghost.setTarget(null);
      this.rig.follow(null);
      this.hud.showAgent(this.agentInfo());
      return;
    }
    // Al peatón seguido se le ve a través de la geometría (silueta punteada de
    // GhostPedestrian), así que la cámara le sigue también dentro de los edificios.
    if (result.kind === 'pedestrian') {
      const ped = this.sim.pedestrianSystem.pedestrians[result.index];
      this.ghost.setTarget(result.index);
      this.rig.follow(() => ({ x: ped.x, z: ped.z, y: ped.y }), closeUp);
    } else {
      const vehicle = this.sim.vehicleSystem.vehicles[result.index];
      this.ghost.setTarget(null);
      this.rig.follow(() => ({ x: vehicle.x, z: vehicle.z }), closeUp);
    }
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
    if (this.selected.kind === 'building') {
      const b = this.sim.model.buildings[this.selected.index];
      const open = this.sim.pedestrianSystem.shopOpen(b, this.dayNight.hour);
      return shopInfo(b, this.dayNight.hour, this.sim.pedestrianSystem.pedestrians, open);
    }
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
    const needs = `🍽️ ${Math.round(p.food)}% · 💧 ${Math.round(p.hydration)}% · 🧼 ${Math.round(p.hygiene)}%`;
    const status = p.eating ? 'Comiendo' : p.sleeping ? 'Durmiendo' : statusMap[p.state];
    const detail = p.sleeping
      ? `Durmiendo · energía ${energyPct}% · ${needs}`
      : p.state === 'inside'
        ? `Energía ${energyPct}% · ${needs} · saldrá en ${Math.max(0, p.timer).toFixed(0)} s`
        : `Destino: ${dest} · energía ${energyPct}% · ${needs}`;
    return {
      icon: '🚶',
      title: `Peatón #${p.id + 1}`,
      status,
      detail,
      details: [
        taskDetail(p),
        ...(p.workplace ? [{ label: 'Trabajo', value: p.workplace.name }] : []),
        ...homeDetails(p),
      ],
      routine: routineInfo(p, this.sim.pedestrianSystem.routineCtx(this.dayNight.hour)),
      stats: BIG_FIVE.map((t) => ({ label: t.label, value: p.personality[t.id] })),
      // "Comer" solo si está despierto (dormido no puede ir a comer).
      actions: [
        { id: 'go-home', label: '🏠 Ir a casa' },
        ...(p.sleeping ? [] : [{ id: 'eat', label: '🍽️ Comer' }]),
      ],
    };
  }

  /** Ejecuta una acción contextual sobre el peatón seleccionado (las tiendas no tienen). */
  private runAgentAction(id: string): void {
    if (!this.selected || this.selected.kind !== 'pedestrian') return;
    if (id === 'go-home') this.sim.pedestrianSystem.goHome(this.selected.index);
    else if (id === 'eat') this.sim.pedestrianSystem.goEat(this.selected.index);
  }

  /** Utilidad de depuración/demo: fuerza una lluvia de barro unos segundos de sim. */
  mudRain(seconds = 10): void {
    this.sim.weather.forceMudRain(this.clock.time, seconds);
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
      this.ghost.update();
      // Puertas de calle: abrir las que algún peatón está cruzando este frame
      // (además del toggle manual del menú). El índice de puerta = building.id.
      // Las correderas de supermercado usan la misma señal (`setAuto` no hace
      // nada si `building.id` no es un supermercado, ver `SlidingDoorAnimator`).
      this.doors.clearAuto();
      this.marketDoors.clearAuto();
      for (const ped of this.sim.pedestrianSystem.pedestrians) {
        if (ped.facadeDoorOpen) {
          this.doors.setAuto(ped.building.id, true);
          this.marketDoors.setAuto(ped.building.id, true);
        }
      }
      this.doors.update(realDt);
      this.marketDoors.update(realDt);
      this.lightMesh.update(this.clock.time);
      this.dayNight.update(this.clock.time);
      // Luces de los comercios: encendidas solo con la tienda ABIERTA de verdad
      // (en horario y con su trabajador en el puesto).
      this.shopLights.update((b) => this.sim.pedestrianSystem.shopOpen(b, this.dayNight.hour));
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

/** Etiquetas legibles de las fases internas de las tareas. */
const PHASE_LABEL: Record<string, string> = {
  ir: 'yendo',
  comiendo: 'comiendo',
  comprando: 'comprando',
  volver: 'volviendo a casa',
  aproxima: 'acercándose',
  accion: 'en ello',
  vuelve: 'terminando',
};

/** Estados de tarea en texto legible (el resto se muestran tal cual). */
const STATE_LABEL: Record<string, string> = { activa: 'en curso' };

/**
 * Rutina del peatón formateada y ORDENADA para el panel: primero la tarea en
 * curso, después las pendientes por puntuación actual (la subasta tal cual),
 * y al final las ya hechas y las fallidas del día.
 */
function routineInfo(p: Pedestrian, ctx: TaskCtx): RoutineTaskInfo[] {
  const order: Record<string, number> = { activa: 0, pendiente: 1, hecha: 2, fallida: 3 };
  const items = p.routine.tasks.map((t) => {
    const def = taskDefs[t.kind];
    const score = p.routine.score(t, p, ctx, t.state === 'activa');
    const parts: string[] = [];
    if (t.state === 'activa' || t.state === 'pendiente') {
      parts.push(`base ${def.base}`);
      const urg = def.urgency(t, p, ctx);
      if (urg >= 0.5) parts.push(`urgencia +${Math.round(urg)}`);
      const boost = Math.min(t.boost, BOOST_CAP);
      if (boost > 0) parts.push(`boost +${Math.round(boost)}`);
      if (t.stimulus >= 0.5) parts.push(`estímulo +${Math.round(t.stimulus)}`);
      const bias = def.bias?.(p.personality) ?? 0;
      if (Math.abs(bias) >= 0.5) parts.push(`carácter ${bias > 0 ? '+' : ''}${Math.round(bias)}`);
    }
    if (t.misses > 0) parts.push(`pospuesta ×${t.misses}`);
    const phase = (t.data as { phase?: string }).phase;
    if (t.state === 'activa' && phase) parts.push(PHASE_LABEL[phase] ?? phase);
    return {
      ord: order[t.state] ?? 4,
      info: {
        icon: def.icon,
        label: def.describe(t),
        state: STATE_LABEL[t.state] ?? t.state,
        stateClass: t.state,
        window: t.window ? `${hourText(t.window.start)}–${hourText(t.window.end)}` : null,
        score,
        detail: parts.join(' · '),
      },
    };
  });
  items.sort((a, b) => a.ord - b.ord || (b.info.score ?? -1) - (a.info.score ?? -1));
  return items.map((it) => it.info);
}

/** Icono de ficha por gremio de tienda. */
const SHOP_ICONS: Record<string, string> = {
  fruteria: '🍏',
  carniceria: '🥩',
  pescaderia: '🐟',
  ropa: '👕',
  farmacia: '💊',
  electronica: '📺',
  libreria: '📚',
  supermarket: '🛒',
  generic: '🏪',
};

/**
 * Ficha de una tienda para el panel del HUD (espejo de la de los peatones).
 * `open` viene de la SIM (`shopOpen`): en horario Y con el trabajador en su
 * puesto — a la hora de abrir, si el dependiente aún está de camino, la tienda
 * sigue "Cerrada · esperando al trabajador". Se refresca con el mismo
 * temporizador que la ficha de agentes, así el estado cambia en vivo.
 */
function shopInfo(b: Building, hour: number, pedestrians: Pedestrian[], open: boolean): AgentInfo {
  const hours = b.hours ?? DEFAULT_SHOP_HOURS;
  const enHorario = isOpenAt(hours, hour);
  const horario = `${hourText(hours.open)}–${hourText(hours.close)}`;
  let inside = 0;
  for (const p of pedestrians) if (p.state === 'inside' && p.building.id === b.id) inside++;
  const worker = pedestrians.find((p) => p.workplace === b) ?? null;

  const kind = b.shopKind ?? 'generic';
  const tipo =
    kind === 'supermarket' ? 'Supermercado' : kind === 'generic' ? 'Tienda' : SPECIALTY_SHOPS[kind as SpecialtyShopKind].label;
  // Secciones únicas del interior, con su etiqueta legible.
  const secciones = [...new Set((b.marketInterior?.furniture ?? []).flatMap((f) => f.sections ?? []))].map(
    (s) => MARKET_SECTION_CATALOG[s].label,
  );

  const status = open
    ? `Abierto · cierra a las ${hourText(hours.close)}`
    : enHorario && worker
      ? 'Cerrado · esperando al trabajador'
      : `Cerrado · abre a las ${hourText(hours.open)}`;
  return {
    icon: SHOP_ICONS[kind] ?? '🏪',
    title: b.name,
    status,
    detail: `Horario: ${horario}${inside > 0 ? ` · ${inside} ${inside === 1 ? 'persona' : 'personas'} dentro` : ''}`,
    details: [
      { label: 'Tipo', value: tipo },
      { label: 'Horario', value: horario },
      { label: 'Estado', value: open ? 'Abierto' : 'Cerrado' },
      // Enlace: pulsar el trabajador lo selecciona y lo sigue (el id coincide
      // con el índice del array: se asignan secuencialmente y nunca se reordena).
      worker ? { label: 'Trabajador', value: `Peatón #${worker.id + 1}`, selectPed: worker.id } : { label: 'Trabajador', value: '—' },
      { label: 'Gente dentro', value: String(inside) },
      ...(secciones.length ? [{ label: 'Secciones', value: secciones.join(', ') }] : []),
    ],
  };
}

/** "13.5" → "13:30". */
function hourText(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Fila "Tarea" de la ficha: la tarea de rutina en curso del peatón. */
function taskDetail(p: Pedestrian): AgentDetail {
  const act = p.routine.active;
  if (!act) return { label: 'Tarea', value: '—' };
  const def = taskDefs[act.kind];
  return { label: 'Tarea', value: `${def.icon} ${def.describe(act)}` };
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
