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

/** Tiefes Monster-Grollen (ca. 2 s) */
export function grollen(staerke = 1) {
  if (!ctx) return;
  const t = ctx.currentTime, dauer = 2.2;
  const aus = ctx.createGain();
  aus.gain.setValueAtTime(0.0001, t);
  aus.gain.exponentialRampToValueAtTime(0.55 * staerke, t + 0.25);
  aus.gain.setValueAtTime(0.55 * staerke, t + 1.2);
  aus.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  const tief = ctx.createBiquadFilter(); tief.type = 'lowpass'; tief.frequency.value = 380; tief.Q.value = 6;
  // Tremolo: das typische „Rrrr“
  const trem = ctx.createGain(); trem.gain.value = 0.6;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 11;
  const lfoTiefe = ctx.createGain(); lfoTiefe.gain.value = 0.4;
  lfo.connect(lfoTiefe).connect(trem.gain);
  for (const [f, typ] of [[48, 'sawtooth'], [51.5, 'sawtooth'], [97, 'square']]) {
    const o = ctx.createOscillator(); o.type = typ;
    o.frequency.setValueAtTime(f * 1.25, t); o.frequency.exponentialRampToValueAtTime(f * 0.8, t + dauer);
    const g = ctx.createGain(); g.gain.value = typ === 'square' ? 0.12 : 0.35;
    o.connect(g).connect(trem); o.start(t); o.stop(t + dauer);
  }
  trem.connect(tief).connect(aus).connect(ctx.destination);
  lfo.start(t); lfo.stop(t + dauer);
  rauschen(1.4, 600, 120, 0.25 * staerke);
}

/** Donnerschlag für das Flackern */
export function donner() {
  if (!ctx) return;
  rauschen(1.8, 900, 60, 0.7);
  setTimeout(() => rauschen(1.2, 400, 50, 0.45), 260);
}
