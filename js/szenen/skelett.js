// Szene „Skelett“: MediaPipe Pose liefert 33 Körperpunkte, daraus wird ein Skelett gezeichnet.
import { S } from '../einstellungen.js';
import { kamera, videoGroesse, bildBereit } from '../kamera.js';
import { poseErzeugen } from '../mediapipe.js';
import { zeige } from '../hinweis.js';
import { glatt, pfad, plus, minus, mal, mitte, abst, einheit, senk } from '../util.js';
import { zeichneFunken } from './gemeinsam.js';

const KNOCHEN = '#e9dfcc', KONTUR = '#1a110a', GLUT = 'rgba(240,110,30,0.14)';

// Ruhepose (normierte Bildkoordinaten, Hochformat 3:4), wenn niemand da ist
const RUHE = [
  [0.5, 0.2], [0.51, 0.185], [0.52, 0.185], [0.53, 0.186], [0.49, 0.185], [0.48, 0.185], [0.47, 0.186],
  [0.545, 0.2], [0.455, 0.2], [0.515, 0.23], [0.485, 0.23],
  [0.62, 0.32], [0.38, 0.32], [0.655, 0.46], [0.345, 0.46], [0.665, 0.59], [0.335, 0.59],
  [0.675, 0.63], [0.325, 0.63], [0.665, 0.635], [0.335, 0.635], [0.65, 0.62], [0.35, 0.62],
  [0.58, 0.6], [0.42, 0.6], [0.585, 0.76], [0.415, 0.76], [0.59, 0.92], [0.41, 0.92],
  [0.585, 0.945], [0.415, 0.945], [0.615, 0.95], [0.385, 0.95]
];

const rumpfMitte = p => [(p[22] + p[24] + p[46] + p[48]) / 4, (p[23] + p[25] + p[47] + p[49]) / 4];

export class SkelettSzene {
  constructor() {
    this.id = 'skelett';
    this.abdunkeln = 0.15;
    this.skelette = [];       // { p: Float32Array(66), v: Float32Array(33), w, zuletzt }
    this.pose = null;
    this.laedt = false;
    this.aktiv = false;
  }

  async laden() { /* keine Bilddateien */ }

  aktivieren() {
    this.aktiv = true;
    if (kamera.laeuft) this.poseStarten();
  }
  deaktivieren() { this.aktiv = false; }
  kameraGestartet() { if (this.aktiv) this.poseStarten(); }
  mehrereGeaendert() { this.pose?.anzahlSetzen(S.mehrere ? 3 : 1); }

  async poseStarten() {
    if (this.pose || this.laedt) return;
    this.laedt = true;
    zeige('Das Skelett wird geladen …', 2500);
    try {
      this.pose = await poseErzeugen(S.mehrere ? 3 : 1);
      if (this.aktiv) zeige('Stell dich vor die Kamera – das Skelett macht alles nach.', 3500);
      const schleife = () => {
        try { if (this.aktiv && bildBereit()) this.verarbeiten(this.pose.erkennen(), performance.now()); }
        catch (e) { console.warn(e); }
        setTimeout(schleife, 40);
      };
      schleife();
    } catch (e) {
      console.warn('Körpererkennung nicht verfügbar:', e);
      zeige('Das Skelett konnte nicht geladen werden. Dafür braucht es Internet.', 5000);
    } finally {
      this.laedt = false;
    }
  }

  /** Neue Erkennung den bestehenden Skeletten zuordnen und glätten */
  verarbeiten(lms, jetzt) {
    const frei = lms.map(l => {
      const p = new Float32Array(66), v = new Float32Array(33);
      l.forEach((q, i) => { p[2 * i] = q.x; p[2 * i + 1] = q.y; v[i] = q.visibility ?? 1; });
      return { p, v };
    });
    for (const sk of this.skelette) {
      const m = rumpfMitte(sk.p);
      let best = -1, bestD = 0.3;
      frei.forEach((d, i) => {
        const n = rumpfMitte(d.p), dd = Math.hypot(n[0] - m[0], n[1] - m[1]);
        if (dd < bestD) { bestD = dd; best = i; }
      });
      if (best < 0) continue;
      const d = frei.splice(best, 1)[0];
      for (let k = 0; k < 66; k++) sk.p[k] += (d.p[k] - sk.p[k]) * 0.55;
      for (let k = 0; k < 33; k++) sk.v[k] += (d.v[k] - sk.v[k]) * 0.35;
      sk.zuletzt = jetzt;
    }
    for (const d of frei) this.skelette.push({ p: d.p, v: d.v, w: 0, zuletzt: jetzt });
  }

