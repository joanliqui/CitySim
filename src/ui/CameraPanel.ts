export interface CameraPanelCallbacks {
  /** Velocidad base de vuelo actual (m/s), para poblar el control al iniciar. */
  getFlySpeed: () => number;
  onSetFlySpeed: (value: number) => void;
}

/** Panel de ajustes de cámara (abajo a la derecha): velocidad de vuelo, etc. */
export class CameraPanel {
  private readonly el: HTMLDivElement;
  private readonly collapseBtn: HTMLButtonElement;

  constructor(root: HTMLElement, callbacks: CameraPanelCallbacks) {
    const speed = callbacks.getFlySpeed();
    root.insertAdjacentHTML(
      'beforeend',
      `
      <div class="panel camera-panel">
        <button class="btn mini camera-collapse" title="Minimizar panel">›</button>
        <div class="camera-content">
          <div class="camera-title">Cámara</div>
          <div class="setting-row">
            <label>Velocidad</label>
            <input class="camera-flyspeed" type="range" min="5" max="200" step="5" value="${speed}" />
            <span class="camera-flyspeed-label">${speed} m/s</span>
          </div>
          <div class="camera-hint">Mantén Shift para acelerar el vuelo</div>
        </div>
      </div>
      `,
    );

    this.el = root.querySelector('.camera-panel')!;
    this.collapseBtn = this.el.querySelector('.camera-collapse')!;

    const slider = this.el.querySelector<HTMLInputElement>('.camera-flyspeed')!;
    const label = this.el.querySelector<HTMLSpanElement>('.camera-flyspeed-label')!;
    slider.addEventListener('input', () => {
      const v = parseInt(slider.value, 10);
      label.textContent = `${v} m/s`;
      callbacks.onSetFlySpeed(v);
    });
    // Al soltar el slider, devolvemos el foco al canvas: mientras el <input> de
    // rango tenga el foco, CameraRig ignora las teclas de cámara (isTextInput),
    // así que sin esto habría que pulsar fuera del HUD para volver a mover la cámara.
    const releaseFocus = () => slider.blur();
    slider.addEventListener('change', releaseFocus);
    slider.addEventListener('pointerup', releaseFocus);

    this.collapseBtn.addEventListener('click', () => {
      const collapsed = this.el.classList.toggle('collapsed');
      this.collapseBtn.textContent = collapsed ? '‹' : '›';
      this.collapseBtn.title = collapsed ? 'Mostrar panel' : 'Minimizar panel';
    });
  }
}
