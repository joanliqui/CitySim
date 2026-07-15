import { apartmentCount, isOpenAt, lerpAngle, type Building, type CityModel, type Furniture } from '../city/CityModel';
import { buildingFactories } from '../city/buildings/registry';
import {
  floorSurfaceY,
  interiorStandPoint,
  officeShaft,
  stairWaypoints,
  type StairPoint,
} from '../city/buildings/interior/stairGeometry';
import { interiorWalkPath } from '../city/buildings/interior/interiorNav';
import type { PathStep, SidewalkGraph } from '../city/SidewalkGraph';
import { Rng } from '../core/Rng';
import { simHours } from '../core/time';
import type { Leg, Pedestrian } from './agents';
import { FOOD_CATALOG, FOOD_KINDS } from '../city/food/FoodTypes';
import { addFood, freeSpace, usedSpace, type FridgeStore } from '../city/food/Fridge';
import { drainNeed, FOOD, HYDRATION, HYGIENE } from './needs';
import { DEFAULT_PERSONALITY, randomPersonality, type Personality } from './personality';
import { Routine } from './routine/Routine';
import { ensureShopping, planDay } from './routine/RoutinePlanner';
import { taskDefs } from './routine/registry';
import { INTERRUPT_MARGIN, type FurniturePoint, type RoutineHost, type TaskCtx } from './routine/TaskDef';
import { hash01, makeTask, type RoutineTask } from './routine/TaskTypes';
import type { Weather } from './weather';
import {
  drainRate,
  isNight,
  isWakeUpTime,
  RECLINE_TIME,
  recoverRate,
  sleepAt,
} from './sleep';
import { SOCIAL_CLASS_SHARE, SOCIAL_CLASSES, type SocialClass } from './socialClass';
import type { TrafficLightSystem } from './TrafficLightSystem';

/** Altura de la superficie del colchón sobre el suelo de la planta (ver `addBed`). */
const MATTRESS_TOP = 0.52;

/** Una vivienda concreta: una casa (`unit` 0) o un apartamento (`unit` = planta 1..N). */
interface Dwelling {
  building: Building;
  unit: number;
}

/** Resultado del reparto: a qué vivienda y con qué clase social va un peatón. */
interface HomeAssignment {
  home: Building;
  homeUnit: number;
  socialClass: SocialClass;
}

/** Umbral de alimentación por debajo del cual el peatón despierto va a comer. */
const EAT_THRESHOLD = 60;
/** Segundos para acercarse a la nevera / volver al sitio (anima `eatApproach`). */
const EAT_MOVE_TIME = 0.8;
/** Duración del acto de comer una vez frente a la nevera (≈ 12 min de sim). */
const EAT_TIME = simHours(0.2);

const CROSS_SPEED = 2.4; // los peatones cruzan con prisa
const CORNER_BLEND = 2.2; // metros suavizados alrededor de cada giro
const DOOR_LEG_MIN = 0.8; // longitud mínima del tramo puerta→fachada
const INSIDE_DEPTH = 1.6; // cuánto entra hacia dentro en edificios sin interior (m)

/** Higiene a la que te deja una lluvia de barro si te pilla en la calle. */
const MUD_HYGIENE = 8;
/** Segundos entre re-chequeos de rutina mientras se va por la calle. */
const STREET_DECIDE_EVERY = 2;
/** Sin tarea activa por la calle, solo una urgencia de verdad arranca una nueva. */
const STREET_URGENT_SCORE = 60;
/** Nivel al que se rellena la nevera al volver de la compra. */
const RESTOCK_FILL = 0.9;

export class PedestrianSystem implements RoutineHost {
  readonly pedestrians: Pedestrian[] = [];
  private readonly rng: Rng;
  /** Inventario barajado de viviendas: casas (1 por edificio) y apartamentos (1 por planta). */
  private readonly casas: Dwelling[] = [];
  private readonly apts: Dwelling[] = [];
  /** Viviendas ya ocupadas (clave `edificio:planta`): cada una alberga a un solo peatón. */
  private readonly taken = new Set<string>();
  /** Supermercados de la ciudad (destinos de la tarea "hacer la compra"). */
  private readonly markets: Building[];
  /** Plantilla de cada tienda (un trabajador por caja registradora). */
  private readonly workersOf = new Map<Building, Pedestrian[]>();
  /** Día de sim (avanza al detectar el wrap de la hora) y última hora vista. */
  private day = 0;
  private lastHour: number | null = null;

  constructor(
    private readonly model: CityModel,
    private readonly graph: SidewalkGraph,
    private readonly lights: TrafficLightSystem,
    private readonly weather: Weather,
    count: number,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.markets = model.buildings.filter((b) => b.shopKind === 'supermarket');
    this.buildInventory();
    // Reparto único de viviendas por clase social (precalculado antes del bucle).
    const plan = this.assignHomes(count);
    // Puestos de trabajo: cada tienda emplea tantos peatones como CAJAS
    // registradoras tiene su interior (mínimo 1) — en el súper, un trabajador
    // por caja. El reparto es secuencial (los primeros peatones se llevan los
    // puestos) y el resto, de momento, no trabaja.
    const jobs: { shop: Building; slot: number }[] = [];
    for (const b of model.buildings) {
      if (b.type !== 'shop') continue;
      const cajas = b.marketInterior?.furniture.filter((f) => f.kind === 'checkout').length ?? 0;
      for (let slot = 0; slot < Math.max(1, cajas); slot++) jobs.push({ shop: b, slot });
    }
    for (let id = 0; id < count; id++) {
      const { home, homeUnit, socialClass } = plan[id];
      // Empiezan en casa: el hogar es también su primer edificio actual.
      const building = home;
      // Visibles dentro de casa desde el arranque (en su estancia / planta).
      const spot = this.standTarget(home, homeUnit, true);
      const ped: Pedestrian = {
        id,
        state: 'inside',
        legs: [],
        legIdx: 0,
        s: 0,
        walkSpeed: this.rng.range(1.15, 1.85),
        lateral: this.rng.range(-1, 1),
        colorIdx: this.rng.int(0, 8),
        personality: randomPersonality(this.rng),
        socialClass,
        home,
        homeUnit,
        workplace: jobs[id]?.shop,
        workSlot: jobs[id]?.slot,
        building,
        // Estancia inicial en casa (hasta ~1.4 h de sim, escalonada).
        timer: this.rng.range(simHours(0.05), simHours(1.4)),
        energy: this.rng.range(70, 100),
        food: this.rng.range(60, 100),
        hydration: this.rng.range(60, 100),
        // Jitter por id (no consume el Rng: preserva el orden existente de consumo).
        hygiene: 55 + hash01(id ^ 0x8517) * 45,
        routine: new Routine(),
        decideT: 0.5 + hash01(id ^ 0x3d1) * STREET_DECIDE_EVERY,
        sleeping: false,
        eating: false,
        wantsToEat: false,
        eatTimer: 0,
        eatApproach: 0,
        recline: 0,
        prevRecline: 0,
        facadeDoorOpen: false,
        x: spot.x,
        z: spot.z,
        y: spot.y,
        heading: 0,
        scale: 1,
        prevX: spot.x,
        prevZ: spot.z,
        prevY: spot.y,
        prevHeading: 0,
        prevScale: 1,
      };
      this.pedestrians.push(ped);
      if (ped.workplace) {
        const staff = this.workersOf.get(ped.workplace) ?? [];
        staff.push(ped);
        this.workersOf.set(ped.workplace, staff);
      }
      planDay(ped.routine, ped, this.day, this);
    }
  }

