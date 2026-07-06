import type { SimStats } from '../sim/Simulation';

export interface AgentStat {
  label: string;
  /** Valor 0–100. */
  value: number;
}

export interface AgentAction {
  /** Identificador que se devuelve al pulsar (lo enruta App). */
  id: string;
  label: string;
}

export interface AgentDetail {
  label: string;
  value: string;
  /** Si true, el valor se renderiza como enlace y llama a onFocusHome al pulsar. */
  focusHome?: boolean;
}

/** Una tarea de la rutina del peatón, ya formateada para el panel. */
export interface RoutineTaskInfo {
  icon: string;
  label: string;
  /** Estado legible ("en curso", "pendiente", "hecha", "fallida"). */
  state: string;
  /** Clase CSS del estado (activa | pendiente | hecha | fallida). */
  stateClass: string;
  /** Franja horaria ("13:30–16:00") o null si no tiene. */
  window: string | null;
  /** Puntuación actual en la subasta, o null si ahora mismo no compite. */
  score: number | null;
  /** Desglose de la puntuación u otro detalle ("base 80 + urgencia 12…"). */
  detail: string;
}

export interface AgentInfo {
  icon: string;
  title: string;
  status: string;
  detail: string;
  /** Datos textuales (p. ej. hogar) que se muestran en el panel de información. */
  details?: AgentDetail[];
  /** Stats opcionales (p. ej. personalidad del peatón); habilitan el botón. */
  stats?: AgentStat[];
  /** Rutina diaria (tareas ordenadas); habilita el botón Rutina. */
  routine?: RoutineTaskInfo[];
  /** Acciones contextuales (p. ej. "Ir a casa"); habilitan el botón Actions. */
  actions?: AgentAction[];
}

export interface SimSettings {
  hour: number;
  dayLength: number;
  seed: number;
  vehicles: number;
  pedestrians: number;
}

export interface HudCallbacks {
  onTogglePause: () => void;
  onSpeed: (speed: number) => void;
  onRelease: () => void;
  /** Estado actual para poblar el panel de ajustes al abrirlo. */
  getSettings: () => SimSettings;
  onSetHour: (hour: number) => void;
  onSetDayLength: (seconds: number) => void;
  /** Regenera la ciudad (recarga con nueva semilla/población). */
  onRegenerate: (seed: number, vehicles: number, pedestrians: number) => void;
  /** Abre el creador de personajes. */
  onCreateCharacter: () => void;
  /** Ejecuta una acción contextual del agente seleccionado (por id). */
  onAgentAction: (id: string) => void;
  /** Sitúa la cámara mirando al edificio del hogar del peatón seleccionado. */
  onFocusHome: () => void;
}

