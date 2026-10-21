/**
 * sound.js — Sistema de audio procedural Halloween.
 *
 * Todo el sonido se genera en tiempo real con la Web Audio API que expone
 * p5.sound.js (spec §15.4): osciladores, ruido filtrado, barridos de
 * frecuencia, envolventes, filtros y ganancias, delay y reverb. No hay
 * ningún archivo de audio.
 *
 * DECISIÓN: la síntesis se hace con los nodos nativos de Web Audio sobre el
 * AudioContext que provee p5.sound (p5.soundOut.audiocontext). Motivo: la
 * versión de p5.sound que se puede cargar por CDN junto al p5.js 1.11.3 es la
 * 1.0.1, y sus clases de alto nivel no permiten barridos de frecuencia ni
 * envolventes por nodo sin pelearse con la API. Con los nodos crudos el
 * control de envolvente es exacto (sin clics) y la limpieza de nodos es
 * explícita (spec §15.7).
 *
 * La reverb es un ConvolverNode con un impulso generado por código (ruido con
 * decaimiento exponencial): es espacial y no necesita archivos.
 */

class SoundManager {
  constructor() {
    this.activo = false;
    this.mudo = false;

    // Volúmenes (spec §15.7: ambientes y efectos por separado).
    this.volumenMaestro = 0.6;
    this.volumenSfx = 0.8;
    this.volumenAmbiente = 0.3;

    this.ctx = null;
    this.maestro = null;
    this.sfx = null;
    this.ambiente = null;
    this.reverb = null;
    this.envoltura = null;     // nodos de la cama ambiente
    this.tension = null;       // tono continuo de la telaraña
    this.ultimo = {};          // cooldowns por evento
    this.voces = 0;            // eventos simultáneos (tope)
    this.maxVoces = 6;
    this.ruidoBuffer = null;
  }

  // ------------------------------------------------------------- arranque ---

  /**
   * Inicializa el audio. Se llama desde el gesto del usuario (botón
   * "ACTIVATE SOUND"), nunca antes (spec §15.6).
   * @param {p5} p instancia de p5 (de ahí sale el AudioContext de p5.sound)
   * @returns {boolean} true si el audio quedó activo
   */
  iniciar(p) {
    if (this.activo) return true;

    const salida = p && p.soundOut;
    if (!salida || !salida.audiocontext) return false;

    this.ctx = salida.audiocontext;
    if (this.ctx.state === 'suspended' && this.ctx.resume) {
      this.ctx.resume();
    }

    // Grafo maestro: efectos y ambientes por separado, después el maestro.
    this.maestro = this.ctx.createGain();
    this.maestro.gain.value = this.volumenMaestro;

    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = this.volumenSfx;

    this.ambiente = this.ctx.createGain();
    this.ambiente.gain.value = 0;   // entra con un fade cuando aparece una araña

    this.sfx.connect(this.maestro);
    this.ambiente.connect(this.maestro);
    this.maestro.connect(salida.output);

    // Reverb con impulso generado por código (sin archivos).
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.impulso(2.6, 2.4);
    const mezclaReverb = this.ctx.createGain();
    mezclaReverb.gain.value = 0.55;
    this.reverb.connect(mezclaReverb);
    mezclaReverb.connect(this.maestro);

    this.ruidoBuffer = this.bufferRuido(2);
    this.activo = true;

    this.arrancarAmbiente();
    this.actualizarEstado();
    return true;
  }

  /** Estado para el indicador de la interfaz. */
  estado() {
    if (!this.activo) return 'inactivo';
    if (this.mudo) return 'silenciado';
    if (this.ctx && this.ctx.state === 'suspended') return 'suspendido';
    return 'activo';
  }

  // ------------------------------------------------------------- utilidades ---

  /** Impulso de reverberación: ruido con decaimiento exponencial. */
  impulso(duracion, decaimiento) {
    const tasa = this.ctx.sampleRate;
    const largo = Math.max(1, Math.floor(tasa * duracion));
    const buffer = this.ctx.createBuffer(2, largo, tasa);
    for (let canal = 0; canal < 2; canal++) {
      const datos = buffer.getChannelData(canal);
      for (let i = 0; i < largo; i++) {
        datos[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / largo, decaimiento);
      }
    }
    return buffer;
  }

