import { FOOD_CATALOG, type FoodKind } from '../city/food/FoodTypes';
import { usedSpace, type FridgeStore } from '../city/food/Fridge';

/**
 * Popup (solo lectura) con el contenido de una nevera: arriba el espacio total y
 * el ocupado (con barra), y debajo la lista de alimentos agrupados por tipo. No
 * sabe de render ni del mundo: recibe un `FridgeStore` y lo pinta.
 */
export class FridgePopup {
  private readonly overlay: HTMLDivElement;
  private readonly titleEl: HTMLElement;
  private readonly summaryEl: HTMLElement;
  private readonly listEl: HTMLElement;

  constructor(root: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'fridge-overlay hidden';
    this.overlay.innerHTML = `
      <div class="fridge panel">
        <div class="fridge-header">
          <span class="fridge-title">Nevera</span>
          <button class="btn mini fridge-close" title="Cerrar">✕</button>
        </div>
        <div class="fridge-summary"></div>
        <div class="fridge-list"></div>
      </div>`;
    root.appendChild(this.overlay);
    this.titleEl = this.overlay.querySelector('.fridge-title')!;
    this.summaryEl = this.overlay.querySelector('.fridge-summary')!;
    this.listEl = this.overlay.querySelector('.fridge-list')!;

    // Cerrar: botón ✕, clic en el fondo o Escape.
    this.overlay.querySelector('.fridge-close')!.addEventListener('click', () => this.close());
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.overlay.classList.contains('hidden') && e.key === 'Escape') this.close();
    });
  }

  /** Muestra el contenido de `store`, con un título opcional. */
  open(store: FridgeStore, title = 'Nevera'): void {
    this.titleEl.textContent = title;

    const used = usedSpace(store);
    const pct = store.capacity > 0 ? (used / store.capacity) * 100 : 0;
    this.summaryEl.innerHTML = `
      <div class="fridge-space">
        <div><span class="fridge-space-label">Espacio total</span><span class="fridge-space-value">${store.capacity.toFixed(0)}</span></div>
        <div><span class="fridge-space-label">Ocupado</span><span class="fridge-space-value">${used.toFixed(0)} · ${Math.round(pct)}%</span></div>
      </div>
      <div class="fridge-bar"><span style="width:${Math.min(100, pct)}%"></span></div>`;

    // Agrupa por tipo conservando el orden de primera aparición.
    const counts = new Map<FoodKind, number>();
    for (const it of store.items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);

    this.listEl.innerHTML = '';
    if (counts.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'fridge-empty';
      empty.textContent = 'La nevera está vacía.';
      this.listEl.appendChild(empty);
    } else {
      for (const [kind, n] of counts) {
        const def = FOOD_CATALOG[kind];
        const row = document.createElement('div');
        row.className = 'fridge-row';
        row.innerHTML = `
          <span class="fridge-food">${def.label}</span>
          <span class="fridge-qty">×${n}</span>
          <span class="fridge-size">${(def.size * n).toFixed(0)} esp.</span>`;
        this.listEl.appendChild(row);
      }
    }

    this.overlay.classList.remove('hidden');
  }

  close(): void {
    this.overlay.classList.add('hidden');
  }
}