  /** Plantilla de una tienda, en orden de caja (slot 0..N-1). */
  workersAt(b: Building): readonly Pedestrian[] {
    return this.workersOf.get(b) ?? [];
  }

  /** ¿Está el peatón en su puesto (fase `trabajando` de su tarea)? */
  isAtPost(ped: Pedestrian): boolean {
    const act = ped.routine.active;
    return act?.kind === 'trabajar' && (act.data as { phase?: string }).phase === 'trabajando';
  }

  /**
   * ¿Está la tienda ABIERTA? No basta con el horario: hasta que ALGUIEN de la
   * plantilla no está en su puesto, la tienda sigue cerrada (con varios
   * trabajadores basta uno; el resto de cajas van abriendo al llegar cada uno).
   * Las tiendas sin plantilla (si las hubiera) siguen solo el horario.
   */
  shopOpen(b: Building, hour: number): boolean {
    if (!b.hours || !isOpenAt(b.hours, hour)) return false;
    const staff = this.workersOf.get(b);
    if (!staff || staff.length === 0) return true;
    return staff.some((w) => this.isAtPost(w));
  }

  /**
   * Añade un peatón extra en caliente (personaje creado por el usuario).
   * Siempre se añade AL FINAL del array, así los índices existentes (picking,
   * mallas instanciadas) no se mueven. Sale de un edificio inmediatamente.
   * Devuelve su índice.
   */
  spawnCustom(personality: Personality = { ...DEFAULT_PERSONALITY }): number {
    const socialClass = this.pickClass();
    const { home, homeUnit } = this.takeDwelling(socialClass);
    const building = home;
    const spot = this.standTarget(home, homeUnit, true);
    const ped: Pedestrian = {
      id: this.pedestrians.length,
      state: 'inside',
      legs: [],
      legIdx: 0,
      s: 0,
      walkSpeed: this.rng.range(1.15, 1.85),
      lateral: this.rng.range(-1, 1),
      colorIdx: 0,
      personality,
      socialClass,
      home,
      homeUnit,
      building,
      timer: 1,
      energy: this.rng.range(70, 100),
      food: this.rng.range(60, 100),
      hydration: this.rng.range(60, 100),
      hygiene: 55 + hash01(this.pedestrians.length ^ 0x8517) * 45,
      routine: new Routine(),
      decideT: 1,
      sleeping: false,
      eating: false,
      wantsToEat: false,
      eatTimer: 0,
      eatApproach: 0,
      recline: 0,
      prevRecline: 0,
      facadeDoorOpen: false,
      x: spot.x,
      z: spot.z,
      y: spot.y,
      heading: 0,
      scale: 1,
      prevX: spot.x,
      prevZ: spot.z,
      prevY: spot.y,
      prevHeading: 0,
      prevScale: 1,
    };
    this.pedestrians.push(ped);
    planDay(ped.routine, ped, this.day, this);
    if (this.plan(ped)) {
      ped.state = 'exiting';
    }
    return this.pedestrians.length - 1;
  }

  /**
   * Reencamina al peatón hacia su hogar. Si está dentro de un edificio sale por
   * la puerta; si va por la calle reencamina desde el tramo de acera más
   * cercano. Devuelve false si ya está en casa o no hay ruta.
   */
  goHome(index: number): boolean {
    const ped = this.pedestrians[index];
    if (!ped) return false;
    // La orden del usuario prevalece: la tarea en curso vuelve a pendiente.
    if (ped.routine.active) ped.routine.release(ped.routine.active);
    if (ped.state === 'inside' && ped.building === ped.home) return false; // ya está en casa

    if (ped.state === 'inside') {
      // Sale por la puerta de su edificio actual y camina a casa.
      if (!this.planTo(ped, ped.building, ped.home)) return false;
      ped.state = 'exiting';
      return true;
    }

    return this.walkHome(ped);
  }

  /**
   * Ordena al peatón ir a comer a la nevera de su casa, aunque no tenga hambre.
   * Solo si está despierto. Si ya está en casa, comerá en el próximo paso; si no,
   * se encamina a casa y come al llegar. Devuelve false si está dormido.
   */
  goEat(index: number): boolean {
    const ped = this.pedestrians[index];
    if (!ped || ped.sleeping) return false;
    if (ped.eating) return true; // ya está comiendo
    // La orden del usuario prevalece sobre la tarea en curso (salvo si ya es comer).
    if (ped.routine.active && ped.routine.active.kind !== 'comer') ped.routine.release(ped.routine.active);
    ped.wantsToEat = true;
    // Si no está dentro de su casa, encamínalo; `stepInside` lo hará comer al llegar.
    if (!(ped.state === 'inside' && ped.building === ped.home)) return this.goHome(index);
    return true;
  }

  /** Reencamina a un peatón que va por la calle hacia su hogar desde su posición. */
  private walkHome(ped: Pedestrian): boolean {
    return this.walkTo(ped, ped.home);
  }

  /** Reencamina a un peatón que va por la calle hacia `to` desde su posición. */
  private walkTo(ped: Pedestrian, to: Building): boolean {
    const startNode = this.graph.nearestNode(ped.x, ped.z);
    const steps = this.graph.findPath(startNode, to.doorNode);
    if (!steps) return false;
    const start = this.graph.nodes[startNode];
    const legs: Leg[] = [makeLeg(ped.x, ped.z, start.x, start.z, 'walk')];
    this.appendWalkLegs(legs, startNode, steps);
    this.appendEntryLegs(legs, ped, to);
    ped.legs = legs;
    ped.legIdx = 0;
    ped.s = 0;
    ped.y = 0;
    ped.building = to;
    ped.state = 'walking';
    return true;
  }

  /**
   * Contexto de rutina para consultas externas (HUD): puntuar tareas requiere
   * la hora, el día y el host — el día es interno de este sistema.
   */
  routineCtx(hour: number): TaskCtx {
    return { hour, day: this.day, host: this };
  }

  /* ── RoutineHost: lo que las tareas de rutina pueden pedirle al sistema ─── */

  atHome(ped: Pedestrian): boolean {
    return ped.state === 'inside' && ped.building === ped.home;
  }

  isInside(ped: Pedestrian, b: Building): boolean {
    return ped.state === 'inside' && ped.building === b;
  }

