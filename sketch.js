/**
 * sketch.js — Orquestación de la experiencia: cámara, modelo de manos y render.
 *
 * Flujo (spec.md §8): preload (crea handPose) → setup (canvas, video, detectStart)
 * → gotHands (guarda resultados) → draw (video espejo → keypoints de debug).
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
  let manos = [];               // últimos resultados de ml5
  let modeloListo = false;
  let videoListo = false;
  let deteccionIniciada = false;
  let mostrarDebug = false;     // tecla D
  let ultimoUpdateInfo = 0;

  p.preload = () => {
    // ml5 v1: handPose() devuelve la instancia de inmediato; el modelo se carga
    // en background y `modelo.ready` avisa cuando terminó.
    modelo = ml5.handPose('MediaPipeHands', CONFIG.modelo);
  };

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight).parent('sketch');
    p.pixelDensity(1); // menos fill-rate = más FPS (RNF-01)
    p.frameRate(60);

    setEstado('Cargando modelo…', 'Preparando el detector de manos…');
    esperarModelo();
    iniciarCamara();
  };

  p.draw = () => {
    dibujarFondo(p);
    if (mostrarDebug) dibujarKeypoints(p);
    actualizarInfo(p);
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
          'No se pudo inicializar el detector de manos (' + mensajeError(err) + '). Revisá la conexión a internet y recargá la página.',
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
      modelo.detectStart(video, (resultados) => {
        manos = resultados || [];
      });
      ocultarEstado();
    } catch (err) {
      setEstado('Error al iniciar la detección', mensajeError(err), true);
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

  function dibujarKeypoints(p2) {
    if (!video || !video.elt || !video.elt.videoWidth) return;

    const mapa = Mano.crearMapa(
      video.elt.videoWidth,
      video.elt.videoHeight,
      p2.width,
      p2.height
    );

    for (const mano of manos) {
      const puntos = Mano.extraer(mano, video.elt.videoWidth, video.elt.videoHeight);
      if (!puntos) continue;

      // Esqueleto
      p2.stroke(140, 40, 55, CONFIG.debug.alfaEsqueleto);
      p2.strokeWeight(2);
      for (const par of Mano.CONEXIONES) {
        const a = puntos[par[0]];
        const b = puntos[par[1]];
        if (!a || !b) continue;
        p2.line(mapa.aCanvasX(a.x), mapa.aCanvasY(a.y), mapa.aCanvasX(b.x), mapa.aCanvasY(b.y));
      }

      // Los 21 keypoints; las 5 puntas en rojo (son los anclajes de las arañas).
      p2.noStroke();
      for (let i = 0; i < puntos.length; i++) {
        const esPunta = Mano.PUNTAS.indexOf(i) !== -1;
        p2.fill(esPunta ? p2.color(228, 70, 92) : p2.color(235, 230, 215));
        p2.circle(
          mapa.aCanvasX(puntos[i].x),
          mapa.aCanvasY(puntos[i].y),
          esPunta ? CONFIG.debug.radioPunta : CONFIG.debug.radioArticulacion
        );
      }
    }
  }

  function actualizarInfo(p2) {
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
    return 'La cámara ya está siendo usada por otra aplicación. Cerrá la otra pestaña y recargá.';
  }
  return 'No se pudo abrir la cámara (' + (nombre || 'error desconocido') + '). Revisá el permiso y recargá la página.';
}

new p5(esquema);
