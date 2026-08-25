import * as THREE from "three";
import {
  makeFloorTexture,
  makeWallTexture,
  makeCeilingTexture,
  makeGlowTexture,
  makeStarTexture,
  makeRuneTexture,
  makeSmokeTexture,
  makeScorchTexture,
  makeFlameTexture,
} from "./textures";
import { HexAudio } from "./audio";
import { generateDungeon, Collider, CELL, GRID_W, GRID_H, WALL_H, type Dungeon } from "./dungeon";

/* ============================== types ============================== */

export type EngineState = "menu" | "playing" | "dead";

export interface HudData {
  hp: number;
  maxHp: number;
  souls: number;
  maxSouls: number;
  ammo: number;
  maxAmmo: number;
  reloading: boolean;
  reloadProgress: number;
  score: number;
  kills: number;
  wave: number;
  enemiesLeft: number;
  slotReady: number; // 0..1 cooldown of equipped hex
  equippedSpell: SpellId;
  spellCharges: number;
  spellMax: number; // 0 = infinite
  novaReady: number; // 0..1
  state: EngineState;
  paused: boolean;
  muted: boolean;
  fps: number;
}

export interface GameEvent {
  type: "kill" | "damage" | "hit" | "wave" | "dead" | "heal" | "flash" | "empty" | "spell";
  text?: string;
  wave?: number;
  sub?: string;
  color?: string;
  stats?: { score: number; kills: number; wave: number; accuracy: number };
}

interface EnemyDef {
  hp: number;
  speed: number;
  dmg: number;
  range: number;
  rate: number;
  value: number;
  radius: number;
}

const ENEMY_DEFS: Record<string, EnemyDef> = {
  goblin: { hp: 62, speed: 3.5, dmg: 10, range: 1.55, rate: 1.15, value: 100, radius: 0.45 },
  wraith: { hp: 85, speed: 4.3, dmg: 14, range: 1.4, rate: 0.95, value: 150, radius: 0.42 },
  brute: { hp: 235, speed: 2.0, dmg: 22, range: 2.1, rate: 1.75, value: 250, radius: 0.85 },
};

/* ---------- hexcraft: one slot, many grimoires ---------- */

export type SpellId = "hellbolt" | "mortar" | "chain" | "lance";

export interface SpellDef {
  name: string;
  color: number;
  css: string;
  rgb: [number, number, number];
  cost: number;
  charges: number; // 0 = soul-fed, infinite
  cd: number;
  blurb: string;
}

export const SPELLS: Record<SpellId, SpellDef> = {
  hellbolt: {
    name: "HELLBOLT", color: 0x63d8ff, css: "#63d8ff", rgb: [0.42, 0.86, 1],
    cost: 30, charges: 0, cd: 0.55, blurb: "The bread-and-butter curse. Straight flight, hex blast.",
  },
  mortar: {
    name: "SKULLMORTAR", color: 0x7dffa8, css: "#7dffa8", rgb: [0.49, 1, 0.66],
    cost: 36, charges: 10, cd: 0.85, blurb: "A screaming skull on a grave arc. Big dirty bloom.",
  },
  chain: {
    name: "CHAIN HEX", color: 0xbd8cff, css: "#bd8cff", rgb: [0.74, 0.55, 1],
    cost: 34, charges: 14, cd: 0.34, blurb: "Lightning that skips skull to skull. Up to four.",
  },
  lance: {
    name: "CRIMSON LANCE", color: 0xff5a64, css: "#ff5a64", rgb: [1, 0.35, 0.39],
    cost: 42, charges: 9, cd: 0.65, blurb: "A blood needle that spits through the whole line.",
  },
};

interface Enemy {
  id: number;
  type: "goblin" | "wraith" | "brute";
  group: THREE.Group;
  mats: THREE.MeshLambertMaterial[];
  hitMeshes: THREE.Mesh[];
  armL: THREE.Group | null;
  armR: THREE.Group | null;
  legL: THREE.Group | null;
  legR: THREE.Group | null;
  eyes: THREE.Mesh[];
  def: EnemyDef;
  hp: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  flash: number;
  spawnT: number;
  attackCd: number;
  windup: number;
  leapCd: number;
  animT: number;
  facing: number;
  dead: boolean;
}

interface Pickup {
  group: THREE.Group;
  kind: "heart" | "soul" | "tome";
  spell?: SpellId;
  pos: THREE.Vector3;
  life: number;
  spin: number;
}

interface Bolt {
  group: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  alive: boolean;
  spell: SpellId;
  grav: number;
  hitIds: Set<number>;
  trail: number;
}

interface Ring {
  mesh: THREE.Mesh;
  t: number;
  maxT: number;
  maxR: number;
  alive: boolean;
}

interface Chunk {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
  alive: boolean;
}

interface Puff {
  sprite: THREE.Sprite;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  grow: number;
  alive: boolean;
}

interface Scorch {
  sprite: THREE.Sprite;
  life: number;
  alive: boolean;
}

interface Wisp {
  sprite: THREE.Sprite;
  pos: THREE.Vector3;
  seed: number;
  life: number;
  maxLife: number;
  alive: boolean;
}

interface Casing {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  alive: boolean;
}

interface FlashSpr {
  sprite: THREE.Sprite;
  life: number;
  maxLife: number;
  maxScale: number;
  alive: boolean;
}

