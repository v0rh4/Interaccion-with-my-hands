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

---

# FASE 3: Poses de mano que cambian a las arañas (color, frenesí, monstruos) + sonidos

> Las Fases 1 y 2 ya funcionan. NO romper nada. Antes de empezar, hacer commit para poder volver atrás.

## 22. Objetivos de la Fase 3
1. **Paz (✌️, índice y medio extendidos):** las arañas cambian de color.
2. **Un puño con la otra mano abierta:** frenesí. Las arañas se sueltan, corren por toda la pantalla y disparan telaraña.
3. **Rock (🤘, índice y meñique extendidos):** las arañas se transforman en monstruos.
4. **Sonido procedural distinto para cada interacción.**

## 23. Stack adicional
- p5.sound (CDN, misma versión que p5): `https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.3/addons/p5.sound.min.js`
- Sin archivos de audio externos: todo se sintetiza con `p5.Oscillator`, `p5.Noise`, `p5.Envelope`, `p5.Filter` (o Web Audio API vía `getAudioContext()`).
- Esto reemplaza el "sin sonido" de los No objetivos de la Fase 1.
- Archivos nuevos: `poses.js`, `audio.js`, `palettes.js`, `frenzy.js`, `webshot.js`, `monster.js`.
- Se modifican de forma mínima: `gestures.js`, `spider.js`, `rope.js`, `light.js`, `sketch.js`, `CONFIG`.

## 24. Sistema de poses (base de todo)

### Requisitos (EARS)
- RF-37: `poses.js` SHALL clasificar cada mano por dedo extendido (`curl < 0.35`) o doblado (`curl > 0.6`). La zona 0.35-0.6 mantiene el estado anterior (histéresis).
- RF-38: **PAZ**: índice y medio extendidos, anular y meñique doblados, pulgar ignorado. Debe sostenerse 250 ms.
- RF-39: **ROCK**: índice y meñique extendidos, medio y anular doblados, pulgar ignorado. Debe sostenerse 300 ms. Se pierde si deja de cumplirse por 300 ms.
- RF-40: **FRENESÍ**: una mano en puño (RF-11/12 de Fase 2) y la otra mano visible y NO en puño. Debe sostenerse 200 ms.
- RF-41: Prioridad de puños (DECISIÓN): una sola mano visible en puño, o dos manos en puño, SHALL conservar el comportamiento de Fase 2 (trepar y esconderse). Solo "puño + otra mano no-puño" activa el frenesí.
- RF-42: Los modos son banderas independientes: `palette` (índice actual), `frenzy` (bool), `monster` (bool). Pueden combinarse (frenesí + monstruos = monstruos sueltos por la pantalla).
- RF-43: Debe existir un overlay de debug (tecla `D`) que muestre la pose detectada por mano y los modos activos.
- RF-44: Teclas para probar sin mano: `1` cambia color, `2` alterna frenesí, `3` alterna monstruos.

## 25. Feature D: Paz → cambio de color

### Requisitos (EARS)
- RF-45: Al entrar en PAZ, SHALL pasar a la siguiente paleta de `palettes.js` con transición suave de ~0.4 s (lerp de color, no corte brusco).
- RF-46: Si PAZ se mantiene más de 1 s, SHALL seguir cambiando a la siguiente paleta cada 1 s. Cooldown mínimo entre cambios: 600 ms.
- RF-47: Paletas (cuerpo / acento del reloj de arena / ojos / brillo):
  1. Clásica: negro / rojo / rojo / sin brillo
  2. Neón azul: negro azulado / cian / cian / brillo cian
  3. Veneno: negro verdoso / verde ácido / verde / brillo verde
  4. Oro: negro / dorado / ámbar / brillo ámbar
  5. Violeta: negro morado / magenta / magenta / brillo violeta
  6. Fantasma: blanco hueso / gris azulado / blanco / brillo blanco
