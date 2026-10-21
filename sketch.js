/**
 * Sketch principal — Araña negra interactiva con hand tracking (ml5.js)
 * y sonido procedural (p5.sound.js vía SoundManager).
 */

let video;
let handDetector;
let hands = [];

// Estado de depuración de cámara
let camStatus = "esperando"; // "esperando" | "permiso" | "activa" | "error" | "bloqueado"
let camErrorMsg = "";

// Estado de la araña
let spider = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  angle: 0,
  swing: 0,
  vx: 0,
  vy: 0
};

// Estado de interacción
let handActive = false;
let handLost = false;
let lastHandPos = { x: 0, y: 0 };
let lastFingerPos = {}; // índice de landmark → {x, y, t}
let fistClosed = false;

// ml5 landmarks de interés (MediaPipe estilo)
const LAND = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_TIP: 8,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20
};

function preload() {
  // Todo es procedural, nada que precargar
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
  fill(10);

  // Inicializar sonido (quedará en espera hasta que el usuario pulse ACTIVATE SOUND)
  soundManager.init();

  // Botón de reintento de cámara
  const retryBtn = document.getElementById('retryCam');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      camStatus = "esperando";
      camErrorMsg = "";
      initCamera();
    });
  }

  // Verificar protocolo (file:// bloquea cámara en muchos navegadores)
  const proto = window.location.protocol;
  if (proto === "file:") {
    camStatus = "error";
    camErrorMsg = "Abres el archivo directamente (file://). Usa un servidor local (Live Server o python -m http.server).";
    console.error(camErrorMsg);
  } else {
    initCamera();
  }
}

function initCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    camStatus = "error";
    camErrorMsg = "Este navegador no soporta getUserMedia.";
    console.error(camErrorMsg);
    return;
  }

  camStatus = "esperando";
  navigator.mediaDevices
    .getUserMedia({ video: true })
    .then(stream => {
      camStatus = "permiso";
      console.log("Permiso de cámara concedido");

      // Crear video de p5 (flipped para espejo)
      video = createCapture(VIDEO, { flipped: true });
      video.size(640, 480);
      video.position(10, 10);
      video.size(160, 120);
      video.style("opacity", "0.6");
      video.style("border", "1px solid #444");

      // Intentar iniciar handDetector de ml5
      try {
        handDetector = ml5.handDetector(video, { flipped: true }, modelReady);
      } catch (e) {
        camStatus = "error";
        camErrorMsg = "ml5 handDetector no disponible: " + e.message;
        console.error(camErrorMsg);
      }
    })
    .catch(err => {
      camStatus = "bloqueado";
      camErrorMsg = "Cámara bloqueada o denegada: " + err.message;
      console.error(camErrorMsg);
    });
}

function modelReady() {
  camStatus = "activa";
  console.log("ml5 handDetector listo");
  detectHands();
}

