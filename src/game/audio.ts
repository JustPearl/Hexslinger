/** Fully synthesized WebAudio kit — no audio assets. */
export class HexAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(v: boolean) {
    this.muted = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  private tone(freq: number, endFreq: number, dur: number, vol: number, type: OscillatorType = "square", at = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number, endFreq?: number, type: BiquadFilterType = "lowpass", at = 0) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* ---------- the piece ---------- */

  shoot() {
    // sub-bass chest thump
    this.tone(150, 38, 0.24, 0.95, "sine");
    this.tone(88, 30, 0.3, 0.5, "triangle");
    // cannon roar
    this.noise(0.42, 0.85, 2600, 120);
    this.noise(0.12, 0.55, 5200, 900, "bandpass");
    // crack
    this.noise(0.045, 0.5, 8000, 2000, "highpass");
    // mechanism
    this.tone(1900, 500, 0.05, 0.16, "square", 0.05);
  }

  dryFire() {
    this.tone(1100, 700, 0.05, 0.2, "square");
    this.tone(700, 420, 0.04, 0.14, "square", 0.07);
  }

  reloadSpin() {
    this.noise(0.4, 0.18, 1400, 2600, "bandpass");
    for (let i = 0; i < 6; i++) this.tone(600 + i * 60, 500, 0.03, 0.08, "square", i * 0.07);
  }

  reloadSnap() {
    this.tone(300, 120, 0.07, 0.35, "square");
    this.noise(0.06, 0.3, 2400, 500);
  }

  casings() {
    for (let i = 0; i < 3; i++) {
      const at = i * 0.055;
      this.tone(2400 + Math.random() * 500, 1200, 0.05, 0.1, "triangle", at);
      this.tone(1500, 900, 0.04, 0.07, "square", at + 0.02);
    }
  }

  /* ---------- hits & hurt ---------- */

  hitEnemy() {
    this.tone(220, 90, 0.09, 0.4, "square");
    this.noise(0.07, 0.3, 1800, 300);
  }

  killEnemy() {
    this.tone(160, 40, 0.3, 0.55, "sawtooth");
    this.noise(0.28, 0.5, 900, 90);
    this.tone(520, 140, 0.12, 0.2, "square", 0.03);
  }

  hurt() {
    this.tone(140, 60, 0.25, 0.6, "sawtooth");
    this.noise(0.2, 0.4, 700, 120);
  }

  playerDeath() {
    this.tone(200, 28, 1.4, 0.7, "sawtooth");
    this.noise(1.2, 0.5, 900, 50);
    this.tone(96, 24, 1.6, 0.5, "sine", 0.1);
  }

  step(alt: boolean) {
    this.noise(0.07, 0.12, alt ? 500 : 420, 140);
  }

  /* ---------- hexcraft ---------- */

  cast() {
    this.tone(340, 920, 0.22, 0.3, "sawtooth");
    this.tone(680, 1500, 0.16, 0.16, "square", 0.02);
    this.noise(0.2, 0.18, 3000, 6000, "bandpass");
  }

  explosion() {
    this.noise(0.6, 0.85, 900, 60);
    this.tone(120, 26, 0.5, 0.7, "sine");
    this.noise(0.15, 0.4, 3000, 300, "bandpass", 0.02);
  }

  thunder() {
    this.noise(0.9, 0.8, 520, 55);
    this.tone(95, 24, 0.62, 0.6, "sine");
    this.noise(0.22, 0.42, 2800, 320, "bandpass", 0.015);
    this.tone(1500, 200, 0.1, 0.2, "sawtooth", 0.01);
  }

  boneRattle() {
    for (let i = 0; i < 5; i++) {
      this.tone(1800 + Math.random() * 900, 700, 0.04, 0.09, "triangle", i * 0.045);
    }
    this.noise(0.3, 0.2, 2200, 500, "bandpass");
  }

  bloodSplat() {
    this.noise(0.25, 0.45, 800, 150);
    this.tone(180, 50, 0.2, 0.35, "sine");
  }

  pickupHeart() {
    this.tone(300, 520, 0.14, 0.3, "triangle");
    this.tone(520, 700, 0.16, 0.25, "triangle", 0.1);
  }

  pickupSoul() {
    this.tone(900, 1600, 0.12, 0.2, "sine");
    this.tone(1400, 2200, 0.1, 0.12, "sine", 0.06);
  }

  tomePickup() {
    this.tone(392, 392, 0.1, 0.2, "triangle");
    this.tone(523, 523, 0.1, 0.2, "triangle", 0.09);
    this.tone(784, 784, 0.16, 0.22, "triangle", 0.18);
    this.tone(1568, 1568, 0.22, 0.1, "sine", 0.18);
    this.noise(0.3, 0.15, 2000, 6000, "bandpass", 0.1);
  }

  spellSpent() {
    this.tone(520, 180, 0.25, 0.2, "triangle");
    this.tone(260, 120, 0.3, 0.16, "triangle", 0.12);
  }

  slotTick() {
    this.tone(1500, 900, 0.04, 0.14, "square");
  }

  waveBell() {
    this.tone(180, 120, 0.9, 0.5, "sawtooth");
    this.tone(90, 60, 1.1, 0.4, "sine");
    this.noise(0.5, 0.2, 600, 100);
  }

  spawnGrowl() {
    this.tone(70, 130, 0.4, 0.3, "sawtooth");
    this.noise(0.35, 0.25, 400, 100);
  }
}
