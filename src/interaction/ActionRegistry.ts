import type { Interactable } from './Interactable';
import type { MenuAction } from './MenuAction';

/** Resuelve las acciones disponibles para un objeto concreto. */
export type ActionProvider = (interactable: Interactable) => MenuAction[];

/**
 * Registro de acciones por `type` de objeto. Es el punto de extensión (OCP):
 * para que un nuevo tipo ofrezca acciones basta registrarlas aquí; ni el menú
 * ni el controlador cambian.
 */
export class ActionRegistry {
  private readonly providers = new Map<string, ActionProvider>();

  /** Registra un proveedor dinámico (las acciones pueden depender del objeto). */
  register(type: string, provider: ActionProvider): void {
    this.providers.set(type, provider);
  }

  /** Atajo para un conjunto fijo de acciones por tipo. */
  registerActions(type: string, actions: MenuAction[]): void {
    this.providers.set(type, () => actions);
  }

  /** Acciones para un objeto (vacío si su tipo no tiene proveedor). */
  actionsFor(interactable: Interactable): MenuAction[] {
    return this.providers.get(interactable.type)?.(interactable) ?? [];
  }
}
