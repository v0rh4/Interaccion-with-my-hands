/**
 * SoundManager — Síntesis procedural Halloween con p5.sound.js.
 * Todos los sonidos se generan en tiempo real (Web Audio API vía p5.sound.js).
 * No hay archivos de audio externos.
 */

class SoundManager {
  constructor() {
    this.active = false;
    this.muted = false;

    // Ganancias
    this.masterGain = null;
    this.sfxGain = null;
    this.ambientGain = null;
    this.reverb = null;

    // Volúmenes
    this.masterVol = 0.6;
    this.sfxVol = 0.8;
    this.ambientVol = 0.3;

    // Cooldowns (ms)
    this.lastAppearance = 0;
    this.lastFist = 0;
    this.lastSudden = 0;
    this.lastLeg = 0;
    this.fingerCooldowns = {}; // índice de dedo → última vez

    // Ambiente
    this.ambientOsc1 = null;
    this.ambientOsc2 = null;
    this.ambientNoise = null;
    this.ambientFilter = null;
    this.ambientPlaying = false;
    this.ambientTargetVol = 0;
    this.ambientCurrentVol = 0;
  }

  /* ---------- Inicialización ---------- */

  init() {
    if (this.active) return;
    // Resume el AudioContext tras gesto de usuario (p5)
    if (typeof userStartAudio === 'function') userStartAudio();

    this.masterGain = new p5.Gain();
    this.sfxGain = new p5.Gain();
    this.ambientGain = new p5.Gain();
    this.reverb = new p5.Reverb();

    this.masterGain.amp(this.masterVol);
    this.sfxGain.amp(this.sfxVol);
    this.ambientGain.amp(this.ambientVol);

    // SFX pasan por reverb antes del master
    this.sfxGain.disconnect();
    this.sfxGain.connect(this.reverb);
    this.reverb.connect(this.masterGain);
    // Ambiente va directo al master (más limpio)
    this.ambientGain.disconnect();
    this.ambientGain.connect(this.masterGain);
    this.masterGain.toDestination();

    this.active = true;
    this._updateStatusUI();
  }

  isActive() {
    return this.active;
  }

  toggleMute() {
    this.muted = !this.muted;
    this._updateStatusUI();
    return this.muted;
  }

  setMasterVol(v) {
    this.masterVol = v;
    if (this.masterGain) this.masterGain.amp(v, 0.2);
  }

  setSfxVol(v) {
    this.sfxVol = v;
    if (this.sfxGain) this.sfxGain.amp(v, 0.2);
  }

  setAmbientVol(v) {
    this.ambientVol = v;
    if (this.ambientGain) this.ambientGain.amp(v, 0.2);
  }

  /* ---------- Utilidades internas ---------- */

  _cleanup(nodes, delayMs = 0) {
    setTimeout(() => {
      nodes.forEach(n => {
        if (n && typeof n.dispose === 'function') {
          try { n.dispose(); } catch (e) { /* ignore */ }
        }
      });
    }, delayMs);
  }

  _updateStatusUI() {
    const el = document.getElementById('statusText');
    if (!el) return;
    if (this.muted) {
      el.textContent = 'Silenciado';
      el.className = 'inactive';
    } else if (this.active) {
      el.textContent = 'Activo';
      el.className = 'active';
    } else {
      el.textContent = 'Inactivo';
      el.className = 'inactive';
    }
  }

  _now() {
    return millis ? millis() : Date.now();
  }

  /* ---------- Sonido de aparición (una sola vez) ---------- */

