/**
 * spider.js — Araña viuda negra colgando de un hilo de seda.
 *
 * Esqueleto procedural (spec.md §6):
 *   - cuerpo negro brillante, abdomen globoso y cefalotórax pequeño
 *   - marca de reloj de arena roja en la parte ventral del abdomen
 *   - 8 patas finas en 3 segmentos (coxa-fémur-tibia) con IK de 2 huesos
 *   - ciclo de pataleo colgante, asimétrico y con ruido Perlin
 *   - rotación según el ángulo del último segmento de la cuerda
 *
 * API (spec.md §8): `update(ropeEnd, angle, speed)` y `draw(p)`.
 */

/**
 * Dirección de cada pata en el marco local de la araña, en grados.
 * 0° = hacia la cabeza; los ángulos aumentan hacia el lado +y.
 * El lado -y usa los ángulos con el signo invertido (espejo).
 */
const ANGULOS_PATAS = [55, 100, 140, 165];

/** Anclaje de cada pata sobre el cefalotórax (píxeles locales, x = hacia la cabeza). */
const ANCLAJE_PATAS = [
  { x: 7, y: 4 },
  { x: 2, y: 5 },
  { x: -3, y: 5 },
  { x: -8, y: 4 }
];

/** Velocidad (px/s) a partir de la cual la araña se agita al máximo. */
const VELOCIDAD_AGITACION = 900;

/**
 * Estados de la araña (Fase 2 §14):
 *   HANGING → CLIMBING → HIDDEN → LAUNCHING → HANGING
 */
const ESTADOS_ARAÑA = {
  COLGANDO: 'HANGING',
  TREPANDO: 'CLIMBING',
  OCULTA: 'HIDDEN',
  LANZANDO: 'LAUNCHING'
};

class Spider {
  /** Brillo especular: se puede apagar si el rendimiento no alcanza (T9). */
  static brilloActivado = true;

  /** Estados, expuestos para el sketch y los tests. */
  static ESTADOS = ESTADOS_ARAÑA;

  /**
   * @param {object} opciones { tamano, fase, p } — tamaño y fase propios por
   *        dedo (RF-10) y la instancia de p5 (para el ruido Perlin).
   */
  constructor(opciones) {
    const cfg = opciones || {};
    this.tamano = cfg.tamano || 1;
    this.fase = cfg.fase || 0;
    this.p = cfg.p || null;

    // Proporciones del cuerpo, en píxeles con tamano = 1.
    this.rCefalo = 11;      // radio del cefalotórax
    this.rAbdomen = 20;     // radio del abdomen
    this.distAbdomen = 30;  // distancia cefalotórax → centro del abdomen

    // Largos de las patas.
    this.lCoxa = 10;
    this.lFemur = 34;
    this.lTibia = 42;

    // Estado.
    this.x = 0;
    this.y = 0;
    this.rotacion = -Math.PI / 2; // hacia dónde mira la cabeza
    this.vuelco = 0;              // giro alrededor del eje del cuerpo
    this.vuelcoVel = 0;
    this.tiempo = 0;
    this.velocidad = 0;           // velocidad de la punta (px/s)
    this.agitacion = 0;           // 0..1.5: cuánto se agita por la velocidad
    this.opacidad = 1;            // para el desvanecimiento de T8
    // Brillo que le pone la luz de la escena (RF-25). 1 = a plena luz.
    this.brillo = 1;

    // --- Fase 2, Bloque 2: estados del puño ---
    this.estado = ESTADOS_ARAÑA.COLGANDO;
    this.progreso = 0;            // 0 = extremo del hilo, 1 = la palma
    // Cada araña trepa a su ritmo, ±20 % (RF-13).
    this.velocidadTrepada = 1 + (Math.random() * 0.4 - 0.2);
    this.escala = 1;              // baja hasta 0.6 mientras trepa (RF-14)
    this.susto = 0;               // 0..1: patas abiertas al lanzarse (RF-16)
    this.vx = 0;                  // impulso del lanzamiento (RF-15)
    this.vy = 0;

    // --- Fase 3, Bloque 6: color (RF-45 a RF-50) ---
    // Arranca con la paleta clásica: el aspecto de las fases anteriores.
    this.color = Paletas.copia(Paletas.paleta(0));
    this.colorObjetivo = this.color;
    this.colorOrigen = this.color;
    this.avanceColor = 1;        // 1 = transición terminada
    this.retrasoColor = 0;       // segundos que faltan para empezar (RF-50)
    this.transicionColor = 0.4;  // segundos que dura el lerp (RF-45)
    this.haloCache = null;       // gradiente del halo (RNF-11)
    this.haloColorCache = null;
    this.brilloCache = null;     // gradiente del brillo especular (RNF-11)

    // Ojos rojos (RF-25): dos puntitos sobre el cefalotórax que brillan siempre,
    // aunque la luz de la escena esté lejos.
    this.ojos = [
      { x: 0, y: 0, radio: 2.6 },
      { x: 0, y: 0, radio: 2.2 }
    ];

    // Estado de cada pata: coxa, inicio de fémur, rodilla y pie.
    this.patas = [];
    for (let i = 0; i < 8; i++) {
      this.patas.push({
        lado: i < 4 ? 1 : -1,
        indice: i % 4,
        fase: this.fase + i * 0.85,
        coxa: { x: 0, y: 0 },
        hueso: { x: 0, y: 0 },
        rodilla: { x: 0, y: 0 },
        pie: { x: 0, y: 0 }
      });
    }
  }

