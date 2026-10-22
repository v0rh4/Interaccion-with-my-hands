# Viuda negra colgando de mis dedos

Experiencia interactiva en el navegador: la webcam detecta tu mano y de la punta
de cada dedo cuelga una **araña viuda negra** en un hilo de seda, como títeres.
La araña se balancea con inercia, sube cuando dobrás un dedo, se agita cuando
movés la mano rápido y cae con gravedad si dejás de mostrar la mano.

Además reconoce **gestos** (puño, mano abierta, pellizco, índice y paz): el
nombre del gesto aparece en el HUD y cada gesto tiene su propio sonido.

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

## Gestos y el puño

El reconocedor mira el **curl** de cada dedo (ya se calculaba para el largo del
hilo) y la distancia entre las puntas del pulgar y del índice, normalizada por
el tamaño de la mano. No depende de la escala de la imagen ni de cómo gires la
mano.

| Gesto | Cómo se reconoce | Qué pasa |
|---|---|---|
| Mano abierta | los cuatro dedos largos estirados | las arañas cuelgan largo |
| Puño | los cuatro dedos largos doblados | las arañas se repliegan y suben por el hilo |
| Pellizco | las puntas del pulgar y del índice se tocan, con el índice apenas doblado | la seda se tensa y cruje |
| Índice | sólo el índice queda estirado | pataleo |
| Paz | índice y medio estirados | pataleo |

Un gesto se confirma recién después de **2 frames seguidos**, así el HUD no
parpadea entre dos gestos mientras te movés. El nombre del gesto se ve en el
HUD (arriba a la izquierda) y, con la tecla `D`, junto a la muñeca.

### Qué hace el puño

Al cerrar el puño, las arañas de esa mano **se repliegan**: el hilo se acorta
(la araña sube casi hasta la punta del dedo) y las patas se recogen contra el
cuerpo, con el pataleo calmado. Al abrir la mano, la defensa se deshace: el
hilo se alarga y las arañas vuelven a bajar y a balancearse.

El repliegue es gradual (no hay teletransporte) y el hilo sigue siendo física
Verlet, así que las arañas viajan por el hilo y siguen oscilando.

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
- **Gestos**: el puño dispara el acento defensivo; abrir la mano, un whoosh
  (las arañas bajan); el pellizco, un crujido de seda; la paz y el índice, un
  pataleo. Cada gesto suena sólo al cambiar, no en cada frame.
- **Ambiente**: drone evolutivo con ruido filtrado y LFO lento, que entra y sale
  con fundidos cuando aparecen y desaparecen las arañas.

## Estructura

```
index.html   CDNs, HUD, panel de audio
sketch.js    orquestación: cámara, modelo, cuerdas, arañas, audio, render
hand.js      keypoints, suavizado, curl y velocidad por dedo, y gestos
rope.js      clase Rope: cuerda de seda con Verlet
spider.js    clase Spider: cuerpo, marca roja y 8 patas con IK
sound.js     SoundManager: todo el audio procedural
```

El detalle de la lógica de cada archivo (decisiones, por qué, y qué se ajustó)
está en `odd/tasks/black-widow-spiders.md`.

## Ajustes

Los parámetros están en el objeto `CONFIG` al inicio de `sketch.js`: gravedad,
amortiguación, cantidad de segmentos, largo del hilo, tamaño de la araña,
suavizado, cuánto se acorta el hilo al doblar un dedo, los umbrales de los
sonidos y los del reconocedor de gestos (`CONFIG.gestos`: qué curl cuenta como
dedo estirado, cuándo es un pellizco, cuántos frames tarda en confirmar un
gesto, cuánto se repliega el hilo con el puño y con qué rapidez). El tamaño y
los largos de las patas están en `spider.js`.

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
