import * as THREE from "three";

export const CELL = 2; // world units per grid cell
export const GRID_W = 28;
export const GRID_H = 28;
export const WALL_H = 4.2;

export interface Vec2 {
  x: number;
  z: number;
}

export interface Prop {
  x: number;
  z: number;
  kind: "crate" | "barrel" | "bones" | "skullpile" | "rubble";
  rot: number;
  scale: number;
}

export interface Dungeon {
  grid: Uint8Array;
  torches: { x: number; z: number; nx: number; nz: number }[]; // world pos + facing normal
  braziers: Vec2[];
  spawns: Vec2[];
  props: Prop[];
  playerStart: Vec2;
}

export function cellToWorld(i: number, j: number): Vec2 {
  return { x: (i - GRID_W / 2 + 0.5) * CELL, z: (j - GRID_H / 2 + 0.5) * CELL };
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDungeon(seed = 1349): Dungeon {
  const rnd = mulberry(seed);
  const grid = new Uint8Array(GRID_W * GRID_H);
  const idx = (i: number, j: number) => j * GRID_W + i;
  const inB = (i: number, j: number) => i >= 0 && j >= 0 && i < GRID_W && j < GRID_H;

  for (let j = 0; j < GRID_H; j++)
    for (let i = 0; i < GRID_W; i++)
      if (i === 0 || j === 0 || i === GRID_W - 1 || j === GRID_H - 1) grid[idx(i, j)] = 1;

  const cx = GRID_W / 2;
  const cz = GRID_H / 2;
  const nearCenter = (i: number, j: number, r: number) =>
    Math.abs(i + 0.5 - cx) < r && Math.abs(j + 0.5 - cz) < r;

  // pillars on a loose lattice
  for (let j = 3; j < GRID_H - 3; j += 2) {
    for (let i = 3; i < GRID_W - 3; i += 2) {
      if (nearCenter(i, j, 4)) continue;
      if (rnd() < 0.16) grid[idx(i, j)] = 1;
    }
  }
  // a few short wall runs (crypt partitions)
  for (let w = 0; w < 6; w++) {
    const horiz = rnd() < 0.5;
    const len = 3 + Math.floor(rnd() * 3);
    const i0 = 3 + Math.floor(rnd() * (GRID_W - 6 - len));
    const j0 = 3 + Math.floor(rnd() * (GRID_H - 6));
    for (let k = 0; k < len; k++) {
      const i = horiz ? i0 + k : i0;
      const j = horiz ? j0 : j0 + k;
      if (!inB(i, j) || nearCenter(i, j, 5)) continue;
      if (grid[idx(i, j)] === 0) grid[idx(i, j)] = 1;
    }
  }
  // clear the center again just in case
  for (let j = cz - 3; j <= cz + 2; j++)
    for (let i = cx - 3; i <= cx + 2; i++) if (inB(i, j)) grid[idx(i, j)] = 0;

  const isOpen = (i: number, j: number) => inB(i, j) && grid[idx(i, j)] === 0;

  // torches: mounted on wall faces adjacent to open floor
  const torchCells: { i: number; j: number; nx: number; nz: number }[] = [];
  for (let j = 1; j < GRID_H - 1; j++) {
    for (let i = 1; i < GRID_W - 1; i++) {
      if (grid[idx(i, j)] !== 1) continue;
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      for (const [dx, dz] of dirs) {
        if (isOpen(i + dx, j + dz)) {
          torchCells.push({ i: i + dx, j: j + dz, nx: -dx, nz: -dz });
          break;
        }
      }
    }
  }
  // keep a well-spread subset
  const torches: Dungeon["torches"] = [];
  const wanted = 10;
  let guard = 0;
  while (torches.length < wanted && torchCells.length > 0 && guard++ < 600) {
    const t = torchCells.splice(Math.floor(rnd() * torchCells.length), 1)[0];
    const p = cellToWorld(t.i, t.j);
    const ok = torches.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > 9);
    if (ok) torches.push({ x: p.x + t.nx * (CELL * 0.5 - 0.12), z: p.z + t.nz * (CELL * 0.5 - 0.12), nx: t.nx, nz: t.nz });
  }

  // braziers: two open spots at mid radius
  const braziers: Vec2[] = [];
  guard = 0;
  while (braziers.length < 2 && guard++ < 300) {
    const i = 2 + Math.floor(rnd() * (GRID_W - 4));
    const j = 2 + Math.floor(rnd() * (GRID_H - 4));
    if (!isOpen(i, j) || nearCenter(i, j, 3)) continue;
    const p = cellToWorld(i, j);
    const d = Math.hypot(p.x, p.z);
    if (d > 7 && d < 17 && braziers.every((b) => Math.hypot(b.x - p.x, b.z - p.z) > 10)) braziers.push(p);
  }

  // spawn points: far open cells
  const spawns: Vec2[] = [];
  for (let j = 1; j < GRID_H - 1; j++) {
    for (let i = 1; i < GRID_W - 1; i++) {
      if (!isOpen(i, j)) continue;
      const p = cellToWorld(i, j);
      if (Math.hypot(p.x, p.z) > 14) spawns.push(p);
    }
  }

  // props scattered on open floor
  const props: Prop[] = [];
  const kinds: Prop["kind"][] = ["crate", "barrel", "bones", "skullpile", "rubble"];
  guard = 0;
  while (props.length < 26 && guard++ < 500) {
    const i = 2 + Math.floor(rnd() * (GRID_W - 4));
    const j = 2 + Math.floor(rnd() * (GRID_H - 4));
    if (!isOpen(i, j) || nearCenter(i, j, 3)) continue;
    const p = cellToWorld(i, j);
    if (props.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 3)) continue;
    props.push({
      x: p.x + (rnd() - 0.5) * 0.8,
      z: p.z + (rnd() - 0.5) * 0.8,
      kind: kinds[Math.floor(rnd() * kinds.length)],
      rot: rnd() * Math.PI * 2,
      scale: 0.8 + rnd() * 0.45,
    });
  }

  return { grid, torches, braziers, spawns, props, playerStart: cellToWorld(cx - 0.5, cz - 0.5) };
}

