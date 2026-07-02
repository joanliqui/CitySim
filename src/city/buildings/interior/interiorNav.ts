import type { Furniture, HouseInterior, RoomRect } from './types';

export interface NavPoint { x: number; z: number; }

/** Rectángulo axis-aligned usado como obstáculo (huella de mueble ya engordada). */
type ObsRect = { x0: number; z0: number; x1: number; z1: number };

/** Margen alrededor de un mueble que el peatón no invade al esquivarlo (m). */
const OBSTACLE_PAD = 0.3;
/** Paso objetivo de la rejilla A* de esquiva (se ajusta para encajar exacto en la estancia). */
const AVOID_GRID_STEP = 0.25;

/**
 * Calcula la ruta desde (`fromX`,`fromZ`) hasta (`toX`,`toZ`) dentro de un
 * interior, pasando por los huecos de las puertas de los tabiques y esquivando
 * el mobiliario (obstáculo estático) dentro de cada estancia atravesada.
 * Devuelve la lista de waypoints sin incluir el punto de inicio, terminando en
 * (`toX`,`toZ`).
 */
export function interiorWalkPath(
  interior: HouseInterior,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): NavPoint[] {
  const { rooms, walls, furniture } = interior;
  const EPS = 0.05;

  // Devuelve el índice de la estancia que contiene (x,z) con un pequeño margen.
  // Si el punto está fuera de todas las estancias (p.ej. en el grosor del muro
  // exterior), devuelve la estancia cuyo centro sea más cercano.
  function findRoom(x: number, z: number): number {
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      if (x >= r.x0 - EPS && x <= r.x1 + EPS && z >= r.z0 - EPS && z <= r.z1 + EPS) return i;
    }
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      const dx = x - (r.x0 + r.x1) / 2;
      const dz = z - (r.z0 + r.z1) / 2;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  if (rooms.length <= 1) {
    return avoidFurnitureInRoom(rooms[0], furniture, fromX, fromZ, toX, toZ);
  }

  const startRoom = findRoom(fromX, fromZ);
  const endRoom   = findRoom(toX, toZ);
  if (startRoom === endRoom) {
    return avoidFurnitureInRoom(rooms[startRoom], furniture, fromX, fromZ, toX, toZ);
  }

  // Grafo de adyacencia de estancias a través de huecos de puertas.
  const n = rooms.length;
  const adj: { j: number; wx: number; wz: number }[][] =
    Array.from({ length: n }, () => []);

  for (const wall of walls) {
    if (wall.doorAt === undefined) continue;

    const isVertical = Math.abs(wall.ax - wall.bx) < EPS; // X fijo, extiende en Z

    let doorX: number;
    let doorZ: number;

    if (isVertical) {
      // Tabique vertical: x = wall.ax, de az a bz.
      const wx  = wall.ax;
      const z0  = Math.min(wall.az, wall.bz);
      doorX = wx;
      doorZ = z0 + wall.doorAt;

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const ri = rooms[i]; const rj = rooms[j];
          // Una estancia tiene su borde derecho en wx, la otra su borde izquierdo.
          const ok =
            (Math.abs(ri.x1 - wx) < EPS && Math.abs(rj.x0 - wx) < EPS) ||
            (Math.abs(rj.x1 - wx) < EPS && Math.abs(ri.x0 - wx) < EPS);
          if (!ok) continue;
          // El tabique debe solapar con ambas estancias en Z.
          const oz0 = Math.max(ri.z0, rj.z0, Math.min(wall.az, wall.bz));
          const oz1 = Math.min(ri.z1, rj.z1, Math.max(wall.az, wall.bz));
          if (oz1 <= oz0 + EPS) continue;
          adj[i].push({ j, wx: doorX, wz: doorZ });
          adj[j].push({ j: i, wx: doorX, wz: doorZ });
        }
      }
    } else {
      // Tabique horizontal: z = wall.az, de ax a bx.
      const wz  = wall.az;
      const x0  = Math.min(wall.ax, wall.bx);
      doorX = x0 + wall.doorAt;
      doorZ = wz;

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const ri = rooms[i]; const rj = rooms[j];
          const ok =
            (Math.abs(ri.z1 - wz) < EPS && Math.abs(rj.z0 - wz) < EPS) ||
            (Math.abs(rj.z1 - wz) < EPS && Math.abs(ri.z0 - wz) < EPS);
          if (!ok) continue;
          const ox0 = Math.max(ri.x0, rj.x0, Math.min(wall.ax, wall.bx));
          const ox1 = Math.min(ri.x1, rj.x1, Math.max(wall.ax, wall.bx));
          if (ox1 <= ox0 + EPS) continue;
          adj[i].push({ j, wx: doorX, wz: doorZ });
          adj[j].push({ j: i, wx: doorX, wz: doorZ });
        }
      }
    }
  }

  // BFS desde startRoom hasta endRoom.
  const prev   = new Int32Array(n).fill(-1);
  const wpX    = new Float32Array(n);
  const wpZ    = new Float32Array(n);
  const visited = new Uint8Array(n);
  const queue: number[] = [startRoom];
  visited[startRoom] = 1;

  outer: while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const e of adj[cur]) {
      if (!visited[e.j]) {
        visited[e.j] = 1;
        prev[e.j]    = cur;
        wpX[e.j]     = e.wx;
        wpZ[e.j]     = e.wz;
        if (e.j === endRoom) break outer;
        queue.push(e.j);
      }
    }
  }

  // Sin ruta a través de puertas → línea recta (fallback), esquivando lo que
  // haya en la estancia de salida (es la mejor información disponible).
  if (prev[endRoom] < 0) return avoidFurnitureInRoom(rooms[startRoom], furniture, fromX, fromZ, toX, toZ);

  // Reconstruye el camino de estancias y recolecta los waypoints de las puertas.
  const roomSeq: number[] = [];
  let cur = endRoom;
  while (cur !== startRoom) { roomSeq.unshift(cur); cur = prev[cur]; }

  // Cada tramo (start→puerta1, puerta1→puerta2, ..., puertaN→destino) transcurre
  // dentro de UNA estancia: la anterior a la puerta de llegada del tramo. Se
  // esquiva el mobiliario de esa estancia en cada tramo por separado.
  const result: NavPoint[] = [];
  let prevX = fromX;
  let prevZ = fromZ;
  let prevRoom = startRoom;
  for (const r of roomSeq) {
    const seg = avoidFurnitureInRoom(rooms[prevRoom], furniture, prevX, prevZ, wpX[r], wpZ[r]);
    result.push(...seg);
    prevX = wpX[r];
    prevZ = wpZ[r];
    prevRoom = r;
  }
  result.push(...avoidFurnitureInRoom(rooms[prevRoom], furniture, prevX, prevZ, toX, toZ));
  return result;
}

