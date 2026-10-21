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
    ancla.x = x;
    ancla.y = y;
    ancla.px = x;
    ancla.py = y;
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

    // --- Integración Verlet (el punto 0 está anclado y no se integra) ---
    for (let i = 1; i < puntos.length; i++) {
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

        if (i === 0) {
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
   */
  dibujar(p, color) {
    const tono = color || { r: 226, g: 220, b: 205 };

    p.noFill();
    p.strokeCap(p.ROUND);

    // Halo: da el brillo de la seda.
    p.stroke(tono.r, tono.g, tono.b, 26);
    p.strokeWeight(3.2);
    this.trazar(p);

    // Hilo principal.
    p.stroke(tono.r, tono.g, tono.b, 120);
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
