import * as THREE from "three";
import {
  makeFloorTexture,
  makeWallTexture,
  makeCeilingTexture,
  makeGlowTexture,
  makeStarTexture,
  makeRuneTexture,
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
  boltReady: number; // 0..1
  novaReady: number; // 0..1
  state: EngineState;
  paused: boolean;
  muted: boolean;
  fps: number;
}

export interface GameEvent {
  type: "kill" | "damage" | "hit" | "wave" | "dead" | "heal" | "flash" | "empty";
  text?: string;
  wave?: number;
  sub?: string;
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
  kind: "heart" | "soul";
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
    const flameMat = new THREE.SpriteMaterial({ map: this.glowTex, color: 0xfff3d8, blending: THREE.AdditiveBlending, depthWrite: false });
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
      const l = new THREE.PointLight(0xffe9c0, 26, 17, 1.8);
      l.position.set(t.x + t.nx * 0.4, 2.85, t.z + t.nz * 0.4);
      this.scene.add(l);
      this.torchLights.push(l);
      this.torchSeeds.push(rnd(0, 100));
    }
    for (const b of this.brazierPos) {
      const l = new THREE.PointLight(0xfff0cc, 30, 19, 1.8);
      l.position.copy(b).add(new THREE.Vector3(0, 0.4, 0));
      this.scene.add(l);
      this.torchLights.push(l);
      this.torchSeeds.push(rnd(0, 100));
    }
    this.muzzleLight = new THREE.PointLight(0xfff2d5, 0, 10, 2);
    this.scene.add(this.muzzleLight);
    this.boltLight = new THREE.PointLight(0xf5eeda, 0, 13, 2);
    this.scene.add(this.boltLight);
    this.flashLight = new THREE.PointLight(0xfaf4e2, 0, 22, 1.9);
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

    /* --- revolver hand (right) --- */
    this.gunGroup = new THREE.Group();
    this.gunGroup.position.set(0.34, -0.31, -0.58);

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.15, 0.6, 7), sleeveMat);
    sleeve.position.set(0.14, -0.28, 0.28);
    sleeve.rotation.set(0.85, 0, 0.55);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.15), skinMat);
    hand.position.set(0.0, -0.12, 0.05);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.24), gunMetal);
    frame.position.set(0, 0.0, -0.06);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), gunMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.028, -0.3);
    const underlug = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.24), gunDark);
    underlug.position.set(0, -0.015, -0.26);
    this.chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.1, 6), gunMetal);
    this.chamber.rotation.x = Math.PI / 2;
    this.chamber.position.set(0, 0.01, 0.02);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.04), gunDark);
    hammer.position.set(0, 0.075, 0.1);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.07), gunDark);
    grip.position.set(0, -0.12, 0.09);
    grip.rotation.x = 0.28;
    const runePlate = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.05, 0.1), runeMat);
    runePlate.position.set(0, 0.01, -0.06);
    this.gunGroup.add(sleeve, hand, frame, barrel, underlug, this.chamber, hammer, grip, runePlate);

    this.muzzleAnchor = new THREE.Object3D();
    this.muzzleAnchor.position.set(0, 0.028, -0.47);
    this.gunGroup.add(this.muzzleAnchor);

    this.muzzleFlash = new THREE.Group();
    const flashMat = new THREE.SpriteMaterial({ map: this.starTex, color: 0xfff6de, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const f1 = new THREE.Sprite(flashMat);
    f1.scale.set(0.5, 0.5, 1);
    const f2 = new THREE.Sprite(flashMat.clone());
    f2.scale.set(0.3, 0.3, 1);
    f2.material.rotation = Math.PI / 4;
    this.muzzleFlash.add(f1, f2);
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
    const orbCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xe9e2cd }));
    const orbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xe9e2cd, blending: THREE.AdditiveBlending, depthWrite: false }));
    orbGlow.scale.set(0.6, 0.6, 1);
    const runeCard = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.runeTex, color: 0xcfc8b2, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
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
        color: 0xece5d0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      mesh.visible = false;
      this.scene.add(mesh);
      this.tracerPool.push({ mesh, life: 0 });
    }

    // shockwave rings
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.82, 1, 28),
        new THREE.MeshBasicMaterial({
          map: this.runeTex, color: 0xd8d2bd, transparent: true, opacity: 0.9,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.rings.push({ mesh, t: 0, maxT: 0.45, maxR: 4, alive: false });
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
    if (e.button === 2) this.castBolt();
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
    // drops
    const roll = Math.random();
    if (roll < 0.16) this.dropPickup(e.pos.x, e.pos.z, "heart");
    else if (roll < 0.5) this.dropPickup(e.pos.x, e.pos.z, "soul");
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

  private dropPickup(x: number, z: number, kind: "heart" | "soul") {
    const g = new THREE.Group();
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
      p.group.position.set(p.pos.x, 0, p.pos.z);
      p.group.rotation.y = p.spin;
      const blink = p.life < 3 ? (Math.floor(p.life * 6) % 2 === 0 ? 0.25 : 1) : 1;
      p.group.scale.setScalar(blink * (p.kind === "heart" ? 1 : 1 + Math.sin(p.spin * 2) * 0.08));
      if (d < 1.05 && !this.dead) {
        if (p.kind === "heart") {
          this.hp = Math.min(100, this.hp + 25);
          this.audio.pickupHeart();
          this.onEvent({ type: "heal" });
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
    this.fireCd = 0.26;
    this.recoil = 1;
    this.recoilPitch = Math.min(0.09, this.recoilPitch + 0.028);
    this.muzzleT = 0.05;
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
      this.damageEnemy(hitEnemy, 34, dir.x * 1.6, dir.z * 1.6);
    } else if (wallDist < 60) {
      this.burst(end.x, end.y, end.z, 7, 3, 0.35);
      this.burstChunks(end.x, end.y, end.z, 3, 2.4);
    }

    // muzzle light in world space
    const mp = new THREE.Vector3();
    this.muzzleAnchor.getWorldPosition(mp);
    this.muzzleLight.position.copy(mp);
    this.muzzleLight.intensity = 30;

    if (this.ammo === 0) this.startReload();
  }

  private startReload() {
    if (this.reloading || this.ammo === 6 || this.dead) return;
    this.reloading = true;
    this.reloadT = 0;
    this.audio.reloadSpin();
  }

  private castBolt() {
    if (this.boltCd > 0 || this.dead || this.reloading) return;
    if (this.souls < 30) { this.audio.dryFire(); return; }
    this.souls -= 30;
    this.boltCd = 0.55;
    this.castLunge = 1;
    this.audio.cast();

    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0xefe8d3 }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xe9e2cd, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(1.6, 1.6, 1);
    g.add(core, glow);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const start = this.camera.position.clone().addScaledVector(dir, 0.6);
    start.y -= 0.15;
    g.position.copy(start);
    this.scene.add(g);
    this.bolts.push({ group: g, pos: start.clone(), vel: dir.multiplyScalar(17), life: 3, alive: true });
  }

  private castNova() {
    if (this.novaCd > 0 || this.dead) return;
    if (this.souls < 55) { this.audio.dryFire(); return; }
    this.souls -= 55;
    this.novaCd = 4.5;
    this.novaLunge = 1;
    this.audio.nova();
    this.spawnRing(this.pos.x, 0.1, this.pos.z, 7.2, 0.5);
    this.flashLight.position.set(this.pos.x, 1.4, this.pos.z);
    this.flashLight.intensity = 90;
    this.flashLightT = 0.35;
    this.burstChunks(this.pos.x, 0.8, this.pos.z, 26, 8);
    this.burst(this.pos.x, 1, this.pos.z, 30, 9, 1);
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
    this.audio.explosion();
    this.spawnRing(b.pos.x, 0.1, b.pos.z, 4.4, 0.4);
    this.flashLight.position.set(b.pos.x, 1.0, b.pos.z);
    this.flashLight.intensity = 70;
    this.flashLightT = 0.3;
    this.addShake(0.35);
    this.burstChunks(b.pos.x, b.pos.y, b.pos.z, 20, 6.5);
    this.burst(b.pos.x, b.pos.y, b.pos.z, 24, 8, 0.9);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - b.pos.x;
      const dy = this.enemyTop(e) * 0.5 - b.pos.y;
      const dz = e.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz, dy * 0.5);
      if (d < 3.6) {
        const fall = 1 - (d / 3.6) * 0.5;
        const hd = Math.hypot(dx, dz) || 1;
        this.damageEnemy(e, 58 * fall, (dx / hd) * 5, (dz / hd) * 5);
      }
    }
  }

  private spawnRing(x: number, y: number, z: number, maxR: number, maxT: number) {
    const r = this.rings.find((q) => !q.alive) ?? this.rings[0];
    r.alive = true;
    r.t = 0;
    r.maxR = maxR;
    r.maxT = maxT;
    r.mesh.position.set(x, y, z);
    r.mesh.visible = true;
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
  private burst(x: number, y: number, z: number, n: number, speed: number, life: number) {
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
      const v = rnd(0.7, 1);
      this.sparkCol[i * 3] = v; this.sparkCol[i * 3 + 1] = v * 0.96; this.sparkCol[i * 3 + 2] = v * 0.86;
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
    const slow = this.dead ? Math.max(0.25, 1 - this.deathT * 1.4) : 1;
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
      }
    }
  }
  private stepAcc = 0;
  private stepAlt = false;

  private updateCamera(dt: number) {
    if (this.state === "menu") {
      this.shake = 0;
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
    this.recoilPitch = Math.max(0, this.recoilPitch - dt * 0.5);
    const deathRoll = this.dead ? Math.min(1.15, this.deathT * 0.75) : 0;
    const sprinting = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && hSpeed > 4 && this.grounded && !this.dead;
    const targetFov = sprinting ? 81 : 74;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 9);
      this.camera.updateProjectionMatrix();
    }
    this.camera.rotation.set(
      this.pitch + this.recoilPitch + Math.sin(this.bobT * 1.9) * 0.008 * bobAmp,
      this.yaw,
      Math.sin(this.bobT * 0.95) * 0.012 * bobAmp + rnd(-1, 1) * 0.02 * sh + deathRoll
    );
  }

  /* ------------------------------ viewmodel tick ------------------------------ */

  private updateViewmodel(dt: number) {
    const t = this.clockT;
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const bobAmp = Math.min(1, hSpeed / 5);
    const swayX = Math.sin(this.bobT * 0.95) * 0.014 * bobAmp;
    const swayY = Math.abs(Math.sin(this.bobT * 1.9)) * -0.018 * bobAmp;

    this.vm.position.set(swayX, swayY, 0);
    this.vm.visible = this.state === "playing";

    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.castLunge = Math.max(0, this.castLunge - dt * 4.5);
    this.novaLunge = Math.max(0, this.novaLunge - dt * 3.5);

    this.gunGroup.position.set(0.34 + swayX * 0.4, -0.31 + swayY, -0.58 + this.recoil * 0.08);
    this.gunGroup.rotation.set(this.recoil * 0.22, 0, this.recoil * 0.05);
    if (this.reloading) {
      const ph = this.reloadT / 1.15;
      const tilt = Math.sin(Math.min(1, ph * 1.3) * Math.PI) * 0.9;
      this.gunGroup.rotation.x -= tilt;
      this.gunGroup.position.y -= tilt * 0.12;
      this.chamber.rotation.y += dt * 14;
    }

    this.muzzleT = Math.max(0, this.muzzleT - dt);
    this.muzzleFlash.visible = this.muzzleT > 0;
    if (this.muzzleT > 0) this.muzzleFlash.rotation.z = rnd(0, 6);
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 500);

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
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      b.group.position.copy(b.pos);
      b.group.rotation.y += dt * 9;
      b.group.rotation.x += dt * 6;
      if (!lightSet) {
        this.boltLight.position.copy(b.pos);
        this.boltLight.intensity = 16;
        lightSet = true;
      }
      let boom = b.life <= 0 || b.pos.y < 0.05 || this.collider.solidAt(b.pos.x, b.pos.z) || b.pos.y > WALL_H;
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
    // flash light decay
    if (this.flashLightT > 0) {
      this.flashLightT -= dt;
      this.flashLight.intensity = Math.max(0, (this.flashLightT / 0.35) * 80);
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
      boltReady: 1 - this.boltCd / 0.55,
      novaReady: 1 - this.novaCd / 4.5,
      state: this.state,
      paused: this.paused,
      muted: this.audio.muted,
      fps: Math.round(this.fps),
    });
  }
}