/* ---------------- collision ---------------- */

export class Collider {
  constructor(private d: Dungeon) {}

  solidCell(i: number, j: number): boolean {
    if (i < 0 || j < 0 || i >= GRID_W || j >= GRID_H) return true;
    return this.d.grid[j * GRID_W + i] === 1;
  }

  solidAt(x: number, z: number): boolean {
    return this.solidCell(Math.floor(x / CELL + GRID_W / 2), Math.floor(z / CELL + GRID_H / 2));
  }

  /** Push a circle out of solid cells. Returns corrected position. */
  resolve(x: number, z: number, r: number): Vec2 {
    let px = x;
    let pz = z;
    for (let iter = 0; iter < 3; iter++) {
      const i0 = Math.floor(px / CELL + GRID_W / 2);
      const j0 = Math.floor(pz / CELL + GRID_H / 2);
      let pushed = false;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = i0 + di;
          const j = j0 + dj;
          if (!this.solidCell(i, j)) continue;
          const minX = (i - GRID_W / 2) * CELL;
          const minZ = (j - GRID_H / 2) * CELL;
          const cx = Math.max(minX, Math.min(px, minX + CELL));
          const cz = Math.max(minZ, Math.min(pz, minZ + CELL));
          let dx = px - cx;
          let dz = pz - cz;
          let d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            if (d2 < 1e-6) {
              dx = px - (minX + CELL / 2);
              dz = pz - (minZ + CELL / 2);
              d2 = dx * dx + dz * dz || 1;
            }
            const d = Math.sqrt(d2);
            const push = (r - d) / d;
            px += dx * push;
            pz += dz * push;
            pushed = true;
          }
        }
      }
      if (!pushed) break;
    }
    return { x: px, z: pz };
  }

  /** DDA ray march through the grid. Returns hit distance or maxDist. */
  raycast(ox: number, oy: number, oz: number, dir: THREE.Vector3, maxDist: number): number {
    let x = ox;
    let z = oz;
    const step = 0.25;
    const n = Math.ceil(maxDist / step);
    const dx = dir.x * step;
    const dz = dir.z * step;
    for (let k = 0; k < n; k++) {
      x += dx;
      z += dz;
      if (this.solidAt(x, z)) return k * step;
      if (oy <= 0 || oy >= WALL_H + 2) return k * step;
    }
    return maxDist;
  }
}
