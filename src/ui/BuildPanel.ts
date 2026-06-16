export interface BuildPass {
  label: string;
  detail: string;
  layers: string[];
}

export interface BuildPanelCallbacks {
  onApply: (visibleLayers: Set<string>) => void;
  onFocusBillboard: () => void;
}

export class BuildPanel {
  private readonly el: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private readonly steps: HTMLButtonElement[];
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly collapseBtn: HTMLButtonElement;
  private readonly roofsBtn: HTMLButtonElement;
  private step = 0;
  private timer = 0;
  private roofsVisible = true;

  constructor(root: HTMLElement, private readonly passes: BuildPass[], private readonly callbacks: BuildPanelCallbacks) {
    this.step = passes.length - 1;
    root.insertAdjacentHTML(
      'beforeend',
      `
      <div class="panel build-panel">
        <button class="btn mini build-collapse" title="Minimizar panel">›</button>
        <div class="build-content">
          <div class="build-title">Construcción</div>
          <div class="build-current"></div>
          <div class="build-detail"></div>
          <div class="build-controls">
            <button class="btn mini build-reset" title="Volver al primer pase">Inicio</button>
            <button class="btn mini build-prev" title="Pase anterior">‹</button>
            <button class="btn mini build-play" title="Reproducir pases">▶</button>
            <button class="btn mini build-next" title="Pase siguiente">›</button>
          </div>
          <button class="btn mini build-roofs" title="Ocultar tejados para ver los interiores">Quitar tejados</button>
          <button class="btn mini build-billboard" title="Enfocar la valla publicitaria">Ver valla publicitaria</button>
          <div class="build-steps"></div>
        </div>
      </div>
      `,
    );

    this.el = root.querySelector('.build-panel')!;
    this.title = this.el.querySelector('.build-current')!;
    this.detail = this.el.querySelector('.build-detail')!;
    this.prevBtn = this.el.querySelector('.build-prev')!;
    this.nextBtn = this.el.querySelector('.build-next')!;
    this.playBtn = this.el.querySelector('.build-play')!;
    this.collapseBtn = this.el.querySelector('.build-collapse')!;
    this.roofsBtn = this.el.querySelector('.build-roofs')!;

    const stepBox = this.el.querySelector<HTMLDivElement>('.build-steps')!;
    this.steps = passes.map((pass, i) => {
      const btn = document.createElement('button');
      btn.className = 'build-step';
      btn.type = 'button';
      btn.innerHTML = `<span>${i + 1}</span><strong>${pass.label}</strong>`;
      btn.addEventListener('click', () => this.setStep(i));
      stepBox.appendChild(btn);
      return btn;
    });

    this.el.querySelector('.build-reset')!.addEventListener('click', () => this.setStep(0));
    this.prevBtn.addEventListener('click', () => this.setStep(this.step - 1));
    this.nextBtn.addEventListener('click', () => this.setStep(this.step + 1));
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.el.querySelector('.build-billboard')!.addEventListener('click', () => this.callbacks.onFocusBillboard());
    this.roofsBtn.addEventListener('click', () => {
      this.roofsVisible = !this.roofsVisible;
      this.apply();
    });
    this.collapseBtn.addEventListener('click', () => {
      this.stop();
      this.el.classList.toggle('collapsed');
      this.collapseBtn.textContent = this.el.classList.contains('collapsed') ? '‹' : '›';
      this.collapseBtn.title = this.el.classList.contains('collapsed') ? 'Mostrar panel' : 'Minimizar panel';
    });

    this.apply();
  }

  private setStep(step: number): void {
    this.step = Math.min(Math.max(step, 0), this.passes.length - 1);
    this.apply();
    if (this.step === this.passes.length - 1) this.stop();
  }

  private apply(): void {
    const pass = this.passes[this.step];
    this.title.textContent = `${this.step + 1}. ${pass.label}`;
    this.detail.textContent = pass.detail;
    this.prevBtn.disabled = this.step === 0;
    this.nextBtn.disabled = this.step === this.passes.length - 1;
    this.steps.forEach((btn, i) => {
      btn.classList.toggle('done', i < this.step);
      btn.classList.toggle('active', i === this.step);
    });
    const layers = new Set(pass.layers);
    if (!this.roofsVisible) layers.delete('roofs');
    this.roofsBtn.textContent = this.roofsVisible ? 'Quitar tejados' : 'Mostrar tejados';
    this.roofsBtn.classList.toggle('active', !this.roofsVisible);
    this.roofsBtn.disabled = !pass.layers.includes('roofs');
    this.callbacks.onApply(layers);
  }

  private togglePlay(): void {
    if (this.timer) {
      this.stop();
      return;
    }
    if (this.step >= this.passes.length - 1) this.setStep(0);
    this.playBtn.textContent = 'Pausa';
    this.timer = window.setInterval(() => this.setStep(this.step + 1), 950);
  }

  private stop(): void {
    if (!this.timer) return;
    window.clearInterval(this.timer);
    this.timer = 0;
    this.playBtn.textContent = '▶';
  }
}