  /** Encamina hacia `b` desde donde esté (dentro o por la calle). */
  routeTo(ped: Pedestrian, b: Building): boolean {
    if (ped.state === 'inside') {
      if (ped.building === b) return true;
      if (!this.planTo(ped, ped.building, b)) return false;
      ped.state = 'exiting';
      return true;
    }
    // Por la calle (andando, esperando o cruzando) se puede reencaminar; en
    // tramos interiores (exiting/entering) no: se espera a que salga.
    if (ped.state === 'walking' || ped.state === 'waiting' || ped.state === 'crossing') {
      return this.walkTo(ped, b);
    }
    return false;
  }

  /** El "pasear" clásico: salir a un edificio aleatorio (pesos por tipo y cercanía). */
  wander(ped: Pedestrian): boolean {
    if (ped.state !== 'inside') return false;
    if (!this.plan(ped)) return false;
    ped.state = 'exiting';
    return true;
  }

  requestEat(ped: Pedestrian): void {
    ped.wantsToEat = true;
  }

  /** Supermercado más cercano al hogar del peatón. */
  market(ped: Pedestrian): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const m of this.markets) {
      const d = Math.hypot(m.door.x - ped.home.door.x, m.door.z - ped.home.door.z);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  /** Fracción de llenado de la nevera de casa [0..1]; null si no hay nevera. */
  fridgeFill(ped: Pedestrian): number | null {
    const target = this.fridgeTarget(ped.home, ped.homeUnit);
    if (!target) return null;
    return target.store.capacity > 0 ? usedSpace(target.store) / target.store.capacity : 0;
  }

  /** Guarda la compra: rellena la nevera hasta ~RESTOCK_FILL de su capacidad. */
  restockFridge(ped: Pedestrian): void {
    const target = this.fridgeTarget(ped.home, ped.homeUnit);
    if (!target) return;
    const store = target.store;
    while (usedSpace(store) < store.capacity * RESTOCK_FILL) {
      const space = freeSpace(store);
      const fit = FOOD_KINDS.filter((k) => FOOD_CATALOG[k].size <= space);
      if (fit.length === 0) break;
      addFood(store, this.rng.pick(fit));
    }
  }

  /** Punto frente a (o dentro de) el primer mueble del hogar de los tipos dados. */
  homeFurniture(ped: Pedestrian, kinds: readonly string[], standOff: number): FurniturePoint | null {
    const { furniture, yBase } = this.homeFurnishings(ped.home, ped.homeUnit);
    if (!furniture) return null;
    for (const kind of kinds) {
      const f = furniture.find((it) => it.kind === kind);
      if (!f) continue;
      if (standOff > 0) {
        // Plantado frente al mueble, mirándolo.
        return {
          x: f.x + f.faceX * standOff,
          z: f.z + f.faceZ * standOff,
          y: yBase,
          heading: Math.atan2(-f.faceX, -f.faceZ),
        };
      }
      // Dentro del mueble (p. ej. el plato de la ducha), mirando hacia fuera.
      return { x: f.x, z: f.z, y: yBase, heading: Math.atan2(f.faceX, f.faceZ) };
    }
    return null;
  }

  homeStand(ped: Pedestrian): { x: number; z: number; y: number } {
    return this.standTarget(ped.home, ped.homeUnit, true);
  }

  /**
   * Puesto de trabajo: de pie DETRÁS del mostrador de caja de su tienda, en el
   * lado de la CARA del mueble (la cara marca el lado de la trabajadora; el
   * cliente queda en el opuesto — convención compartida con el súper, donde la
   * cara mira a la fachada, y con las tiendas de gremio, donde mira al interior
   * o a la pared en el mostrador rotado de los locales estrechos). Mira hacia
   * el lado del cliente.
   */
  workSpot(ped: Pedestrian): FurniturePoint | null {
    const b = ped.workplace;
    const f = b?.marketInterior?.furniture.find((it) => it.kind === 'checkout');
    if (!b || !f) return null;
    // Extensión del mostrador en su eje de flujo (hacia la fachada).
    const flow = Math.abs(f.faceX) > 0.5 ? f.w : f.d;
    const off = flow / 2 + 0.45;
    return {
      x: f.x + f.faceX * off,
      z: f.z + f.faceZ * off,
      y: 0,
      heading: Math.atan2(-f.faceX, -f.faceZ),
    };
  }

  /**
   * Construye el inventario de viviendas a partir del modelo: cada casa aporta una
   * vivienda (`unit` 0) y cada edificio alto, una por planta (`unit` 1..N). Las dos
   * listas se barajan para que el reparto posterior no siga el orden de la ciudad.
   */
  private buildInventory(): void {
    for (const b of this.model.buildings) {
      if (b.type === 'house') {
        this.casas.push({ building: b, unit: 0 });
      } else {
        const apts = apartmentCount(b);
        for (let u = 1; u <= apts; u++) this.apts.push({ building: b, unit: u });
      }
    }
    this.shuffle(this.casas);
    this.shuffle(this.apts);
  }

  /**
   * Reparte una vivienda única a cada peatón según su clase social:
   *  - `alta`   vive en casas; `obrera` en apartamentos; `media` en cualquiera.
   * Se asigna primero a alta y obrera (solo encajan en un tipo) y por último a la
   * clase media, que rellena lo que quede en ambos tipos.
   */
  private assignHomes(count: number): HomeAssignment[] {
    const classes = this.buildClassList(count);
    const out = new Array<HomeAssignment>(count);
    for (const cls of ['alta', 'obrera', 'media'] as SocialClass[]) {
      for (let i = 0; i < count; i++) {
        if (classes[i] === cls) out[i] = this.takeDwelling(cls);
      }
    }
    return out;
  }

  /**
   * Lista de clases sociales para `count` peatones siguiendo la pirámide
   * (`SOCIAL_CLASS_SHARE`), con conteos exactos y orden barajado.
   */
  private buildClassList(count: number): SocialClass[] {
    const alta = Math.round(count * SOCIAL_CLASS_SHARE.alta);
    const media = Math.round(count * SOCIAL_CLASS_SHARE.media);
    const obrera = Math.max(0, count - alta - media);
    const list: SocialClass[] = [
      ...Array<SocialClass>(alta).fill('alta'),
      ...Array<SocialClass>(media).fill('media'),
      ...Array<SocialClass>(obrera).fill('obrera'),
    ];
    this.shuffle(list);
    return list;
  }

  /** Tipo de vivienda preferido por clase: la obrera prioriza apartamentos; el resto, casas. */
  private poolsFor(cls: SocialClass): Dwelling[][] {
    return cls === 'obrera' ? [this.apts, this.casas] : [this.casas, this.apts];
  }

  /**
   * Toma (y marca como ocupada) una vivienda libre para la clase `cls`. Si su tipo
   * preferido se ha agotado, usa el otro. Si no queda ninguna libre (más peatones
   * que viviendas), comparte una existente para no dejar al peatón sin hogar.
   */
  private takeDwelling(cls: SocialClass): HomeAssignment {
    const pools = this.poolsFor(cls);
    for (const pool of pools) {
      for (const d of pool) {
        const k = `${d.building.id}:${d.unit}`;
        if (!this.taken.has(k)) {
          this.taken.add(k);
          return { home: d.building, homeUnit: d.unit, socialClass: cls };
        }
      }
    }
    // Sin viviendas libres: reutiliza una (o cae a cualquier edificio si no hay residenciales).
    const overflow = pools.find((p) => p.length > 0)?.[0];
    const home = overflow ? overflow.building : this.pickBuilding(null);
    return { home, homeUnit: overflow ? overflow.unit : 0, socialClass: cls };
  }

  /** Elige una clase social al azar según la pirámide de población. */
  private pickClass(): SocialClass {
    const i = this.rng.weighted([SOCIAL_CLASS_SHARE.alta, SOCIAL_CLASS_SHARE.media, SOCIAL_CLASS_SHARE.obrera]);
    return SOCIAL_CLASSES[i];
  }

  /** Baraja in situ con el RNG seeded (Fisher–Yates), para no usar `Math.random`. */
  private shuffle<T>(arr: T[]): void {
    for (let k = arr.length - 1; k > 0; k--) {
      const r = this.rng.int(0, k + 1);
      [arr[k], arr[r]] = [arr[r], arr[k]];
    }
  }

  /** Los destinos favorecen a las tiendas y, sobre todo, a lo que queda cerca. */
  private pickBuilding(exclude: Building | null): Building {
    const weights = this.model.buildings.map((b) => {
      if (b === exclude) return 0;
      const typeW = buildingFactories[b.type].pedestrianWeight;
      if (!exclude) return typeW;
      // Penaliza la distancia: la mayoría de los viajes son de barrio.
      const dist = Math.hypot(b.door.x - exclude.door.x, b.door.z - exclude.door.z);
      return typeW / (1 + (dist / 70) ** 2);
    });
    return this.model.buildings[this.rng.weighted(weights)];
  }

  /** Construye una ruta puerta a puerta hacia un destino aleatorio. */
  private plan(ped: Pedestrian): boolean {
    return this.planTo(ped, ped.building, this.pickBuilding(ped.building));
  }

  /** Construye la lista de piernas: interior→puerta → acera/cruces → puerta→interior. */
  private planTo(ped: Pedestrian, from: Building, to: Building): boolean {
    if (from === to) return false;
    const steps = this.graph.findPath(from.doorNode, to.doorNode);
    if (!steps || steps.length === 0) return false;

    const legs: Leg[] = [];
    this.prependExitLegs(legs, ped, from);
    this.appendWalkLegs(legs, from.doorNode, steps);
    this.appendEntryLegs(legs, ped, to);

    ped.legs = legs;
    ped.legIdx = 0;
    ped.s = 0;
    ped.building = to;
    return true;
  }

  /**
   * Punto donde el peatón se queda de pie dentro de un edificio:
   *  - su propio apartamento (edificio alto): centro de su vivienda, en su planta;
   *  - casa con interior: centro de la estancia mayor, planta baja;
   *  - resto (tienda / caja maciza): un poco hacia dentro desde la fachada.
   */
  private standTarget(b: Building, homeUnit: number, isHome: boolean): StairPoint {
    if (b.officeInterior && isHome && homeUnit > 0) {
      const dwelling = b.officeInterior.dwellings[homeUnit - 1];
      if (dwelling) {
        const sp = interiorStandPoint(dwelling);
        return { x: sp.x, z: sp.z, y: floorSurfaceY(homeUnit, b.officeInterior.floorH) };
      }
    }
    if (b.interior) {
      const sp = interiorStandPoint(b.interior);
      return { x: sp.x, z: sp.z, y: 0 };
    }
    // Sin interior: un punto hacia dentro desde la fachada (faceX/Z apunta a la calle).
    return { x: b.approach.x - b.faceX * INSIDE_DEPTH, z: b.approach.z - b.faceZ * INSIDE_DEPTH, y: 0 };
  }

  /**
   * Piernas de ENTRADA al destino `to`: cruza el umbral y camina hasta su punto
   * interior. Si `to` es su apartamento, sube por las escaleras planta a planta.
   */
  private appendEntryLegs(legs: Leg[], ped: Pedestrian, to: Building): void {
    // door-in: de la puerta (acera) a la aproximación junto a la fachada.
    legs.push(makeLeg(to.door.x, to.door.z, to.approach.x, to.approach.z, 'door-in'));
    const target = this.standTarget(to, ped.homeUnit, to === ped.home);
    const isApartment = !!to.officeInterior && to === ped.home && ped.homeUnit > 0;

    if (isApartment) {
      const oi = to.officeInterior!;
      const shaft = officeShaft(to, oi.core);
      // De la aproximación al arranque de la escalera (rellano de planta baja).
      let prev: StairPoint = { x: to.approach.x, z: to.approach.z, y: 0 };
      for (let f = 1; f <= ped.homeUnit; f++) {
        const wp = stairWaypoints(shaft, oi.floorH, f);
        // El primer punto (rellano de la planta inferior) se enlaza desde `prev`.
        pushPath(legs, [prev, ...wp], f === 1 ? 'enter' : 'stairs', 'stairs');
        prev = wp[wp.length - 1];
      }
      // Del rellano superior a la vivienda, navegando por el interior.
      const dwelling = oi.dwellings[ped.homeUnit - 1];
      const unitPath = dwelling
        ? interiorWalkPath(dwelling, prev.x, prev.z, target.x, target.z)
        : [{ x: target.x, z: target.z }];
      let unitPrev = prev;
      for (let k = 0; k < unitPath.length; k++) {
        const wp = unitPath[k];
        legs.push(makeLeg(unitPrev.x, unitPrev.z, wp.x, wp.z, 'unit', unitPrev.y, target.y));
        unitPrev = { x: wp.x, z: wp.z, y: target.y };
      }
      return;
    }

    // Planta baja: navega por el interior respetando paredes y puertas.
    if (to.interior) {
      const path = interiorWalkPath(to.interior, to.approach.x, to.approach.z, target.x, target.z);
      let prevPt = { x: to.approach.x, z: to.approach.z };
      for (let k = 0; k < path.length; k++) {
        const wp = path[k];
        const toY = k === path.length - 1 ? target.y : 0;
        legs.push(makeLeg(prevPt.x, prevPt.z, wp.x, wp.z, 'enter', 0, toY));
        prevPt = wp;
      }
    } else {
      legs.push(makeLeg(to.approach.x, to.approach.z, target.x, target.z, 'enter', 0, target.y));
    }
  }

  /**
   * Piernas de SALIDA desde el edificio `from` donde el peatón está dentro: de su
   * punto interior a la calle. Si era su apartamento, baja por las escaleras.
   */
  private prependExitLegs(legs: Leg[], ped: Pedestrian, from: Building): void {
    const target = this.standTarget(from, ped.homeUnit, from === ped.home);
    const isApartment = !!from.officeInterior && from === ped.home && ped.homeUnit > 0;

    if (isApartment) {
      const oi = from.officeInterior!;
      const shaft = officeShaft(from, oi.core);
      // De la vivienda al rellano de su planta, navegando por el interior.
      const topWp = stairWaypoints(shaft, oi.floorH, ped.homeUnit);
      const top = topWp[topWp.length - 1];
      const exitDwelling = oi.dwellings[ped.homeUnit - 1];
      const unitExitPath = exitDwelling
        ? interiorWalkPath(exitDwelling, target.x, target.z, top.x, top.z)
        : [{ x: top.x, z: top.z }];
      let unitExitPrev = { x: target.x, z: target.z };
      for (let k = 0; k < unitExitPath.length; k++) {
        const wp = unitExitPath[k];
        legs.push(makeLeg(unitExitPrev.x, unitExitPrev.z, wp.x, wp.z, 'unit', target.y, top.y));
        unitExitPrev = wp;
      }
      // Baja planta a planta (waypoints invertidos).
      for (let f = ped.homeUnit; f >= 1; f--) {
        const wp = stairWaypoints(shaft, oi.floorH, f).slice().reverse();
        pushPath(legs, wp, 'stairs', 'stairs');
      }
      // Del rellano de planta baja a la puerta de calle.
      const base = stairWaypoints(shaft, oi.floorH, 1)[0];
      legs.push(makeLeg(base.x, base.z, from.approach.x, from.approach.z, 'enter', base.y, 0));
    } else if (from.interior) {
      // Del punto interior a la aproximación, navegando por el interior.
      const exitPath = interiorWalkPath(from.interior, target.x, target.z, from.approach.x, from.approach.z);
      let prevPt = { x: target.x, z: target.z };
      for (let k = 0; k < exitPath.length; k++) {
        const wp = exitPath[k];
        const fromY = k === 0 ? target.y : 0;
        legs.push(makeLeg(prevPt.x, prevPt.z, wp.x, wp.z, 'enter', fromY, 0));
        prevPt = wp;
      }
    } else {
      // Del punto interior a la aproximación junto a la fachada.
      legs.push(makeLeg(target.x, target.z, from.approach.x, from.approach.z, 'enter', target.y, 0));
    }
    // door-out: de la aproximación a la puerta (acera).
    legs.push(makeLeg(from.approach.x, from.approach.z, from.door.x, from.door.z, 'door-out'));
  }

  /** Traduce los pasos del grafo (nodo a nodo) en piernas de acera/cruce. */
  private appendWalkLegs(legs: Leg[], startNode: number, steps: PathStep[]): void {
    let prevNode = startNode;
    for (const step of steps) {
      const a = this.graph.nodes[prevNode];
      const b = this.graph.nodes[step.node];
      const edge = this.graph.edges[step.edge];
      const leg = makeLeg(a.x, a.z, b.x, b.z, edge.cross ? 'cross' : 'walk');
      if (edge.cross) {
        leg.crossNode = edge.cross.node;
        leg.crossAxis = edge.cross.axis;
      }
      legs.push(leg);
      prevNode = step.node;
    }
  }

  step(dt: number, time: number, hour: number): void {
    // Cambio de día: al detectar el wrap de la hora (medianoche) se aplica el
    // rollover de agendas (posponer/descartar) y se planifica el nuevo día.
    if (this.lastHour !== null && hour < this.lastHour - 12) {
      this.day++;
      for (const ped of this.pedestrians) {
        ped.routine.rollover(ped.id, this.day);
        planDay(ped.routine, ped, this.day, this);
      }
    }
    this.lastHour = hour;

    const mudRain = this.weather.isMudRain(this.day, hour, time);
    const ctx: TaskCtx = { hour, day: this.day, host: this };

    for (const ped of this.pedestrians) {
      ped.prevX = ped.x;
      ped.prevZ = ped.z;
      ped.prevY = ped.y;
      ped.prevHeading = ped.heading;
      ped.prevScale = ped.scale;
      ped.prevRecline = ped.recline;
      ped.facadeDoorOpen = false;

      // La energía baja de forma continua mientras está despierto (caminando o
      // dentro); solo se recupera durmiendo. Así se cansa a lo largo de un único
      // día y por la noche se va a dormir.
      if (!ped.sleeping) ped.energy = Math.max(0, ped.energy - dt * drainRate(ped.personality));

      // Alimentación, hidratación e higiene bajan de forma continua (también
      // durmiendo), por tramos de velocidad (ver `needs.ts`). Hoy son lineales.
      ped.food = drainNeed(ped.food, FOOD, dt);
      ped.hydration = drainNeed(ped.hydration, HYDRATION, dt);
      ped.hygiene = drainNeed(ped.hygiene, HYGIENE, dt);

      // Lluvia de barro: ensucia de golpe a quien pilla por la calle. La señal
      // (higiene) dispara la urgencia de la ducha; el evento añade el estímulo.
      if (mudRain && isOutside(ped) && ped.hygiene > MUD_HYGIENE) {
        ped.hygiene = MUD_HYGIENE;
        if (!ped.routine.has('ducharse')) {
          ped.routine.add(makeTask('ducharse', this.day, null)); // sin ventana: urge ya
        }
        ped.routine.notify({ kind: 'lluvia-barro', intensity: 1 }, ped);
      }

      // Rutina: decae el estímulo y avanza la tarea activa (si la hay).
      ped.routine.tick(dt);
      this.stepActiveTask(ped, ctx, dt);

      // Quien va por la calle hacia un destino que no es su casa se redirige a
      // casa si es de noche (a dormir) o si tiene hambre estando despierto (a
      // comer) — salvo que esté haciendo la compra (esa tarea YA arregla el
      // hambre) o yendo a trabajar (el turno no se abandona por hambre normal;
      // comerá al salir). Los que ya están dentro lo deciden en stepInside.
      const enFaena = ped.routine.active?.kind === 'comprar' || ped.routine.active?.kind === 'trabajar';
      const wantsHome =
        isNight(hour) || (!ped.sleeping && ((ped.food < EAT_THRESHOLD && !enFaena) || ped.wantsToEat));
      if (wantsHome && ped.state === 'walking' && ped.building !== ped.home) {
        this.walkHome(ped);
      }

      // Re-chequeo de rutina por la calle: permite que un suceso urgente
      // (lluvia de barro, hambre creciente) interrumpa la tarea en curso.
      if (isOutside(ped)) {
        ped.decideT -= dt;
        if (ped.decideT <= 0) {
          ped.decideT = STREET_DECIDE_EVERY;
          this.streetDecide(ped, ctx);
        }
      }

      switch (ped.state) {
        case 'inside':
          this.stepInside(ped, dt, hour);
          break;
        case 'waiting': {
          const leg = ped.legs[ped.legIdx];
          if (this.lights.pedCanCross(leg.crossNode!, leg.crossAxis!, time)) {
            ped.state = 'crossing';
          }
          break;
        }
        default:
          this.advance(ped, dt, time);
      }
      this.computePose(ped);
    }
  }

  /** Avanza un paso la tarea activa y procesa su resultado. */
  private stepActiveTask(ped: Pedestrian, ctx: TaskCtx, dt: number): void {
    const act = ped.routine.active;
    if (!act) return;
    const res = taskDefs[act.kind].update(act, ped, ctx, dt);
    if (res === 'hecha') {
      ped.routine.complete(act);
    } else if (res === 'abandonada') {
      ped.routine.release(act);
    } else if (res === 'fallida') {
      ped.routine.fail(act);
      if (act.kind === 'comer') {
        // Comida frustrada por nevera vacía: agenda la compra y empújala.
        ensureShopping(ped.routine, ped, ctx.day, this);
        ped.routine.notify({ kind: 'nevera-vacia', intensity: 1 }, ped);
      }
    }
  }

  /**
   * Subasta de rutina en plena calle. Con tarea activa, solo cambia si otra la
   * supera con margen (histéresis) y la activa es interrumpible; sin tarea
   * activa (paseo dirigido por el usuario, vuelta nocturna), solo arranca algo
   * si es una urgencia de verdad.
   */
  private streetDecide(ped: Pedestrian, ctx: TaskCtx): void {
    if (ped.sleeping) return;
    const act = ped.routine.active;
    const cand = ped.routine.best(ped, ctx);
    if (!cand || cand.task === act) return;
    if (act) {
      if (!taskDefs[act.kind].interruptible) return;
      const actScore = ped.routine.score(act, ped, ctx, true) ?? 0;
      if (cand.score <= actScore + INTERRUPT_MARGIN) return;
      ped.routine.release(act);
    } else if (cand.score < STREET_URGENT_SCORE) {
      return;
    }
    this.startTask(ped, cand.task, ctx);
  }

  /** Arranca una tarea: si su `start` encamina/prepara, pasa a activa. */
  private startTask(ped: Pedestrian, task: RoutineTask, ctx: TaskCtx): boolean {
    if (!taskDefs[task.kind].start(task, ped, ctx)) return false;
    ped.routine.activate(task);
    return true;
  }

  /**
   * Peatón dentro de un edificio: gasta/recupera energía y decide qué hacer.
   *  - Durmiendo: recupera energía y se mantiene tumbado hasta despertar.
   *  - Despierto y recién levantado: se incorpora antes de actuar.
   *  - Con sueño y de noche: si está en casa se acuesta; si no, vuelve a casa.
   *  - Si no, comportamiento normal (salir a un destino al expirar el temporizador).
   */
  private stepInside(ped: Pedestrian, dt: number, hour: number): void {
    if (ped.sleeping) {
      ped.energy = Math.min(100, ped.energy + dt * recoverRate(ped.personality));
      this.lieInBed(ped, dt);
      // Duerme toda la noche y se levanta a su hora de la mañana (ya recuperado).
      if (isWakeUpTime(hour, ped.id)) ped.sleeping = false; // se levanta (recline baja abajo)
      return;
    }

    // (La energía ya se ha descontado en el bucle principal, para todos los estados.)

    // Comiendo: se acerca a la nevera, come y, al terminar, vuelve a su sitio.
    if (ped.eating) {
      this.eat(ped, dt);
      return;
    }

    // Si quedó tumbado (acaba de despertar), se incorpora antes de hacer nada más.
    if (ped.recline > 0) {
      this.getUp(ped, dt);
      return;
    }

    // Si acaba de comer (quedó junto a la nevera), vuelve a su sitio antes de seguir.
    if (ped.eatApproach > 0) {
      this.returnFromFridge(ped, dt);
      return;
    }

    // Hambre (estando despierto) o comer ordenado por el usuario (`wantsToEat`):
    // va a su nevera a comer. Si está en casa y hay comida, empieza a comer; si
    // está fuera, vuelve a casa primero. Excepciones: haciendo la compra (la
    // compra es justo lo que arregla el problema) y trabajando (el turno no se
    // abandona por hambre normal; la orden del usuario sí lo saca).
    const enFaena = ped.routine.active?.kind === 'comprar' || ped.routine.active?.kind === 'trabajar';
    if ((ped.food < EAT_THRESHOLD && !enFaena) || ped.wantsToEat) {
      if (ped.building === ped.home) {
        if (this.startEating(ped)) {
          ped.wantsToEat = false;
          return;
        }
        ped.wantsToEat = false; // en casa pero sin comida en la nevera: no puede comer
      } else if (this.planTo(ped, ped.building, ped.home)) {
        ped.state = 'exiting';
        return;
      }
    }

    // Con tarea activa, su `update` (en step) lleva el control: aquí no se decide.
    if (ped.routine.active) return;

    // Subasta de rutina: al expirar el temporizador de estancia, la tarea con
    // mayor puntuación gana (de noche solo compiten las tareas `nightOk`).
    ped.timer -= dt;
    const puedeDecidir = ped.timer <= 0;
    if (puedeDecidir) {
      const ctx: TaskCtx = { hour, day: this.day, host: this };
      const cand = ped.routine.best(ped, ctx);
      if (cand && this.startTask(ped, cand.task, ctx)) return;
    }

    // De noche nadie sale de paseo: o está en casa (y se acuesta al cansarse) o
    // vuelve a casa de inmediato. Así por la noche todos convergen a dormir.
    if (isNight(hour)) {
      if (ped.building === ped.home) {
        if (ped.energy <= sleepAt(ped.personality, ped.id)) ped.sleeping = true;
      } else if (this.planTo(ped, ped.building, ped.home)) {
        ped.state = 'exiting';
      } else {
        ped.timer = 5;
      }
      return;
    }

    // De día sin tarea que arrancar (raro: "pasear" casi siempre aplica):
    // reintenta en unos segundos.
    if (puedeDecidir) ped.timer = 5;
  }

  /** Desliza al peatón hacia su cama y lo va tumbando (`recline` → 1). */
  private lieInBed(ped: Pedestrian, dt: number): void {
    ped.recline = Math.min(1, ped.recline + dt / RECLINE_TIME);
    const bed = this.bedTarget(ped.home, ped.homeUnit);
    if (!bed) return;
    const k = Math.min(1, dt / RECLINE_TIME);
    ped.x += (bed.x - ped.x) * k;
    ped.z += (bed.z - ped.z) * k;
    ped.y += (bed.y - ped.y) * k;
    ped.heading = lerpAngle(ped.heading, bed.heading, k);
  }

  /** Incorpora al peatón: vuelve a su punto interior de pie (`recline` → 0). */
  private getUp(ped: Pedestrian, dt: number): void {
    ped.recline = Math.max(0, ped.recline - dt / RECLINE_TIME);
    const sp = this.standTarget(ped.home, ped.homeUnit, true);
    const k = Math.min(1, dt / RECLINE_TIME);
    ped.x += (sp.x - ped.x) * k;
    ped.z += (sp.z - ped.z) * k;
    ped.y += (sp.y - ped.y) * k;
  }

  /**
   * Empieza a comer: requiere estar en casa con una nevera que tenga comida.
   * Devuelve false si no hay nevera o está vacía (entonces sigue con hambre).
   */
  private startEating(ped: Pedestrian): boolean {
    const target = this.fridgeTarget(ped.home, ped.homeUnit);
    if (!target || target.store.items.length === 0) return false;
    ped.eating = true;
    ped.eatTimer = EAT_TIME;
    return true;
  }

  /**
   * Acto de comer: primero se desliza hasta la nevera (`eatApproach` → 1); ya
   * frente a ella, agota el temporizador y entonces consume comida de la nevera
   * y recupera alimentación. Después deja de comer (`returnFromFridge` lo devuelve).
   */
  private eat(ped: Pedestrian, dt: number): void {
    const target = this.fridgeTarget(ped.home, ped.homeUnit);
    if (!target) {
      ped.eating = false;
      return;
    }
    if (ped.eatApproach < 1) {
      ped.eatApproach = Math.min(1, ped.eatApproach + dt / EAT_MOVE_TIME);
      const k = Math.min(1, dt / EAT_MOVE_TIME);
      ped.x += (target.x - ped.x) * k;
      ped.z += (target.z - ped.z) * k;
      ped.y += (target.y - ped.y) * k;
      ped.heading = lerpAngle(ped.heading, target.heading, k);
      return;
    }
    // Frente a la nevera: come durante `EAT_TIME` y al terminar consume y para.
    ped.x = target.x;
    ped.z = target.z;
    ped.y = target.y;
    ped.heading = target.heading;
    ped.eatTimer -= dt;
    if (ped.eatTimer <= 0) {
      this.consumeFood(ped, target.store);
      ped.eating = false;
    }
  }

  /** Tras comer, vuelve deslizándose a su punto interior de pie (`eatApproach` → 0). */
  private returnFromFridge(ped: Pedestrian, dt: number): void {
    ped.eatApproach = Math.max(0, ped.eatApproach - dt / EAT_MOVE_TIME);
    const sp = this.standTarget(ped.home, ped.homeUnit, true);
    const k = Math.min(1, dt / EAT_MOVE_TIME);
    ped.x += (sp.x - ped.x) * k;
    ped.z += (sp.z - ped.z) * k;
    ped.y += (sp.y - ped.y) * k;
  }

  /**
   * Consume comida de la nevera hasta saciar la alimentación (≈100) o vaciarla.
   * Cada alimento aporta su `nourishment` (y de paso algo de `hydration`).
   */
  private consumeFood(ped: Pedestrian, store: FridgeStore): void {
    while (ped.food < 100 && store.items.length > 0) {
      const item = store.items.pop()!;
      const def = FOOD_CATALOG[item.kind];
      ped.food = Math.min(100, ped.food + def.nourishment);
      ped.hydration = Math.min(100, ped.hydration + def.hydration);
    }
  }

  /**
   * Punto frente a la nevera del hogar (medio metro por delante, mirándola) más
   * su almacén. `null` si el hogar no tiene nevera con almacén.
   */
  /** Mobiliario (y cota de planta) de una vivienda: su apartamento o su casa. */
  private homeFurnishings(b: Building, homeUnit: number): { furniture?: readonly Furniture[]; yBase: number } {
    if (b.officeInterior && homeUnit > 0) {
      return {
        furniture: b.officeInterior.dwellings[homeUnit - 1]?.furniture,
        yBase: floorSurfaceY(homeUnit, b.officeInterior.floorH),
      };
    }
    if (b.interior) return { furniture: b.interior.furniture, yBase: 0 };
    return { yBase: 0 };
  }

  private fridgeTarget(
    b: Building,
    homeUnit: number,
  ): { x: number; z: number; y: number; heading: number; store: FridgeStore } | null {
    const { furniture, yBase } = this.homeFurnishings(b, homeUnit);
    const fridge = furniture?.find((f) => f.kind === 'fridge');
    if (!fridge?.food) return null;
    const STAND = 0.5; // se planta medio metro por delante de la nevera
    return {
      x: fridge.x + fridge.faceX * STAND,
      z: fridge.z + fridge.faceZ * STAND,
      y: yBase,
      heading: Math.atan2(-fridge.faceX, -fridge.faceZ), // mirando hacia la nevera
      store: fridge.food,
    };
  }

  /**
   * Punto y orientación para dormir en la cama del hogar: centro de la cama, a la
   * altura del colchón, con la cabeza hacia el cabecero. `null` si el hogar no tiene
   * cama (entonces se duerme en el punto de estar de pie).
   */
  private bedTarget(b: Building, homeUnit: number): { x: number; z: number; y: number; heading: number } | null {
    const { furniture, yBase } = this.homeFurnishings(b, homeUnit);
    const bed = furniture?.find((f) => f.kind === 'bed');
    if (!bed) return null;
    // `faceX/faceZ` apunta a los pies; heading hacia los pies deja la cabeza del
    // peatón en el cabecero al tumbarse boca arriba (ver pose en PedestrianMesh).
    return { x: bed.x, z: bed.z, y: yBase + MATTRESS_TOP, heading: Math.atan2(bed.faceX, bed.faceZ) };
  }

  private advance(ped: Pedestrian, dt: number, time: number): void {
    const speed = ped.state === 'crossing' ? CROSS_SPEED : ped.walkSpeed;
    ped.s += speed * dt;

    while (true) {
      const leg = ped.legs[ped.legIdx];
      if (ped.s < leg.length) return;
      const excess = ped.s - leg.length;

      // Fin de la pierna actual.
      if (ped.legIdx + 1 >= ped.legs.length) {
        // Ha llegado a su punto interior: se queda dentro, de pie y visible.
        ped.state = 'inside';
        // Estancia de visita: entre ~20 min y ~1.3 h de sim.
        ped.timer = this.rng.range(simHours(0.3), simHours(1.3));
        ped.s = leg.length;
        ped.x = leg.bx;
        ped.z = leg.bz;
        ped.y = leg.by ?? 0;
        return;
      }

      ped.legIdx++;
      const next = ped.legs[ped.legIdx];
      if (next.kind === 'cross') {
        if (this.lights.pedCanCross(next.crossNode!, next.crossAxis!, time)) {
          ped.state = 'crossing';
          ped.s = excess;
        } else {
          ped.state = 'waiting';
          ped.s = 0;
          return;
        }
      } else if (next.kind === 'door-in') {
        ped.state = 'entering';
        ped.s = excess;
      } else if (next.kind === 'walk') {
        ped.state = 'walking';
        ped.s = excess;
      } else {
        // Tramos interiores (enter/stairs/unit): conservan la dirección del viaje.
        // Al salir venimos de 'exiting'; al entrar, de 'entering' (tras el door-in).
        ped.state = ped.state === 'entering' ? 'entering' : 'exiting';
        ped.s = excess;
      }
    }
  }

  private computePose(ped: Pedestrian): void {
    ped.scale = 1; // siempre visibles: ahora se ven dentro de los edificios
    if (ped.state === 'inside') {
      // De pie en su punto interior: mantiene la última pose calculada.
      return;
    }
    const leg = ped.legs[ped.legIdx];
    const prev = ped.legIdx > 0 ? ped.legs[ped.legIdx - 1] : null;
    const next = ped.legIdx + 1 < ped.legs.length ? ped.legs[ped.legIdx + 1] : null;
    const startR = prev ? cornerRadius(prev, leg) : 0;
    const endR = next ? cornerRadius(leg, next) : 0;

    if (ped.state === 'waiting' && prev && startR > 0) {
      computeCornerPose(ped, prev, leg, startR);
    } else if (prev && startR > 0 && ped.s < startR && canBlendCorner(ped, leg)) {
      computeCornerPose(ped, prev, leg, ped.s + startR);
    } else if (next && endR > 0 && ped.s > leg.length - endR && canBlendCorner(ped, next)) {
      computeCornerPose(ped, leg, next, ped.s - (leg.length - endR));
    } else {
      computeLegPose(ped, leg, ped.s);
    }

    // La puerta de calle se abre solo mientras cruza el umbral (no toda la subida).
    ped.facadeDoorOpen = isThresholdLeg(leg);
  }
}

