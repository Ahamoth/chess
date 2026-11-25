// Процедурный синтезатор шахматных звуков на базе Web Audio API
// Имитирует деревянный щелчок постановки фигуры, удар взятия, двойной стук рокировки,
// сигнал шаха и финальный аккорд без единого внешнего аудиофайла.

export class SoundEffects {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  ensureContext() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setEnabled(val) {
    this.enabled = Boolean(val);
  }

  playWoodTap(timeOffset = 0, pitch = 210, gainPeak = 0.22) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime + timeOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.065);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, t);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(gainPeak, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.08);
  }

  playMove() {
    this.playWoodTap(0, 230, 0.2);
  }

  playCapture() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playWoodTap(0, 155, 0.3);
    this.playWoodTap(0.018, 310, 0.16);
  }

  playCastle() {
    this.playWoodTap(0, 225, 0.2);
    this.playWoodTap(0.09, 255, 0.18);
  }

  playPromote() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const notes = [440, 554.37, 659.25];
    notes.forEach((freq, idx) => {
      const t = ctx.currentTime + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.19);
    });
  }

  playCheck() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playWoodTap(0, 200, 0.22);
    const t = ctx.currentTime + 0.02;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.22);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.15, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  playGameOver(won = true) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const chord = won ? [523.25, 659.25, 783.99, 1046.5] : [392.0, 349.23, 311.13, 261.63];
    chord.forEach((freq, idx) => {
      const t = ctx.currentTime + idx * 0.075;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.13, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.44);
    });
  }
}
