import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Cámara orbital con modo "seguir agente": el objetivo del orbit se desplaza
 * suavemente hacia el agente y la cámara lo acompaña manteniendo el encuadre.
 */
export class CameraRig {
  readonly controls: OrbitControls;
  private followTarget: (() => { x: number; z: number }) | null = null;
  private readonly smooth = new THREE.Vector3();
  private readonly move = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly keys = new Set<string>();
  private freeLook = false;
  private yaw = 0;
  private pitch = 0;
  /** Velocidad base de "vuelo" (m/s); Shift la multiplica por BOOST. */
  private flySpeed = 45;
  private static readonly BOOST = 120 / 45;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly domElement: HTMLElement,
    private readonly halfExtent: number,
    private readonly onManualControl?: () => void,
  ) {
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    // Permitimos mirar hasta la horizontal: si fuese < π/2, al salir de free-look
    // mirando al horizonte OrbitControls reencuadraría hacia abajo (la "recolocación").
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.minDistance = 12;
    this.controls.maxDistance = halfExtent * 3;
    this.controls.target.set(0, 0, 0);
    this.controls.mouseButtons.RIGHT = null;
    this.bindFreeLook();
  }

  /** `closeUp` fuerza un primer plano (p. ej. al crear un personaje). */
  follow(getPos: (() => { x: number; z: number }) | null, closeUp = false): void {
    this.followTarget = getPos;
    if (getPos) {
      const p = getPos();
      this.smooth.set(p.x, 0, p.z);
      // Acércate si la cámara estaba muy lejos (o siempre, en primer plano).
      const limit = closeUp ? 16 : 90;
      const dist = this.camera.position.distanceTo(this.controls.target);
      if (dist > limit) {
        const dir = this.camera.position.clone().sub(this.controls.target).normalize();
        if (closeUp) {
          // Baja el ángulo para ver al personaje de cuerpo entero, no cenital.
          dir.y = Math.min(Math.max(dir.y, 0.3), 0.55);
          dir.normalize();
        }
        this.camera.position.copy(this.controls.target).addScaledVector(dir, closeUp ? 16 : 60);
      }
    }
  }

  get isFollowing(): boolean {
    return this.followTarget !== null;
  }

  /** Velocidad base de vuelo en m/s (sin Shift). */
  get flySpeedValue(): number {
    return this.flySpeed;
  }

  setFlySpeed(value: number): void {
    this.flySpeed = Math.max(5, Math.min(300, value));
  }

  private currentFlySpeed(): number {
    const boosted = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    return this.flySpeed * (boosted ? CameraRig.BOOST : 1);
  }

  update(dt: number): void {
    if (this.freeLook) {
      this.updateFreeLook(dt);
      return;
    }
    if (this.followTarget) {
      const p = this.followTarget();
      const k = 1 - Math.exp(-6 * dt);
      this.smooth.x += (p.x - this.smooth.x) * k;
      this.smooth.z += (p.z - this.smooth.z) * k;
      const dx = this.smooth.x - this.controls.target.x;
      const dz = this.smooth.z - this.controls.target.z;
      this.controls.target.x += dx;
      this.controls.target.z += dz;
      this.controls.target.y += (1.2 - this.controls.target.y) * k;
      this.camera.position.x += dx;
      this.camera.position.z += dz;
    }
    this.updateOrbitVertical(dt);
    this.controls.update();
  }

  private bindFreeLook(): void {
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    this.domElement.addEventListener('pointerdown', (e) => {
      if (e.button !== 2) return;
      e.preventDefault();
      this.beginFreeLook(e.pointerId);
    });
    this.domElement.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.endFreeLook(e.pointerId);
    });
    this.domElement.addEventListener('pointercancel', (e) => this.endFreeLook(e.pointerId));
    this.domElement.addEventListener('pointermove', (e) => {
      if (!this.freeLook) return;
      e.preventDefault();
      const sensitivity = 0.0022;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;
      this.pitch = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, this.pitch));
      this.applyFreeLookRotation();
    });
    window.addEventListener(
      'keydown',
      (e) => {
        if (isTextInput(e.target)) return;
        const cameraKey = this.freeLook ? isFreeLookKey(e.code) : isVerticalCameraKey(e.code);
        if (!cameraKey) return;
        const wasPressed = this.keys.has(e.code);
        this.keys.add(e.code);
        if (!this.freeLook && !wasPressed) {
          this.followTarget = null;
          this.onManualControl?.();
        }
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
    window.addEventListener(
      'keyup',
      (e) => {
        if (this.freeLook ? isFreeLookKey(e.code) : isVerticalCameraKey(e.code)) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.keys.delete(e.code);
      },
      true,
    );
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.endFreeLook();
    });
  }

  /**
   * Vacía el "momentum" residual de OrbitControls (sphericalDelta/panOffset que
   * el damping va decayendo durante varios frames). Si no, al entrar en free-look
   * ese delta queda congelado (no se llama a controls.update()) y al soltar se
   * aplica de golpe, haciendo que la cámara se mueva sola. Drenamos sin mover la
   * cámara: guardamos pose, un update sin damping pone los deltas a cero, restauramos.
   */
  private flushOrbitMomentum(): void {
    const pos = this.camera.position.clone();
    const tgt = this.controls.target.clone();
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
    this.camera.position.copy(pos);
    this.controls.target.copy(tgt);
  }

  private beginFreeLook(pointerId: number): void {
    if (!this.freeLook) {
      this.flushOrbitMomentum();
      this.syncAnglesFromCamera();
      this.freeLook = true;
      this.followTarget = null;
      this.controls.enabled = false;
      this.onManualControl?.();
    }
    this.domElement.setPointerCapture(pointerId);
  }

  private endFreeLook(pointerId?: number): void {
    if (!this.freeLook) return;
    this.freeLook = false;
    this.keys.clear();
    this.controls.enabled = true;
    // OrbitControls solo puede mirar hacia la horizontal o por debajo (maxPolarAngle).
    // Si soltamos mirando hacia arriba, reencuadramos nosotros a la horizontal de forma
    // controlada; así el traspaso es continuo para miradas horizontales/abajo y no hay
    // un "salto" provocado por el clamp de OrbitControls en su primer update.
    if (this.pitch > 0) {
      this.pitch = 0;
      this.applyFreeLookRotation();
    }
    const d = Math.min(Math.max(this.camera.position.distanceTo(this.controls.target), 20), this.halfExtent * 3);
    this.camera.getWorldDirection(this.forward);
    this.controls.target.copy(this.camera.position).addScaledVector(this.forward, d);
    if (pointerId !== undefined && this.domElement.hasPointerCapture(pointerId)) {
      this.domElement.releasePointerCapture(pointerId);
    }
  }

  private syncAnglesFromCamera(): void {
    this.camera.getWorldDirection(this.forward);
    this.yaw = Math.atan2(-this.forward.x, -this.forward.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(this.forward.y, -1, 1));
  }

  private applyFreeLookRotation(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private updateOrbitVertical(dt: number): void {
    this.move.y = 0;
    if (this.keys.has('Space')) this.move.y += 1;
    if (this.keys.has('KeyC')) this.move.y -= 1;
    if (this.move.y === 0) return;

    const speed = this.currentFlySpeed() * dt;
    const dy = this.move.y * speed;
    const nextY = Math.max(1.5, this.camera.position.y + dy);
    const appliedY = nextY - this.camera.position.y;
    this.camera.position.y = nextY;
    this.controls.target.y += appliedY;
  }

  private updateFreeLook(dt: number): void {
    const speed = this.currentFlySpeed() * dt;
    this.move.set(0, 0, 0);
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.move.z += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.move.z -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.move.x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.move.x -= 1;
    if (this.keys.has('KeyE') || this.keys.has('Space')) this.move.y += 1;
    if (this.keys.has('KeyQ') || this.keys.has('KeyC')) this.move.y -= 1;
    if (this.move.lengthSq() === 0) return;
    this.move.normalize();
    this.camera.getWorldDirection(this.forward);
    this.right.crossVectors(this.forward, this.camera.up).normalize();
    this.camera.position.addScaledVector(this.forward, this.move.z * speed);
    this.camera.position.addScaledVector(this.right, this.move.x * speed);
    this.camera.position.y = Math.max(1.5, this.camera.position.y + this.move.y * speed);
    this.controls.target.copy(this.camera.position).addScaledVector(this.forward, 40);
  }
}

function isVerticalCameraKey(code: string): boolean {
  return code === 'Space' || code === 'KeyC';
}

function isFreeLookKey(code: string): boolean {
  return (
    code === 'KeyW' ||
    code === 'KeyA' ||
    code === 'KeyS' ||
    code === 'KeyD' ||
    code === 'KeyQ' ||
    code === 'KeyE' ||
    isVerticalCameraKey(code) ||
    code === 'ArrowUp' ||
    code === 'ArrowDown' ||
    code === 'ArrowLeft' ||
    code === 'ArrowRight' ||
    code === 'ShiftLeft' ||
    code === 'ShiftRight'
  );
}

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}