- RF-48: El color SHALL aplicarse al cuerpo, a la marca de reloj de arena, a los ojos y a un halo emisivo (gradiente radial cacheado). El halo debe verse más en la oscuridad de la linterna (se suma a RF-25 de Fase 2).
- RF-49: El hilo de seda SHALL teñirse con un 30 % del color de acento.
- RF-50: Cada araña SHALL cambiar con un retraso aleatorio de 0 a 150 ms (onda, no simultáneo).
- RF-51: La paleta elegida SHALL persistir en los demás modos (excepto monstruos, ver RF-69).

## 26. Feature E: Frenesí (un puño + otra mano abierta)

### Requisitos (EARS)
- RF-52: Al activarse el frenesí, las arañas de TODAS las manos SHALL cortar su hilo (el hilo cae y se desvanece) y caer unos 200 ms antes de empezar a correr.
- RF-53: Las arañas SHALL moverse por TODA la pantalla con comportamiento de dirección (steering):
  - Vagabundeo con Perlin noise, velocidad 150-350 px/s (variación por araña).
  - Cambios bruscos de dirección aleatorios cada 0.4-1.2 s.
  - Rebote suave en los bordes del canvas.
  - Separación simple entre arañas para que no se apilen.
- RF-54: La araña SHALL orientarse según su velocidad. Las patas SHALL animarse en ciclo de carrera (rápido, alternado, con ruido) y el ritmo SHALL escalar con la velocidad.
- RF-55: Las arañas SHALL huir de la palma de la mano abierta (repulsión leve) y evitar el centro de la linterna. Esto da la sensación de estar fuera de control, pero reactivas.
- RF-56: `webshot.js`: cada 1-3 s, una araña aleatoria SHALL disparar telaraña hacia un punto aleatorio (borde, otro punto de pantalla o hacia otra araña).
  - Proyectil: línea de seda que se alarga desde la araña a gran velocidad (~900 px/s), con un hilo que la mantiene unida.
  - Al llegar, se pega con una mini red radial (5-7 radiales, 2 anillos) y un pequeño destello.
  - El hilo y la mini red permanecen ~3 s y se desvanecen.
  - Máximo 12 disparos activos a la vez.
- RF-57: Cuando una araña dispare, SHALL hacer una breve pausa de 150 ms con las patas abiertas.
- RF-58: Al salir del frenesí (se abre el puño, la otra mano desaparece o ya no se cumple RF-40), las arañas SHALL volver corriendo a su dedo en máximo 1.5 s, y al llegar descolgarse con un hilo nuevo (volver a `HANGING`). Los disparos activos se desvanecen.
- RF-59: Si la mano de una araña desaparece durante el frenesí, esa araña SHALL seguir corriendo y no caer.
- RF-60: La linterna SHALL parpadear más fuerte durante el frenesí y las arañas SHALL tener un brillo propio mínimo (60 %) para verse aunque estén lejos de la luz.

## 27. Feature F: Rock → monstruos

### Requisitos (EARS)
- RF-61: Al entrar en ROCK, SHALL activarse el modo monstruo con una transformación de ~0.8 s. Al soltar la pose se mantiene un mínimo de 3 s y revierte en ~1.5 s.
- RF-62: Transformación visual:
  - Escala ×1.6 a ×2.2 (variación por araña).
  - Colmillos (quelíceros) visibles que se abren y cierran.
  - 8 ojos (2 grandes + 6 pequeños), brillando siempre.
  - Espinas/pinchos en el abdomen y púas en las patas.
  - Patas más gruesas y más angulosas, con movimiento tembloroso.
  - Cuerpo con brillo emisivo rojo carmesí pulsante (se ignora la paleta, RF-69).
