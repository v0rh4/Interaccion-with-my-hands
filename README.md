# Viuda negra colgando de mis dedos

Experiencia interactiva en el navegador: la webcam detecta tu mano y de la punta
de cada dedo cuelga una **araña viuda negra** en un hilo de seda, como títeres.
La araña se balancea con inercia, sube cuando dobrás un dedo, se agita cuando
movés la mano rápido y cae con gravedad si dejás de mostrar la mano.

Además reconoce **gestos**: si cerrás el puño, las arañas trepan por su hilo y
se esconden en la palma; al abrir la mano salen disparadas y vuelven a colgar.
Y la escena está a oscuras: una **linterna** sigue la palma y solo se ve lo que
ella ilumina.

Todo es procedural: no hay modelos 3D, ni imágenes, ni archivos de audio. Cero
build step, cero npm, cero backend.

![stack](https://img.shields.io/badge/p5.js-1.11.3-blue) ![stack](https://img.shields.io/badge/ml5.js-v1-orange) ![stack](https://img.shields.io/badge/audio-p5.sound.js--procedural-red)

## Cómo ejecutarlo

La cámara **exige `localhost` o https**: abrir el `index.html` con doble clic
(`file://`) no funciona.

```bash
# Opción 1: servidor propio con Python
python -m http.server 8000
# después abrí http://localhost:8000

# Opción 2: Live Server de VS Code
#   right click sobre index.html → Open with Live Server
```

Al abrirlo, el navegador pide permiso de cámara: **aceptalo**.

### Requisitos del navegador

- **WebGL habilitado** (obligatorio: MediaPipe Hands, el motor de ml5, sube los
  frames a la GPU). En Chrome y Edge viene de fábrica. En Firefox puede estar
  apagado si la aceleración por hardware está desactivada: revisá
  `about:support` → *Gráficos* → **WebGL: Enabled**, o poné
  `webgl.force-enabled = true` en `about:config`.
- Una webcam.

## Controles

| Acción | Control |
|---|---|
| Ver los 21 keypoints y los valores de curl/velocidad | tecla `D` |
| Prender/apagar la feature del puño | tecla `F` |
| Prender/apagar la linterna | tecla `L` |
| Activar el sonido | botón **ACTIVATE SOUND** (arriba a la derecha) |
| Volumen general, efectos y ambiente | deslizadores del panel de audio |
| Silenciar todo | casilla *Silenciar* |

El sonido **no arranca solo**: el navegador exige un gesto del usuario antes de
dejar sonar nada. El botón lo activa una sola vez y después alcanza.

## Gestos y el puño (Fase 2)

El reconocedor vive en `gestures.js` y mide dos cosas: el **curl de los cuatro
dedos** (índice, medio, anular y meñique; el pulgar se ignora) y la **separación
entre las puntas**, normalizada por el tamaño de la mano (muñeca → nudillo del
medio, así no depende de la escala ni de cómo gires la mano).

### Puño → trepar y esconderse

- **Cerrar el puño**: los cuatro dedos por encima de **0.75** sostenidos
  **150 ms**. La histéresis evita el parpadeo: con el puño ya cerrado se
  mantiene hasta bajar de **0.5**.
- Al cerrarlo, las arañas de esa mano **trepan** por su hilo (patas alternadas,
  cada una a su ritmo ±20 %), se achican hasta el **60 %** y al llegar a la
  palma **se esconden**: no se dibuja ni la araña ni su hilo.
- **Abrir la mano**: cada araña escondida **sale disparada** desde la palma con
  un impulso radial aleatorio, escalonadas hasta **250 ms** entre una y otra, y
  con las patas abiertas en "susto" (se recuperan en ~0.5 s). El hilo se estira
  detrás y las trae de vuelta: vuelven a colgar.
- Si abrís la mano antes de que terminen de trepar, vuelven a colgar sin más.
- Si la mano desaparece con arañas escondidas, se aplica el comportamiento de
  siempre: caen con gravedad y se desvanecen en ~1 s.

Cada araña pasa por `HANGING → CLIMBING → HIDDEN → LAUNCHING → HANGING`.

Con la tecla `D` se ve, junto a la muñeca, si la mano está en **puño** y la
**separación** de cada par de dedos (las telarañas de la Fase 2 la van a usar).

## Linterna y oscuridad (Fase 2)

La escena se ve a oscuras y **solo la palma ilumina**:

- **Capa de oscuridad** al 90 % sobre el video (`darkness`), así que nunca queda
  negro total: la luz ambiental (~10 %) siempre deja entrever algo del video.
- **Un agujero de luz por mano**, centrado en la palma (promedio de la muñeca y
  los nudillos), dibujado con `destination-out`. El radio escala con el **tamaño
  de la mano**, **crece al abrirla** y **se encoge con el puño**: si cerrás el
  puño te quedás casi sin luz.
- **Parpadeo** con Perlin noise (±6 % de radio e intensidad), más fuerte un
  instante cuando una araña sale disparada.
- **El video se desatura y se tiñe en frío** (verdoso/azulado). Usa `filter` del
  canvas cuando el navegador lo soporta y `tint()` cuando no (Safari viejo).
- **Arañas e hilos van por encima** de la oscuridad, con el brillo modulado por
  su distancia a la luz (nunca por debajo del 35 %). Los **ojos rojos de la
  araña no se atenúan**: brillan siempre.
- **Viñeta** radial en los bordes, con el gradiente cacheado (no se recalcula
  por frame).
- Sin manos, la linterna **se desvanece sola** en ~0.5 s hasta la luz ambiental
  y vuelve cuando mostrás la mano otra vez.

Con `L` se prende y se apaga toda la feature (útil para depurar).

## Qué suena

Todo se genera en tiempo real con la Web Audio API de p5.sound.js:

- **Aparición**: sub-bass drone + glissando descendente + susurro filtrado con
  LFO + acento metálico (tritono) y cola de reverberación con impulso generado
  por código. Suena una vez por aparición, no en cada frame.
- **Seda al mover los dedos**: chasquido agudo + fricción pasabanda, con
  altura y volumen según la intensidad del movimiento.
- **Pataleo rápido**: ráfaga de chasquidos secos.
- **Tensión de la telaraña**: tono fino y continuo que sigue la apertura de los
  dedos y se apaga cuando relajás la mano.
- **Balanceo**: whoosh grave cuando la araña se sacude.
- **Puño cerrado**: acento defensivo corto (no se repite mientras siga cerrado).
- **Movimiento brusco**: sting disonante muy breve.
- **Puño**: acento defensivo corto cuando el puño se cierra (lo confirma
  `gestures.js`, una vez por flanco y por mano).
- **Lanzamiento**: whoosh grave cuando las arañas salen disparadas al abrir la mano.
- **Ambiente**: drone evolutivo con ruido filtrado y LFO lento, que entra y sale
  con fundidos cuando aparecen y desaparecen las arañas.

## Estructura

```
index.html   CDNs, HUD, panel de audio
sketch.js    orquestación: cámara, modelo, cuerdas, arañas, puño, luz, audio, render
hand.js      keypoints, suavizado, curl, velocidad y apertura por mano
gestures.js  puño (con histéresis) y separación entre dedos
light.js     oscuridad, linterna que sigue la palma y viñeta
rope.js      clase Rope: cuerda de seda con Verlet
spider.js    clase Spider: cuerpo, ojos, marca roja, patas con IK y estados del puño
sound.js     SoundManager: todo el audio procedural
```

El detalle de la lógica de cada archivo (decisiones, por qué, y qué se ajustó)
está en `odd/tasks/black-widow-spiders.md`.

## Ajustes

Los parámetros están en el objeto `CONFIG` al inicio de `sketch.js`: gravedad,
amortiguación, cantidad de segmentos, largo del hilo, tamaño de la araña,
suavizado, cuánto se acorta el hilo al doblar un dedo, los umbrales de los
sonidos, los del reconocedor de gestos (`CONFIG.gestos`: cuándo se considera
puño, cuánto hay que sostenerlo y cuándo se abre una separación de dedos), los
del puño (`CONFIG.puno`: velocidad de trepada, cuánto se acorta el hilo al
llegar arriba, fuerza y escalonado del lanzamiento) y los de la linterna
(`CONFIG.luz`: `darkness`, `ambientLight`, `lightRadiusFactor`, `lightFlicker`,
`vignetteStrength` y el piso de brillo de las arañas). El tamaño y los largos de
las patas están en `spider.js`.

## Tests

No hay build ni runner de tests (el proyecto es sólo HTML + JS), pero hay un
smoke test en Node que stubbea p5, ml5, el DOM y la Web Audio API:

```bash
cd odd/tests
node smoke.js ok            # escenario normal
node smoke.js sin-permiso   # cámara denegada
node smoke.js error-modelo  # fallo al cargar el modelo
node smoke.js sin-webgl     # navegador sin WebGL
```

## Licencia

Uso personal. Las librerías se cargan por CDN: p5.js (LGPL-2.1), p5.sound.js
(LGPL-2.1) y ml5.js (Apache-2.0).