/** ¿Está en la calle? (le afecta el clima y los re-chequeos de rutina). */
function isOutside(ped: Pedestrian): boolean {
  return ped.state === 'walking' || ped.state === 'waiting' || ped.state === 'crossing';
}

/** ¿La pierna cruza la puerta de calle (en planta baja)? El render abre la puerta. */
function isThresholdLeg(leg: Leg): boolean {
  if (leg.kind === 'door-in' || leg.kind === 'door-out') return true;
  return leg.kind === 'enter' && (leg.ay ?? 0) < 0.5 && (leg.by ?? 0) < 0.5;
}

function makeLeg(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  kind: Leg['kind'],
  ay = 0,
  by = 0,
): Leg {
  const length = Math.max(Math.hypot(bx - ax, bz - az), kind.startsWith('door') ? DOOR_LEG_MIN : 0.01);
  return { ax, az, bx, bz, length, kind, ay, by };
}

/** Añade una polilínea 3D como piernas consecutivas (primer tramo con `firstKind`). */
function pushPath(legs: Leg[], pts: StairPoint[], firstKind: Leg['kind'], restKind: Leg['kind']): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    legs.push(makeLeg(a.x, a.z, b.x, b.z, i === 0 ? firstKind : restKind, a.y, b.y));
  }
}

