# Feature: black-widow-spiders — Arañas viuda negra colgando de mis dedos

Objetivo: experiencia interactiva en el navegador (cero build step, todo por CDN) donde la webcam detecta una o dos manos y de la punta de cada dedo cuelga una araña viuda negra con hilo de seda, con física de péndulo, reaction al curl y a la velocidad, más un sistema de sonido procedural Halloween (p5.sound.js) en una fase posterior.
Rama: `feature/black-widow-spiders` (se crea en el primer work-unit commit) · Entrega: `ask-on-risk` · Runner de tests: no hay runner automático (proyecto sin build/npm); verificación = carga manual en `localhost` + `node --check` sobre cada JS.

## Specs

### Stack y archivos (spec.md §4)

- S1 — "p5.js 1.11.x: `https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.3/p5.min.js`"
- S2 — "ml5.js v1: `https://unpkg.com/ml5@1/dist/ml5.min.js` (usar `ml5.handPose()`)"
- S3 — "Archivos: `index.html`, `sketch.js`, `spider.js`, `rope.js`, `hand.js`. Sin otras dependencias."
- S4 — "Sin backend, sin frameworks, sin bundlers, sin npm." / "Sin modelos 3D ni imágenes externas: todo se dibuja proceduralmente con p5.js."

### Requisitos funcionales (spec.md §5, verbatim)

- S5 — "RF-01: Cuando la página cargue, el sistema SHALL pedir permiso de cámara y mostrar el video en espejo (flip horizontal) como fondo, oscurecido."
- S6 — "RF-02: Mientras haya una mano detectada, el sistema SHALL seguir los 21 keypoints y usar las puntas (thumb_tip, index_finger_tip, middle_finger_tip, ring_finger_tip, pinky_finger_tip) como puntos de anclaje."
- S7 — "RF-03: Por cada punta de dedo SHALL existir una cuerda de seda simulada (Verlet, 12 a 20 segmentos con constraints de distancia) anclada a esa punta."
- S8 — "RF-04: En el extremo libre de cada cuerda SHALL colgar una araña viuda negra."
- S9 — "RF-05: Cuando la mano se mueva, las arañas SHALL balancearse por inercia (péndulo) con gravedad y amortiguación."
- S10 — "RF-06: Cuando un dedo se doble (curl), la cuerda de ese dedo SHALL acortarse y la araña SUBIR. Cuando se extienda, SHALL alargarse y la araña BAJAR."
- S11 — "RF-07: Cuando un dedo se mueva rápido, SHALL oscilar más fuerte y la araña SHALL agitar las patas."
- S12 — "RF-08: Cuando una mano desaparezca, sus arañas SHALL caer con gravedad y desvanecerse en ~1 s. Cuando reaparezca, SHALL volver a engancharse."
- S13 — "RF-09: Cuando las dos manos estén presentes, el sistema SHALL soportar hasta 10 arañas sin caída notable de FPS."
- S14 — "RF-10: Cada dedo SHALL tener su propia longitud de hilo, tamaño de araña y fase de animación (variación aleatoria ±15 %)."

### Aspecto de la araña (spec.md §6, verbatim)

- S15 — "Viuda negra: cuerpo negro brillante, abdomen globoso y cefalotórax pequeño."
- S16 — "Marca de reloj de arena roja en la parte ventral del abdomen, visible porque cuelga y se voltea al rotar."
- S17 — "8 patas finas, articuladas en 3 segmentos (coxa-fémur-tibia) con cinemática inversa simple (2-bone IK) o interpolación suave."
- S18 — "Las patas SHALL moverse con un ciclo de caminata/pataleo tipo \"colgando\", asimétrico y con ruido (Perlin noise), nunca mecánico."
- S19 — "Brillo especular sutil en el abdomen (gradiente o highlight)."
- S20 — "La araña SHALL rotar según el ángulo del último segmento de la cuerda."
- S21 — "Hilo de seda: línea fina blanquecina semitransparente, con ligero brillo."

### Requisitos no funcionales (spec.md §7, verbatim)

- S22 — "RNF-01: 30 FPS o más en un portátil promedio."
- S23 — "RNF-02: Latencia percibida baja: suavizar keypoints con lerp (factor 0.3-0.5) para evitar temblor sin añadir lag."
- S24 — "RNF-03: Código modular, comentado en español, sin variables globales innecesarias."
- S25 — "RNF-04: El modelo de hand pose SHALL cargarse una sola vez; usar `detectStart` (callback continuo) en lugar de llamar detect en cada frame."
- S26 — "RNF-05: Mostrar un mensaje de estado (\"Cargando modelo…\", \"Muestra tu mano\") y manejar el error si se deniega la cámara."

### Diseño técnico (spec.md §8, verbatim)