  playAppearance() {
    if (this.muted || !this.active) return;
    const now = this._now();
    if (now - this.lastAppearance < 1500) return;
    this.lastAppearance = now;

    const nodes = [];

    // 1. Sub-bass drone (sine, 40-60 Hz)
    const sub = new p5.Oscillator('sine');
    sub.freq([55, 45], 0.5);
    sub.amp(0);
    sub.connect(this.sfxGain);
    nodes.push(sub);
    const subEnv = new p5.Envelope();
    subEnv.setADSR(0.4, 0.2, 0.3, 1.2);
    subEnv.setRange(0, 0.35);
    subEnv.play(sub);

    // 2. Horror glissando (sawtooth, 150 → 40 Hz)
    const horror = new p5.Oscillator('sawtooth');
    horror.freq([150, 40], 0.8);
    horror.amp(0);
    horror.connect(this.sfxGain);
    nodes.push(horror);
    const horrorEnv = new p5.Envelope();
    horrorEnv.setADSR(0.1, 0.4, 0.2, 0.6);
    horrorEnv.setRange(0, 0.22);
    horrorEnv.play(horror);

    // 3. Whisper fantasma (noise brown + filtro bajo + LFO lento en corte)
    const noise = new p5.Noise('brown');
    const noiseFilter = new p5.Filter('lowpass', 1000, 5);
    noise.disconnect();
    noise.connect(noiseFilter);
    noiseFilter.connect(this.sfxGain);
    nodes.push(noise, noiseFilter);
    noise.amp(0);
    const noiseEnv = new p5.Envelope();
    noiseEnv.setADSR(0.1, 0.5, 0.2, 0.9);
    noiseEnv.setRange(0, 0.14);
    noiseEnv.play(noise);

    // LFO lento en frecuencia de corte del susurro
    const lfo = new p5.Oscillator('sine');
    lfo.freq(0.4);
    lfo.amp(300);
    lfo.connect(noiseFilter.freq);
    nodes.push(lfo);

    // 4. Acento metálico/resonante (dos senos cercanos, decay corto)
    const m1 = new p5.Oscillator('sine');
    m1.freq(440);
    m1.amp(0);
    m1.connect(this.sfxGain);
    nodes.push(m1);
    const m2 = new p5.Oscillator('sine');
    m2.freq(554);
    m2.amp(0);
    m2.connect(this.sfxGain);
    nodes.push(m2);
    const mEnv1 = new p5.Envelope();
    mEnv1.setADSR(0.01, 0.05, 0, 0.35);
    mEnv1.setRange(0, 0.16);
    mEnv1.play(m1);
    const mEnv2 = new p5.Envelope();
    mEnv2.setADSR(0.01, 0.05, 0, 0.35);
    mEnv2.setRange(0, 0.16);
    mEnv2.play(m2);

    this._cleanup(nodes, 3000);
  }

  /* ---------- Clicks de dedos (seda) ---------- */

  playFingerClick(fingerIdx, intensity = 1) {
    if (this.muted || !this.active) return;
    const now = this._now();
    const last = this.fingerCooldowns[fingerIdx] || 0;
    if (now - last < 250) return;
    this.fingerCooldowns[fingerIdx] = now;

    const nodes = [];
    const noise = new p5.Noise('white');
    const filter = new p5.Filter('highpass', 2500, 4);
    noise.disconnect();
    noise.connect(filter);
    filter.connect(this.sfxGain);
    nodes.push(noise, filter);

    const vol = 0.06 + 0.09 * intensity;
    const pitch = 1200 + 800 * intensity;
    noise.amp(0);
    filter.freq(pitch);

    const env = new p5.Envelope();
    env.setADSR(0.01, 0.02, 0, 0.08);
    env.setRange(0, vol);
    env.play(noise);

    this._cleanup(nodes, 500);
  }

  /* ---------- Clicks de patas ---------- */

  playLegClick() {
    if (this.muted || !this.active) return;
    const now = this._now();
    if (now - this.lastLeg < 400) return;
    this.lastLeg = now;

    const nodes = [];
    const noise = new p5.Noise('white');
    const filter = new p5.Filter('lowpass', 1800, 6);
    noise.disconnect();
    noise.connect(filter);
    filter.connect(this.sfxGain);
    nodes.push(noise, filter);

    noise.amp(0);
    const env = new p5.Envelope();
    env.setADSR(0.005, 0.03, 0, 0.06);
    env.setRange(0, 0.1);
    env.play(noise);

    this._cleanup(nodes, 400);
  }