  /**
   * Actualiza la araña.
   *
   * @param {{x:number,y:number}} ropeEnd  punto libre de la cuerda (donde cuelga)
   * @param {number} angle                  ángulo del último segmento de la cuerda
   * @param {number} speed                  velocidad de la punta en px/s
   */
  update(ropeEnd, angle, speed) {
    this.tiempo += 1 / 60;
    this.x = ropeEnd.x;
    this.y = ropeEnd.y;
    this.velocidad = speed || 0;

    // La cabeza mira hacia el hilo: el ángulo de la cuerda apunta hacia abajo,
    // así que hacia el ancla va el ángulo + PI (spec.md §6, S20).
    this.rotacion = angle + Math.PI;

    // Agitación: si el dedo se mueve rápido, la araña se agita (RF-07).
    this.agitacion = Math.min(1.5, this.velocidad / VELOCIDAD_AGITACION);

    // La araña se torsiona lento mientras cuelga, y más rápido cuando el hilo
    // se sacude: por eso el rojo del vientre va apareciendo y desapareciendo (S16).
    const ruido = this.ruido(this.fase * 0.7, this.tiempo * 0.35);
    const velocidadVuelco = 0.05
      + 0.04 * (ruido - 0.5) * 2
      + Math.min(0.09, this.velocidad * 0.00012);
    this.vuelcoVel += (velocidadVuelco - this.vuelcoVel) * 0.05;
    this.vuelco += this.vuelcoVel;

    this.calcularPatas();
  }

  // ------------------------------------------------ estados del puño (F2) ---

  /**
   * Trepa por el hilo hacia la palma (RF-13, RF-14). El avance del progreso es
   * lo que acorta el hilo en el sketch, así que la araña sube por él.
   *
   * @param {number} dt         segundos
   * @param {number} velocidad  progreso por segundo (CONFIG.puno.climbSpeed)
   * @returns {number} progreso 0..1
   */
  trepar(dt, velocidad) {
    this.estado = ESTADOS_ARAÑA.TREPANDO;
    const v = (velocidad === undefined ? 1 : velocidad) * this.velocidadTrepada;
    this.progreso = Math.min(1, this.progreso + v * Math.max(0, dt || 0));
    this.escala = 1 - 0.4 * this.progreso;   // hasta el 60 % (RF-14)
    return this.progreso;
  }

