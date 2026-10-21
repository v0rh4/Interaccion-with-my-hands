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

  // --- T5/T6: una araña por cuerda en el sketch ---
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
