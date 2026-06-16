import { Rng } from '../../core/Rng';
import type { Tree } from '../CityModel';
import { PalmTreeFactory } from './PalmTreeFactory';
import { PineTreeFactory } from './PineTreeFactory';
import { RoundTreeFactory } from './RoundTreeFactory';
import { TreeFactory } from './TreeFactory';
import type { TreeKind, TreeZone } from './types/TreeTypes';

/** Registro de factorías por especie. Espejo de la creación de edificios. */
export const treeFactories: Record<TreeKind, TreeFactory> = {
  round: new RoundTreeFactory(),
  pine: new PineTreeFactory(),
  palm: new PalmTreeFactory(),
};

/**
 * Elige la especie según la zona (reemplaza a `pickTreeKind`). Consume un único
 * `rng.next()` con los mismos umbrales originales, así que la ciudad no cambia.
 */
function pickTreeFactory(rng: Rng, zone: TreeZone): TreeFactory {
  const roll = rng.next();
  if (zone === 'island') return roll < 0.35 ? treeFactories.pine : treeFactories.round;
  if (zone === 'park') {
    if (roll < 0.18) return treeFactories.palm;
    if (roll < 0.38) return treeFactories.pine;
    return treeFactories.round;
  }
  if (roll < 0.08) return treeFactories.palm;
  if (roll < 0.24) return treeFactories.pine;
  return treeFactories.round;
}

/** Crea un árbol de la zona dada en (x,z). `lush` ensancha copas en parques. */
export function makeTree(rng: Rng, x: number, z: number, lush = false, zone: TreeZone = 'street'): Tree {
  return pickTreeFactory(rng, zone).make(rng, x, z, lush);
}

/** ¿La copa del árbol (radio × holgura de la especie) cabe en el rectángulo verde? */
export function treeFitsGrassRect(t: Tree, x0: number, x1: number, z0: number, z1: number): boolean {
  const margin = treeFactories[t.kind].clearanceFactor * t.r;
  return t.x - margin >= x0 && t.x + margin <= x1 && t.z - margin >= z0 && t.z + margin <= z1;
}
