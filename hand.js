/**
 * hand.js — Datos de la mano: keypoints, suavizado, curl y velocidad.
 *
 * ml5 v1 con `runtime: 'mediapipe'` devuelve por cada mano detectada:
 *   {
 *     keypoints:   [{ x, y, score, name }] × 21  -> en píxeles del video original
 *     keypoints3D: [{ x, y, z, score, name }] × 21 -> coordenadas 3D normalizadas
 *     handedness:  'Left' | 'Right'
 *     confidence:  0..1
 *   }
 *
 * Pipeline: ml5 -> extraer() -> mapa (espejo + escala) -> suavizado (lerp)
 *           -> curl por dedo -> velocidad por punta.
 */

const Mano = (() => {
  /** Índices de los 21 landmarks de MediaPipe Hands (orden oficial). */
  const CLAVES = {
    MUNECA: 0,
    PULGAR_MCP: 2,
    PULGAR_PUNTA: 4,
    INDICE_MCP: 5,
    INDICE_PUNTA: 8,
    MEDIO_MCP: 9,
    MEDIO_PUNTA: 12,
    ANULAR_MCP: 13,
    ANULAR_PUNTA: 16,
    MENIQUE_MCP: 17,
    MENIQUE_PUNTA: 20
  };

  /** Puntas de dedo: son los anclajes de las arañas (pulgar → menique). */
  const PUNTAS = [4, 8, 12, 16, 20];

  /** Nombres de los 21 landmarks, en el mismo orden de índice. */
  const NOMBRES = [
    'wrist',
    'thumb_cmc', 'thumb_mcp', 'thumb_ip', 'thumb_tip',
    'index_finger_mcp', 'index_finger_pip', 'index_finger_dip', 'index_finger_tip',
    'middle_finger_mcp', 'middle_finger_pip', 'middle_finger_dip', 'middle_finger_tip',
    'ring_finger_mcp', 'ring_finger_pip', 'ring_finger_dip', 'ring_finger_tip',
    'pinky_finger_mcp', 'pinky_finger_pip', 'pinky_finger_dip', 'pinky_finger_tip'
  ];

  /** Esqueleto de la mano: pares de índices, para el modo debug. */
  const CONEXIONES = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17]
  ];

  /**
   * Cadenas de falanges para medir el curl: `base` es la articulación de la que
   * se mide la distancia a la punta, y `cadena` son las falanges que se suman
   * para obtener la longitud extendida de referencia.
   */
  const CADENAS = [
    { nombre: 'pulgar', base: 1, cadena: [2, 3, 4] },
    { nombre: 'indice', base: 5, cadena: [6, 7, 8] },
    { nombre: 'medio', base: 9, cadena: [10, 11, 12] },
    { nombre: 'anular', base: 13, cadena: [14, 15, 16] },
    { nombre: 'menique', base: 17, cadena: [18, 19, 20] }
  ];

  /**
   * Normalización del curl: una punta pegada a la base (ratio ≈ 0.25) cuenta
   * como dedo totalmente cerrado, así que el rango útil se divide por 0.75.
   */
  const FACTOR_CURL = 0.75;

  /**
   * Extrae los 21 keypoints de una mano detectada por ml5.
   * @param {object} mano        resultado de ml5 (una mano)
   * @param {number} anchoVideo  ancho natural del video, para el fallback
   * @param {number} altoVideo   alto natural del video, para el fallback
   * @returns {Array<{x:number,y:number,z:number,score:number,name:string}>|null}
   */
  function extraer(mano, anchoVideo, altoVideo) {
    if (!mano) return null;

    let puntos = mano.keypoints;

    // Fallback: si el runtime devolvió `landmarks` normalizados (0..1), escalamos.
    if (!puntos || puntos.length < 21) {
      if (!mano.landmarks || mano.landmarks.length < 21) return null;
      puntos = mano.landmarks.map((p, i) => ({
        x: p.x * anchoVideo,
        y: p.y * altoVideo,
        z: p.z,
        score: 1,
        name: NOMBRES[i]
      }));
    }

    return puntos.slice(0, 21).map((p, i) => ({
      x: p.x,
      y: p.y,
      z: p.z ?? 0,
      score: p.score ?? 1,
      name: p.name || NOMBRES[i]
    }));
  }

  /**
   * Mapa de coordenadas video→canvas.
   * El video se dibuja espejado (RF-01), por eso la X se invierte.
   */
  function crearMapa(anchoVideo, altoVideo, anchoCanvas, altoCanvas) {
    const escalaX = anchoVideo > 0 ? anchoCanvas / anchoVideo : 1;
    const escalaY = altoVideo > 0 ? altoCanvas / altoVideo : 1;

    return {
      anchoVideo,
      altoVideo,
      escalaX,
      escalaY,
      diagonal: Math.hypot(anchoCanvas, altoCanvas),
      aCanvasX: (x) => anchoCanvas - x * escalaX,
      aCanvasY: (y) => y * escalaY
    };
  }

  /**
   * Curl por dedo: 0 = dedo estirado, 1 = dedo totalmente encogido.
   *
   * Medida la distancia de la articulación base del dedo a su punta y la
   * compara con la suma de las falanges de ese dedo (spec.md §8 pide comparar
   * la distancia de la punta con la longitud del dedo).
   *
   * DECISIÓN: la distancia se toma contra la base del dedo y no contra la
   * muñeca. Con la muñeca, un pulgar estirado (que apunta hacia un lado) o un
   * dedo muy abierto dan un "curl" falso, porque la distancia muñeca→punta
   * depende de la pose de la mano y no de quanto el dedo esté doblado. Contra
   * la base, la medida es invariante a la rotación de la mano.
   */
  function calcularCurl(puntos) {
    const curls = [];

    for (const cadena of CADENAS) {
      const base = puntos[cadena.base];
      const punta = puntos[cadena.cadena[cadena.cadena.length - 1]];
      if (!base || !punta) { curls.push(0); continue; }

      // Longitud extendida del dedo: la suma de sus falanges.
      let referencia = 0;
      let anterior = base;
      for (const indice of cadena.cadena) {
        const p = puntos[indice];
        if (!p) { referencia = 0; break; }
        referencia += Math.hypot(p.x - anterior.x, p.y - anterior.y);
        anterior = p;
      }

      if (referencia <= 0) { curls.push(0); continue; }

      const distancia = Math.hypot(punta.x - base.x, punta.y - base.y);
      const ratio = distancia / referencia;   // 1 = estirado, ~0.25 = plegado
      curls.push(Math.max(0, Math.min(1, (1 - ratio) / FACTOR_CURL)));
    }

    return curls;
  }

  /**
   * Gestos reconocidos (Fase 2, Bloque 1).
   *
   * DECISIÓN: el reconocedor vive acá y no en un archivo nuevo, porque es una
   * derivación de los datos de la mano (curl + keypoints) y el spec §4 fija la
   * lista de archivos del proyecto.
   */
  const GESTOS = {
    ninguno: { id: 'ninguno', nombre: 'Ninguno' },
    abierta: { id: 'abierta', nombre: 'Mano abierta' },
    puno: { id: 'puño', nombre: 'Puño' },
    pellizco: { id: 'pellizco', nombre: 'Pellizco' },
    indice: { id: 'indice', nombre: 'Índice' },
    paz: { id: 'paz', nombre: 'Paz' }
  };

  /**
   * Clasifica el gesto de una mano a partir de su curl y sus keypoints.
   *
   * Todas las medidas son invariantes a la escala y a la rotación de la mano:
   * el curl ya lo es, y la distancia del pellizco se normaliza con el tamaño
   * de la mano (muñeca → nudillo del medio).
   *
   * @param {object} mano      { curl: number[5], puntos: [{x,y} × 21] }
   * @param {object} opciones  { umbralExtendido, umbralDoblado, umbralPellizco, umbralPuno }
   * @returns {object} gesto    { id, nombre }
   */
  function clasificar(mano, opciones) {
    const cfg = Object.assign({
      umbralExtendido: 0.42,
      umbralDoblado: 0.58,
      umbralPellizco: 0.42,
      umbralPuno: 0.62
    }, opciones);

    const curls = mano && mano.curl ? mano.curl : null;
    const puntos = mano && mano.puntos ? mano.puntos : null;
    if (!curls || curls.length < 5 || !puntos || puntos.length < 21) {
      return GESTOS.ninguno;
    }

    const extendido = (i) => curls[i] < cfg.umbralExtendido;
    const doblado = (i) => curls[i] > cfg.umbralDoblado;

    // Tamaño de la mano: normaliza las distancias.
    const muneca = puntos[0];
    const nudillo = puntos[9];
    const tamano = Math.hypot(nudillo.x - muneca.x, nudillo.y - muneca.y) || 1;

    // Distancia entre las puntas del pulgar y del índice, normalizada.
    const pulgar = puntos[4];
    const indice = puntos[8];
    const cercania = Math.hypot(pulgar.x - indice.x, pulgar.y - indice.y) / tamano;

    // 1. Pellizco: las puntas del pulgar y del índice se tocan. Se descarta si
    //    el índice o el pulgar están muy doblados, porque en un puño las puntas
    //    también se tocan y ahí lo que manda es el puño.
    if (cercania < cfg.umbralPellizco && !doblado(1) && !doblado(0)) {
      return GESTOS.pellizco;
    }

    // 2. Puño: el curl medio supera el umbral y los cuatro dedos largos están
    //    doblados.
    const medio = (curls[0] + curls[1] + curls[2] + curls[3] + curls[4]) / 5;
    if (medio > cfg.umbralPuno && doblado(1) && doblado(2) && doblado(3) && doblado(4)) {
      return GESTOS.puno;
    }

    // 3. Mano abierta: los cuatro dedos largos estirados y el pulgar no
    //    enroscado (el pulgar casi siempre tiene algo de curl).
    if (extendido(1) && extendido(2) && extendido(3) && extendido(4)
      && curls[0] < cfg.umbralDoblado + 0.15) {
      return GESTOS.abierta;
    }

    // 4. Paz: índice y medio extendidos, anular y menique doblados.
    if (extendido(1) && extendido(2) && doblado(3) && doblado(4)) {
      return GESTOS.paz;
    }

    // 5. Índice: sólo el índice extendido, el resto doblado.
    if (extendido(1) && doblado(2) && doblado(3) && doblado(4)) {
      return GESTOS.indice;
    }

    return GESTOS.ninguno;
  }

  /**
   * Seguimiento de gestos: un gesto tiene que verse en varios frames seguidos
   * antes de confirmarse, si no el detector parpadea entre "puño" y "abierto"
   * mientras la mano se mueve.
   */
  class Gestos {
    constructor() {
      this.estados = new Map();  // handedness -> { gesto, candidato, frames, cambio }
      this.contador = 0;
    }

    /**
     * @param {Array}  manos     manos con { handedness, curl, puntos }
     * @param {object} opciones  { framesEstables, ...umbrales del clasificador }
     * @returns {Array} una entrada por mano: { id, gesto, cambio, frames }
     */
    actualizar(manos, opciones) {
      const cfg = Object.assign({ framesEstables: 2 }, opciones);
      const frame = ++this.contador;
      const salida = [];

      for (const mano of manos || []) {
        const id = mano.handedness || 'mano';
        const bruto = clasificar(mano, cfg);

        let estado = this.estados.get(id);
        if (!estado) {
          // La mano recién aparece: se adopta el gesto sin avisar cambio, para
          // no disparar el sonido de un puño que ya estaba cerrado.
          estado = {
            gesto: bruto,
            candidato: bruto,
            frames: 0,
            cambio: false,
            frame: frame
          };
          this.estados.set(id, estado);
        } else {
          const anterior = estado.gesto.id;

          if (bruto.id === estado.gesto.id) {
            estado.candidato = bruto;
            estado.frames = 0;
          } else if (bruto.id === estado.candidato.id) {
            estado.frames++;
            if (estado.frames >= cfg.framesEstables) {
              estado.gesto = bruto;
              estado.frames = 0;
            }
          } else {
            estado.candidato = bruto;
            estado.frames = 1;
          }

          estado.cambio = estado.gesto.id !== anterior;
          estado.frame = frame;
        }

        salida.push({
          id: id,
          gesto: estado.gesto,
          cambio: estado.cambio,
          frames: estado.frames
        });
      }

      // Manos que ya no se ven: se limpian (igual que en Seguimiento).
      for (const [id, estado] of this.estados) {
        if (frame - estado.frame > 1) this.estados.delete(id);
      }

      return salida;
    }
  }

  /**
   * Seguimiento de las manos: suaviza los keypoints y calcula curl y velocidad.
   * Una instancia por sketch; adentro guarda el estado de cada mano detectada.
   */
  class Seguimiento {
    constructor() {
      this.manos = new Map();  // handedness -> estado
      this.contador = 0;       // frames procesados
    }

    /**
     * Actualiza el estado con los últimos resultados de ml5.
     *
     * @param {Array}  resultados  manos devueltas por ml5
     * @param {object} mapa        mapa de coordenadas (Mano.crearMapa)
     * @param {number} dt          segundos transcurridos desde el frame anterior
     * @param {object} opciones    { suavizado, factorVelocidad, saltoMaximo }
     * @returns {Array} una entrada por mano visible:
     *                 { handedness, puntos, puntas, curl }
     */
    actualizar(resultados, mapa, dt, opciones) {
      const cfg = Object.assign({ suavizado: 0.35, factorVelocidad: 0.4, saltoMaximo: 0.15 }, opciones);
      const dtSeg = Math.max(0.0001, Math.min(dt || 0.016, 0.1));
      const frame = ++this.contador;

      const salida = [];

      for (const resultado of resultados || []) {
        const crudo = extraer(resultado, mapa.anchoVideo, mapa.altoVideo);
        if (!crudo) continue;

        // El flip ya está resuelto en el mapa, así que no hay que invertir nada más.
        const medidos = crudo.map((p) => ({
          x: mapa.aCanvasX(p.x),
          y: mapa.aCanvasY(p.y),
          z: p.z,
          score: p.score,
          name: p.name
        }));

        const id = resultado.handedness || 'mano';
        let estado = this.manos.get(id);

        // Mano nueva, mano que reaparece o salto grande: se reinicia el suavizado
        // para que el hilo no viaje por toda la pantalla (RNF-02 sin destellos).
        const salto = estado
          ? Math.hypot(medidos[0].x - estado.puntos[0].x, medidos[0].y - estado.puntos[0].y)
          : Infinity;
        const perdida = estado ? frame - estado.frame : Infinity;
        const reiniciar = !estado || perdida > 1 || salto > mapa.diagonal * cfg.saltoMaximo;

        if (reiniciar) {
          estado = {
            frame: frame,
            puntos: medidos.map((p) => ({ x: p.x, y: p.y, z: p.z, score: p.score, name: p.name })),
            velocidadesX: new Array(21).fill(0),
            velocidadesY: new Array(21).fill(0)
          };
          this.manos.set(id, estado);
        } else {
          // Suavizado por lerp: elimina el temblor sin agregar latencia (RNF-02).
          for (let i = 0; i < 21; i++) {
            const p = estado.puntos[i];
            const nuevo = medidos[i];
            const x = p.x + (nuevo.x - p.x) * cfg.suavizado;
            const y = p.y + (nuevo.y - p.y) * cfg.suavizado;
            // La velocidad se mide con el desplazamiento real (no el suavizado),
            // porque refleja cuánto se mueve la mano en verdad; después se promedia
            // para que no dé saltos.
            const vx = (nuevo.x - p.x) / dtSeg;
            const vy = (nuevo.y - p.y) / dtSeg;
            estado.velocidadesX[i] += (vx - estado.velocidadesX[i]) * cfg.factorVelocidad;
            estado.velocidadesY[i] += (vy - estado.velocidadesY[i]) * cfg.factorVelocidad;
            p.x = x;
            p.y = y;
            p.z = nuevo.z;
            p.score = nuevo.score;
          }
          estado.frame = frame;
        }

        const curl = calcularCurl(estado.puntos);
        const puntas = PUNTAS.map((indice, i) => {
          const p = estado.puntos[indice];
          const vx = estado.velocidadesX[indice];
          const vy = estado.velocidadesY[indice];
          return {
            indice: i,
            x: p.x,
            y: p.y,
            vx: vx,
            vy: vy,
            velocidad: Math.hypot(vx, vy),
            curl: curl[i]
          };
        });

        salida.push({
          handedness: resultado.handedness || id,
          puntos: estado.puntos,
          puntas: puntas,
          curl: curl
        });
      }

      // Estados de manos que ya no se ven: se limpian para no acumular basura.
      // Se tolerate un frame perdido; al reaparecer, el suavizado se reinicia
      // en vez de interpolar desde una posición vieja.
      for (const [id, estado] of this.manos) {
        if (frame - estado.frame > 1) this.manos.delete(id);
      }

      return salida;
    }
  }

  return {
    CLAVES,
    PUNTAS,
    NOMBRES,
    CONEXIONES,
    CADENAS,
    GESTOS,
    extraer,
    crearMapa,
    calcularCurl,
    clasificar,
    Seguimiento,
    Gestos
  };
})();
