import type { TreeKind } from '../../city/vegetation/types/TreeTypes';
import { PalmTreeRenderer } from './PalmTreeRenderer';
import { PineTreeRenderer } from './PineTreeRenderer';
import { RoundTreeRenderer } from './RoundTreeRenderer';
import type { TreeRenderer } from './TreeRenderer';

/** Registro de renderers por especie. Espejo de `src/city/vegetation/registry.ts`. */
export const treeRenderers: Record<TreeKind, TreeRenderer> = {
  round: new RoundTreeRenderer(),
  pine: new PineTreeRenderer(),
  palm: new PalmTreeRenderer(),
};
