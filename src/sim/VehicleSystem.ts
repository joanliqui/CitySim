import { CORRIDOR_HALF, type CityModel, type RoadEdge, type Vec2 } from '../city/CityModel';
import type { RoadGraph } from '../city/RoadGraph';
import { Rng } from '../core/Rng';
import type { Vehicle } from './agents';
import type { TrafficLightSystem } from './TrafficLightSystem';

const CAR_LENGTH = 4.4;
const MIN_GAP = 2.2; // hueco mínimo parachoques a parachoques
const ACCEL = 5.5;
const DECEL = 7; // frenada cómoda
const HARD_DECEL = 11; // frenada de emergencia (decisión en ámbar)
/** Línea de detención: antes del corredor de la intersección. */
const STOP_MARGIN = CORRIDOR_HALF + 2.5;
const STOP_HOLD_EPS = 0.45;
/** Radio de mezcla (curva Bézier) al atravesar la intersección. */
const BLEND = CORRIDOR_HALF;
/** Hueco que debe estar libre en el anillo para incorporarse a una rotonda. */
const RING_MERGE_GAP = 8;

export class VehicleSystem {
  readonly vehicles: Vehicle[] = [];
  private readonly rng: Rng;
  /** Vehículos por arista, reconstruido cada paso para el car-following. */
  private readonly byEdge: Vehicle[][];
  private readonly tmp: Vec2 = { x: 0, z: 0 };
  private readonly tmpT: Vec2 = { x: 0, z: 0 };

  constructor(
    private readonly model: CityModel,
    private readonly roads: RoadGraph,
    private readonly lights: TrafficLightSystem,
    count: number,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.byEdge = model.edges.map(() => []);
    this.spawn(count);
  }

  private spawn(count: number): void {
    // Reparte los coches por aristas en huecos discretos para que no nazcan solapados.
    const slots: Array<{ edge: RoadEdge; s: number }> = [];
    for (const edge of this.model.edges) {
      const n = Math.floor((edge.length - STOP_MARGIN * 2) / (CAR_LENGTH + MIN_GAP + 4));
      for (let k = 0; k < n; k++) {
        slots.push({ edge, s: STOP_MARGIN + k * (CAR_LENGTH + MIN_GAP + 4) });
      }
    }
    // Barajado de Fisher-Yates con el RNG con semilla.
    for (let i = slots.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i + 1);
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    for (let id = 0; id < Math.min(count, slots.length); id++) {
      const { edge, s } = slots[id];
      const car: Vehicle = {
        id,
        edgeId: edge.id,
        s,
        v: 0,
        vMax: this.rng.range(8, 11.5),
        prevEdgeId: -1,
        nextEdgeId: -1,
        state: 'driving',
        atLight: false,
        colorIdx: this.rng.int(0, 8),
        x: 0,
        z: 0,
        heading: 0,
        prevX: 0,
        prevZ: 0,
        prevHeading: 0,
      };
      this.computePose(car);
      car.prevX = car.x;
      car.prevZ = car.z;
      car.prevHeading = car.heading;
      this.vehicles.push(car);
    }
  }

  step(dt: number, time: number): void {
    // Reindexa por arista y ordena por avance para localizar al líder.
    for (const list of this.byEdge) list.length = 0;
    for (const car of this.vehicles) this.byEdge[car.edgeId].push(car);
    for (const list of this.byEdge) list.sort((a, b) => a.s - b.s);

    for (const car of this.vehicles) {
      car.prevX = car.x;
      car.prevZ = car.z;
      car.prevHeading = car.heading;

      const edge = this.model.edges[car.edgeId];
      const stopLine = edge.length - STOP_MARGIN;

      // Elige la siguiente arista con antelación (necesario para la curva y los huecos).
      if (car.nextEdgeId < 0 && car.s > edge.length - BLEND * 2 - 2) {
        car.nextEdgeId = this.chooseNext(edge).id;
      }

      // Distancia libre hasta el obstáculo más cercano (líder o línea de detención).
      let free = Infinity;
      let holdAtStopLine = false;
      car.atLight = false;

      const queue = this.byEdge[car.edgeId];
      const idx = queue.indexOf(car);
      if (idx + 1 < queue.length) {
        free = queue[idx + 1].s - car.s - CAR_LENGTH - MIN_GAP;
      } else if (car.nextEdgeId >= 0) {
        // Primer coche de la siguiente arista, a través de la intersección.
        const nextQueue = this.byEdge[car.nextEdgeId];
        if (nextQueue.length > 0) {
          free = Math.min(free, edge.length - car.s + nextQueue[0].s - CAR_LENGTH - MIN_GAP);
        }
      }

      // Semáforo al final de la arista.
      const light = this.lights.lightFor(edge.to, edge.axis, time);
      if (light !== 'green' && car.s <= stopLine + STOP_HOLD_EPS) {
        const dStop = Math.max(0, stopLine - car.s);
        // En ámbar solo se detiene si puede frenar con comodidad.
        const mustStop = light === 'red' || dStop > (car.v * car.v) / (2 * HARD_DECEL) + 1;
        if (mustStop && dStop < free) {
          free = dStop;
          car.atLight = true;
          holdAtStopLine = true;
        }
      }

      // Ceder el paso al incorporarse a una rotonda: parar si el anillo está ocupado.
      if (edge.yieldTo !== undefined && car.s <= stopLine + STOP_HOLD_EPS && this.ringBusy(edge, edge.yieldTo)) {
        const dStop = Math.max(0, stopLine - car.s);
        if (dStop < free) {
          free = dStop;
          car.atLight = true;
          holdAtStopLine = true;
        }
      }

      // Velocidad segura para detenerse dentro de la distancia libre.
      const vSafe = free <= 0 ? 0 : Math.sqrt(2 * DECEL * free);
      const vTarget = Math.min(car.vMax, vSafe);
      const prevV = car.v;
      if (vTarget > car.v) {
        car.v = Math.min(vTarget, car.v + ACCEL * dt);
      } else {
        car.v = Math.max(vTarget, car.v - HARD_DECEL * dt);
      }
      car.v = Math.max(0, car.v);

      car.s += car.v * dt;
      if (holdAtStopLine && car.s > stopLine) {
        car.s = stopLine;
        car.v = 0;
      }

      // Cambio de arista al alcanzar el centro de la intersección.
      if (car.s >= edge.length) {
        if (car.nextEdgeId < 0) car.nextEdgeId = this.chooseNext(edge).id;
        car.prevEdgeId = car.edgeId;
        car.edgeId = car.nextEdgeId;
        car.s -= edge.length;
        car.nextEdgeId = -1;
      }

      car.state = car.v < 0.25 ? 'stopped' : car.v < prevV - 0.01 ? 'braking' : 'driving';
      this.computePose(car);
    }
  }

