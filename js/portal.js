// Portal: Die Szene wird nur innerhalb einer frei formbaren Öffnung gezeigt,
// passend zum Ausschnitt auf der Leinwand. Außen ist alles schwarz (Beamer = kein Licht).
// Die Form besteht aus Punkten (normiert 0..1), verbunden durch eine glatte Kurve;
// einzelne Punkte können eckig sein (z. B. die unteren Ecken eines Torbogens).
import { S, speichern, portalOval } from './einstellungen.js';
import { klemm } from './util.js';

const buehne = document.getElementById('buehne');
const pruefCtx = document.createElement('canvas').getContext('2d');

export const portal = {
  bearbeiten: false,
  symmetrisch: true,
  version: 0          // steigt bei jeder Änderung (Szenen bauen sich dann neu auf)
};

const geaendert = () => { portal.version++; speichern(); };

// ---------------- Vorlagen (Punkt 0 immer oben in der Mitte -> Symmetrie-Partner = n - i) ----------------
export const VORLAGEN = {
  oval: () => portalOval(12),
  kreis: () => {
    const r = 0.42 * Math.min(W(), H());
    return portalOval(12, 0.5, 0.5, r / W(), r / H());
  },
  torbogen: () => {
    const pts = [];
    const cx = 0.5, rx = 0.32, top = 0.1, schulter = 0.42, unten = 0.92;
    // Bogen oben (7 Punkte von oben-Mitte nach rechts unten an die Schulter, dann gespiegelt)
    const bogen = [];
    for (let i = 0; i <= 4; i++) {
      const w = -Math.PI / 2 + i / 4 * Math.PI / 2;
      bogen.push([cx + Math.cos(w) * rx, schulter + Math.sin(w) * (schulter - top), false]);
    }
    pts.push(...bogen);                                   // oben Mitte … rechts Schulter
    pts.push([cx + rx, unten, true]);                     // rechts unten (Ecke)
    pts.push([cx, unten, false]);                         // unten Mitte
    pts.push([cx - rx, unten, true]);                     // links unten (Ecke)
    for (let i = 4; i >= 1; i--) pts.push([2 * cx - bogen[i][0], bogen[i][1], false]);
    return pts;                                           // Punkt i und n - i sind Spiegelpartner
  },
  rechteck: () => [
    [0.5, 0.1, false], [0.85, 0.1, true], [0.85, 0.5, false], [0.85, 0.9, true],
    [0.5, 0.9, false], [0.15, 0.9, true], [0.15, 0.5, false], [0.15, 0.1, true]
  ]
};

export function vorlageSetzen(name) {
  S.portal.punkte = VORLAGEN[name]();
  S.portal.an = true;
  geaendert();
}

// ---------------- Geometrie ----------------
const W = () => buehne.width, H = () => buehne.height;
const punktePx = () => S.portal.punkte.map(([x, y, e]) => [x * W(), y * H(), e]);

/** Glatter, geschlossener Pfad (Catmull-Rom als Bézier; eckige Punkte bleiben spitz) */
function pfadAus(pts, dx = 0, dy = 0) {
  const pa = new Path2D(), n = pts.length;
  const P = i => pts[(i + n) % n];
  pa.moveTo(P(0)[0] - dx, P(0)[1] - dy);
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = p1[2] ? p1 : [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = p2[2] ? p2 : [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    pa.bezierCurveTo(c1[0] - dx, c1[1] - dy, c2[0] - dx, c2[1] - dy, p2[0] - dx, p2[1] - dy);
  }
  pa.closePath();
  return pa;
}

/** Bereich, in den die Szene gezeichnet wird (Gerätepixel). Ohne Portal: ganzer Bildschirm. */
export function rahmen() {
  if (!S.portal.an) return { x: 0, y: 0, w: W(), h: H() };
  const pts = punktePx();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const rand = Math.min(W(), H()) * 0.02;
  x0 = Math.max(0, x0 - rand); y0 = Math.max(0, y0 - rand);
  x1 = Math.min(W(), x1 + rand); y1 = Math.min(H(), y1 + rand);
  return { x: Math.round(x0), y: Math.round(y0), w: Math.max(32, Math.round(x1 - x0)), h: Math.max(32, Math.round(y1 - y0)) };
}

/** Liegt ein Punkt (Bildschirm-Gerätepixel) im Portal? */
export function innen(x, y) {
  if (!S.portal.an) return true;
  return pruefCtx.isPointInPath(pfadAus(punktePx()), x, y);
}

/** Zeiger (CSS-Pixel des Fensters) -> Gerätepixel auf der Bühne */
export const zuBuehne = (cx, cy) => [cx * W() / innerWidth, cy * H() / innerHeight];

// ---------------- Maske ----------------
let maske = null, maskeSchluessel = '';
function maskeHolen() {
  const schluessel = `${W()}x${H()}|${portal.version}|${S.portal.weich}`;
  if (maske && schluessel === maskeSchluessel) return maske;
  maskeSchluessel = schluessel;
  maske ??= document.createElement('canvas');
  maske.width = W(); maske.height = H();
  const g = maske.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, W(), H());
  g.globalCompositeOperation = 'destination-out';
  const weich = S.portal.weich * Math.min(W(), H());
  if (weich > 0.5 && 'filter' in g) g.filter = `blur(${weich.toFixed(1)}px)`;
  g.fill(pfadAus(punktePx()));
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  return maske;
}