  sichtbar() { return this.skelette.some(sk => sk.w > 0.3); }

  abbildung(W, H, vw, vh) {
    const a = S.ansicht.skelett;
    return { W, H, vw, vh, sc: Math.min(W / vw, H / vh) * 0.96 * a.zoom, hoehe: a.hoehe };
  }
  static aufSchirm(m, x, y) {
    const sx = S.spiegeln ? 1 - x : x;
    return [m.W / 2 + (sx - 0.5) * m.vw * m.sc, m.H / 2 + (y - 0.5) * m.vh * m.sc + m.hoehe * m.H * 0.35];
  }

  /** Hände der sichtbaren Skelette (Bildschirmpunkte) – zum Patschen im Spiel */
  patschPunkte(W, H) {
    if (!this.sichtbar()) return null;
    const m = this.abbildung(W, H, ...videoGroesse());
    const pts = [];
    for (const sk of this.skelette) {
      if (sk.w < 0.5) continue;
      for (const i of [15, 16, 17, 18, 19, 20]) if (sk.v[i] > 0.4) pts.push(SkelettSzene.aufSchirm(m, sk.p[2 * i], sk.p[2 * i + 1]));
    }
    return pts;
  }

  zeichne(ctx, t, dt, e) {
    const { W, H } = e;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const boden = ctx.createRadialGradient(W / 2, H * 0.95, 0, W / 2, H * 0.95, Math.max(W, H) * 0.6);
    boden.addColorStop(0, 'rgba(120,40,8,0.35)'); boden.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = boden; ctx.fillRect(0, 0, W, H);
    zeichneFunken(ctx, t, dt, W, H);

    const jetzt = performance.now();
    for (const sk of this.skelette) sk.w = glatt(sk.w, jetzt - sk.zuletzt < 400 ? 1 : 0, dt, jetzt - sk.zuletzt < 400 ? 0.25 : 0.6);
    this.skelette = this.skelette.filter(sk => sk.w > 0.01 || jetzt - sk.zuletzt < 400);
    if (!S.mehrere && this.skelette.length > 1) {
      this.skelette.sort((a, b) => b.w - a.w);
      this.skelette.length = 1;
    }

    const maxW = this.skelette.reduce((m, sk) => Math.max(m, sk.w), 0);
    if (maxW < 0.98) {
      const m = this.abbildung(W, H, 480, 640);
      const kiefer = Math.max(0, Math.sin(t / 1000 * 1.3)) ** 6;   // gelegentliches Klappern
      zeichneSkelett(ctx, i => SkelettSzene.aufSchirm(m, ...ruhePunkt(i, t)), () => 1, (1 - maxW) * 0.9, t, W, kiefer);
    }
    const m = this.abbildung(W, H, ...videoGroesse());
    for (const sk of this.skelette) {
      if (sk.w < 0.02) continue;
      zeichneSkelett(ctx, i => SkelettSzene.aufSchirm(m, sk.p[2 * i], sk.p[2 * i + 1]), i => sk.v[i], sk.w, t, W, 0);
    }
  }
}

/** Ruhepose: leichtes Wiegen, Atmen und alle ~9 s ein Winken */
function ruhePunkt(i, t) {
  let [x, y] = RUHE[i];
  const s = t / 1000;
  x += Math.sin(s * 0.9) * 0.01;
  if (i >= 11 && i <= 12) y += Math.sin(s * 1.6) * 0.004;
  if (i <= 10) { x += Math.sin(s * 0.7) * 0.008; y += Math.sin(s * 1.6) * 0.004; }
  if (i === 13 || i === 15 || i === 17 || i === 19 || i === 21) x += Math.sin(s * 0.9 + 1) * 0.01;
  const phase = s % 9;
  const wk = phase < 2.5 ? Math.sin(phase / 2.5 * Math.PI) : 0;
  if (wk > 0) {
    const hand = [0.25 + Math.sin(s * 9) * 0.035, 0.16];
    if (i === 14) { x += (0.27 - x) * wk; y += (0.31 - y) * wk; }
    if (i === 16 || i === 18 || i === 20 || i === 22) {
      const off = [RUHE[i][0] - RUHE[16][0], RUHE[i][1] - RUHE[16][1]];
      const zx = hand[0] + off[0] * 0.6, zy = hand[1] - Math.abs(off[1]) * 1.5 - (i === 16 ? 0 : 0.02);
      x += (zx - x) * wk; y += (zy - y) * wk;
    }
  }
  return [x, y];
}