/** Panel de control (DOM plano): pausa, velocidad, ajustes, estadísticas y ficha del agente. */
export class Hud {
  private readonly panelTop: HTMLDivElement;
  private readonly minimizeBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly speedLabel: HTMLSpanElement;
  private readonly statsEl: HTMLDivElement;
  private readonly fpsEl: HTMLSpanElement;
  private readonly agentDock: HTMLDivElement;
  private readonly agentTitle: HTMLDivElement;
  private readonly agentStatus: HTMLDivElement;
  private readonly agentDetail: HTMLDivElement;
  private readonly statsToggle: HTMLButtonElement;
  private readonly agentStats: HTMLDivElement;
  private statsVisible = false;
  private readonly routineToggle: HTMLButtonElement;
  private readonly agentRoutine: HTMLDivElement;
  private routineVisible = false;
  private readonly actionsToggle: HTMLButtonElement;
  private readonly agentActionsPanel: HTMLDivElement;
  private readonly agentActions: HTMLDivElement;
  private actionsVisible = false;
  private actionsKey = '';
  private readonly settingsEl: HTMLDivElement;
  private readonly hourSlider: HTMLInputElement;
  private readonly hourLabel: HTMLSpanElement;

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    root.innerHTML = `
      <div class="panel panel-top">
        <div class="panel-title">
          <span>Ciudad&nbsp;3D</span>
          <span class="panel-title-tools">
            <span class="fps"></span>
            <button class="btn mini hud-minimize" title="Minimizar panel">‹</button>
          </span>
        </div>
        <div class="controls">
          <button class="btn pause" title="Pausar / reanudar">⏸</button>
          <input class="speed" type="range" min="0.5" max="8" step="0.5" value="1" />
          <span class="speed-label">×1.0</span>
          <button class="btn settings-toggle" title="Ajustes de la simulación">⚙</button>
        </div>
        <div class="controls">
          <button class="btn create-character">👤 Crear personaje</button>
        </div>
        <div class="settings hidden">
          <div class="setting-row">
            <label>Hora</label>
            <input class="hour" type="range" min="0" max="23.75" step="0.25" />
            <span class="hour-label">--:--</span>
          </div>
          <div class="setting-row presets">
            <button class="btn mini preset" data-hour="12">☀️ Mediodía</button>
            <button class="btn mini preset" data-hour="19.6">🌅 Atardecer</button>
            <button class="btn mini preset" data-hour="0.5">🌙 Noche</button>
          </div>
          <div class="setting-row">
            <label>Día dura</label>
            <input class="day-length" type="range" min="60" max="600" step="30" />
            <span class="day-length-label"></span>
          </div>
          <div class="settings-divider">Nueva ciudad</div>
          <div class="setting-row">
            <label>Semilla</label>
            <input class="seed num" type="number" min="0" max="999999999" />
            <button class="btn mini seed-random" title="Generar semilla aleatoria">🎲 Aleatoria</button>
          </div>
          <div class="setting-row">
            <label>Coches</label>
            <input class="cars num" type="number" min="0" max="300" />
            <label>Peatones</label>
            <input class="peds num" type="number" min="0" max="600" />
          </div>
          <div class="setting-row">
            <button class="btn regenerate">🔄 Regenerar ciudad</button>
          </div>
        </div>
        <div class="stats"></div>
      </div>
      <div class="agent-dock hidden">
        <div class="panel agent-card">
          <div class="agent-title"></div>
          <div class="agent-status"></div>
          <div class="agent-detail"></div>
          <button class="btn stats-toggle hidden">📋 Mostrar información</button>
          <div class="agent-stats hidden"></div>
          <button class="btn routine-toggle hidden">🗓️ Ver rutina</button>
          <div class="agent-routine hidden"></div>
          <button class="btn actions-toggle hidden">⚡ Actions</button>
          <button class="btn release">Dejar de seguir</button>
        </div>
        <div class="panel agent-actions-panel hidden">
          <div class="agent-actions-title">Acciones</div>
          <div class="agent-actions"></div>
        </div>
      </div>
      <div class="hint">Clic en un coche o peatón para seguirlo · ESC para soltar</div>
    `;

    this.panelTop = root.querySelector('.panel-top')!;
    this.minimizeBtn = root.querySelector('.hud-minimize')!;
    this.pauseBtn = root.querySelector('.pause')!;
    this.speedLabel = root.querySelector('.speed-label')!;
    this.statsEl = root.querySelector('.stats')!;
    this.fpsEl = root.querySelector('.fps')!;
    this.agentDock = root.querySelector('.agent-dock')!;
    this.agentTitle = root.querySelector('.agent-title')!;
    this.agentStatus = root.querySelector('.agent-status')!;
    this.agentDetail = root.querySelector('.agent-detail')!;
    this.statsToggle = root.querySelector('.stats-toggle')!;
    this.agentStats = root.querySelector('.agent-stats')!;
    this.routineToggle = root.querySelector('.routine-toggle')!;
    this.agentRoutine = root.querySelector('.agent-routine')!;
    this.actionsToggle = root.querySelector('.actions-toggle')!;
    this.agentActionsPanel = root.querySelector('.agent-actions-panel')!;
    this.agentActions = root.querySelector('.agent-actions')!;
    this.settingsEl = root.querySelector('.settings')!;
    this.hourSlider = root.querySelector('.hour')!;
    this.hourLabel = root.querySelector('.hour-label')!;

