import * as THREE from 'three';
import type { RadialMenu } from '../ui/RadialMenu';
import type { ActionRegistry } from './ActionRegistry';
import type { InteractableRegistry } from './InteractableRegistry';

const TAP_PIXELS = 6; // movimiento máx. del puntero para considerarlo "clic", no arrastre
const CAM_EPSILON = 0.05; // movimiento máx. de la cámara para no considerarlo navegación

/**
 * Orquesta la interacción con botón derecho: distingue un CLIC limpio (abre el
 * menú) de un gesto de cámara (arrastre de órbita o desplazamiento con WASD), y
 * cierra el menú al pulsar fuera, al empezar a navegar o con Escape.
 *
 * Depende solo de abstracciones (registros + menú), no de mallas ni de la
 * cámara concreta, así que es fácil de extender o de probar (DIP).
 */
export class InteractionController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly camStart = new THREE.Vector3();
  private downX = 0;
  private downY = 0;
  private armed = false;

  constructor(
    private readonly dom: HTMLElement,
    private readonly camera: THREE.Camera,
    private readonly interactables: InteractableRegistry,
    private readonly actions: ActionRegistry,
    private readonly menu: RadialMenu,
  ) {
    // En captura, antes que nadie: pulsar fuera del menú (o empezar a navegar
    // con el botón derecho) lo cierra; y se "arma" la detección del clic.
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (this.menu.isOpen && !this.menu.contains(e.target)) this.menu.close();
        if (e.button === 2) {
          this.downX = e.clientX;
          this.downY = e.clientY;
          this.camStart.copy(this.camera.position);
          this.armed = true;
        }
      },
      true,
    );

    this.dom.addEventListener('pointerup', (e) => {
      if (e.button !== 2 || !this.armed) return;
      this.armed = false;
      const moved = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
      const camMoved = this.camera.position.distanceTo(this.camStart);
      if (moved > TAP_PIXELS || camMoved > CAM_EPSILON) return; // fue navegación, no un clic
      this.tryOpen(e.clientX, e.clientY);
    });

    // Empezar a moverse con WASD (o Escape) cierra el menú abierto.
    window.addEventListener('keydown', (e) => {
      if (!this.menu.isOpen) return;
      if (e.code === 'Escape' || isMoveKey(e.code)) this.menu.close();
    });
  }

  private tryOpen(clientX: number, clientY: number): void {
    this.pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.interactables.raycast(this.raycaster.ray);
    if (!hit) return;
    const actions = this.actions.actionsFor(hit);
    if (actions.length === 0) return;

    this.menu.open(
      clientX,
      clientY,
      hit.label,
      actions.map((a) => ({ id: a.id, label: a.label, icon: a.icon })),
      (id) => actions.find((a) => a.id === id)?.run({ interactable: hit }),
    );
  }
}

function isMoveKey(code: string): boolean {
  return (
    code === 'KeyW' ||
    code === 'KeyA' ||
    code === 'KeyS' ||
    code === 'KeyD' ||
    code === 'KeyQ' ||
    code === 'KeyE' ||
    code === 'ArrowUp' ||
    code === 'ArrowDown' ||
    code === 'ArrowLeft' ||
    code === 'ArrowRight'
  );
}