  /** Se esconde en la palma: no se dibuja y su hilo se oculta (RF-14). */
  ocultar() {
    this.estado = ESTADOS_ARAÑA.OCULTA;
    this.progreso = 1;
    this.escala = 0.6;
  }

  /**
   * Sale disparada desde la palma (RF-15).
   *
   * @param {number} vx impulso horizontal, en px por frame
   * @param {number} vy impulso vertical, en px por frame
   */
  lanzar(vx, vy) {
    this.estado = ESTADOS_ARAÑA.LANZANDO;
    this.vx = vx;
    this.vy = vy;
    this.susto = 1;      // las patas se abren de golpe (RF-16)
    this.progreso = 0;
    this.escala = 1;
  }

  /** Vuelve a colgar del extremo del hilo. */
  colgar() {
    this.estado = ESTADOS_ARAÑA.COLGANDO;
    this.progreso = 0;
    this.escala = 1;
  }

  /**
   * Integra un frame de lanzamiento: vuelo libre con gravedad y amortiguación,
   * más un resorte hacia el extremo del hilo (el rebote elástico de RF-15).
   *
   * @param {number} dt            segundos
   * @param {number} gravedad      px por frame² (a 60 FPS)
   * @param {number} amortiguacion retención de la velocidad
   * @param {{x:number,y:number}} objetivo extremo del hilo (tira de la araña)
   */
  actualizarLanzamiento(dt, gravedad, amortiguacion, objetivo) {
    // El vuelo se integra en "frames de 60 FPS" para no depender de la tasa.
    const paso = Math.max(0.001, Math.min(dt || 0.016, 0.1)) * 60;

    this.vy += (gravedad === undefined ? 0.35 : gravedad) * paso;
    this.vx *= amortiguacion === undefined ? 0.985 : amortiguacion;
    this.vy *= amortiguacion === undefined ? 0.985 : amortiguacion;

    if (objetivo) {
      // El hilo estirado tira de la araña de vuelta.
      this.vx += (objetivo.x - this.x) * 0.02 * paso;
      this.vy += (objetivo.y - this.y) * 0.02 * paso;
    }

    this.x += this.vx * paso;
    this.y += this.vy * paso;

    // El susto se recupera en ~0.5 s (RF-16).
    this.susto = Math.max(0, this.susto - (dt || 0.016) / 0.5);

    this.tiempo += 1 / 60;
    this.velocidad = Math.hypot(this.vx, this.vy) * 60;
    this.agitacion = Math.min(1.5, this.velocidad / VELOCIDAD_AGITACION);
    this.calcularPatas();
  }

  /**
   * Apunta a una paleta nueva (RF-45). El cambio empieza después del retraso,
   * que es lo que hace que las arañas cambien en onda y no todas juntas (RF-50).
   *
   * @param {object} paleta     paleta destino de palettes.js
   * @param {number} retrasoMs  retraso propio de esta araña (0-150 ms según RF-50)
   * @param {number} duracion   segundos que dura la transición (RF-45)
   */
  setPaleta(paleta, retrasoMs, duracion) {
    if (!paleta) return;
    this.colorObjetivo = Paletas.copia(paleta);
    this.retrasoColor = Math.max(0, (retrasoMs || 0) / 1000);
    if (duracion !== undefined) this.transicionColor = Math.max(0.05, duracion);
    // Si no había transición en curso, el origen es el color actual.
    if (this.avanceColor >= 1) this.colorOrigen = Paletas.copia(this.color);
    this.avanceColor = 0;
  }

  /** Avanza la transición de color (RF-45). Se llama una vez por frame. */
  actualizarColor(dt) {
    const paso = Math.max(0, dt || 0);
    if (this.retrasoColor > 0) {
      this.retrasoColor = Math.max(0, this.retrasoColor - paso);
      return;
    }
    if (this.avanceColor >= 1) return;

    this.avanceColor = Math.min(1, this.avanceColor + paso / this.transicionColor);
    this.color = Paletas.interpolar(this.colorOrigen, this.colorObjetivo, this.avanceColor);

    if (this.avanceColor >= 1) {
      this.color = Paletas.copia(this.colorObjetivo);
    }
  }

