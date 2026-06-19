import { apartmentCount, type Building, type CityModel } from '../city/CityModel';
import { buildingFactories } from '../city/buildings/registry';
import {
  floorSurfaceY,
  interiorStandPoint,
  officeShaft,
  stairWaypoints,
  type StairPoint,
} from '../city/buildings/interior/stairGeometry';
import type { PathStep, SidewalkGraph } from '../city/SidewalkGraph';
import { Rng } from '../core/Rng';
import type { Leg, Pedestrian } from './agents';
import { DEFAULT_PERSONALITY, randomPersonality, type Personality } from './personality';
import type { TrafficLightSystem } from './TrafficLightSystem';

const CROSS_SPEED = 2.4; // los peatones cruzan con prisa
const CORNER_BLEND = 2.2; // metros suavizados alrededor de cada giro
const DOOR_LEG_MIN = 0.8; // longitud mínima del tramo puerta→fachada
const INSIDE_DEPTH = 1.6; // cuánto entra hacia dentro en edificios sin interior (m)

export class PedestrianSystem {
  readonly pedestrians: Pedestrian[] = [];
  private readonly rng: Rng;

  constructor(
    private readonly model: CityModel,
    private readonly graph: SidewalkGraph,
    private readonly lights: TrafficLightSystem,
    count: number,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    for (let id = 0; id < count; id++) {
      const home = this.pickHome();
      const homeUnit = this.pickUnit(home);
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
        home,
        homeUnit,
        building,
        timer: this.rng.range(0.5, 18),
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
    }
  }

  /**
   * Añade un peatón extra en caliente (personaje creado por el usuario).
   * Siempre se añade AL FINAL del array, así los índices existentes (picking,
   * mallas instanciadas) no se mueven. Sale de un edificio inmediatamente.
   * Devuelve su índice.
   */
  spawnCustom(personality: Personality = { ...DEFAULT_PERSONALITY }): number {
    const home = this.pickHome();
    const homeUnit = this.pickUnit(home);
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
      home,
      homeUnit,
      building,
      timer: 1,
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
    if (ped.state === 'inside' && ped.building === ped.home) return false; // ya está en casa

    if (ped.state === 'inside') {
      // Sale por la puerta de su edificio actual y camina a casa.
      if (!this.planTo(ped, ped.building, ped.home)) return false;
      ped.state = 'exiting';
      return true;
    }

    // En ruta y visible: reencamina desde el nodo de acera más cercano.
    const startNode = this.graph.nearestNode(ped.x, ped.z);
    const steps = this.graph.findPath(startNode, ped.home.doorNode);
    if (!steps) return false;
    const start = this.graph.nodes[startNode];
    const legs: Leg[] = [makeLeg(ped.x, ped.z, start.x, start.z, 'walk')];
    this.appendWalkLegs(legs, startNode, steps);
    this.appendEntryLegs(legs, ped, ped.home);
    ped.legs = legs;
    ped.legIdx = 0;
    ped.s = 0;
    ped.y = 0;
    ped.building = ped.home;
    ped.state = 'walking';
    return true;
  }

  /** Elige un hogar: una casa individual o un apartamento (edificio alto). */
  private pickHome(): Building {
    const weights = this.model.buildings.map((b) =>
      b.type === 'house' || b.type === 'office' ? buildingFactories[b.type].pedestrianWeight : 0,
    );
    if (weights.every((w) => w === 0)) return this.pickBuilding(null); // por si no hay residenciales
    return this.model.buildings[this.rng.weighted(weights)];
  }

  /** Elige el apartamento (planta 1..N) dentro de un edificio; 0 si es una casa. */
  private pickUnit(home: Building): number {
    const apts = apartmentCount(home);
    return apts > 0 ? this.rng.int(1, apts + 1) : 0;
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
      // Del rellano superior a la vivienda.
      legs.push(makeLeg(prev.x, prev.z, target.x, target.z, 'unit', prev.y, target.y));
      return;
    }

    // Planta baja: de la aproximación al punto interior.
    legs.push(makeLeg(to.approach.x, to.approach.z, target.x, target.z, 'enter', 0, target.y));
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
      // De la vivienda al rellano de su planta (arriba del todo).
      const topWp = stairWaypoints(shaft, oi.floorH, ped.homeUnit);
      const top = topWp[topWp.length - 1];
      legs.push(makeLeg(target.x, target.z, top.x, top.z, 'unit', target.y, top.y));
      // Baja planta a planta (waypoints invertidos).
      for (let f = ped.homeUnit; f >= 1; f--) {
        const wp = stairWaypoints(shaft, oi.floorH, f).slice().reverse();
        pushPath(legs, wp, 'stairs', 'stairs');
      }
      // Del rellano de planta baja a la puerta de calle.
      const base = stairWaypoints(shaft, oi.floorH, 1)[0];
      legs.push(makeLeg(base.x, base.z, from.approach.x, from.approach.z, 'enter', base.y, 0));
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

  step(dt: number, time: number): void {
    for (const ped of this.pedestrians) {
      ped.prevX = ped.x;
      ped.prevZ = ped.z;
      ped.prevY = ped.y;
      ped.prevHeading = ped.heading;
      ped.prevScale = ped.scale;
      ped.facadeDoorOpen = false;

      switch (ped.state) {
        case 'inside': {
          ped.timer -= dt;
          if (ped.timer <= 0) {
            if (this.plan(ped)) {
              ped.state = 'exiting';
            } else {
              ped.timer = 5;
            }
          }
          break;
        }
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
        ped.timer = this.rng.range(4, 16);
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
