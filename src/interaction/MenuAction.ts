import type { Interactable } from './Interactable';

/** Contexto que recibe una acción al ejecutarse. */
export interface MenuActionContext {
  /** Objeto sobre el que se abrió el menú. */
  readonly interactable: Interactable;
}

/**
 * Una acción del menú radial. Encapsula su propia conducta (`run`), así que
 * añadir comportamientos no obliga a tocar el menú ni el controlador.
 */
export interface MenuAction {
  readonly id: string;
  readonly label: string;
  /** Emoji/símbolo opcional para la opción. */
  readonly icon?: string;
  run(ctx: MenuActionContext): void;
}
