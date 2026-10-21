/* Pruebas del smoke test. Se evalúa en el mismo scope que hand.js + rope.js + sketch.js. */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const p = global.__p5[0];
  let fallos = 0;
  const assert = (cond, msg) => {
    if (cond) console.log('  ok   ' + msg);
    else { console.error('  FALLO ' + msg); fallos++; process.exitCode = 1; }
  };
  const estado = () => __els.get('estado-titulo').textContent;

  console.log('\n[__escenario: ' + __escenario + ']');

  // --- modelo ---
  assert(global.__ml5.llamadas.length === 1, 'se creó exactamente una instancia handPose');
  assert(global.__ml5.llamadas[0].nombre === 'MediaPipeHands', 'modelo = MediaPipeHands');
  assert(global.__ml5.llamadas[0].opciones.runtime === 'mediapipe', 'runtime = mediapipe');
  assert(global.__ml5.llamadas[0].opciones.maxHands === 2, 'maxHands = 2');
  assert(global.__ml5.llamadas[0].opciones.flipHorizontal === false, 'flipHorizontal = false');

  await sleep(60);

  if (__escenario === 'ok') {
    assert(global.__ml5.detectStart !== null, 'detectStart se invocó');
    assert(!!(global.__ml5.detectStart.media && global.__ml5.detectStart.media.elt),
      'detectStart recibió el <video> real (media.elt)');

    // Mano sintética: 21 keypoints en píxeles del video (640x480)
    const keypoints = [];
    for (let i = 0; i < 21; i++) {
      keypoints.push({ x: 100 + i * 20, y: 200 + i * 10, score: 0.99, name: Mano.NOMBRES[i] });
    }
    global.__ml5.detectStart.cb([{ keypoints, handedness: 'Right', confidence: 0.95 }]);

    p.key = 'd';
    p.keyPressed();               // activa el modo debug
    p.frameCount = 20;
    p.draw();
    p.draw();

    assert(__els.get('info-manos').textContent === '1', 'el chip informa 1 mano detectada');
    assert(__els.get('info-fps').textContent !== '—', 'el chip informa los FPS');
    assert(__els.get('estado').classList.contains('oculto'), 'el overlay de estado se oculta al arrancar');
  }

  if (__escenario === 'sin-permiso') {
    assert(estado().indexOf('cámara') !== -1, 'mensaje de cámara denegado: "' + estado() + '"');
    assert(global.__ml5.detectStart === null, 'no se inició la detección sin cámara');
    assert(__els.get('estado').classList.contains('error'), 'el overlay marca error');
  }

  if (__escenario === 'error-modelo') {
    assert(estado().indexOf('modelo') !== -1, 'mensaje de error de modelo: "' + estado() + '"');
    assert(global.__ml5.detectStart === null, 'no se inició la detección sin modelo');
  }

  // --- Mano: extracción y mapeo (independiente del escenario) ---
  const kp = [];
  for (let i = 0; i < 21; i++) kp.push({ x: i * 2, y: i * 3, score: 1, name: Mano.NOMBRES[i] });
  const puntos = Mano.extraer({ keypoints: kp }, 640, 480);
  assert(puntos && puntos.length === 21, 'extraer() devuelve 21 keypoints');
  assert(puntos[4].name === 'thumb_tip' && puntos[20].name === 'pinky_finger_tip',
    'los nombres de los keypoints son los de MediaPipe');

  const normalizados = [];
  for (let i = 0; i < 21; i++) normalizados.push({ x: 0.5, y: 0.25, z: 0 });
  const fallback = Mano.extraer({ landmarks: normalizados }, 640, 480);
  assert(fallback[0].x === 320 && fallback[0].y === 120, 'fallback: landmarks normalizados se escalan al video');

  const mapa = Mano.crearMapa(640, 480, 800, 600);
  assert(mapa.aCanvasX(0) === 800, 'espejo: x=0 del video cae en el borde derecho del canvas');
  assert(mapa.aCanvasX(640) === 0, 'espejo: x=640 del video cae en el borde izquierdo del canvas');
  assert(mapa.aCanvasX(320) === 400, 'espejo: el centro del video queda en el centro del canvas');
  assert(mapa.aCanvasY(480) === 600, 'escala vertical video→canvas');

  // --- T3: curl ---
  const manoRecta = manoFalsa([0, 0, 0, 0, 0]);
  const curlsRectos = Mano.calcularCurl(manoRecta);
  assert(curlsRectos.every((c) => c < 0.05), 'mano estirada → curl ~0 en los 5 dedos');

  const manoCerrada = manoFalsa([0, 1, 1, 1, 1]);
  const curlsCerrados = Mano.calcularCurl(manoCerrada);
  assert(curlsCerrados[0] < 0.05, 'pulgar estirado → curl ~0');
  assert(curlsCerrados.slice(1).every((c) => c > 0.5), 'dedos cerrados → curl alto');

  const manoMedia = manoFalsa([0, 0.5, 0, 0, 0]);
  const curlsMedios = Mano.calcularCurl(manoMedia);
  assert(curlsMedios[1] > 0.15 && curlsMedios[1] < 0.85, 'curl intermedio: ' + curlsMedios[1].toFixed(2));

  // --- T3: suavizado y velocidad ---
  const seg = new Mano.Seguimiento();
  const mapa2 = Mano.crearMapa(640, 480, 800, 600);
  const manoEnX = (x) => ({
    keypoints: manoFalsa([0, 0, 0, 0, 0], x - 320).map((p, i) => ({ x: p.x, y: p.y, score: 1, name: Mano.NOMBRES[i] })),
    handedness: 'Right'
  });

  const f1 = seg.actualizar([manoEnX(320)], mapa2, 0.016, { suavizado: 0.35, factorVelocidad: 0.4 });
  const xInicial = f1[0].puntos[0].x;
  const f2 = seg.actualizar([manoEnX(420)], mapa2, 0.016, { suavizado: 0.35, factorVelocidad: 0.4 });
  const xSuavizado = f2[0].puntos[0].x;

  const escala = 800 / 640;
  const esperado = xInicial + ((800 - 420 * escala) - xInicial) * 0.35;
  assert(Math.abs(xSuavizado - esperado) < 0.01,
    'el suavizado mueve sólo el 35 % hacia la nueva posición (lerp, RNF-02)');
  assert(Math.abs(xInicial - (800 - 320 * escala)) < 0.01, 'el primer frame se ancla sin suavizar');
  assert(f2[0].puntas[0].velocidad > 2000,
    'la velocidad refleja el movimiento real de la mano: ' + Math.round(f2[0].puntas[0].velocidad) + ' px/s');

  // Reaparecer lejos debe reiniciar el suavizado (no viajar por la pantalla).
  const f3 = seg.actualizar([manoEnX(100)], mapa2, 0.016, { suavizado: 0.35, factorVelocidad: 0.4 });
  assert(Math.abs(f3[0].puntos[0].x - (800 - 100 * escala)) < 0.01,
    'la mano que reaparece lejos se reinicia (sin destello)');

  // --- T4: cuerda Verlet ---
  const cuerda = new Rope(100, 100, 150, 15);
  assert(cuerda.puntos.length === 16, 'la cuerda tiene segmentos + 1 puntos');

  for (let i = 0; i < 60; i++) cuerda.update(0.55, 0.985, 6);
  const fin = cuerda.endPoint();
  assert(fin.y > 100 + 120, 'la punta cuelga por debajo del ancla: ' + fin.y.toFixed(1));

  let largo = 0;
  for (let i = 1; i < cuerda.puntos.length; i++) {
    largo = Math.max(largo, Math.hypot(
      cuerda.puntos[i].x - cuerda.puntos[i - 1].x,
      cuerda.puntos[i].y - cuerda.puntos[i - 1].y));
  }
  assert(Math.abs(largo - cuerda.largoSegmento) < 1.5,
    'los segments respetan la longitud del constraint: ' + largo.toFixed(2));

  assert(Math.abs(cuerda.endAngle() - Math.PI / 2) < 0.2, 'el ángulo final apunta hacia abajo');

  const yAntes = fin.y;
  cuerda.setLength(60);
  for (let i = 0; i < 60; i++) cuerda.update(0.55, 0.985, 6);
  const finCorto = cuerda.endPoint();
  assert(finCorto.y < yAntes - 30, 'acortar el hilo sube el extremo (RF-06): ' + yAntes.toFixed(1) + ' → ' + finCorto.y.toFixed(1));

  const cuerda2 = new Rope(400, 100, 150, 15);
  for (let i = 0; i < 30; i++) { cuerda2.pin(400, 100); cuerda2.update(0.55, 0.985, 6); }
  const quieta = cuerda2.endPoint();
  cuerda2.pin(700, 100);
  cuerda2.update(0.55, 0.985, 6);
  assert(cuerda2.endPoint().x < 700 - 5,
    'la cuerda no sigue al ancla al instante: hay inercia (RF-05)');
  assert(Math.abs(quieta.x - 400) < 3, 'una cuerda quieta queda vertical');

  console.log(fallos === 0 ? '\nTODAS LAS PRUEBAS OK\n' : '\n' + fallos + ' PRUEBAS FALLARON\n');
})();