  /** Tono de las patas, derivado del color del cuerpo (RF-48). */
  tonoPata(factor) {
    const c = this.color.cuerpo;
    const f = (factor === undefined ? 1 : factor) * 2.1;
    return [
      Math.min(255, 18 + c[0] * f),
      Math.min(255, 18 + c[1] * f),
      Math.min(255, 24 + c[2] * f)
    ];
  }

  /** El cefalotórax, un poco más claro que el abdomen (RF-48). */
  tonoCefalotorax() {
    const c = this.color.cuerpo;
    return [
      Math.min(255, c[0] + 8),
      Math.min(255, c[1] + 8),
      Math.min(255, c[2] + 8)
    ];
  }

  /**
   * Halo emisivo del color de la paleta (RF-48). El gradiente se cachea y sólo
   * se rehace cuando cambia el color (RNF-11). Se ve más en la oscuridad: su
   * alfa crece cuando el brillo que le da la linterna baja (se suma a RF-25).
   */
  dibujarHalo(p, escala) {
    const halo = this.color.halo;
    if (!halo || !p.drawingContext) return;

    const a = Math.max(0, Math.min(1, this.opacidad));
    if (a < 0.02) return;

    const ctx = p.drawingContext;
    if (!this.haloCache || !Paletas.iguales(this.haloColorCache, halo)) {
      const r = Math.round(halo[0]);
      const g = Math.round(halo[1]);
      const b = Math.round(halo[2]);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.55)');
      grad.addColorStop(0.55, 'rgba(' + r + ',' + g + ',' + b + ',0.16)');
      grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
      this.haloCache = grad;
      this.haloColorCache = halo.slice();
    }

    const radio = this.rAbdomen * escala * 2.3;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(radio, radio);
    ctx.globalAlpha = Math.max(0, Math.min(1, (0.20 + 0.35 * (1 - this.brillo)) * a));
    ctx.fillStyle = this.haloCache;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Ruido Perlin en [0,1]. Usa el de p5 si está disponible. */
  ruido(a, b) {
    if (this.p && typeof this.p.noise === 'function') return this.p.noise(a, b);
    return 0.5;
  }