- RF-63: Comportamiento: el hilo SHALL volverse grueso (1.5-2 px) y oscuro, y la masa de la araña mayor (balanceo más pesado, menos amortiguación).
- RF-64: Cada 2-3 s, un monstruo aleatorio SHALL rugir. Escala con un pulso (+15 % en 200 ms), la boca se abre del todo y la pantalla tiembla 2-4 px durante 300 ms (screen shake).
- RF-65: La linterna SHALL volverse rojiza y parpadear con fuerza (como luz de emergencia). La viñeta aumenta.
- RF-66: En modo monstruo las arañas SHALL poder cerrar el puño y trepar como siempre (Fase 2), pero con patas de monstruo.
- RF-67: Combinación con frenesí: los monstruos SHALL correr más lento (60 % de velocidad) pero con más tamaño y más disparos de red (intervalo 0.8-2 s).
- RF-68: Al revertir, la transformación SHALL ser suave (escala, ojos y colmillos se encogen).
- RF-69: Mientras el modo monstruo está activo, la paleta se sustituye por la monstruosa (carmesí). Al revertir, vuelve la paleta elegida con PAZ.

## 28. Feature G: Sonidos (síntesis procedural)

### Requisitos (EARS)
- RF-70: El navegador bloquea el audio hasta que haya una interacción del usuario. Debe mostrarse "Haz clic para activar el sonido" y llamar `userStartAudio()` con el primer clic o tecla. El resto debe funcionar sin sonido hasta entonces.
- RF-71: Tecla `M` para silenciar o activar el sonido y `+`/`-` para el volumen maestro. Debe existir un limitador para que nunca sature.
- RF-72: Sonidos por interacción:

| Interacción | Sonido |
|---|---|
| **Paz / cambio de color** | Campanita cristalina de 2-3 notas ascendentes (senoidales con envolvente corta). El tono depende del índice de la paleta. |
| **Frenesí: inicio** | Chillido agudo corto (barrido de frecuencia con ruido) + ráfaga de patitas. |
| **Frenesí: loop** | Ruido filtrado (pasa-banda alto) en ráfagas rápidas como patitas corriendo. El volumen y la frecuencia siguen la velocidad media de las arañas. Con pan estéreo según la posición x. |
| **Disparo de telaraña** | "Thwip": ruido con barrido de pasa-altos de 4000 a 800 Hz en ~120 ms + clic suave al pegar. |
| **Frenesí: fin** | Barrido descendente corto (la "recogida"). |
| **Rock / transformación** | Gruñido grave: onda sierra de 55-80 Hz con pasa-bajos ~300 Hz, tremolo LFO ~12 Hz, glide descendente + golpe de sub-bajo. |
| **Rugido de monstruo (RF-64)** | Rugido más fuerte y largo, sierra desafinada + ruido, sincronizado con el screen shake. |
| **Rock: fin** | Whoosh descendente. |
| **Puño (Fase 2): esconderse / salir** | Roce suave de patitas al trepar y un "pop" corto al lanzarse. |

- RF-73: Los sonidos SHALL crearse una sola vez (osciladores y filtros reutilizados). No crear nodos de audio nuevos por frame. Los loops se controlan solo con volumen y parámetros.
- RF-74: Los sonidos de disparo y de loops con muchas arañas SHALL tener un límite de voces (máx. 4 simultáneos) para no saturar.
- RF-75: `audio.js` SHALL exponer una API simple: `Audio.colorChime(i)`, `Audio.frenzyStart()`, `Audio.frenzyUpdate(speed, pan)`, `Audio.frenzyEnd()`, `Audio.webShot()`, `Audio.monsterOn()`, `Audio.monsterRoar()`, `Audio.monsterOff()`, `Audio.hide()`, `Audio.launch()`.

## 29. Parámetros nuevos en `CONFIG`
`peaceHoldMs`, `rockHoldMs`, `frenzyHoldMs`, `colorCooldown`, `colorTransition`, `frenzySpeedMin`, `frenzySpeedMax`, `frenzyTurnMin`, `frenzyTurnMax`, `webShotInterval`, `webShotSpeed`, `maxWebShots`, `monsterScaleMin`, `monsterScaleMax`, `monsterRoarInterval`, `screenShakePx`, `masterVolume`.