/** Ein Skelett zeichnen. P(i) liefert Bildschirmpunkte, V(i) die Sichtbarkeit (0..1). */
function zeichneSkelett(g, P, V, alpha, t, W, kiefer) {
  const sicht = i => V(i) > 0.4;
  if (!sicht(11) || !sicht(12)) return;
  const L11 = P(11), L12 = P(12);
  const S0 = mitte(L11, L12);
  const hueften = sicht(23) && sicht(24);
  let B = abst(L11, L12);
  if (hueften) B = Math.max(B, abst(P(23), P(24)) * 1.25);
  B = Math.max(B, W * 0.04);

  // Rumpfachse (ohne sichtbare Hüften nach unten verlängert)
  let Hm;
  if (hueften) Hm = mitte(P(23), P(24));
  else { const q = einheit(senk(minus(L11, L12))); Hm = plus(S0, mal(q[1] > 0 ? q : mal(q, -1), B * 1.5)); }
  const d = minus(Hm, S0), L = Math.hypot(d[0], d[1]) || 1, u = mal(d, 1 / L), n = senk(u);
  const at = f => plus(S0, mal(u, f * L));

  const gruppe = () => ({ linien: [], flaechen: [] });
  const rumpf = gruppe(), beine = gruppe(), arme = gruppe();
  const linie = (gr, pts, w) => gr.linien.push({ pts, w });
  const kreis = (gr, p, r) => { const pa = new Path2D(); pa.arc(p[0], p[1], r, 0, 6.283); gr.flaechen.push(pa); };
  const knochen = (gr, a, b, w) => { linie(gr, [a, b], w); kreis(gr, a, w * 0.62); kreis(gr, b, w * 0.62); };

  // Wirbelsäule
  for (let k = 0; k < 14; k++) {
    const f = 0.02 + (k + 0.5) / 14 * 0.9, s = 0.9 / 14 * 0.34;
    linie(rumpf, [at(f - s), at(f + s)], B * 0.075);
  }
  // Rippen
  for (let i = 0; i < 7; i++) {
    const P0 = at(0.1 + i * 0.065);
    const wi = B * (0.34 + 0.1 * Math.sin((i + 1) / 8 * Math.PI)) * (i > 4 ? 0.88 : 1);
    for (const s of [-1, 1]) {
      const c = plus(plus(P0, mal(n, s * wi * 1.08)), mal(u, -L * 0.02));
      const e = plus(plus(P0, mal(n, s * wi * 0.82)), mal(u, L * 0.11));
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const q = k / 8, a = (1 - q) * (1 - q), b = 2 * (1 - q) * q, cc = q * q;
        pts.push([a * P0[0] + b * c[0] + cc * e[0], a * P0[1] + b * c[1] + cc * e[1]]);
      }
      linie(rumpf, pts, B * 0.045);
    }
  }
  linie(rumpf, [at(0.08), at(0.4)], B * 0.075);           // Brustbein
  knochen(rumpf, at(0.06), L11, B * 0.05);                 // Schlüsselbeine
  knochen(rumpf, at(0.06), L12, B * 0.05);
  const kopf = sicht(0) && sicht(2) && sicht(5);
  if (kopf) {                                              // Halswirbel
    const aug = mitte(P(2), P(5));
    const hoch = einheit(minus(aug, mitte(P(9), P(10))));
    const hs = Math.max(abst(P(7), P(8)) * 0.72, B * 0.3);
    const basis = minus(aug, mal(hoch, hs * 0.8));
    for (let k = 0; k < 4; k++) {
      linie(rumpf, [plus(basis, mal(minus(S0, basis), (k + 0.15) / 4)), plus(basis, mal(minus(S0, basis), (k + 0.75) / 4))], B * 0.07);
    }
  }
  if (hueften) {                                           // Becken
    const H23 = P(23), H24 = P(24);
    const hw = Math.max(abst(H23, H24), B * 0.6);
    const w0 = Math.atan2(n[1], n[0]);
    for (const s of [-1, 1]) {
      const c = plus(plus(Hm, mal(n, s * hw * 0.42)), mal(u, -hw * 0.12));
      const pa = new Path2D();
      pa.ellipse(c[0], c[1], hw * 0.36, hw * 0.3, w0 + s * 0.35, 0, 6.283);
      rumpf.flaechen.push(pa);
    }
    const sak = new Path2D();
    sak.moveTo(...plus(plus(Hm, mal(u, -hw * 0.28)), mal(n, -hw * 0.15)));
    sak.lineTo(...plus(plus(Hm, mal(u, -hw * 0.28)), mal(n, hw * 0.15)));
    sak.lineTo(...plus(Hm, mal(u, hw * 0.22)));
    sak.closePath();
    rumpf.flaechen.push(sak);
    linie(rumpf, [H23, plus(Hm, mal(u, hw * 0.36)), H24], B * 0.06);
    kreis(rumpf, H23, B * 0.065); kreis(rumpf, H24, B * 0.065);
  }

  // Arme + Hände
  for (const [sch, ell, hg, kl, zf, dm] of [[11, 13, 15, 17, 19, 21], [12, 14, 16, 18, 20, 22]]) {
    if (!sicht(ell)) continue;
    const A0 = P(sch), E = P(ell);
    knochen(arme, A0, E, B * 0.085);
    kreis(arme, A0, B * 0.075);
    if (!sicht(hg)) continue;
    const Hd = P(hg), q = mal(einheit(senk(minus(Hd, E))), B * 0.025);
    knochen(arme, plus(E, q), plus(Hd, q), B * 0.045);
    knochen(arme, minus(E, q), minus(Hd, q), B * 0.04);
    const dI = minus(P(zf), Hd), dK = minus(P(kl), Hd);
    const lang = Math.max(Math.hypot(dI[0], dI[1]), B * 0.12);
    for (let k = 0; k < 4; k++) {
      const r = einheit([dK[0] + (dI[0] - dK[0]) * k / 3, dK[1] + (dI[1] - dK[1]) * k / 3]);
      const b0 = plus(Hd, mal(r, lang * 0.55));
      linie(arme, [Hd, b0], B * 0.03);
      linie(arme, [b0, plus(Hd, mal(r, lang * 1.2)), plus(Hd, mal(r, lang * 1.75))], B * 0.022);
    }
    const dD = minus(P(dm), Hd);
    linie(arme, [Hd, plus(Hd, mal(dD, 1.25)), plus(Hd, mal(dD, 1.8))], B * 0.026);
    kreis(arme, Hd, B * 0.045);
  }

  // Beine + Füße
  for (const [hu, kn, fk, fe, ze] of [[23, 25, 27, 29, 31], [24, 26, 28, 30, 32]]) {
    if (!sicht(hu) || !sicht(kn)) continue;
    const Hp = P(hu), K = P(kn);
    knochen(beine, Hp, K, B * 0.1);
    kreis(beine, K, B * 0.07);
    if (!sicht(fk)) continue;
    const F = P(fk), q = mal(einheit(senk(minus(F, K))), B * 0.028);
    knochen(beine, minus(K, q), minus(F, q), B * 0.075);
    knochen(beine, plus(K, mal(q, 1.6)), plus(F, mal(q, 1.6)), B * 0.035);
    linie(beine, [F, P(ze)], B * 0.05);
    linie(beine, [F, P(fe)], B * 0.05);
    kreis(beine, F, B * 0.05);
  }

  const o = Math.max(1.5, B * 0.018);
  g.save();
  g.globalAlpha = alpha;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = GLUT;
  for (const gr of [rumpf, beine, arme]) {
    for (const l of gr.linien) { g.lineWidth = l.w + B * 0.12; g.beginPath(); pfad(g, l.pts); g.stroke(); }
    g.lineWidth = B * 0.12;
    for (const f of gr.flaechen) g.stroke(f);
  }
  const malen = gr => {
    g.strokeStyle = KONTUR;
    for (const l of gr.linien) { g.lineWidth = l.w + 2 * o; g.beginPath(); pfad(g, l.pts); g.stroke(); }
    g.lineWidth = 2 * o;
    for (const f of gr.flaechen) g.stroke(f);
    g.strokeStyle = KNOCHEN; g.fillStyle = KNOCHEN;
    for (const l of gr.linien) { g.lineWidth = l.w; g.beginPath(); pfad(g, l.pts); g.stroke(); }
    for (const f of gr.flaechen) g.fill(f);
  };
  malen(rumpf);
  malen(beine);
  if (kopf) zeichneSchaedel(g, P, B, o, t, kiefer);
  malen(arme);
  g.restore();
}