/**
 * Ruta de (`ax`,`az`) a (`bx`,`bz`), ambos dentro de `room`, esquivando el
 * mobiliario de esa estancia. Si el tramo recto no choca con ningún mueble, lo
 * devuelve tal cual; si choca, busca un rodeo con A* sobre una rejilla local y
 * lo simplifica. Sin `room` (o sin ruta libre), cae a la línea recta.
 */
function avoidFurnitureInRoom(
  room: RoomRect | undefined,
  furniture: readonly Furniture[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
): NavPoint[] {
  if (!room) return [{ x: bx, z: bz }];
  const obstacles = obstacleRectsInRoom(room, furniture);
  if (obstacles.length === 0 || !segmentHitsAny(ax, az, bx, bz, obstacles)) return [{ x: bx, z: bz }];

  const path = gridAStarAvoid(room, obstacles, ax, az, bx, bz);
  if (!path) return [{ x: bx, z: bz }]; // sin rodeo libre: línea recta (mejor esfuerzo)

  const simplified = simplifyPath(path, obstacles);
  return simplified.slice(1).map((p) => ({ x: p.x, z: p.z }));
}

/** Huellas de mueble (engordadas) dentro de `room`. Las alfombras no bloquean: son planas. */
function obstacleRectsInRoom(room: RoomRect, furniture: readonly Furniture[]): ObsRect[] {
  const EPS = 0.05;
  const out: ObsRect[] = [];
  for (const f of furniture) {
    if (f.kind === 'rug') continue;
    if (f.x < room.x0 - EPS || f.x > room.x1 + EPS || f.z < room.z0 - EPS || f.z > room.z1 + EPS) continue;
    out.push({
      x0: f.x - f.w / 2 - OBSTACLE_PAD,
      x1: f.x + f.w / 2 + OBSTACLE_PAD,
      z0: f.z - f.d / 2 - OBSTACLE_PAD,
      z1: f.z + f.d / 2 + OBSTACLE_PAD,
    });
  }
  return out;
}

/** ¿El segmento (ax,az)-(bx,bz) corta el rectángulo `r`? (recorte de Liang–Barsky). */
function segmentHitsRect(ax: number, az: number, bx: number, bz: number, r: ObsRect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const p = [-dx, dx, -dz, dz];
  const q = [ax - r.x0, r.x1 - ax, az - r.z0, r.z1 - az];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

function segmentHitsAny(ax: number, az: number, bx: number, bz: number, obstacles: ObsRect[]): boolean {
  for (const r of obstacles) if (segmentHitsRect(ax, az, bx, bz, r)) return true;
  return false;
}

/**
 * A* sobre una rejilla local a `room` (ajustada para que sus nodos caigan
 * exactos en los bordes de la estancia), evitando los nodos dentro de
 * `obstacles`. Devuelve la polilínea en coordenadas de mundo (incluye inicio y
 * fin) o `null` si no hay camino libre.
 */
function gridAStarAvoid(
  room: RoomRect,
  obstacles: ObsRect[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
): NavPoint[] | null {
  const width = room.x1 - room.x0;
  const depth = room.z1 - room.z0;
  const nx = Math.max(1, Math.round(width / AVOID_GRID_STEP));
  const nz = Math.max(1, Math.round(depth / AVOID_GRID_STEP));
  const stepX = width / nx;
  const stepZ = depth / nz;
  const cols = nx + 1;
  const rows = nz + 1;
  const n = cols * rows;
  const id = (i: number, j: number) => j * cols + i;

  const clamp = (v: number, hi: number) => Math.min(hi, Math.max(0, v));
  const si = clamp(Math.round((ax - room.x0) / stepX), cols - 1);
  const sj = clamp(Math.round((az - room.z0) / stepZ), rows - 1);
  const ei = clamp(Math.round((bx - room.x0) / stepX), cols - 1);
  const ej = clamp(Math.round((bz - room.z0) / stepZ), rows - 1);
  const startId = id(si, sj);
  const endId = id(ei, ej);

  const blocked = new Uint8Array(n);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = room.x0 + i * stepX;
      const z = room.z0 + j * stepZ;
      if (obstacles.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)) blocked[id(i, j)] = 1;
    }
  }
  // El punto de partida y el destino siempre deben ser transitables (evita que
  // el objetivo real quede fuera de la rejilla de esquiva por el margen de mueble).
  blocked[startId] = 0;
  blocked[endId] = 0;

  const gScore = new Float64Array(n).fill(Infinity);
  const fScore = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const inOpen = new Uint8Array(n);
  const open: number[] = [startId];
  inOpen[startId] = 1;
  gScore[startId] = 0;
  fScore[startId] = Math.hypot((si - ei) * stepX, (sj - ej) * stepZ);

  const dirs: Array<[number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  while (open.length > 0) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (fScore[open[k]] < fScore[open[bi]]) bi = k;
    const cur = open[bi];
    if (cur === endId) break;
    open.splice(bi, 1);
    inOpen[cur] = 0;
    closed[cur] = 1;
    const ci = cur % cols;
    const cj = (cur - ci) / cols;

    for (const [di, dj] of dirs) {
      const nix = ci + di;
      const njx = cj + dj;
      if (nix < 0 || nix >= cols || njx < 0 || njx >= rows) continue;
      const nid = id(nix, njx);
      if (closed[nid] || blocked[nid]) continue;
      if (di !== 0 && dj !== 0) {
        // Evita cortar la esquina de un obstáculo en diagonal.
        if (blocked[id(ci + di, cj)] || blocked[id(ci, cj + dj)]) continue;
      }
      const cost = Math.hypot(di * stepX, dj * stepZ);
      const tentative = gScore[cur] + cost;
      if (tentative < gScore[nid]) {
        cameFrom[nid] = cur;
        gScore[nid] = tentative;
        fScore[nid] = tentative + Math.hypot((nix - ei) * stepX, (njx - ej) * stepZ);
        if (!inOpen[nid]) {
          open.push(nid);
          inOpen[nid] = 1;
        }
      }
    }
  }

  if (gScore[endId] === Infinity) return null;

  const cellsPath: number[] = [];
  let node = endId;
  while (node !== -1) {
    cellsPath.unshift(node);
    if (node === startId) break;
    node = cameFrom[node];
  }

  return cellsPath.map((c) => {
    const i = c % cols;
    const j = (c - i) / cols;
    return { x: room.x0 + i * stepX, z: room.z0 + j * stepZ };
  });
}

/** Simplifica una polilínea eliminando waypoints intermedios con línea de visión libre. */
function simplifyPath(points: NavPoint[], obstacles: ObsRect[]): NavPoint[] {
  if (points.length <= 2) return points;
  const result: NavPoint[] = [points[0]];
  let anchor = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const next = points[i + 1];
    if (segmentHitsAny(points[anchor].x, points[anchor].z, next.x, next.z, obstacles)) {
      result.push(points[i]);
      anchor = i;
    }
  }
  result.push(points[points.length - 1]);
  return result;
}
