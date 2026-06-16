import { App } from './core/App';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLElement;

const app = new App(canvas, hudRoot);
app.start();

// Acceso de depuración desde la consola del navegador.
(window as unknown as { __app: App }).__app = app;