  /** Postura de las 8 patas con IK de 2 huesos. */
  calcularPatas() {
    const rot = this.rotacion;
    const cos = Math.cos(rot);
    const sen = Math.sin(rot);
    const escala = this.tamano * this.escala;

    // Cuando la araña está de canto el cuerpo se ve más angosto.
    const vuelta = Math.abs(Math.sin(this.vuelco));
    const anchoCuerpo = 0.6 + 0.4 * vuelta;

    const alcanceMax = (this.lCoxa + this.lFemur + this.lTibia) * escala;

    for (const pata of this.patas) {
      const angLocal = ANGULOS_PATAS[pata.indice] * Math.PI / 180;

      // --- Ciclo según el estado ---
      // Colgando: pataleo asimétrico con ruido (RF-07, S18).
      // Trepando: las patas van alternadas, como una trepada de verdad (RF-13).
      // Lanzándose: las patas se abren en susto y se recuperan (RF-16).
      const agit = this.agitacion;
      const trepando = this.estado === ESTADOS_ARAÑA.TREPANDO;
      const ruidoPata = this.ruido(pata.indice * 7.3 + (pata.lado > 0 ? 0 : 31.7), this.tiempo * 0.5);

      let alcance;
      if (trepando) {
        // Alterna por lado y por pata: nunca se mueven todas juntas.
        const alterna = Math.sin(
          this.tiempo * 7 * this.velocidadTrepada
          + (pata.lado > 0 ? 0 : Math.PI)
          + pata.indice * 0.5
        );
        alcance = alcanceMax * (0.5 + 0.16 * alterna + 0.06 * (ruidoPata - 0.5));
      } else {
        const ciclo = this.tiempo * (2.1 + agit * 3.5) + pata.fase;
        const pataleo = Math.sin(this.tiempo * (0.85 + agit * 1.6) + this.fase);
        alcance = alcanceMax * (
          0.62
          + (0.12 + 0.10 * agit) * Math.sin(ciclo)
          + (0.09 + 0.12 * agit) * pataleo
          + 0.14 * (ruidoPata - 0.5)
        );
      }
      alcance = Math.max(alcanceMax * 0.35, Math.min(alcanceMax * 0.98, alcance));
      // Susto: las patas se estiran hacia afuera (RF-16).
      alcance *= 1 + 0.4 * this.susto;

      // Dirección de la pata en el mundo (el lado -y espeja el ángulo).
      const angMundo = rot + angLocal * pata.lado;
      const desvio = (ruidoPata - 0.5) * (0.25 + 0.35 * agit + 0.4 * this.susto);
      const dirX = Math.cos(angMundo + desvio);
      const dirY = Math.sin(angMundo + desvio);

      // --- Anclaje (coxa) sobre el cefalotórax ---
      const ax = ANCLAJE_PATAS[pata.indice].x * escala;
      const ay = ANCLAJE_PATAS[pata.indice].y * escala * pata.lado * anchoCuerpo;
      const anclaX = this.x + ax * cos - ay * sen;
      const anclaY = this.y + ax * sen + ay * cos;

      // --- Pie objetivo ---
      const pieX = anclaX + dirX * alcance;
      const pieY = anclaY + dirY * alcance;

      // --- IK de 2 huesos desde el inicio del fémur ---
      const largoCoxa = this.lCoxa * escala;
      const largoFemur = this.lFemur * escala;
      const largoTibia = this.lTibia * escala;

      const inicioX = anclaX + dirX * largoCoxa;
      const inicioY = anclaY + dirY * largoCoxa;

      const rodilla = this.ik(inicioX, inicioY, pieX, pieY, largoFemur, largoTibia, rot);

      pata.coxa.x = anclaX;
      pata.coxa.y = anclaY;
      pata.hueso.x = inicioX;
      pata.hueso.y = inicioY;
      pata.rodilla.x = rodilla.x;
      pata.rodilla.y = rodilla.y;
      pata.pie.x = pieX;
      pata.pie.y = pieY;
    }
  }

