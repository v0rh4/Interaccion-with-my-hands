/**
 * Smoke test (Node) para sketch.js + hand.js sin navegador.
 * Simula p5, ml5, document y navigator.mediaDevices para ejercitar el flujo real.
 * Uso: node smoke.js <escenario>
 *   escenarios: ok | sin-permiso | error-modelo
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const escenario = process.argv[2] || 'ok';
global.__escenario = escenario;
global.__sinWebGL = escenario === 'sin-webgl';

// ---------------------------------------------------------------- stubs DOM
class FakeClassList {
  constructor() { this.s = new Set(); }
  add(c) { this.s.add(c); }
  remove(c) { this.s.delete(c); }
  toggle(c, f) {
    if (f === undefined) { this.s.has(c) ? this.s.delete(c) : this.s.add(c); }
    else { f ? this.s.add(c) : this.s.delete(c); }
  }
  contains(c) { return this.s.has(c); }
}

const els = new Map();
global.__els = els;
function el(id) {
  if (!els.has(id)) {
    els.set(id, {
      id, textContent: '', disabled: false, value: '0.6',
      classList: new FakeClassList(), style: {},
      addEventListener() {}
    });
  }
  return els.get(id);
}

global.document = {
  getElementById: el,
  addEventListener() {},
  createElement: (tag) => ({
    style: {},
    setAttribute() {},
    addEventListener() {},
    getContext: (tipo) => {
      // Firefox lanza DOMException cuando WebGL está deshabilitado.
      if (tipo === 'webgl2' || tipo === 'webgl') {
        if (global.__sinWebGL) {
          const e = new Error('WebGL disabled');
          throw e;
        }
        return { __contexto: tipo };
      }
      return {};
    }
  }),
  body: { appendChild() {} }
};
global.window = global;
global.WebGLRenderingContext = function () {};

// ------------------------------------------- stub de la Web Audio API
function paramFalso(valor) {
  return {
    value: valor === undefined ? 0 : valor,
    setValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    setTargetAtTime(valor) { this.value = valor; return this; },
    cancelScheduledValues() { return this; }
  };
}

function nodoFalso(ctx, tipo) {
  return {
    tipo: tipo,
    gain: paramFalso(1),
    frequency: paramFalso(0),
    detune: paramFalso(0),
    Q: paramFalso(1),
    buffer: null,
    loop: false,
    onended: null,
    connect(dest) { ctx.conexiones.push(tipo); return dest; },
    disconnect() {},
    start() { ctx.iniciados++; },
    stop() { ctx.parados++; }
  };
}

function contextoFalso() {
  const ctx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    destino: {},
    conexiones: [],
    iniciados: 0,
    parados: 0,
    resume() { ctx.state = 'running'; return Promise.resolve(); },
    createGain: () => nodoFalso(ctx, 'gain'),
    createOscillator: () => nodoFalso(ctx, 'osc'),
    createBiquadFilter: () => nodoFalso(ctx, 'filter'),
    createBufferSource: () => nodoFalso(ctx, 'buffer'),
    createConvolver: () => nodoFalso(ctx, 'convolver'),
    createBuffer: (canales, largo) => ({
      length: largo,
      getChannelData: () => new Float32Array(largo)
    })
  };
  return ctx;
}

global.__audio = contextoFalso();

// ---------------------------------------------------------------- stub p5
global.__p5 = [];
class P5Stub {
  constructor(sketch) {
    this.width = 800; this.height = 600; this.frameCount = 0; this.key = '';
    this.windowWidth = 800; this.windowHeight = 600;
    this.deltaTime = 16;           // ms por frame (p5 lo calcula real)
    this.draws = 0;
    this.drawingContext = {
      save() {}, restore() {}, beginPath() {}, ellipse() {}, fill() {}, fillRect() {},
      fillStyle: '',
      createRadialGradient: () => ({ addColorStop() {} })
    };
    // p5.sound expone el AudioContext y la salida por acá.
    this.soundOut = { audiocontext: global.__audio, output: nodoFalso(global.__audio, 'out') };
    global.__p5.push(this);
    sketch(this);
    if (this.preload) this.preload();
    if (this.setup) this.setup();
  }
  createCanvas(w, h) { this.width = w; this.height = h; return { parent() {}, style() {} }; }
  pixelDensity() {} frameRate() {} background() {} push() {} pop() {}
  translate() {} scale() {} image() {} rect() {} fill() {} noStroke() {}
  stroke() {} strokeWeight() {} circle() {} line() {} noFill() {}
  beginShape() { this.beginShapeCalls = (this.beginShapeCalls || 0) + 1; } vertex() {} endShape(modo) {
    // endShape() sin argumento = trazo abierto: sólo lo usan las cuerdas.
    if (modo === undefined) this.hiloCalls = (this.hiloCalls || 0) + 1;
  } strokeCap() {} strokeJoin() {}
  rotate() {}
  ellipse() { this.ellipseCalls = (this.ellipseCalls || 0) + 1; }
  noise(a, b) {
    // Ruido de valor determinista (el smoke test no necesita Perlin real).
    const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return v - Math.floor(v);
  }
  textSize() {} textAlign() {} text() {}
  color(r, g, b, a) { return { r, g, b, a }; }
  createCapture(type, opciones) {
    const listeners = {};
    const video = {
      elt: {
        readyState: 4,
        videoWidth: 640,
        videoHeight: 480,
        addEventListener(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); }
      },
      hide() {},
      width: 640,
      height: 480
    };
    // Dispara 'loadeddata' como lo haría el navegador.
    setTimeout(() => (listeners['loadeddata'] || []).forEach((cb) => cb()), 0);
    return video;
  }
}
P5Stub.prototype.VIDEO = 'video';
P5Stub.prototype.LEFT = 'left';
P5Stub.prototype.BOTTOM = 'bottom';
P5Stub.prototype.ROUND = 'round';
P5Stub.prototype.CLOSE = 'close';
P5Stub.prototype.AUDIO = 'audio';
global.p5 = P5Stub;

// --------------------------------------------------------------- stub ml5
global.__ml5 = { llamadas: [], detectStart: null };
global.ml5 = {
  handPose(nombre, opciones) {
    global.__ml5.llamadas.push({ nombre, opciones });
    const ready = escenario === 'error-modelo'
      ? Promise.reject(new Error('falló la descarga del modelo'))
      : Promise.resolve('modelo');
    return {
      ready,
      detectStart(media, cb) {
        global.__ml5.detectStart = { media, cb };
      }
    };
  }
};

// ------------------------------------------------------------ stub cámara
Object.defineProperty(globalThis, 'navigator', { value: {
  mediaDevices: {
    getUserMedia: async () => {
      if (escenario === 'sin-permiso') {
        const e = new Error('Permission denied');
        e.name = 'NotAllowedError';
        throw e;
      }
      return { getTracks: () => [{ stop() {} }] };
    }
  }
}, writable: true, configurable: true });

// ------------------------------------------------------------------ código
const hand = fs.readFileSync(path.join(RAIZ, 'hand.js'), 'utf8');
const gestures = fs.readFileSync(path.join(RAIZ, 'gestures.js'), 'utf8');
const rope = fs.readFileSync(path.join(RAIZ, 'rope.js'), 'utf8');
const spider = fs.readFileSync(path.join(RAIZ, 'spider.js'), 'utf8');
const sound = fs.readFileSync(path.join(RAIZ, 'sound.js'), 'utf8');
const sketch = fs.readFileSync(path.join(RAIZ, 'sketch.js'), 'utf8');
const pruebas = fs.readFileSync(path.join(__dirname, 'smoke-pruebas.js'), 'utf8');

vm.runInThisContext(hand + '\n' + gestures + '\n' + rope + '\n' + spider + '\n' + sound + '\n' + sketch + '\n' + pruebas, { filename: 'bundle.js' });
