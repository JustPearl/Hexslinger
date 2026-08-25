/* All sound is synthesized live — a tiny noir-occult sound kit. */

export class HexAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  ensure() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  private noise(dur: number, vol: number, filterFreq: number, sweepTo?: number, type: BiquadFilterType = "lowpass") {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private tone(freq: number, endFreq: number, dur: number, vol: number, type: OscillatorType = "square") {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shoot() {
    // cannon crack — layered noise body
    this.noise(0.34, 1.0, 1900, 130);
    this.noise(0.06, 0.8, 5200, 1400, "bandpass");
    this.noise(0.5, 0.35, 420, 70); // dungeon boom tail
    // mechanical square thwack
    this.tone(150 + Math.random() * 20, 38, 0.16, 0.5, "square");
    // sub-bass chest punch
    this.tone(72, 26, 0.3, 0.85, "sine");
    this.tone(48, 22, 0.4, 0.55, "sine");
    // hammer/lock click just behind the blast
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(950, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(320, t + 0.09);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.setValueAtTime(0.12, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(g).connect(this.master);
      o.start(t + 0.05);
      o.stop(t + 0.12);
    }
  }
  casings() {
    if (!this.ctx || !this.master) return;
    for (let i = 0; i < 6; i++) {
      const at = this.ctx.currentTime + 0.08 + i * 0.09 + Math.random() * 0.04;
      const o = this.ctx.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(1900 + Math.random() * 900, at);
      o.frequency.exponentialRampToValueAtTime(700, at + 0.05);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.setValueAtTime(0.09 + Math.random() * 0.05, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.08);
      o.connect(g).connect(this.master);
      o.start(at);
      o.stop(at + 0.1);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 4200 + Math.random() * 1600;
      f.Q.value = 6;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.06, at);
      ng.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
      src.connect(f).connect(ng).connect(this.master);
      src.start(at);
      src.stop(at + 0.06);
    }
  }
  dryFire() {
    this.noise(0.03, 0.4, 4000, 2000, "highpass");
    this.tone(1200, 900, 0.03, 0.12, "square");
  }
  reloadSpin() {
    this.noise(0.05, 0.35, 3000, 800, "bandpass");
    this.tone(700, 500, 0.05, 0.1, "square");
  }
  reloadSnap() {
    this.noise(0.04, 0.5, 5000, 1200, "highpass");
    this.tone(300, 180, 0.06, 0.25, "square");
  }
  cast() {
    this.tone(160, 720, 0.28, 0.28, "sawtooth");
    this.noise(0.3, 0.3, 900, 4200, "bandpass");
  }
  explosion() {
    this.noise(0.6, 1.0, 900, 60);
    this.tone(140, 28, 0.5, 0.6, "sine");
    this.noise(0.2, 0.5, 3500, 400, "bandpass");
  }
  nova() {
    this.tone(60, 40, 0.7, 0.8, "sine");
    this.noise(0.7, 0.9, 1400, 80);
    this.tone(300, 1200, 0.25, 0.2, "sawtooth");
  }
  hitEnemy() {
    this.noise(0.06, 0.4, 1800, 500, "bandpass");
    this.tone(320, 140, 0.07, 0.2, "square");
  }
  killEnemy() {
    this.tone(220, 40, 0.3, 0.35, "sawtooth");
    this.noise(0.25, 0.45, 700, 90);
  }
  hurt() {
    this.tone(110, 55, 0.28, 0.5, "sawtooth");
    this.noise(0.18, 0.4, 500, 120);
  }
  pickupSoul() {
    this.tone(620, 990, 0.12, 0.18, "triangle");
    this.tone(930, 1480, 0.16, 0.14, "sine");
  }
  pickupHeart() {
    this.tone(330, 330, 0.09, 0.22, "square");
    this.tone(495, 495, 0.14, 0.22, "square");
  }
  step(alt: boolean) {
    this.noise(0.05, 0.12, alt ? 500 : 420, 120);
  }
  waveBell() {
    this.tone(196, 194, 1.4, 0.3, "sine");
    this.tone(392, 388, 1.1, 0.12, "sine");
    this.tone(98, 97, 1.6, 0.25, "triangle");
  }
  spawnGrowl() {
    this.tone(70, 130, 0.4, 0.3, "sawtooth");
    this.noise(0.35, 0.25, 400, 100);
  }
  playerDeath() {
    this.tone(220, 30, 1.4, 0.5, "sawtooth");
    this.noise(1.2, 0.6, 800, 50);
  }
}
