/**
 * poses.js — Poses de mano y modos de la Fase 3 (Bloque 5, tareas 21-22).
 *
 * RF-37: cada dedo se clasifica extendido (`curl < 0.35`) o doblado
 *        (`curl > 0.6`); la zona 0.35-0.6 mantiene el estado anterior.
 * RF-38: PAZ = índice y medio extendidos, anular y menique doblados (el pulgar
 *        se ignora), sostenida 250 ms.
 * RF-39: ROCK = índice y menique extendidos, medio y anular doblados, sostenida
 *        300 ms; se pierde si deja de cumplirse 300 ms.
 * RF-40: FRENESÍ = una mano en puño y la otra visible y NO en puño, 200 ms.
 * RF-41: un puño solo (o dos puños) conserva el comportamiento de la Fase 2.
 * RF-42: los modos son banderas independientes: `palette` (índice), `frenzy`,
 *        `monster`. Se pueden combinar.
 * RF-43: el overlay de debug (tecla D) muestra la pose de cada mano y los modos.
 * RF-44 / RNF-12: teclas de prueba sin mano (`1`/`C` color, `2`/`X` frenesí,
 *        `3`/`R` monstruos).
 *
 * DECISIÓN: el puño no es una "pose" de este clasificador (ya lo resuelve
 * `gestures.js` en la Fase 2): acá se consume su resultado para el frenesí y se
 * informa aparte para el overlay.
 *
 * DECISIÓN: las teclas de depuración no pisan la detección de poses: cada modo
 * guarda su bandera manual y el modo efectivo es "por pose O manual" (si no,
 * apenas movieras la mano se apagaría lo que prendiste con la tecla).
 *
 * DECISIÓN: la salida de PAZ usa el mismo margen que ROCK (300 ms) aunque el
 * spec sólo pide el sostenimiento de entrada: sin ese margen, el cambio de
 * paleta (RF-45/46) se dispararía con cualquier microcorte de la detección.
 */
