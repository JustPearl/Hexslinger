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
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const base = 20 + Math.floor(Math.random() * 16);
      ctx.fillStyle = gray(base);
      ctx.fillRect(tx * 32 + 1, ty * 32 + 1, 30, 30);
      for (let i = 0; i < 26; i++) {
        const v = base + Math.floor(Math.random() * 26) - 10;
        ctx.fillStyle = gray(Math.max(6, v));
        ctx.fillRect(tx * 32 + 1 + Math.floor(Math.random() * 30), ty * 32 + 1 + Math.floor(Math.random() * 30), 2, 2);
      }
    }
  }
  ctx.fillStyle = gray(10);
  for (let i = 0; i <= 4; i++) {
    ctx.fillRect(i * 32 - 1, 0, 2, 128);
    ctx.fillRect(0, i * 32 - 1, 128, 2);
  }
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
      for (let i = 0; i < 30; i++) {
        const v = base + Math.floor(Math.random() * 30) - 14;
        ctx.fillStyle = gray(Math.max(10, v));
        ctx.fillRect(x + 2 + Math.floor(Math.random() * 60), r * bh + 2 + Math.floor(Math.random() * (bh - 4)), 3, 2);
      }
      ctx.fillStyle = gray(12);
      ctx.fillRect(x + 54, r * bh + 2, 8, 5);
    }
  }
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

/** Soft radial glow — flames, spell cores, pickups. */
export function makeGlowTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(245,240,225,1)");
  g.addColorStop(0.35, "rgba(220,214,196,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

/** Hard 4-point star for the handcannon muzzle flash. */
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

/** Pixel rune sigil for spell orbs, rings and casting flourishes. */
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

/** Pixelated smoke puff (irregular blob). */
export function makeSmokeTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(32);
  ctx.clearRect(0, 0, 32, 32);
  ctx.fillStyle = "rgba(210,205,190,0.9)";
  const blobs: [number, number, number][] = [
    [16, 16, 9], [10, 19, 6], [22, 18, 7], [14, 10, 6], [21, 11, 5], [9, 12, 4],
  ];
  for (const [x, y, r] of blobs) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(240,236,222,0.5)";
  ctx.beginPath();
  ctx.arc(14, 13, 4, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(c, true);
}

/** Scorch mark for bullet hits. */
export function makeScorchTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(32);
  ctx.clearRect(0, 0, 32, 32);
  ctx.fillStyle = "rgba(4,4,4,0.85)";
  ctx.beginPath();
  ctx.arc(16, 16, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(10,10,10,0.5)";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
    const d = 7 + Math.random() * 6;
    ctx.fillRect(16 + Math.cos(a) * d - 1.5, 16 + Math.sin(a) * d - 1.5, 3, 3);
  }
  ctx.fillStyle = "rgba(0,0,0,0.9)";
  ctx.beginPath();
  ctx.arc(16, 16, 3, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(c, true);
}

/** Chunky pixel flame. */
export function makeFlameTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(32);
  ctx.clearRect(0, 0, 32, 32);
  ctx.fillStyle = "rgba(235,230,215,0.95)";
  ctx.beginPath();
  ctx.moveTo(16, 2);
  ctx.lineTo(24, 12);
  ctx.lineTo(27, 22);
  ctx.lineTo(22, 29);
  ctx.lineTo(10, 29);
  ctx.lineTo(5, 21);
  ctx.lineTo(9, 11);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,252,240,0.9)";
  ctx.beginPath();
  ctx.moveTo(16, 10);
  ctx.lineTo(20, 18);
  ctx.lineTo(18, 25);
  ctx.lineTo(13, 24);
  ctx.lineTo(12, 17);
  ctx.closePath();
  ctx.fill();
  return toTexture(c, true);
}