- S27 — "Flujo: `preload` (crea handPose) → `setup` (canvas, video, detectStart) → `gotHands` (guarda resultados) → `draw` (video espejo → actualizar cuerdas → actualizar arañas → render)."
- S28 — "`hand.js`: normaliza coordenadas (espejo + escala video→canvas), suaviza puntas, calcula curl por dedo (distancia punta-muñeca vs. longitud del dedo) y velocidad."
- S29 — "`rope.js`: clase `Rope` (Verlet): `pin(x, y)`, `setLength(l)`, `update(gravity, damping)`, `endPoint()`, `endAngle()`."
- S30 — "`spider.js`: clase `Spider`: cuerpo, 8 patas con IK, `update(ropeEnd, angle, speed)`, `draw()`."
- S31 — "`sketch.js`: orquesta todo y gestiona el ciclo de vida de arañas por mano/dedo (Map con clave `handedness-fingerIndex`)."
- S32 — "Parámetros ajustables en un objeto `CONFIG` al inicio de `sketch.js` (gravedad, amortiguación, segmentos, longitud base, tamaño araña, suavizado)."

### Plan de tareas (spec.md §9, verbatim) y criterios de aceptación (§10)

- S33 — Tarea 1: "`index.html` con CDNs y canvas; probar que carga sin errores en consola."
- S34 — Tarea 2: "Cámara en espejo + `handPose` mostrando los 21 keypoints como puntos de debug (toggle con tecla `D`)."
- S35 — Tarea 3: "Suavizado de puntas y cálculo de curl/velocidad por dedo."
- S36 — Tarea 4: "Clase `Rope` (Verlet) anclada a las 5 puntas, con visualización simple."
- S37 — Tarea 5: "Clase `Spider` estática con cuerpo, marca roja y 8 patas dibujadas."
- S38 — Tarea 6: "Animación de patas con IK + ruido, rotación según la cuerda."
- S39 — Tarea 7: "Conectar curl → longitud del hilo, velocidad → agitación."
- S40 — Tarea 8: "Manejo de aparición/desaparición de manos (caída y fade)."
- S41 — Tarea 9: "Optimización, mensajes de estado y pulido visual."
- S42 — "[ ] Abrir `index.html` y ver 5 arañas colgando de una mano." / "[ ] Mover la mano rápido hace que las arañas se balanceen de forma creíble." / "[ ] Doblar un dedo sube solo la araña de ese dedo." / "[ ] Las patas nunca se ven rígidas ni se desconectan del cuerpo." / "[ ] Con dos manos hay 10 arañas y se mantiene fluido." / "[ ] Sin errores en consola; permiso de cámara denegado muestra un mensaje claro."

### Audio Halloween (spec adjunto §15, verbatim — fase posterior)

- S43 — "All essential sound effects must be generated procedurally in real time using the Web Audio capabilities exposed by p5.sound.js. Do not use external MP3, WAV, or prerecorded audio files."
- S44 — "Implement an accessible **\"ACTIVATE SOUND\"** control or equivalent first-interaction mechanism that initializes or resumes the audio context after a real user gesture."
- S45 — "Use separate volume controls for ambience and sound effects." / "Provide a mute/unmute control and a master volume slider." / "Display a subtle sound status indicator."
- S46 — DoD: "1. A creepy Halloween sound plays when the spider genuinely appears, after audio activation." … "10. The experience remains responsive and stable."
- S47 — Contrato: el sonido "SHALL responder directamente a la aparición de la araña, al hand tracking, a los movimientos de los dedos y a los gestos."

## Tasks

| ID  | S# | Tarea | Ruta | Estado | Commit |
|-----|----|-------|------|--------|--------|
| T1  | S1-S4, S33, S5 | `index.html` con CDNs + canvas + estado | inline | hecho | (pendiente commit) |
| T2  | S6, S25, S26, S34, S42 | Cámara en espejo + handPose + 21 keypoints debug (tecla `D`) | inline | hecho | (pendiente commit) |
| T3  | S28, S35, S23 | Suavizado de puntas + curl + velocidad por dedo (`hand.js`) | inline | pendiente | — |
| T4  | S29, S36, S7 | Clase `Rope` (Verlet) anclada a las 5 puntas | inline | pendiente | — |
| T5  | S30, S37, S15, S16, S17, S19, S21 | Clase `Spider` estática: cuerpo, marca roja, 8 patas | inline | pendiente | — |
| T6  | S38, S39, S18, S20 | Animación de patas con IK + ruido + rotación | inline | pendiente | — |
| T7  | S10, S11, S14 | curl → longitud del hilo, velocidad → agitación | inline | pendiente | — |
| T8  | S12, S13 | Caída y fade de arañas al perder la mano; 2 manos / 10 arañas | inline | pendiente | — |
| T9  | S22, S41 | Optimización, mensajes de estado, pulido visual | inline | pendiente | — |
| T10 | S43-S47 | Sistema de audio procedural Halloween (p5.sound.js) | inline | pendiente | — |
| T11 | S42 | `README.md` con cómo ejecutar (`python -m http.server` o Live Server) | inline | pendiente | — |