/** Solo se redondean esquinas entre tramos de calle (andar/cruzar). */
function isGroundWalk(leg: Leg): boolean {
  return leg.kind === 'walk' || leg.kind === 'cross';
}

function canBlendCorner(ped: Pedestrian, to: Leg): boolean {
  if (ped.state === 'waiting') return false;
  if (!isGroundWalk(to)) return false;
  if (to.kind === 'cross') return ped.state === 'walking' || ped.state === 'crossing' || ped.legs[ped.legIdx] === to;
  return true;
}

function cornerRadius(a: Leg, b: Leg): number {
  if (!isGroundWalk(a) || !isGroundWalk(b)) return 0;
  return Math.min(CORNER_BLEND, a.length * 0.45, b.length * 0.45);
}

function computeLegPose(ped: Pedestrian, leg: Leg, s: number): void {
  const p = pointOnLeg(ped, leg, s);
  ped.x = p.x;
  ped.z = p.z;
  const t = Math.min(Math.max(s / leg.length, 0), 1);
  ped.y = (leg.ay ?? 0) + ((leg.by ?? 0) - (leg.ay ?? 0)) * t;
  if (ped.state !== 'waiting') {
    const dx = (leg.bx - leg.ax) / leg.length;
    const dz = (leg.bz - leg.az) / leg.length;
    ped.heading = Math.atan2(dx, dz);
  }
}

