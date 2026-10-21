/**
 * hand.js — Datos de la mano: keypoints, espejo y escala video→canvas.
 *
 * ml5 v1 con `runtime: 'mediapipe'` devuelve por cada mano detectada:
 *   {
 *     keypoints:   [{ x, y, score, name }] × 21  -> en píxeles del video original
 *     keypoints3D: [{ x, y, z, score, name }] × 21 -> coordenadas 3D normalizadas
 *     handedness:  'Left' | 'Right'
 *     confidence:  0..1
 *   }
 *
 * Este módulo sólo normaliza coordenadas. El suavizado, el curl y la velocidad
 * (tarea 3 del plan) se agregan después sobre estas mismas funciones.
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
      aCanvasX: (x) => anchoCanvas - x * escalaX,
      aCanvasY: (y) => y * escalaY
    };
  }

  return { CLAVES, PUNTAS, NOMBRES, CONEXIONES, extraer, crearMapa };
})();
