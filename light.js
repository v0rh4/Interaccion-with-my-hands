/**
 * light.js — Oscuridad, linterna que sigue la palma y viñeta (Fase 2, Bloque 3).
 *
 * RF-19: el video se desatura y se tiñe en frío (con `filter` si el navegador lo
 *        soporta y con `tint()` si no, como Safari viejo).
 * RF-20: sobre el video va una capa de oscuridad en un p5.Graphics creado una vez.
 * RF-21: cada mano abre un agujero de luz en la palma (`destination-out`).
 * RF-22: el radio escala con el tamaño de la mano y se encoge con el puño.
 * RF-23: la luz parpadea con ruido Perlin, más fuerte al lanzarse una araña.
 * RF-24: siempre queda una luz ambiental mínima (la oscuridad no es negro total).
 * RF-25: arañas, hilos y telarañas van por encima, con brillo según la distancia.
 * RF-26: la viñeta usa un gradiente cacheado.
 * RF-27: sin manos, la linterna se desvanece a la luz ambiental en ~0.5 s.
 * RNF-08: la tecla L prende y apaga toda la feature.
 * RNF-07: ni la capa, ni los gradientes, ni la viñeta se crean de nuevo por frame.
 *
 * DECISIÓN: el gradiente del foco se crea una sola vez en el origen con radio 1 y
 * después se dibuja con `translate`/`scale` (RNF-07). El color del gradiente es
 * constante, así que la parte que cambia por frame es sólo la transformación.
 */
class Light {
  /**
   * @param {p5} [p] instancia de p5 (para el ruido Perlin). El sketch la pasa;
   *        sin ella el parpadeo usa un hash determinista.
   */
  constructor(p) {
    this.p = p || null;
    this.capa = null;          // p5.Graphics de la oscuridad (RF-20)
    this.ancho = 0;
    this.alto = 0;
    this.focos = [];           // un foco por mano: { x, y, radio, tamano }
    this.intensidad = 0;       // 0..1: se desvanece sin manos (RF-27)
    this.parpadeo = 1;         // multiplicador del ruido (RF-23)
    this.impulso = 0;          // sube cuando se lanza una araña (RF-23)
    this.tiempo = 0;
    this.vineta = null;        // gradiente de la viñeta, cacheado (RF-26)
    this.gradienteFoco = null; // gradiente unitario del foco, cacheado (RNF-07)
    this.activada = true;      // tecla L (RNF-08)
    this.oscuro = 0.9;         // 1 - luz ambiental (RF-24)
    this.vinetaFuerza = 0.62;
  }

  /** ¿Este navegador soporta `filter` en el canvas 2D? (Safari viejo no, RF-19) */
  static filtroSoportado(p) {
    return !!(p && p.drawingContext && typeof p.drawingContext.filter === 'string');
  }

  /** Centro de la palma: promedio de la muñeca y los nudillos 0, 5, 9 y 17 (RF-21). */
  static centroPalma(puntos) {
    const indices = [0, 5, 9, 17];
    let x = 0;
    let y = 0;
    for (const i of indices) {
      x += puntos[i].x;
      y += puntos[i].y;
    }
    return { x: x / indices.length, y: y / indices.length };
  }

  /**
   * Devuelve la capa de oscuridad, creándola sólo si no existe o si cambió el
   * tamaño del canvas (RF-20, RNF-07).
   */
  asegurarCapa(p) {
    if (this.p === null) this.p = p;
    if (this.capa && this.ancho === p.width && this.alto === p.height) return this.capa;
    if (this.capa && typeof this.capa.remove === 'function') this.capa.remove();
    this.capa = p.createGraphics(p.width, p.height);
    this.ancho = p.width;
    this.alto = p.height;
    this.vineta = null;
    return this.capa;
  }

  /** Avisa que se lanzó una araña: el parpadeo se agranda un rato (RF-23). */
  impulsar() {
    this.impulso = Math.min(1, this.impulso + 0.7);
  }

  /** Ruido en [0,1]: el Perlin de p5 si está, si no un hash determinista. */
  ruido(a, b) {
    if (this.p && typeof this.p.noise === 'function') return this.p.noise(a, b);
    const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return v - Math.floor(v);
  }

