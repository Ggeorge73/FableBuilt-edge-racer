// ---------------------------------------------------------------------------
// Ambient audio — a Sky-like soundscape built entirely in WebAudio.
// A warm evolving pad, soft wind, pentatonic chimes for pickups, muffled
// impacts, and a long falling sigh on game over. No samples, no downloads.
// ---------------------------------------------------------------------------

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C major pentatonic

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private padGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private started = false;
  private muted = false;
  private chimeIndex = 0;

  init() {
    if (this.started) return;
    try {
      this.ctx = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // ---- evolving pad: detuned triangles through a slow-breathing filter
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 900;
    padFilter.Q.value = 0.4;
    this.padGain.connect(padFilter);
    padFilter.connect(this.master);

    const chord = [130.81, 196.0, 261.63, 329.63]; // C2 G2 C3 E3
    for (const freq of chord) {
      for (const detune of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = 0.05;
        osc.connect(g);
        g.connect(this.padGain);
        osc.start();
      }
    }

    // slow LFO breathing on the pad filter
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 420;
    lfo.connect(lfoGain);
    lfoGain.connect(padFilter.frequency);
    lfo.start();

    // ---- wind: filtered noise
    const noiseLen = 2 * ctx.sampleRate;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.55;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    noise.start();

    // fade the world in
    this.padGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 3);
    this.windGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 3);

    this.started = true;
  }

  resume() {
    this.ctx?.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.55, this.ctx.currentTime + 0.3);
    }
  }
  isMuted() {
    return this.muted;
  }

  /** speed 0..1 → wind rises with velocity */
  setIntensity(intensity: number, edgeProximity: number) {
    if (!this.ctx || !this.windGain || !this.windFilter) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.04 + intensity * 0.1 + edgeProximity * 0.08, t, 0.4);
    this.windFilter.frequency.setTargetAtTime(420 + intensity * 700 + edgeProximity * 500, t, 0.4);
  }

  /** soft bell, walks up the pentatonic scale */
  playChime() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const freq = PENTATONIC[this.chimeIndex % PENTATONIC.length];
    this.chimeIndex++;
    const t = ctx.currentTime;
    for (const [mult, vol] of [
      [1, 0.22],
      [2, 0.08],
      [2.99, 0.03],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 1.7);
    }
  }

  /** muffled, padded thump — collisions are soft here, not violent */
  playImpact(strength = 1) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4 * strength, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.4);

    // airy puff
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 800;
    const ng = ctx.createGain();
    ng.gain.value = 0.18 * strength;
    src.connect(f);
    f.connect(ng);
    ng.connect(this.master);
    src.start(t);
  }

  /** rising shimmer for weapon activation */
  playWeapon() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const base = 660 + i * 110;
      osc.frequency.setValueAtTime(base, t + i * 0.04);
      osc.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.35 + i * 0.04);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.04);
      g.gain.linearRampToValueAtTime(0.07, t + 0.03 + i * 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6 + i * 0.04);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + i * 0.04);
      osc.stop(t + 0.8 + i * 0.04);
    }
  }

  /** crystalline break */
  playShatter() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 1200 + Math.random() * 2200;
      const g = ctx.createGain();
      const start = t + Math.random() * 0.08;
      g.gain.setValueAtTime(0.06, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(g);
      g.connect(this.master);
      osc.start(start);
      osc.stop(start + 0.55);
    }
  }

  /** the long fall — a descending sigh and fading wind */
  playFall() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, t);
    osc.frequency.exponentialRampToValueAtTime(130.81, t + 2.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 3.1);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, t + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(164.81, t + 2.8);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.001, t);
    g2.gain.linearRampToValueAtTime(0.12, t + 0.2);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    osc2.connect(g2);
    g2.connect(this.master);
    osc2.start(t);
    osc2.stop(t + 3.3);
  }

  /** gentle wobble for slipping on a pool */
  playSlip() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, t);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 8;
    const wg = ctx.createGain();
    wg.gain.value = 60;
    wobble.connect(wg);
    wg.connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.75);
    wobble.start(t);
    wobble.stop(t + 0.75);
  }

  /** soft major swell when entering a new realm */
  playBlessing() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const master = this.master;
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      const start = t + i * 0.18;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.1, start + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 2.4);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + 2.5);
    });
  }
}

export const audioManager = new AudioManager();