/** Genera una mano de 21 puntos con el curl pedido por dedo (0 = estirado). */
function manoFalsa(curls, desplazamientoX) {
  const dx = desplazamientoX || 0;
  const pts = new Array(21);
  const poner = (i, x, y) => { pts[i] = { x: x + dx, y: y, z: 0, score: 1, name: Mano.NOMBRES[i] }; };

  poner(0, 320, 420);                       // muñeca

  // Pulgar: base 1 (CMC) -> 2 -> 3 -> 4
  const pulgar = [1, 2, 3, 4];
  poner(1, 290, 400);
  cadena(pulgar, 290, 400, -0.6, curls[0], poner, 42);

  // resto de los dedos: base MCP -> PIP -> DIP -> TIP
  const bases = [[5, 6, 7, 8, 300, 360], [9, 10, 11, 12, 320, 360],
                 [13, 14, 15, 16, 340, 365], [17, 18, 19, 20, 358, 375]];
  bases.forEach((b, i) => {
    poner(b[0], b[4], b[5]);
    cadena(b, b[4], b[5], -Math.PI / 2, curls[i + 1], poner, 50);
  });

  return pts;
}

/** Escribe una cadena de falanges doblando según el curl (0 = recto, 1 = cerrado). */
function cadena(ids, x, y, anguloInicial, curl, poner, largo) {
  let px = x;
  let py = y;
  let ang = anguloInicial;
  // Un dedo real se dobla ~100° por articulación cuando se cierra del todo.
  const paso = curl * 1.75;
  for (let i = 1; i < ids.length; i++) {
    ang += paso * (i === 1 ? 0.6 : 1);
    const nx = px + Math.cos(ang) * largo;
    const ny = py + Math.sin(ang) * largo;
    poner(ids[i], nx, ny);
    px = nx;
    py = ny;
  }
}
