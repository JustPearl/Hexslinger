import * as THREE from "three";

export const GRID_W = 34;
export const GRID_H = 34;
export const CELL = 4;
export const WALL_H = 5;

export interface TorchSpot { x: number; z: number; nx: number; nz: number }
export interface PropSpot { kind: "crate" | "barrel" | "bones" | "skullpile" | "rubble"; x: number; z: number; rot: number; scale: number }

export interface Dungeon {
  grid: Uint8Array;
  playerStart: { x: number; z: number };
  torches: TorchSpot[];
  braziers: { x: number; z: number }[];
  props: PropSpot[];
  spawns: { x: number; z: number }[];
}

const toWorld = (gx: number, gz: number) => ({
  x: (gx - GRID_W / 2 + 0.5) * CELL,
  z: (gz - GRID_H / 2 + 0.5) * CELL,
});

/** Carve a warren of rooms and corridors with a seeded random walk. */
export function generateDungeon(seed: number): Dungeon {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const grid = new Uint8Array(GRID_W * GRID_H).fill(1);
  const idx = (x: number, y: number) => y * GRID_W + x;
  const carve = (x: number, y: number) => {
    if (x > 0 && x < GRID_W - 1 && y > 0 && y < GRID_H - 1) grid[idx(x, y)] = 0;
  };

  // rooms
  const rooms: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const w = 4 + Math.floor(rand() * 4);
    const h = 4 + Math.floor(rand() * 4);
    const x = 1 + Math.floor(rand() * (GRID_W - w - 2));
    const y = 1 + Math.floor(rand() * (GRID_H - h - 2));
    rooms.push({ x, y, w, h });
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) carve(xx, yy);
  }

  // connect room centers with L-corridors
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1];
    const b = rooms[i];
    let cx = Math.floor(a.x + a.w / 2);
    let cy = Math.floor(a.y + a.h / 2);
    const tx = Math.floor(b.x + b.w / 2);
    const ty = Math.floor(b.y + b.h / 2);
    while (cx !== tx) { carve(cx, cy); carve(cx, cy + 1); cx += Math.sign(tx - cx); }
    while (cy !== ty) { carve(cx, cy); carve(cx + 1, cy); cy += Math.sign(ty - cy); }
    carve(cx, cy);
  }

  // drunkard walk for extra veins
  let wx = Math.floor(GRID_W / 2);
  let wy = Math.floor(GRID_H / 2);
  for (let i = 0; i < 320; i++) {
    carve(wx, wy);
    const d = Math.floor(rand() * 4);
    if (d === 0) wx++;
    if (d === 1) wx--;
    if (d === 2) wy++;
    if (d === 3) wy--;
    wx = Math.max(1, Math.min(GRID_W - 2, wx));
    wy = Math.max(1, Math.min(GRID_H - 2, wy));
  }

  // player start: center of first room
  const start = rooms[0];
  const ps = toWorld(Math.floor(start.x + start.w / 2), Math.floor(start.y + start.h / 2));

  // open floor cells for spawns & props
  const open: { gx: number; gz: number }[] = [];
  for (let y = 1; y < GRID_H - 1; y++)
    for (let x = 1; x < GRID_W - 1; x++)
      if (grid[idx(x, y)] === 0) open.push({ gx: x, gz: y });

  const distToStart = (gx: number, gz: number) =>
    Math.hypot((gx - (start.x + start.w / 2)) * CELL, (gz - (start.y + start.h / 2)) * CELL);

  // spawn points far from start
  const spawns: { x: number; z: number }[] = [];
  const shuffled = [...open].sort(() => rand() - 0.5);
  for (const c of shuffled) {
    if (spawns.length >= 14) break;
    if (distToStart(c.gx, c.gz) < 12) continue;
    const w = toWorld(c.gx, c.gz);
    if (spawns.every((sp) => Math.hypot(sp.x - w.x, sp.z - w.z) > 6)) spawns.push(w);
  }
  while (spawns.length < 6) {
    const c = open[Math.floor(rand() * open.length)];
    spawns.push(toWorld(c.gx, c.gz));
  }

  // torches: on wall faces adjacent to corridors
  const torches: TorchSpot[] = [];
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  for (const c of open) {
    if (torches.length >= 14) break;
    if (rand() > 0.09) continue;
    for (const [dx, dz] of dirs) {
      if (grid[idx(c.gx + dx, c.gz + dz)] === 1) {
        const w = toWorld(c.gx, c.gz);
        const px = w.x + dx * (CELL / 2 - 0.15);
        const pz = w.z + dz * (CELL / 2 - 0.15);
        if (torches.every((t) => Math.hypot(t.x - px, t.z - pz) > 8)) {
          torches.push({ x: px, z: pz, nx: -dx, nz: -dz });
        }
        break;
      }
    }
  }

  // braziers in the bigger rooms
  const braziers: { x: number; z: number }[] = [];
  for (const r of rooms) {
    if (braziers.length >= 4) break;
    if (r.w >= 5 && r.h >= 5 && rand() < 0.7) {
      braziers.push(toWorld(r.x + 1, r.y + 1));
    }
  }

  // props scattered on open floor
  const props: PropSpot[] = [];
  const kinds: PropSpot["kind"][] = ["crate", "barrel", "bones", "skullpile", "rubble", "rubble", "bones"];
  for (const c of open) {
    if (props.length >= 60) break;
    if (rand() > 0.055) continue;
    if (distToStart(c.gx, c.gz) < 5) continue;
    const w = toWorld(c.gx, c.gz);
    props.push({
      kind: kinds[Math.floor(rand() * kinds.length)],
      x: w.x + (rand() - 0.5) * 1.6,
      z: w.z + (rand() - 0.5) * 1.6,
      rot: rand() * Math.PI * 2,
      scale: 0.75 + rand() * 0.5,
    });
  }

  return { grid, playerStart: ps, torches, braziers, props, spawns };
}