  /* ---------- Tono de tela de araña ---------- */

  setWebTension(active, normalizedDistance) {
    if (this.muted || !this.active) return;

    if (active) {
      if (!this.webTensionOsc) {
        this.webTensionOsc = new p5.Oscillator('sine');
        this.webTensionOsc.amp(0);
        this.webTensionOsc.connect(this.sfxGain);
      }
      // Frecuencia: 200 Hz (dedos juntos) → 900 Hz (dedos separados)
      const freq = 200 + normalizedDistance * 700;
      this.webTensionOsc.freq(freq, 0.1);
      this.webTensionOsc.amp(0.04 * normalizedDistance, 0.1);
    } else {
      if (this.webTensionOsc) {
        this.webTensionOsc.amp(0, 0.3);
        setTimeout(() => {
          try { this.webTensionOsc.dispose(); } catch (e) { /* ignore */ }
          this.webTensionOsc = null;
        }, 400);
      }
    }
  }

  /* ---------- Whoosh de balanceo ---------- */

  playSwingWhoosh(intensity = 1) {
    if (this.muted || !this.active) return;
    const now = this._now();
    if (now - this.lastSudden < 500) return; // compartir cooldown con sudden para no saturar
    this.lastSudden = now;

    const nodes = [];
    const noise = new p5.Noise('brown');
    const filter = new p5.Filter('lowpass', 600, 4);
    noise.disconnect();
    noise.connect(filter);
    filter.connect(this.sfxGain);
    nodes.push(noise, filter);

    noise.amp(0);
    const vol = 0.05 + 0.12 * intensity;
    const env = new p5.Envelope();
    env.setADSR(0.05, 0.2, 0, 0.5);
    env.setRange(0, vol);
    env.play(noise);

    // Barrido de filtro según velocidad
    const sweep = new p5.Oscillator('sine');
    sweep.freq(0.6);
    sweep.amp(400);
    sweep.connect(filter.freq);
    nodes.push(sweep);

    this._cleanup(nodes, 900);
  }

  /* ---------- Acento defensivo (puño) ---------- */

  playFistSting() {
    if (this.muted || !this.active) return;
    const now = this._now();
    if (now - this.lastFist < 1000) return;
    this.lastFist = now;

    const nodes = [];

    // Glissando descendente rápido (200 → 60 Hz)
    const sting = new p5.Oscillator('sawtooth');
    sting.freq([200, 55], 0.18);
    sting.amp(0);
    sting.connect(this.sfxGain);
    nodes.push(sting);
    const stingEnv = new p5.Envelope();
    stingEnv.setADSR(0.02, 0.08, 0, 0.25);
    stingEnv.setRange(0, 0.25);
    stingEnv.play(sting);

    // Burst metálico breve
    const m1 = new p5.Oscillator('sine');
    m1.freq(880);
    m1.amp(0);
    m1.connect(this.sfxGain);
    nodes.push(m1);
    const mEnv = new p5.Envelope();
    mEnv.setADSR(0.01, 0.03, 0, 0.15);
    mEnv.setRange(0, 0.12);
    mEnv.play(m1);

    this._cleanup(nodes, 600);
  }

  /* ---------- Sting por movimiento brusco ---------- */

  playSuddenSting(intensity = 1) {
    if (this.muted || !this.active) return;
    const now = this._now();
    if (now - this.lastSudden < 600) return;
    this.lastSudden = now;

    const nodes = [];
    const osc = new p5.Oscillator('triangle');
    osc.freq([800, 300], 0.12);
    osc.amp(0);
    osc.connect(this.sfxGain);
    nodes.push(osc);
    const env = new p5.Envelope();
    env.setADSR(0.02, 0.1, 0, 0.25);
    env.setRange(0, 0.18 * intensity);
    env.play(osc);

    const noise = new p5.Noise('white');
    const filter = new p5.Filter('bandpass', 1500, 3);
    noise.disconnect();
    noise.connect(filter);
    filter.connect(this.sfxGain);
    nodes.push(noise, filter);
    noise.amp(0);
    const nEnv = new p5.Envelope();
    nEnv.setADSR(0.01, 0.05, 0, 0.1);
    nEnv.setRange(0, 0.1 * intensity);
    nEnv.play(noise);

    this._cleanup(nodes, 700);
  }

