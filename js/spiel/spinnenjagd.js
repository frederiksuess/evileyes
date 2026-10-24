// Easter Egg „Spinnenjagd“: 30 Sekunden lang krabbeln Spinnen von oben nach unten.
// Gepatscht wird mit der Hand vor der Kamera (Bewegungserkennung), mit den Knochenhänden
// des Skeletts oder per Finger auf dem Bildschirm.
import { S, speichern } from '../einstellungen.js';
import { PW, PH, schnell, bewegung } from '../bewegung.js';
import { piep, patschKlang, klangFreischalten } from '../audio.js';
import { zufall } from '../util.js';

const SPIELZEIT = 30;
const $ = id => document.getElementById(id);
const hud = $('hud'), hPunkte = $('hPunkte'), hZeit = $('hZeit'), hZeitFeld = $('hZeitFeld');
const countdownEl = $('countdown'), ergebnisEl = $('ergebnis');

export const spiel = {
  zustand: 'aus',          // aus | countdown | laeuft | ergebnis
  punkte: 0, entkommen: 0,
  spinnen: [], flecken: [],
  start: 0, ende: 0, naechste: 0, sperreBis: 0,
  W: 1, H: 1,
  szene: null,             // aktuelle Szene (für Skeletthände)
  beimStart: null          // Rückruf (z. B. Einstellungen schließen, blinzeln)
};

let zurueckTimer = null;

export const spielAktiv = () => spiel.zustand !== 'aus';

export function spielVorbereiten() {
  if (spiel.zustand !== 'aus' || performance.now() < spiel.sperreBis) return;
  klangFreischalten();
  spiel.beimStart?.();
  spiel.zustand = 'countdown';
  spiel.spinnen = []; spiel.flecken = [];
  spiel.punkte = 0; spiel.entkommen = 0;
  hPunkte.textContent = '0'; hZeit.textContent = SPIELZEIT; hZeitFeld.classList.remove('knapp');
  const schritte = [['Spinnen!', 1300, 'text'], ['3', 800], ['2', 800], ['1', 800]];
  let i = 0;
  const weiter = () => {
    if (spiel.zustand !== 'countdown') return;
    if (i < schritte.length) {
      const [txt, ms, cls] = schritte[i++];
      countdownEl.textContent = txt;
      countdownEl.className = cls || '';
      countdownEl.hidden = false;
      piep(i === 1 ? 330 : 520, 0.15, 0.12);
      setTimeout(weiter, ms);
    } else {
      countdownEl.hidden = true;
      piep(880, 0.25, 0.14);
      spiel.zustand = 'laeuft';
      spiel.start = performance.now();
      spiel.ende = spiel.start + SPIELZEIT * 1000;
      spiel.naechste = spiel.start;
      bewegung.takt = 33;        // im Spiel doppelt so oft analysieren
      hud.hidden = false;
    }
  };
  weiter();
}

function spielEnde() {
  spiel.zustand = 'ergebnis';
  bewegung.takt = 66;
  hud.hidden = true;
  const neuerRekord = spiel.punkte > S.rekord;
  if (neuerRekord) { S.rekord = spiel.punkte; speichern(); }
  $('eZahl').textContent = spiel.punkte;
  $('eText').textContent = `${spiel.punkte === 1 ? 'Spinne' : 'Spinnen'} erwischt, ${spiel.entkommen} entkommen. `
    + (neuerRekord ? 'Neuer Rekord!' : `Rekord: ${S.rekord}.`);
  ergebnisEl.hidden = false;
  ergebnisEl.inert = false;
  $('eNochmal').focus({ preventScroll: true });
  piep(neuerRekord ? 660 : 300, 0.4, 0.14, 'triangle');
  clearTimeout(zurueckTimer);
  zurueckTimer = setTimeout(spielVerlassen, 20000);
}

export function spielVerlassen() {
  clearTimeout(zurueckTimer);
  ergebnisEl.hidden = true;
  countdownEl.hidden = true;
  hud.hidden = true;
  spiel.zustand = 'aus';
  spiel.spinnen = []; spiel.flecken = [];
  bewegung.takt = 66;
  spiel.sperreBis = performance.now() + 5000;     // nicht sofort wieder auslösen
}

$('eNochmal').addEventListener('click', () => {
  clearTimeout(zurueckTimer);
  ergebnisEl.hidden = true;
  spiel.zustand = 'aus'; spiel.sperreBis = 0;
  spielVorbereiten();
});
$('eZurueck').addEventListener('click', spielVerlassen);

// ---------------- Spinnen ----------------
function neueSpinne(t) {
  const { W, H } = spiel, U = Math.min(W, H);
  const fortschritt = (t - spiel.start) / (SPIELZEIT * 1000);
  const gold = Math.random() < 0.07;
  const groesse = U * (gold ? 0.075 : zufall(0.06, 0.105));
  const x0 = groesse + Math.random() * (W - 2 * groesse);
  spiel.spinnen.push({
    x: x0, x0, y: -groesse * 1.5, groesse, gold,
    vy: H * (0.1 + fortschritt * 0.13 + Math.random() * 0.06) * (gold ? 1.5 : 1),
    amp: Math.random() * U * 0.08, freq: zufall(0.6, 2), ph: Math.random() * 6.28,
    faden: !gold && Math.random() < 0.3,
    gang: Math.random() * 6.28, winkel: Math.PI / 2, geboren: t
  });
}