function zeichneSchaedel(g, P, B, o, t, kiefer) {
  const augen = mitte(P(2), P(5));
  let hoch = einheit(minus(augen, mitte(P(9), P(10))));
  if (!Number.isFinite(hoch[0])) hoch = [0, -1];
  const rechts = [-hoch[1], hoch[0]];
  const hs = Math.max(abst(P(7), P(8)) * 0.72, B * 0.3);
  g.save();
  g.translate(augen[0], augen[1]);
  g.rotate(Math.atan2(rechts[1], rechts[0]));
  g.scale(hs, hs);
  const lw = o / hs;

  const schaedel = new Path2D(); schaedel.ellipse(0, -0.35, 0.95, 1.0, 0, 0, 6.283);
  const gesicht = new Path2D();
  gesicht.moveTo(-0.66, 0.05); gesicht.lineTo(-0.6, 0.6);
  gesicht.quadraticCurveTo(-0.5, 0.76, -0.34, 0.76); gesicht.lineTo(0.34, 0.76);
  gesicht.quadraticCurveTo(0.5, 0.76, 0.6, 0.6); gesicht.lineTo(0.66, 0.05); gesicht.closePath();
  const kf = kiefer * 0.18;
  const unterkiefer = new Path2D();
  unterkiefer.moveTo(-0.58, 0.64 + kf * 0.3); unterkiefer.lineTo(-0.5, 0.96 + kf);
  unterkiefer.quadraticCurveTo(0, 1.16 + kf, 0.5, 0.96 + kf); unterkiefer.lineTo(0.58, 0.64 + kf * 0.3);
  unterkiefer.lineTo(0.38, 0.8 + kf); unterkiefer.lineTo(-0.38, 0.8 + kf); unterkiefer.closePath();

  g.strokeStyle = GLUT; g.lineWidth = B * 0.12 / hs;
  g.stroke(schaedel); g.stroke(unterkiefer);
  g.strokeStyle = KONTUR; g.lineWidth = 2 * lw;
  for (const pa of [unterkiefer, schaedel, gesicht]) g.stroke(pa);
  g.fillStyle = KNOCHEN;
  g.fill(unterkiefer); g.fill(schaedel); g.fill(gesicht);

  const sch = g.createRadialGradient(0, -0.35, 0.5, 0, -0.35, 1.0);
  sch.addColorStop(0, 'rgba(60,40,25,0)'); sch.addColorStop(1, 'rgba(60,40,25,0.35)');
  g.fillStyle = sch; g.fill(schaedel);

  // Augenhöhlen mit Glut
  const puls = 0.75 + 0.25 * Math.sin(t * 0.004);
  for (const s of [-1, 1]) {
    g.fillStyle = '#0a0604';
    g.beginPath(); g.ellipse(s * 0.34, 0.04, 0.25, 0.28, s * 0.15, 0, 6.283); g.fill();
    const gl = g.createRadialGradient(s * 0.34, 0.06, 0, s * 0.34, 0.06, 0.22);
    gl.addColorStop(0, `rgba(255,190,90,${puls})`);
    gl.addColorStop(0.35, `rgba(240,110,30,${0.7 * puls})`);
    gl.addColorStop(1, 'rgba(240,110,30,0)');
    g.fillStyle = gl;
    g.beginPath(); g.arc(s * 0.34, 0.06, 0.22, 0, 6.283); g.fill();
  }
  // Nase
  g.fillStyle = '#0a0604';
  g.beginPath(); g.moveTo(0, 0.28); g.lineTo(-0.11, 0.5); g.quadraticCurveTo(0, 0.55, 0.11, 0.5); g.closePath(); g.fill();
  // Zähne
  g.strokeStyle = KONTUR;
  g.lineWidth = 0.025;
  g.beginPath(); g.moveTo(-0.36, 0.76); g.lineTo(0.36, 0.76); g.stroke();
  g.beginPath(); g.moveTo(-0.34, 0.8 + kf); g.lineTo(0.34, 0.8 + kf); g.stroke();
  g.lineWidth = 0.016;
  for (let x = -0.3; x <= 0.31; x += 0.1) {
    g.beginPath(); g.moveTo(x, 0.64); g.lineTo(x, 0.76); g.stroke();
    g.beginPath(); g.moveTo(x, 0.8 + kf); g.lineTo(x, 0.9 + kf); g.stroke();
  }
  g.restore();
}
