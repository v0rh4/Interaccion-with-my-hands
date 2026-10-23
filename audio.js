/**
 * audio.js — Sonidos procedurales de la Fase 3 (Bloque 7, tareas 25-26).
 *
 * RF-70: el navegador bloquea el audio hasta que hay un gesto del usuario, así
 *        que `iniciar()` se llama con el primer clic o la primera tecla (y usa
 *        `userStartAudio()` de p5.sound). Sin eso, todo funciona sin sonido.
 * RF-71: `M` silencia y `+`/`-` mueven el volumen maestro, con un limitador
 *        (compresor) para que nunca sature.
 * RF-73: los nodos se crean UNA vez y se reutilizan; los sonidos se controlan
 *        con volumen y parámetros, no creando nodos por evento ni por frame.
 * RF-74: límite de voces simultáneas para no saturar.
 * RF-75: API simple: `Audio.colorChime(i)`, `Audio.hide()`, `Audio.launch()`
 *        (y en los bloques siguientes `frenzyStart/Update/End`, `webShot`,
 *        `monsterOn/Roar/Off`).
 * RF-72: la campanita del cambio de color son 2-3 notas ascendentes y el tono
 *        depende del índice de la paleta.
 *
 * DECISIÓN: si el `SoundManager` de las fases anteriores ya está activo (el
 * botón ACTIVATE SOUND), este módulo cuelga su salida del bus de efectos que ya
 * existe: así el volumen y el silencio de esa interfaz mandan sobre todo y no
 * quedan dos mezclas peleándose. Si no está activo, arma su propia cadena
 * (sfx → limitador → maestro) con el mismo contexto de p5.sound.
 */