/** Die am weitesten unten krabbelnde Spinne (die Augen schauen ihr nach) */
export function spinneImBlick() {
  let tief = null;
  for (const s of spiel.spinnen) if (s.y > 0 && (!tief || s.y > tief.y)) tief = s;
  return tief ? [tief.x, tief.y] : null;
}

function treffer(s, t) {
  const i = spiel.spinnen.indexOf(s);
  if (i < 0) return;
  spiel.spinnen.splice(i, 1);
  const wert = s.gold ? 3 : 1;
  spiel.punkte += wert;
  hPunkte.textContent = spiel.punkte;
  const tropfen = Array.from({ length: 9 }, () => {
    const a = Math.random() * 6.28, r = s.groesse * zufall(0.5, 1.4);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, r: s.groesse * zufall(0.06, 0.18) };
  });
  spiel.flecken.push({ x: s.x, y: s.y, groesse: s.groesse, winkel: s.winkel, t0: t, gold: s.gold, wert, tropfen });
  patschKlang();
  try { navigator.vibrate?.(25); } catch { /* nicht überall erlaubt */ }
}

/** Finger-Patscher (Bildschirmpixel) */
export function patschBei(px, py) {
  if (spiel.zustand !== 'laeuft') return;
  const t = performance.now();
  for (let i = spiel.spinnen.length - 1; i >= 0; i--) {
    const s = spiel.spinnen[i];
    if (Math.hypot(s.x - px, s.y - py) < s.groesse * 1.2) { treffer(s, t); return; }
  }
}

/** Nach jeder Kamera-Analyse: Hand-Patscher über schnelle Bewegung */
bewegung.beiAnalyse.add(() => {
  if (spiel.zustand !== 'laeuft') return;
  if (spiel.szene?.patschPunkte?.(spiel.W, spiel.H)) return;   // Skeletthände haben Vorrang
  const { W, H } = spiel, t = performance.now();
  for (let i = spiel.spinnen.length - 1; i >= 0; i--) {
    const s = spiel.spinnen[i];
    if (s.y < 0) continue;
    const nx = S.spiegeln ? 1 - s.x / W : s.x / W;
    const cx = nx * PW, cy = (s.y / H) * PH;
    const rx = Math.max(2, s.groesse / W * PW * 0.9), ry = Math.max(2, s.groesse / H * PH * 0.9);
    let n = 0, ges = 0;
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(PH - 1, Math.ceil(cy + ry)); y++)
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(PW - 1, Math.ceil(cx + rx)); x++) {
        ges++; n += schnell[y * PW + x];
      }
    if (ges && n / ges > 0.3) treffer(s, t);
  }
});

function skelettPatscher(t) {
  const pts = spiel.szene?.patschPunkte?.(spiel.W, spiel.H);
  if (!pts) return;
  for (const [hx, hy] of pts)
    for (let k = spiel.spinnen.length - 1; k >= 0; k--) {
      const s = spiel.spinnen[k];
      if (Math.hypot(s.x - hx, s.y - hy) < s.groesse * 1.3) treffer(s, t);
    }
}

// ---------------- Zeichnen ----------------
function zeichneSpinne(g, s) {
  const z = s.groesse;
  g.save();
  g.translate(s.x, s.y);
  const schein = g.createRadialGradient(0, 0, 0, 0, 0, z * 1.1);
  schein.addColorStop(0, s.gold ? 'rgba(255,200,80,0.35)' : 'rgba(240,110,30,0.26)');
  schein.addColorStop(1, 'rgba(240,110,30,0)');
  g.fillStyle = schein;
  g.beginPath(); g.arc(0, 0, z * 1.1, 0, 6.283); g.fill();
  g.rotate(s.winkel - Math.PI / 2);         // Kopf zeigt in Laufrichtung
  g.strokeStyle = s.gold ? '#8a6216' : '#4a3424';
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = Math.max(1.5, z * 0.07);
  for (let seite = -1; seite <= 1; seite += 2) {
    for (let k = 0; k < 4; k++) {
      const takt = Math.sin(s.gang + k * Math.PI / 2 + (seite > 0 ? Math.PI : 0));
      const bw = (-0.9 + k * 0.6) + takt * 0.22;
      const ax = seite * z * 0.18, ay = z * (0.12 - k * 0.08);
      const kx = ax + seite * Math.cos(bw) * z * 0.55, ky = ay + Math.sin(bw) * z * 0.55 - z * 0.18;
      const fx = kx + seite * Math.cos(bw + 0.9) * z * 0.5, fy = ky + Math.sin(bw + 0.9) * z * 0.6 + z * 0.12;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
    }
  }
  const koerper = s.gold ? '#c99a2e' : '#1c130d';
  g.fillStyle = koerper;
  g.beginPath(); g.ellipse(0, -z * 0.32, z * 0.3, z * 0.38, 0, 0, 6.283); g.fill();
  g.strokeStyle = s.gold ? 'rgba(255,230,150,0.6)' : 'rgba(240,138,36,0.45)';
  g.lineWidth = Math.max(1, z * 0.03);
  g.stroke();
  g.fillStyle = s.gold ? '#ffe08a' : 'rgba(240,138,36,0.55)';
  g.beginPath(); g.ellipse(0, -z * 0.38, z * 0.06, z * 0.16, 0, 0, 6.283); g.fill();
  g.fillStyle = koerper;
  g.beginPath(); g.ellipse(0, z * 0.12, z * 0.2, z * 0.2, 0, 0, 6.283); g.fill();
  g.fillStyle = '#ff3b1a';
  g.shadowColor = '#ff3b1a'; g.shadowBlur = z * 0.15;
  g.beginPath(); g.arc(-z * 0.07, z * 0.25, z * 0.04, 0, 6.283); g.arc(z * 0.07, z * 0.25, z * 0.04, 0, 6.283); g.fill();
  g.restore();
}

