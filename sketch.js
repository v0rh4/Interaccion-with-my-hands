/**
 * sketch.js — Orquestación de la experiencia: cámara, modelo de manos y render.
 *
 * Flujo (spec.md §8): preload (crea handPose) → setup (canvas, video, detectStart)
 * → gotHands (guarda resultados) → draw (video espejo → actualizar cuerdas → render).
 *
 * Modo instancia de p5 (`new p5(esquema)`) para no ensuciar el scope global (RNF-03).
 */

/** Parámetros ajustables (spec.md §8). */
const CONFIG = {
  video: {
    ancho: 640,
    alto: 480,
    facingMode: 'user'
  },
  modelo: {
    // DECISIÓN: 'mediapipe' en vez del default 'tfjs' de ml5 v1, porque entrega
    // los keypoints ya en píxeles del video y la etiqueta 'Left'/'Right'.
    runtime: 'mediapipe',
    maxHands: 2,
    // 'lite' carga menos assets (más liviano); 'full' es más preciso.
    modelType: 'full',
    // DECISIÓN: el espejado se hace al dibujar (espejo + x invertida), no acá.
    flipHorizontal: false
  },
  suavizado: 0.35,          // lerp de los keypoints (RNF-02, rango 0.3-0.5)
  factorVelocidad: 0.4,     // promediado de la velocidad por punta
  saltoMaximo: 0.15,        // salto máximo (fracción de la diagonal) antes de reiniciar el suavizado
  gravedad: 0.55,           // px por frame² (péndulo de la araña)
  amortiguacion: 0.985,     // retención de velocidad del Verlet
  segmentos: 15,            // 12 a 20 segmentos por cuerda (RF-03)
  longitudHilo: 150,        // longitud base del hilo en píxeles
  iteracionesConstraint: 10, // vueltas del solver de constraints (cuerda firme)
  graciaCuerda: 30,          // frames que se conserva la cuerda si la mano se pierde (evita parpadeo)
  tamanoAraña: 1.0,          // escala base de la araña (con variación ±15 % por dedo)
  factorCurl: 0.55,          // fracción del hilo que se acorta con el curl máximo (RF-06)
  velocidadAgitacion: 900,   // px/s a partir de la cual la araña se agita (RF-07)
  amortiguacionVelo: 0.012,   // amortiguación que se le quita al mover rápido (más oscilación)
  duracionCaida: 1.0,        // segundos de la caída con desvanecimiento (RF-08)
  calidad: {
    halo: true,          // halo del hilo
    brillo: true,        // brillo especular de la araña
    minimoFps: 30,       // por debajo de esto se baja la calidad (RNF-01)
    ventana: 90          // frames para medir el promedio
  },
  gestos: {
    // Fase 2 · Bloque 1: reconocimiento de gestos.
    umbralExtendido: 0.42,   // curl por debajo de esto = dedo estirado
    umbralDoblado: 0.58,     // curl por encima de esto = dedo doblado
    umbralPellizco: 0.42,    // distancia pulgar-índice / tamaño de la mano
    framesEstables: 2        // frames para confirmar un gesto (evita parpadeo)
  },
  audio: {
    umbralCreak: 200,    // px/s para que un dedo enseñe la seda
    umbralSkitter: 900,  // px/s para el pataleo rápido
    umbralSting: 1500,   // px/s para el movimiento brusco
    umbralBalanceo: 130, // px/s del balanceo para el whoosh
    umbralPuño: 0.62,    // curl medio para considerar un puño
    duracionPista: 9000  // ms que dura la pista inicial
  },
  debug: {
    radioPunta: 11,
    radioArticulacion: 6,
    alfaEsqueleto: 150
  }
};