  /** Continúa recto con más probabilidad que girar. */
  private chooseNext(edge: RoadEdge): RoadEdge {
    const options = this.roads.continuations(edge);
    const weights = options.map((e) => (e.dirX === edge.dirX && e.dirZ === edge.dirZ ? 3 : 1));
    return options[this.rng.weighted(weights)];
  }

  /** ¿Hay tráfico circulando en el anillo cerca del punto de incorporación? */
  private ringBusy(edge: RoadEdge, ringId: number): boolean {
    const ringEdge = this.model.edges[ringId];
    // Coche en el anillo que llega a este nodo de brazo.
    for (const v of this.byEdge[ringId]) if (v.s > ringEdge.length - RING_MERGE_GAP) return true;
    // Coche que acaba de incorporarse, justo delante (anillo que sale del nodo de brazo).
    for (const eid of this.model.outgoing[edge.to]) {
      if (eid === ringId) continue;
      if (this.model.edges[eid].curve) {
        for (const v of this.byEdge[eid]) if (v.s < RING_MERGE_GAP) return true;
      }
    }
    return false;
  }

  /**
   * Pose mundial. Cerca de la intersección la trayectoria se mezcla con una
   * Bézier cuadrática entre el carril de salida y el de entrada, lo que produce
   * giros suaves sin estado adicional.
   */
  private computePose(car: Vehicle): void {
    const edge = this.model.edges[car.edgeId];
    const L = edge.length;

    if (car.s < BLEND && car.prevEdgeId >= 0) {
      const prev = this.model.edges[car.prevEdgeId];
      this.bezierPose(car, prev, edge, 0.5 + car.s / (2 * BLEND));
      return;
    }
    if (car.s > L - BLEND && car.nextEdgeId >= 0) {
      const next = this.model.edges[car.nextEdgeId];
      this.bezierPose(car, edge, next, (car.s - (L - BLEND)) / (2 * BLEND));
      return;
    }
    this.roads.lanePoint(edge, car.s, this.tmp);
    car.x = this.tmp.x;
    car.z = this.tmp.z;
    // El rumbo sigue la tangente (constante en rectas, suave a lo largo de curvas).
    this.roads.tangentAt(edge, car.s, this.tmpT);
    car.heading = Math.atan2(this.tmpT.x, this.tmpT.z);
  }

  private bezierPose(car: Vehicle, eIn: RoadEdge, eOut: RoadEdge, t: number): void {
    const p0 = this.roads.lanePoint(eIn, eIn.length - BLEND, { x: 0, z: 0 });
    const p2 = this.roads.lanePoint(eOut, BLEND, { x: 0, z: 0 });
    // Tangentes en los puntos de mezcla (válidas también para aristas curvas).
    const tIn = this.roads.tangentAt(eIn, eIn.length - BLEND, { x: 0, z: 0 });
    const tOut = this.roads.tangentAt(eOut, BLEND, { x: 0, z: 0 });
    // Punto de control: intersección de las dos líneas de carril.
    const det = tIn.x * tOut.z - tIn.z * tOut.x;
    let cx: number;
    let cz: number;
    if (Math.abs(det) < 1e-6) {
      cx = (p0.x + p2.x) / 2;
      cz = (p0.z + p2.z) / 2;
    } else {
      const u = ((p2.x - p0.x) * tOut.z - (p2.z - p0.z) * tOut.x) / det;
      cx = p0.x + tIn.x * u;
      cz = p0.z + tIn.z * u;
    }
    const omt = 1 - t;
    car.x = omt * omt * p0.x + 2 * omt * t * cx + t * t * p2.x;
    car.z = omt * omt * p0.z + 2 * omt * t * cz + t * t * p2.z;
    const dx = 2 * omt * (cx - p0.x) + 2 * t * (p2.x - cx);
    const dz = 2 * omt * (cz - p0.z) + 2 * t * (p2.z - cz);
    car.heading = Math.atan2(dx, dz);
  }
}