function computeCornerPose(ped: Pedestrian, from: Leg, to: Leg, distanceFromCornerStart: number): void {
  const r = cornerRadius(from, to);
  const a = pointOnLeg(ped, from, from.length - r);
  const b = averagedCornerPoint(ped, from, to);
  const c = pointOnLeg(ped, to, r);
  const curveLength = quadraticLength(a, b, c);
  const curveDistance = curveLength * Math.min(Math.max(distanceFromCornerStart / (r * 2), 0), 1);
  const u = quadraticTAtDistance(a, b, c, curveDistance);
  const abx = a.x + (b.x - a.x) * u;
  const abz = a.z + (b.z - a.z) * u;
  const bcx = b.x + (c.x - b.x) * u;
  const bcz = b.z + (c.z - b.z) * u;
  ped.x = abx + (bcx - abx) * u;
  ped.z = abz + (bcz - abz) * u;
  ped.y = 0; // las esquinas solo se redondean en tramos de calle (planta baja)

  if (ped.state !== 'waiting') {
    const dx = bcx - abx;
    const dz = bcz - abz;
    if (Math.hypot(dx, dz) > 1e-5) ped.heading = Math.atan2(dx, dz);
  }
}

function pointOnLeg(ped: Pedestrian, leg: Leg, s: number): { x: number; z: number } {
  const t = Math.min(Math.max(s / leg.length, 0), 1);
  const dx = (leg.bx - leg.ax) / leg.length;
  const dz = (leg.bz - leg.az) / leg.length;
  const lat = lateralFor(ped, leg);
  return {
    x: leg.ax + (leg.bx - leg.ax) * t - dz * lat,
    z: leg.az + (leg.bz - leg.az) * t + dx * lat,
  };
}