function detectHands() {
  if (!handDetector) return;
  handDetector.detect(video).then(results => {
    hands = results || [];
    detectHands();
  }).catch(err => {
    console.error("ml5 detect error:", err);
    camStatus = "error";
    camErrorMsg = "Error en detección: " + err.message;
    detectHands();
  });
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  background(15, 12, 16); // fondo oscuro Halloween

  // Actualizar ambiente si suena
  soundManager.updateAmbient();

  // Indicador de cámara / audio en pantalla
  drawStatusHUD();

  // Si la cámara no está activa, no hay interacción posible
  if (camStatus !== "activa") {
    fill(200, 60, 60);
    textAlign(CENTER, CENTER);
    textSize(18);
    text(camErrorMsg || "Cámara no disponible", width / 2, height / 2 - 40);
    textSize(14);
    fill(180);
    text("Usa el botón 'Reintentar cámara' o abre la consola (F12)", width / 2, height / 2 - 10);
    return;
  }

  // Dibujar araña (seguimiento suave)
  spider.x += (spider.targetX - spider.x) * 0.15;
  spider.y += (spider.targetY - spider.y) * 0.15;
  spider.vx = spider.targetX - spider.x;
  spider.vy = spider.targetY - spider.y;
  spider.angle = atan2(spider.vy, spider.vx);

  // Calcular movimiento brusco de la mano
  let handSpeed = 0;
  if (hands.length > 0) {
    const hand = hands[0];
    const lm = hand.landmarks || [];
    const wrist = lm[LAND.WRIST];
    if (wrist) {
      handSpeed = dist(wrist.x, wrist.y, lastHandPos.x, lastHandPos.y);
      lastHandPos = { x: wrist.x, y: wrist.y };
    }
  }

  // Lógica de aparición y sonidos
  if (hands.length > 0 && soundManager.isActive()) {
    const hand = hands[0];
    const lm = hand.landmarks || [];
    const wrist = lm[LAND.WRIST];
    const indexTip = lm[LAND.INDEX_TIP];
    const thumbTip = lm[LAND.THUMB_TIP];
    const middleTip = lm[LAND.MIDDLE_TIP];
    const ringTip = lm[LAND.RING_TIP];
    const pinkyTip = lm[LAND.PINKY_TIP];

    if (!handActive) {
      // Mano acaba de aparecer: sonido de aparición una sola vez
      soundManager.playAppearance();
      soundManager.startAmbient();
      handActive = true;
      handLost = false;
    }

    // Posición de la araña sigue el dedo medio (o muñeca si no hay)
    const follow = middleTip || wrist;
    if (follow) {
      // ml5 devuelve coordenadas del video; mapear al canvas
      const mx = map(follow.x, 0, 640, 0, width);
      const my = map(follow.y, 0, 480, 0, height);
      spider.targetX = mx;
      spider.targetY = my;
    }

    // --- Web tension: distancia pulgar-índice ---
    let tension = 0;
    if (indexTip && thumbTip) {
      const d = dist(indexTip.x, indexTip.y, thumbTip.x, thumbTip.y);
      tension = constrain(d / 120, 0, 1);
    }
    soundManager.setWebTension(tension > 0.05, tension);

    // --- Puño cerrado ---
    let fist = false;
    if (indexTip && thumbTip && wrist) {
      const dIndexThumb = dist(indexTip.x, indexTip.y, thumbTip.x, thumbTip.y);
      const dMiddleWrist = dist(
        middleTip ? middleTip.x : 0,
        middleTip ? middleTip.y : 0,
        wrist.x,
        wrist.y
      );
      fist = dIndexThumb < 45 && dMiddleWrist < 110;
    }

    if (fist && !fistClosed && soundManager.isActive()) {
      soundManager.playFistSting();
      fistClosed = true;
    }
    if (!fist) fistClosed = false;

    // --- Movimiento brusco de la mano ---
    if (handSpeed > 25 && soundManager.isActive()) {
      const intensity = constrain((handSpeed - 25) / 75, 0, 1);
      soundManager.playSuddenSting(intensity);
    }

    // --- Movimiento de dedos individuales ---
    const fingerTips = [LAND.THUMB_TIP, LAND.INDEX_TIP, LAND.MIDDLE_TIP, LAND.RING_TIP, LAND.PINKY_TIP];
    fingerTips.forEach((tipIdx, i) => {
      const tip = lm[tipIdx];
      if (!tip) return;
      const prev = lastFingerPos[tipIdx];
      const nowT = soundManager._now();
      if (prev) {
        const moveDist = dist(tip.x, tip.y, prev.x, prev.y);
        const dt = nowT - prev.t;
        const speed = dt > 0 ? moveDist / dt : 0;
        if (speed > 0.15 && moveDist > 12) {
          const intensity = constrain(speed / 2, 0, 1);
          soundManager.playFingerClick(i, intensity);
        }
      }
      lastFingerPos[tipIdx] = { x: tip.x, y: tip.y, t: nowT };
    });

    // --- Skitter de patas ---
    const spiderSpeed = sqrt(spider.vx * spider.vx + spider.vy * spider.vy);
    if (spiderSpeed > 6 && soundManager.isActive()) {
      soundManager.playLegClick();
    }

    // --- Whoosh por balanceo ---
    if (spiderSpeed > 15 && soundManager.isActive()) {
      const intensity = constrain((spiderSpeed - 15) / 40, 0, 1);
      soundManager.playSwingWhoosh(intensity);
    }

  } else {
    if (handActive) {
      handActive = false;
      handLost = true;
      soundManager.stopAmbient();
      soundManager.setWebTension(false, 0);
      soundManager.lastAppearance = soundManager._now();
    }
  }

  // Dibujar araña
  drawSpider(spider.x, spider.y, spider.angle);

  if (camStatus === "activa" && !handActive) {
    fill(100, 60, 60);
    textAlign(CENTER, CENTER);
    textSize(18);
    text("Muestra tu mano a la cámara", width / 2, height / 2);
  }
}

function drawStatusHUD() {
  fill(0, 0, 0, 150);
  rect(10, 10, 280, 90, 6);
  fill(200);
  textSize(13);
  textAlign(LEFT, TOP);
  text("Cámara: " + camStatus, 20, 18);
  text("Audio: " + (soundManager.isActive() ? "activo" : "inactivo"), 20, 36);
  text("Manos: " + hands.length, 20, 54);
  if (camErrorMsg) {
    fill(255, 100, 100);
    textSize(11);
    text(camErrorMsg, 20, 74);
  }
}

function drawSpider(x, y, angle) {
  push();
  translate(x, y);
  rotate(angle);

  fill(10);
  ellipse(0, 8, 58, 42);
  ellipse(0, -14, 28, 24);
  fill(180, 0, 0);
  ellipse(-7, -20, 5, 5);
  ellipse(7, -20, 5, 5);
  fill(120, 0, 0);
  ellipse(0, 12, 14, 8);

  stroke(10);
  strokeWeight(4);
  noFill();
  for (let i = 0; i < 8; i++) {
    const legAngle = map(i, 0, 8, -HALF_PI * 0.9, HALF_PI * 0.9);
    const len = 48 + sin(frameCount * 0.06 + i * 1.5) * 4;
    beginShape();
    vertex(0, 0);
    curveVertex(cos(legAngle) * len * 0.4, sin(legAngle) * len * 0.4);
    curveVertex(cos(legAngle) * len, sin(legAngle) * len);
    endShape();
  }
  pop();

  stroke(40, 30, 40);
  strokeWeight(1);
  for (let i = 0; i < 6; i++) {
    const a = map(i, 0, 6, 0, TWO_PI);
    line(x, y, x + cos(a) * 70, y + sin(a) * 70);
  }
}
