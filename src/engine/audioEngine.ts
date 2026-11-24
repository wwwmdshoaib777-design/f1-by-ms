/**
 * Procedural Web Audio API F1 V6 Turbo-Hybrid Audio Synthesizer (zero external audio files).
 */
export class F1AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oscPrimary: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private oscTurbo: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private turboGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private muted = false;
  private initialized = false;
  private lastGear = 1;
  private lastLights = 0;

  public unlock() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.24;
      this.masterGain.connect(this.ctx.destination);

      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 650;
      this.filter.Q.value = 3.2;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.001;

      this.oscPrimary = this.ctx.createOscillator();
      this.oscPrimary.type = 'sawtooth';
      this.oscPrimary.frequency.value = 85;

      this.oscHarmonic = this.ctx.createOscillator();
      this.oscHarmonic.type = 'triangle';
      this.oscHarmonic.frequency.value = 170;

      this.oscPrimary.connect(this.filter);
      this.oscHarmonic.connect(this.filter);
      this.filter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      // Subtle MGU-H turbo whine
      this.oscTurbo = this.ctx.createOscillator();
      this.oscTurbo.type = 'sine';
      this.oscTurbo.frequency.value = 1400;
      this.turboGain = this.ctx.createGain();
      this.turboGain.gain.value = 0.001;
      this.oscTurbo.connect(this.turboGain);
      this.turboGain.connect(this.masterGain);

      this.oscPrimary.start();
      this.oscHarmonic.start();
      this.oscTurbo.start();
      this.initialized = true;
    } catch {
      // Ignore Web Audio failures in restricted environments
    }
  }

  public setMuted(m: boolean) {
    this.muted = m;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(m ? 0 : 0.24, this.ctx.currentTime, 0.04);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public updateTelemetry(
    rpm: number,
    throttle: number,
    gear: number,
    ersActive: boolean,
    isPaused: boolean,
  ) {
    if (!this.initialized || !this.ctx || !this.oscPrimary || !this.oscHarmonic || !this.oscTurbo || !this.engineGain || !this.turboGain || !this.filter) {
      return;
    }
    const now = this.ctx.currentTime;
    if (isPaused) {
      this.engineGain.gain.setTargetAtTime(0.0001, now, 0.05);
      this.turboGain.gain.setTargetAtTime(0.0001, now, 0.05);
      return;
    }

    // V6 hybrid pitch scaling: 4500..14500 RPM -> ~75Hz..320Hz fundamental
    const normRpm = Math.max(0, Math.min(1, (rpm - 4000) / 11000));
    const baseFreq = 72 + normRpm * 245;

    this.oscPrimary.frequency.setTargetAtTime(baseFreq, now, 0.03);
    this.oscHarmonic.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.03);
    this.filter.frequency.setTargetAtTime(420 + normRpm * 1900 + throttle * 600, now, 0.04);

    const engVol = 0.14 + throttle * 0.24 + normRpm * 0.1;
    this.engineGain.gain.setTargetAtTime(engVol, now, 0.04);

    const turboFreq = 1100 + normRpm * 2600 + (ersActive ? 750 : 0);
    this.oscTurbo.frequency.setTargetAtTime(turboFreq, now, 0.05);
    this.turboGain.gain.setTargetAtTime(0.012 + (ersActive ? 0.045 : throttle * 0.015), now, 0.05);

    if (gear !== this.lastGear && gear > 0) {
      this.triggerShiftBlip();
      this.lastGear = gear;
    }
  }

  public handleCountdownLights(lightsLit: number) {
    if (lightsLit !== this.lastLights) {
      if (lightsLit > 0 && lightsLit <= 5) {
        this.playBeep(540, 0.09, 0.18);
      } else if (lightsLit === -1 && this.lastLights > 0) {
        this.playBeep(880, 0.22, 0.24);
      }
      this.lastLights = lightsLit;
    }
  }

  public triggerDrsChime() {
    this.playBeep(1180, 0.08, 0.12);
  }

  private triggerShiftBlip() {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.06);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  private playBeep(freq: number, duration: number, vol: number) {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public dispose() {
    try {
      this.oscPrimary?.stop();
      this.oscHarmonic?.stop();
      this.oscTurbo?.stop();
      this.ctx?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.initialized = false;
  }
}
