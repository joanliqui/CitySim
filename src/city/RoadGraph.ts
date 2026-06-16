import { CITY, sampleCurve, type CityModel, type RoadEdge, type Vec2 } from './CityModel';

/**
 * Consultas geométricas sobre el grafo vial. El tráfico circula por la derecha:
 * cada arista dirigida tiene su carril desplazado lateralmente respecto al eje.
 * Las aristas pueden ser rectas (camino rápido) o curvas (muestreo por arco).
 */
export class RoadGraph {
  private readonly tmpP: Vec2 = { x: 0, z: 0 };
  private readonly tmpT: Vec2 = { x: 0, z: 0 };

  constructor(private readonly model: CityModel) {}

  edge(id: number): RoadEdge {
    return this.model.edges[id];
  }

  /** Posición sobre el carril de una arista a distancia `s` de su origen. */
  lanePoint(edge: RoadEdge, s: number, out: Vec2): Vec2 {
    if (edge.curve) {
      sampleCurve(edge.curve, s, this.tmpP, this.tmpT);
      // Derecha respecto a la tangente (conducción por la derecha).
      out.x = this.tmpP.x - this.tmpT.z * CITY.laneOffset;
      out.z = this.tmpP.z + this.tmpT.x * CITY.laneOffset;
      return out;
    }
    const from = this.model.intersections[edge.from];
    // Vector "derecha" respecto a la dirección de avance (conducción por la derecha).
    const rx = -edge.dirZ;
    const rz = edge.dirX;
    out.x = from.x + edge.dirX * s + rx * CITY.laneOffset;
    out.z = from.z + edge.dirZ * s + rz * CITY.laneOffset;
    return out;
  }

  /** Tangente unitaria (dirección de avance) de una arista a distancia `s`. */
  tangentAt(edge: RoadEdge, s: number, out: Vec2): Vec2 {
    if (edge.curve) {
      sampleCurve(edge.curve, s, this.tmpP, out);
      return out;
    }
    out.x = edge.dirX;
    out.z = edge.dirZ;
    return out;
  }

  /**
   * Aristas salientes válidas desde el nodo destino de `edge`,
   * excluyendo el cambio de sentido salvo que sea la única opción.
   */
  continuations(edge: RoadEdge): RoadEdge[] {
    const options = this.model.outgoing[edge.to].map((id) => this.model.edges[id]);
    const noUTurn = options.filter((e) => e.to !== edge.from);
    return noUTurn.length > 0 ? noUTurn : options;
  }
}