    this.minimizeBtn.addEventListener('click', () => this.toggleMinimized());
    this.pauseBtn.addEventListener('click', () => callbacks.onTogglePause());
    const slider = root.querySelector<HTMLInputElement>('.speed')!;
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      this.speedLabel.textContent = `×${v.toFixed(1)}`;
      callbacks.onSpeed(v);
    });
    root.querySelector('.release')!.addEventListener('click', () => callbacks.onRelease());
    this.statsToggle.addEventListener('click', () => this.toggleDropdown('stats'));
    this.routineToggle.addEventListener('click', () => this.toggleDropdown('routine'));
    this.actionsToggle.addEventListener('click', () => this.toggleDropdown('actions'));
    // Delegación: cada acción lleva su id en data-action.
    this.agentActions.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.agent-action');
      if (btn) callbacks.onAgentAction(btn.dataset.action!);
    });
    // Delegación: enlace al edificio del hogar.
    this.agentStats.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.agent-home-link')) callbacks.onFocusHome();
    });
    root.querySelector('.create-character')!.addEventListener('click', () => callbacks.onCreateCharacter());

    /* ── Ajustes ── */
    const dayLength = root.querySelector<HTMLInputElement>('.day-length')!;
    const dayLengthLabel = root.querySelector<HTMLSpanElement>('.day-length-label')!;
    const seed = root.querySelector<HTMLInputElement>('.seed')!;
    const cars = root.querySelector<HTMLInputElement>('.cars')!;
    const peds = root.querySelector<HTMLInputElement>('.peds')!;

    root.querySelector('.settings-toggle')!.addEventListener('click', () => {
      const open = this.settingsEl.classList.toggle('hidden');
      if (!open) {
        // Al abrir, refleja el estado actual de la simulación.
        const s = callbacks.getSettings();
        this.hourSlider.value = (Math.round(s.hour * 4) / 4).toString();
        this.hourLabel.textContent = formatHour(s.hour);
        dayLength.value = s.dayLength.toString();
        dayLengthLabel.textContent = `${s.dayLength} s`;
        seed.value = s.seed.toString();
        cars.value = s.vehicles.toString();
        peds.value = s.pedestrians.toString();
      }
    });

    this.hourSlider.addEventListener('input', () => {
      const h = parseFloat(this.hourSlider.value);
      this.hourLabel.textContent = formatHour(h);
      callbacks.onSetHour(h);
    });
    for (const btn of root.querySelectorAll<HTMLButtonElement>('.preset')) {
      btn.addEventListener('click', () => {
        const h = parseFloat(btn.dataset.hour!);
        this.hourSlider.value = h.toString();
        this.hourLabel.textContent = formatHour(h);
        callbacks.onSetHour(h);
      });
    }
    dayLength.addEventListener('input', () => {
      const s = parseInt(dayLength.value, 10);
      dayLengthLabel.textContent = `${s} s`;
      callbacks.onSetDayLength(s);
    });
    root.querySelector('.seed-random')!.addEventListener('click', () => {
      seed.value = randomSeed().toString();
    });
    root.querySelector('.regenerate')!.addEventListener('click', () => {
      callbacks.onRegenerate(
        clampInt(seed.value, 0, 999999999, 1),
        clampInt(cars.value, 0, 300, 70),
        clampInt(peds.value, 0, 600, 180),
      );
    });
  }

  private toggleMinimized(): void {
    const minimized = this.panelTop.classList.toggle('minimized');
    this.minimizeBtn.textContent = minimized ? '›' : '‹';
    this.minimizeBtn.title = minimized ? 'Mostrar panel' : 'Minimizar panel';
    this.minimizeBtn.setAttribute('aria-label', this.minimizeBtn.title);
  }

  setPaused(paused: boolean): void {
    this.pauseBtn.textContent = paused ? '▶' : '⏸';
  }

  setStats(stats: SimStats, fps: number, clockText: string): void {
    this.fpsEl.textContent = `${Math.round(fps)} fps`;
    this.statsEl.innerHTML = `
      <span class="clock">🕐 ${clockText}</span>
      <span>🚗 ${stats.vehicles} coches</span>
      <span>🚶 ${stats.walking} caminando</span>
      <span>🚦 ${stats.waiting} esperando</span>
      <span>🏠 ${stats.inside} en edificios</span>
      <span>💤 ${stats.sleeping} durmiendo</span>
    `;
  }

  showAgent(info: AgentInfo | null): void {
    if (!info) {
      this.agentDock.classList.add('hidden');
      return;
    }
    this.agentDock.classList.remove('hidden');
    this.agentTitle.textContent = `${info.icon} ${info.title}`;
    this.agentStatus.textContent = info.status;
    this.agentDetail.textContent = info.detail;

    const hasInfo = (info.details && info.details.length) || (info.stats && info.stats.length);
    if (hasInfo) {
      this.statsToggle.classList.remove('hidden');
      const rows = (info.details ?? [])
        .map((d) =>
          d.focusHome
            ? `<div class="agent-info-row"><span>${d.label}</span><button class="agent-home-link">${d.value}</button></div>`
            : `<div class="agent-info-row"><span>${d.label}</span><span>${d.value}</span></div>`,
        )
        .join('');
      const bars = (info.stats ?? [])
        .map(
          (s) => `
            <div class="agent-stat">
              <div class="agent-stat-head"><span>${s.label}</span><span>${Math.round(s.value)}</span></div>
              <div class="agent-stat-bar"><div class="agent-stat-fill" style="width:${Math.max(0, Math.min(100, s.value))}%"></div></div>
            </div>`,
        )
        .join('');
      this.agentStats.innerHTML = (rows ? `<div class="agent-info-rows">${rows}</div>` : '') + bars;
    } else {
      // Sin información (p. ej. vehículos): oculta botón y panel.
      this.statsToggle.classList.add('hidden');
      this.statsVisible = false;
      this.agentStats.innerHTML = '';
    }
    this.applyStatsVisibility();

    if (info.routine && info.routine.length) {
      this.routineToggle.classList.remove('hidden');
      // Se re-renderiza en cada refresco: las puntuaciones cambian en vivo.
      this.agentRoutine.innerHTML = info.routine
        .map(
          (t) => `
            <div class="routine-task ${t.stateClass}">
              <div class="routine-task-head">
                <span>${t.icon} ${t.label}</span>
                <span class="routine-score">${t.score === null ? '—' : Math.round(t.score)}</span>
              </div>
              <div class="routine-task-sub">
                <span class="routine-state ${t.stateClass}">${t.state}</span>
                <span>${t.window ?? 'sin horario'}</span>
              </div>
              ${t.detail ? `<div class="routine-task-detail">${t.detail}</div>` : ''}
            </div>`,
        )
        .join('');
    } else {
      this.routineToggle.classList.add('hidden');
      this.routineVisible = false;
      this.agentRoutine.innerHTML = '';
    }
    this.applyRoutineVisibility();

    if (info.actions && info.actions.length) {
      this.actionsToggle.classList.remove('hidden');
      // Reconstruye los botones solo si cambió el conjunto de acciones.
      const key = info.actions.map((a) => a.id).join('|');
      if (key !== this.actionsKey) {
        this.actionsKey = key;
        this.agentActions.innerHTML = info.actions
          .map((a) => `<button class="btn agent-action" data-action="${a.id}">${a.label}</button>`)
          .join('');
      }
    } else {
      this.actionsToggle.classList.add('hidden');
      this.actionsVisible = false;
      this.agentActions.innerHTML = '';
      this.actionsKey = '';
    }
    this.applyActionsVisibility();
  }

  /** Acordeón de los desplegables del agente: abrir uno cierra los demás. */
  private toggleDropdown(which: 'stats' | 'routine' | 'actions'): void {
    const open =
      which === 'stats' ? !this.statsVisible : which === 'routine' ? !this.routineVisible : !this.actionsVisible;
    this.statsVisible = which === 'stats' && open;
    this.routineVisible = which === 'routine' && open;
    this.actionsVisible = which === 'actions' && open;
    this.applyStatsVisibility();
    this.applyRoutineVisibility();
    this.applyActionsVisibility();
  }

  private applyStatsVisibility(): void {
    this.agentStats.classList.toggle('hidden', !this.statsVisible);
    this.statsToggle.textContent = this.statsVisible ? '📋 Ocultar información' : '📋 Mostrar información';
  }

  private applyRoutineVisibility(): void {
    this.agentRoutine.classList.toggle('hidden', !this.routineVisible);
    this.routineToggle.textContent = this.routineVisible ? '🗓️ Ocultar rutina' : '🗓️ Ver rutina';
  }

  private applyActionsVisibility(): void {
    this.agentActionsPanel.classList.toggle('hidden', !this.actionsVisible);
    this.actionsToggle.textContent = this.actionsVisible ? '⚡ Cerrar acciones' : '⚡ Actions';
  }
}

function formatHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function clampInt(value: string, min: number, max: number, fallback: number): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function randomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % 1_000_000_000;
}
