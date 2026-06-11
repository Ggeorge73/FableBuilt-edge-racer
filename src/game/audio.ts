export class AudioManager {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  engineOsc: OscillatorNode | null = null;
  engineGain: GainNode | null = null;
  initialized = false;

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3; // global volume
      this.masterGain.connect(this.ctx.destination);
      
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 40;
      
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0; // starts silent
      
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);
      this.engineOsc.start();
      
      this.initialized = true;
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  updateEngine(speed: number) {
    if (!this.initialized || !this.engineOsc || !this.engineGain || !this.ctx) return;
    const baseFreq = 40;
    const freq = baseFreq + (speed / 1000) * 80; // modulate pitch based on speed
    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
    
    const vol = speed > 50 ? 0.2 : 0.05;
    this.engineGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.2);
  }

  stopEngine() {
     if (!this.initialized || !this.engineGain || !this.ctx) return;
     this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  playCollision() {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.2);
    
    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }
  
  playWeapon() {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(800, this.ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, this.ctx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }
  
  playExplosion() {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.5);
    
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  }
}

export const audioManager = new AudioManager();
