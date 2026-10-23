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


---

# FASE 2: Gestos, linterna y telarañas

> La Fase 1 ya funciona. NO romper nada de lo existente. Antes de empezar, hacer commit (`git init` si no existe) para poder volver atrás.

## 12. Objetivos de la Fase 2
1. Gesto de puño: las arañas trepan por el hilo hasta la palma, se esconden y salen disparadas al abrir la mano.
2. Ambiente oscuro con linterna que sigue la palma y viñeta cinematográfica.
3. Telarañas entre dedos que aparecen al separarlos y se rompen con movimientos bruscos.

## 13. Archivos nuevos
- `gestures.js`: detecta puño y dedos separados con histéresis.
- `light.js`: capa de oscuridad, linterna y viñeta.
- `web.js`: clase `Web` (telaraña con nodos Verlet, crecimiento, rotura, gotas de rocío).
- Se modifican solo lo necesario: `sketch.js`, `spider.js`, `hand.js`, `CONFIG`.

## 14. Feature A: Puño → arañas trepan y se esconden

### Requisitos (EARS)
- RF-11: El sistema SHALL detectar "puño" cuando el curl de los 4 dedos (índice, medio, anular, meñique) supere 0.75 (el pulgar se ignora).
- RF-12: Para evitar parpadeo, el sistema SHALL usar histéresis: entra en puño con curl > 0.75 sostenido 150 ms y sale con curl < 0.5.
- RF-13: Cuando se detecte puño, cada araña de esa mano SHALL pasar al estado `CLIMBING`: sube por el hilo hacia la palma con velocidad propia (±20 %) y las patas se mueven en ciclo de trepada (alternando).
- RF-14: Mientras trepa, la araña SHALL escalarse ligeramente hacia abajo (hasta 60 %) y al llegar a la palma pasa a `HIDDEN` (no se dibuja, el hilo se oculta).
- RF-15: Cuando se abra la mano, cada araña `HIDDEN` SHALL pasar a `LAUNCHING`: sale disparada hacia afuera desde la palma con impulso radial aleatorio, el hilo se extiende con rebote elástico y luego vuelve a `HANGING`. Las salidas se escalonan (retraso aleatorio de 0 a 250 ms por araña).
- RF-16: Al lanzarse, las patas SHALL abrirse en "susto" y recuperarse en ~0.5 s.
- RF-17: El estado de puño SHALL tener prioridad sobre el curl individual de RF-06.
- RF-18: Si la mano desaparece mientras las arañas están ocultas, SHALL aplicarse el comportamiento de RF-08 (caen y se desvanecen).

### Diseño
Máquina de estados por araña: `HANGING → CLIMBING → HIDDEN → LAUNCHING → HANGING`. Las transiciones las dispara `gestures.js` por mano (`isFist(hand)`), no por frame individual.

## 15. Feature B: Linterna y viñeta

### Requisitos (EARS)
- RF-19: El video SHALL oscurecerse y desaturarse (tinte frío verdoso/azulado). Usar `drawingContext.filter` si está disponible y `tint()` como alternativa (Safari no soporta `filter`).
- RF-20: Sobre el video SHALL dibujarse una capa de oscuridad (negro, ~88-92 % de opacidad) en un `createGraphics()` del tamaño del canvas, creado una sola vez.
- RF-21: Por cada mano detectada, SHALL abrirse un "agujero" de luz en esa capa (`globalCompositeOperation = 'destination-out'` con gradiente radial) centrado en la palma (promedio de keypoints 0, 5, 9 y 17).
- RF-22: El radio de la linterna SHALL escalar con el tamaño de la mano (distancia muñeca→nudillo medio × factor), crecer al abrir la mano y reducirse al cerrar el puño (efecto "te quedas casi sin luz").
- RF-23: La luz SHALL parpadear ligeramente con Perlin noise (±6 % de radio e intensidad), más fuerte cuando una araña es lanzada.
- RF-24: Debe existir siempre una luz ambiental mínima (~8-10 %) para que no quede negro total.
- RF-25: Las arañas, hilos y telarañas SHALL dibujarse por encima de la capa oscura, con brillo modulado por su distancia a la linterna (mínimo 35 %). Los ojos rojos de la araña NO se atenúan (brillan siempre).
- RF-26: SHALL aplicarse una viñeta radial en los bordes (gradiente cacheado, no recalculado por frame).
- RF-27: Si no hay manos, la linterna SHALL desvanecerse suavemente a ambiente mínimo (~0.5 s) y volver al reaparecer la mano.

## 16. Feature C: Telarañas entre dedos