const esquema = (p) => {
  // ---- Estado interno del sketch ----
  let modelo = null;            // instancia de ml5 handPose
  let video = null;             // p5.MediaElement de la webcam
  let resultados = [];          // últimos resultados crudos de ml5
  let modeloListo = false;
  let videoListo = false;
  let deteccionIniciada = false;
  let webglDisponible = true;   // si el navegador puede crear un contexto WebGL
  let mostrarDebug = false;     // tecla D
  let ultimoUpdateInfo = 0;
  let ultimoMedidoFps = 0;
  let calidadReducida = false;
  let pistaOculta = false;
  let vineta = null;

  const seguimiento = new Mano.Seguimiento();  // suavizado, curl y velocidad
  const reconocedor = new Mano.Gestos();       // gestos por mano (Fase 2)
  const colgantes = new Map();                  // clave: 'handedness-indiceDedo' → {cuerda, araña}
  const variacionHilo = [1, 1, 1, 1, 1];       // ±15 % por dedo (RF-10)
  const variacionAraña = [1, 1, 1, 1, 1];      // ±15 % por dedo (RF-10)
  const faseAraña = [0, 0, 0, 0, 0];           // fase de animación propia por dedo (RF-10)

  const sonido = new SoundManager();            // audio procedural (spec §15)
  const eventos = {                             // estado para disparar sonidos
    manosPrevias: 0,
    apertura: 0
  };

  p.preload = () => {
    // DECISIÓN: la detección de manos de ml5 (MediaPipe Hands) necesita WebGL.
    // Si el navegador lo tiene deshabilitado, se avisa con un mensaje claro en
    // vez de dejar que MediaPipe reviente con "Failed to create WebGL context".
    if (!hayWebGL()) {
      webglDisponible = false;
      return;
    }
    // ml5 v1: handPose() devuelve la instancia de inmediato; el modelo se carga
    // en background y `modelo.ready` avisa cuando terminó.
    modelo = ml5.handPose('MediaPipeHands', CONFIG.modelo);
  };

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight).parent('sketch');
    p.pixelDensity(1); // menos fill-rate = más FPS (RNF-01)
    p.frameRate(60);

    // Sonda para los tests automatizados: expone el estado de los colgantes.
    p.colgantes = colgantes;
    p.seguimiento = seguimiento;

    // Cada dedo con su propio largo de hilo, tamaño y fase (RF-10).
    for (let i = 0; i < variacionHilo.length; i++) {
      variacionHilo[i] = 1 + (Math.random() * 0.3 - 0.15);
      variacionAraña[i] = 1 + (Math.random() * 0.3 - 0.15);
      faseAraña[i] = Math.random() * Math.PI * 2;
    }

    conectarAudio();

    // La pista inicial se desvanece sola si la cámara no encuentra la mano.
    setTimeout(ocultarPista, CONFIG.audio.duracionPista);

    if (webglDisponible) {
      setEstado('Cargando modelo…', 'Preparando el detector de manos…');
      esperarModelo();
    } else {
      setEstado(
        'WebGL deshabilitado',
        'La detección de manos (ml5 + MediaPipe) necesita WebGL y este navegador lo tiene deshabilitado. '
        + 'En Firefox: abrí about:config y poné webgl.force-enabled = true (o webgl.disabled = false), '
        + 'después recargá la página. También podés abrirla en Chrome o Edge, que traen WebGL activo.',
        true
      );
    }

    iniciarCamara();
  };

  p.draw = () => {
    const dt = Math.max(0.001, p.deltaTime / 1000);
    const mapa = crearMapa();
    const manos = seguimiento.actualizar(resultados, mapa, dt, {
      suavizado: CONFIG.suavizado,
      factorVelocidad: CONFIG.factorVelocidad,
      saltoMaximo: CONFIG.saltoMaximo
    });

    // Fase 2 · Bloque 1: gesto de cada mano.
    const gestos = detectarGestos(manos);

    actualizarColgantes(manos, dt);
    actualizarSonido(manos, gestos);

    dibujarFondo(p);
    dibujarVineta(p);
    dibujarColgantes(p);
    if (mostrarDebug) dibujarDebug(p, manos, gestos);
    actualizarInfo(p, manos, gestos);
    medirRendimiento(p);
  };

  p.keyPressed = () => {
    if (p.key === 'd' || p.key === 'D') mostrarDebug = !mostrarDebug;
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    vineta = null;
  };

  // ---------------------------------------------------------------- modelo ---

  function esperarModelo() {
    if (!modelo) {
      setEstado('Error', 'No se pudo crear el modelo de manos (ml5).', true);
      return;
    }
    Promise.resolve(modelo.ready)
      .then(() => {
        modeloListo = true;
        setEstado('Muestra tu mano', 'Cámara y modelo listos.');
        quizasIniciar();
      })
      .catch((err) => {
        setEstado(
          'Error al cargar el modelo',
          'No se pudo inicializar el detector de manos (' + mensajeError(err) + '). '
          + 'Si tu navegador tiene WebGL deshabilitado, activá webgl.force-enabled en about:config '
          + 'y recargá la página.',
          true
        );
      });
  }

  // --------------------------------------------------------------- cámara ---

  async function iniciarCamara() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setEstado('Cámara no disponible', 'Este navegador no expone getUserMedia. Probá con Chrome, Edge o Firefox en localhost.', true);
      return;
    }

    // DECISIÓN: primero un getUserMedia de diagnóstico. Si el permiso se deniega
    // terminate acá con un mensaje claro (RNF-05) y ni se abre la captura.
    try {
      const prueba = await navigator.mediaDevices.getUserMedia({ video: true });
      prueba.getTracks().forEach((t) => t.stop());
    } catch (err) {
      setEstado('Permiso de cámara denegado', mensajeCamara(err), true);
      return;
    }

    // Ojo: en modo instancia `VIDEO` no es global, se toma de la instancia (p.VIDEO).
    video = p.createCapture(p.VIDEO, {
      video: {
        width: CONFIG.video.ancho,
        height: CONFIG.video.alto,
        facingMode: CONFIG.video.facingMode
      }
    });
    video.hide();

    video.elt.addEventListener('loadeddata', () => {
      videoListo = true;
      quizasIniciar();
    }, { once: true });
  }

  // ------------------------------------------------------------ detección ---

  function quizasIniciar() {
    if (deteccionIniciada || !modeloListo || !videoListo) return;
    deteccionIniciada = true;

    try {
      // ml5 v1: detectStart(elemento de video, callback) — loop continuo (RNF-04).
      // ml5 developmenta el p5.MediaElement y usa su <video> real.
      modelo.detectStart(video, (manosDetectadas) => {
        resultados = manosDetectadas || [];
      });
      ocultarEstado();
    } catch (err) {
      setEstado('Error al iniciar la detección', mensajeError(err), true);
    }
  }

  // --------------------------------------------------------------- gestos ---

  /**
   * Gesto de cada mano (Fase 2, Bloque 1).
   *
   * El umbral del puño es el mismo que ya usaba el audio
   * (CONFIG.audio.umbralPuño), así el gesto y el sonido no se contradicen.
   */
  function detectarGestos(manos) {
    return reconocedor.actualizar(manos, {
      umbralExtendido: CONFIG.gestos.umbralExtendido,
      umbralDoblado: CONFIG.gestos.umbralDoblado,
      umbralPellizco: CONFIG.gestos.umbralPellizco,
      umbralPuno: CONFIG.audio.umbralPuño,
      framesEstables: CONFIG.gestos.framesEstables
    });
  }

  // --------------------------------------------------------------- cuerdas ---

  /** Mapa de coordenadas video→canvas para el frame actual. */
  function crearMapa() {
    const anchoVideo = video && video.elt ? video.elt.videoWidth : CONFIG.video.ancho;
    const altoVideo = video && video.elt ? video.elt.videoHeight : CONFIG.video.alto;
    return Mano.crearMapa(anchoVideo, altoVideo, p.width, p.height);
  }

  /**
   * Ancla una cuerda por punta de dedo, crea la araña que cuelga de ella y
   * actualiza ambas. Clave: 'handedness-indiceDedo' (spec.md §8).
   */
  function actualizarColgantes(manos, dt) {
    const activas = new Set();

    for (const mano of manos) {
      for (const punta of mano.puntas) {
        const clave = mano.handedness + '-' + punta.indice;
        activas.add(clave);

        let colgante = colgantes.get(clave);
        if (!colgante) {
          colgante = crearColgante(punta);
          colgantes.set(clave, colgante);
        } else if (colgante.soltada) {
          // La mano volvió: la araña se vuelve a enganchar (RF-08).
          // Se le cambia el hilo por uno nuevo para que no dé un tirón.
          colgante.cuerda = new Rope(
            punta.x,
            punta.y,
            CONFIG.longitudHilo * variacionHilo[punta.indice],
            CONFIG.segmentos
          );
          colgante.soltada = false;
          colgante.opacidad = 1;
          colgante.araña.opacidad = 1;
        }

        // T7: el curl acorta el hilo y la araña sube; al extender, baja (RF-06).
        const largo = CONFIG.longitudHilo * variacionHilo[punta.indice]
          * (1 - CONFIG.factorCurl * punta.curl);
        colgante.cuerda.setLength(largo);

        // T7: al mover rápido la araña oscila más (menos amortiguación) y se agita.
        const agitacion = Math.min(1, punta.velocidad / CONFIG.velocidadAgitacion);
        const amortiguacion = CONFIG.amortiguacion - CONFIG.amortiguacionVelo * agitacion;

        colgante.cuerda.pin(punta.x, punta.y);
        colgante.cuerda.update(CONFIG.gravedad, amortiguacion, CONFIG.iteracionesConstraint);
        colgante.cuerda.frame = p.frameCount;

        // Velocidad del extremo libre: sirve para el whoosh del balanceo.
        const fin = colgante.cuerda.endPoint();
        if (colgante.finX === undefined) {
          colgante.finX = fin.x;
          colgante.finY = fin.y;
        }
        colgante.velocidadBalanceo = Math.hypot(fin.x - colgante.finX, fin.y - colgante.finY) / dt;
        colgante.finX = fin.x;
        colgante.finY = fin.y;

        // La araña cuelga del extremo libre y gira con el último segmento (S20).
        colgante.araña.update(fin, colgante.cuerda.endAngle(), punta.velocidad);
      }
    }

    // Lo que no está: primero se espera un poco (por si la detección pierde un
    // frame), después la araña se suelta, cae y se desvanece (RF-08).
    for (const [clave, colgante] of colgantes) {
      if (activas.has(clave)) continue;

      const ausentes = p.frameCount - colgante.cuerda.frame;
      if (ausentes <= CONFIG.graciaCuerda) continue;

      if (!colgante.soltada) {
        colgante.soltada = true;
        colgante.cuerda.soltar();
        colgante.caida = 0;
      }

      colgante.caida += dt;
      const avance = Math.min(1, colgante.caida / CONFIG.duracionCaida);
      colgante.opacidad = 1 - avance;
      colgante.araña.opacidad = colgante.opacidad;

      // Cae con gravedad (un poco más rápido al principio) y sin ancla.
      colgante.cuerda.update(
        CONFIG.gravedad * (1 + avance * 1.5),
        CONFIG.amortiguacion,
        CONFIG.iteracionesConstraint
      );
      colgante.araña.update(
        colgante.cuerda.endPoint(),
        colgante.cuerda.endAngle(),
        0
      );

      if (avance >= 1) colgantes.delete(clave);
    }
  }

  /** Crea el par {cuerda, araña} para una punta de dedo. */
  function crearColgante(punta) {
    const cuerda = new Rope(
      punta.x,
      punta.y,
      CONFIG.longitudHilo * variacionHilo[punta.indice],
      CONFIG.segmentos
    );
    const araña = new Spider({
      tamano: CONFIG.tamanoAraña * variacionAraña[punta.indice],
      fase: faseAraña[punta.indice],
      p: p
    });
    return { cuerda: cuerda, araña: araña, soltada: false, opacidad: 1, caida: 0, velocidadBalanceo: 0 };
  }

  // ---------------------------------------------------------------- audio ---

  /** Conecta los controles de la interfaz con el gestor de sonido. */
  function conectarAudio() {
    const boton = document.getElementById('activar-sonido');
    if (boton) {
      boton.addEventListener('click', () => {
        if (sonido.activo) return;
        if (sonido.iniciar(p)) {
          boton.classList.add('activo');
          boton.textContent = 'Sonido activo';
          boton.disabled = true;
          if (eventos.manosPrevias > 0) sonido.ambienteEntra();
        } else {
          setEstado('Audio no disponible', 'El navegador no dejó iniciar el audio. Probá con Chrome o Edge.', true);
        }
      });
    }

    const slider = (id, valorId, aplicar) => {
      const el = document.getElementById(id);
      const salida = document.getElementById(valorId);
      if (!el) return;
      const actualizar = () => {
        const v = parseFloat(el.value);
        if (salida) salida.textContent = String(Math.round(v * 100));
        aplicar(v);
      };
      el.addEventListener('input', actualizar);
      actualizar();
    };

    slider('vol-maestro', 'vol-maestro-valor', (v) => sonido.setVolumenMaestro(v));
    slider('vol-sfx', 'vol-sfx-valor', (v) => sonido.setVolumenSfx(v));
    slider('vol-ambiente', 'vol-ambiente-valor', (v) => sonido.setVolumenAmbiente(v));

    const mute = document.getElementById('mute');
    if (mute) {
      mute.addEventListener('change', () => {
        sonido.toggleMute();
        if (mute.checked !== sonido.mudo) mute.checked = sonido.mudo;
      });
    }

    // Si la pestaña suspende el audio, se intenta volver al primer plano.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) sonido.alVolverAVisible();
    });
  }

  /**
   * Traduce el estado de las manos en eventos de sonido (spec §15.3).
   */
  function actualizarSonido(manos, gestos) {
    if (!sonido.activo) return;

    // Aparición y desaparición (spec §15.2): una sola vez por evento.
    if (manos.length > 0 && eventos.manosPrevias === 0) {
      sonido.aparicion();
      sonido.ambienteEntra();
      ocultarPista();
    } else if (manos.length === 0 && eventos.manosPrevias > 0) {
      sonido.ambienteSale();
    }
    eventos.manosPrevias = manos.length;

    for (const mano of manos) {
      for (const punta of mano.puntas) {
        const v = punta.velocidad;
        if (v > CONFIG.audio.umbralCreak) {
          sonido.creak(Math.min(1, v / 900));
        }
        if (v > CONFIG.audio.umbralSkitter) {
          sonido.skitter(Math.min(1, v / 2200));
        }
        if (v > CONFIG.audio.umbralSting) {
          sonido.sting();
        }
      }
    }

    // Gesto nuevo (Fase 2, Bloque 1): un sonido por gesto, y sólo al cambiar.
    //
    // DECISIÓN: el sonido del puño pasa a dispararse desde el reconocedor de
    // gestos y no desde el curl medio. El detector exige que los cuatro dedos
    // largos estén doblados, así que el umbral queda más estricto que antes,
    // y el disparo es por mano (antes era global: con dos manos sólo sonaba
    // una vez).
    for (const g of gestos) {
      if (!g.cambio) continue;
      switch (g.gesto.id) {
        case 'puño': sonido.puño(); break;
        case 'abierta': sonido.whoosh(0.55); break;
        case 'pellizco': sonido.creak(0.5); break;
        case 'paz': sonido.skitter(0.45); break;
        case 'indice': sonido.skitter(0.3); break;
        default: break;
      }
    }

    // Tensión de la telaraña: sigue la apertura de los dedos (promediada).
    if (manos.length > 0) {
      let apertura = 0;
      for (const mano of manos) apertura += calcularApertura(mano);
      sonido.tensionTela(apertura / manos.length);
    } else {
      sonido.tensionTela(0);
    }

    // Balanceo de la araña: un whoosh grave.
    for (const colgante of colgantes.values()) {
      if (colgante.soltada) continue;
      if (colgante.velocidadBalanceo > CONFIG.audio.umbralBalanceo) {
        sonido.whoosh(Math.min(1, colgante.velocidadBalanceo / 600));
      }
    }
  }

  /**
   * Qué tan abiertos están los dedos: 0 = puño, 1 = mano abierta.
   * Se mide la distancia media entre puntas vecinas, dividida por el largo de
   * la mano (muñeca → nudillo del medio), así no depende de la escala.
   */
  function calcularApertura(mano) {
    const tips = mano.puntas;
    const muneca = mano.puntos[0];
    const nudillo = mano.puntos[9];
    if (!muneca || !nudillo || tips.length < 2) return 0;

    const referencia = Math.hypot(nudillo.x - muneca.x, nudillo.y - muneca.y) || 1;
    let suma = 0;
    for (let i = 1; i < tips.length; i++) {
      suma += Math.hypot(tips[i].x - tips[i - 1].x, tips[i].y - tips[i - 1].y);
    }
    const medio = suma / (tips.length - 1) / referencia;
    // Empírico: ~0.3 con el puño cerrado y ~0.8 con la mano abierta.
    return Math.max(0, Math.min(1, (medio - 0.4) / 0.45));
  }

  // --------------------------------------------------------------- render ---

  function dibujarFondo(p2) {
    p2.push();
    p2.translate(p2.width, 0);
    p2.scale(-1, 1); // espejo horizontal (RF-01)
    if (video && video.elt && video.elt.readyState >= 2) {
      p2.image(video, 0, 0, p2.width, p2.height);
    } else {
      p2.background(6, 5, 9);
    }
    p2.pop();

    // Oscurecer el video de fondo (RF-01).
    p2.noStroke();
    p2.fill(4, 2, 6, 200);
    p2.rect(0, 0, p2.width, p2.height);
  }

  /** Viñeta: oscurece los bordes para el clima de instalación (T9). */
  function dibujarVineta(p2) {
    if (!p2.drawingContext) return;
    const ctx = p2.drawingContext;
    if (!vineta || vineta.w !== p2.width || vineta.h !== p2.height) {
      const radio = Math.min(p2.width, p2.height) * 0.34;
      const grad = ctx.createRadialGradient(
        p2.width / 2, p2.height / 2, radio,
        p2.width / 2, p2.height / 2, Math.max(p2.width, p2.height) * 0.78
      );
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.62)');
      vineta = { w: p2.width, h: p2.height, grad: grad };
    }
    ctx.fillStyle = vineta.grad;
    ctx.fillRect(0, 0, p2.width, p2.height);
  }

  function dibujarColgantes(p2) {
    p2.push();
    // Primero los hilos y después las arañas, para que la araña quede encima
    // del hilo que la sostiene.
    for (const colgante of colgantes.values()) {
      colgante.cuerda.dibujar(p2, null, colgante.opacidad, CONFIG.calidad.halo);
    }
    for (const colgante of colgantes.values()) {
      colgante.araña.draw(p2);
    }
    p2.pop();
  }

  function dibujarDebug(p2, manos, gestos) {
    p2.push();
    for (const mano of manos) {
      const puntos = mano.puntos;

      // Esqueleto
      p2.stroke(140, 40, 55, CONFIG.debug.alfaEsqueleto);
      p2.strokeWeight(2);
      for (const par of Mano.CONEXIONES) {
        const a = puntos[par[0]];
        const b = puntos[par[1]];
        if (!a || !b) continue;
        p2.line(a.x, a.y, b.x, b.y);
      }

      // Los 21 keypoints; las 5 puntas en rojo (son los anclajes de las arañas).
      p2.noStroke();
      for (let i = 0; i < puntos.length; i++) {
        const esPunta = Mano.PUNTAS.indexOf(i) !== -1;
        p2.fill(esPunta ? p2.color(228, 70, 92) : p2.color(235, 230, 215));
        p2.circle(
          puntos[i].x,
          puntos[i].y,
          esPunta ? CONFIG.debug.radioPunta : CONFIG.debug.radioArticulacion
        );
      }

      // Curl y velocidad de cada punta.
      p2.textSize(11);
      p2.textAlign(p2.LEFT, p2.BOTTOM);
      for (const punta of mano.puntas) {
        p2.fill(228, 70, 92, 220);
        p2.text(
          Math.round(punta.curl * 100) + '%',
          punta.x + 9,
          punta.y - 6
        );
        p2.fill(150, 200, 255, 200);
        p2.text(
          Math.round(punta.velocidad),
          punta.x + 9,
          punta.y + 16
        );
      }

      // Gesto de la mano (Fase 2, Bloque 1), junto a la muñeca.
      const gesto = gestos ? gestos.find((g) => g.id === mano.handedness) : null;
      if (gesto && puntos[0]) {
        p2.textSize(13);
        p2.textAlign(p2.LEFT, p2.TOP);
        p2.fill(226, 176, 84, 230);
        p2.text(gesto.gesto.nombre, puntos[0].x + 12, puntos[0].y + 8);
      }
    }
    p2.pop();
  }

  function actualizarInfo(p2, manos, gestos) {
    if (p2.frameCount - ultimoUpdateInfo < 10) return;
    ultimoUpdateInfo = p2.frameCount;
    document.getElementById('info-manos').textContent = String(manos.length);
    document.getElementById('info-fps').textContent = String(Math.round(p2.frameRate()));
    document.getElementById('info-estado').textContent = estadoTexto(manos.length);
    document.getElementById('info-gesto').textContent = textoGesto(gestos);
  }

  /**
   * Nombre del gesto de la(s) mano(s) para el HUD (Fase 2, Bloque 1).
   * Con dos manos se listan los gestos distintos, separados por " / ".
   */
  function textoGesto(gestos) {
    if (!gestos || gestos.length === 0) return '—';
    const nombres = [];
    for (const g of gestos) {
      if (nombres.indexOf(g.gesto.nombre) === -1) nombres.push(g.gesto.nombre);
    }
    return nombres.join(' / ');
  }

  function estadoTexto(cantidad) {
    if (!webglDisponible) return 'sin webgl';
    if (!modeloListo) return 'cargando';
    if (cantidad === 0) return 'buscando mano';
    return cantidad === 1 ? '1 mano' : cantidad + ' manos';
  }

  /**
   * Si el promedio de FPS es bajo, se baja la calidad una sola vez (T9):
   * sin halo en el hilo y sin brillo especular.
   */
  function medirRendimiento(p2) {
    if (calidadReducida) return;
    if (p2.frameCount - ultimoMedidoFps < CONFIG.calidad.ventana) return;
    ultimoMedidoFps = p2.frameCount;

    if (p2.frameRate() < CONFIG.calidad.minimoFps && p2.frameCount > 180) {
      calidadReducida = true;
      CONFIG.calidad.halo = false;
      CONFIG.calidad.brillo = false;
      Rope.haloActivado = false;
      Spider.brilloActivado = false;
      document.getElementById('info-estado').textContent = 'calidad reducida';
    }
  }

  // ----------------------------------------------------------------- DOM ---

  function setEstado(titulo, texto, esError) {
    document.getElementById('estado-titulo').textContent = titulo;
    document.getElementById('estado-texto').textContent = texto;
    document.getElementById('estado').classList.toggle('error', esError === true);
    document.getElementById('estado').classList.remove('oculto');
  }

  function ocultarEstado() {
    document.getElementById('estado').classList.add('oculto');
  }

  function ocultarPista() {
    if (pistaOculta) return;
    pistaOculta = true;
    document.getElementById('pista').classList.add('oculto');
  }
};

