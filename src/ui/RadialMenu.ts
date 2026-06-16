/** Una opción dibujable del menú radial. */
export interface RadialMenuItem {
  id: string;
  label: string;
  icon?: string;
}

/**
 * Menú radial contextual (DOM). Solo se ocupa de PINTAR opciones alrededor de
 * un punto y de avisar cuál se elige; no sabe nada de objetos del mundo ni de
 * acciones. El contenedor no captura el puntero (`pointer-events: none`); solo
 * lo hacen los botones, para que pulsar fuera siga llegando a la cámara.
 */
export class RadialMenu {
  private readonly container: HTMLDivElement;
  private readonly hub: HTMLDivElement;
  private onSelect: ((id: string) => void) | null = null;
  private opened = false;

  constructor(root: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'radial-menu hidden';
    this.hub = document.createElement('div');
    this.hub.className = 'radial-hub';
    this.container.appendChild(this.hub);
    root.appendChild(this.container);
  }

  get isOpen(): boolean {
    return this.opened;
  }

  /** ¿El target del evento pertenece al menú? (para no cerrarlo al pulsar una opción). */
  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.container.contains(target);
  }

  open(clientX: number, clientY: number, title: string, items: RadialMenuItem[], onSelect: (id: string) => void): void {
    this.onSelect = onSelect;
    this.hub.innerHTML = '';
    this.hub.style.left = `${clientX}px`;
    this.hub.style.top = `${clientY}px`;

    const radius = 78;
    const n = items.length;
    items.forEach((item, i) => {
      // Arranca arriba (-90°) y reparte el resto en círculo.
      const angle = -Math.PI / 2 + (n > 1 ? (i / n) * Math.PI * 2 : 0);
      const btn = document.createElement('button');
      btn.className = 'radial-option';
      btn.style.left = `${Math.cos(angle) * radius}px`;
      btn.style.top = `${Math.sin(angle) * radius}px`;
      btn.innerHTML = item.icon ? `<span class="radial-icon">${item.icon}</span><span>${item.label}</span>` : item.label;
      btn.addEventListener('click', () => {
        const cb = this.onSelect;
        this.close();
        cb?.(item.id);
      });
      this.hub.appendChild(btn);
    });

    const center = document.createElement('div');
    center.className = 'radial-center';
    center.textContent = title;
    this.hub.appendChild(center);

    this.container.classList.remove('hidden');
    this.opened = true;
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.onSelect = null;
    this.container.classList.add('hidden');
  }
}