## 30. Requisitos no funcionales
- RNF-10: 30 FPS o más con 10 arañas en frenesí, 12 disparos activos y modo monstruo.
- RNF-11: Cachear gradientes de halo y de ojos. No crear objetos por frame.
- RNF-12: Cada feature con su tecla de depuración: `C` (color), `X` (frenesí), `R` (monstruos), `M` (sonido).
- RNF-13: Comentarios en español y `// DECISIÓN:` en lo ambiguo.
- RNF-14: Ningún modo SHALL dejar arañas atrapadas fuera de pantalla. Siempre deben poder volver a su dedo.

## 31. Plan de tareas (en orden, detenerse al final de cada bloque)

**Bloque 5: Poses**
21. Crear `poses.js` con el clasificador (PAZ, ROCK, FRENESÍ) con histéresis y tiempos de sostenimiento. Mostrarlo en el overlay de debug.
22. Integrar la regla de prioridad de puños (RF-41) con `gestures.js`. Probar que la Fase 2 sigue igual.

**Bloque 6: Colores**
23. Crear `palettes.js` y aplicar color a cuerpo, reloj de arena y ojos con lerp.
24. Halo emisivo cacheado, tinte del hilo y cambio escalonado (RF-50).

**Bloque 7: Audio base**
25. Crear `audio.js` con arranque por clic, mute, volumen y limitador.
26. Implementar `colorChime` y conectarlo al cambio de color.

**Bloque 8: Frenesí**
27. Estado `FRENZY` en `Spider`: corte del hilo, caída y movimiento con steering por toda la pantalla.
28. Animación de patas de carrera, orientación y repulsión de la palma.
29. Salida del frenesí: retorno al dedo y re-colgado.
30. Sonidos de frenesí (inicio, loop, fin).

**Bloque 9: Telaraña disparada**
31. Crear `webshot.js`: proyectil con hilo y llegada con mini red.
32. Fade, límite de disparos y pausa de la araña. Sonido `webShot`.

**Bloque 10: Monstruos**
33. Crear `monster.js`: escala, 8 ojos, colmillos, espinas y patas gruesas con transición.
34. Hilo grueso, masa pesada, linterna rojiza, rugido con screen shake.
35. Sonidos de monstruo (transformación, rugido, fin) y reversión suave.

**Bloque 11: Integración**
36. Probar combinaciones (frenesí + monstruos, color + frenesí, puño + monstruos).
37. Optimización, límites de voces, teclas de debug y pulido final.

## 32. Criterios de aceptación de la Fase 3
- [ ] Hacer ✌️ cambia el color de todas las arañas con una onda suave y suena una campanita.
- [ ] Mantener ✌️ sigue ciclando colores cada 1 s.
- [ ] Un puño + la otra mano abierta suelta a las arañas, que corren por toda la pantalla y disparan telaraña con sonido.
- [ ] Un solo puño (una mano visible) sigue haciendo trepar y esconder (Fase 2).
- [ ] Abrir el puño o quitar la mano hace que las arañas vuelvan a sus dedos sin quedar atrapadas.
- [ ] Hacer 🤘 convierte las arañas en monstruos grandes con colmillos, 8 ojos y rugidos, con la pantalla temblando y luz rojiza.
- [ ] Al soltar 🤘 vuelven a la normalidad y recuperan la paleta de color elegida.
- [ ] Frenesí + monstruos funciona (monstruos más lentos y más grandes por la pantalla).
- [ ] `M` silencia y `+`/`-` ajustan el volumen. No hay saturación ni errores de audio.
- [ ] FPS ≥ 30 en el peor caso y sin errores en consola. Las Fases 1 y 2 siguen intactas.

## 33. Instrucciones para el agente (Fase 3)
- Lee todo `spec.md`, pero SOLO ejecuta las tareas 21 a 37.
- Haz una pausa al final de cada bloque para que yo pruebe en el navegador.
- No reescribas archivos de las Fases 1 y 2 completos; edítalos de forma mínima.
- Si algo choca con fases anteriores, aplica las reglas de este documento (RF-41 y RF-69).
- Usa solo p5.js, ml5.js y p5.sound. Todo el audio se sintetiza.