  /**
   * IK de 2 huesos: devuelve la posición de la rodilla.
   * Se elige la solución con la rodilla más cerca de la cabeza, que es la
   * postura natural de una araña colgando.
   */
  ik(x0, y0, x1, y1, l1, l2, rot) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    let d = Math.sqrt(dx * dx + dy * dy);
    const maximo = (l1 + l2) * 0.999;
    if (d > maximo) d = maximo;
    if (d < 0.0001) d = 0.0001;

    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));

    const mx = x0 + (a * dx) / d;
    const my = y0 + (a * dy) / d;
    const nx = -dy / d;
    const ny = dx / d;

    const opcionA = { x: mx + nx * h, y: my + ny * h };
    const opcionB = { x: mx - nx * h, y: my - ny * h };

    // Proyección sobre la dirección de la cabeza.
    const hx = Math.cos(rot);
    const hy = Math.sin(rot);
    const pa = opcionA.x * hx + opcionA.y * hy;
    const pb = opcionB.x * hx + opcionB.y * hy;

    return pa >= pb ? opcionA : opcionB;
  }

  /**
   * Dibuja la araña: patas lejanas, cuerpo, patas cercanas.
   * Si está escondida en la palma no se dibuja nada (RF-14).
   * @param {p5} p instancia de p5
   */
  draw(p) {
    if (this.estado === ESTADOS_ARAÑA.OCULTA) return;

    const escala = this.tamano * this.escala;
    const vuelta = Math.abs(Math.sin(this.vuelco));
    const anchoCuerpo = 0.6 + 0.4 * vuelta;
    // RF-25: el brillo lo pone la luz de la escena. Los ojos van aparte, con la
    // opacidad del desvanecimiento pero sin el brillo: brillan siempre.
    const opacidad = Math.max(0, Math.min(1, this.opacidad * this.brillo));

    this.dibujarHalo(p, escala);                  // halo emisivo (RF-48)
    this.dibujarPatas(p, -1, escala, opacidad);   // lado lejano, detrás del cuerpo
    this.dibujarCuerpo(p, escala, anchoCuerpo, vuelta, opacidad);
    this.dibujarPatas(p, 1, escala, opacidad);    // lado cercano, delante
    this.dibujarOjos(p, escala, this.opacidad);
  }

  /**
   * Ojos rojos del cefalotórax (RF-25). No se atenúan con el brillo de la luz:
   * sólo con el desvanecimiento de RF-08.
   */
  dibujarOjos(p, escala, opacidad) {
    const a = Math.max(0, Math.min(1, opacidad === undefined ? 1 : opacidad));
    if (a < 0.02) return;

    const rot = this.rotacion;
    const cos = Math.cos(rot);
    const sen = Math.sin(rot);

    p.noStroke();
    for (let i = 0; i < this.ojos.length; i++) {
      const ojo = this.ojos[i];
      const lx = 5 * escala;                                   // hacia la cabeza
      const ly = (i === 0 ? -3.2 : 3.2) * escala;               // a los costados
      ojo.radio = (i === 0 ? 2.6 : 2.2) * escala;
      ojo.x = this.x + lx * cos - ly * sen;
      ojo.y = this.y + lx * sen + ly * cos;

      const o = this.color.ojos;
      p.fill(o[0], o[1], o[2], 240 * a);
      p.circle(ojo.x, ojo.y, ojo.radio * 2);
    }
  }

  /** Dibuja las 4 patas de un lado. */
  dibujarPatas(p, lado, escala, opacidad) {
    p.noFill();
    p.strokeCap(p.ROUND);
    p.strokeJoin(p.ROUND);

    for (const pata of this.patas) {
      if (pata.lado !== lado) continue;

      // El lado lejano se ve más apagado (está detrás del cuerpo).
      const tono = this.tonoPata(lado > 0 ? 1 : 0.72);
      p.stroke(tono[0], tono[1], tono[2], 240 * opacidad);
      p.strokeWeight(1.9 * escala);
      p.line(pata.coxa.x, pata.coxa.y, pata.hueso.x, pata.hueso.y);
      p.strokeWeight(1.25 * escala);
      p.line(pata.hueso.x, pata.hueso.y, pata.rodilla.x, pata.rodilla.y);
      p.strokeWeight(0.75 * escala);
      p.line(pata.rodilla.x, pata.rodilla.y, pata.pie.x, pata.pie.y);

      // Articulación: un brillo mínimo en la rodilla.
      p.noStroke();
      p.fill(
        Math.min(255, tono[0] + 26),
        Math.min(255, tono[1] + 26),
        Math.min(255, tono[2] + 26),
        220 * opacidad
      );
      p.circle(pata.rodilla.x, pata.rodilla.y, 2.1 * escala);
    }
  }

  /** Dibuja abdomen + cefalotórax + marca roja ventral. */
  dibujarCuerpo(p, escala, anchoCuerpo, vuelta, opacidad) {
    const rot = this.rotacion;
    const cos = Math.cos(rot);
    const sen = Math.sin(rot);

    // Centro del abdomen (detrás del cefalotórax).
    const dist = this.distAbdomen * escala;
    const abdX = this.x - cos * dist;
    const abdY = this.y - sen * dist;

    const rAbd = this.rAbdomen * escala;
    const rCef = this.rCefalo * escala;

    // --- Abdomen: el color del cuerpo de la paleta (RF-48) ---
    const cuerpo = this.color.cuerpo;
    p.noStroke();
    p.fill(cuerpo[0], cuerpo[1], cuerpo[2], 255 * opacidad);
    p.push();
    p.translate(abdX, abdY);
    p.rotate(rot);
    p.ellipse(0, 0, rAbd * 2, rAbd * 1.82 * anchoCuerpo);
    p.pop();

    // Brillo especular (S19).
    this.brilloEspecular(p, abdX, abdY, rAbd * 0.62, rot, 0.30 + 0.12 * vuelta, opacidad);

    // --- Marca de reloj de arena roja, sólo visible con el vientre en cámara ---
    if (vuelta > 0.02) {
      this.marcaRoja(p, abdX, abdY, rot, rAbd, vuelta, opacidad);
    }

    // --- Cefalotórax ---
    const cef = this.tonoCefalotorax();
    p.noStroke();
    p.fill(cef[0], cef[1], cef[2], 255 * opacidad);
    p.push();
    p.translate(this.x, this.y);
    p.rotate(rot);
    p.ellipse(0, 0, rCef * 2.15, rCef * 1.7 * anchoCuerpo);
    p.pop();

    this.brilloEspecular(p, this.x, this.y, rCef * 0.5, rot, 0.22, opacidad);
  }

  /**
   * Marca de reloj de arena roja en el vientre del abdomen.
   * Sólo se ve cuando la araña está panza arriba (S16).
   */
  marcaRoja(p, x, y, rot, radio, visible, opacidad) {
    const cos = Math.cos(rot);
    const sen = Math.sin(rot);
    const largo = radio * 0.42;   // a lo largo del cuerpo
    const ancho = radio * 0.20;   // a lo ancho

    const a = Math.max(0, Math.min(1, visible)) * opacidad;
    const local = (lx, ly) => ({ x: x + lx * cos - ly * sen, y: y + lx * sen + ly * cos });

    const sup = [local(-largo, -ancho), local(-largo, ancho), local(0, 0)];
    const inf = [local(largo, -ancho), local(largo, ancho), local(0, 0)];

    // Halo suave alrededor de la marca.
    const ac = this.color.acento;
    p.noStroke();
    p.fill(ac[0] * 0.9, ac[1] * 0.9, ac[2] * 0.9, 45 * a);
    this.triangulo(p, sup);
    this.triangulo(p, inf);

    // La marca en sí.
    p.fill(ac[0], ac[1], ac[2], 235 * a);
    this.triangulo(p, sup);
    this.triangulo(p, inf);
  }

  triangulo(p, puntos) {
    p.beginShape();
    for (const pt of puntos) {
      p.vertex(pt.x, pt.y);
    }
    p.endShape(p.CLOSE);
  }

  /** Brillo especular: degradado radial sobre el cuerpo. */
  brilloEspecular(p, x, y, radio, rot, fuerza, opacidad) {
    if (!p.drawingContext || !Spider.brilloActivado) return;
    const a = Math.max(0, Math.min(1, opacidad === undefined ? 1 : opacidad));
    if (a < 0.02) return;
    const ctx = p.drawingContext;
    const hx = x - Math.cos(rot) * radio * 0.35;
    const hy = y - Math.sin(rot) * radio * 0.35;

    // El gradiente es siempre el mismo: se cachea y se reposiciona con la
    // transformación, así no se crea uno por frame (RNF-11).
    if (!this.brilloCache) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(210, 225, 255, 0.42)');
      g.addColorStop(0.45, 'rgba(150, 170, 210, 0.12)');
      g.addColorStop(1, 'rgba(120, 140, 190, 0)');
      this.brilloCache = g;
    }

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(rot);
    ctx.scale(radio, radio * 0.72);
    ctx.globalAlpha = Math.max(0, Math.min(1, fuerza * a));
    ctx.fillStyle = this.brilloCache;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