function zeichneFleck(g, f, t) {
  const alter = (t - f.t0) / 1000;
  const a = Math.max(0, 1 - alter / 1.4);
  if (a <= 0) return false;
  const z = f.groesse;
  g.save();
  g.globalAlpha = a;
  g.translate(f.x, f.y);
  g.fillStyle = f.gold ? '#f2c94c' : '#a6c834';
  for (const d of f.tropfen) { g.beginPath(); g.arc(d.x, d.y, d.r, 0, 6.283); g.fill(); }
  g.fillStyle = f.gold ? '#8a5a0a' : '#2a1d12';
  g.beginPath(); g.ellipse(0, 0, z * 0.45, z * 0.32, f.winkel, 0, 6.283); g.fill();
  g.strokeStyle = g.fillStyle; g.lineWidth = Math.max(1.5, z * 0.06); g.lineCap = 'round';
  for (let k = 0; k < 8; k++) {
    const w = f.winkel + k * 0.785 + 0.3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(w) * z * 0.8, Math.sin(w) * z * 0.8); g.stroke();
  }
  g.fillStyle = '#ffc163';
  g.font = `700 ${Math.round(z * 0.7)}px "Grenze Gotisch", Georgia, serif`;
  g.textAlign = 'center';
  g.fillText('+' + f.wert, 0, -z * 0.8 - alter * z * 1.2);
  g.restore();
  return true;
}

/** Ein Bild des Spiels über die Szene zeichnen */
export function spielSchritt(ctx, t, dt, W, H, szene) {
  spiel.W = W; spiel.H = H; spiel.szene = szene;
  ctx.fillStyle = `rgba(0,0,0,${szene.abdunkeln ?? 0.4})`;
  ctx.fillRect(0, 0, W, H);

  if (spiel.zustand === 'laeuft') {
    const rest = Math.max(0, spiel.ende - t);
    hZeit.textContent = Math.ceil(rest / 1000);
    hZeitFeld.classList.toggle('knapp', rest < 6000);
    if (t >= spiel.naechste) {
      neueSpinne(t);
      const f = (t - spiel.start) / (SPIELZEIT * 1000);
      spiel.naechste = t + (750 - 480 * f) * zufall(0.6, 1.4);
    }
    for (let i = spiel.spinnen.length - 1; i >= 0; i--) {
      const s = spiel.spinnen[i];
      const tempo = s.faden ? 0.3 + 0.7 * Math.abs(Math.sin((t - s.geboren) / 600 + s.ph)) : 1;
      const altX = s.x, altY = s.y;
      s.y += s.vy * tempo * dt;
      s.x = s.x0 + Math.sin((t - s.geboren) / 1000 * s.freq + s.ph) * s.amp;
      const vx = s.x - altX, vy = s.y - altY;
      if (Math.hypot(vx, vy) > 0.01) s.winkel += (Math.atan2(vy, vx) - s.winkel) * 0.2;
      s.gang += dt * 14 * tempo;
      if (s.y - s.groesse > H) { spiel.spinnen.splice(i, 1); spiel.entkommen++; }
    }
    skelettPatscher(t);
    if (rest <= 0) spielEnde();
  }

  ctx.strokeStyle = 'rgba(228,217,203,0.35)';
  ctx.lineWidth = Math.max(1, W / 500);
  for (const s of spiel.spinnen) if (s.faden) {
    ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, s.y - s.groesse * 0.6); ctx.stroke();
  }
  spiel.flecken = spiel.flecken.filter(f => zeichneFleck(ctx, f, t));
  for (const s of spiel.spinnen) zeichneSpinne(ctx, s);
}