  /**
   * Actualiza los focos, el desvanecimiento y el parpadeo.
   *
   * @param {Array}  manos     manos con `puntos` (los 21 keypoints)
   * @param {number} dt        segundos desde el frame anterior
   * @param {object} opciones  { darkness, ambientLight, lightRadiusFactor,
   *                             lightFlicker, vignetteStrength }
   */
  actualizar(manos, dt, opciones) {
    const cfg = Object.assign({
      darkness: 0.9,
      ambientLight: 0.1,
      lightRadiusFactor: 1.5,
      lightFlicker: 0.06,
      vignetteStrength: 0.62
    }, opciones);

    const paso = Math.max(0.0001, Math.min(dt || 0.016, 0.25));
    this.tiempo += paso;
    this.oscuro = cfg.darkness;
    this.vinetaFuerza = cfg.vignetteStrength;

    // Un foco por mano, en la palma y con el radio según el tamaño y la apertura.
    this.focos = [];
    for (const mano of manos || []) {
      const puntos = mano && mano.puntos;
      if (!puntos || puntos.length < 21) continue;
      const palma = Light.centroPalma(puntos);
      const tamano = Math.hypot(puntos[9].x - puntos[0].x, puntos[9].y - puntos[0].y) || 1;
      // RF-22: la luz crece al abrir la mano y se encoge con el puño.
      const apertura = Mano.calcularApertura(puntos);
      const radio = tamano * cfg.lightRadiusFactor * (0.55 + 0.45 * apertura);
      this.focos.push({ x: palma.x, y: palma.y, radio: radio, tamano: tamano });
    }

    // RF-27: sin manos se desvanece sola (constante de tiempo ~0.5 s).
    const objetivo = this.focos.length > 0 ? 1 : 0;
    this.intensidad += (objetivo - this.intensidad) * (1 - Math.exp(-paso / 0.2));

    // RF-23: parpadeo con Perlin, más fuerte mientras dura el impulso del lanzamiento.
    this.impulso = Math.max(0, this.impulso - paso / 0.8);
    const amplitud = cfg.lightFlicker * (1 + 2.5 * this.impulso);
    const ruido = this.ruido(this.tiempo * 7.3, this.tiempo * 3.1);
    this.parpadeo = 1 + (ruido - 0.5) * 2 * amplitud;
  }

  /**
   * Cuánto brilla un punto según su distancia a la linterna (RF-25).
   * @param {number} x
   * @param {number} y
   * @param {number} [minimo] piso de brillo (RF-25 pide 35 %)
   * @returns {number} 0..1
   */
  intensidadEn(x, y, minimo) {
    const piso = minimo === undefined ? 0.35 : minimo;
    let mejor = 0;

    for (const foco of this.focos) {
      const distancia = Math.hypot(x - foco.x, y - foco.y);
      if (distancia >= foco.radio) continue;
      const lineal = 1 - distancia / foco.radio;
      const suave = lineal * lineal * (3 - 2 * lineal);   // smoothstep
      mejor = Math.max(mejor, suave * this.intensidad * this.parpadeo);
    }

    return Math.max(piso, Math.min(1, mejor));
  }

  /**
   * Dibuja el video de fondo con el tinte frío de RF-19. Usa `filter` cuando
   * está y `tint()` cuando no.
   */
  dibujarVideo(p, video) {
    if (!video) {
      p.background(6, 5, 9);
      return;
    }
    if (Light.filtroSoportado(p)) {
      p.drawingContext.filter = 'saturate(0.35) brightness(0.8)';
      p.image(video, 0, 0, p.width, p.height);
      p.drawingContext.filter = 'none';
      return;
    }
    // Safari viejo: sin `filter`, se tiñe la imagen en frío.
    p.tint(150, 190, 190);
    p.image(video, 0, 0, p.width, p.height);
    p.noTint();
  }

  /** Dibuja la capa de oscuridad con un agujero de luz por mano (RF-20/21/24). */
  dibujar(p) {
    if (!this.activada) return;

    const g = this.asegurarCapa(p);
    const ctx = g.drawingContext;

    g.clear();
    // RF-24: la oscuridad deja pasar la luz ambiental, nunca es negro total.
    g.noStroke();
    g.fill(0, 0, 0, 255 * this.oscuro);
    g.rect(0, 0, g.width, g.height);

    if (this.focos.length === 0 || this.intensidad <= 0.01) return;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = Math.max(0, Math.min(1, this.intensidad * this.parpadeo));

    for (const foco of this.focos) {
      const radio = Math.max(1, foco.radio * this.parpadeo);
      if (!this.gradienteFoco) this.gradienteFoco = this.crearGradienteFoco(ctx);
      // Gradiente unitario + transformación: no se crea uno por frame (RNF-07).
      ctx.save();
      ctx.translate(foco.x, foco.y);
      ctx.scale(radio, radio);
      ctx.fillStyle = this.gradienteFoco;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();

    // Y la capa se dibuja sobre el video (RF-20).
    p.image(g, 0, 0);
  }

  /** Gradiente radial unitario (centro opaco, borde transparente). */
  crearGradienteFoco(ctx) {
    const grad = ctx.createRadialGradient(0, 0, 0.15, 0, 0, 1);
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.72)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    return grad;
  }

  /** Viñeta radial de los bordes, con el gradiente cacheado (RF-26). */
  dibujarVineta(p) {
    if (!this.activada || !p.drawingContext) return;

    const ctx = p.drawingContext;
    if (!this.vineta || this.vineta.w !== p.width || this.vineta.h !== p.height) {
      const radio = Math.min(p.width, p.height) * 0.34;
      const grad = ctx.createRadialGradient(
        p.width / 2, p.height / 2, radio,
        p.width / 2, p.height / 2, Math.max(p.width, p.height) * 0.78
      );
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, ' + this.vinetaFuerza + ')');
      this.vineta = { w: p.width, h: p.height, grad: grad };
    }

    ctx.fillStyle = this.vineta.grad;
    ctx.fillRect(0, 0, p.width, p.height);
  }
}