### Requisitos (EARS)
- RF-28: Cuando la distancia entre las puntas de dos dedos adyacentes, normalizada por el tamaño de la mano, supere 0.35 (con histéresis, sale en 0.25), SHALL crecer una telaraña entre esos dos dedos. Pares: pulgar-índice, índice-medio, medio-anular, anular-meñique (máx. 4 por mano).
- RF-29: Cada telaraña SHALL anclarse en las dos puntas de los dedos y en los dos nudillos (MCP) correspondientes, formando un sector con hilos radiales desde un centro hacia el borde y anillos en espiral que los conectan.
- RF-30: Los nodos SHALL ser puntos Verlet con resortes hacia su posición base, de modo que la red se deforme y ondule con el movimiento de la mano y vuelva a su forma.
- RF-31: La telaraña SHALL crecer progresivamente en ~0.6 s (radiales primero, luego espirales de adentro hacia afuera).
- RF-32: Cuando la velocidad de una punta anclada supere el umbral `webBreakSpeed`, o la separación exceda 1.6 veces la distancia a la que se creó, la telaraña SHALL romperse: los hilos se sueltan, caen con gravedad y se desvanecen en ~1 s.
- RF-33: Tras romperse, SHALL esperar 1.5 s antes de poder regenerarse.
- RF-34: Los hilos SHALL ser finos (0.6-1 px), blanquecinos y semitransparentes; SHALL haber gotas de rocío (3-6 por telaraña) con un pequeño punto de brillo que reaccionan al movimiento.
- RF-35: Cuando se cierre el puño, las telarañas SHALL colapsarse hacia la palma y desaparecer.
- RF-36: Las arañas colgantes pueden ignorar las telarañas (sin colisión) en esta fase.

## 17. Parámetros nuevos en `CONFIG`
`fistCloseThreshold`, `fistOpenThreshold`, `fistHoldMs`, `climbSpeed`, `launchForce`, `darkness`, `ambientLight`, `lightRadiusFactor`, `lightFlicker`, `vignetteStrength`, `spreadOn`, `spreadOff`, `webRings`, `webRadials`, `webBreakSpeed`, `webRegrowDelay`, `dewDrops`.

## 18. Requisitos no funcionales
- RNF-06: Mantener 30 FPS o más con 10 arañas y hasta 8 telarañas.
- RNF-07: No crear objetos ni gradientes nuevos por frame cuando se puedan cachear.
- RNF-08: Cada feature SHALL poder activarse/desactivarse con una tecla para depurar: `F` (puño), `L` (linterna), `W` (telarañas).
- RNF-09: Comentarios en español y decisiones ambiguas marcadas con `// DECISIÓN:`.

## 19. Plan de tareas (en orden, detenerse al final de cada bloque)

**Bloque 1: Gestos base**
10. Crear `gestures.js` con `isFist(hand)` y `spreadValue(hand, fingerA, fingerB)` usando histéresis, y mostrarlos en el overlay de debug.

**Bloque 2: Puño**
11. Añadir los estados `HANGING/CLIMBING/HIDDEN/LAUNCHING` a `Spider`.
12. Animación de trepada (patas alternadas, escala, hilo que se acorta).
13. Lanzamiento al abrir la mano con impulso escalonado y patas de susto.

**Bloque 3: Linterna**
14. Crear `light.js`: capa de oscuridad + agujero de luz en la palma.
15. Tinte/desaturación del video, parpadeo, viñeta cacheada y fade sin mano.
16. Brillo de arañas según distancia a la luz y ojos rojos que siempre brillan.

**Bloque 4: Telarañas**
17. Clase `Web` estática entre dos dedos (radiales y espirales) con debug.
18. Nodos Verlet y deformación; crecimiento progresivo.
19. Rotura por velocidad/separación, caída, fade y regeneración.
20. Gotas de rocío, colapso con el puño y pulido final.

## 20. Criterios de aceptación de la Fase 2
- [ ] Cerrar el puño: las 5 arañas trepan al unísono (no idéntico) y desaparecen en la palma.
- [ ] Abrir la mano: salen disparadas de a poco y vuelven a colgar sin glitches.
- [ ] El ambiente es oscuro y solo la palma ilumina; la luz se encoge con el puño.
- [ ] Sin mano, la escena queda tenue pero no totalmente negra.
- [ ] Separar los dedos teje telarañas; moverse rápido las rompe y se regeneran.
- [ ] Las teclas `F`, `L`, `W` activan y desactivan cada feature.
- [ ] La Fase 1 sigue funcionando igual y no hay errores en consola.
- [ ] FPS ≥ 30 con dos manos.

## 21. Instrucciones para el agente (Fase 2)
- Lee todo `spec.md`, pero SOLO ejecuta las tareas 10 a 20.
- Haz una pausa al final de cada bloque para que yo pruebe en el navegador.
- No reescribas archivos de la Fase 1 completos; edítalos de forma mínima.
- Si algo choca con la Fase 1, la Fase 2 tiene prioridad en gestos (RF-17).