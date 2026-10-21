# Viuda negra colgando de mis dedos

Experiencia interactiva en el navegador: la webcam detecta tu mano y de la punta
de cada dedo cuelga una **araña viuda negra** en un hilo de seda, como títeres.
La araña se balancea con inercia, sube cuando dobrás un dedo, se agita cuando
movés la mano rápido y cae con gravedad si dejás de mostrar la mano.

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
| Activar el sonido | botón **ACTIVATE SOUND** (arriba a la derecha) |
| Volumen general, efectos y ambiente | deslizadores del panel de audio |
| Silenciar todo | casilla *Silenciar* |

El sonido **no arranca solo**: el navegador exige un gesto del usuario antes de
dejar sonar nada. El botón lo activa una sola vez y después alcanza.

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
- **Ambiente**: drone evolutivo con ruido filtrado y LFO lento, que entra y sale
  con fundidos cuando aparecen y desaparecen las arañas.

## Estructura

```
index.html   CDNs, HUD, panel de audio
sketch.js    orquestación: cámara, modelo, cuerdas, arañas, audio, render
hand.js      keypoints, suavizado, curl y velocidad por dedo
rope.js      clase Rope: cuerda de seda con Verlet
spider.js    clase Spider: cuerpo, marca roja y 8 patas con IK
sound.js     SoundManager: todo el audio procedural
```

El detalle de la lógica de cada archivo (decisiones, por qué, y qué se ajustó)
está en `odd/tasks/black-widow-spiders.md`.

## Ajustes

Los parámetros están en el objeto `CONFIG` al inicio de `sketch.js`: gravedad,
amortiguación, cantidad de segmentos, largo del hilo, tamaño de la araña,
suavizado, cuánto se acorta el hilo al doblar un dedo y los umbrales de los
sonidos. El tamaño y los largos de las patas están en `spider.js`.

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
