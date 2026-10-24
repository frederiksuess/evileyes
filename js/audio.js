// Kleine, synthetische Geräusche. Der AudioContext muss beim ersten Antippen
// entstehen (Vorgabe der Browser), daher klangFreischalten() im Start-Knopf.
let ctx = null;

export function klangFreischalten() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
  } catch { /* ohne Ton weiter */ }
}

export function piep(freq, dauer = 0.12, lautst = 0.15, typ = 'square') {
  if (!ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = typ; o.frequency.value = freq;
  g.gain.setValueAtTime(lautst, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dauer);
}

function rauschen(dauer, von, bis, lautst) {
  const t = ctx.currentTime, len = Math.floor(ctx.sampleRate * dauer);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(von, t); f.frequency.exponentialRampToValueAtTime(bis, t + dauer * 0.85);
  const g = ctx.createGain(); g.gain.value = lautst;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
}

export function patschKlang() {
  if (!ctx) return;
  rauschen(0.18, 1800, 250, 0.5);
  piep(140 + Math.random() * 40, 0.09, 0.12, 'sine');
}

/** Trockenes Kratzen, wenn die Vogelspinne losrennt */
export function krabbelKlang() {
  if (!ctx) return;
  rauschen(0.12, 4000, 1200, 0.12);
}