Ruta declarada: todo inline salvo trigger de escritura en paralelo o de backstop de contexto (no se dispararon hasta ahora).

## Log

- L1 (2026-10-20, usuario, verbatim): "Lee @spec.md y construye el proyecto siguiendo el plan de tareas en orden.
   Empieza solo por las tareas 1 y 2, y detente para que yo pruebe antes de continuar."
- L2 (2026-10-20, usuario, adjunto): spec §15 "Halloween Audio System — Procedural Sound Design" (p5.js + p5.sound.js por CDN, todo procedural, botón "ACTIVATE SOUND", mezclas, cooldowns, ambiente). Se incorpora como fase T10, después del plan de 9 tareas, para no romper el orden pedido.
- L3 (2026-10-20, verificación): el spec adjunto S46/S43 pide p5.sound.js. CDN chequeado: `cdnjs /p5.sound/2.0.0` → 404, `unpkg p5.sound@2.0.0` → 404, `jsdelivr gh p5js/p5.sound@v2.0.0` → 404. Sí responde 200 `cdnjs /p5.js/1.11.3/addons/p5.sound.min.js`, pero su banner dice "p5.sound Version: 1.0.1 - 2021-05-25" (p5.sound legacy empaquetado con p5.js 1.x). DECISIÓN: resolver la URL de p5.sound v2 en la fase T10 verificando una ruta viva; no se agrega un script p5.sound roto al index.html de T1.
- L4 (2026-10-20, hallazgo técnico): el error previo del usuario "ml5 handDetector no tiene método detect" viene de usar la API de ml5 0.x. La API de ml5@1 (1.4.0) es: `ml5.handPose(modelo, opciones, cb)` devuelve la instancia sincrónicamente; `instancia.ready` es una promesa que resuelve cuando el modelo cargó; `instancia.detectStart(elementoVideo, callback)` corre el loop continuo; `instancia.detect(elemento, cb)` es async. Opciones de handPose: `runtime` ('mediapipe' | 'tfjs', default 'tfjs'), `maxHands` (default 2), `modelType` ('lite' | 'full', default 'full'), `flipHorizontal` (default false), `solutionPath` (default `https://cdn.jsdelivr.net/npm/@mediapipe/hands`).
- L5 (2026-10-20, hallazgo técnico): con `runtime: 'mediapipe'`, cada mano del resultado trae `{ keypoints:[{x,y,score,name} x21 en píxeles del video, keypoints3D:[...], handedness:'Left'|'Right', confidence }`. Los nombres son los de MediaPipe: wrist, thumb_cmc, thumb_mcp, thumb_ip, thumb_tip, index_finger_mcp/pip/dip/tip, middle_finger_*, ring_finger_*, pinky_finger_*.
- L6 (2026-10-20, decisión): DECISIÓN: el modelo corre con `runtime: 'mediapipe'` (no el default 'tfjs') porque entrega keypoints ya en píxeles y `handedness`, y porque MediaPipe corre fuera del hilo principal de JS. DECISIÓN: el espejado se hace en el canvas (`translate(width,0); scale(-1,1)`) y se invierte `x` al mapear los keypoints, en vez de usar `flipHorizontal` del modelo, para que el mapeo sea explícito y no dependa del runtime.
- L7 (2026-10-20, decisión): DECISIÓN: el permiso de cámara se pide primero con un `getUserMedia` de diagnóstico (para poder mostrar un mensaje claro si se deniega, RNF-05) y después se crea el `createCapture` de p5; si el diagnóstico falla, no se abre la captura.
- L8 (2026-10-20, estructura): DECISIÓN: el CSS va embebido en `index.html` y el JS se organiza con p5 en modo instancia (`new p5(esquema)`) para no ensuciar el scope global (RNF-03); `hand.js` expone un único objeto `Mano`.
- L9 (2026-10-20, ruido conocido): ml5@1 embebido genera en Firefox el warning "Error en el mapeo fuente: URL constructor: is not a valid URL" (WASM interno de la librería). No es un error de la app (memoria previa del mismo repo).
- L10 (2026-10-20, T1/T2): implementados `index.html`, `sketch.js` y `hand.js`. Verificación: `node --check` OK en los tres JS; URLs de CDN verificadas 200 (p5 1.11.3, ml5@1 → 1.4.0); API de ml5 verificada contra el dist real. Falta la prueba del usuario en navegador (cámara + keypoints).
