import { BIG_FIVE, type Personality } from '../sim/personality';

/**
 * Radar (web chart) de las facetas de los Cinco Grandes. Dibuja un polígono de
 * rejilla con anillos discontinuos y un polígono de datos relleno que se
 * actualiza en vivo con update(). SVG puro; el estilo (color teal) vive en
 * styles.css.
 */
const SVG = 'http://www.w3.org/2000/svg';
const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 110; // radio del eje (valor 100)
const RINGS = 4; // anillos de la rejilla
const N = BIG_FIVE.length; // número de ejes (facetas)

/** Vértice del eje i (0 = arriba) a un radio dado (0–R). */
function vertex(i: number, radius: number): [number, number] {
  const ang = -Math.PI / 2 + (i / N) * Math.PI * 2;
  return [CX + Math.cos(ang) * radius, CY + Math.sin(ang) * radius];
}

function pointsAttr(pts: [number, number][]): string {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

export class PersonalityRadar {
  private readonly dataPoly: SVGPolygonElement;
  private readonly dots: SVGCircleElement[] = [];

  constructor(parent: HTMLElement) {
    const svg = document.createElementNS(SVG, 'svg');
    // viewBox con margen para que las etiquetas de los ejes no se recorten.
    svg.setAttribute('viewBox', `-48 -16 ${SIZE + 96} ${SIZE + 32}`);
    svg.classList.add('radar-svg');

    // Anillos de rejilla (pentágonos concéntricos discontinuos).
    for (let ring = 1; ring <= RINGS; ring++) {
      const radius = (R * ring) / RINGS;
      const poly = document.createElementNS(SVG, 'polygon');
      const pts: [number, number][] = [];
      for (let i = 0; i < N; i++) pts.push(vertex(i, radius));
      poly.setAttribute('points', pointsAttr(pts));
      poly.classList.add('radar-grid');
      svg.appendChild(poly);
    }

    // Ejes radiales + etiquetas.
    for (let i = 0; i < N; i++) {
      const [x, y] = vertex(i, R);
      const axis = document.createElementNS(SVG, 'line');
      axis.setAttribute('x1', String(CX));
      axis.setAttribute('y1', String(CY));
      axis.setAttribute('x2', x.toFixed(1));
      axis.setAttribute('y2', y.toFixed(1));
      axis.classList.add('radar-axis');
      svg.appendChild(axis);

      const [lx, ly] = vertex(i, R + 22);
      const label = document.createElementNS(SVG, 'text');
      label.setAttribute('x', lx.toFixed(1));
      label.setAttribute('y', ly.toFixed(1));
      label.setAttribute('text-anchor', lx < CX - 1 ? 'end' : lx > CX + 1 ? 'start' : 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.classList.add('radar-label');
      label.textContent = BIG_FIVE[i].axis;
      svg.appendChild(label);
    }

    // Polígono de datos + puntos.
    this.dataPoly = document.createElementNS(SVG, 'polygon');
    this.dataPoly.classList.add('radar-data');
    svg.appendChild(this.dataPoly);

    for (let i = 0; i < N; i++) {
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('r', '4.5');
      dot.classList.add('radar-dot');
      svg.appendChild(dot);
      this.dots.push(dot);
    }

    parent.appendChild(svg);
  }

  /** Reposiciona el polígono y los puntos según los valores (0–100). */
  update(p: Personality): void {
    const pts: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      const v = Math.max(0, Math.min(100, p[BIG_FIVE[i].id]));
      const [x, y] = vertex(i, (R * v) / 100);
      pts.push([x, y]);
      this.dots[i].setAttribute('cx', x.toFixed(1));
      this.dots[i].setAttribute('cy', y.toFixed(1));
    }
    this.dataPoly.setAttribute('points', pointsAttr(pts));
  }
}
