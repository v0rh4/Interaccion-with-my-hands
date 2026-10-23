/**
 * gestures.js — Gestos de la mano con histéresis (Fase 2, Bloque 1).
 *
 * API:
 *   Gestos.actualizar(manos, dt, opciones)     estado del frame, por mano
 *   Gestos.isFist(hand)                        ¿esa mano está en puño?
 *   Gestos.spreadValue(hand, dedoA, dedoB)     separación normalizada entre dos puntas
 *   Gestos.spreadActivo(hand, dedoA, dedoB)    ¿esa separación pasa el umbral (histéresis)?
 *   Gestos.crear()                             instancia aislada (tests)
 *
 * RF-11: puño = el curl de los 4 dedos (índice, medio, anular, meñique) por
 *        encima de 0.75; el pulgar se ignora.
 * RF-12: histéresis: entra con el curl alto sostenido 150 ms, sale por debajo de 0.5.
 * RF-28: la separación entra en 0.35 y sale en 0.25 (la van a usar las telarañas).
 *
 * DECISIÓN: el puño se mide con el promedio de los 4 curls y no con el mínimo:
 * con el mínimo, un dedo apenas menos doblado que el resto bloquea el puño, y
 * 0.75 ya es un umbral alto (un puño real ronda 0.9-1).
 *
 * DECISIÓN: la histéresis se mide en tiempo real (dt) y no en frames, así el
 * umbral de 150 ms se cumple igual a 30 que a 60 FPS.
 *
 * DECISIÓN: el estado vive por mano (clave `handedness`), así que dos manos no
 * se pisan; `crear()` devuelve un detector con estado propio y separado.
 */
