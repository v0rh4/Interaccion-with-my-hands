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

class Spider {
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
    const escala = this.tamano;

    // Cuando la araña está de canto el cuerpo se ve más angosto.
    const vuelta = Math.abs(Math.sin(this.vuelco));
    const anchoCuerpo = 0.6 + 0.4 * vuelta;

    const alcanceMax = (this.lCoxa + this.lFemur + this.lTibia) * escala;

    for (const pata of this.patas) {
      const angLocal = ANGULOS_PATAS[pata.indice] * Math.PI / 180;

      // --- Ciclo colgante: pataleo global + fase propia + ruido asimétrico ---
      // Con la mano rápido, el ciclo se acelera y se agita más (RF-07).
      const agit = this.agitacion;
      const ciclo = this.tiempo * (2.1 + agit * 3.5) + pata.fase;
      const pataleo = Math.sin(this.tiempo * (0.85 + agit * 1.6) + this.fase);
      const ruidoPata = this.ruido(pata.indice * 7.3 + (pata.lado > 0 ? 0 : 31.7), this.tiempo * 0.5);

      let alcance = alcanceMax * (
        0.62
        + (0.12 + 0.10 * agit) * Math.sin(ciclo)
        + (0.09 + 0.12 * agit) * pataleo
        + 0.14 * (ruidoPata - 0.5)
      );
      alcance = Math.max(alcanceMax * 0.35, Math.min(alcanceMax * 0.98, alcance));

      // Dirección de la pata en el mundo (el lado -y espeja el ángulo).
      const angMundo = rot + angLocal * pata.lado;
      const desvio = (ruidoPata - 0.5) * (0.25 + 0.35 * agit);
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
   * @param {p5} p instancia de p5
   */
  draw(p) {
    const escala = this.tamano;
    const vuelta = Math.abs(Math.sin(this.vuelco));
    const anchoCuerpo = 0.6 + 0.4 * vuelta;
    const opacidad = Math.max(0, Math.min(1, this.opacidad));

    this.dibujarPatas(p, -1, escala, opacidad);   // lado lejano, detrás del cuerpo
    this.dibujarCuerpo(p, escala, anchoCuerpo, vuelta, opacidad);
    this.dibujarPatas(p, 1, escala, opacidad);    // lado cercano, delante
  }

  /** Dibuja las 4 patas de un lado. */
  dibujarPatas(p, lado, escala, opacidad) {
    p.noFill();
    p.strokeCap(p.ROUND);
    p.strokeJoin(p.ROUND);

    for (const pata of this.patas) {
      if (pata.lado !== lado) continue;

      // El lado lejano se ve más apagado (está detrás del cuerpo).
      const tono = lado > 0 ? 34 : 22;
      p.stroke(tono, tono + 2, tono + 8, 240 * opacidad);
      p.strokeWeight(1.9 * escala);
      p.line(pata.coxa.x, pata.coxa.y, pata.hueso.x, pata.hueso.y);
      p.strokeWeight(1.25 * escala);
      p.line(pata.hueso.x, pata.hueso.y, pata.rodilla.x, pata.rodilla.y);
      p.strokeWeight(0.75 * escala);
      p.line(pata.rodilla.x, pata.rodilla.y, pata.pie.x, pata.pie.y);

      // Articulación: un brillo mínimo en la rodilla.
      p.noStroke();
      p.fill(tono + 26, tono + 26, tono + 34, 220 * opacidad);
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

    // --- Abdomen: negro brillante ---
    p.noStroke();
    p.fill(12, 11, 16, 255 * opacidad);
    p.push();
    p.translate(abdX, abdY);
    p.rotate(rot);
    p.ellipse(0, 0, rAbd * 2, rAbd * 1.82 * anchoCuerpo);
    p.pop();

    // Brillo especular (S19).
    this.brillo(p, abdX, abdY, rAbd * 0.62, rot, 0.30 + 0.12 * vuelta, opacidad);

    // --- Marca de reloj de arena roja, sólo visible con el vientre en cámara ---
    if (vuelta > 0.02) {
      this.marcaRoja(p, abdX, abdY, rot, rAbd, vuelta, opacidad);
    }

    // --- Cefalotórax ---
    p.noStroke();
    p.fill(16, 15, 20, 255 * opacidad);
    p.push();
    p.translate(this.x, this.y);
    p.rotate(rot);
    p.ellipse(0, 0, rCef * 2.15, rCef * 1.7 * anchoCuerpo);
    p.pop();

    this.brillo(p, this.x, this.y, rCef * 0.5, rot, 0.22, opacidad);
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
    p.noStroke();
    p.fill(196, 24, 46, 45 * a);
    this.triangulo(p, sup);
    this.triangulo(p, inf);

    // La marca en sí.
    p.fill(214, 32, 52, 235 * a);
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
  brillo(p, x, y, radio, rot, fuerza, opacidad) {
    if (!p.drawingContext) return;
    const a = Math.max(0, Math.min(1, opacidad === undefined ? 1 : opacidad));
    if (a < 0.02) return;
    const ctx = p.drawingContext;
    const hx = x - Math.cos(rot) * radio * 0.35;
    const hy = y - Math.sin(rot) * radio * 0.35;

    ctx.save();
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, radio);
    g.addColorStop(0, 'rgba(210, 225, 255, ' + (0.42 * fuerza * a).toFixed(3) + ')');
    g.addColorStop(0.45, 'rgba(150, 170, 210, ' + (0.12 * fuerza * a).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(120, 140, 190, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(hx, hy, radio, radio * 0.72, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
