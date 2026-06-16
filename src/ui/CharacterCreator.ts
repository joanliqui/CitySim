import * as THREE from 'three';
import {
  buildCharacter,
  disposeCharacter,
  DEFAULT_APPEARANCE,
  HAIR_COLORS,
  HAIR_STYLES,
  PANTS_COLORS,
  SHIRT_PALETTE,
  SKIN_COLORS,
  type CharacterAppearance,
} from '../render/CharacterFactory';

/**
 * Popup de creación de personaje: vista previa 3D (turntable con renderer
 * propio) y panel de personalización (peinado, colores, altura). Al confirmar
 * entrega el aspecto elegido y se cierra.
 */
export class CharacterCreator {
  private readonly overlay: HTMLDivElement;
  private appearance: CharacterAppearance = { ...DEFAULT_APPEARANCE };

  /* Escena de la vista previa. */
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private character: THREE.Group | null = null;
  private spin = 0;
  private rafId = 0;
  private lastT = 0;

  constructor(parent: HTMLElement, private readonly onCreate: (appearance: CharacterAppearance) => void) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'creator-overlay hidden';
    this.overlay.innerHTML = `
      <div class="creator panel">
        <div class="creator-header">
          <span>👤 Crear personaje</span>
          <button class="btn mini creator-close" title="Cerrar">✕</button>
        </div>
        <div class="creator-body">
          <div class="creator-controls">
            <div class="creator-section">Peinado</div>
            <div class="creator-grid hair-styles"></div>
            <div class="creator-section">Color de pelo</div>
            <div class="creator-swatches hair-colors"></div>
            <div class="creator-section">Piel</div>
            <div class="creator-swatches skin-colors"></div>
            <div class="creator-section">Camiseta</div>
            <div class="creator-swatches shirt-colors"></div>
            <div class="creator-section">Pantalón</div>
            <div class="creator-swatches pants-colors"></div>
            <div class="creator-section">Altura</div>
            <input class="creator-height" type="range" min="0.85" max="1.15" step="0.01" value="1" />
          </div>
          <canvas class="creator-canvas" width="300" height="380"></canvas>
        </div>
        <div class="creator-footer">
          <button class="btn creator-cancel">Cancelar</button>
          <button class="btn creator-confirm">✔ Crear personaje</button>
        </div>
      </div>
    `;
    parent.appendChild(this.overlay);

    /* ── Controles ── */
    const styleBox = this.overlay.querySelector<HTMLDivElement>('.hair-styles')!;
    for (const style of HAIR_STYLES) {
      const btn = document.createElement('button');
      btn.className = 'btn mini hair-btn';
      btn.textContent = style.label;
      btn.dataset.id = style.id;
      btn.addEventListener('click', () => {
        this.appearance.hairStyle = style.id;
        this.markActive(styleBox, btn);
        this.rebuild();
      });
      styleBox.appendChild(btn);
    }

    this.buildSwatches('.hair-colors', HAIR_COLORS, (c) => (this.appearance.hairColor = c));
    this.buildSwatches('.skin-colors', SKIN_COLORS, (c) => (this.appearance.skinColor = c));
    this.buildSwatches('.shirt-colors', SHIRT_PALETTE, (c) => (this.appearance.shirtColor = c));
    this.buildSwatches('.pants-colors', PANTS_COLORS, (c) => (this.appearance.pantsColor = c));

    const height = this.overlay.querySelector<HTMLInputElement>('.creator-height')!;
    height.addEventListener('input', () => {
      this.appearance.height = parseFloat(height.value);
      this.rebuild();
    });

    this.overlay.querySelector('.creator-close')!.addEventListener('click', () => this.close());
    this.overlay.querySelector('.creator-cancel')!.addEventListener('click', () => this.close());
    this.overlay.querySelector('.creator-confirm')!.addEventListener('click', () => {
      this.onCreate({ ...this.appearance });
      this.close();
    });
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.close();
    });

    /* ── Vista previa 3D ── */
    const canvas = this.overlay.querySelector<HTMLCanvasElement>('.creator-canvas')!;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera = new THREE.PerspectiveCamera(38, canvas.width / canvas.height, 0.1, 20);
    this.camera.position.set(0, 1.5, 3.4);
    this.camera.lookAt(0, 0.95, 0);

    this.scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x55504a, 0.95));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.4);
    sun.position.set(2.5, 4, 3);
    this.scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x46505c }),
    );
    this.scene.add(ground);
  }

  open(): void {
    this.overlay.classList.remove('hidden');
    // Marca los valores por defecto como activos al abrir por primera vez.
    this.syncActive();
    this.rebuild();
    this.lastT = performance.now();
    const loop = (t: number) => {
      this.spin += (t - this.lastT) * 0.0009;
      this.lastT = t;
      if (this.character) this.character.rotation.y = this.spin;
      this.renderer.render(this.scene, this.camera);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  close(): void {
    this.overlay.classList.add('hidden');
    cancelAnimationFrame(this.rafId);
  }

  /** Reconstruye el personaje de la vista previa con el aspecto actual. */
  private rebuild(): void {
    if (this.character) {
      this.scene.remove(this.character);
      disposeCharacter(this.character);
    }
    this.character = buildCharacter(this.appearance);
    this.character.rotation.y = this.spin;
    this.scene.add(this.character);
  }

  private buildSwatches(selector: string, colors: number[], apply: (c: number) => void): void {
    const box = this.overlay.querySelector<HTMLDivElement>(selector)!;
    for (const color of colors) {
      const btn = document.createElement('button');
      btn.className = 'swatch';
      btn.dataset.color = color.toString();
      btn.style.background = `#${color.toString(16).padStart(6, '0')}`;
      btn.addEventListener('click', () => {
        apply(color);
        this.markActive(box, btn);
        this.rebuild();
      });
      box.appendChild(btn);
    }
  }

  private markActive(box: HTMLElement, active: HTMLElement): void {
    for (const el of box.children) el.classList.toggle('active', el === active);
  }

  /** Refleja el aspecto actual en los botones/muestras (estado activo). */
  private syncActive(): void {
    const byData = (selector: string, value: string) => {
      const box = this.overlay.querySelector<HTMLElement>(selector)!;
      for (const el of box.children) {
        const h = el as HTMLElement;
        h.classList.toggle('active', h.dataset.id === value || h.dataset.color === value);
      }
    };
    byData('.hair-styles', this.appearance.hairStyle);
    byData('.hair-colors', this.appearance.hairColor.toString());
    byData('.skin-colors', this.appearance.skinColor.toString());
    byData('.shirt-colors', this.appearance.shirtColor.toString());
    byData('.pants-colors', this.appearance.pantsColor.toString());
  }
}