/** Grid collision + DDA raycast against solid cells. */
export class Collider {
  private grid: Uint8Array;

  constructor(dungeon: Dungeon) {
    this.grid = dungeon.grid;
  }

  cellAt(x: number, z: number): [number, number] {
    return [Math.floor(x / CELL + GRID_W / 2), Math.floor(z / CELL + GRID_H / 2)];
  }

  solidCell(gx: number, gz: number): boolean {
    if (gx < 0 || gz < 0 || gx >= GRID_W || gz >= GRID_H) return true;
    return this.grid[gz * GRID_W + gx] === 1;
  }

  solidAt(x: number, z: number): boolean {
    const [gx, gz] = this.cellAt(x, z);
    return this.solidCell(gx, gz);
  }

  /** Push a circle out of solid cells; returns corrected position. */
  resolve(x: number, z: number, radius: number): { x: number; z: number } {
    let px = x;
    let pz = z;
    for (let iter = 0; iter < 3; iter++) {
      const [gx, gz] = this.cellAt(px, pz);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = gx + dx;
          const cz = gz + dy;
          if (!this.solidCell(cx, cz)) continue;
          const minX = (cx - GRID_W / 2) * CELL;
          const minZ = (cz - GRID_H / 2) * CELL;
          const nearX = Math.max(minX, Math.min(px, minX + CELL));
          const nearZ = Math.max(minZ, Math.min(pz, minZ + CELL));
          let ddx = px - nearX;
          let ddz = pz - nearZ;
          let d2 = ddx * ddx + ddz * ddz;
          if (d2 < radius * radius) {
            if (d2 < 1e-6) {
              // center inside the wall — push out along smallest penetration axis
              const left = px - minX;
              const right = minX + CELL - px;
              const top = pz - minZ;
              const bottom = minZ + CELL - pz;
              const m = Math.min(left, right, top, bottom);
              if (m === left) ddx = -1, ddz = 0;
              else if (m === right) ddx = 1, ddz = 0;
              else if (m === top) ddx = 0, ddz = -1;
              else ddx = 0, ddz = 1;
              d2 = 1;
              const push = radius + m;
              px += ddx * push;
              pz += ddz * push;
              continue;
            }
            const d = Math.sqrt(d2);
            const push = (radius - d) / d;
            px += ddx * push;
            pz += ddz * push;
          }
        }
      }
    }
    return { x: px, z: pz };
  }

  /** DDA march; returns distance to first solid cell (clamped to maxDist). */
  raycast(ox: number, oy: number, oz: number, dir: THREE.Vector3, maxDist: number): number {
    if (oy < 0 || oy > WALL_H) return maxDist;
    let [gx, gz] = this.cellAt(ox, oz);
    const stepX = dir.x > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;
    const deltaX = Math.abs(dir.x) < 1e-8 ? Infinity : Math.abs(CELL / dir.x);
    const deltaZ = Math.abs(dir.z) < 1e-8 ? Infinity : Math.abs(CELL / dir.z);
    const borderX = (gx - GRID_W / 2 + (stepX > 0 ? 1 : 0)) * CELL;
    const borderZ = (gz - GRID_H / 2 + (stepZ > 0 ? 1 : 0)) * CELL;
    let sideX = Math.abs(dir.x) < 1e-8 ? Infinity : Math.abs((borderX - ox) / dir.x);
    let sideZ = Math.abs(dir.z) < 1e-8 ? Infinity : Math.abs((borderZ - oz) / dir.z);
    let t = 0;
    for (let i = 0; i < 128; i++) {
      if (sideX < sideZ) {
        t = sideX;
        sideX += deltaX;
        gx += stepX;
      } else {
        t = sideZ;
        sideZ += deltaZ;
        gz += stepZ;
      }
      if (t > maxDist) return maxDist;
      if (this.solidCell(gx, gz)) return t;
    }
    return maxDist;
  }
}
