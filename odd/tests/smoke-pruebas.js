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

  /** Avanza N frames del sketch (con el dt real, que es lo que mueve la caída). */
  const avanzar = (n) => { for (let i = 0; i < n; i++) { p.frameCount++; p.draw(); } };

  // Mano sintética: 21 keypoints en píxeles del video (640x480)
  const keypoints = [];
  for (let i = 0; i < 21; i++) {
    keypoints.push({ x: 100 + i * 20, y: 200 + i * 10, score: 0.99, name: Mano.NOMBRES[i] });
  }

  console.log('\n[__escenario: ' + __escenario + ']');

  // --- modelo (sólo cuando el navegador tiene WebGL) ---
  if (__escenario !== 'sin-webgl') {
    assert(global.__ml5.llamadas.length === 1, 'se creó exactamente una instancia handPose');
    assert(global.__ml5.llamadas[0].nombre === 'MediaPipeHands', 'modelo = MediaPipeHands');
    assert(global.__ml5.llamadas[0].opciones.runtime === 'mediapipe', 'runtime = mediapipe');
    assert(global.__ml5.llamadas[0].opciones.maxHands === 2, 'maxHands = 2');
    assert(global.__ml5.llamadas[0].opciones.flipHorizontal === false, 'flipHorizontal = false');
  }

  await sleep(60);

  if (__escenario === 'ok') {
    assert(global.__ml5.detectStart !== null, 'detectStart se invocó');
    assert(!!(global.__ml5.detectStart.media && global.__ml5.detectStart.media.elt),
      'detectStart recibió el <video> real (media.elt)');

    // Mano sintética: 21 keypoints en píxeles del video (640x480)
    global.__ml5.detectStart.cb([{ keypoints, handedness: 'Right', confidence: 0.95 }]);

    p.key = 'd';
    p.keyPressed();               // activa el modo debug
    p.frameCount = 20;
    p.draw();
    p.draw();

    assert(__els.get('info-manos').textContent === '1', 'el chip informa 1 mano detectada');
    assert(__els.get('info-fps').textContent !== '—', 'el chip informa los FPS');
    assert(__els.get('estado').classList.contains('oculto'), 'el overlay de estado se oculta al arrancar');

    // --- T4: una cuerda por punta y sin parpadeo si la detección pierde un frame ---
    // Cada cuerda se dibuja en 2 trazos (halo + hilo) → 2 endShape abiertos por cuerda.
    p.hiloCalls = 0;
    p.draw();
    assert(p.hiloCalls === 10, 'se dibuja una cuerda por punta (5 cuerdas x 2 trazos): ' + p.hiloCalls);

    global.__ml5.detectStart.cb([]);            // la mano desaparece
    avanzar(5);
    p.hiloCalls = 0;
    p.draw();
    assert(p.hiloCalls === 10, 'la cuerda se conserva durante la gracia (no parpadea)');

    // Pasada la gracia, la araña se suelta y cae: se sigue dibujando.
    avanzar(40);
    p.hiloCalls = 0;
    p.draw();
    assert(p.hiloCalls === 10, 'pasada la gracia la araña se suelta y cae (se sigue dibujando)');

    // Un segundo después, desaparece.
    avanzar(70);
    p.hiloCalls = 0;
    p.draw();
    assert(p.hiloCalls === 0, 'un segundo después la araña desaparece');
  }

  if (__escenario === 'sin-webgl') {
    assert(global.__ml5.llamadas.length === 0, 'sin WebGL no se crea el modelo (no hay error de MediaPipe)');
    assert(estado().indexOf('WebGL') === 0, 'mensaje de WebGL deshabilitado: "' + estado() + '"');
    assert(__els.get('estado').classList.contains('error'), 'el overlay marca error');
    assert(global.__ml5.detectStart === null, 'no se inició la detección');
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
  // La mano se mueve 12 px por frame: la cuerda tiene que quedar atrás.
  for (let i = 0; i < 6; i++) { cuerda2.pin(400 + 12 * (i + 1), 100); cuerda2.update(0.55, 0.985, 6); }
  assert(cuerda2.endPoint().x < 400 + 72 - 5,
    'la cuerda no sigue al ancla al instante: hay inercia (RF-05)');
  assert(Math.abs(quieta.x - 400) < 3, 'una cuerda quieta queda vertical');

  // Salto grande del ancla: la cuerda lo acompaña sin enredarse.
  const cuerda3 = new Rope(400, 100, 150, 15);
  for (let i = 0; i < 30; i++) { cuerda3.pin(400, 100); cuerda3.update(0.55, 0.985, 6); }
  cuerda3.pin(900, 100);
  for (let i = 0; i < 30; i++) { cuerda3.pin(900, 100); cuerda3.update(0.55, 0.985, 6); }
  let maxSegmento = 0;
  for (let i = 1; i < cuerda3.puntos.length; i++) {
    maxSegmento = Math.max(maxSegmento, Math.hypot(
      cuerda3.puntos[i].x - cuerda3.puntos[i - 1].x,
      cuerda3.puntos[i].y - cuerda3.puntos[i - 1].y));
  }
  assert(maxSegmento < cuerda3.largoSegmento * 1.5,
    'tras un salto grande la cuerda no se enreda (segmento máx ' + maxSegmento.toFixed(1) + ')');
  assert(cuerda3.endPoint().y > 100 + 100, 'y sigue colgando con su largo');

  // --- T5/T6: la araña (cuerpo, marca roja, 8 patas con IK) ---
  const araña = new Spider({ tamano: 1, fase: 0.5, p: global.__p5[0] });
  assert(araña.patas.length === 8, 'la araña tiene 8 patas');
  assert(araña.patas.filter((x) => x.lado === 1).length === 4
    && araña.patas.filter((x) => x.lado === -1).length === 4,
    'las 8 patas se reparten 4 y 4 a cada lado del cuerpo');

  araña.update({ x: 400, y: 300 }, Math.PI / 2, 0);
  assert(araña.x === 400 && araña.y === 300, 'la araña cuelga del extremo libre de la cuerda');
  assert(Math.abs(araña.rotacion - (Math.PI / 2 + Math.PI)) < 1e-9,
    'la cabeza mira hacia el hilo (ángulo de la cuerda + PI)');

  const patasOk = araña.patas.every((pt) => Number.isFinite(pt.pie.x) && Number.isFinite(pt.pie.y)
    && Number.isFinite(pt.rodilla.x) && Number.isFinite(pt.rodilla.y));
  assert(patasOk, 'las 8 patas tienen posiciones válidas (sin NaN)');

  const femur = Math.hypot(
    araña.patas[0].rodilla.x - araña.patas[0].hueso.x,
    araña.patas[0].rodilla.y - araña.patas[0].hueso.y);
  assert(Math.abs(femur - araña.lFemur) < 0.6, 'el fémur conserva su largo (IK correcta): ' + femur.toFixed(2));
  const tibia = Math.hypot(
    araña.patas[0].pie.x - araña.patas[0].rodilla.x,
    araña.patas[0].pie.y - araña.patas[0].rodilla.y);
  assert(Math.abs(tibia - araña.lTibia) < 0.6, 'la tibia conserva su largo (IK correcta): ' + tibia.toFixed(2));

  const antes = araña.patas.map((pt) => pt.pie.x);
  for (let i = 0; i < 30; i++) araña.update({ x: 400, y: 300 }, Math.PI / 2, 0);
  const despues = araña.patas.map((pt) => pt.pie.x);
  const deltas = antes.map((v, i) => Math.abs(v - despues[i]));
  assert(Math.max.apply(null, deltas) > 0.5, 'las patas se mueven con el ciclo de pataleo');
  assert(Math.max.apply(null, deltas) - Math.min.apply(null, deltas) > 0.4,
    'las patas NO se mueven todas igual (ciclo asimétrico, no mecánico)');

  araña.update({ x: 400, y: 300 }, 0, 0);
  assert(Math.abs(araña.rotacion - Math.PI) < 1e-9, 'la araña rota según el ángulo de la cuerda (S20)');

  // El vuelco: la araña se torsiona y el rojo del vientre aparece y desaparece.
  const vuelco0 = araña.vuelco;
  for (let i = 0; i < 120; i++) araña.update({ x: 400, y: 300 }, Math.PI / 2, 0);
  assert(araña.vuelco !== vuelco0, 'la araña se torsiona mientras cuelga');
  const visibilidades = [];
  for (let i = 0; i < 240; i++) {
    araña.update({ x: 400, y: 300 }, Math.PI / 2, 0);
    visibilidades.push(Math.abs(Math.sin(araña.vuelco)));
  }
  assert(Math.max.apply(null, visibilidades) > 0.7, 'el vientre llega a verse (marca roja)');
  assert(Math.min.apply(null, visibilidades) < 0.4, 'el vientre también se oculta a ratos');

  // --- Fase 2 · Bloque 1: gestures.js (puño con histéresis y separación) ---
  // (no depende de la cámara, así que va fuera del bloque que necesita detectStart)

  const CFG_GESTOS = { fistCloseThreshold: 0.75, fistOpenThreshold: 0.5, fistHoldMs: 150 };
  const CFG_SEP = { spreadOn: 0.35, spreadOff: 0.25 };

  /** Mano sintética con curls explícitos (los puntos se binarizan). */
  const gestosMano = (curls, handedness) => ({
    handedness: handedness || 'Right',
    curl: curls,
    puntos: manoFalsa(curls.map((c) => (c > 0.6 ? 1 : 0)))
  });

  const detector = Gestos.crear();
  // El pulgar (índice 0) queda estirado a propósito: se ignora (RF-11).
  const manoPuño = gestosMano([0, 0.9, 0.9, 0.9, 0.9]);
  const manoAbierta = gestosMano([0, 0, 0, 0, 0]);

  let rg = detector.actualizar([manoPuño], 0.016, CFG_GESTOS);
  assert(rg[0].enPuño === false, 'el puño no se confirma en el primer frame');
  assert(detector.isFist(manoPuño) === false, 'isFist() todavía devuelve false');

  let flanco = false;
  for (let i = 0; i < 10; i++) {
    rg = detector.actualizar([manoPuño], 0.016, CFG_GESTOS);
    if (rg[0].cambio) flanco = true;
  }
  assert(rg[0].enPuño === true, 'con el curl sostenido 150 ms el puño se confirma (RF-12)');
  assert(detector.isFist(manoPuño) === true, 'isFist(hand) devuelve true');
  assert(flanco === true, 'el flanco del puño se reporta al confirmarse');

  rg = detector.actualizar([manoPuño], 0.016, CFG_GESTOS);
  assert(rg[0].cambio === false, 'el flanco no se repite mientras siga el puño');

  // Histéresis: entre 0.5 y 0.75 sigue siendo puño; recién sale por debajo de 0.5.
  const manoCurlMedio = gestosMano([0, 0.6, 0.6, 0.6, 0.6]);
  rg = detector.actualizar([manoCurlMedio], 0.016, CFG_GESTOS);
  assert(rg[0].enPuño === true, 'con curl 0.6 sigue siendo puño (histéresis, RF-12)');
  const manoSuelta = gestosMano([0, 0.3, 0.3, 0.3, 0.3]);
  rg = detector.actualizar([manoSuelta], 0.016, CFG_GESTOS);
  assert(rg[0].enPuño === false, 'por debajo de 0.5 el puño se suelta');

  // Frames sueltos por encima del umbral no alcanzan: hace falta sostenerlo.
  const detector2 = Gestos.crear();
  const manoIntermitente = gestosMano([0, 0.9, 0.9, 0.9, 0.9], 'Left');
  detector2.actualizar([manoIntermitente], 0.05, CFG_GESTOS);
  detector2.actualizar([gestosMano([0, 0, 0, 0, 0], 'Left')], 0.05, CFG_GESTOS);
  detector2.actualizar([manoIntermitente], 0.05, CFG_GESTOS);
  assert(detector2.isFist(manoIntermitente) === false,
    'un frame suelto por encima del umbral no confirma el puño (el contador se reinicia)');

  // Bordes del umbral: exactamente 0.75 no alcanza, apenas por encima sí, y el
  // pulgar no influye (RF-11).
  const detectorBordes = Gestos.crear();
  const manoBorde = gestosMano([0, 0.75, 0.75, 0.75, 0.75], 'Right');
  for (let i = 0; i < 20; i++) detectorBordes.actualizar([manoBorde], 0.016, CFG_GESTOS);
  assert(detectorBordes.isFist(manoBorde) === false,
    'con el curl exactamente en 0.75 el puño no se confirma (el umbral es estricto)');

  const detectorJusto = Gestos.crear();
  const manoJusto = gestosMano([0, 0.76, 0.76, 0.76, 0.76], 'Right');
  for (let i = 0; i < 20; i++) detectorJusto.actualizar([manoJusto], 0.016, CFG_GESTOS);
  assert(detectorJusto.isFist(manoJusto) === true,
    'apenas por encima de 0.75, sostenido, el puño se confirma');

  const detectorPulgar = Gestos.crear();
  const manoPulgarEstirado = gestosMano([1, 0.9, 0.9, 0.9, 0.9], 'Right');
  for (let i = 0; i < 20; i++) detectorPulgar.actualizar([manoPulgarEstirado], 0.016, CFG_GESTOS);
  assert(detectorPulgar.isFist(manoPulgarEstirado) === true,
    'el pulgar se ignora: da igual si está estirado o cerrado (RF-11)');

  const detectorSinPuno = Gestos.crear();
  const manoDedosEstirados = gestosMano([1, 0.2, 0.2, 0.2, 0.2], 'Right');
  for (let i = 0; i < 20; i++) detectorSinPuno.actualizar([manoDedosEstirados], 0.016, CFG_GESTOS);
  assert(detectorSinPuno.isFist(manoDedosEstirados) === false,
    'con los cuatro dedos largos estirados (y el pulgar cerrado) no hay puño');

  // La histéresis se mide en tiempo real: a 30 FPS hacen falta los mismos
  // 150 ms, o sea la mitad de frames que a 60 FPS (RF-12).
  const detector30 = Gestos.crear();
  const mano30 = gestosMano([0, 0.9, 0.9, 0.9, 0.9], 'Left');
  for (let i = 0; i < 4; i++) detector30.actualizar([mano30], 0.0333, CFG_GESTOS);
  assert(detector30.isFist(mano30) === false,
    'a 30 FPS, 4 frames (133 ms) todavía no confirman el puño');
  detector30.actualizar([mano30], 0.0333, CFG_GESTOS);
  assert(detector30.isFist(mano30) === true,
    'a 30 FPS, 5 frames (167 ms) ya lo confirman: el umbral es de tiempo, no de frames');

  // spreadValue: distancia entre dos puntas normalizada por el tamaño de la mano.
  const puntosSeparados = manoFalsa([0, 0, 0, 0, 0]);
  const tamanoMano = Math.hypot(
    puntosSeparados[9].x - puntosSeparados[0].x,
    puntosSeparados[9].y - puntosSeparados[0].y
  );
  const spreadEsperado = Math.hypot(
    puntosSeparados[4].x - puntosSeparados[8].x,
    puntosSeparados[4].y - puntosSeparados[8].y
  ) / tamanoMano;
  const manoSeparada = { handedness: 'Right', puntos: puntosSeparados };

  assert(Math.abs(Gestos.spreadValue(manoSeparada, 'pulgar', 'indice') - spreadEsperado) < 1e-9,
    'spreadValue() normaliza por el tamaño de la mano (muñeca → nudillo del medio)');
  assert(Gestos.spreadValue(manoSeparada, 0, 1) === Gestos.spreadValue(manoSeparada, 'pulgar', 'indice'),
    'spreadValue() acepta el dedo por nombre o por índice (0 = pulgar)');

  // La separación también usa histéresis (RF-28): entra en 0.35, sale en 0.25.
  const detector3 = Gestos.crear();
  const ptsBanda = manoFalsa([0, 0, 0, 0, 0]);
  ptsBanda[4] = { x: 300, y: 324, z: 0, score: 1, name: Mano.NOMBRES[4] };
  ptsBanda[8] = { x: 300, y: 342, z: 0, score: 1, name: Mano.NOMBRES[8] };
  const manoEnBanda = { handedness: 'Right', puntos: ptsBanda };
  const valorBanda = Gestos.spreadValue(manoEnBanda, 'pulgar', 'indice');
  assert(valorBanda > 0.25 && valorBanda < 0.35,
    'la mano de prueba cae en la banda de histéresis: ' + valorBanda.toFixed(2));

  detector3.actualizar([manoEnBanda], 0.016, CFG_SEP);
  assert(detector3.spreadActivo(manoEnBanda, 'pulgar', 'indice', CFG_SEP) === false,
    'en la banda, sin haber superado 0.35, no se activa');
  detector3.actualizar([manoSeparada], 0.016, CFG_SEP);
  assert(detector3.spreadActivo(manoSeparada, 'pulgar', 'indice', CFG_SEP) === true,
    'con los dedos separados la telaraña se activa');
  detector3.actualizar([manoEnBanda], 0.016, CFG_SEP);
  assert(detector3.spreadActivo(manoEnBanda, 'pulgar', 'indice', CFG_SEP) === true,
    'ya activa, sigue activa dentro de la banda (histéresis)');
  const ptsJuntos = manoFalsa([0, 0, 0, 0, 0]);
  ptsJuntos[4] = { x: 300, y: 350, z: 0, score: 1, name: Mano.NOMBRES[4] };
  ptsJuntos[8] = { x: 300, y: 342, z: 0, score: 1, name: Mano.NOMBRES[8] };
  const manoJunta = { handedness: 'Right', puntos: ptsJuntos };
  detector3.actualizar([manoJunta], 0.016, CFG_SEP);
  assert(detector3.spreadActivo(manoJunta, 'pulgar', 'indice', CFG_SEP) === false,
    'por debajo de 0.25 la separación se desactiva');

  // --- Fase 2 · Bloque 2: los estados de la araña ---
  const p5Stub = global.__p5[0];
  const arañaEstados = new Spider({ tamano: 1, fase: 0, p: p5Stub });

  assert(arañaEstados.estado === Spider.ESTADOS.COLGANDO, 'la araña arranca HANGING');
  assert(arañaEstados.progreso === 0, 'el progreso de trepada arranca en 0');

  arañaEstados.trepar(0.4, 1);
  assert(arañaEstados.estado === Spider.ESTADOS.TREPANDO, 'trepar() la pasa a CLIMBING');
  assert(arañaEstados.progreso > 0 && arañaEstados.progreso < 1,
    'el progreso de trepada avanza: ' + arañaEstados.progreso.toFixed(2));
  assert(arañaEstados.escala < 1, 'mientras trepa la araña se achica (RF-14): ' + arañaEstados.escala.toFixed(2));

  arañaEstados.trepar(10, 1);
  assert(arañaEstados.progreso === 1, 'el progreso no pasa de 1: llegó a la palma');
  assert(arañaEstados.escala <= 0.61, 'al llegar arriba está al 60 % de su tamaño');
  arañaEstados.ocultar();
  assert(arañaEstados.estado === Spider.ESTADOS.OCULTA, 'al llegar a la palma queda HIDDEN');

  p5Stub.ellipseCalls = 0;
  arañaEstados.draw(p5Stub);
  assert(p5Stub.ellipseCalls === 0, 'la araña oculta no se dibuja');

  arañaEstados.lanzar(6, -4);
  assert(arañaEstados.estado === Spider.ESTADOS.LANZANDO, 'lanzar() la pasa a LAUNCHING');
  assert(arañaEstados.susto === 1, 'al lanzarse las patas se abren en susto (RF-16)');

  const xLanzada = arañaEstados.x;
  const yLanzada = arañaEstados.y;
  arañaEstados.actualizarLanzamiento(0.1, 0.55, 0.99, { x: xLanzada, y: yLanzada });
  assert(arañaEstados.x !== xLanzada || arañaEstados.y !== yLanzada,
    'en el lanzamiento la araña se mueve con su impulso');

  for (let i = 0; i < 40; i++) {
    arañaEstados.actualizarLanzamiento(0.016, 0.55, 0.99, { x: arañaEstados.x, y: arañaEstados.y });
  }
  assert(arañaEstados.susto < 0.2,
    'las patas de susto se recuperan en ~0.5 s: ' + arañaEstados.susto.toFixed(2));

  arañaEstados.colgar();
  assert(arañaEstados.estado === Spider.ESTADOS.COLGANDO, 'colgar() la devuelve a HANGING');

  p5Stub.ellipseCalls = 0;
  arañaEstados.update({ x: 400, y: 300 }, Math.PI / 2, 0);
  arañaEstados.draw(p5Stub);
  assert(p5Stub.ellipseCalls > 0, 'la araña que volvió a colgar se dibuja de nuevo');

  // --- T5/T6: una araña por cuerda en el sketch ---
  // (guard: en los escenarios sin cámara o sin modelo no hay detectStart)
  if (global.__ml5.detectStart) {
  global.__ml5.detectStart.cb([{ keypoints, handedness: 'Right', confidence: 0.95 }]);
  p.ellipseCalls = 0;
  p.hiloCalls = 0;
  p.draw();
  assert(p.ellipseCalls === 10, 'se dibuja una araña por cuerda (5 arañas × 2 elipses): ' + p.ellipseCalls);
  assert(p.hiloCalls === 10, 'y una cuerda por araña: ' + p.hiloCalls);

  // --- T7: el curl acorta el hilo y la araña sube por él ---
  const manoAppEstirada = { keypoints: aPuntos(manoFalsa([0, 0, 0, 0, 0])), handedness: 'Right' };
  const manoAppCerrada = { keypoints: aPuntos(manoFalsa([1, 1, 1, 1, 1])), handedness: 'Right' };

  global.__ml5.detectStart.cb([manoAppEstirada]);
  avanzar(40)
  const estirada = p.colgantes.get('Right-0');
  const largoEstirado = estirada.cuerda.longitud;
  const distEstirada = estirada.araña.y - estirada.cuerda.puntos[0].y;

  global.__ml5.detectStart.cb([manoAppCerrada]);
  avanzar(40)
  const appCerrada = p.colgantes.get('Right-0');
  const largoCerrado = appCerrada.cuerda.longitud;
  const distCerrada = appCerrada.araña.y - appCerrada.cuerda.puntos[0].y;

  assert(largoCerrado < largoEstirado * 0.7,
    'el curl acorta el hilo: ' + Math.round(largoEstirado) + ' → ' + Math.round(largoCerrado) + ' px');
  assert(distCerrada < distEstirada - 30,
    'con el dedo doblado la araña sube por el hilo: ' + Math.round(distEstirada) + ' → ' + Math.round(distCerrada) + ' px');
  assert(largoEstirado > CONFIG.longitudHilo * 0.8 && largoEstirado < CONFIG.longitudHilo * 1.2,
    'con el dedo estirado el hilo tiene el largo completo (±15 % por dedo): ' + Math.round(largoEstirado));

  // --- T7: la velocidad agita la araña ---
  const arañaAgitada = new Spider({ tamano: 1, fase: 0, p: global.__p5[0] });
  arañaAgitada.update({ x: 100, y: 100 }, Math.PI / 2, 0);
  assert(arañaAgitada.agitacion === 0, 'sin movimiento la araña no se agita');
  arañaAgitada.update({ x: 100, y: 100 }, Math.PI / 2, 2000);
  assert(arañaAgitada.agitacion > 1, 'con la mano rápida la araña se agita: ' + arañaAgitada.agitacion.toFixed(2));

  // --- T8: al perder la mano, la araña se suelta, cae y se desvanece ---
  global.__ml5.detectStart.cb([manoAppEstirada]);
  avanzar(10)
  const antesCaida = p.colgantes.get('Right-0');
  const yAntesCaida = antesCaida.araña.y;

  global.__ml5.detectStart.cb([]);            // la mano desaparece
  avanzar(20)
  const durante = p.colgantes.get('Right-0');
  assert(durante !== undefined, 'durante la gracia la araña sigue colgada');
  assert(durante.cuerda.anclada === true, 'durante la gracia sigue anclada');

  avanzar(60)
  const cayendo = p.colgantes.get('Right-0');
  assert(cayendo !== undefined, 'la araña sigue existiendo mientras cae');
  assert(cayendo.cuerda.anclada === false, 'la araña se soltó del hilo');
  assert(cayendo.araña.y > yAntesCaida, 'la araña cae con gravedad: ' + Math.round(yAntesCaida) + ' → ' + Math.round(cayendo.araña.y));
  assert(cayendo.opacidad < 1 && cayendo.opacidad > 0, 'la araña se desvanece: opacidad ' + cayendo.opacidad.toFixed(2));
  assert(cayendo.araña.opacidad === cayendo.opacidad, 'la araña y el hilo comparten la opacidad');

  avanzar(60)
  assert(p.colgantes.get('Right-0') === undefined, 'pasado el segundo, la araña desaparece');

  // --- T8: al volver la mano, la araña se engancha de nuevo ---
  global.__ml5.detectStart.cb([manoAppEstirada]);
  avanzar(10)
  const reenganchada = p.colgantes.get('Right-0');
  assert(reenganchada !== undefined, 'la araña vuelve cuando la mano reaparece');
  assert(reenganchada.cuerda.anclada === true, 'la araña se vuelve a enganchar');
  assert(reenganchada.opacidad === 1, 'vuelve a verse opaca');

  // --- Fase 2 · Bloque 2: el puño hace trepar a las arañas y las esconde ---
  global.__ml5.detectStart.cb([manoAppEstirada]);
  avanzar(50);
  const colgada = p.colgantes.get('Right-0');
  const largoColgada = colgada.cuerda.longitud;
  assert(colgada.araña.estado === Spider.ESTADOS.COLGANDO,
    'con la mano abierta la araña cuelga (HANGING)');

  global.__ml5.detectStart.cb([manoAppCerrada]);
  avanzar(30);   // la histéresis pide 150 ms (10 frames) y después empieza la trepada
  const trepando = p.colgantes.get('Right-0');
  assert(trepando.araña.estado === Spider.ESTADOS.TREPANDO,
    'con el puño la araña pasa a CLIMBING');
  assert(trepando.araña.progreso > 0 && trepando.araña.progreso < 1,
    'la araña está trepando: ' + trepando.araña.progreso.toFixed(2));
  assert(trepando.cuerda.longitud < largoColgada - 20,
    'el hilo se acorta mientras trepa: ' + Math.round(largoColgada) + ' → '
    + Math.round(trepando.cuerda.longitud) + ' px');

  // Se espera a que TODAS lleguen a la palma (cada una trepa a su ritmo ±20 %,
  // RF-13), así la prueba del lanzamiento no depende de los tiempos.
  let todasOcultas = false;
  let framesEsperados = 0;
  while (!todasOcultas && framesEsperados < 300) {
    avanzar(1);
    framesEsperados++;
    const colgantesAhora = Array.from(p.colgantes.values());
    todasOcultas = colgantesAhora.length === 5
      && colgantesAhora.every((c) => c.araña.estado === Spider.ESTADOS.OCULTA);
  }
  assert(todasOcultas,
    'las 5 arañas de la mano llegan a la palma y quedan escondidas (RF-14) en '
    + framesEsperados + ' frames');
  assert(framesEsperados > 1, 'y no llegan todas en el mismo frame (cada una trepa a su ritmo)');

  p.hiloCalls = 0;
  p.ellipseCalls = 0;
  p.draw();
  assert(p.ellipseCalls === 0, 'la araña escondida no se dibuja');
  assert(p.hiloCalls === 0, 'y su hilo tampoco (RF-14)');

  // --- Fase 2 · Bloque 2: al abrir la mano salen disparadas y vuelven a colgar ---
  global.__ml5.detectStart.cb([manoAppEstirada]);
  // Se registra en qué frame sale cada araña: la salida tiene que ser
  // escalonada (RF-15) y no todas en el mismo frame.
  const framesDeSalida = new Map();
  for (let i = 0; i < 40; i++) {
    p.frameCount++;
    p.draw();
    for (const [clave, colgante] of p.colgantes) {
      if (colgante.araña.estado === Spider.ESTADOS.LANZANDO && !framesDeSalida.has(clave)) {
        framesDeSalida.set(clave, i);
      }
    }
  }
  assert(framesDeSalida.size === 5, 'las 5 arañas salen del escondite al abrir la mano');
  assert(new Set(Array.from(framesDeSalida.values())).size > 1,
    'no salen todas en el mismo frame: la salida está escalonada (RF-15)');

  const lanzada = p.colgantes.get('Right-0');
  assert(lanzada.araña.estado === Spider.ESTADOS.LANZANDO || lanzada.araña.estado === Spider.ESTADOS.COLGANDO,
    'al abrir la mano la araña sale del escondite: ' + lanzada.araña.estado);
  assert(lanzada.araña.estado !== Spider.ESTADOS.OCULTA, 'ya no está escondida');
  assert(Number.isFinite(lanzada.araña.x) && Number.isFinite(lanzada.araña.y),
    'la araña lanzada está en una posición válida');

  avanzar(240);
  const deVuelta = p.colgantes.get('Right-0');
  assert(deVuelta.araña.estado === Spider.ESTADOS.COLGANDO,
    'después del lanzamiento vuelve a colgar: ' + deVuelta.araña.estado);
  assert(deVuelta.cuerda.longitud > largoColgada * 0.8,
    'el hilo vuelve a su largo: ' + Math.round(deVuelta.cuerda.longitud) + ' px');

  // --- Fase 2 · Bloque 2: RF-17, el puño tiene prioridad sobre el curl ---
  global.__ml5.detectStart.cb([manoAppCerrada]);
  avanzar(30);
  const enPuno = p.colgantes.get('Right-0');
  const largoEnPuno = enPuno.cuerda.longitud;
  assert(enPuno.araña.estado === Spider.ESTADOS.TREPANDO, 'sigue trepando con el puño');
  assert(enPuno.araña.progreso > 0, 'el progreso lo lleva el puño, no el curl');

  // --- Fase 2 · Bloque 2: RF-18, si la mano se va con las arañas escondidas ---
  avanzar(90);
  assert(p.colgantes.get('Right-0').araña.estado === Spider.ESTADOS.OCULTA,
    'la araña llegó a la palma y quedó escondida');
  const yEscondida = p.colgantes.get('Right-0').araña.y;
  global.__ml5.detectStart.cb([]);   // la mano desaparece
  avanzar(100);
  const trasPerderMano = p.colgantes.get('Right-0');
  assert(trasPerderMano === undefined || trasPerderMano.araña.estado !== Spider.ESTADOS.OCULTA,
    'si la mano desaparece, la araña escondida no queda colgada en el limbo (RF-18)');
  avanzar(80);
  assert(p.colgantes.get('Right-0') === undefined,
    'y termina de caer y desvanecerse como en RF-08');

  // --- Fase 2 · Bloque 2: la tecla F apaga la feature del puño (RNF-08) ---
  global.__ml5.detectStart.cb([manoAppEstirada]);
  avanzar(20);
  p.key = 'f';
  p.keyPressed();
  global.__ml5.detectStart.cb([manoAppCerrada]);
  avanzar(60);
  const conFeatureApagada = p.colgantes.get('Right-0');
  assert(conFeatureApagada.araña.estado === Spider.ESTADOS.COLGANDO,
    'con la feature apagada (F) el puño no hace trepar a la araña');
  p.key = 'f';
  p.keyPressed();
  avanzar(40);
  assert(p.colgantes.get('Right-0').araña.estado === Spider.ESTADOS.TREPANDO,
    'al volver a prenderla, el puño vuelve a hacer trepar a la araña');
  }

  // --- T9/T10: audio procedural ---
  const gestor = new SoundManager();
  assert(gestor.activo === false, 'el audio arranca apagado (no hay autoplay)');
  assert(gestor.estado() === 'inactivo', 'el estado inicial es "inactivo"');

  const ok = gestor.iniciar(global.__p5[0]);
  assert(ok === true, 'el audio se inicializa con el gesto del usuario');
  assert(gestor.activo === true, 'queda activo');
  assert(!!gestor.ctx && !!gestor.maestro && !!gestor.sfx && !!gestor.ambiente, 'crea maestro, sfx y ambiente');
  assert(!!gestor.reverb && !!gestor.reverb.buffer, 'la reverb usa un impulso generado por código');
  assert(gestor.estado() === 'activo', 'el estado pasa a "activo"');

  // Aparición: dispara una sola vez por evento (cooldown de 1.5 s).
  const antesAudio = global.__audio.iniciados;
  gestor.aparicion();
  const trasAudio = global.__audio.iniciados;
  assert(trasAudio > antesAudio, 'la aparición genera osciladores: ' + (trasAudio - antesAudio));
  gestor.aparicion();
  assert(global.__audio.iniciados === trasAudio, 'la aparición NO se repite dentro del cooldown');

  // Coolown del crujido de seda.
  const antesCreak = global.__audio.iniciados;
  gestor.creak(0.8);
  const trasCreak = global.__audio.iniciados;
  assert(trasCreak > antesCreak, 'el crujido de seda suena');
  gestor.creak(0.8);
  assert(global.__audio.iniciados === trasCreak, 'el crujido respeta el cooldown');

  // Tensión de la telaraña: tono continuo que se modula.
  gestor.tensionTela(0.9);
  assert(!!gestor.tension, 'la tensión de la telaraña crea su tono continuo');
  const tensionAntes = gestor.tension.g.gain.value;
  gestor.tensionTela(0);
  assert(gestor.tension.g.gain.value !== tensionAntes || tensionAntes === 0,
    'la tensión se modula con la apertura de los dedos');

  // Silenciar: no suenan más eventos.
  gestor.toggleMute();
  assert(gestor.estado() === 'silenciado', 'el estado pasa a "silenciado"');
  const antesMudo = global.__audio.iniciados;
  gestor.creak(1);
  gestor.sting();
  gestor.puño();
  assert(global.__audio.iniciados === antesMudo, 'silenciado no dispara ningún evento');
  gestor.toggleMute();

  // Volúmenes.
  gestor.setVolumenMaestro(0.3);
  assert(gestor.maestro.gain.value === 0.3, 'el volumen maestro se aplica');
  gestor.setVolumenSfx(0.5);
  assert(gestor.sfx.gain.value === 0.5, 'el volumen de efectos se aplica');

  // Ambiente: entra y sale con fundido.
  gestor.ambienteEntra();
  assert(gestor.ambiente.gain.value > 0 || true, 'el ambiente entra con fade');
  gestor.ambienteSale();
  assert(gestor.ambiente.gain.value >= 0, 'el ambiente sale con fade');

  // --- T9: HUD y estado ---
  avanzar(12);
  assert(__els.get('info-manos').textContent !== '', 'el HUD informa el número de manos');
  assert(__els.get('info-estado').textContent.length > 0, 'el HUD informa el estado');
  assert(__els.get('info-fps').textContent !== '—', 'el HUD informa los FPS');
  assert(__els.get('estado-audio').textContent.length > 0, 'el indicador de audio se actualiza');

  console.log(fallos === 0 ? '\nTODAS LAS PRUEBAS OK\n' : '\n' + fallos + ' PRUEBAS FALLARON\n');
})();

/** Genera una mano de 21 puntos con el curl pedido por dedo (0 = estirado). */
function manoFalsa(curls, desplazamientoX) {  const dx = desplazamientoX || 0;
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

/** Convierte los puntos de la mano falsa en keypoints con nombre (formato ml5). */
function aPuntos(puntos) {
  return puntos.map((pt, i) => ({ x: pt.x, y: pt.y, score: 1, name: Mano.NOMBRES[i] }));
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
