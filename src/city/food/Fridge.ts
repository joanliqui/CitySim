/**
 * Nevera: almacén de comida con CAPACIDAD de espacio limitada. Datos puros (sin
 * Three.js). La comida ocupa espacio según su `size` (ver `FoodTypes`); cuando no
 * queda hueco no entra más. Se adjunta al mueble `fridge` de cada vivienda.
 */
import type { Rng } from '../../core/Rng';
import { FOOD_CATALOG, FOOD_KINDS, type FoodKind } from './FoodTypes';

/** Una unidad de comida almacenada. El tamaño/aporte se leen del catálogo. */
export interface FoodItem {
  kind: FoodKind;
}

/** Contenido de una nevera: capacidad total + comida guardada. */
export interface FridgeStore {
  /** Capacidad de espacio (mismas unidades que `FoodDef.size`). */
  capacity: number;
  /** Comida almacenada. */
  items: FoodItem[];
}

/** Espacio ocupado por la comida guardada. */
export function usedSpace(store: FridgeStore): number {
  let used = 0;
  for (const it of store.items) used += FOOD_CATALOG[it.kind].size;
  return used;
}

/** Espacio libre que queda en la nevera. */
export function freeSpace(store: FridgeStore): number {
  return store.capacity - usedSpace(store);
}

/** ¿Cabe una unidad de `kind` en el espacio libre actual? */
export function canStore(store: FridgeStore, kind: FoodKind): boolean {
  return FOOD_CATALOG[kind].size <= freeSpace(store);
}

/** Guarda una unidad de `kind` si cabe. Devuelve si se pudo guardar. */
export function addFood(store: FridgeStore, kind: FoodKind): boolean {
  if (!canStore(store, kind)) return false;
  store.items.push({ kind });
  return true;
}

/** Crea una nevera vacía con la capacidad dada. */
export function makeFridgeStore(capacity: number): FridgeStore {
  return { capacity, items: [] };
}

/**
 * Llena una nevera con comida variada al azar (RNG seeded) hasta cubrir una
 * fracción de su capacidad, eligiendo solo entre lo que va cabiendo. Determinista.
 */
export function stockFridge(store: FridgeStore, rng: Rng): void {
  const target = store.capacity * rng.range(0.4, 0.9);
  while (usedSpace(store) < target) {
    const space = freeSpace(store);
    const fit = FOOD_KINDS.filter((k) => FOOD_CATALOG[k].size <= space);
    if (fit.length === 0) break; // no cabe nada más
    addFood(store, rng.pick(fit));
  }
}