function averagedCornerPoint(ped: Pedestrian, from: Leg, to: Leg): { x: number; z: number } {
  const a = pointOnLeg(ped, from, from.length);
  const b = pointOnLeg(ped, to, 0);
  return { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
}

function lateralFor(ped: Pedestrian, leg: Leg): number {
  if (leg.kind === 'walk') return ped.lateral;
  if (leg.kind === 'cross') return ped.lateral * 0.8;
  return 0;
}

function quadraticTAtDistance(
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
  distance: number,
): number {
  const steps = 12;
  const target = Math.max(distance, 0);
  let prevX = a.x;
  let prevZ = a.z;
  let walked = 0;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = quadraticPoint(a, b, c, t);
    const seg = Math.hypot(p.x - prevX, p.z - prevZ);
    if (walked + seg >= target) {
      const local = seg > 1e-6 ? (target - walked) / seg : 0;
      return (i - 1 + local) / steps;
    }
    walked += seg;
    prevX = p.x;
    prevZ = p.z;
  }

  return 1;
}

function quadraticLength(
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
): number {
  const steps = 12;
  let prevX = a.x;
  let prevZ = a.z;
  let total = 0;
  for (let i = 1; i <= steps; i++) {
    const p = quadraticPoint(a, b, c, i / steps);
    total += Math.hypot(p.x - prevX, p.z - prevZ);
    prevX = p.x;
    prevZ = p.z;
  }
  return total;
}

function quadraticPoint(
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
  t: number,
): { x: number; z: number } {
  const q = 1 - t;
  return {
    x: q * q * a.x + 2 * q * t * b.x + t * t * c.x,
    z: q * q * a.z + 2 * q * t * b.z + t * t * c.z,
  };
}
