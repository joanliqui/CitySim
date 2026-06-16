import type { CityModel } from '../city/CityModel';
import { RoadGraph } from '../city/RoadGraph';
import { SidewalkGraph } from '../city/SidewalkGraph';
import { PedestrianSystem } from './PedestrianSystem';
import { TrafficLightSystem } from './TrafficLightSystem';
import { VehicleSystem } from './VehicleSystem';

export interface SimStats {
  vehicles: number;
  walking: number;
  waiting: number;
  inside: number;
}

/** Orquesta los sistemas de la simulación con paso de tiempo fijo. */
export class Simulation {
  readonly roads: RoadGraph;
  readonly sidewalks: SidewalkGraph;
  readonly lights: TrafficLightSystem;
  readonly vehicleSystem: VehicleSystem;
  readonly pedestrianSystem: PedestrianSystem;

  constructor(
    readonly model: CityModel,
    options: { vehicles: number; pedestrians: number; seed: number },
  ) {
    this.roads = new RoadGraph(model);
    this.sidewalks = new SidewalkGraph(model);
    this.lights = new TrafficLightSystem(model.intersections.length, model.roundabouts);
    this.vehicleSystem = new VehicleSystem(model, this.roads, this.lights, options.vehicles, options.seed + 1);
    this.pedestrianSystem = new PedestrianSystem(model, this.sidewalks, this.lights, options.pedestrians, options.seed + 2);
  }

  step(dt: number, time: number): void {
    this.vehicleSystem.step(dt, time);
    this.pedestrianSystem.step(dt, time);
  }

  stats(): SimStats {
    let walking = 0;
    let waiting = 0;
    let inside = 0;
    for (const p of this.pedestrianSystem.pedestrians) {
      if (p.state === 'inside') inside++;
      else if (p.state === 'waiting') waiting++;
      else walking++;
    }
    return { vehicles: this.vehicleSystem.vehicles.length, walking, waiting, inside };
  }
}