const Poses = (() => {
  /** Valores por defecto de los tiempos y umbrales (se pisan desde CONFIG). */
  const OPCIONES = {
    extendido: 0.35,
    doblado: 0.6,
    peaceHoldMs: 250,
    rockHoldMs: 300,
    frenzyHoldMs: 200,
    monsterMinMs: 3000
  };

  /** ¿La mano tiene la forma de PAZ? (pulgar ignorado, RF-38). */
  function formaPaz(dedos) {
    return dedos[1] && dedos[2] && !dedos[3] && !dedos[4];
  }

  /** ¿La mano tiene la forma de ROCK? (pulgar ignorado, RF-39). */
  function formaRock(dedos) {
    return dedos[1] && !dedos[2] && !dedos[3] && dedos[4];
  }

  /** Detector con estado propio (una instancia por sketch o por test). */
  function crear() {
    const estados = new Map();   // handedness -> { dedos, pose, candidata, sosten, perdida }
    const modos = { palette: 0, frenzy: false, monster: false };
    const manuales = { palette: 0, frenzy: false, monster: false };
    let contador = 0;
    let sostenFrenesi = 0;
    let sostenMonstruo = 0;
    let monstruoPorPose = false;

    function nuevoEstado() {
      // Los dedos arrancan extendidos: la primera lectura los acomoda.
      return {
        dedos: [true, true, true, true, true],
        pose: 'ninguna',
        candidata: 'ninguna',
        sosten: 0,
        perdida: 0,
        frame: 0
      };
    }

    /** RF-37: clasifica cada dedo, con la zona muerta como histéresis. */
    function clasificarDedos(estado, curls, cfg) {
      for (let i = 0; i < 5; i++) {
        const c = curls[i] === undefined ? 0 : curls[i];
        if (c < cfg.extendido) estado.dedos[i] = true;
        else if (c > cfg.doblado) estado.dedos[i] = false;
        // Entre 0.35 y 0.6 el dedo se queda como estaba (RF-37).
      }
    }

    /**
     * Actualiza las poses y los modos con el frame actual.
     *
     * @param {Array}  manos     manos con { handedness, curl, enPuño }
     * @param {number} dt        segundos desde el frame anterior
     * @param {object} opciones  tiempos y umbrales (los de OPCIONES por defecto)
     * @returns {object} { manos: [{ id, pose, dedos, enPuño }], modos, fresco }
     */
    function actualizar(manos, dt, opciones) {
      const cfg = Object.assign({}, OPCIONES, opciones);
      const paso = Math.max(0.0001, Math.min(dt || 0.016, 0.25));
      const frame = ++contador;
      const lista = manos || [];
      const salida = [];

      for (const mano of lista) {
        const id = mano.handedness || 'mano';
        let estado = estados.get(id);
        if (!estado) {
          estado = nuevoEstado();
          estados.set(id, estado);
        }

        clasificarDedos(estado, mano.curl || [], cfg);

        // La forma que se está cumpliendo manda; el pulgar no influye.
        const enPaz = formaPaz(estado.dedos);
        const enRock = formaRock(estado.dedos);
        const objetivo = enPaz ? 'paz' : (enRock ? 'rock' : 'ninguna');
        const sostenNecesario = enPaz ? cfg.peaceHoldMs : cfg.rockHoldMs;

        if (objetivo !== 'ninguna') {
          if (estado.candidata === objetivo) estado.sosten += paso * 1000;
          else {
            estado.candidata = objetivo;
            estado.sosten = paso * 1000;
          }
        } else {
          estado.candidata = 'ninguna';
          estado.sosten = 0;
        }

        if (estado.pose !== objetivo && objetivo !== 'ninguna') {
          if (estado.sosten >= sostenNecesario) {
            estado.pose = objetivo;
            estado.sosten = 0;
            estado.perdida = 0;
          }
        } else if (estado.pose !== 'ninguna' && objetivo === 'ninguna') {
          // Margen de salida: no se suelta por un frame perdido.
          estado.perdida += paso * 1000;
          if (estado.perdida >= cfg.rockHoldMs) {
            estado.pose = 'ninguna';
            estado.perdida = 0;
          }
        } else {
          estado.perdida = 0;
        }

        estado.enPuño = !!mano.enPuño;
        estado.frame = frame;
        salida.push({
          id: id,
          pose: estado.pose,
          enPuño: estado.enPuño,
          dedos: estado.dedos.slice()
        });
      }

      // --- Modos ---
      // RF-40/RF-41: el frenesí necesita un puño Y otra mano visible que no lo
      // sea. Un puño solo, dos puños, o una sola mano, es Fase 2 de punta a punta.
      let puños = 0;
      for (const entrada of salida) if (entrada.enPuño) puños++;
      const formaFrenesi = salida.length === 2 && puños === 1;

      if (formaFrenesi) {
        sostenFrenesi += paso * 1000;
      } else {
        sostenFrenesi = 0;
      }
      const frenesiPorPose = formaFrenesi && sostenFrenesi >= cfg.frenzyHoldMs;

      // RF-61: el modo monstruo se sostiene un mínimo de 3 s al soltar la pose.
      const hayRock = salida.some((entrada) => entrada.pose === 'rock');
      if (hayRock) {
        monstruoPorPose = true;
        sostenMonstruo = 0;
      } else if (monstruoPorPose) {
        sostenMonstruo += paso * 1000;
        if (sostenMonstruo >= cfg.monsterMinMs) monstruoPorPose = false;
      }

      modos.frenzy = frenesiPorPose || manuales.frenzy;
      modos.monster = monstruoPorPose || manuales.monster;
      modos.palette = manuales.palette;

      // Manos que ya no se ven: se limpian para no acumular estado.
      for (const [id, estado] of estados) {
        if (frame - estado.frame > 1) estados.delete(id);
      }

      return {
        manos: salida,
        modos: { palette: modos.palette, frenzy: modos.frenzy, monster: modos.monster },
        frenesiPorPose: frenesiPorPose,
        monstruoPorPose: monstruoPorPose
      };
    }

    /** Los dedos clasificados de una mano (para el overlay y los tests). */
    function dedosDe(id) {
      const estado = estados.get(id);
      return estado ? estado.dedos.slice() : null;
    }

    /** La pose clasificada de una mano ('paz', 'rock' o 'ninguna'). */
    function poseDe(id) {
      const estado = estados.get(id);
      return estado ? estado.pose : 'ninguna';
    }

    /** La forma que se está viendo ahora, aunque todavía no se confirmó. */
    function candidataDe(id) {
      const estado = estados.get(id);
      return estado ? estado.candidata : 'ninguna';
    }

    // --- Teclas de depuración (RF-44 y RNF-12) ---
    function siguientePaleta() {
      const total = (typeof Paletas !== 'undefined' && Paletas.cantidad) ? Paletas.cantidad() : 6;
      manuales.palette = (manuales.palette + 1) % total;
      modos.palette = manuales.palette;
      return manuales.palette;
    }

    function ponerPaleta(indice) {
      manuales.palette = indice;
      modos.palette = indice;
      return manuales.palette;
    }

    function alternarFrenesi() {
      manuales.frenzy = !manuales.frenzy;
      modos.frenzy = manuales.frenzy;
      return manuales.frenzy;
    }

    function alternarMonstruo() {
      manuales.monster = !manuales.monster;
      modos.monster = manuales.monster;
      return manuales.monster;
    }

    return {
      actualizar,
      dedosDe,
      poseDe,
      candidataDe,
      siguientePaleta,
      ponerPaleta,
      alternarFrenesi,
      alternarMonstruo,
      modos: modos
    };
  }

  return {
    OPCIONES,
    formaPaz,
    formaRock,
    crear
  };
})();
