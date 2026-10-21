# Especificaciones de proyecto

## Funcionamiento general de la aplicación

La aplicación es una instalación interactiva Halloween en el navegador. El usuario ve una araña negra (black widow) generada con p5.js que sigue y reacciona a su mano detectada por webcam. Todo el audio se genera en tiempo real con p5.sound.js (Web Audio API). No hay archivos de audio externos.

## Stack tecnológico

| Capa | Tecnología | Versión / fuente |
|------|------------|------------------|
| Animación e interacción | p5.js | 1.11.1 (CDN) |
| Síntesis de audio | p5.sound.js | 1.11.1 (CDN, mismo release que p5.js) |
| Hand tracking | ml5.js | Última estable (CDN) |
| Audio backend | Web Audio API vía p5.sound.js | Nativo del navegador |

- CDNs: cdnjs o unpkg, con versiones congeladas y compatibles entre sí.
- p5.sound.js se carga después de p5.js y antes del sketch propio.
- ml5.js se carga por separado para el módulo de hand tracking.

## Estructura de archivos

```
index.html      -> CDNs, esqueleto DOM, controles de audio, indicador de estado
sketch.js       -> Loop p5, araña, integración con ml5.js, disparadores de eventos de sonido
sound.js        -> SoundManager y todos los generadores de sonido procedurales
style.css       -> UI de controles de sonido y estado (no afecta el comportamiento de audio)
```

## Arquitectura de audio (sound.js)

### SoundManager

Responsable del ciclo de vida del audio:

- Estados: `INACTIVE` (antes del gesto del usuario), `ACTIVE` (audio listo), `SUSPENDED` (contexto suspendido por pestaña oculta o similar).
- `initAudio()`: llamado tras el clic en **"ACTIVATE SOUND"**. Resume el `AudioContext` y crea los nodos maestros (ganancia maestra, ganancia SFX, ganancia ambiente, reverb compartido).
- `setMasterVolume(v)`, `setSfxVolume(v)`, `setAmbientVolume(v)`, `toggleMute()`.
- `isAudioActive()`: booleano para que el sketch decida si puede disparar sonidos.
- Limpieza de nodos temporales al terminar cada sonido (oscillators, envelopes, filters).

Todas las síntesis usan `p5.Oscillator`, `p5.Noise`, `p5.Envelope`, `p5.Filter`, `p5.Reverb` y `p5.Delay` cuando proceda.

### Sonidos definidos

#### 1. AppearanceSound — Aparición de la araña (una sola vez)

Disparado cuando la mano pasa de `no detectada` a `detectada` y la araña aparece genuina (no por cada frame). Cooldown mínimo entre apariciones: **1500 ms**.

Componentes (todos p5.sound.js):

- **Sub-bass drone**: `p5.Oscillator('sine')`, 40–60 Hz, ataque 0.4 s, release 1.2 s.
- **Horror glissando**: `p5.Oscillator('sawtooth')`, barrido 150 Hz → 40 Hz en 0.8 s (o inverso), envelope corto.
- **Whisper fantasma**: `p5.Noise('brown')` → `p5.Filter('lowpass', 800–1200 Hz, resonancia moderada)` → LFO lento en frecuencia de corte.
- **Acento metálico/resonante**: dos `p5.Oscillator('sine')` a 440 Hz y 554 Hz, decay 0.3 s.
- **Cola reverberante**: `p5.Reverb` con decay 1.5 s aplicado al conjunto.

Solo se reproduce si `isAudioActive()` es true.

#### 2. FingerMovement — Clicks de seda / dedos

Cada dedo significativo que se mueve genera un click/chirrido breve y agudo.

- Umbral de activación: movimiento > **15 píxeles** entre frames consecutivos del landmark del dedo.
- Cooldown por dedo: **250 ms**.
- Pitch y volumen responden a la intensidad (velocidad) del movimiento.
- Sonido: `p5.Noise('white')` → filtro pasa-alto, envelope de ataque/release muy cortos (click limpio sin pop).

#### 3. LegMovement — Clicks de patas

Extensiones rápidas de las patas de la araña producen clicks secos y escasos.

- Umbral: velocidad de extensión > umbral definido por frame.
- Cooldown: **400 ms** global (no por pata, para evitar superposición).
- Sonido: burst de `p5.Noise('white')` muy corto con filtro pasa-bajo y envelope rápido.

#### 4. WebTension — Tono de tela de araña

Cuando los dedos se separan (web se estira), suena un tono delgado y aterrador.

- Entrada: distancia entre punta de índice y pulgar (o equivalente de landmarks de ml5).
- Frecuencia mapeada: **200 Hz** (dedos juntos) → **800 Hz** (dedos muy separados).
- Solo suena mientras haya estiramiento sostenido; fade out al relajar.
- Oscilador `sine` con leve modulación de amplitud para sensación de cuerda temblorosa.

#### 5. SwingWhoosh — Balanceo de la araña

Cuando la araña se balancea con fuerza.

- Entrada: velocidad de movimiento de la araña en pantalla.
- Umbral: velocidad > umbral definido.
- Intensidad proporcional a la velocidad.
- Sonido: `p5.Noise('brown')` → `p5.Filter('lowpass')` con barrido de frecuencia según velocidad.

#### 6. FistSting — Acento defensivo (puño cerrado)