const Gestos = (() => {
  /** Dedos que definen el puño; el pulgar queda afuera (RF-11). */
  const DEDOS_PUNO = [1, 2, 3, 4];

  /** Punta de cada dedo, por nombre. */
  const PUNTA_POR_NOMBRE = {
    pulgar: 4,
    indice: 8,
    medio: 12,
    anular: 16,
    menique: 20
  };

  /** Pares de dedos adyacentes que pueden tejer telaraña (RF-28). */
  const PARES_ADYACENTES = [
    ['pulgar', 'indice'],
    ['indice', 'medio'],
    ['medio', 'anular'],
    ['anular', 'menique']
  ];

  /** Valores por defecto de todos los umbrales (se pisan desde CONFIG). */
  const OPCIONES = {
    fistCloseThreshold: 0.75,
    fistOpenThreshold: 0.5,
    fistHoldMs: 150,
    spreadOn: 0.35,
    spreadOff: 0.25
  };

  const NOMBRE_POR_PUNTA = {
    4: 'pulgar',
    8: 'indice',
    12: 'medio',
    16: 'anular',
    20: 'menique'
  };

  function nuevoEstado() {
    return { enPuño: false, sostenido: 0, separaciones: new Map(), frame: 0 };
  }

  /** Curl promedio de los cuatro dedos que definen el puño. */
  function curlDePuno(mano) {
    const curls = mano && mano.curl ? mano.curl : null;
    if (!curls) return 0;
    let suma = 0;
    for (const i of DEDOS_PUNO) suma += curls[i] || 0;
    return suma / DEDOS_PUNO.length;
  }

  /**
   * Índice del landmark de una punta. Acepta el nombre del dedo
   * ('pulgar', 'indice', 'medio', 'anular', 'menique') o un número: 0..4 es el
   * dedo (mismo orden que el curl) y un valor mayor es un landmark directo.
   */
  function indicePunta(dedo) {
    if (typeof dedo === 'number') {
      return dedo < 5 ? [4, 8, 12, 16, 20][dedo] : dedo;
    }
    return PUNTA_POR_NOMBRE[dedo];
  }

  /** Nombre canónico del dedo, para la clave de la histéresis. */
  function clavePunta(dedo) {
    const indice = indicePunta(dedo);
    return NOMBRE_POR_PUNTA[indice] || String(indice);
  }

  /** Tamaño de la mano: muñeca → nudillo del medio. */
  function tamanoMano(puntos) {
    const muneca = puntos[0];
    const nudillo = puntos[9];
    if (!muneca || !nudillo) return 1;
    return Math.hypot(nudillo.x - muneca.x, nudillo.y - muneca.y) || 1;
  }

  /**
   * Separación entre las puntas de dos dedos, normalizada por el tamaño de la
   * mano (RF-28). Es la medida que va a usar la telaraña para decidir si se teje.
   */
  function spreadValue(mano, dedoA, dedoB) {
    if (!mano || !mano.puntos) return 0;
    const a = mano.puntos[indicePunta(dedoA)];
    const b = mano.puntos[indicePunta(dedoB)];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y) / tamanoMano(mano.puntos);
  }

  /** Detector con estado propio (una instancia por sketch o por test). */
  function crear() {
    const estados = new Map();
    let contador = 0;

    /**
     * Actualiza el estado de cada mano con el frame actual.
     *
     * @param {Array}  manos     manos con { handedness, curl, puntos }
     * @param {number} dt        segundos desde el frame anterior
     * @param {object} opciones  umbrales (los de OPCIONES por defecto)
     * @returns {Array} una entrada por mano: { id, enPuño, cambio, curl }
     */
    function actualizar(manos, dt, opciones) {
      const cfg = Object.assign({}, OPCIONES, opciones);
      const frame = ++contador;
      const segundos = Math.max(0, dt || 0);
      const salida = [];

      for (const mano of manos || []) {
        const id = mano.handedness || 'mano';
        let estado = estados.get(id);
        if (!estado) {
          estado = nuevoEstado();
          estados.set(id, estado);
        }

        const curl = curlDePuno(mano);
        const antes = estado.enPuño;

        if (!estado.enPuño) {
          // Para entrar hay que sostener el curl alto 150 ms (RF-12).
          if (curl > cfg.fistCloseThreshold) {
            estado.sostenido += segundos * 1000;
            if (estado.sostenido >= cfg.fistHoldMs) estado.enPuño = true;
          } else {
            estado.sostenido = 0;
          }
        } else if (curl < cfg.fistOpenThreshold) {
          // Para salir alcanza con bajar de 0.5 (RF-12).
          estado.enPuño = false;
          estado.sostenido = 0;
        }

        estado.frame = frame;
        salida.push({
          id: id,
          enPuño: estado.enPuño,
          cambio: estado.enPuño !== antes,
          curl: curl
        });
      }

      // Manos que ya no se ven: se limpian (igual que en Mano.Seguimiento).
      for (const [id, estado] of estados) {
        if (frame - estado.frame > 1) estados.delete(id);
      }

      return salida;
    }

    /** ¿La mano está en puño? Devuelve el estado confirmado del último frame. */
    function isFist(mano) {
      const id = (mano && mano.handedness) || 'mano';
      const estado = estados.get(id);
      return !!estado && estado.enPuño;
    }

    /**
     * ¿La separación entre esos dos dedos supera el umbral? Usa histéresis
     * (RF-28): se activa en spreadOn y no se suelta hasta bajar de spreadOff.
     */
    function spreadActivo(mano, dedoA, dedoB, opciones) {
      const cfg = Object.assign({}, OPCIONES, opciones);
      const id = (mano && mano.handedness) || 'mano';
      const clave = clavePunta(dedoA) + '-' + clavePunta(dedoB);

      let estado = estados.get(id);
      if (!estado) {
        estado = nuevoEstado();
        estados.set(id, estado);
      }

      const valor = spreadValue(mano, dedoA, dedoB);
      const activo = estado.separaciones.get(clave) || false;
      const nuevo = activo ? valor > cfg.spreadOff : valor > cfg.spreadOn;
      estado.separaciones.set(clave, nuevo);
      return nuevo;
    }

    return { actualizar, isFist, spreadActivo };
  }

  const porDefecto = crear();

  return {
    DEDOS_PUNO,
    PARES_ADYACENTES,
    OPCIONES,
    actualizar: porDefecto.actualizar,
    isFist: porDefecto.isFist,
    spreadActivo: porDefecto.spreadActivo,
    spreadValue: spreadValue,
    crear: crear
  };
})();