/** Nach der Szene aufrufen: außen schwärzen, optional glühender Rand */
export function portalZeichnen(ctx, t) {
  if (S.portal.an) {
    ctx.drawImage(maskeHolen(), 0, 0);
    if (S.portal.glut) {
      const pa = pfadAus(punktePx());
      const puls = 0.55 + 0.25 * Math.sin(t * 0.002) + 0.1 * Math.sin(t * 0.0077);
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.shadowColor = `rgba(255,120,30,${puls})`;
      ctx.shadowBlur = Math.min(W(), H()) * 0.04;
      ctx.strokeStyle = `rgba(255,150,60,${puls * 0.6})`;
      ctx.lineWidth = Math.max(2, Math.min(W(), H()) * 0.006);
      ctx.stroke(pa);
      ctx.restore();
    }
  }
  if (portal.bearbeiten) editorZeichnen(ctx);
}

// ---------------- Editor ----------------
let zug = null;      // { art: 'punkt', i } | { art: 'alle', start, punkte }
const greifRadius = () => 26 * W() / innerWidth;

function editorZeichnen(ctx) {
  const pts = punktePx();
  const k = W() / innerWidth;
  ctx.save();
  ctx.setLineDash([10 * k, 8 * k]);
  ctx.lineWidth = 2 * k;
  ctx.strokeStyle = 'rgba(255,193,99,0.95)';
  ctx.stroke(pfadAus(pts));
  ctx.setLineDash([]);
  pts.forEach(([x, y, e], i) => {
    ctx.fillStyle = zug?.art === 'punkt' && zug.i === i ? '#ffc163' : '#f08a24';
    ctx.strokeStyle = '#1a0d03';
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    if (e) ctx.rect(x - 8 * k, y - 8 * k, 16 * k, 16 * k);
    else ctx.arc(x, y, 9 * k, 0, 6.283);
    ctx.fill(); ctx.stroke();
  });
  // Mitte
  const r = rahmen();
  ctx.strokeStyle = 'rgba(255,193,99,0.6)';
  ctx.lineWidth = 1.5 * k;
  const mx = r.x + r.w / 2, my = r.y + r.h / 2;
  ctx.beginPath(); ctx.moveTo(mx - 14 * k, my); ctx.lineTo(mx + 14 * k, my); ctx.moveTo(mx, my - 14 * k); ctx.lineTo(mx, my + 14 * k); ctx.stroke();
  ctx.restore();
}

function naechsterPunkt(x, y) {
  let best = -1, bestD = greifRadius();
  punktePx().forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < bestD) { bestD = d; best = i; } });
  return best;
}

const symMitte = () => { const r = rahmen(); return (r.x + r.w / 2) / W(); };

export function editorRunter(x, y) {
  const i = naechsterPunkt(x, y);
  if (i >= 0) zug = { art: 'punkt', i };
  else if (innen(x, y)) zug = { art: 'alle', start: [x, y], punkte: S.portal.punkte.map(p => p.slice()) };
  else zug = null;
}

export function editorZiehen(x, y) {
  if (!zug) return;
  const nx = klemm(x / W(), -0.1, 1.1), ny = klemm(y / H(), -0.1, 1.1);
  const pts = S.portal.punkte;
  if (zug.art === 'punkt') {
    const mitte = symMitte();
    pts[zug.i][0] = nx; pts[zug.i][1] = ny;
    const n = pts.length, partner = (n - zug.i) % n;
    if (portal.symmetrisch && partner !== zug.i) {
      pts[partner][0] = 2 * mitte - nx; pts[partner][1] = ny;
    } else if (portal.symmetrisch) {
      pts[zug.i][0] = mitte;                 // Punkte auf der Achse bleiben mittig
    }
  } else {
    const dx = (x - zug.start[0]) / W(), dy = (y - zug.start[1]) / H();
    S.portal.punkte = zug.punkte.map(([px, py, e]) => [px + dx, py + dy, e]);
  }
  geaendert();
}

export function editorHoch() { zug = null; }

/** Doppelklick auf einen Punkt: eckig <-> rund */
export function editorDoppel(x, y) {
  const i = naechsterPunkt(x, y);
  if (i < 0) return;
  const pts = S.portal.punkte, n = pts.length;
  pts[i][2] = !pts[i][2];
  if (portal.symmetrisch) pts[(n - i) % n][2] = pts[i][2];
  geaendert();
}

/** Ganze Form um ihre Mitte skalieren (Mausrad, zwei Finger) */
export function editorSkalieren(faktor) {
  const r = rahmen();
  const mx = (r.x + r.w / 2) / W(), my = (r.y + r.h / 2) / H();
  S.portal.punkte = S.portal.punkte.map(([x, y, e]) => [mx + (x - mx) * faktor, my + (y - my) * faktor, e]);
  geaendert();
}

export function weichSetzen(w) { S.portal.weich = klemm(w, 0, 0.15); geaendert(); }
export function portalSchalten(an) { S.portal.an = an; geaendert(); }
export function glutSchalten(an) { S.portal.glut = an; speichern(); }
