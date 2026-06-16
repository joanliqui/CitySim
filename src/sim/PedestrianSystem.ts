import type { Building, CityModel } from '../city/CityModel';
import { buildingFactories } from '../city/buildings/registry';
import type { SidewalkGraph } from '../city/SidewalkGraph';
import { Rng } from '../core/Rng';
import type { Leg, Pedestrian } from './agents';
import type { TrafficLightSystem } from './TrafficLightSystem';

const CROSS_SPEED = 2.4; // los peatones cruzan con prisa
const CORNER_BLEND = 2.2; // metros suavizados alrededor de cada giro
const DOOR_LEG_MIN = 0.8; // longitud mínima del tramo puerta→fachada

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
      const building = this.pickBuilding(null);
      const ped: Pedestrian = {
        id,
        state: 'inside',
        legs: [],
        legIdx: 0,
        s: 0,
        walkSpeed: this.rng.range(1.15, 1.85),
        lateral: this.rng.range(-1, 1),
        colorIdx: this.rng.int(0, 8),
        building,
        timer: this.rng.range(0.5, 18),
        x: building.approach.x,
        z: building.approach.z,
        heading: 0,
        scale: 0,
        prevX: building.approach.x,
        prevZ: building.approach.z,
        prevHeading: 0,
        prevScale: 0,
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
  spawnCustom(): number {
    const building = this.pickBuilding(null);
    const ped: Pedestrian = {
      id: this.pedestrians.length,
      state: 'inside',
      legs: [],
      legIdx: 0,
      s: 0,
      walkSpeed: this.rng.range(1.15, 1.85),
      lateral: this.rng.range(-1, 1),
      colorIdx: 0,
      building,
      timer: 1,
      x: building.approach.x,
      z: building.approach.z,
      heading: 0,
      scale: 0,
      prevX: building.approach.x,
      prevZ: building.approach.z,
      prevHeading: 0,
      prevScale: 0,
    };
    this.pedestrians.push(ped);
    if (this.plan(ped)) {
      ped.state = 'exiting';
      ped.scale = 0;
    }
    return this.pedestrians.length - 1;
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

  /** Construye la lista de piernas: salir por la puerta → acera/cruces → entrar por la puerta. */
  private plan(ped: Pedestrian): boolean {
    const from = ped.building;
    const to = this.pickBuilding(from);
    const steps = this.graph.findPath(from.doorNode, to.doorNode);
    if (!steps || steps.length === 0) return false;

    const legs: Leg[] = [];
    legs.push(makeLeg(from.approach.x, from.approach.z, from.door.x, from.door.z, 'door-out'));
    let prevNode = from.doorNode;
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
    legs.push(makeLeg(to.door.x, to.door.z, to.approach.x, to.approach.z, 'door-in'));

    ped.legs = legs;
    ped.legIdx = 0;
    ped.s = 0;
    ped.building = to;
    return true;
  }

  step(dt: number, time: number): void {
    for (const ped of this.pedestrians) {
      ped.prevX = ped.x;
      ped.prevZ = ped.z;
      ped.prevHeading = ped.heading;
      ped.prevScale = ped.scale;

      switch (ped.state) {
        case 'inside': {
          ped.timer -= dt;
          if (ped.timer <= 0) {
            if (this.plan(ped)) {
              ped.state = 'exiting';
              ped.scale = 0;
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
        // Ha llegado a la fachada: entra en el edificio.
        ped.state = 'inside';
        ped.timer = this.rng.range(4, 16);
        ped.s = leg.length;
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
      } else {
        ped.state = 'walking';
        ped.s = excess;
      }
    }
  }

  private computePose(ped: Pedestrian): void {
    if (ped.state === 'inside') {
      ped.scale = 0;
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

    // Aparece al salir y se desvanece al entrar.
    const t = Math.min(ped.s / leg.length, 1);
    if (leg.kind === 'door-out') {
      ped.scale = Math.min(t * 2, 1);
    } else if (leg.kind === 'door-in') {
      ped.scale = Math.max(1 - t, 0.001);
    } else {
      ped.scale = 1;
    }
  }
}

function makeLeg(ax: number, az: number, bx: number, bz: number, kind: Leg['kind']): Leg {
  const length = Math.max(Math.hypot(bx - ax, bz - az), kind.startsWith('door') ? DOOR_LEG_MIN : 0.01);
  return { ax, az, bx, bz, length, kind };
}

function canBlendCorner(ped: Pedestrian, to: Leg): boolean {
  if (ped.state === 'waiting') return false;
  if (to.kind === 'door-in' || to.kind === 'door-out') return false;
  if (to.kind === 'cross') return ped.state === 'walking' || ped.state === 'crossing' || ped.legs[ped.legIdx] === to;
  return true;
}

function cornerRadius(a: Leg, b: Leg): number {
  if (a.kind.startsWith('door') || b.kind.startsWith('door')) return 0;
  return Math.min(CORNER_BLEND, a.length * 0.45, b.length * 0.45);
}

function computeLegPose(ped: Pedestrian, leg: Leg, s: number): void {
  const p = pointOnLeg(ped, leg, s);
  ped.x = p.x;
  ped.z = p.z;
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