  /** Buffer de ruido blanco reutilizable. */
  bufferRuido(duracion) {
    const tasa = this.ctx.sampleRate;
    const largo = Math.max(1, Math.floor(tasa * duracion));
    const buffer = this.ctx.createBuffer(1, largo, tasa);
    const datos = buffer.getChannelData(0);
    for (let i = 0; i < largo; i++) datos[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Envolvente de ganancia con rampas exponenciales: sin clics (spec §15.7). */
  envolvente(destino, ataque, decaimiento, pico, cuando) {
    const g = this.ctx.createGain();
    const t = cuando;
    const maximo = Math.max(0.0001, pico);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(maximo, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + decaimiento);
    g.connect(destino);
    return g;
  }

  /** Oscilador que se programa y se limpia solo. */
  oscilador(tipo, frecuencia, cuando, duracion, destino) {
    const osc = this.ctx.createOscillator();
    osc.type = tipo;
    osc.frequency.setValueAtTime(frecuencia, cuando);
    osc.connect(destino);
    osc.start(cuando);
    osc.stop(cuando + duracion + 0.05);
    osc.onended = () => {
      try { osc.disconnect(); } catch (e) { /* ya desconectado */ }
    };
    return osc;
  }

  /** Fuente de ruido con filtro, para suspiros, chasquidos y siseos. */
  ruidoFiltrado(tipo, frecuencia, q, cuando, duracion, pico, destino) {
    const fuente = this.ctx.createBufferSource();
    fuente.buffer = this.ruidoBuffer;
    fuente.loop = true;

    const filtro = this.ctx.createBiquadFilter();
    filtro.type = tipo;
    filtro.frequency.setValueAtTime(frecuencia, cuando);
    filtro.Q.value = q;

    const g = this.envolvente(destino, Math.min(0.02, duracion * 0.2), duracion, pico, cuando);

    fuente.connect(filtro);
    filtro.connect(g);
    fuente.start(cuando, Math.random() * 1.5);
    fuente.stop(cuando + duracion + 0.1);
    fuente.onended = () => {
      try { fuente.disconnect(); filtro.disconnect(); g.disconnect(); } catch (e) { /* ignorado */ }
    };
    return fuente;
  }

  /** ¿Se puede disparar un evento? (cooldown + tope de eventos simultáneos) */
  puede(clave, cooldownMs) {
    if (!this.activo || this.mudo) return false;
    const ahora = this.ctx.currentTime * 1000;
    // Ojo: la primera vez de cada evento tiene que pasar siempre. Si se usara 0
    // como valor inicial, con currentTime en 0 el cooldown la dejaría pasar.
    if (this.ultimo[clave] !== undefined && ahora - this.ultimo[clave] < cooldownMs) return false;
    if (this.voces >= this.maxVoces) return false;
    this.ultimo[clave] = ahora;
    return true;
  }

  /** Libera un slot de evento simultáneo. */
  liberar() {
    this.voces = Math.max(0, this.voces - 1);
  }

  // ----------------------------------------------------------------- voces ---

  /**
   * Aparición de la araña: un impacto de horror cinematográfico (spec §15.2).
   * Sub-bass drone + glissando descendente + susurro filtrado + acento
   * metálico y cola de reverb. Se dispara una sola vez por aparición.
   */
  aparicion() {
    if (!this.puede('aparicion', 1500)) return;
    const t = this.ctx.currentTime;
    this.voces++;

    // Sub-bass drone (40-60 Hz), ataque lento y cola larga.
    const drone = this.ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.setValueAtTime(48, t);
    drone.frequency.exponentialRampToValueAtTime(38, t + 1.6);
    const gDrone = this.envolvente(this.sfx, 0.4, 1.2, 0.55, t);
    drone.connect(gDrone);
    drone.start(t);
    drone.stop(t + 1.7);
    drone.onended = () => {
      try { drone.disconnect(); gDrone.disconnect(); } catch (e) { /* ignorado */ }
      this.liberar();
    };

    // Glissando de horror: sawtooth de 160 Hz a 38 Hz en 0.8 s.
    const gliss = this.ctx.createOscillator();
    gliss.type = 'sawtooth';
    gliss.frequency.setValueAtTime(160, t);
    gliss.frequency.exponentialRampToValueAtTime(38, t + 0.8);
    const gGliss = this.envolvente(this.sfx, 0.05, 0.75, 0.22, t);
    const filtroGliss = this.ctx.createBiquadFilter();
    filtroGliss.type = 'lowpass';
    filtroGliss.frequency.setValueAtTime(900, t);
    filtroGliss.frequency.exponentialRampToValueAtTime(220, t + 0.8);
    gliss.connect(filtroGliss);
    filtroGliss.connect(gGliss);
    gliss.start(t);
    gliss.stop(t + 0.9);
    gliss.onended = () => {
      try { gliss.disconnect(); filtroGliss.disconnect(); gGliss.disconnect(); } catch (e) { /* ignorado */ }
    };

    // Susurro fantasma: ruido con filtro y LFO lento sobre el corte.
    const susurro = this.ctx.createBufferSource();
    susurro.buffer = this.ruidoBuffer;
    susurro.loop = true;
    const filtroSusurro = this.ctx.createBiquadFilter();
    filtroSusurro.type = 'bandpass';
    filtroSusurro.frequency.value = 950;
    filtroSusurro.Q.value = 1.6;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.7;
    const lfoGanancia = this.ctx.createGain();
    lfoGanancia.gain.value = 420;
    lfo.connect(lfoGanancia);
    lfoGanancia.connect(filtroSusurro.frequency);
    const gSusurro = this.envolvente(this.sfx, 0.25, 1.3, 0.10, t);
    susurro.connect(filtroSusurro);
    filtroSusurro.connect(gSusurro);
    gSusurro.connect(this.reverb);
    susurro.start(t);
    lfo.start(t);
    susurro.stop(t + 1.7);
    lfo.stop(t + 1.7);
    susurro.onended = () => {
      try {
        susurro.disconnect(); filtroSusurro.disconnect();
        lfo.disconnect(); lfoGanancia.disconnect(); gSusurro.disconnect();
      } catch (e) { /* ignorado */ }
    };

    // Acento metálico: dos senos con tritono y caída corta.
    const gMetal = this.envolvente(this.sfx, 0.01, 0.35, 0.13, t + 0.05);
    gMetal.connect(this.reverb);
    this.oscilador('sine', 440, t + 0.05, 0.45, gMetal);
    this.oscilador('sine', 622.25, t + 0.05, 0.4, gMetal);
  }

  /**
   * Crujido de seda al mover un dedo (spec §15.3).
   * @param {number} intensidad 0..1 (volumen y altura)
   */
  creak(intensidad) {
    if (!this.puede('creak', 130)) return;
    const t = this.ctx.currentTime;
    this.voces++;
    const i = Math.max(0.05, Math.min(1, intensidad || 0.4));

    // Chasquido agudo y limpio.
    const g = this.envolvente(this.sfx, 0.004, 0.09, 0.10 * i, t);
    g.connect(this.reverb);
    this.oscilador('triangle', 1400 + i * 1800, t, 0.1, g);

    // Fricción de seda: ruido pasabanda muy corto.
    const filtro = this.ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.setValueAtTime(2200 + i * 2600, t);
    filtro.Q.value = 7;
    const gFric = this.envolvente(this.sfx, 0.005, 0.07, 0.07 * i, t);
    filtro.connect(gFric);
    const fuente = this.ctx.createBufferSource();
    fuente.buffer = this.ruidoBuffer;
    fuente.loop = true;
    fuente.connect(filtro);
    fuente.start(t, Math.random());
    fuente.stop(t + 0.12);
    fuente.onended = () => {
      try { fuente.disconnect(); filtro.disconnect(); gFric.disconnect(); } catch (e) { /* ignorado */ }
      this.liberar();
    };
  }

  /**
   * Pataleo rápido: una ráfaga de chasquidos secos (spec §15.3).
   */
  skitter(intensidad) {
    if (!this.puede('skitter', 420)) return;
    const t = this.ctx.currentTime;
    this.voces++;
    const i = Math.max(0.2, Math.min(1, intensidad || 0.6));
    const cantidad = 3 + Math.floor(i * 4);

    for (let n = 0; n < cantidad; n++) {
      const cuando = t + n * (0.022 + Math.random() * 0.03);
      const g = this.envolvente(this.sfx, 0.002, 0.035, 0.055 * i, cuando);
      g.connect(this.reverb);
      this.oscilador('square', 2600 + Math.random() * 1800, cuando, 0.05, g);
    }
    setTimeout(() => this.liberar(), 300);
  }

  /**
   * Tensión de la telaraña: tono fino y continuo que sigue la apertura de los
   * dedos (spec §15.3). Se atenúa cuando los dedos se relajan.
   * @param {number} apertura 0..1
   */
  tensionTela(apertura) {
    if (!this.activo || this.mudo) return;
    const t = this.ctx.currentTime;
    const a = Math.max(0, Math.min(1, apertura || 0));

    if (!this.tension) {
      // Se crea una sola vez y después se modula.
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 320;
      const filtro = this.ctx.createBiquadFilter();
      filtro.type = 'bandpass';
      filtro.frequency.value = 900;
      filtro.Q.value = 9;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      osc.connect(filtro);
      filtro.connect(g);
      g.connect(this.reverb);
      g.connect(this.sfx);
      osc.start(t);
      this.tension = { osc: osc, filtro: filtro, g: g };
    }

    const tel = this.tension;
    // La altura sigue la apertura: más estirada, más aguda.
    const frecuencia = 260 + a * 900;
    tel.osc.frequency.setTargetAtTime(frecuencia, t, 0.12);
    tel.filtro.frequency.setTargetAtTime(600 + a * 2200, t, 0.15);
    const nivel = a > 0.25 ? (a - 0.25) * 0.06 : 0;
    tel.g.gain.setTargetAtTime(nivel, t, 0.2);
  }

  /**
   * Whoosh del balanceo: un barrido grave de ruido (spec §15.3).
   * @param {number} intensidad 0..1
   */
  whoosh(intensidad) {
    if (!this.puede('whoosh', 260)) return;
    const t = this.ctx.currentTime;
    this.voces++;
    const i = Math.max(0.1, Math.min(1, intensidad || 0.4));

    const fuente = this.ctx.createBufferSource();
    fuente.buffer = this.ruidoBuffer;
    fuente.loop = true;

    const filtro = this.ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.setValueAtTime(260 + i * 500, t);
    filtro.frequency.exponentialRampToValueAtTime(90, t + 0.45);
    filtro.Q.value = 3;

    const g = this.envolvente(this.sfx, 0.08, 0.4, 0.12 * i, t);
    fuente.connect(filtro);
    filtro.connect(g);
    g.connect(this.reverb);
    fuente.start(t, Math.random());
    fuente.stop(t + 0.55);
    fuente.onended = () => {
      try { fuente.disconnect(); filtro.disconnect(); g.disconnect(); } catch (e) { /* ignorado */ }
      this.liberar();
    };
  }

  /**
   * Puño cerrado: acento defensivo de horror, corto (spec §15.3).
   * No se repite mientras el puño siga cerrado (lo controla el sketch).
   */
  puño() {
    if (!this.puede('puno', 700)) return;
    const t = this.ctx.currentTime;
    this.voces++;

    // Siseo de defensa.
    const fuente = this.ctx.createBufferSource();
    fuente.buffer = this.ruidoBuffer;
    fuente.loop = true;
    const filtro = this.ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.setValueAtTime(3400, t);
    filtro.frequency.exponentialRampToValueAtTime(900, t + 0.3);
    filtro.Q.value = 2.5;
    const gSiseo = this.envolvente(this.sfx, 0.01, 0.3, 0.16, t);
    fuente.connect(filtro);
    filtro.connect(gSiseo);
    gSiseo.connect(this.reverb);
    fuente.start(t, Math.random());
    fuente.stop(t + 0.35);
    fuente.onended = () => {
      try { fuente.disconnect(); filtro.disconnect(); gSiseo.disconnect(); } catch (e) { /* ignorado */ }
      this.liberar();
    };

    // Golpe grave con caída de tono.
    const gGolpe = this.envolvente(this.sfx, 0.006, 0.45, 0.30, t);
    gGolpe.connect(this.reverb);
    const golpe = this.ctx.createOscillator();
    golpe.type = 'sine';
    golpe.frequency.setValueAtTime(120, t);
    golpe.frequency.exponentialRampToValueAtTime(46, t + 0.4);
    golpe.connect(gGolpe);
    golpe.start(t);
    golpe.stop(t + 0.5);
    golpe.onended = () => {
      try { golpe.disconnect(); gGolpe.disconnect(); } catch (e) { /* ignorado */ }
    };
  }

  /**
   * Movimiento brusco: un sting inquietante y breve (spec §15.3).
   */
  sting() {
    if (!this.puede('sting', 750)) return;
    const t = this.ctx.currentTime;
    this.voces++;

    const g = this.envolvente(this.sfx, 0.012, 0.3, 0.14, t);
    g.connect(this.reverb);
    // Cluster disonante: dos quintas + semitono.
    this.oscilador('sawtooth', 523.25, t, 0.35, g);
    this.oscilador('sawtooth', 622.25, t, 0.3, g);
    this.oscilador('triangle', 1567, t, 0.18, g);
    setTimeout(() => this.liberar(), 400);
  }

  // ------------------------------------------------------------- ambiente ---

  /** Arranca la cama ambiente (spec §15.5). Arranca con ganancia 0. */
  arrancarAmbiente() {
    const t = this.ctx.currentTime;
    const drone = this.ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 55;
    const drone2 = this.ctx.createOscillator();
    drone2.type = 'sine';
    drone2.frequency.value = 55.4;   // casi un tritono: disonancia sutil
    const drone3 = this.ctx.createOscillator();
    drone3.type = 'sine';
    drone3.frequency.value = 82.5;

    const filtro = this.ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 320;
    filtro.Q.value = 1.2;

    // LFO lento sobre el corte: el drone respira.
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.06;
    const lfoGanancia = this.ctx.createGain();
    lfoGanancia.gain.value = 140;
    lfo.connect(lfoGanancia);
    lfoGanancia.connect(filtro.frequency);

    const gDrone = this.ctx.createGain();
    gDrone.gain.value = 0.16;
    drone.connect(filtro);
    drone2.connect(filtro);
    drone3.connect(filtro);
    filtro.connect(gDrone);
    gDrone.connect(this.ambiente);

    // Ruido filtrado muy suave, con el corte moviéndose despacio.
    const ruido = this.ctx.createBufferSource();
    ruido.buffer = this.ruidoBuffer;
    ruido.loop = true;
    const filtroRuido = this.ctx.createBiquadFilter();
    filtroRuido.type = 'bandpass';
    filtroRuido.frequency.value = 420;
    filtroRuido.Q.value = 0.9;
    const lfoRuido = this.ctx.createOscillator();
    lfoRuido.type = 'sine';
    lfoRuido.frequency.value = 0.04;
    const lfoRuidoGanancia = this.ctx.createGain();
    lfoRuidoGanancia.gain.value = 260;
    lfoRuido.connect(lfoRuidoGanancia);
    lfoRuidoGanancia.connect(filtroRuido.frequency);
    const gRuido = this.ctx.createGain();
    gRuido.gain.value = 0.07;
    ruido.connect(filtroRuido);
    filtroRuido.connect(gRuido);
    gRuido.connect(this.ambiente);

    drone.start(t);
    drone2.start(t);
    drone3.start(t);
    lfo.start(t);
    ruido.start(t);
    lfoRuido.start(t);

    this.envoltura = { drone: drone, drone2: drone2, drone3: drone3, ruido: ruido, lfo: lfo, lfoRuido: lfoRuido };
  }

  /** Entra la cama ambiente con un fade gradual (spec §15.5). */
  ambienteEntra() {
    if (!this.activo) return;
    this.ambiente.gain.setTargetAtTime(this.volumenAmbiente, this.ctx.currentTime, 1.2);
  }

  /** Sale la cama ambiente (cuando no queda ninguna araña). */
  ambienteSale() {
    if (!this.activo) return;
    this.ambiente.gain.setTargetAtTime(0, this.ctx.currentTime, 0.8);
  }

  // ------------------------------------------------------------- controles ---

  setVolumenMaestro(v) {
    this.volumenMaestro = v;
    if (this.maestro) this.maestro.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setVolumenSfx(v) {
    this.volumenSfx = v;
    if (this.sfx) this.sfx.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setVolumenAmbiente(v) {
    this.volumenAmbiente = v;
    if (this.ambiente && this.ambiente.gain.value > 0.001) {
      this.ambiente.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
    }
  }

  toggleMute() {
    this.mudo = !this.mudo;
    if (this.activo) {
      this.maestro.gain.setTargetAtTime(this.mudo ? 0 : this.volumenMaestro, this.ctx.currentTime, 0.05);
    }
    this.actualizarEstado();
    return this.mudo;
  }

  /** Actualiza el indicador de estado de la interfaz. */
  actualizarEstado() {
    const el = document.getElementById('estado-audio');
    if (!el) return;
    const texto = this.estado();
    el.textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
    el.className = texto === 'activo' ? 'ok' : (texto === 'inactivo' ? '' : 'warn');
  }

  /** Si la pestaña se suspende el audio, se intenta volver al volver. */
  alVolverAVisible() {
    if (this.activo && this.ctx && this.ctx.state === 'suspended' && this.ctx.resume) {
      this.ctx.resume();
      this.actualizarEstado();
    }
  }
}
