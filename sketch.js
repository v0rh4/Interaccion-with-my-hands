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
  let webglDisponible = true;  // si el navegador puede crear un contexto WebGL
  let mostrarDebug = false;     // tecla D
  let ultimoUpdateInfo = 0;

  const seguimiento = new Mano.Seguimiento();  // suavizado, curl y velocidad
  const cuerdas = new Map();                    // clave: 'handedness-indiceDedo'
  const variacionHilo = [1, 1, 1, 1, 1];       // ±15 % por dedo (RF-10)

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

    // Cada dedo con su propio largo de hilo (RF-10).
    for (let i = 0; i < variacionHilo.length; i++) {
      variacionHilo[i] = 1 + (Math.random() * 0.3 - 0.15);
    }

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
    const dt = p.deltaTime / 1000;
    const mapa = crearMapa();
    const manos = seguimiento.actualizar(resultados, mapa, dt, {
      suavizado: CONFIG.suavizado,
      factorVelocidad: CONFIG.factorVelocidad,
      saltoMaximo: CONFIG.saltoMaximo
    });

    actualizarCuerdas(manos);

    dibujarFondo(p);
    dibujarCuerdas(p);
    if (mostrarDebug) dibujarDebug(p, manos);
    actualizarInfo(p, manos);
  };

  p.keyPressed = () => {
    if (p.key === 'd' || p.key === 'D') mostrarDebug = !mostrarDebug;
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
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

  // --------------------------------------------------------------- cuerdas ---

  /** Mapa de coordenadas video→canvas para el frame actual. */
  function crearMapa() {
    const anchoVideo = video && video.elt ? video.elt.videoWidth : CONFIG.video.ancho;
    const altoVideo = video && video.elt ? video.elt.videoHeight : CONFIG.video.alto;
    return Mano.crearMapa(anchoVideo, altoVideo, p.width, p.height);
  }

  /**
   * Ancla una cuerda por punta de dedo y las actualiza.
   * Clave: 'handedness-indiceDedo' (spec.md §8).
   */
  function actualizarCuerdas(manos) {
    const activas = new Set();

    for (const mano of manos) {
      for (const punta of mano.puntas) {
        const clave = mano.handedness + '-' + punta.indice;
        activas.add(clave);

        let cuerda = cuerdas.get(clave);
        if (!cuerda) {
          cuerda = new Rope(
            punta.x,
            punta.y,
            CONFIG.longitudHilo * variacionHilo[punta.indice],
            CONFIG.segmentos
          );
          cuerdas.set(clave, cuerda);
        }

        cuerda.pin(punta.x, punta.y);
        cuerda.update(CONFIG.gravedad, CONFIG.amortiguacion, CONFIG.iteracionesConstraint);
        cuerda.frame = p.frameCount;
      }
    }

    // Las cuerdas de manos que ya no están se conservan un rato: si la
    // detección pierde un frame, el hilo no debe parpadear. Después se borran
    // (la caída con gravedad de T8 entra más adelante).
    for (const [clave, cuerda] of cuerdas) {
      if (activas.has(clave)) continue;
      if (p.frameCount - cuerda.frame > CONFIG.graciaCuerda) cuerdas.delete(clave);
    }
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

  function dibujarCuerdas(p2) {
    p2.push();
    for (const cuerda of cuerdas.values()) {
      cuerda.dibujar(p2);
    }
    p2.pop();
  }

  function dibujarDebug(p2, manos) {
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
    }
    p2.pop();
  }

  function actualizarInfo(p2, manos) {
    if (p2.frameCount - ultimoUpdateInfo < 10) return;
    ultimoUpdateInfo = p2.frameCount;
    document.getElementById('info-manos').textContent = String(manos.length);
    document.getElementById('info-fps').textContent = String(Math.round(p2.frameRate()));
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
