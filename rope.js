/**
 * rope.js — Cuerda de seda simulada con Verlet.
 *
 * Una cuerda es una cadena de puntos unidos por constraints de distancia.
 * El primer punto está anclado a la punta del dedo (`pin`) y el resto cuelga
 * por gravedad, con amortiguación, produciendo el péndulo (RF-05).
 *
 * La longitud total se puede cambiar en caliente (`setLength`): al acortarse,
 * los constraints arrastran el extremo libre hacia arriba y la araña sube (RF-06).
 */

class Rope {
  /** Halo del hilo: se puede apagar si el rendimiento no alcanza (T9). */
  static haloActivado = true;

  /**
   * @param {number} x          posición inicial del ancla
   * @param {number} y          posición inicial del ancla
   * @param {number} longitud   longitud total de la cuerda en píxeles
   * @param {number} segmentos  cantidad de segmentos (12 a 20 según RF-03)
   */
  constructor(x, y, longitud, segmentos) {
    this.segmentos = Math.max(2, Math.round(segmentos));
    this.longitud = longitud;
    this.largoSegmento = longitud / this.segmentos;
    this.puntos = [];
    this.anclada = true;   // si está suelta, la cuerda cae libre (T8)
    this.saltoMaximo = 60; // teletransporte del ancla: la cuerda la acompaña
    // Brillo que le pone la luz de la escena (RF-25). 1 = a plena luz.
    this.brillo = 1;
    this.reiniciar(x, y);
  }

  /** Recoloca la cuerda colgando hacia abajo desde el ancla. */
  reiniciar(x, y) {
    this.puntos = [];
    for (let i = 0; i <= this.segmentos; i++) {
      const py = y + i * this.largoSegmento;
      this.puntos.push({ x: x, y: py, px: x, py: py });
    }
  }

  /**
   * Ancla el primer punto de la cuerda. El movimiento del ancla es lo que
   * genera la inercia: el resto de la cuerda queda atrás y oscila.
   */
  pin(x, y) {
    const ancla = this.puntos[0];
    const dx = x - ancla.x;
    const dy = y - ancla.y;

    // Si el ancla se teletransporta (la mano reapareció en otro lado del
    // cuadro) la cuerda se mueve entera con ella. Si no, ese tirón se
    // convierte en una velocidad enorme y el hilo se enreda.
    if (Math.hypot(dx, dy) > this.saltoMaximo) {
      for (const p of this.puntos) {
        p.x += dx;
        p.y += dy;
        p.px += dx;
        p.py += dy;
      }
    }

    ancla.x = x;
    ancla.y = y;
    ancla.px = x;
    ancla.py = y;
  }

  /** Suelta la cuerda: deja de estar anclada y cae libre (RF-08). */
  soltar() {
    this.anclada = false;
  }

  /**
   * Tira del extremo libre hacia un punto, con un resorte suave. Se usa en el
   * lanzamiento (RF-15): el hilo se estira detrás de la araña y la trae de
   * vuelta con el rebote elástico.
   *
   * El punto de velocidad se mueve junto con la posición: si no, el próximo
   * paso de Verlet leería el arrastre como una velocidad enorme.
   */
  tirarDe(x, y, fuerza) {
    const fin = this.puntos[this.puntos.length - 1];
    const k = fuerza === undefined ? 0.25 : fuerza;
    const dx = (x - fin.x) * k;
    const dy = (y - fin.y) * k;
    fin.x += dx;
    fin.y += dy;
    fin.px += dx;
    fin.py += dy;
  }

  /** Vuelve a anclar la cuerda (la mano reapareció). */
  anclar() {
    this.anclada = true;
  }

  /**
   * Cambia la longitud total de la cuerda. Los constraints se encargan de
   * acercar o alejar los puntos en los próximos frames.
   */
  setLength(longitud) {
    this.longitud = Math.max(this.largoSegmento * 2, longitud);
    this.largoSegmento = this.longitud / this.segmentos;
  }

  /**
   * Integra un frame: Verlet + resolución de constraints.
   *
   * @param {number} gravedad     aceleración vertical (px por frame²)
   * @param {number} amortiguacion retención de velocidad (0..1)
   * @param {number} iteraciones   vueltas de solver de constraints
   */
  update(gravedad, amortiguacion, iteraciones) {
    const puntos = this.puntos;
    const damping = amortiguacion === undefined ? 0.98 : amortiguacion;
    const vueltas = iteraciones === undefined ? 6 : iteraciones;

    // --- Integración Verlet (el punto 0 no se integra si está anclado) ---
    const desde = this.anclada ? 1 : 0;
    for (let i = desde; i < puntos.length; i++) {
      const p = puntos[i];
      const vx = (p.x - p.px) * damping;
      const vy = (p.y - p.py) * damping;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + gravedad;
    }

    // --- Constraints de distancia ---
    for (let vuelta = 0; vuelta < vueltas; vuelta++) {
      for (let i = 0; i < puntos.length - 1; i++) {
        const a = puntos[i];
        const b = puntos[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        const diff = (d - this.largoSegmento) / d;

        if (i === 0 && this.anclada) {
          // El ancla no se mueve: sólo se ajusta el otro extremo del segmento.
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else {
          const mx = dx * diff * 0.5;
          const my = dy * diff * 0.5;
          a.x += mx;
          a.y += my;
          b.x -= mx;
          b.y -= my;
        }
      }
    }
  }

  /** Punto libre de la cuerda (donde cuelga la araña). */
  endPoint() {
    const p = this.puntos[this.puntos.length - 1];
    return { x: p.x, y: p.y };
  }

  /** Ángulo del último segmento, en radianes. Define la rotación de la araña. */
  endAngle() {
    const n = this.puntos.length;
    const fin = this.puntos[n - 1];
    const previo = this.puntos[n - 2];
    return Math.atan2(fin.y - previo.y, fin.x - previo.x);
  }

  /**
   * Dibuja la cuerda: línea fina blanquecina semitransparente con un leve halo.
   * @param {p5} p instancia de p5
   * @param {object} color tono del hilo
   * @param {number} opacidad 0..1 (para el desvanecimiento de T8)
   * @param {boolean} halo dibujar el halo (se puede apagar si baja el FPS)
   */
  dibujar(p, color, opacidad, halo) {
    const tono = color || { r: 226, g: 220, b: 205 };
    // RF-25: el brillo lo pone la luz de la escena (la opacidad es del fade).
    const base = (opacidad === undefined ? 1 : opacidad) * this.brillo;
    const a = Math.max(0, Math.min(1, base));
    const conHalo = halo === undefined ? Rope.haloActivado : halo;

    p.noFill();
    p.strokeCap(p.ROUND);

    // Halo: da el brillo de la seda.
    if (conHalo) {
      p.stroke(tono.r, tono.g, tono.b, 26 * a);
      p.strokeWeight(3.2);
      this.trazar(p);
    }

    // Hilo principal.
    p.stroke(tono.r, tono.g, tono.b, 120 * a);
    p.strokeWeight(1.1);
    this.trazar(p);
  }

  trazar(p) {
    p.beginShape();
    for (const punto of this.puntos) {
      p.vertex(punto.x, punto.y);
    }
    p.endShape();
  }
}