Cuando la mano se cierra en puño.

- Detección: landmarks de ml5 (distancias entre puntas de dedos y palma, o gesture classification si está disponible).
- Disparo solo en la transición abierta → cerrado. No se repite mientras el puño permanece cerrado.
- Cooldown mínimo entre puños: **1000 ms**.
- Sonido: glissando descendente rápido (200 Hz → 60 Hz en 0.2 s) + burst metálico breve.

#### 7. SuddenMovement — Sting / skitter por movimiento brusco

Movimiento fuerte y rápido de la mano.

- Umbral: velocidad de la mano > umbral definido por frame.
- Cooldown: **600 ms**.
- Sonido: barrido de frecuencia rápido + ruido de skitter filtrado.

#### 8. AmbientBed — Atmósfera continua (incluido en MVP)

Sonido de fondo mientras la araña está activa.

- Drone bajo evolutivo: `p5.Oscillator('sine')` 55–70 Hz con LFO lento en frecuencia y amplitud.
- Ruido filtrado lento cambiante.
- Movimiento disonante sutil: dos tonos cercanos con batimiento (ej. 110 Hz y 116 Hz).
- Textura de alta frecuencia muy ocasional y silenciosa.
- Volumen siempre bajo para que los SFX resalten.
- Fade in al aparecer la araña, fade out al desaparecer o inactivarse.
- Nunca se deja un oscilador fuerte funcionando indefinidamente.

## Integración con hand tracking (ml5.js)

- `ml5.handDetector()` o el modelo de manos disponible en la versión estable de ml5.js.
- Datos consumidos por `sound.js` a través del sketch:
  - Mano detectada / mano perdida.
  - Landmarks de punta de dedos (índice, pulgar, etc.) para distancia y velocidad.
  - Estado de puño cerrado / abierto.
  - Velocidad de movimiento de la mano y de la araña.
- El sketch actúa como puente: ml5 da datos → sketch evalúa umbrales → `sound.js` reproduce el evento correspondiente.
- Webcam y audio son independientes: si falla la webcam, el audio sigue disponible (y viceversa), aunque sin interacción no haya disparos automáticos.

## Controles de usuario (index.html + style.css)

- Botón **"ACTIVATE SOUND"**: inicializa o resume el contexto de audio tras un gesto real del usuario. Sin él no hay sonido automático.
- Toggle **Mute / Unmute**.
- Slider **Volumen maestro** (0–100 %).
- Slider **Volumen SFX** (0–100 %).
- Slider **Volumen ambiente** (0–100 %).
- Indicador sutil de estado de audio: `Audio: Inactivo`, `Audio: Activo`, `Audio: Silenciado`.

## Reglas de mezcla y performance

- Canales separados: ambiente y SFX con ganancias independientes.
- Máximo de eventos simultáneos limitado para evitar acumulación.
- Cooldowns en eventos repetitivos (dedos, puño, movimiento brusco, patas).
- Envelopes de ataque/release cortos en todos los sonidos transitorios para evitar clicks/pops.
- No hay clipping: ganancia maestra limitada, sub-bass controlado (sin frecuencias extremas excesivas).
- Cambios de volumen y frecuencia suavizados (no saltos bruscos).
- Limpieza de nodos temporales al finalizar cada sonido.
- El procesamiento de audio no bloquea el hilo principal de p5 ni la detección de manos.

## Flujo de inicialización

1. Usuario abre la página. Audio en estado `INACTIVE`.
2. Usuario hace clic en **"ACTIVATE SOUND"** → `initAudio()` resume el contexto y activa ganancias.
3. La webcam se inicia (independiente del audio).
4. Al detectarse la mano por primera vez y activarse el audio, suena `AppearanceSound` una vez.
5. Durante la interacción, ml5 alimenta datos al sketch y los eventos de sonido se disparan según umbrales y cooldowns.
6. Si la mano se pierde, la araña desaparece, el ambiente hace fade out, y `AppearanceSound` no se retriggera hasta que la interacción se reinicie genuina (pasados los 1500 ms de cooldown).

## Definition of Done (Audio)

1. Suena un sonido Halloween creepy cuando la araña aparece genuina, solo después de activar el audio.
2. Movimientos individuales de dedos producen SFX responsivos (clicks/chirridos de seda).
3. La tensión de la tela (dedos separados) y el balanceo de la araña afectan los tonos generados.
4. Cerrar el puño dispara un acento defensivo distinto, sin repetición continua.
5. Todos los efectos esenciales se sintetizan con p5.sound.js (ningún MP3/WAV/prerrograbado).
6. Los sonidos no se disparan cada frame ni se convierten en bucle de ruido incontrolado (cooldowns y umbrales aplicados).
7. El usuario puede ajustar volumen y silenciar la experiencia.
8. El sistema de sonido funciona junto al hand tracking real por webcam.
9. No hay sonido audible forzado antes de la activación por gesto del usuario.
10. La experiencia permanece responsiva y estable (audio no interfiere con tracking ni animación).
11. Existe indicador visible del estado de audio y controles de mute/volúmenes separados para ambiente y SFX.

## Dirección creativa

Sonido de instalación oscura de Halloween: la mano del usuario controla una viuda negra viva a través de seda encantada. El audio refuerza la interacción física, nunca la abruma. Todo es procedural, oscuro y cinemático.
