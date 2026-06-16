import { Rng } from './Rng';

/**
 * Pequeño RNG determinista derivado de un id o de una posición. Sirve para
 * generar detalle (interiores de casas, islas de rotonda…) sin consumir el RNG
 * principal de la ciudad, de modo que añadir ese detalle no reordena el resto
 * de la generación.
 */
export function rng2(seed: number): Rng {
  return new Rng(seed * 2654435761 + 12345);
}
