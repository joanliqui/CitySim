import * as THREE from 'three';

/**
 * Objeto del mundo que se puede pulsar con el botón derecho para abrir su menú
 * de acciones. Se describe con un AABB en coordenadas de mundo, de modo que la
 * interacción queda DESACOPLADA del render (no depende de mallas instanciadas):
 * cualquier cosa con un volumen y un `type` puede volverse interactuable.
 */
export interface Interactable {
  /** Identificador único (para depurar/distinguir instancias). */
  readonly id: string;
  /** Tipo lógico que resuelve qué acciones ofrece (p. ej. `'wardrobe'`). */
  readonly type: string;
  /** Nombre legible, para el título del menú. */
  readonly label: string;
  /** Caja de selección en coordenadas de mundo. */
  readonly bounds: THREE.Box3;
  /** Datos arbitrarios que las acciones pueden necesitar. */
  readonly data?: unknown;
}
