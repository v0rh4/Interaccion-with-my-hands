# SPEC: Arañas viuda negra colgando de mis dedos (hand tracking)

## 1. Contexto
Experiencia interactiva en el navegador. La cámara web detecta mi mano y de la punta de cada dedo cuelga un hilo de seda con una araña viuda negra, como si fueran títeres. Los movimientos de la mano deben sentirse físicos y realistas.

## 2. Objetivos
- Detectar una o dos manos en tiempo real.
- Una araña por cada dedo detectado (hasta 5 por mano), colgando de su punta.
- Movimiento realista: péndulo, inercia, rebote del hilo y patas que reaccionan.
- Cero build step: todo con CDN, abrible con un `index.html`.

## 3. No objetivos
- Sin backend, sin frameworks, sin bundlers, sin npm.
- Sin sonido ni grabación de video.
- Sin modelos 3D ni imágenes externas: todo se dibuja proceduralmente con p5.js.

## 4. Stack (obligatorio, vía CDN)
- p5.js 1.11.x: `https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.3/p5.min.js`
- ml5.js v1: `https://unpkg.com/ml5@1/dist/ml5.min.js` (usar `ml5.handPose()`)
- Archivos: `index.html`, `sketch.js`, `spider.js`, `rope.js`, `hand.js`. Sin otras dependencias.

## 5. Requisitos funcionales (EARS)
- RF-01: Cuando la página cargue, el sistema SHALL pedir permiso de cámara y mostrar el video en espejo (flip horizontal) como fondo, oscurecido.
- RF-02: Mientras haya una mano detectada, el sistema SHALL seguir los 21 keypoints y usar las puntas (thumb_tip, index_finger_tip, middle_finger_tip, ring_finger_tip, pinky_finger_tip) como puntos de anclaje.
- RF-03: Por cada punta de dedo SHALL existir una cuerda de seda simulada (Verlet, 12 a 20 segmentos con constraints de distancia) anclada a esa punta.
- RF-04: En el extremo libre de cada cuerda SHALL colgar una araña viuda negra.
- RF-05: Cuando la mano se mueva, las arañas SHALL balancearse por inercia (péndulo) con gravedad y amortiguación.
- RF-06: Cuando un dedo se doble (curl), la cuerda de ese dedo SHALL acortarse y la araña SUBIR. Cuando se extienda, SHALL alargarse y la araña BAJAR.
- RF-07: Cuando un dedo se mueva rápido, SHALL oscilar más fuerte y la araña SHALL agitar las patas.
- RF-08: Cuando una mano desaparezca, sus arañas SHALL caer con gravedad y desvanecerse en ~1 s. Cuando reaparezca, SHALL volver a engancharse.
- RF-09: Cuando las dos manos estén presentes, el sistema SHALL soportar hasta 10 arañas sin caída notable de FPS.
- RF-10: Cada dedo SHALL tener su propia longitud de hilo, tamaño de araña y fase de animación (variación aleatoria ±15 %).

## 6. Requisitos de la araña (aspecto realista)
- Viuda negra: cuerpo negro brillante, abdomen globoso y cefalotórax pequeño.
- Marca de reloj de arena roja en la parte ventral del abdomen, visible porque cuelga y se voltea al rotar.
- 8 patas finas, articuladas en 3 segmentos (coxa-fémur-tibia) con cinemática inversa simple (2-bone IK) o interpolación suave.
- Las patas SHALL moverse con un ciclo de caminata/pataleo tipo "colgando", asimétrico y con ruido (Perlin noise), nunca mecánico.
- Brillo especular sutil en el abdomen (gradiente o highlight).
- La araña SHALL rotar según el ángulo del último segmento de la cuerda.
- Hilo de seda: línea fina blanquecina semitransparente, con ligero brillo.

## 7. Requisitos no funcionales
- RNF-01: 30 FPS o más en un portátil promedio.
- RNF-02: Latencia percibida baja: suavizar keypoints con lerp (factor 0.3-0.5) para evitar temblor sin añadir lag.
- RNF-03: Código modular, comentado en español, sin variables globales innecesarias.
- RNF-04: El modelo de hand pose SHALL cargarse una sola vez; usar `detectStart` (callback continuo) en lugar de llamar detect en cada frame.
- RNF-05: Mostrar un mensaje de estado ("Cargando modelo…", "Muestra tu mano") y manejar el error si se deniega la cámara.

## 8. Diseño técnico
**Flujo:**
`preload` (crea handPose) → `setup` (canvas, video, detectStart) → `gotHands` (guarda resultados) → `draw` (video espejo → actualizar cuerdas → actualizar arañas → render).

**Módulos:**
- `hand.js`: normaliza coordenadas (espejo + escala video→canvas), suaviza puntas, calcula curl por dedo (distancia punta-muñeca vs. longitud del dedo) y velocidad.
- `rope.js`: clase `Rope` (Verlet): `pin(x, y)`, `setLength(l)`, `update(gravity, damping)`, `endPoint()`, `endAngle()`.
- `spider.js`: clase `Spider`: cuerpo, 8 patas con IK, `update(ropeEnd, angle, speed)`, `draw()`.
- `sketch.js`: orquesta todo y gestiona el ciclo de vida de arañas por mano/dedo (Map con clave `handedness-fingerIndex`).

**Parámetros ajustables** en un objeto `CONFIG` al inicio de `sketch.js` (gravedad, amortiguación, segmentos, longitud base, tamaño araña, suavizado).

## 9. Plan de tareas (ejecutar en orden, cada una verificable)
1. `index.html` con CDNs y canvas; probar que carga sin errores en consola.
2. Cámara en espejo + `handPose` mostrando los 21 keypoints como puntos de debug (toggle con tecla `D`).
3. Suavizado de puntas y cálculo de curl/velocidad por dedo.
4. Clase `Rope` (Verlet) anclada a las 5 puntas, con visualización simple.
5. Clase `Spider` estática con cuerpo, marca roja y 8 patas dibujadas.
6. Animación de patas con IK + ruido, rotación según la cuerda.
7. Conectar curl → longitud del hilo, velocidad → agitación.
8. Manejo de aparición/desaparición de manos (caída y fade).
9. Optimización, mensajes de estado y pulido visual.

## 10. Criterios de aceptación
- [ ] Abrir `index.html` y ver 5 arañas colgando de una mano.
- [ ] Mover la mano rápido hace que las arañas se balanceen de forma creíble.
- [ ] Doblar un dedo sube solo la araña de ese dedo.
- [ ] Las patas nunca se ven rígidas ni se desconectan del cuerpo.
- [ ] Con dos manos hay 10 arañas y se mantiene fluido.
- [ ] Sin errores en consola; permiso de cámara denegado muestra un mensaje claro.

## 11. Instrucciones para el agente
- Sigue las tareas en orden y no avances sin cumplir la verificación de la anterior.
- No agregues librerías fuera de p5.js y ml5.js.
- Si algo es ambiguo, elige la opción más simple y documéntala en un comentario `// DECISIÓN:`.
- Al terminar, entrega un breve `README.md` con cómo ejecutar (`python -m http.server` o Live Server, porque la cámara requiere localhost/https).