// ------------------------------------------------------------- utilidades ---

/**
 * ¿El navegador puede crear un contexto WebGL?
 *
 * MediaPipe Hands (el motor de ml5 para hand pose) necesita WebGL para subir
 * los frames a la GPU. Firefox, cuando WebGL está deshabilitado, no devuelve
 * null sino que LANZA una DOMException ("WebGL disabled"), así que el try/catch
 * es obligatorio: sin él, la app revienta antes de poder avisar nada.
 */
function hayWebGL() {
  try {
    const canvas = document.createElement('canvas');
    if (!window.WebGLRenderingContext) return false;
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch (err) {
    return false;
  }
}

function mensajeError(err) {
  if (!err) return 'error desconocido';
  return err.message || err.name || String(err);
}

function mensajeCamara(err) {
  const nombre = err && err.name ? err.name : '';
  if (nombre === 'NotAllowedError' || nombre === 'PermissionDeniedError') {
    return 'Permiso denegado. Habilitalo desde el candado de la barra de direcciones (o en los permisos del sitio) y recargá la página.';
  }
  if (nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError') {
    return 'No se encontró ninguna cámara conectada.';
  }
  if (nombre === 'NotReadableError' || nombre === 'TrackStartError') {
    return 'La cámara está siendo usada por otra aplicación. Cerrá la otra pestaña y recargá.';
  }
  return 'No se pudo abrir la cámara (' + (nombre || 'error desconocido') + '). Revisá el permiso y recargá la página.';
}

new p5(esquema);
