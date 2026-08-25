import * as THREE from "three";

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, nearest = true, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (nearest) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
  }
  t.generateMipmaps = false;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const gray = (v: number) => `rgb(${v},${v},${Math.max(0, v - 4)})`;

export function makeFloorTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128);
  ctx.fillStyle = gray(24);
  ctx.fillRect(0, 0, 128, 128);
  // flagstones: 4x4 tiles
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const base = 20 + Math.floor(Math.random() * 16);
      ctx.fillStyle = gray(base);
      ctx.fillRect(tx * 32 + 1, ty * 32 + 1, 30, 30);
      // speckle
      for (let i = 0; i < 26; i++) {
        const v = base + Math.floor(Math.random() * 26) - 10;
        ctx.fillStyle = gray(Math.max(6, v));
        ctx.fillRect(tx * 32 + 1 + Math.floor(Math.random() * 30), ty * 32 + 1 + Math.floor(Math.random() * 30), 2, 2);
      }
    }
  }
  // mortar lines
  ctx.fillStyle = gray(10);
  for (let i = 0; i <= 4; i++) {
    ctx.fillRect(i * 32 - 1, 0, 2, 128);
    ctx.fillRect(0, i * 32 - 1, 128, 2);
  }
  // cracks
  ctx.strokeStyle = gray(8);
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    let x = Math.random() * 128;
    let y = Math.random() * 128;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += Math.random() * 14 - 7;
      y += Math.random() * 14 - 7;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return toTexture(c, true, true);
}

export function makeWallTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128);
  ctx.fillStyle = gray(14);
  ctx.fillRect(0, 0, 128, 128);
  const rows = 4;
  const bh = 128 / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 === 0 ? 0 : 32;
    for (let bx = -1; bx < 3; bx++) {
      const x = bx * 64 + off;
      const base = 30 + Math.floor(Math.random() * 22);
      ctx.fillStyle = gray(base);
      ctx.fillRect(x + 2, r * bh + 2, 60, bh - 4);
      // noise
      for (let i = 0; i < 30; i++) {
        const v = base + Math.floor(Math.random() * 30) - 14;
        ctx.fillStyle = gray(Math.max(10, v));
        ctx.fillRect(x + 2 + Math.floor(Math.random() * 60), r * bh + 2 + Math.floor(Math.random() * (bh - 4)), 3, 2);
      }
      // chipped corner
      ctx.fillStyle = gray(12);
      ctx.fillRect(x + 54, r * bh + 2, 8, 5);
    }
  }
  // grime streaks
  ctx.fillStyle = "rgba(5,5,5,0.35)";
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * 128;
    ctx.fillRect(x, Math.random() * 40, 2 + Math.random() * 3, 60 + Math.random() * 68);
  }
  return toTexture(c, true, true);
}

export function makeCeilingTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64);
  ctx.fillStyle = gray(12);
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = gray(16 + Math.floor(Math.random() * 6));
    ctx.fillRect(0, i * 16 + 1, 64, 14);
    ctx.fillStyle = gray(7);
    ctx.fillRect(0, i * 16, 64, 2);
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = gray(8 + Math.floor(Math.random() * 10));
    ctx.fillRect(Math.floor(Math.random() * 64), Math.floor(Math.random() * 64), 2, 2);
  }
  return toTexture(c, true, true);
}

/** Soft radial glow used for flames, spell cores, pickups. */
export function makeGlowTexture(inner = "rgba(245,240,225,1)", mid = "rgba(220,214,196,0.35)"): THREE.CanvasTexture {
  const [c, ctx] = canvas(64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, mid);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

/** Hard-edged star used for the revolver muzzle flash. */
export function makeStarTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64);
  ctx.translate(32, 32);
  ctx.fillStyle = "rgba(250,246,232,1)";
  ctx.beginPath();
  const spikes = 4;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 30 : 7;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,250,1)";
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(c, false);
}

/** Soft grey smoke puff. */
export function makeSmokeTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64);
  ctx.clearRect(0, 0, 64, 64);
  for (let i = 0; i < 7; i++) {
    const x = 32 + (Math.random() - 0.5) * 22;
    const y = 32 + (Math.random() - 0.5) * 22;
    const r = 9 + Math.random() * 12;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, "rgba(120,118,112,0.5)");
    g.addColorStop(1, "rgba(120,118,112,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return toTexture(c, false);
}

/** Irregular dark scorch mark for bullet impacts. */
export function makeScorchTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64);
  ctx.clearRect(0, 0, 64, 64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 28);
  g.addColorStop(0, "rgba(0,0,0,0.95)");
  g.addColorStop(0.4, "rgba(4,4,4,0.75)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 14 + Math.random() * 14;
    const x = 32 + Math.cos(a) * d;
    const y = 32 + Math.sin(a) * d;
    const r = 2 + Math.random() * 5;
    const sg = ctx.createRadialGradient(x, y, 0.5, x, y, r);
    sg.addColorStop(0, "rgba(0,0,0,0.7)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, 64, 64);
  }
  return toTexture(c, false);
}

/** Flame-shaped glow for wisps and torch fire. */
export function makeFlameTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64);
  ctx.clearRect(0, 0, 64, 64);
  // teardrop body
  const body = ctx.createRadialGradient(32, 40, 2, 32, 40, 22);
  body.addColorStop(0, "rgba(255,255,255,0.95)");
  body.addColorStop(0.5, "rgba(255,255,255,0.45)");
  body.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, 64, 64);
  // rising tip
  const tip = ctx.createRadialGradient(32, 22, 1, 32, 26, 16);
  tip.addColorStop(0, "rgba(255,255,255,0.7)");
  tip.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = tip;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

/** Pixel rune sigil for the spell orb / nova ring. */
export function makeRuneTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64);
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = "rgba(240,235,218,0.95)";
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 44, 44);
  ctx.beginPath();
  ctx.moveTo(32, 6);
  ctx.lineTo(58, 32);
  ctx.lineTo(32, 58);
  ctx.lineTo(6, 32);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(32, 16);
  ctx.lineTo(32, 48);
  ctx.moveTo(20, 26);
  ctx.lineTo(44, 38);
  ctx.moveTo(44, 26);
  ctx.lineTo(20, 38);
  ctx.stroke();
  return toTexture(c, true);
}