const ROMAN: [number, string][] = [
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
export function toRoman(n: number): string {
  let out = "";
  let v = Math.max(1, Math.min(39, n));
  for (const [val, sym] of ROMAN) while (v >= val) { out += sym; v -= val; }
  return out;
}

const KILL_LINES: Record<string, string[]> = {
  goblin: [
    "Goblin sleeps with the fishes.",
    "Rat collected. Bounty paid in lead.",
    "One less knife in the dark.",
    "Goblin filed under \u201Cmissing, presumed cursed\u201D.",
    "Shiv'd the shivver.",
  ],
  wraith: [
    "Wraith evicted. No refund.",
    "Ghost shook down for last dues.",
    "Hollow one, now hollower.",
    "Spirit sent to the underboss below.",
  ],
  brute: [
    "Brute meets the bone orchestra.",
    "Big problem, six small solutions.",
    "Hulk put on a permanent payment plan.",
    "Crypt door closed on the big one.",
  ],
};

const WAVE_SUBS = [
  "The family sends its regards.",
  "No witnesses below the crypt.",
  "Debts collected in bone and ash.",
  "The underboss is displeased.",
  "Sleep with the fishes, burn with the rest.",
  "Six chambers, endless sinners.",
  "The dungeon pays its respects.",
];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/* The dungeon is bone-and-soot monochrome. Only hellfire and hexcraft get color. */
const C_MUZZLE = 0xff9432; // hot ember orange — gunfire
const C_MUZZLE_HOT = 0xffd9a0;
const C_SPELL = 0x63d8ff; // spectral cyan — hexcraft
const C_SPELL_HOT = 0xcdf2ff;
const COL_BONE: [number, number, number] = [1, 0.96, 0.87];
const COL_EMBER: [number, number, number] = [1, 0.55, 0.18];
const COL_HEX: [number, number, number] = [0.42, 0.86, 1];

/* ============================== engine ============================== */

const PIX = 3; // pixelation factor

export class HexEngine {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clockT = 0;
  private raf = 0;
  private lastT = 0;
  private onHud: (h: HudData) => void;
  private onEvent: (e: GameEvent) => void;
  private audio = new HexAudio();
  private dungeon: Dungeon;
  private collider: Collider;
  private destroyed = false;

  /* player */
  private pos = new THREE.Vector3(0, 0, 0);
  private vel = new THREE.Vector3();
  private vy = 0;
  private yaw = 0;
  private pitch = 0;
  private grounded = true;
  private bobT = 0;
  private hp = 100;
  private souls = 100;
  private invuln = 0;
  private dead = false;
  private deathT = 0;

  /* weapons */
  private ammo = 6;
  private reloading = false;
  private reloadT = 0;
  private fireCd = 0;
  private recoil = 0;
  private recoilPitch = 0;
  private boltCd = 0;
  private novaCd = 0;
  private equipped: SpellId = "hellbolt";
  private spellCharges = 0;
  private tomePity = 0;
  private castLunge = 0;
  private novaLunge = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private muzzleT = 0;

  /* game state */
  private state: EngineState = "menu";
  private paused = false;
  private wave = 0;
  private score = 0;
  private kills = 0;
  private spawnQueue: ("goblin" | "wraith" | "brute")[] = [];
  private spawnTimer = 0;
  private wavePendingT = -1;
  private hudTimer = 0;
  private fps = 60;
  private menuT = 0;
  private timeScale = 1;

  /* three bits */
  private enemyRoot = new THREE.Group();
  private enemies: Enemy[] = [];
  private pickups: Pickup[] = [];
  private bolts: Bolt[] = [];
  private rings: Ring[] = [];
  private enemyId = 1;

  private torchLights: THREE.PointLight[] = [];
  private torchSeeds: number[] = [];
  private muzzleLight!: THREE.PointLight;
  private boltLight!: THREE.PointLight;
  private flashLight!: THREE.PointLight;
  private flashLightT = 0;

  /* viewmodel */
  private vm = new THREE.Group();
  private gunGroup!: THREE.Group;
  private spellGroup!: THREE.Group;
  private muzzleAnchor!: THREE.Object3D;
  private muzzleFlash!: THREE.Group;
  private spellOrb!: THREE.Group;
  private chamber!: THREE.Mesh;

  /* fx pools */
  private sparkGeo!: THREE.BufferGeometry;
  private sparkPos!: Float32Array;
  private sparkVel!: Float32Array;
  private sparkLife!: Float32Array;
  private sparkCol!: Float32Array;
  private sparks!: THREE.Points;
  private readonly SPARK_N = 240;

  private chunkMesh!: THREE.InstancedMesh;
  private chunks: Chunk[] = [];
  private readonly CHUNK_N = 180;

  private smokePool: Puff[] = [];
  private scorchPool: Scorch[] = [];
  private wispPool: Wisp[] = [];
  private casingPool: Casing[] = [];
  private flashSprPool: FlashSpr[] = [];
  private beamPool: { line: THREE.Line; geo: THREE.BufferGeometry; mat: THREE.LineBasicMaterial; life: number }[] = [];
  private smokeTex!: THREE.Texture;
  private scorchTex!: THREE.Texture;
  private flameTex!: THREE.Texture;

  /* heavy weapon feel */
  private fovKick = 0;
  private fovBase = 74;
  private rollKick = 0;
  private fireSign = 1;
  private gunKick = 0;
  private killStopT = 0;
  private vmLag = new THREE.Vector3();

  private dmgPool: { sprite: THREE.Sprite; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; life: number; vel: THREE.Vector3 }[] = [];
  private tracerPool: { mesh: THREE.Mesh; life: number }[] = [];

  private ember!: THREE.Points;
  private emberSeeds: number[] = [];

  private glowTex: THREE.Texture;
  private starTex: THREE.Texture;
  private runeTex: THREE.Texture;

  constructor(container: HTMLElement, canvas: HTMLCanvasElement, onHud: (h: HudData) => void, onEvent: (e: GameEvent) => void) {
    this.container = container;
    this.canvas = canvas;
    this.onHud = onHud;
    this.onEvent = onEvent;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    this.camera = new THREE.PerspectiveCamera(74, 1, 0.05, 120);
    this.camera.rotation.order = "YXZ";

    this.scene.background = new THREE.Color(0x050505);
    this.scene.fog = new THREE.FogExp2(0x050505, 0.052);

    this.glowTex = makeGlowTexture();
    this.starTex = makeStarTexture();
    this.runeTex = makeRuneTexture();
    this.smokeTex = makeSmokeTexture();
    this.scorchTex = makeScorchTexture();
    this.flameTex = makeFlameTexture();

    this.dungeon = generateDungeon(1349 + Math.floor(Math.random() * 9999));
    this.collider = new Collider(this.dungeon);

    this.buildDungeon();
    this.buildViewmodel();
    this.buildPools();
    this.buildLights();
    this.bindInput();
    this.handleResize();

    this.lastT = performance.now();
    const loop = (t: number) => {
      if (this.destroyed) return;
      this.raf = requestAnimationFrame(loop);
      const dtRaw = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      if (dtRaw > 0) this.fps = this.fps * 0.92 + (1 / dtRaw) * 0.08;
      this.tick(dtRaw);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /* ------------------------------ world ------------------------------ */

  private buildDungeon() {
    const d = this.dungeon;

    const floorTex = makeFloorTexture();
    floorTex.repeat.set(GRID_W / 2, GRID_H / 2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID_W * CELL, GRID_H * CELL),
      new THREE.MeshLambertMaterial({ map: floorTex })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const ceilTex = makeCeilingTexture();
    ceilTex.repeat.set(GRID_W / 2, GRID_H / 2);
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID_W * CELL, GRID_H * CELL),
      new THREE.MeshLambertMaterial({ map: ceilTex })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = WALL_H + 0.4;
    this.scene.add(ceil);

    // walls as instanced stacked blocks
    const wallTex = makeWallTexture();
    const solid: [number, number][] = [];
    for (let j = 0; j < GRID_H; j++)
      for (let i = 0; i < GRID_W; i++)
        if (d.grid[j * GRID_W + i] === 1) solid.push([i, j]);

    const blockGeo = new THREE.BoxGeometry(CELL, WALL_H / 2, CELL);
    const blockMat = new THREE.MeshLambertMaterial({ map: wallTex });
    const walls = new THREE.InstancedMesh(blockGeo, blockMat, solid.length * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    let wi = 0;
    for (const [i, j] of solid) {
      const wx = (i - GRID_W / 2 + 0.5) * CELL;
      const wz = (j - GRID_H / 2 + 0.5) * CELL;
      for (let tier = 0; tier < 2; tier++) {
        const sc = rnd(0.985, 1.02);
        p.set(wx + rnd(-0.04, 0.04), tier * (WALL_H / 2) + WALL_H / 4, wz + rnd(-0.04, 0.04));
        s.set(sc, rnd(0.97, 1.0), sc);
        m.compose(p, q, s);
        walls.setMatrixAt(wi++, m);
      }
    }
    walls.instanceMatrix.needsUpdate = true;
    this.scene.add(walls);

    // props
    const propMats = {
      stone: new THREE.MeshLambertMaterial({ color: 0x3c3b37 }),
      dark: new THREE.MeshLambertMaterial({ color: 0x26261f }),
      bone: new THREE.MeshLambertMaterial({ color: 0x8f8a7c }),
    };
    const crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.05, 8);
    const boneGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.75, 5);
    const skullGeo = new THREE.BoxGeometry(0.26, 0.24, 0.3);
    const rubbleGeo = new THREE.DodecahedronGeometry(0.28, 0);
    for (const pr of d.props) {
      let mesh: THREE.Mesh;
      switch (pr.kind) {
        case "crate":
          mesh = new THREE.Mesh(crateGeo, propMats.dark);
          mesh.position.set(pr.x, 0.45 * pr.scale, pr.z);
          break;
        case "barrel":
          mesh = new THREE.Mesh(barrelGeo, propMats.dark);
          mesh.position.set(pr.x, 0.52 * pr.scale, pr.z);
          break;
        case "bones": {
          mesh = new THREE.Mesh(boneGeo, propMats.bone);
          mesh.position.set(pr.x, 0.07, pr.z);
          mesh.rotation.z = Math.PI / 2;
          break;
        }
        case "skullpile":
          mesh = new THREE.Mesh(skullGeo, propMats.bone);
          mesh.position.set(pr.x, 0.13, pr.z);
          break;
        default:
          mesh = new THREE.Mesh(rubbleGeo, propMats.stone);
          mesh.position.set(pr.x, 0.16, pr.z);
      }
      mesh.rotation.y = pr.rot;
      mesh.scale.setScalar(pr.scale);
      this.scene.add(mesh);
      if (pr.kind === "bones") {
        const extra = new THREE.Mesh(boneGeo, propMats.bone);
        extra.position.set(pr.x, 0.12, pr.z);
        extra.rotation.set(0, pr.rot + 1.1, Math.PI / 2);
        this.scene.add(extra);
      }
    }

    // torch sconces (lights added in buildLights)
    const sconceMat = new THREE.MeshLambertMaterial({ color: 0x1d1d1a });
    const flameMat = new THREE.SpriteMaterial({ map: this.flameTex, color: 0xefe9d8, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const t of d.torches) {
      const g = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), sconceMat);
      arm.position.y = 2.3;
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.09, 0.2, 6), sconceMat);
      cup.position.y = 2.62;
      const flame = new THREE.Sprite(flameMat.clone());
      flame.position.y = 2.85;
      flame.scale.set(0.85, 1.15, 1);
      g.add(arm, cup, flame);
      g.position.set(t.x, 0, t.z);
      this.scene.add(g);
      (g as THREE.Group & { userData: { flame: THREE.Sprite } }).userData.flame = flame;
      this.torchFlames.push(flame);
    }

    // braziers
    for (const b of d.braziers) {
      const g = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.28, 0.5, 8), propMats.stone);
      bowl.position.y = 0.85;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.85, 6), propMats.stone);
      stem.position.y = 0.42;
      const coal = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 8), new THREE.MeshBasicMaterial({ color: 0xd9d2bd }));
      coal.position.y = 1.05;
      const flame = new THREE.Sprite(flameMat.clone());
      flame.position.y = 1.45;
      flame.scale.set(1.3, 1.7, 1);
      g.add(stem, bowl, coal, flame);
      g.position.set(b.x, 0, b.z);
      this.scene.add(g);
      this.torchFlames.push(flame);
      this.brazierPos.push(new THREE.Vector3(b.x, 1.3, b.z));
    }

    // ambient embers
    const emberN = 130;
    const eg = new THREE.BufferGeometry();
    const ep = new Float32Array(emberN * 3);
    const ec = new Float32Array(emberN * 3);
    for (let i = 0; i < emberN; i++) {
      ep[i * 3] = rnd(-GRID_W, GRID_W) * 0.5 * CELL * 0.5;
      ep[i * 3 + 1] = rnd(0.2, 4);
      ep[i * 3 + 2] = rnd(-GRID_H, GRID_H) * 0.5 * CELL * 0.5;
      const v = rnd(0.25, 0.7);
      ec[i * 3] = v; ec[i * 3 + 1] = v * 0.95; ec[i * 3 + 2] = v * 0.85;
      this.emberSeeds.push(rnd(0, 100));
    }
    eg.setAttribute("position", new THREE.BufferAttribute(ep, 3));
    eg.setAttribute("color", new THREE.BufferAttribute(ec, 3));
    this.ember = new THREE.Points(eg, new THREE.PointsMaterial({
      size: 0.055, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8,
    }));
    this.scene.add(this.ember);
  }

  private torchFlames: THREE.Sprite[] = [];
  private brazierPos: THREE.Vector3[] = [];

  private buildLights() {
    this.scene.add(new THREE.AmbientLight(0xb9b2a0, 0.42));
    for (let i = 0; i < this.dungeon.torches.length; i++) {
      const t = this.dungeon.torches[i];
      const l = new THREE.PointLight(0xdcd6c4, 26, 17, 1.8);
      l.position.set(t.x + t.nx * 0.4, 2.85, t.z + t.nz * 0.4);
      this.scene.add(l);
      this.torchLights.push(l);
      this.torchSeeds.push(rnd(0, 100));
    }
    for (const b of this.brazierPos) {
      const l = new THREE.PointLight(0xdcd6c4, 30, 19, 1.8);
      l.position.copy(b).add(new THREE.Vector3(0, 0.4, 0));
      this.scene.add(l);
      this.torchLights.push(l);
      this.torchSeeds.push(rnd(0, 100));
    }
    this.muzzleLight = new THREE.PointLight(C_MUZZLE, 0, 12, 2);
    this.scene.add(this.muzzleLight);
    this.boltLight = new THREE.PointLight(C_SPELL, 0, 14, 2);
    this.scene.add(this.boltLight);
    this.flashLight = new THREE.PointLight(C_SPELL, 0, 24, 1.9);
    this.scene.add(this.flashLight);

    const handLight = new THREE.PointLight(0xd8d0bc, 1.6, 5, 2);
    handLight.position.set(0, -0.1, -0.6);
    this.camera.add(handLight);
    this.scene.add(this.camera);
  }

  /* ------------------------------ viewmodel ------------------------------ */

  private buildViewmodel() {
    this.camera.add(this.vm);
    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0x191917 });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0x9a948a });
    const gunMetal = new THREE.MeshLambertMaterial({ color: 0x2e2e2c });
    const gunDark = new THREE.MeshLambertMaterial({ color: 0x1c1c1b });
    const runeMat = new THREE.MeshLambertMaterial({ color: 0x141414, emissive: 0xd9d2bd, emissiveIntensity: 1.6 });

    /* --- the Judge: a hand-cannon, not a pistol (right hand) --- */
    this.gunGroup = new THREE.Group();
    this.gunGroup.position.set(0.36, -0.33, -0.6);

    const add = (mesh: THREE.Mesh) => this.gunGroup.add(mesh);

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.18, 0.62, 7), sleeveMat);
    sleeve.position.set(0.17, -0.33, 0.33);
    sleeve.rotation.set(0.9, 0, 0.5);
    add(sleeve);
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.13, 0.18), skinMat);
    fist.position.set(0, -0.14, 0.06);
    add(fist);
    const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.1), skinMat);
    knuckle.position.set(0, -0.06, 0.1);
    add(knuckle);

    // massive top-break frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.36), gunMetal);
    frame.position.set(0, 0.0, -0.02);
    add(frame);
    const topStrap = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.035, 0.4), gunDark);
    topStrap.position.set(0, 0.085, -0.05);
    add(topStrap);

    // oversized hex cylinder
    this.chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.18, 6), gunMetal);
    this.chamber.rotation.x = Math.PI / 2;
    this.chamber.position.set(0, 0.005, 0.03);
    add(this.chamber);
    const cylPin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 6), gunDark);
    cylPin.rotation.x = Math.PI / 2;
    cylPin.position.set(0, 0.005, 0.03);
    add(cylPin);

    // rune plates on both frame flanks (dull bone sigils — monochrome)
    const runeL = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.09, 0.18), runeMat);
    runeL.position.set(-0.062, 0.0, -0.03);
    const runeR = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.09, 0.18), runeMat);
    runeR.position.set(0.062, 0.0, -0.03);
    add(runeL); add(runeR);

    // thick octagonal barrel with full-length rib + underlug
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.46, 8), gunMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.035, -0.4);
    add(barrel);
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.018, 0.44), gunDark);
    rib.position.set(0, 0.082, -0.38);
    add(rib);
    const underlug = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.32), gunDark);
    underlug.position.set(0, -0.022, -0.32);
    add(underlug);

    // compensator with side vents
    const comp = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.13, 8), gunMetal);
    comp.rotation.x = Math.PI / 2;
    comp.position.set(0, 0.035, -0.67);
    add(comp);
    for (let v = 0; v < 3; v++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.016, 0.014), gunDark);
      vent.position.set(0, 0.035, -0.635 - v * 0.035);
      add(vent);
    }
    const muzzleRing = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.035, 8), gunDark);
    muzzleRing.rotation.x = Math.PI / 2;
    muzzleRing.position.set(0, 0.035, -0.745);
    add(muzzleRing);

    // sights
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.05, 0.02), gunDark);
    frontSight.position.set(0, 0.117, -0.71);
    add(frontSight);
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.022, 0.02), gunDark);
    rearSight.position.set(0, 0.105, 0.07);
    add(rearSight);

    // slab hammer + guard + grip
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.055), gunDark);
    hammer.position.set(0, 0.115, 0.17);
    hammer.rotation.x = -0.3;
    add(hammer);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.009, 6, 10, Math.PI), gunDark);
    guard.position.set(0, -0.07, 0.0);
    guard.rotation.z = Math.PI;
    add(guard);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.045, 0.016), gunMetal);
    trigger.position.set(0, -0.085, 0.015);
    add(trigger);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.23, 0.12), gunDark);
    grip.position.set(0, -0.19, 0.13);
    grip.rotation.x = 0.35;
    add(grip);
    const gripCap = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.05, 0.14), gunMetal);
    gripCap.position.set(0, -0.3, 0.17);
    gripCap.rotation.x = 0.35;
    add(gripCap);

    // syndicate chain + skull charm hanging from the grip
    const linkGeo = new THREE.TorusGeometry(0.018, 0.005, 5, 8);
    const link1 = new THREE.Mesh(linkGeo, gunMetal);
    link1.position.set(0.04, -0.33, 0.2);
    const link2 = new THREE.Mesh(linkGeo, gunMetal);
    link2.position.set(0.04, -0.365, 0.2);
    link2.rotation.y = Math.PI / 2;
    const charm = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.03, 0.022), new THREE.MeshLambertMaterial({ color: 0x9a948a }));
    charm.position.set(0.04, -0.4, 0.2);
    add(link1); add(link2); add(charm);

    this.muzzleAnchor = new THREE.Object3D();
    this.muzzleAnchor.position.set(0, 0.035, -0.78);
    this.gunGroup.add(this.muzzleAnchor);

    // ember muzzle flash — the only warm thing in the crypt
    this.muzzleFlash = new THREE.Group();
    const flashMat = new THREE.SpriteMaterial({ map: this.starTex, color: C_MUZZLE, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const f1 = new THREE.Sprite(flashMat);
    f1.scale.set(1.0, 1.0, 1);
    const f2 = new THREE.Sprite(flashMat.clone());
    f2.scale.set(0.62, 0.62, 1);
    f2.material.rotation = Math.PI / 4;
    f2.material.color = new THREE.Color(C_MUZZLE_HOT);
    const f3 = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: C_MUZZLE_HOT, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    f3.scale.set(0.55, 0.55, 1);
    this.muzzleFlash.add(f1, f2, f3);
    this.muzzleFlash.visible = false;
    this.muzzleAnchor.add(this.muzzleFlash);
    this.vm.add(this.gunGroup);

    /* --- spell hand (left) --- */
    this.spellGroup = new THREE.Group();
    this.spellGroup.position.set(-0.33, -0.3, -0.52);
    const sleeve2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 0.55, 7), sleeveMat);
    sleeve2.position.set(-0.12, -0.26, 0.26);
    sleeve2.rotation.set(0.8, 0, -0.5);
    const hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.13), skinMat);
    hand2.position.set(0, -0.02, 0);
    hand2.rotation.x = -0.4;
    this.spellGroup.add(sleeve2, hand2);

    this.spellOrb = new THREE.Group();
    this.spellOrb.position.set(0, 0.16, -0.05);
    const orbCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: C_SPELL_HOT }));
    const orbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: C_SPELL, blending: THREE.AdditiveBlending, depthWrite: false }));
    orbGlow.scale.set(0.7, 0.7, 1);
    const runeCard = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.runeTex, color: C_SPELL, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.75 }));
    runeCard.scale.set(0.5, 0.5, 1);
    this.spellOrb.add(orbCore, orbGlow, runeCard);
    this.spellGroup.add(this.spellOrb);
    this.vm.add(this.spellGroup);
  }

  /* ------------------------------ fx pools ------------------------------ */

  private buildPools() {
    // sparks
    this.sparkPos = new Float32Array(this.SPARK_N * 3);
    this.sparkVel = new Float32Array(this.SPARK_N * 3);
    this.sparkLife = new Float32Array(this.SPARK_N);
    this.sparkCol = new Float32Array(this.SPARK_N * 3);
    for (let i = 0; i < this.SPARK_N; i++) this.sparkPos[i * 3 + 1] = -99;
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute("position", new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkGeo.setAttribute("color", new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparks = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({
      size: 0.075, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.scene.add(this.sparks);

    // chunks
    this.chunkMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c2 }),
      this.CHUNK_N
    );
    this.chunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const mz = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.CHUNK_N; i++) {
      this.chunkMesh.setMatrixAt(i, mz);
      this.chunks.push({
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(),
        life: 0, maxLife: 1, scale: 0.1, alive: false,
      });
    }
    this.scene.add(this.chunkMesh);

    // damage numbers
    for (let i = 0; i < 22; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 128; canvas.height = 48;
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      sprite.scale.set(1.1, 0.42, 1);
      sprite.visible = false;
      sprite.renderOrder = 900;
      this.scene.add(sprite);
      this.dmgPool.push({ sprite, canvas, tex, life: 0, vel: new THREE.Vector3() });
    }

    // tracers
    const tracerGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 4);
    tracerGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({
        color: 0xffb066, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      mesh.visible = false;
      this.scene.add(mesh);
      this.tracerPool.push({ mesh, life: 0 });
    }

    // shockwave rings (hex-blue)
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.82, 1, 28),
        new THREE.MeshBasicMaterial({
          map: this.runeTex, color: C_SPELL, transparent: true, opacity: 0.9,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.rings.push({ mesh, t: 0, maxT: 0.45, maxR: 4, alive: false });
    }

    // muzzle smoke puffs
    for (let i = 0; i < 18; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: 0xb5b0a2, transparent: true, opacity: 0, depthWrite: false }));
      sprite.visible = false;
      this.scene.add(sprite);
      this.smokePool.push({ sprite, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 1, grow: 1, alive: false });
    }
    // bullet scorch marks
    for (let i = 0; i < 24; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.scorchTex, transparent: true, opacity: 0, depthWrite: false }));
      sprite.visible = false;
      sprite.scale.set(0.45, 0.45, 1);
      this.scene.add(sprite);
      this.scorchPool.push({ sprite, life: 0, alive: false });
    }
    // soul wisps (bone on death, hex-blue for spells)
    for (let i = 0; i < 20; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flameTex, color: 0xe9e2cd, blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false }));
      sprite.visible = false;
      this.scene.add(sprite);
      this.wispPool.push({ sprite, pos: new THREE.Vector3(), seed: rnd(0, 10), life: 0, maxLife: 1, alive: false });
    }
    // spent casings dumped from the cylinder
    const casingGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.058, 6);
    const casingMat = new THREE.MeshLambertMaterial({ color: 0xc9c2ae });
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(casingGeo, casingMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.casingPool.push({ mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, alive: false });
    }
    // big flash sprites for spell detonations
    for (let i = 0; i < 8; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: C_SPELL, blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false }));
      sprite.visible = false;
      this.scene.add(sprite);
      this.flashSprPool.push({ sprite, life: 0, maxLife: 0.3, maxScale: 4, alive: false });
    }
    // chain-hex lightning beams
    for (let i = 0; i < 10; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0xbd8cff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      this.scene.add(line);
      this.beamPool.push({ line, geo, mat, life: 0 });
    }
  }

  /* ------------------------------ input ------------------------------ */

  private keys = new Set<string>();
  private locked = false;
  private dragging = false;

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === "Space") e.preventDefault();
    if (this.state !== "playing" || this.paused || this.dead) {
      if (e.code === "KeyM") this.toggleMute();
      return;
    }
    if (e.code === "KeyR") this.startReload();
    if (e.code === "KeyQ") this.castNova();
    if (e.code === "KeyM") this.toggleMute();
    if (e.code === "KeyP") this.pauseGame(true);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  private onMouseMove = (e: MouseEvent) => {
    if (this.state !== "playing" || this.paused || this.dead) return;
    if (!this.locked && !this.dragging) return;
    this.yaw -= e.movementX * 0.0021;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * 0.0021));
  };

  private onMouseDown = (e: MouseEvent) => {
    this.audio.ensure();
    if (this.state !== "playing" || this.paused || this.dead) return;
    if (!this.locked) {
      // pointer lock unavailable — fall back to drag-aim
      this.dragging = true;
      this.tryLock();
    }
    if (e.button === 0) this.tryFire();
    if (e.button === 2) this.castSpell();
  };
  private onMouseUp = () => { this.dragging = false; };
  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked && this.state === "playing" && !this.dead && !this.paused) this.pauseGame(true);
    if (this.locked && this.paused) this.paused = false;
  };
  private onResize = () => this.handleResize();
  private onCtx = (e: Event) => e.preventDefault();

  private bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("pointerlockchange", this.onLockChange);
    window.addEventListener("resize", this.onResize);
    this.canvas.addEventListener("contextmenu", this.onCtx);
  }

  private tryLock() {
    try {
      const p = this.canvas.requestPointerLock() as unknown;
      if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {});
    } catch { /* drag-aim fallback stays active */ }
  }

  private handleResize() {
    const w = Math.max(2, Math.floor(this.container.clientWidth / PIX));
    const h = Math.max(2, Math.floor(this.container.clientHeight / PIX));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    this.camera.updateProjectionMatrix();
  }

  /* ------------------------------ public api ------------------------------ */

  begin() {
    this.audio.ensure();
    this.keys.clear();
    this.clearWorld();
    this.hp = 100; this.souls = 100; this.ammo = 6;
    this.reloading = false; this.fireCd = 0; this.boltCd = 0; this.novaCd = 0;
    this.equipped = "hellbolt"; this.spellCharges = 0; this.tomePity = 0;
    this.score = 0; this.kills = 0; this.wave = 0;
    this.shotsFired = 0; this.shotsHit = 0;
    this.dead = false; this.deathT = 0; this.timeScale = 1;
    this.invuln = 0; this.vy = 0; this.vel.set(0, 0, 0);
    this.pos.set(this.dungeon.playerStart.x, 0, this.dungeon.playerStart.z);
    this.yaw = Math.atan2(-this.pos.x, -this.pos.z) + Math.PI;
    this.pitch = 0;
    this.state = "playing";
    this.paused = false;
    this.wavePendingT = -1;
    this.startNextWave();
    this.tryLock();
    this.onEvent({ type: "flash" });
    this.pushHud();
  }

  pauseGame(v: boolean) {
    if (this.state !== "playing" || this.dead) return;
    this.paused = v;
    if (v && this.locked) document.exitPointerLock();
    this.pushHud();
  }

  resume() {
    this.audio.ensure();
    this.paused = false;
    this.tryLock();
    this.pushHud();
  }

  toMenu() {
    this.clearWorld();
    this.state = "menu";
    this.paused = false;
    this.dead = false;
    this.timeScale = 1;
    if (this.locked) document.exitPointerLock();
    this.pushHud();
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    this.pushHud();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    window.removeEventListener("resize", this.onResize);
    this.canvas.removeEventListener("contextmenu", this.onCtx);
    this.renderer.dispose();
  }

  private clearWorld() {
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies = [];
    for (const p of this.pickups) this.scene.remove(p.group);
    this.pickups = [];
    for (const b of this.bolts) this.scene.remove(b.group);
    this.bolts = [];
    this.spawnQueue = [];
    this.scene.remove(this.enemyRoot);
    this.scene.add(this.enemyRoot);
  }

  /* ------------------------------ waves ------------------------------ */

  private startNextWave() {
    this.wave++;
    const w = this.wave;
    const goblins = Math.min(4 + w * 2, 16);
    const wraiths = w >= 3 ? Math.min(w - 1, 6) : 0;
    const brutes = w >= 2 ? Math.min(1 + Math.floor(w / 2), 5) : 0;
    const q: ("goblin" | "wraith" | "brute")[] = [];
    for (let i = 0; i < goblins; i++) q.push("goblin");
    for (let i = 0; i < wraiths; i++) q.push("wraith");
    for (let i = 0; i < brutes; i++) q.push("brute");
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    this.spawnQueue = q;
    this.spawnTimer = 0.6;
    this.audio.waveBell();
    this.onEvent({ type: "wave", wave: w, sub: pick(WAVE_SUBS) });
  }

  private spawnEnemy(type: "goblin" | "wraith" | "brute") {
    const spawns = this.dungeon.spawns;
    if (spawns.length === 0) return;
    let best = spawns[0];
    for (let k = 0; k < 12; k++) {
      const s = spawns[Math.floor(Math.random() * spawns.length)];
      if (Math.hypot(s.x - this.pos.x, s.z - this.pos.z) > 9) { best = s; break; }
      best = s;
    }
    const def = ENEMY_DEFS[type];
    const scaleHp = 1 + 0.09 * (this.wave - 1);
    const e = this.makeEnemy(type);
    e.hp = def.hp * scaleHp;
    e.pos.set(best.x + rnd(-0.6, 0.6), 0, best.z + rnd(-0.6, 0.6));
    e.group.position.copy(e.pos);
    e.spawnT = 0;
    this.enemyRoot.add(e.group);
    this.enemies.push(e);
    this.audio.spawnGrowl();
    this.burst(e.pos.x, 1, e.pos.z, 12, 4, 0.7);
  }

  /* ------------------------------ enemies ------------------------------ */

  private makeEnemy(type: "goblin" | "wraith" | "brute"): Enemy {
    const g = new THREE.Group();
    const mats: THREE.MeshLambertMaterial[] = [];
    const hitMeshes: THREE.Mesh[] = [];
    const eyes: THREE.Mesh[] = [];
    const mat = (c: number) => {
      const m = new THREE.MeshLambertMaterial({ color: c, emissive: 0xd8d2c2, emissiveIntensity: 0 });
      mats.push(m);
      return m;
    };
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf2ecd9 });
    const box = (w: number, h: number, d: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      hitMeshes.push(mesh);
      return mesh;
    };
    const limb = (w: number, h: number, d: number, m: THREE.Material, px: number, py: number, pz: number) => {
      const piv = new THREE.Group();
      piv.position.set(px, py, pz);
      const mesh = box(w, h, d, m);
      mesh.position.y = -h / 2;
      piv.add(mesh);
      g.add(piv);
      return piv;
    };

    let armL: THREE.Group | null = null, armR: THREE.Group | null = null;
    let legL: THREE.Group | null = null, legR: THREE.Group | null = null;

    const eye = (x: number, y: number, z: number, s = 0.06) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.7, 0.02), eyeMat);
      mesh.position.set(x, y, z);
      g.add(mesh);
      eyes.push(mesh);
    };

    if (type === "goblin") {
      const bodyM = mat(0x49483f);
      const body = box(0.5, 0.52, 0.36, bodyM);
      body.position.y = 0.62; body.rotation.x = 0.25;
      g.add(body);
      const head = box(0.4, 0.34, 0.38, mat(0x55544a));
      head.position.set(0, 1.02, 0.12);
      g.add(head);
      const jaw = box(0.28, 0.1, 0.2, mat(0x3c3b33));
      jaw.position.set(0, 0.86, 0.24);
      g.add(jaw);
      const earGeo = new THREE.ConeGeometry(0.05, 0.28, 4);
      const earM = mat(0x55544a);
      const earL = new THREE.Mesh(earGeo, earM); earL.position.set(-0.26, 1.1, 0.1); earL.rotation.z = 1.3;
      const earR = new THREE.Mesh(earGeo, earM); earR.position.set(0.26, 1.1, 0.1); earR.rotation.z = -1.3;
      g.add(earL, earR);
      eye(-0.09, 1.06, 0.32); eye(0.09, 1.06, 0.32);
      armL = limb(0.12, 0.46, 0.12, mat(0x49483f), -0.32, 0.85, 0.05);
      armR = limb(0.12, 0.46, 0.12, mat(0x49483f), 0.32, 0.85, 0.05);
      const shiv = box(0.035, 0.3, 0.02, new THREE.MeshLambertMaterial({ color: 0x8f8a7c }));
      shiv.position.y = -0.55;
      armR.add(shiv);
      legL = limb(0.14, 0.38, 0.14, mat(0x3c3b33), -0.13, 0.4, 0);
      legR = limb(0.14, 0.38, 0.14, mat(0x3c3b33), 0.13, 0.4, 0);
    } else if (type === "brute") {
      const bodyM = mat(0x3f3e38);
      const body = box(1.15, 1.0, 0.7, bodyM);
      body.position.y = 1.15;
      g.add(body);
      const belly = box(0.8, 0.6, 0.2, mat(0x57554a));
      belly.position.set(0, 1.0, 0.32);
      g.add(belly);
      const head = box(0.5, 0.44, 0.48, mat(0x4a4941));
      head.position.set(0, 1.95, 0.12);
      g.add(head);
      const jawB = box(0.4, 0.16, 0.3, mat(0x35342e));
      jawB.position.set(0, 1.68, 0.28);
      g.add(jawB);
      const toothGeo = new THREE.ConeGeometry(0.035, 0.12, 4);
      const toothM = new THREE.MeshLambertMaterial({ color: 0xb5af9d });
      for (let i = -1; i <= 1; i += 2) {
        const t = new THREE.Mesh(toothGeo, toothM);
        t.position.set(i * 0.12, 1.78, 0.4);
        t.rotation.x = Math.PI;
        g.add(t);
      }
      eye(-0.12, 2.0, 0.37, 0.08); eye(0.12, 2.0, 0.37, 0.08);
      const spikeGeo = new THREE.ConeGeometry(0.1, 0.42, 5);
      const spikeM = mat(0x57554a);
      for (let i = 0; i < 3; i++) {
        const sp = new THREE.Mesh(spikeGeo, spikeM);
        sp.position.set((i - 1) * 0.3, 1.72, -0.32);
        sp.rotation.x = -0.5;
        g.add(sp);
      }
      armL = limb(0.3, 1.05, 0.3, mat(0x45443c), -0.74, 1.6, 0);
      armR = limb(0.3, 1.05, 0.3, mat(0x45443c), 0.74, 1.6, 0);
      const fistL = box(0.36, 0.3, 0.36, mat(0x35342e)); fistL.position.y = -1.15; armL.add(fistL);
      const fistR = box(0.36, 0.3, 0.36, mat(0x35342e)); fistR.position.y = -1.15; armR.add(fistR);
      legL = limb(0.36, 0.68, 0.36, mat(0x35342e), -0.3, 0.68, 0);
      legR = limb(0.36, 0.68, 0.36, mat(0x35342e), 0.3, 0.68, 0);
    } else {
      const robeM = mat(0x26262b);
      const robe = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.25, 6), robeM);
      robe.position.y = 0.75;
      hitMeshes.push(robe);
      g.add(robe);
      const hood = box(0.38, 0.38, 0.42, mat(0x1e1e23));
      hood.position.set(0, 1.45, 0);
      g.add(hood);
      const voidFace = box(0.26, 0.24, 0.05, new THREE.MeshBasicMaterial({ color: 0x060606 }));
      voidFace.position.set(0, 1.44, 0.2);
      g.add(voidFace);
      eye(-0.07, 1.47, 0.235, 0.05); eye(0.07, 1.47, 0.235, 0.05);
      armL = limb(0.09, 0.55, 0.09, robeM, -0.34, 1.28, 0);
      armR = limb(0.09, 0.55, 0.09, robeM, 0.34, 1.28, 0);
    }

    // shadow blob
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(type === "brute" ? 0.85 : 0.5, 12),
      new THREE.MeshBasicMaterial({ color: 0x020202, transparent: true, opacity: 0.55, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    g.add(blob);

    return {
      id: this.enemyId++, type, group: g, mats, hitMeshes, armL, armR, legL, legR, eyes,
      def: ENEMY_DEFS[type], hp: ENEMY_DEFS[type].hp,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      flash: 0, spawnT: 1, attackCd: rnd(0.2, 0.8), windup: 0, leapCd: rnd(1, 2.5),
      animT: rnd(0, 10), facing: 0, dead: false,
    };
  }

  private damageEnemy(e: Enemy, dmg: number, kx = 0, kz = 0) {
    if (e.dead || e.spawnT < 1) return;
    e.hp -= dmg;
    e.flash = 1;
    e.vel.x += kx; e.vel.z += kz;
    this.audio.hitEnemy();
    this.onEvent({ type: "hit" });
    this.showDamage(e.pos.x, this.enemyTop(e) + 0.3, e.pos.z, `${Math.round(dmg)}`);
    this.burst(e.pos.x, this.enemyTop(e) * 0.6, e.pos.z, 6, 3.2, 0.5);
    if (e.hp <= 0) this.killEnemy(e);
  }

  private enemyTop(e: Enemy) {
    return e.type === "brute" ? 2.3 : e.type === "wraith" ? 1.7 : 1.25;
  }

  private killEnemy(e: Enemy) {
    e.dead = true;
    this.kills++;
    const gained = e.def.value + this.wave * 10;
    this.score += gained;
    this.addShake(e.type === "brute" ? 0.3 : 0.12);
    this.audio.killEnemy();
    this.onEvent({ type: "kill", text: pick(KILL_LINES[e.type]) });
    this.showDamage(e.pos.x, this.enemyTop(e) + 0.5, e.pos.z, `+${gained}`, true);
    const top = this.enemyTop(e);
    this.burstChunks(e.pos.x, top * 0.5, e.pos.z, e.type === "brute" ? 26 : 15, 5.5);
    this.burst(e.pos.x, top * 0.5, e.pos.z, 16, 6, 0.8);
    for (let k = 0; k < (e.type === "brute" ? 5 : 3); k++) this.spawnWisp(e.pos.x, top * 0.5, e.pos.z, 0xe9e2cd);
    this.killStopT = 0.05;
    // drops
    // grimoire raids: pity-weighted tome drops
    this.tomePity++;
    const tomeChance = Math.min(0.5, 0.07 + this.tomePity * 0.035);
    if (Math.random() < tomeChance) {
      this.tomePity = 0;
      const grimoires: SpellId[] = ["mortar", "chain", "lance"];
      this.dropPickup(e.pos.x, e.pos.z, "tome", pick(grimoires));
    } else {
      const roll = Math.random();
      if (roll < 0.16) this.dropPickup(e.pos.x, e.pos.z, "heart");
      else if (roll < 0.5) this.dropPickup(e.pos.x, e.pos.z, "soul");
    }
    this.enemyRoot.remove(e.group);
    e.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const mm = mesh.material;
        if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
        else mm.dispose();
      }
    });
  }

  /* ------------------------------ pickups ------------------------------ */

  private dropPickup(x: number, z: number, kind: "heart" | "soul" | "tome", spell?: SpellId) {
    const g = new THREE.Group();
    if (kind === "tome" && spell) {
      const sp = SPELLS[spell];
      const coverM = new THREE.MeshLambertMaterial({ color: 0x17171a, emissive: sp.color, emissiveIntensity: 0.25 });
      const pageM = new THREE.MeshLambertMaterial({ color: 0xcfc8b4 });
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.09), coverM);
      cover.position.y = 0.72;
      const pages = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.07), pageM);
      pages.position.set(0.015, 0.72, 0);
      const sigil = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.runeTex, color: sp.color, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false }));
      sigil.position.set(0, 0.72, 0.09);
      sigil.scale.set(0.24, 0.24, 1);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: sp.color, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8, depthWrite: false }));
      glow.position.y = 0.72;
      glow.scale.set(1.7, 1.7, 1);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.42, 3.4, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: sp.color, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      beam.position.y = 1.7;
      const base = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.42, 20),
        new THREE.MeshBasicMaterial({ color: sp.color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      base.rotation.x = -Math.PI / 2;
      base.position.y = 0.03;
      g.add(cover, pages, sigil, glow, beam, base);
      g.position.set(x, 0, z);
      this.scene.add(g);
      this.pickups.push({ group: g, kind, spell, pos: new THREE.Vector3(x, 0, z), life: 20, spin: rnd(0, 6) });
      return;
    }
    const m = new THREE.MeshBasicMaterial({ color: kind === "heart" ? 0xe9e2cd : 0xb9b2a0 });
    if (kind === "heart") {
      const b = (px: number, py: number, s: number) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), m);
        mesh.position.set(px * s, py * s + 0.5, 0);
        g.add(mesh);
      };
      b(-1, 1, 0.09); b(1, 1, 0.09);
      for (let i = -2; i <= 2; i++) b(i, 0, 0.09);
      for (let i = -1; i <= 1; i++) b(i, -1, 0.09);
      b(0, -2, 0.09);
    } else {
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), m);
      core.position.y = 0.55;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xd8d2bd, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.y = 0.55;
      glow.scale.set(0.7, 0.7, 1);
      g.add(core, glow);
    }
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.pickups.push({ group: g, kind, pos: new THREE.Vector3(x, 0, z), life: 16, spin: rnd(0, 6) });
  }

  private updatePickups(dt: number) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= dt;
      p.spin += dt * 3;
      const dx = this.pos.x - p.pos.x;
      const dz = this.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.4 && !this.dead) {
        p.pos.x += (dx / (d || 1)) * dt * 6;
        p.pos.z += (dz / (d || 1)) * dt * 6;
      }
      if (p.kind === "tome") {
        p.group.position.set(p.pos.x, Math.sin(p.spin * 1.6) * 0.08, p.pos.z);
        p.group.rotation.y = p.spin * 0.8;
      } else {
        p.group.position.set(p.pos.x, 0, p.pos.z);
        p.group.rotation.y = p.spin;
      }
      const blink = p.life < 3 ? (Math.floor(p.life * 6) % 2 === 0 ? 0.25 : 1) : 1;
      p.group.scale.setScalar(blink * (p.kind === "heart" ? 1 : 1 + Math.sin(p.spin * 2) * 0.08));
      if (d < 1.05 && !this.dead) {
        if (p.kind === "heart") {
          this.hp = Math.min(100, this.hp + 25);
          this.audio.pickupHeart();
          this.onEvent({ type: "heal" });
        } else if (p.kind === "tome" && p.spell) {
          const sp = SPELLS[p.spell];
          this.equipped = p.spell;
          this.spellCharges = sp.charges;
          this.score += 150;
          this.audio.tomePickup();
          this.onEvent({ type: "spell", text: `${sp.name} SEIZED ×${sp.charges}`, color: sp.css });
          this.showDamage(this.pos.x, 2.3, this.pos.z, sp.name, true);
          for (let k = 0; k < 7; k++) this.spawnWisp(p.pos.x, 0.6, p.pos.z, sp.color);
          this.burst(p.pos.x, 0.8, p.pos.z, 14, 4, 0.6, sp.rgb);
        } else {
          this.souls = Math.min(100, this.souls + 18);
          this.audio.pickupSoul();
        }
        this.scene.remove(p.group);
        this.pickups.splice(i, 1);
        continue;
      }
      if (p.life <= 0) {
        this.scene.remove(p.group);
        this.pickups.splice(i, 1);
      }
    }
  }

  /* ------------------------------ weapons ------------------------------ */

  private tryFire() {
    if (this.fireCd > 0 || this.reloading || this.dead) return;
    if (this.ammo <= 0) {
      this.audio.dryFire();
      this.onEvent({ type: "empty" });
      this.startReload();
      return;
    }
    this.ammo--;
    this.shotsFired++;
    this.fireCd = 0.3;
    this.recoil = 1;
    this.gunKick = 1;
    this.fovKick = Math.min(5, this.fovKick + 2.4);
    this.fireSign *= -1;
    this.rollKick += this.fireSign * 0.028;
    this.recoilPitch = Math.min(0.13, this.recoilPitch + 0.046);
    this.addShake(0.13);
    this.muzzleT = 0.06;
    this.chamber.rotation.y += Math.PI / 3;
    this.audio.shoot();

    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.x += rnd(-0.008, 0.008);
    dir.y += rnd(-0.008, 0.008);
    dir.normalize();

    const wallDist = this.collider.raycast(origin.x, origin.y, origin.z, dir, 60);
    const ray = new THREE.Raycaster(origin, dir, 0.1, wallDist + 0.5);
    let hitEnemy: Enemy | null = null;
    let hitDist = wallDist;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT < 1) continue;
      const hits = ray.intersectObjects(e.hitMeshes, false);
      if (hits.length > 0 && hits[0].distance < hitDist) {
        hitDist = hits[0].distance;
        hitEnemy = e;
      }
    }
    const end = origin.clone().addScaledVector(dir, hitDist);
    this.spawnTracer(end, hitDist);
    if (hitEnemy) {
      this.shotsHit++;
      this.damageEnemy(hitEnemy, 42, dir.x * 2.4, dir.z * 2.4);
    } else if (wallDist < 60) {
      this.burst(end.x, end.y, end.z, 9, 3.4, 0.4, COL_BONE);
      this.burstChunks(end.x, end.y, end.z, 4, 2.8);
      this.spawnScorch(end, dir);
    }

    // muzzle eruption in world space
    const mp = new THREE.Vector3();
    this.muzzleAnchor.getWorldPosition(mp);
    this.muzzleLight.position.copy(mp);
    this.muzzleLight.intensity = 70;
    this.burst(mp.x, mp.y, mp.z, 5, 2.2, 0.16, COL_EMBER);
    this.spawnSmoke(mp, dir, 2);

    if (this.ammo === 0) this.startReload();
  }

  private startReload() {
    if (this.reloading || this.ammo === 6 || this.dead) return;
    this.reloading = true;
    this.reloadT = 0;
    this.audio.reloadSpin();
  }

  /* ---------- hex slot: one slot, many grimoires ---------- */

  private castSpell() {
    if (this.boltCd > 0 || this.dead || this.reloading) return;
    const id = this.equipped;
    const sp = SPELLS[id];
    if (id === "chain" && !this.findChainFirst()) {
      // nothing to arc into — half-cock the hex
      this.boltCd = 0.12;
      this.audio.dryFire();
      return;
    }
    if (this.souls < sp.cost) { this.audio.dryFire(); return; }

    this.souls -= sp.cost;
    if (id !== "hellbolt") {
      this.spellCharges--;
      if (this.spellCharges <= 0) {
        this.equipped = "hellbolt";
        this.audio.spellSpent();
        this.onEvent({ type: "spell", text: "GRIMOIRE SPENT — HELLBOLT RESTORED", color: "#e8e2d2" });
      }
    }
    this.boltCd = sp.cd;
    this.castLunge = 1;
    this.boltLight.color.set(sp.color);

    const hand = new THREE.Vector3();
    this.spellOrb.getWorldPosition(hand);

    if (id === "chain") {
      this.castChain(sp);
      return;
    }

    if (id === "hellbolt") this.audio.cast();
    if (id === "mortar") this.audio.mortarFire();
    if (id === "lance") this.audio.lanceFire();

    const g = new THREE.Group();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const start = this.camera.position.clone().addScaledVector(dir, 0.6);
    start.y -= 0.12;
    let vel = dir.clone();
    let grav = 0;
    let life = 3;

    if (id === "hellbolt") {
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: C_SPELL_HOT }));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: sp.color, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(2.1, 2.1, 1);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.runeTex, color: sp.color, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.5, depthWrite: false }));
      halo.scale.set(1.1, 1.1, 1);
      g.add(core, glow, halo);
      const orbiters: THREE.Sprite[] = [];
      for (let oi = 0; oi < 3; oi++) {
        const rs = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.runeTex, color: sp.color, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.7, depthWrite: false }));
        rs.scale.set(0.3, 0.3, 1);
        g.add(rs);
        orbiters.push(rs);
      }
      g.userData.orbiters = orbiters;
      g.userData.angle = rnd(0, 6);
      vel.multiplyScalar(17);
    } else if (id === "mortar") {
      const skull = this.buildSkull(sp.color);
      g.add(skull);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: sp.color, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.55, depthWrite: false }));
      glow.scale.set(1.5, 1.5, 1);
      g.add(glow);
      vel = dir.clone().multiplyScalar(12.5);
      vel.y += 7.6;
      grav = 16;
      life = 4;
    } else if (id === "lance") {
      const needleM = new THREE.MeshBasicMaterial({ color: 0xffe9ea });
      const needle = new THREE.Mesh(new THREE.ConeGeometry(0.055, 1.0, 6), needleM);
      needle.rotation.x = Math.PI / 2;
      needle.position.z = 0.3;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.03, 1.6, 5), new THREE.MeshBasicMaterial({ color: sp.color }));
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = -0.6;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: sp.color, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(1.15, 1.15, 1);
      glow.position.z = 0.4;
      const streak = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: sp.color, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.5, depthWrite: false }));
      streak.scale.set(0.4, 0.4, 1);
      streak.position.z = -1.2;
      g.add(needle, shaft, glow, streak);
      vel.multiplyScalar(33);
      life = 1.15;
    }

    g.position.copy(start);
    this.scene.add(g);
    this.bolts.push({ group: g, pos: start.clone(), vel, life, alive: true, spell: id, grav, hitIds: new Set(), trail: 0 });

    // hex discharge at the casting hand
    this.spawnFlash(hand.x, hand.y, hand.z, id === "mortar" ? 2.4 : 1.6, sp.color, 0.22);
    this.burst(hand.x, hand.y, hand.z, 8, 2.5, 0.3, sp.rgb);
    if (id === "mortar") this.spawnSmoke(hand, dir, 3, sp.color);
  }

  private buildSkull(color: number): THREE.Group {
    const s = new THREE.Group();
    const boneM = new THREE.MeshLambertMaterial({ color: 0xd8d2c2, emissive: color, emissiveIntensity: 0.55 });
    const darkM = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.36), boneM);
    cranium.position.y = 0.05;
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.1), boneM);
    brow.position.set(0, 0.1, 0.17);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.26), boneM);
    jaw.position.set(0, -0.14, 0.03);
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.04), darkM);
    eyeL.position.set(-0.08, 0.06, 0.185);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.08;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.04), darkM);
    nose.position.set(0, -0.02, 0.185);
    const hornGeo = new THREE.ConeGeometry(0.045, 0.2, 5);
    const hornL = new THREE.Mesh(hornGeo, boneM);
    hornL.position.set(-0.16, 0.22, 0);
    hornL.rotation.z = 0.7;
    const hornR = new THREE.Mesh(hornGeo, boneM);
    hornR.position.set(0.16, 0.22, 0);
    hornR.rotation.z = -0.7;
    s.add(cranium, brow, jaw, eyeL, eyeR, nose, hornL, hornR);
    return s;
  }

  /* ---------- chain hex ---------- */

  private findChainFirst(): Enemy | null {
    const origin = this.camera.position;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    let best: Enemy | null = null;
    let bestScore = 1e9;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT < 1) continue;
      const c = new THREE.Vector3(e.pos.x, e.pos.y + this.enemyTop(e) * 0.5, e.pos.z);
      const to = c.clone().sub(origin);
      const dist = to.length();
      if (dist > 18) continue;
      const dot = to.normalize().dot(dir);
      if (dot < 0.45) continue;
      const score = dist * (1.25 - dot);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (!best) {
      for (const e of this.enemies) {
        if (e.dead || e.spawnT < 1) continue;
        const d = e.pos.distanceTo(origin);
        if (d < 11 && d < bestScore) { bestScore = d; best = e; }
      }
    }
    return best;
  }

  private castChain(sp: SpellDef) {
    this.audio.chainZap();
    const first = this.findChainFirst();
    if (!first) return;
    const alive = this.enemies.filter((e) => !e.dead && e.spawnT >= 1);
    const path: Enemy[] = [first];
    let cur = first;
    while (path.length < 4) {
      let next: Enemy | null = null;
      let bd = 6.5;
      for (const e of alive) {
        if (path.includes(e)) continue;
        const d = e.pos.distanceTo(cur.pos);
        if (d < bd) { bd = d; next = e; }
      }
      if (!next) break;
      path.push(next);
      cur = next;
    }
    const hand = new THREE.Vector3();
    this.spellOrb.getWorldPosition(hand);
    let from = hand;
    for (let i = 0; i < path.length; i++) {
      const e = path[i];
      const c = new THREE.Vector3(e.pos.x, e.pos.y + this.enemyTop(e) * 0.5, e.pos.z);
      this.spawnBeam(from, c, sp.color);
      this.spawnFlash(c.x, c.y, c.z, 1.25, sp.color, 0.16);
      this.burst(c.x, c.y, c.z, 6, 3.2, 0.35, sp.rgb);
      this.damageEnemy(e, 40 * Math.pow(0.85, i));
      from = c;
    }
    const fp = new THREE.Vector3(first.pos.x, first.pos.y + 1, first.pos.z);
    this.flashLight.position.copy(fp);
    this.flashLight.color.set(sp.color);
    this.flashLight.intensity = 55;
    this.flashLightT = 0.22;
    this.addShake(0.16);
  }

  private castNova() {
    if (this.novaCd > 0 || this.dead) return;
    if (this.souls < 55) { this.audio.dryFire(); return; }
    this.souls -= 55;
    this.novaCd = 4.5;
    this.novaLunge = 1;
    this.audio.nova();
    this.spawnRing(this.pos.x, 0.1, this.pos.z, 7.2, 0.5);
    this.spawnRing(this.pos.x, 0.14, this.pos.z, 4.8, 0.78);
    this.spawnFlash(this.pos.x, 0.6, this.pos.z, 7.5, C_SPELL, 0.45);
    this.spawnFlash(this.pos.x, 1.1, this.pos.z, 3, C_SPELL_HOT, 0.2);
    this.flashLight.position.set(this.pos.x, 1.4, this.pos.z);
    this.flashLight.color.set(C_SPELL);
    this.flashLight.intensity = 120;
    this.flashLightT = 0.35;
    this.burstChunks(this.pos.x, 0.8, this.pos.z, 26, 8);
    this.burst(this.pos.x, 1, this.pos.z, 24, 9, 1, COL_HEX);
    this.burst(this.pos.x, 0.5, this.pos.z, 14, 6, 0.6, COL_BONE);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      this.spawnWisp(this.pos.x + Math.cos(a) * rnd(0.6, 2.2), 0.3, this.pos.z + Math.sin(a) * rnd(0.6, 2.2), C_SPELL);
    }
    this.addShake(0.7);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - this.pos.x;
      const dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 7) {
        const fall = 1 - (d / 7) * 0.45;
        this.damageEnemy(e, 72 * fall, (dx / (d || 1)) * 9, (dz / (d || 1)) * 9);
      }
    }
  }

  private explodeBolt(b: Bolt) {
    b.alive = false;
    this.scene.remove(b.group);
    const sp = SPELLS[b.spell];

    // the lance just dies where it sticks
    if (b.spell === "lance") {
      this.spawnFlash(b.pos.x, b.pos.y, b.pos.z, 1.2, sp.color, 0.2);
      this.burst(b.pos.x, b.pos.y, b.pos.z, 10, 4, 0.45, sp.rgb);
      this.audio.hitEnemy();
      return;
    }

    const big = b.spell === "mortar";
    const radius = big ? 4.8 : 3.6;
    const dmg = big ? 74 : 58;
    this.audio.explosion();
    if (big) this.audio.mortarBoom();
    this.spawnRing(b.pos.x, 0.1, b.pos.z, big ? 5.8 : 4.4, big ? 0.55 : 0.4, sp.color);
    this.spawnRing(b.pos.x, 0.14, b.pos.z, big ? 3.4 : 2.6, big ? 0.75 : 0.62, sp.color);
    this.spawnFlash(b.pos.x, b.pos.y, b.pos.z, big ? 7 : 5, sp.color, big ? 0.4 : 0.34);
    this.spawnFlash(b.pos.x, b.pos.y, b.pos.z, big ? 3.2 : 2.2, 0xffffff, 0.16);
    this.flashLight.position.set(b.pos.x, 1.0, b.pos.z);
    this.flashLight.color.set(sp.color);
    this.flashLight.intensity = big ? 130 : 95;
    this.flashLightT = big ? 0.4 : 0.3;
    this.addShake(big ? 0.55 : 0.35);
    this.burstChunks(b.pos.x, Math.max(0.3, b.pos.y), b.pos.z, big ? 26 : 20, big ? 8 : 6.5);
    this.burst(b.pos.x, b.pos.y, b.pos.z, big ? 26 : 18, big ? 9 : 8, 0.9, sp.rgb);
    this.burst(b.pos.x, b.pos.y, b.pos.z, 10, 4, 0.5, COL_BONE);
    if (big) {
      const back = new THREE.Vector3(0, 1, 0);
      this.spawnSmoke(b.pos, back, 6, sp.color);
    }
    for (let k = 0; k < (big ? 8 : 5); k++) this.spawnWisp(b.pos.x, b.pos.y, b.pos.z, sp.color);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - b.pos.x;
      const dy = this.enemyTop(e) * 0.5 - b.pos.y;
      const dz = e.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz, dy * 0.5);
      if (d < radius) {
        const fall = 1 - (d / radius) * 0.5;
        const hd = Math.hypot(dx, dz) || 1;
        this.damageEnemy(e, dmg * fall, (dx / hd) * 5, (dz / hd) * 5);
      }
    }
  }

  private spawnRing(x: number, y: number, z: number, maxR: number, maxT: number, color = C_SPELL) {
    const r = this.rings.find((q) => !q.alive) ?? this.rings[0];
    r.alive = true;
    r.t = 0;
    r.maxR = maxR;
    r.maxT = maxT;
    (r.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    r.mesh.position.set(x, y, z);
    r.mesh.visible = true;
  }

  /* ---------- chain-hex lightning ---------- */

  private spawnBeam(a: THREE.Vector3, b: THREE.Vector3, color: number) {
    const beam = this.beamPool.find((q) => q.life <= 0) ?? this.beamPool[0];
    const SEG = 11;
    const pos = beam.geo.attributes.position as THREE.BufferAttribute;
    const d = b.clone().sub(a);
    const len = d.length();
    d.normalize();
    let perp = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0));
    if (perp.lengthSq() < 0.01) perp.set(1, 0, 0);
    perp.normalize();
    const perp2 = new THREE.Vector3().crossVectors(d, perp).normalize();
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      const p = a.clone().addScaledVector(b.clone().sub(a), t);
      if (k > 0 && k < SEG) {
        const jag = len * 0.055 * Math.sin(t * Math.PI);
        p.addScaledVector(perp, rnd(-jag, jag));
        p.addScaledVector(perp2, rnd(-jag, jag));
      }
      pos.setXYZ(k, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
    beam.mat.color.set(color);
    beam.mat.opacity = 1;
    beam.life = 0.17;
    beam.line.visible = true;
    // a second, fatter ghost pass for glow weight
    const ghost = this.beamPool.find((q) => q.life <= 0 && q !== beam) ?? this.beamPool[1];
    if (ghost && ghost !== beam) {
      (ghost.geo.attributes.position as THREE.BufferAttribute).copy(pos);
      (ghost.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      ghost.mat.color.set(0xffffff);
      ghost.mat.opacity = 0.85;
      ghost.life = 0.1;
      ghost.line.visible = true;
    }
  }

  private spawnTracer(end: THREE.Vector3, dist: number) {
    const t = this.tracerPool.find((q) => q.life <= 0) ?? this.tracerPool[0];
    const from = new THREE.Vector3();
    this.muzzleAnchor.getWorldPosition(from);
    const mid = from.clone().add(end).multiplyScalar(0.5);
    t.mesh.position.copy(mid);
    t.mesh.scale.set(1, 1, Math.max(0.1, dist));
    t.mesh.lookAt(end);
    t.mesh.visible = true;
    t.life = 0.07;
  }

  /* ------------------------------ fx ------------------------------ */

  private shake = 0;
  private addShake(v: number) { this.shake = Math.min(1.2, this.shake + v); }

  private sparkCursor = 0;
  private burst(x: number, y: number, z: number, n: number, speed: number, life: number, col: [number, number, number] = COL_BONE) {
    for (let k = 0; k < n; k++) {
      const i = this.sparkCursor = (this.sparkCursor + 1) % this.SPARK_N;
      this.sparkPos[i * 3] = x + rnd(-0.1, 0.1);
      this.sparkPos[i * 3 + 1] = y + rnd(-0.1, 0.1);
      this.sparkPos[i * 3 + 2] = z + rnd(-0.1, 0.1);
      const th = rnd(0, Math.PI * 2);
      const ph = rnd(-1, 1);
      const sp = rnd(0.3, 1) * speed;
      this.sparkVel[i * 3] = Math.cos(th) * sp;
      this.sparkVel[i * 3 + 1] = ph * sp * 0.8 + speed * 0.25;
      this.sparkVel[i * 3 + 2] = Math.sin(th) * sp;
      this.sparkLife[i] = life * rnd(0.5, 1);
      const v = rnd(0.55, 1);
      this.sparkCol[i * 3] = col[0] * v; this.sparkCol[i * 3 + 1] = col[1] * v; this.sparkCol[i * 3 + 2] = col[2] * v;
    }
  }

  private spawnSmoke(at: THREE.Vector3, dir: THREE.Vector3, n: number, tint = 0xd8d2bd) {
    for (let k = 0; k < n; k++) {
      const p = this.smokePool.find((q) => !q.alive) ?? this.smokePool[0];
      p.alive = true;
      p.pos.copy(at).addScaledVector(dir, 0.08);
      p.vel.set(dir.x * 0.5 + rnd(-0.15, 0.15), 0.42 + rnd(0, 0.25), dir.z * 0.5 + rnd(-0.15, 0.15));
      p.maxLife = rnd(0.8, 1.4);
      p.life = p.maxLife;
      p.grow = rnd(0.55, 0.85);
      (p.sprite.material as THREE.SpriteMaterial).color.set(tint);
      p.sprite.visible = true;
      p.sprite.position.copy(p.pos);
      p.sprite.scale.set(0.16, 0.16, 1);
    }
  }

  private spawnScorch(at: THREE.Vector3, dir: THREE.Vector3) {
    const s = this.scorchPool.find((q) => !q.alive) ?? this.scorchPool[0];
    s.alive = true;
    s.life = 9;
    s.sprite.position.copy(at).addScaledVector(dir, -0.03);
    s.sprite.scale.setScalar(rnd(0.32, 0.5));
    s.sprite.visible = true;
    (s.sprite.material as THREE.SpriteMaterial).opacity = 0.85;
    (s.sprite.material as THREE.SpriteMaterial).rotation = rnd(0, Math.PI * 2);
  }

  private spawnWisp(x: number, y: number, z: number, color: number) {
    const w = this.wispPool.find((q) => !q.alive) ?? this.wispPool[0];
    w.alive = true;
    w.pos.set(x + rnd(-0.25, 0.25), y, z + rnd(-0.25, 0.25));
    w.maxLife = rnd(0.7, 1.3);
    w.life = w.maxLife;
    w.seed = rnd(0, 10);
    w.sprite.visible = true;
    w.sprite.position.copy(w.pos);
    (w.sprite.material as THREE.SpriteMaterial).color.set(color);
  }

  private spawnFlash(x: number, y: number, z: number, maxScale: number, color: number, maxLife = 0.3) {
    const f = this.flashSprPool.find((q) => !q.alive) ?? this.flashSprPool[0];
    f.alive = true;
    f.maxScale = maxScale;
    f.maxLife = maxLife;
    f.life = maxLife;
    f.sprite.position.set(x, y, z);
    (f.sprite.material as THREE.SpriteMaterial).color.set(color);
    f.sprite.visible = true;
  }

  private dumpCasings() {
    const from = new THREE.Vector3();
    this.chamber.getWorldPosition(from);
    let dumped = 0;
    for (const c of this.casingPool) {
      if (c.alive || dumped >= 6) continue;
      c.alive = true;
      dumped++;
      c.pos.copy(from).add(new THREE.Vector3(rnd(-0.05, 0.05), rnd(-0.02, 0.02), rnd(-0.05, 0.05)));
      c.vel.set(rnd(-1.6, 1.6), rnd(2.2, 3.6), rnd(-1.6, 1.6));
      c.spin.set(rnd(-14, 14), rnd(-14, 14), rnd(-14, 14));
      c.life = 1.4;
      c.mesh.visible = true;
      c.mesh.position.copy(c.pos);
    }
  }

  private burstChunks(x: number, y: number, z: number, n: number, speed: number) {
    let spawned = 0;
    for (let i = 0; i < this.CHUNK_N && spawned < n; i++) {
      const c = this.chunks[i];
      if (c.alive) continue;
      c.alive = true;
      spawned++;
      c.pos.set(x + rnd(-0.2, 0.2), y + rnd(-0.2, 0.2), z + rnd(-0.2, 0.2));
      const th = rnd(0, Math.PI * 2);
      const sp = rnd(0.3, 1) * speed;
      c.vel.set(Math.cos(th) * sp, rnd(0.3, 1) * speed * 0.9, Math.sin(th) * sp);
      c.rot.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
      c.spin.set(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8));
      c.maxLife = rnd(0.5, 0.9);
      c.life = c.maxLife;
      c.scale = rnd(0.05, 0.14);
    }
  }

  private showDamage(x: number, y: number, z: number, text: string, big = false) {
    const d = this.dmgPool.find((q) => q.life <= 0) ?? this.dmgPool[0];
    const ctx = d.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 128, 48);
    ctx.font = `bold ${big ? 30 : 26}px "Special Elite", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(5,5,5,0.9)";
    ctx.strokeText(text, 64, 24);
    ctx.fillStyle = big ? "#f2ecd9" : "#d8d2bd";
    ctx.fillText(text, 64, 24);
    d.tex.needsUpdate = true;
    d.sprite.position.set(x + rnd(-0.3, 0.3), y, z + rnd(-0.2, 0.2));
    d.sprite.scale.set(big ? 1.6 : 1.05, big ? 0.6 : 0.4, 1);
    d.sprite.visible = true;
    (d.sprite.material as THREE.SpriteMaterial).opacity = 1;
    d.vel.set(rnd(-0.4, 0.4), 1.6, 0);
    d.life = 0.75;
  }

  /* ------------------------------ player damage ------------------------------ */

  private damagePlayer(dmg: number) {
    if (this.invuln > 0 || this.dead || this.paused || this.state !== "playing") return;
    this.hp -= dmg;
    this.invuln = 0.55;
    this.addShake(0.55);
    this.audio.hurt();
    this.onEvent({ type: "damage" });
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  private die() {
    this.dead = true;
    this.deathT = 0;
    this.audio.playerDeath();
    if (this.locked) document.exitPointerLock();
  }

  /* ------------------------------ main tick ------------------------------ */

  private tick(dtRaw: number) {
    this.clockT += dtRaw;
    this.killStopT = Math.max(0, this.killStopT - dtRaw);
    const killSlow = this.killStopT > 0 ? 0.15 : 1;
    const slow = (this.dead ? Math.max(0.25, 1 - this.deathT * 1.4) : 1) * killSlow;
    this.timeScale = slow;
    const dt = this.paused ? 0 : dtRaw * this.timeScale;

    if (this.state === "menu") {
      this.menuT += dtRaw;
      const r = 11.5;
      this.camera.position.set(Math.sin(this.menuT * 0.08) * r, 3.3 + Math.sin(this.menuT * 0.17) * 0.5, Math.cos(this.menuT * 0.08) * r);
      this.camera.rotation.set(0, 0, 0);
      this.camera.lookAt(0, 1.5, 0);
    }

    if (dt > 0 && this.state === "playing") {
      this.updatePlayer(dt);
      this.updateEnemies(dt);
      this.updateBolts(dt);
      this.updatePickups(dt);
      this.updateWaves(dt);
    }

    if (this.dead && this.state === "playing") {
      this.deathT += dtRaw;
      this.pitch = Math.max(-1.2, this.pitch - dtRaw * 1.1);
      if (this.deathT > 1.25 && this.deathT - dtRaw <= 1.25) {
        this.state = "dead";
        const acc = this.shotsFired > 0 ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0;
        this.onEvent({ type: "dead", stats: { score: this.score, kills: this.kills, wave: this.wave, accuracy: acc } });
        this.pushHud();
      }
    }

    this.updateFx(dtRaw);
    this.updateViewmodel(dtRaw);
    this.updateCamera(dtRaw);
    this.updateHud(dtRaw);

    this.renderer.render(this.scene, this.camera);
  }

  private updatePlayer(dt: number) {
    if (this.dead) return;
    const run = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speed = run ? 8.6 : 5.4;
    let ix = 0, iz = 0;
    if (this.keys.has("KeyW")) iz -= 1;
    if (this.keys.has("KeyS")) iz += 1;
    if (this.keys.has("KeyA")) ix -= 1;
    if (this.keys.has("KeyD")) ix += 1;
    const len = Math.hypot(ix, iz);
    if (len > 0) { ix /= len; iz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = ix * cos - iz * sin;
    const wz = ix * sin + iz * cos;
    // note: camera looks down -Z at yaw 0; forward vector = (-sin, -cos)
    const fx = -sin, fz = -cos;
    const rx = cos, rz = -sin;
    const tx = (fx * -iz + rx * ix) * speed;
    const tz = (fz * -iz + rz * ix) * speed;
    void wx; void wz;
    const accel = this.grounded ? 14 : 5;
    this.vel.x += (tx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (tz - this.vel.z) * Math.min(1, accel * dt);

    if (this.keys.has("Space") && this.grounded) {
      this.vy = 7.4;
      this.grounded = false;
    }
    this.vy -= 22 * dt;
    let py = this.pos.y + this.vy * dt;
    if (py <= 0) { py = 0; this.vy = 0; this.grounded = true; }

    const res = this.collider.resolve(this.pos.x + this.vel.x * dt, this.pos.z + this.vel.z * dt, 0.48);
    this.pos.x = res.x;
    this.pos.z = res.z;
    this.pos.y = py;

    // footsteps
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && hSpeed > 1.5) {
      this.bobT += dt * hSpeed * 1.55;
      this.stepAcc += dt * hSpeed;
      if (this.stepAcc > 4.6) {
        this.stepAcc = 0;
        this.stepAlt = !this.stepAlt;
        this.audio.step(this.stepAlt);
      }
    }

    // regen souls
    this.souls = Math.min(100, this.souls + 6.5 * dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.boltCd = Math.max(0, this.boltCd - dt);
    this.novaCd = Math.max(0, this.novaCd - dt);

    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT > 0.55 && this.reloadT - dt <= 0.55) this.audio.reloadSnap();
      if (this.reloadT >= 1.15) {
        this.reloading = false;
        this.ammo = 6;
        this.audio.reloadSnap();
        this.dumpCasings();
        this.audio.casings();
      }
    }
  }
  private stepAcc = 0;
  private stepAlt = false;

  private updateCamera(dt: number) {
    if (this.state === "menu") {
      this.shake = 0;
      if (Math.abs(this.camera.fov - this.fovBase) > 0.1) {
        this.camera.fov = this.fovBase;
        this.camera.updateProjectionMatrix();
      }
      return;
    }
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const bobAmp = this.grounded ? Math.min(1, hSpeed / 5) : 0;
    const deathDip = this.dead ? Math.min(1, this.deathT / 1.1) : 0;
    const eyeY = (1.62 + this.pos.y + Math.sin(this.bobT * 1.9) * 0.055 * bobAmp) * (1 - deathDip * 0.58);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const sh = this.shake * this.shake;
    this.camera.position.set(
      this.pos.x + rnd(-1, 1) * 0.05 * sh,
      eyeY + rnd(-1, 1) * 0.05 * sh,
      this.pos.z + rnd(-1, 1) * 0.05 * sh
    );
    this.recoilPitch = Math.max(0, this.recoilPitch - dt * 0.55);
    const deathRoll = this.dead ? Math.min(1.15, this.deathT * 0.75) : 0;
    // heavy-cannon lens punch; sprint stretches the lens
    this.fovKick = Math.max(0, this.fovKick - dt * 13);
    this.rollKick *= Math.exp(-dt * 7);
    const sprinting = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && hSpeed > 4 && this.grounded && !this.dead;
    const targetFov = (sprinting ? 81 : this.fovBase) + this.fovKick;
    if (Math.abs(this.camera.fov - targetFov) > 0.04) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 11);
      this.camera.updateProjectionMatrix();
    }
    this.camera.rotation.set(
      this.pitch + this.recoilPitch + Math.sin(this.bobT * 1.9) * 0.008 * bobAmp,
      this.yaw,
      Math.sin(this.bobT * 0.95) * 0.012 * bobAmp + rnd(-1, 1) * 0.02 * sh + this.rollKick + deathRoll
    );
  }

  /* ------------------------------ viewmodel tick ------------------------------ */

  private updateViewmodel(dt: number) {
    const t = this.clockT;
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const bobAmp = Math.min(1, hSpeed / 5);
    const swayX = Math.sin(this.bobT * 0.95) * 0.02 * bobAmp;
    const swayY = Math.abs(Math.sin(this.bobT * 1.9)) * -0.026 * bobAmp;

    // the cannon is heavy — its sway lags the body
    const lagK = 1 - Math.exp(-dt * 6.5);
    this.vmLag.x += (swayX - this.vmLag.x) * lagK;
    this.vmLag.y += (swayY - this.vmLag.y) * lagK;
    this.vm.position.set(this.vmLag.x, this.vmLag.y, 0);
    this.vm.rotation.z = this.vmLag.x * 0.6;
    this.vm.visible = this.state === "playing";

    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.gunKick = Math.max(0, this.gunKick - dt * 5.5);
    this.castLunge = Math.max(0, this.castLunge - dt * 4.5);
    this.novaLunge = Math.max(0, this.novaLunge - dt * 3.5);

    const kick = this.gunKick * this.gunKick;
    this.gunGroup.position.set(
      0.36 + this.vmLag.x * 0.4,
      -0.33 + this.vmLag.y + kick * 0.035,
      -0.6 + kick * 0.14
    );
    this.gunGroup.rotation.set(this.recoil * 0.3 + kick * 0.22, this.vmLag.x * 0.8, kick * 0.06 * this.fireSign);
    if (this.reloading) {
      const ph = this.reloadT / 1.15;
      const tilt = Math.sin(Math.min(1, ph * 1.3) * Math.PI) * 0.9;
      this.gunGroup.rotation.x -= tilt;
      this.gunGroup.position.y -= tilt * 0.14;
      this.chamber.rotation.y += dt * 14;
    }

    this.muzzleT = Math.max(0, this.muzzleT - dt);
    this.muzzleFlash.visible = this.muzzleT > 0;
    if (this.muzzleT > 0) {
      this.muzzleFlash.rotation.z = rnd(0, 6);
      const s = 0.8 + rnd(0, 0.55);
      this.muzzleFlash.scale.set(s, s, s);
    }
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 600);

    // spell orb life
    const pulse = 0.85 + Math.sin(t * 3.2) * 0.15;
    const soulGlow = 0.4 + (this.souls / 100) * 0.6;
    this.spellOrb.scale.setScalar(pulse * (1 + this.castLunge * 0.5));
    this.spellOrb.rotation.y += dt * 2.2;
    this.spellOrb.rotation.x += dt * 1.4;
    ((this.spellOrb.children[1] as THREE.Sprite).material as THREE.SpriteMaterial).opacity = soulGlow;
    this.spellGroup.position.set(
      -0.33 + swayX * 0.5,
      -0.3 + swayY - this.novaLunge * 0.1,
      -0.52 + this.castLunge * 0.18
    );
    this.spellGroup.rotation.x = -this.castLunge * 0.5 - this.novaLunge * 0.35;
  }

  /* ------------------------------ enemies tick ------------------------------ */

  private updateEnemies(dt: number) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) { this.enemies.splice(i, 1); continue; }

      if (e.spawnT < 1) {
        e.spawnT = Math.min(1, e.spawnT + dt * 2.2);
        e.group.scale.setScalar(Math.max(0.01, e.spawnT));
        e.group.position.copy(e.pos);
        continue;
      }

      const dx = this.pos.x - e.pos.x;
      const dz = this.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const nx = dx / dist, nz = dz / dist;
      e.facing = Math.atan2(dx, dz);
      e.group.rotation.y = e.facing;

      e.attackCd -= dt;
      e.leapCd -= dt;
      e.windup = Math.max(0, e.windup - dt);
      e.flash = Math.max(0, e.flash - dt * 4.5);
      e.animT += dt * (e.type === "wraith" ? 4 : 6);

      // movement
      let mx = 0, mz = 0;
      if (!this.dead) {
        if (dist > e.def.range * 0.85) { mx = nx; mz = nz; }
        if (e.type === "wraith") {
          const strafe = Math.sin(e.animT * 1.3) * 0.85;
          mx += -nz * strafe; mz += nx * strafe;
        }
      }
      // separation
      for (const o of this.enemies) {
        if (o === e || o.dead) continue;
        const sx = e.pos.x - o.pos.x;
        const sz = e.pos.z - o.pos.z;
        const sd = Math.hypot(sx, sz);
        const min = e.def.radius + o.def.radius + 0.25;
        if (sd > 0.01 && sd < min) { mx += (sx / sd) * 0.9; mz += (sz / sd) * 0.9; }
      }
      const ml = Math.hypot(mx, mz);
      if (ml > 1) { mx /= ml; mz /= ml; }

      const spd = e.def.speed * (e.windup > 0 ? 0.25 : 1);
      const kx = e.vel.x * Math.max(0, 1 - dt * 8);
      const kz = e.vel.z * Math.max(0, 1 - dt * 8);
      e.vel.x = kx; e.vel.z = kz;

      let ex = e.pos.x + (mx * spd + e.vel.x) * dt;
      let ez = e.pos.z + (mz * spd + e.vel.z) * dt;
      const res = this.collider.resolve(ex, ez, e.def.radius);
      e.pos.x = res.x; e.pos.z = res.z;

      // vertical / float
      if (e.type === "wraith") {
        e.group.position.set(e.pos.x, 0.35 + Math.sin(e.animT * 1.4) * 0.18, e.pos.z);
        e.group.rotation.z = Math.sin(e.animT) * 0.12;
      } else {
        // gravity for leaps
        e.pos.y = Math.max(0, (e.pos.y || 0) + (e.vel.y || 0) * dt);
        if (e.pos.y > 0 || (e.vel.y || 0) !== 0) {
          e.vel.y = (e.vel.y || 0) - 20 * dt;
          if (e.pos.y <= 0) { e.pos.y = 0; e.vel.y = 0; }
        }
        const hop = Math.abs(Math.sin(e.animT * 2)) * 0.07 * Math.min(1, ml);
        e.group.position.set(e.pos.x, e.pos.y + hop, e.pos.z);
        e.group.rotation.z = 0;
      }

      // limb animation
      const swing = Math.sin(e.animT * 2) * 0.55 * Math.min(1, ml + 0.2);
      if (e.legL) e.legL.rotation.x = swing;
      if (e.legR) e.legR.rotation.x = -swing;
      const windPose = e.windup > 0 ? -1.9 * (e.windup / 0.3) : 0;
      if (e.armL) e.armL.rotation.x = -swing * 0.7 + windPose * 0.6;
      if (e.armR) e.armR.rotation.x = swing * 0.7 + windPose;

      // attack
      if (!this.dead && dist < e.def.range && e.attackCd <= 0 && e.windup <= 0) {
        e.windup = 0.3;
        e.attackCd = e.def.rate;
        // schedule hit check
        const dmg = e.def.dmg * (1 + 0.05 * (this.wave - 1));
        window.setTimeout(() => {
          if (e.dead || this.dead || this.paused) return;
          const d2 = Math.hypot(this.pos.x - e.pos.x, this.pos.z - e.pos.z);
          if (d2 < e.def.range + 0.75) this.damagePlayer(dmg);
        }, 300);
      }

      // goblin leap
      if (e.type === "goblin" && !this.dead && e.leapCd <= 0 && dist > 2.6 && dist < 7 && e.pos.y === 0) {
        e.vel.x = nx * 7;
        e.vel.z = nz * 7;
        e.vel.y = 5.2;
        e.leapCd = rnd(2.4, 3.6);
        e.pos.y = 0.01;
      }

      // hit flash + eye glow
      const em = e.flash * 1.4;
      for (const m of e.mats) m.emissiveIntensity = em;
      const eyeGlow = e.windup > 0 ? 2.2 : 1;
      for (const eye of e.eyes) (eye.material as THREE.MeshBasicMaterial).color.setScalar(Math.min(1, 0.85 * eyeGlow));
    }
  }

  /* ------------------------------ bolts tick ------------------------------ */

  private updateBolts(dt: number) {
    let lightSet = false;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      if (!b.alive) { this.bolts.splice(i, 1); continue; }
      const sp = SPELLS[b.spell];
      b.life -= dt;
      if (b.grav > 0) b.vel.y -= b.grav * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.group.position.copy(b.pos);

      if (b.spell === "hellbolt") {
        b.group.rotation.y += dt * 9;
        b.group.rotation.x += dt * 6;
        const orbiters = b.group.userData.orbiters as THREE.Sprite[] | undefined;
        if (orbiters) {
          b.group.userData.angle = ((b.group.userData.angle as number) ?? 0) + dt * 10;
          const a = b.group.userData.angle as number;
          for (let oi = 0; oi < orbiters.length; oi++) {
            const oa = a + (oi * Math.PI * 2) / orbiters.length;
            orbiters[oi].position.set(Math.cos(oa) * 0.4, Math.sin(oa * 1.7) * 0.15, Math.sin(oa) * 0.4);
            (orbiters[oi].material as THREE.SpriteMaterial).opacity = 0.45 + 0.3 * Math.sin(oa * 2);
          }
        }
        this.burst(b.pos.x, b.pos.y, b.pos.z, 2, 0.8, 0.28, sp.rgb);
      } else if (b.spell === "mortar") {
        b.group.rotation.x += dt * 7.5;
        b.group.rotation.z += dt * 5.5;
        b.trail += dt;
        if (b.trail > 0.024) {
          b.trail = 0;
          const back = b.vel.clone().normalize().multiplyScalar(-1);
          this.spawnSmoke(b.pos, back, 1, sp.color);
          this.burst(b.pos.x, b.pos.y, b.pos.z, 1, 1.2, 0.3, sp.rgb);
        }
      } else if (b.spell === "lance") {
        const ahead = b.pos.clone().add(b.vel);
        b.group.lookAt(ahead);
        this.burst(b.pos.x, b.pos.y, b.pos.z, 1, 0.6, 0.22, sp.rgb);
      }

      if (!lightSet) {
        this.boltLight.position.copy(b.pos);
        this.boltLight.intensity = b.spell === "mortar" ? 20 : 16;
        lightSet = true;
      }

      let boom = b.life <= 0 || this.collider.solidAt(b.pos.x, b.pos.z) || b.pos.y > WALL_H + 1;
      if (!boom && b.pos.y < (b.spell === "mortar" ? 0.18 : 0.05)) boom = true;

      if (b.spell === "lance") {
        // pierce: wound everything on the line, keep flying
        if (!boom) {
          for (const e of this.enemies) {
            if (e.dead || e.spawnT < 1 || b.hitIds.has(e.id)) continue;
            const d = Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z);
            const dy = Math.abs(this.enemyTop(e) * 0.5 - b.pos.y);
            if (d < e.def.radius + 0.5 && dy < this.enemyTop(e) * 0.75) {
              b.hitIds.add(e.id);
              const hd = d || 1;
              this.damageEnemy(e, 52, ((e.pos.x - b.pos.x) / hd) * 2.2, ((e.pos.z - b.pos.z) / hd) * 2.2);
              this.spawnFlash(b.pos.x, b.pos.y, b.pos.z, 1.0, sp.color, 0.15);
              this.burst(b.pos.x, b.pos.y, b.pos.z, 7, 4, 0.4, sp.rgb);
            }
          }
        }
        if (boom) {
          this.explodeBolt(b);
          this.bolts.splice(i, 1);
        }
        continue;
      }

      if (!boom) {
        for (const e of this.enemies) {
          if (e.dead || e.spawnT < 1) continue;
          const d = Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z);
          const dy = Math.abs(this.enemyTop(e) * 0.5 - b.pos.y);
          if (d < e.def.radius + 0.55 && dy < this.enemyTop(e) * 0.7) { boom = true; break; }
        }
      }
      if (boom) {
        this.explodeBolt(b);
        this.bolts.splice(i, 1);
      }
    }
    if (!lightSet) this.boltLight.intensity = Math.max(0, this.boltLight.intensity - dt * 60);
  }

  /* ------------------------------ waves tick ------------------------------ */

  private updateWaves(dt: number) {
    if (this.wavePendingT >= 0) {
      this.wavePendingT -= dt;
      if (this.wavePendingT <= 0) {
        this.wavePendingT = -1;
        this.startNextWave();
      }
      return;
    }
    const alive = this.enemies.filter((e) => !e.dead).length;
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && alive < 11) {
        const type = this.spawnQueue.shift()!;
        this.spawnEnemy(type);
        this.spawnTimer = Math.max(0.55, 1.25 - this.wave * 0.05);
      }
    } else if (alive === 0 && !this.dead) {
      // wave cleared
      const bonus = 250 * this.wave;
      this.score += bonus;
      this.hp = Math.min(100, this.hp + 12);
      this.souls = Math.min(100, this.souls + 25);
      this.showDamage(this.pos.x, 2.4, this.pos.z, `CLEAR +${bonus}`, true);
      this.wavePendingT = 2.4;
    }
  }

  /* ------------------------------ fx tick ------------------------------ */

  private updateFx(dt: number) {
    const t = this.clockT;
    // torch flicker
    for (let i = 0; i < this.torchLights.length; i++) {
      const s = this.torchSeeds[i];
      const f = 0.78 + 0.22 * Math.sin(t * 11 + s) * Math.sin(t * 5.3 + s * 2) + 0.05 * Math.sin(t * 23 + s);
      this.torchLights[i].intensity = (i < this.dungeon.torches.length ? 26 : 30) * Math.max(0.45, f);
    }
    for (let i = 0; i < this.torchFlames.length; i++) {
      const fl = this.torchFlames[i];
      const s = 1 + Math.sin(t * 13 + i * 7) * 0.14;
      fl.scale.set(fl.scale.x, Math.abs(fl.scale.y) * 0.9 + 0.16 * s, 1);
      (fl.material as THREE.SpriteMaterial).opacity = 0.75 + 0.25 * Math.sin(t * 17 + i * 3);
    }
    // flash light decay (peak-agnostic exponential falloff)
    if (this.flashLightT > 0) {
      this.flashLightT -= dt;
      this.flashLight.intensity *= Math.pow(0.002, dt / 0.32);
      if (this.flashLightT <= 0) this.flashLight.intensity = 0;
    }
    // sparks
    for (let i = 0; i < this.SPARK_N; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt;
      if (this.sparkLife[i] <= 0) {
        this.sparkPos[i * 3 + 1] = -99;
        this.sparkCol[i * 3] = 0; this.sparkCol[i * 3 + 1] = 0; this.sparkCol[i * 3 + 2] = 0;
        continue;
      }
      this.sparkVel[i * 3 + 1] -= 9 * dt;
      this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
      this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
      const f = Math.min(1, this.sparkLife[i] * 2.2);
      const v = f;
      this.sparkCol[i * 3] = v; this.sparkCol[i * 3 + 1] = v * 0.95; this.sparkCol[i * 3 + 2] = v * 0.82;
    }
    (this.sparkGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.sparkGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // chunks
    const cm = new THREE.Matrix4();
    const cq = new THREE.Quaternion();
    const ce = new THREE.Euler();
    let anyChunk = false;
    for (let i = 0; i < this.CHUNK_N; i++) {
      const c = this.chunks[i];
      if (!c.alive) continue;
      anyChunk = true;
      c.life -= dt;
      if (c.life <= 0) {
        c.alive = false;
        cm.makeScale(0, 0, 0);
        this.chunkMesh.setMatrixAt(i, cm);
        continue;
      }
      c.vel.y -= 14 * dt;
      c.pos.addScaledVector(c.vel, dt);
      if (c.pos.y < 0.04) { c.pos.y = 0.04; c.vel.y *= -0.3; c.vel.x *= 0.7; c.vel.z *= 0.7; }
      c.rot.x += c.spin.x * dt; c.rot.y += c.spin.y * dt; c.rot.z += c.spin.z * dt;
      ce.set(c.rot.x, c.rot.y, c.rot.z);
      cq.setFromEuler(ce);
      const shrink = Math.min(1, c.life / (c.maxLife * 0.4));
      cm.compose(c.pos, cq, new THREE.Vector3(c.scale, c.scale, c.scale).multiplyScalar(shrink));
      this.chunkMesh.setMatrixAt(i, cm);
    }
    if (anyChunk || this.lastChunkFrame) this.chunkMesh.instanceMatrix.needsUpdate = true;
    this.lastChunkFrame = anyChunk;

    // damage numbers
    for (const d of this.dmgPool) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.sprite.position.addScaledVector(d.vel, dt);
      d.vel.y *= 1 - dt * 2;
      (d.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, d.life * 2.2));
      if (d.life <= 0) d.sprite.visible = false;
    }
    // tracers
    for (const tr of this.tracerPool) {
      if (tr.life <= 0) continue;
      tr.life -= dt;
      (tr.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, tr.life / 0.07) * 0.85;
      if (tr.life <= 0) tr.mesh.visible = false;
    }
    // muzzle smoke
    for (const p of this.smokePool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; p.sprite.visible = false; continue; }
      p.vel.x *= 1 - dt * 1.5;
      p.vel.z *= 1 - dt * 1.5;
      p.pos.addScaledVector(p.vel, dt);
      p.sprite.position.copy(p.pos);
      const s = p.sprite.scale.x + p.grow * dt;
      p.sprite.scale.set(s, s, 1);
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.min(0.5, (p.life / p.maxLife)) * 0.8;
      (p.sprite.material as THREE.SpriteMaterial).rotation += dt * 0.6;
    }
    // scorch marks fade
    for (const s of this.scorchPool) {
      if (!s.alive) continue;
      s.life -= dt;
      if (s.life <= 0) { s.alive = false; s.sprite.visible = false; continue; }
      (s.sprite.material as THREE.SpriteMaterial).opacity = Math.min(0.85, s.life / 2.5);
    }
    // soul wisps rise and gutter out
    for (const w of this.wispPool) {
      if (!w.alive) continue;
      w.life -= dt;
      if (w.life <= 0) { w.alive = false; w.sprite.visible = false; continue; }
      w.pos.y += dt * 1.7;
      w.pos.x += Math.sin(t * 5 + w.seed) * dt * 0.5;
      w.pos.z += Math.cos(t * 4.2 + w.seed) * dt * 0.5;
      w.sprite.position.copy(w.pos);
      const k = w.life / w.maxLife;
      const flick = 0.3 + 0.16 * Math.sin(t * 18 + w.seed * 3);
      w.sprite.scale.set(flick, flick * 1.5, 1);
      (w.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, k * 2) * 0.9;
    }
    // spent casings tumble
    for (const c of this.casingPool) {
      if (!c.alive) continue;
      c.life -= dt;
      if (c.life <= 0) { c.alive = false; c.mesh.visible = false; continue; }
      c.vel.y -= 13 * dt;
      c.pos.addScaledVector(c.vel, dt);
      if (c.pos.y < 0.03) {
        c.pos.y = 0.03;
        c.vel.y *= -0.35;
        c.vel.x *= 0.72;
        c.vel.z *= 0.72;
        c.spin.multiplyScalar(0.6);
      }
      c.mesh.position.copy(c.pos);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.z += c.spin.z * dt;
    }
    // spell flash blooms
    for (const f of this.flashSprPool) {
      if (!f.alive) continue;
      f.life -= dt;
      if (f.life <= 0) { f.alive = false; f.sprite.visible = false; continue; }
      const k = 1 - f.life / f.maxLife;
      const s = f.maxScale * (0.35 + 0.65 * Math.sqrt(k));
      f.sprite.scale.set(s, s, 1);
      (f.sprite.material as THREE.SpriteMaterial).opacity = (1 - k) * (1 - k) * 1.1;
    }
    // rings
    for (const r of this.rings) {
      if (!r.alive) continue;
      r.t += dt;
      const ph = r.t / r.maxT;
      if (ph >= 1) { r.alive = false; r.mesh.visible = false; continue; }
      const sc = 0.4 + ph * r.maxR;
      r.mesh.scale.set(sc, sc, sc);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - ph) * 0.95;
    }
    // chain-hex beams
    for (const beam of this.beamPool) {
      if (beam.life <= 0) continue;
      beam.life -= dt;
      if (beam.life <= 0) { beam.line.visible = false; beam.mat.opacity = 0; continue; }
      beam.mat.opacity = Math.min(1, beam.life / 0.12);
    }
    // embers drift
    const ep = this.ember.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.emberSeeds.length; i++) {
      let y = ep.getY(i) + dt * (0.25 + 0.2 * Math.sin(this.emberSeeds[i]));
      const x = ep.getX(i) + Math.sin(t * 0.7 + this.emberSeeds[i]) * dt * 0.3;
      if (y > 4.4) y = 0.15;
      ep.setXYZ(i, x, y, ep.getZ(i));
    }
    ep.needsUpdate = true;
  }
  private lastChunkFrame = false;

  /* ------------------------------ hud ------------------------------ */

  private updateHud(dt: number) {
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.pushHud();
    }
  }

  private pushHud() {
    const alive = this.enemies.filter((e) => !e.dead).length;
    this.onHud({
      hp: Math.max(0, Math.round(this.hp)),
      maxHp: 100,
      souls: Math.round(this.souls),
      maxSouls: 100,
      ammo: this.ammo,
      maxAmmo: 6,
      reloading: this.reloading,
      reloadProgress: this.reloading ? Math.min(1, this.reloadT / 1.15) : 0,
      score: this.score,
      kills: this.kills,
      wave: this.wave,
      enemiesLeft: alive + this.spawnQueue.length,
      slotReady: 1 - this.boltCd / SPELLS[this.equipped].cd,
      equippedSpell: this.equipped,
      spellCharges: this.spellCharges,
      spellMax: SPELLS[this.equipped].charges,
      novaReady: 1 - this.novaCd / 4.5,
      state: this.state,
      paused: this.paused,
      muted: this.audio.muted,
      fps: Math.round(this.fps),
    });
  }
}
