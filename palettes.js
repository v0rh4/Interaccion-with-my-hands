/**
 * palettes.js — Paletas de color de las arañas (Fase 3, Bloque 6, tareas 23-24).
 *
 * RF-47: cada paleta trae cuatro cosas: color del cuerpo, acento del reloj de
 *        arena, color de los ojos y color del halo emisivo (`null` = sin halo).
 * RF-45/46: el sketch avanza el índice y las arañas interpolarán hacia la
 *        paleta nueva en `colorTransition` segundos (RF-50: con retraso).
 * RF-51: la paleta elegida persiste aunque se prendan otros modos (salvo el
 *        modo monstruo, que la sustituye por la carmesí: RF-69, Bloque 10).
 *
 * DECISIÓN: el spec nombra las paletas y describe los colores ("negro azulado",
 * "cian", "verde ácido"...) pero no da valores RGB, así que se eligieron valores
 * concretos que respetan esa descripción y mantienen el cuerpo oscuro (salvo
 * "Fantasma", que el spec pide blanco hueso).
 */
const Paletas = (() => {
  /** Las seis paletas de RF-47, en orden. */
  const LISTA = [
    { nombre: 'Clásica', cuerpo: [12, 11, 16], acento: [214, 32, 52], ojos: [220, 40, 50], halo: null },
    { nombre: 'Neón azul', cuerpo: [10, 14, 28], acento: [80, 220, 235], ojos: [130, 240, 255], halo: [70, 190, 230] },
    { nombre: 'Veneno', cuerpo: [10, 22, 14], acento: [150, 235, 80], ojos: [180, 255, 120], halo: [120, 220, 80] },
    { nombre: 'Oro', cuerpo: [20, 15, 8], acento: [235, 190, 80], ojos: [255, 215, 130], halo: [230, 180, 80] },
    { nombre: 'Violeta', cuerpo: [20, 12, 26], acento: [230, 80, 220], ojos: [255, 140, 240], halo: [200, 110, 240] },
    { nombre: 'Fantasma', cuerpo: [232, 230, 222], acento: [150, 162, 178], ojos: [255, 255, 255], halo: [215, 225, 255] }
  ];

  /** Cuántas paletas hay (RF-47). */
  function cantidad() {
    return LISTA.length;
  }

  /** La paleta en ese índice, dando la vuelta si se pasa (RF-46). */
  function paleta(indice) {
    const i = ((Math.floor(indice) % LISTA.length) + LISTA.length) % LISTA.length;
    return LISTA[i];
  }

  /** ¿Dos colores son iguales? (para no recrear gradientes al pedo, RNF-11). */
  function iguales(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  }

  /**
   * Mezcla un color hacia otro (lerp por canal) para la transición de RF-45.
   * @param {number[]} desde
   * @param {number[]} hasta  puede ser null (sin halo): devuelve el origen
   * @param {number} t 0..1
   * @returns {number[]} el color mezclado
   */
  function mezclar(desde, hasta, t) {
    if (!hasta) return desde;
    const f = Math.max(0, Math.min(1, t));
    return [
      desde[0] + (hasta[0] - desde[0]) * f,
      desde[1] + (hasta[1] - desde[1]) * f,
      desde[2] + (hasta[2] - desde[2]) * f
    ];
  }

  /**
   * Colores de una araña interpolando hacia una paleta (RF-45).
   * @param {object} actual  colores actuales { cuerpo, acento, ojos, halo }
   * @param {object} objetivo paleta destino
   * @param {number} t 0..1 del avance de la transición
   */
  function interpolar(actual, objetivo, t) {
    return {
      nombre: objetivo.nombre,
      cuerpo: mezclar(actual.cuerpo, objetivo.cuerpo, t),
      acento: mezclar(actual.acento, objetivo.acento, t),
      ojos: mezclar(actual.ojos, objetivo.ojos, t),
      halo: objetivo.halo ? mezclar(actual.halo || objetivo.halo, objetivo.halo, t) : null
    };
  }

  /** Copia independiente de una paleta (para no compartir los arrays). */
  function copia(p) {
    return {
      nombre: p.nombre,
      cuerpo: p.cuerpo.slice(),
      acento: p.acento.slice(),
      ojos: p.ojos.slice(),
      halo: p.halo ? p.halo.slice() : null
    };
  }

  /**
   * El hilo de seda teñido con un 30 % del acento (RF-49). Si se pasa un
   * objeto `destino` se escribe ahí y no se crea nada por frame (RNF-11).
   */
  function tinteHilo(paleta, base, destino) {
    const blanco = base || [226, 220, 205];
    const ac = paleta.acento || paleta.color.acento;
    const r = blanco[0] + (ac[0] - blanco[0]) * 0.3;
    const g = blanco[1] + (ac[1] - blanco[1]) * 0.3;
    const b = blanco[2] + (ac[2] - blanco[2]) * 0.3;
    if (destino) {
      destino.r = r;
      destino.g = g;
      destino.b = b;
      return destino;
    }
    return [r, g, b];
  }

  return {
    LISTA,
    cantidad,
    paleta,
    iguales,
    mezclar,
    interpolar,
    copia,
    tinteHilo
  };
})();