  /* ---------- Ambiente continuo ---------- */

  startAmbient() {
    if (this.muted || !this.active || this.ambientPlaying) return;
    this.ambientPlaying = true;
    this.ambientTargetVol = this.ambientVol;

    // Drone bajo evolutivo (dos senos cercanos → batimiento disonante)
    this.ambientOsc1 = new p5.Oscillator('sine');
    this.ambientOsc1.freq(58);
    this.ambientOsc1.amp(0);
    this.ambientOsc1.connect(this.ambientGain);

    this.ambientOsc2 = new p5.Oscillator('sine');
    this.ambientOsc2.freq(64); // disonancia sutil
    this.ambientOsc2.amp(0);
    this.ambientOsc2.connect(this.ambientGain);

    // LFO lento en frecuencia del drone 1
    const lfo = new p5.Oscillator('sine');
    lfo.freq(0.05);
    lfo.amp(4);
    lfo.connect(this.ambientOsc1.freq);

    // Ruido filtrado lento
    this.ambientNoise = new p5.Noise('brown');
    this.ambientFilter = new p5.Filter('lowpass', 400, 3);
    this.ambientNoise.disconnect();
    this.ambientNoise.connect(this.ambientFilter);
    this.ambientFilter.connect(this.ambientGain);
    this.ambientNoise.amp(0);

    const nodes = [this.ambientOsc1, this.ambientOsc2, this.ambientNoise, this.ambientFilter, lfo];

    // Fade in
    const env1 = new p5.Envelope();
    env1.setADSR(2, 0, 0, 0);
    env1.setRange(0, 0.03);
    env1.play(this.ambientOsc1);

    const env2 = new p5.Envelope();
    env2.setADSR(2, 0, 0, 0);
    env2.setRange(0, 0.025);
    env2.play(this.ambientOsc2);

    const nEnv = new p5.Envelope();
    nEnv.setADSR(2, 0, 0, 0);
    nEnv.setRange(0, 0.015);
    nEnv.play(this.ambientNoise);
  }

  stopAmbient() {
    if (!this.ambientPlaying) return;
    this.ambientPlaying = false;
    this.ambientTargetVol = 0;

    const fadeOut = () => {
      if (this.ambientOsc1) { this.ambientOsc1.amp(0, 1.5); }
      if (this.ambientOsc2) { this.ambientOsc2.amp(0, 1.5); }
      if (this.ambientNoise) { this.ambientNoise.amp(0, 1.5); }
      setTimeout(() => {
        if (this.ambientOsc1) { try { this.ambientOsc1.dispose(); } catch (e) {} this.ambientOsc1 = null; }
        if (this.ambientOsc2) { try { this.ambientOsc2.dispose(); } catch (e) {} this.ambientOsc2 = null; }
        if (this.ambientNoise) { try { this.ambientNoise.dispose(); } catch (e) {} this.ambientNoise = null; }
        if (this.ambientFilter) { try { this.ambientFilter.dispose(); } catch (e) {} this.ambientFilter = null; }
      }, 2000);
    };
    fadeOut();
  }

  updateAmbient() {
    if (!this.ambientPlaying) return;
    // Suave interpolación del volumen ambiente actual
    const step = (this.ambientTargetVol - this.ambientCurrentVol) * 0.05;
    this.ambientCurrentVol += step;
    if (this.ambientGain) this.ambientGain.amp(this.ambientCurrentVol, 0.1);
  }
}

// Instancia global para el sketch
const soundManager = new SoundManager();