const Audio = (() => {
  const porDefecto = { masterVolume: 0.8, maxVoces: 4 };

  let ctx = null;
  let maestro = null;
  let sfx = null;
  let gestor = null;          // SoundManager de las fases anteriores, si está
  let iniciado = false;
  let mudo = false;
  let volumen = porDefecto.masterVolume;
  let voces = 0;
  let salida = null;
  let fuenteRuido = null;
  let filtroRuido = null;
  let gananciaRuido = null;
  let osciPop = null;
  let gananciaPop = null;

  /** ¿El audio ya arrancó con un gesto del usuario? (RF-70) */
  function activo() {
    return iniciado;
  }

  /** 'inactivo' | 'activo' | 'silenciado' (RF-71). */
  function estado() {
    if (!iniciado) return 'inactivo';
    return mudo ? 'silenciado' : 'activo';
  }

  /** Voces simultáneas en curso (RF-74). */
  function vocesActivas() {
    return voces;
  }

  /** Ocupa una voz si hay lugar (RF-74). */
  function ocuparVoz() {
    if (voces >= modulo.maxVoces) return false;
    voces++;
    // Cada voz se libera sola: es un contador, no un nodo de audio.
    setTimeout(() => { voces = Math.max(0, voces - 1); }, 220);
    return true;
  }

  /** Envolvente corta sobre un parámetro de ganancia (sin clics). */
  function envolvente(ganancia, pico, cuando, duracion) {
    if (!ganancia) return;
    const g = ganancia.gain;
    g.setValueAtTime(0.0001, cuando);
    g.linearRampToValueAtTime(pico, cuando + 0.012);
    g.exponentialRampToValueAtTime(0.0001, cuando + (duracion || 0.2));
  }

  /**
   * Arranca el audio. Se llama con el primer gesto del usuario (RF-70).
   *
   * @param {p5}     p       instancia de p5 (para el contexto de p5.sound)
   * @param {object} gestorSonido SoundManager de las fases anteriores (opcional)
   * @returns {boolean} si quedó andando
   */
  function iniciar(p, gestorSonido) {
    if (iniciado) return true;

    // RF-70: el navegador necesita un gesto real; p5.sound lo resuelve.
    try {
      if (p && typeof p.userStartAudio === 'function') p.userStartAudio();
    } catch (e) { /* todavía sin gesto: se sigue sin sonido */ }

    gestor = (gestorSonido && gestorSonido.activo) ? gestorSonido : null;
    ctx = (gestor && gestor.ctx) || (p && p.soundOut ? p.soundOut.audiocontext : null);
    if (!ctx) return false;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume();

    // El limitador es siempre propio: la mezcla de la Fase 3 no satura (RF-71).
    const limitador = ctx.createDynamicsCompressor();
    limitador.threshold.value = -6;
    limitador.knee.value = 0;
    limitador.ratio.value = 20;
    limitador.attack.value = 0.003;
    limitador.release.value = 0.25;
    modulo.limitador = limitador;

    if (gestor) {
      // Se cuelga del bus de efectos existente (DECISIÓN de arriba).
      sfx = gestor.sfx;
      maestro = gestor.maestro;
      limitador.connect(sfx);
    } else {
      const destino = (p && p.soundOut && p.soundOut.output) || ctx.destination || ctx;
      maestro = ctx.createGain();
      maestro.gain.value = volumen;
      maestro.connect(limitador);
      limitador.connect(destino);
      sfx = ctx.createGain();
      sfx.gain.value = 1;
      sfx.connect(maestro);
    }
    salida = limitador;

    crearVoces();
    iniciado = true;
    return true;
  }

  /** Crea una sola vez los nodos que después se reutilizan (RF-73). */
  function crearVoces() {
    // --- Campanita: tres senos que quedan andando y suenan con la envolvente ---
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      osc.connect(g);
      g.connect(salida);
      osc.start();
      modulo.osciladoresChime.push(osc);
      gananciasChime.push(g);
    }

    // --- Roce de patitas: ruido filtrado reutilizable ---
    fuenteRuido = ctx.createBufferSource();
    fuenteRuido.buffer = bufferRuido(0.5);
    fuenteRuido.loop = true;
    filtroRuido = ctx.createBiquadFilter();
    filtroRuido.type = 'bandpass';
    filtroRuido.frequency.value = 2600;
    filtroRuido.Q.value = 1.2;
    gananciaRuido = ctx.createGain();
    gananciaRuido.gain.value = 0.0001;
    fuenteRuido.connect(filtroRuido);
    filtroRuido.connect(gananciaRuido);
    gananciaRuido.connect(salida);
    fuenteRuido.start();

    // --- Pop del lanzamiento: un triángulo con caída de tono ---
    osciPop = ctx.createOscillator();
    osciPop.type = 'triangle';
    gananciaPop = ctx.createGain();
    gananciaPop.gain.value = 0.0001;
    osciPop.connect(gananciaPop);
    gananciaPop.connect(salida);
    osciPop.start();
  }

  /** Buffer de ruido de `duracion` segundos (se genera por código). */
  function bufferRuido(duracion) {
    const largo = Math.max(1, Math.floor((ctx.sampleRate || 44100) * duracion));
    const buffer = ctx.createBuffer(1, largo, ctx.sampleRate || 44100);
    const datos = buffer.getChannelData(0);
    for (let i = 0; i < largo; i++) datos[i] = Math.random() * 2 - 1;
    return buffer;
  }

  const gananciasChime = [];

  /**
   * Campanita cristalina del cambio de color (RF-72): 2-3 notas ascendentes y
   * el tono depende del índice de la paleta.
   */
  function colorChime(indice) {
    if (!iniciado || mudo) return;
    if (!ocuparVoz()) return;

    const i = Math.abs(Math.floor(indice || 0)) % 6;
    const base = 523.25 * Math.pow(2, i / 12);   // el tono sigue a la paleta
    const notas = [1, 1.25, 1.5];                // tercera y quinta arriba
    const ahora = ctx.currentTime;

    for (let n = 0; n < modulo.osciladoresChime.length; n++) {
      const osc = modulo.osciladoresChime[n];
      const g = gananciasChime[n];
      if (!osc || !g) continue;
      const cuando = ahora + n * 0.07;
      osc.frequency.setValueAtTime(base * notas[n], cuando);
      envolvente(g, 0.16, cuando, 0.24);
    }
    modulo.chimes++;
  }

  /** Roce suave de patitas al esconderse (RF-72, puño de la Fase 2). */
  function hide() {
    if (!iniciado || mudo) return;
    if (!ocuparVoz()) return;
    const ahora = ctx.currentTime;
    if (filtroRuido) filtroRuido.frequency.setValueAtTime(3200, ahora);
    if (fuenteRuido && fuenteRuido.playbackRate) fuenteRuido.playbackRate.setValueAtTime(1.4, ahora);
    envolvente(gananciaRuido, 0.05, ahora, 0.3);
  }

  /** Pop corto al lanzarse la araña (RF-72, puño de la Fase 2). */
  function launch() {
    if (!iniciado || mudo) return;
    if (!ocuparVoz()) return;
    const ahora = ctx.currentTime;
    if (!osciPop) return;
    osciPop.frequency.setValueAtTime(320, ahora);
    osciPop.frequency.exponentialRampToValueAtTime(120, ahora + 0.12);
    envolvente(gananciaPop, 0.14, ahora, 0.16);
  }

  /** `M`: silencia o reactiva (RF-71). Si hay SoundManager, manda él. */
  function toggleMute() {
    if (gestor) {
      gestor.toggleMute();
      mudo = !!gestor.mudo;
      return mudo;
    }
    mudo = !mudo;
    if (sfx && sfx.gain) sfx.gain.value = mudo ? 0 : 1;
    return mudo;
  }

  /** `+`/`-`: volumen maestro (RF-71). */
  function setVolumen(v) {
    volumen = Math.max(0, Math.min(1, v === undefined ? volumen : v));
    if (gestor && typeof gestor.setVolumenMaestro === 'function') {
      gestor.setVolumenMaestro(volumen);
      return volumen;
    }
    if (maestro && maestro.gain) maestro.gain.value = volumen;
    return volumen;
  }

  function volumenActual() {
    return volumen;
  }

  const modulo = {
    maxVoces: porDefecto.maxVoces,
    chimes: 0,
    osciladoresChime: [],
    limitador: null,
    iniciar: iniciar,
    colorChime: colorChime,
    hide: hide,
    launch: launch,
    toggleMute: toggleMute,
    setVolumen: setVolumen,
    volumen: volumenActual,
    estado: estado,
    activo: activo,
    vocesActivas: vocesActivas
  };

  /** Para los tests: deja el módulo como recién creado. */
  function reiniciar() {
    ctx = null;
    maestro = null;
    sfx = null;
    gestor = null;
    iniciado = false;
    mudo = false;
    volumen = porDefecto.masterVolume;
    voces = 0;
    salida = null;
    modulo.chimes = 0;
    modulo.osciladoresChime.length = 0;
    gananciasChime.length = 0;
    modulo.limitador = null;
    modulo.maxVoces = porDefecto.maxVoces;
  }

  modulo.reiniciar = reiniciar;

  return modulo;
})();
