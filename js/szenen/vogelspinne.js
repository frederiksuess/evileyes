// Szene „Vogelspinne“: Eine große, behaarte Spinne lauert in einer Ecke ihres Netzes.
// Taucht jemand auf, spannt sie sich kurz an und sprintet blitzschnell hinterher –
// in Schüben: rennen, erstarren, rennen. Kommt man ganz nah, richtet sie sich drohend auf.
//
// Alles wird prozedural gezeichnet (keine Bilddateien). Die Beine laufen mit inverser
// Kinematik und einem Vierer-Gang (je vier Beine wechseln sich ab).
import { S } from '../einstellungen.js';
import { krabbelKlang } from '../audio.js';
import { klemm, glatt, zufall, lerp, plus, minus, mal, abst, einheit, senk, drehe, winkelDiff } from '../util.js';

// Beine je Seite, vorne -> hinten. a: Ansatzwinkel am Vorderkörper, b: Richtung der Ruheposition,
// D: Abstand des Fußes vom Ansatz (in Körpereinheiten)
const BEINE = [
  { a: 0.55, b: 0.62, D: 2.35 },
  { a: 1.0, b: 1.22, D: 2.15 },
  { a: 1.45, b: 1.88, D: 2.1 },
  { a: 1.95, b: 2.5, D: 2.45 }
];

const FARBE = {
  koerper: '#1b1410', dunkel: '#120c08', panzer: '#2d2219', rand: 'rgba(214,132,60,0.6)',
  knie: '#b0561f', band: '#6e3a17', haar: '#4f3f31', haarHell: '#a8957e', haarRot: '#a84c24',
  netz: 'rgba(228,218,204,0.2)'
};

/** Haare für ein Beinsegment vorab würfeln (bleiben stabil, kein Flackern) */
const haareWuerfeln = n => Array.from({ length: n }, () => ({
  t: Math.random(), seite: Math.random() < 0.5 ? -1 : 1, l: zufall(0.5, 1.2),
  w: zufall(0.3, 0.9), hell: Math.random() < 0.25
}));

export class VogelspinneSzene {
  constructor() {
    this.id = 'vogelspinne';
    this.abdunkeln = 0.3;
    this.hatHoehe = false;           // „Höhe“ ergibt hier keinen Sinn
    this.fingerSofort = true;        // die Spinne jagt den Finger schon beim Auflegen
    this.halteStartetSpiel = false;  // Finger stillhalten lockt die Spinne – kein Spielstart
    this.W = 0; this.H = 0;
    this.ecke = null;
    this.zustand = 'lauern';
  }

  async laden() { /* alles prozedural */ }
  aktivieren() { this.ecke = null; }   // bei jedem Wechsel eine neue Ecke auswürfeln
  deaktivieren() {}

  // ------------------------------------------------------------------
  //  Aufbau: Ecke, Netz, Spinne
  // ------------------------------------------------------------------
  aufbauen(W, H, istInnen = () => true) {
    this.W = W; this.H = H;
    const U = Math.min(W, H);
    this.ecke ??= [Math.random() < 0.5 ? 0 : 1, Math.random() < 0.5 ? 0 : 1];
    const [ex, ey] = this.ecke;
    const innen = [ex ? -1 : 1, ey ? -1 : 1];
    // Bei einem runden Portal liegen die Ecken außerhalb: so weit zur Mitte rücken,
    // bis der Punkt sichtbar im Portal liegt
    let ecke = [ex ? W : 0, ey ? H : 0];
    const mitte = [W / 2, H / 2];
    for (let k = 0; k < 40 && !istInnen(...ecke); k++) ecke = lerp2(ecke, mitte, 0.04);
    this.eckPunkt = ecke;
    this.versteck = [ecke[0] + innen[0] * U * 0.2, ecke[1] + innen[1] * U * 0.19];
    this.nabe = [ecke[0] + innen[0] * U * 0.12, ecke[1] + innen[1] * U * 0.11];
    this.netzBauen(W, H, innen);

    // Spinne in ihr Versteck setzen
    this.pos = this.versteck.slice();
    this.v = [0, 0];
    this.theta = Math.atan2(H / 2 - this.pos[1], W / 2 - this.pos[0]);
    this.zustand = 'lauern';
    this.timer = 0;
    this.lauerZeit = 0;
    this.lauerSoll = zufall(1.2, 3.2);
    this.duck = 0;            // anspannen (0..1)
    this.droh = 0;            // aufrichten (0..1)
    this.drohPause = 0;
    this.dunkel = 1;          // Schatten über dem Versteck
    this.zitter = 0;          // Netzschwingung
    this.letztesZiel = null;
    this.zielZeit = -1e9;
    this.naechstesZucken = performance.now() + 2000;
    this.beine = [];
    for (const seite of [-1, 1]) {
      BEINE.forEach((b, k) => {
        const ansatz = [0.12 + Math.cos(b.a) * 0.46, seite * Math.sin(b.a) * 0.44];
        const ruhe = [ansatz[0] + Math.cos(b.b) * b.D, ansatz[1] + seite * Math.sin(b.b) * b.D];
        const reich = b.D * 1.07;
        this.beine.push({
          seite, k, gruppe: (k + (seite > 0 ? 1 : 0)) % 2, ansatz, ruhe,
          l1: reich * 0.46, l2: reich * 0.54, fuss: null, schritt: null, versatz: [0, 0],
          haare: { femur: haareWuerfeln(18), tibia: haareWuerfeln(15), meta: haareWuerfeln(10) }
        });
      });
    }
    // Taster (Pedipalpen)
    this.taster = [-1, 1].map(seite => ({ seite, haare: haareWuerfeln(6) }));
    // Hinterleib-Behaarung
    this.bauchHaare = Array.from({ length: 170 }, () => {
      const w = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random());
      const typ = Math.random();
      return { w, r, l: zufall(0.08, 0.2), farbe: typ < 0.14 ? FARBE.haarRot : typ < 0.5 ? FARBE.haar : '#2b1f17' };
    });
    for (const b of this.beine) b.fuss = this.welt(b.ruhe);
  }

  netzBauen(W, H, innen) {
    const U = Math.min(W, H);
    const nabe = this.nabe;
    const basis = Math.atan2(innen[1], innen[0]);          // Richtung in den Bildschirm
    const radiale = [];
    const anzahl = 17;
    for (let i = 0; i < anzahl; i++) {
      const w = basis + (i / (anzahl - 1) - 0.5) * (Math.PI * 0.95) + zufall(-0.04, 0.04);
      const d = [Math.cos(w), Math.sin(w)];
      // bis zum Bildschirmrand (+5 %)
      let tMax = 1e9;
      const m = 0.05;
      if (d[0] > 0) tMax = Math.min(tMax, (W * (1 + m) - nabe[0]) / d[0]);
      if (d[0] < 0) tMax = Math.min(tMax, (-W * m - nabe[0]) / d[0]);
      if (d[1] > 0) tMax = Math.min(tMax, (H * (1 + m) - nabe[1]) / d[1]);
      if (d[1] < 0) tMax = Math.min(tMax, (-H * m - nabe[1]) / d[1]);
      radiale.push({ d, len: Math.max(0, tMax) });
    }
    // Spiralringe
    const ringe = [];
    let r = U * 0.05;
    while (r < Math.hypot(W, H) * 1.05) {
      ringe.push(r);
      r += U * (0.024 + ringe.length * 0.0028) * zufall(0.85, 1.15);
    }
    this.netz = { radiale, ringe, tropfen: [], faeden: [] };
    // Tautropfen, die im Licht glitzern
    for (let i = 0; i < 28; i++) {
      const ri = Math.floor(Math.random() * ringe.length), rad = Math.floor(Math.random() * (anzahl - 1));
      this.netz.tropfen.push({ ri, rad, f: Math.random(), ph: Math.random() * 6.28 });
    }
    // ein paar lose, gerissene Fäden
    for (let i = 0; i < 6; i++) {
      const a = [Math.random() * W, Math.random() * H * 0.6];
      this.netz.faeden.push({ a, len: zufall(0.08, 0.2) * H, ph: Math.random() * 6.28 });
    }
  }

  /** Körperkoordinaten (Einheiten) -> Bildschirm */
  welt(lokal, groesse = this.s) {
    const d = drehe(mal(lokal, groesse), this.theta);
    return [this.pos[0] + d[0], this.pos[1] + d[1]];
  }

  // ------------------------------------------------------------------
  //  Verhalten
  // ------------------------------------------------------------------
  verhalten(t, dt, e) {
    const s = this.s;
    let ziel = e.imSpiel ? null : e.ziel;
    if (!ziel && this.zwangsZiel && t < this.zwangsBis) ziel = this.zwangsZiel;
    if (ziel) {
      ziel = [klemm(ziel[0], s, this.W - s), klemm(ziel[1], s, this.H - s)];
      this.letztesZiel = ziel;
      this.zielZeit = t;
    }
    const verloren = t - this.zielZeit > 2500;
    const z = ziel || this.letztesZiel;
    const dist = z ? abst(z, this.pos) : 1e9;
    const SPRINT = s * 26, JAGD = s * 19, ZURUECK = s * 6;
    let tempo = 0, richtung = null, beschl = 10;
    this.timer -= dt;

    switch (this.zustand) {
      case 'lauern': {
        if (abst(this.pos, this.versteck) > s * 0.3) { richtung = minus(this.versteck, this.pos); tempo = s * 3; }
        if (ziel) {
          this.lauerZeit += dt * (1 + e.naehe * 2);   // wer nah ist, wird schneller entdeckt
          if (this.lauerZeit > this.lauerSoll) { this.zustand = 'anspannen'; this.timer = 0.28; }
        } else this.lauerZeit = Math.max(0, this.lauerZeit - dt);
        break;
      }
      case 'anspannen':
        if (this.timer <= 0) { this.zustand = 'sprint'; krabbelKlang(); }
        break;
      case 'sprint':
        richtung = z ? minus(z, this.pos) : null; tempo = SPRINT; beschl = 16;
        if (dist < s * 2.3 && this.schreckDroh) { this.schreckDroh = false; this.zustand = 'drohen'; this.timer = 1.8; }
        else if (dist < s * 2.3) this.erstarren(0.35, 1.0);
        else if (verloren) this.zurueck(t);
        break;
      case 'jagen':
        richtung = z ? minus(z, this.pos) : null; tempo = JAGD; beschl = 15;
        if (dist < s * 2.1) this.erstarren(0.3, 1.2);
        else if (verloren) this.zurueck(t);
        break;
      case 'erstarren':
        beschl = 22;
        if (this.timer <= 0) {
          if (verloren) this.zurueck(t);
          else if (dist > s * 2.8) { this.zustand = 'jagen'; if (Math.random() < 0.5) krabbelKlang(); }
          else if (e.naehe > 0.55 && t > this.drohPause) { this.zustand = 'drohen'; this.timer = 1.4; }
          else this.timer = zufall(0.3, 0.8);
        }
        break;
      case 'drohen':
        if (this.timer <= 0) { this.drohPause = t + 5000; this.erstarren(0.4, 0.8); }
        break;
      case 'rueckzug':
        richtung = minus(this.versteck, this.pos); tempo = ZURUECK;
        if (abst(this.pos, this.versteck) < s * 0.4) {
          this.zustand = 'lauern'; this.lauerZeit = 0; this.lauerSoll = zufall(1.2, 3.5);
        } else if (ziel && t - this.rueckStart > 1200) {
          this.zustand = 'anspannen'; this.timer = 0.22;
        }
        break;
    }

    // Geschwindigkeit
    const soll = richtung ? mal(einheit(richtung), tempo) : [0, 0];
    const k = 1 - Math.exp(-beschl * dt);
    this.v = [this.v[0] + (soll[0] - this.v[0]) * k, this.v[1] + (soll[1] - this.v[1]) * k];
    this.pos = plus(this.pos, mal(this.v, dt));
    const rand = s * 0.9;
    this.pos = [klemm(this.pos[0], rand, this.W - rand), klemm(this.pos[1], rand, this.H - rand)];
    const geschw = Math.hypot(this.v[0], this.v[1]);

    // Blickrichtung
    let sollW, rate;
    if (geschw > s * 1.5) { sollW = Math.atan2(this.v[1], this.v[0]); rate = 16; }
    else if (z && this.zustand !== 'lauern') { sollW = Math.atan2(z[1] - this.pos[1], z[0] - this.pos[0]); rate = 6; }
    else if (ziel) { sollW = Math.atan2(ziel[1] - this.pos[1], ziel[0] - this.pos[0]); rate = 2.5; }
    else { sollW = Math.atan2(this.H / 2 - this.pos[1], this.W / 2 - this.pos[0]); rate = 1.5; }
    this.theta += klemm(winkelDiff(this.theta, sollW), -rate * dt, rate * dt);

    this.duck = glatt(this.duck, this.zustand === 'anspannen' ? 1 : 0, dt, 0.07);
    this.droh = glatt(this.droh, this.zustand === 'drohen' ? 1 : 0, dt, 0.15);
    this.dunkel = glatt(this.dunkel, this.zustand === 'lauern' ? 1 : 0, dt, this.zustand === 'lauern' ? 1.2 : 0.25);
    this.zitter = Math.max(this.zitter * Math.exp(-dt * 2.5), klemm(geschw / SPRINT, 0, 1));
    this.geschw = geschw;

    // Im Versteck zuckt ab und zu ein Bein
    if (this.zustand === 'lauern' && t > this.naechstesZucken) {
      const b = this.beine[Math.floor(Math.random() * 8)];
      b.versatz = [zufall(-0.25, 0.25), zufall(-0.25, 0.25)];
      this.naechstesZucken = t + zufall(900, 3500);
    }
  }

  erstarren(a, b) { this.zustand = 'erstarren'; this.timer = zufall(a, b); }

  /** Fernbedienung „Schreck“: sofort losrennen – auf das Ziel oder nach vorn unten auf die Gäste zu */
  schreck() {
    if (!this.beine) return;
    this.zwangsZiel = [this.W / 2 + zufall(-0.15, 0.15) * this.W, this.H * 0.72];
    this.zwangsBis = performance.now() + 2500;
    this.zielZeit = performance.now();
    this.letztesZiel = this.zwangsZiel;
    this.zustand = 'anspannen'; this.timer = 0.12;
    this.drohPause = 0;
    this.schreckDroh = true;              // am Ziel sofort aufrichten
  }
  zurueck(t) { this.zustand = 'rueckzug'; this.rueckStart = t; }

  /** Ruheposition eines Beins (Körpereinheiten), inkl. Ducken und Drohhaltung */
  heimLokal(b) {
    let p = [b.ruhe[0] + b.versatz[0], b.ruhe[1] + b.versatz[1]];
    if (this.duck > 0) p = lerp2(p, plus(b.ansatz, mal(minus(p, b.ansatz), 0.82)), this.duck);
    if (b.k === 0 && this.droh > 0) {
      const hoch = [b.ansatz[0] + Math.cos(0.8) * 1.9, b.ansatz[1] + b.seite * Math.sin(0.8) * 1.9];
      p = lerp2(p, hoch, this.droh);
    }
    return p;
  }

  /** Vierer-Gang: immer nur eine Beingruppe tritt gleichzeitig */
  beineBewegen(t, dt) {
    const s = this.s;
    const vor = mal(this.v, 0.1);                      // Füße setzen vorausschauend auf
    const schritte = this.beine.filter(b => b.schritt);
    for (const b of schritte) {
      const u = (t - b.schritt.t0) / (b.schritt.dauer * 1000);
      if (u >= 1) { b.fuss = b.schritt.nach; b.schritt = null; }
      else {
        const q = u * u * (3 - 2 * u);
        b.fuss = lerp2(b.schritt.von, b.schritt.nach, q);
        b.heben = Math.sin(Math.PI * u);
      }
    }
    for (const b of this.beine) {
      b.heim = plus(this.welt(this.heimLokal(b)), vor);
      if (!b.schritt) b.heben = 0;
      // erhobene Vorderbeine folgen direkt
      if (b.k === 0 && this.droh > 0.05) { b.fuss = lerp2(b.fuss, b.heim, 1 - Math.exp(-dt * 18)); b.schritt = null; }
    }
    if (this.beine.some(b => b.schritt)) return;
    let best = -1, bestFehler = 0;
    for (const gr of [0, 1]) {
      const f = Math.max(...this.beine.filter(b => b.gruppe === gr).map(b => abst(b.fuss, b.heim)));
      if (f > bestFehler) { bestFehler = f; best = gr; }
    }
    const schwelle = s * (this.geschw > s * 5 ? 0.45 : 0.32);
    if (bestFehler < schwelle) return;
    const dauer = klemm(s * 0.9 / Math.max(this.geschw, s * 2.5), 0.045, 0.16);
    for (const b of this.beine) {
      if (b.gruppe !== best || (b.k === 0 && this.droh > 0.05)) continue;
      if (abst(b.fuss, b.heim) < schwelle * 0.3) continue;
      b.schritt = { von: b.fuss.slice(), nach: plus(b.heim, mal(this.v, dauer * 0.5)), t0: t, dauer };
      if (b.versatz[0] || b.versatz[1]) b.versatz = mal(b.versatz, 0.4);
    }
  }

  // ------------------------------------------------------------------
  //  Zeichnen
  // ------------------------------------------------------------------
  zeichne(ctx, t, dt, e) {
    const { W, H } = e;
    this.s = Math.min(W, H) * 0.12 * S.ansicht.vogelspinne.zoom;
    if (W !== this.W || H !== this.H || !this.ecke || !this.beine || e.portalVersion !== this.portalVersion) {
      this.portalVersion = e.portalVersion;
      this.aufbauen(W, H, e.innen);
    }
    this.verhalten(t, dt, e);
    this.beineBewegen(t, dt);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const glut = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.7);
    glut.addColorStop(0, 'rgba(70,28,8,0.4)'); glut.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glut; ctx.fillRect(0, 0, W, H);

    this.zeichneNetz(ctx, t);
    this.zeichneSpinne(ctx, t);

    // Schatten über dem Versteck – die Spinne lauert im Dunkeln
    if (this.dunkel > 0.01) {
      const U = Math.min(W, H);
      const gr = ctx.createRadialGradient(...this.eckPunkt, U * 0.05, ...this.eckPunkt, U * 0.62);
      gr.addColorStop(0, `rgba(0,0,0,${0.82 * this.dunkel})`);
      gr.addColorStop(0.6, `rgba(0,0,0,${0.55 * this.dunkel})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      this.zeichneAugen(ctx, t, this.dunkel);     // Augen glitzern aus der Dunkelheit
    }
  }

  /** Netzpunkt verschieben: die Spinne zieht das Netz zu sich, beim Rennen schwingt es */
  netzVersatz(p, t) {
    const s = this.s, dx = this.pos[0] - p[0], dy = this.pos[1] - p[1];
    const d2 = (dx * dx + dy * dy) / (s * s * 9);
    if (d2 > 6) return p;
    const f = Math.exp(-d2);
    const zug = 0.07 * f;
    const sch = this.zitter * s * 0.12 * f * Math.sin(t * 0.045 + (p[0] + p[1]) * 0.02);
    return [p[0] + dx * zug + sch, p[1] + dy * zug - sch];
  }

  zeichneNetz(g, t) {
    const { radiale, ringe, tropfen, faeden } = this.netz;
    const nabe = this.nabe, W = this.W;
    const punkt = (rad, r) => this.netzVersatz([nabe[0] + rad.d[0] * r, nabe[1] + rad.d[1] * r], t);
    g.save();
    g.strokeStyle = FARBE.netz;
    g.lineWidth = Math.max(1, W / 650);
    g.lineCap = 'round';
    // Speichen
    g.beginPath();
    for (const rad of radiale) {
      const schritte = 20;
      for (let i = 0; i <= schritte; i++) {
        const p = punkt(rad, rad.len * i / schritte);
        i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]);
      }
    }
    g.stroke();
    // Spirale (leicht durchhängend zur Nabe hin)
    g.beginPath();
    for (const r of ringe) {
      for (let i = 0; i < radiale.length - 1; i++) {
        const a = radiale[i], b = radiale[i + 1];
        if (r > a.len || r > b.len) continue;
        const p = punkt(a, r), q = punkt(b, r);
        const m = this.netzVersatz([nabe[0] + (a.d[0] + b.d[0]) / 2 * r * 0.93, nabe[1] + (a.d[1] + b.d[1]) / 2 * r * 0.93], t);
        g.moveTo(p[0], p[1]);
        g.quadraticCurveTo(m[0], m[1], q[0], q[1]);
      }
    }
    g.stroke();
    // gerissene Fäden, die leicht wehen
    g.strokeStyle = 'rgba(228,218,204,0.12)';
    for (const f of faeden) {
      g.beginPath();
      g.moveTo(f.a[0], f.a[1]);
      const sw = Math.sin(t * 0.0012 + f.ph) * f.len * 0.12;
      g.quadraticCurveTo(f.a[0] + sw, f.a[1] + f.len * 0.5, f.a[0] + sw * 1.6, f.a[1] + f.len);
      g.stroke();
    }
    // dichte Seide im Versteck
    g.strokeStyle = 'rgba(228,218,204,0.09)';
    const U = Math.min(this.W, this.H);
    for (let i = 0; i < 22; i++) {
      const w = i * 0.29, r1 = U * (0.02 + (i % 5) * 0.012), r2 = U * (0.12 + (i % 7) * 0.02);
      g.beginPath();
      g.moveTo(nabe[0] + Math.cos(w) * r1, nabe[1] + Math.sin(w) * r1);
      g.quadraticCurveTo(nabe[0] + Math.cos(w + 0.6) * r2 * 0.6, nabe[1] + Math.sin(w + 0.6) * r2 * 0.6,
                         nabe[0] + Math.cos(w + 1.1) * r2, nabe[1] + Math.sin(w + 1.1) * r2);
      g.stroke();
    }
    // Tautropfen
    g.globalCompositeOperation = 'lighter';
    for (const d of tropfen) {
      const r = ringe[d.ri], a = radiale[d.rad], b = radiale[d.rad + 1];
      if (!a || !b || r > a.len || r > b.len) continue;
      const p = punkt(a, r), q = punkt(b, r);
      const x = lerp(p[0], q[0], d.f), y = lerp(p[1], q[1], d.f);
      g.globalAlpha = 0.25 + 0.5 * Math.max(0, Math.sin(t * 0.0021 + d.ph)) ** 4;
      const rr = Math.max(1.5, W / 380) * 2.5;
      g.drawImage(GLITZER, x - rr, y - rr, rr * 2, rr * 2);
    }
    g.restore();
  }

  /** Behaartes Segment von A nach B */
  segment(g, A, B, w0, w1, farbe, haare, haarLang) {
    const d = minus(B, A), L = Math.hypot(d[0], d[1]) || 1, u = mal(d, 1 / L), n = senk(u);
    g.fillStyle = farbe;
    g.beginPath();
    g.moveTo(...plus(A, mal(n, w0 / 2)));
    g.lineTo(...plus(B, mal(n, w1 / 2)));
    g.arc(B[0], B[1], w1 / 2, Math.atan2(n[1], n[0]), Math.atan2(-n[1], -n[0]), true);
    g.lineTo(...plus(A, mal(n, -w0 / 2)));
    g.arc(A[0], A[1], w0 / 2, Math.atan2(-n[1], -n[0]), Math.atan2(n[1], n[0]), true);
    g.fill();
    if (!haare) return;
    // Haare nur in die Sammelpfade legen – gezeichnet wird je Bein in zwei Strichen
    for (const h of haare) {
      const w = lerp(w0, w1, h.t) / 2;
      const p = plus(plus(A, mal(d, h.t)), mal(n, h.seite * w * 0.8));
      const r = einheit(plus(mal(n, h.seite * Math.cos(h.w)), mal(u, Math.sin(h.w))));
      const ziel = h.hell ? this.haarHell : this.haarDunkel;
      ziel.moveTo(p[0], p[1]);
      ziel.lineTo(p[0] + r[0] * haarLang * h.l, p[1] + r[1] * haarLang * h.l);
    }
  }

  haareBeginnen() { this.haarDunkel = new Path2D(); this.haarHell = new Path2D(); }
  haareZeichnen(g) {
    g.globalAlpha = 0.9; g.strokeStyle = FARBE.haar; g.stroke(this.haarDunkel);
    g.globalAlpha = 0.7; g.strokeStyle = FARBE.haarHell; g.stroke(this.haarHell);
    g.globalAlpha = 1;
  }

  /** Zwei-Gelenk-IK; das Knie zeigt vom Körper weg */
  knie(wurzel, fuss, l1, l2) {
    let d = minus(fuss, wurzel);
    let L = Math.hypot(d[0], d[1]);
    const max = (l1 + l2) * 0.985, min = Math.abs(l1 - l2) * 1.05 + 1e-3;
    if (L > max) { fuss = plus(wurzel, mal(d, max / L)); d = minus(fuss, wurzel); L = max; }
    if (L < min) L = min;
    const a = Math.acos(klemm((l1 * l1 + L * L - l2 * l2) / (2 * l1 * L), -1, 1));
    const u = einheit(d);
    const k1 = plus(wurzel, mal(drehe(u, a), l1)), k2 = plus(wurzel, mal(drehe(u, -a), l1));
    return [abst(k1, this.pos) > abst(k2, this.pos) ? k1 : k2, fuss];
  }

  zeichneSpinne(g, t) {
    const s = this.s * (1 + this.droh * 0.14);
    const hl = this.s * 0.12;       // Haarlänge
    g.save();
    g.lineCap = 'round';
    g.lineWidth = Math.max(1, this.s * 0.012);

    // weicher Schatten auf dem Netz
    const sp = this.welt([-0.4, 0.15]);
    const sh = g.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], this.s * 2.6);
    sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.beginPath(); g.arc(sp[0], sp[1], this.s * 2.6, 0, 6.283); g.fill();

    // Zittern beim Drohen
    const bebe = this.droh > 0.2 ? [Math.sin(t * 0.09) * this.s * 0.02 * this.droh, Math.cos(t * 0.11) * this.s * 0.02 * this.droh] : [0, 0];
    const altPos = this.pos;
    this.pos = plus(this.pos, bebe);

    // Beine (hinten zuerst); erhobene Vorderbeine kommen später über den Körper
    const sortiert = this.beine.slice().sort((a, b) => b.k - a.k);
    const zeichneBein = b => {
      this.haareBeginnen();
      const wurzel = this.welt(b.ansatz);
      const l1 = b.l1 * this.s, l2 = b.l2 * this.s;
      // angehobene Füße rücken optisch näher an den Körper
      let fuss = b.fuss;
      if (b.heben) fuss = lerp2(fuss, wurzel, 0.12 * b.heben);
      const hoch = b.k === 0 ? this.droh : 0;
      const breit = 1 + hoch * 0.25;
      const [K, F] = this.knie(wurzel, fuss, l1, l2);
      const M = lerp2(K, F, 0.55), T = lerp2(K, F, 0.86);
      const ws = this.s * breit;
      g.fillStyle = FARBE.dunkel;
      g.beginPath(); g.arc(wurzel[0], wurzel[1], ws * 0.15, 0, 6.283); g.fill();
      this.segment(g, wurzel, K, ws * 0.25, ws * 0.22, FARBE.koerper, b.haare.femur, hl);
      this.segment(g, lerp2(wurzel, K, 0.9), lerp2(K, M, 0.14), ws * 0.2, ws * 0.19, FARBE.knie, null);
      this.segment(g, K, M, ws * 0.2, ws * 0.17, FARBE.koerper, b.haare.tibia, hl);
      this.segment(g, lerp2(K, M, 0.9), lerp2(M, T, 0.06), ws * 0.16, ws * 0.15, FARBE.band, null);
      this.segment(g, M, T, ws * 0.15, ws * 0.12, FARBE.koerper, b.haare.meta, hl * 0.85);
      this.segment(g, T, F, ws * 0.12, ws * 0.09, FARBE.dunkel, null);
      this.haareZeichnen(g);
    };
    const oben = this.droh > 0.3;
    for (const b of sortiert) if (!(oben && b.k === 0)) zeichneBein(b);

    // Taster
    for (const tp of this.taster) {
      this.haareBeginnen();
      const wurzel = this.welt([0.72, tp.seite * 0.26]);
      const wackel = Math.sin(t * 0.004 + tp.seite) * 0.08;
      const spitze = this.welt([1.45 + this.droh * 0.3, tp.seite * (0.58 + wackel)]);
      const [K, F] = this.knie(wurzel, spitze, this.s * 0.5, this.s * 0.55);
      this.segment(g, wurzel, K, this.s * 0.12, this.s * 0.11, FARBE.koerper, tp.haare, hl * 0.8);
      this.segment(g, K, F, this.s * 0.11, this.s * 0.1, FARBE.koerper, null);
      g.fillStyle = FARBE.dunkel; g.beginPath(); g.arc(F[0], F[1], this.s * 0.07, 0, 6.283); g.fill();
      this.haareZeichnen(g);
    }

    // Körper in lokalen Koordinaten zeichnen
    g.save();
    g.translate(this.pos[0], this.pos[1]);
    g.rotate(this.theta);
    g.scale(s, s);
    g.lineWidth = 0.012;

    // Hinterleib (atmet leicht)
    const atem = 1 + Math.sin(t * 0.0025) * 0.02 - this.droh * 0.06;
    g.save();
    g.translate(-1.22, 0);
    g.scale(atem, atem);
    const bauch = g.createRadialGradient(0.15, -0.2, 0.05, 0, 0, 1.0);
    bauch.addColorStop(0, '#4a3628'); bauch.addColorStop(0.55, '#24190f'); bauch.addColorStop(1, '#0f0a07');
    g.fillStyle = bauch;
    g.beginPath(); g.ellipse(0, 0, 0.95, 0.76, 0, 0, 6.283); g.fill();
    g.lineWidth = 0.016;
    const buendel = new Map();
    for (const h of this.bauchHaare) {
      const x = Math.cos(h.w) * h.r * 0.9, y = Math.sin(h.w) * h.r * 0.72;
      const dx = Math.cos(h.w) * 0.35 - 0.8, dy = Math.sin(h.w) * 0.6;
      const l = Math.hypot(dx, dy);
      if (!buendel.has(h.farbe)) buendel.set(h.farbe, new Path2D());
      const pa = buendel.get(h.farbe);
      pa.moveTo(x, y); pa.lineTo(x + dx / l * h.l, y + dy / l * h.l);
    }
    for (const [farbe, pa] of buendel) { g.strokeStyle = farbe; g.stroke(pa); }
    g.restore();

    // Stiel
    g.fillStyle = FARBE.dunkel;
    g.beginPath(); g.ellipse(-0.3, 0, 0.16, 0.12, 0, 0, 6.283); g.fill();

    // Vorderkörper (Panzer) mit strahligem Muster und orangem Rand
    const panzer = g.createRadialGradient(0.25, -0.12, 0.05, 0.15, 0, 0.62);
    panzer.addColorStop(0, '#4a3828'); panzer.addColorStop(1, FARBE.panzer);
    g.fillStyle = panzer;
    g.beginPath(); g.ellipse(0.15, 0, 0.62, 0.56, 0, 0, 6.283); g.fill();
    g.strokeStyle = 'rgba(165,115,72,0.2)';
    g.lineWidth = 0.018;
    for (let i = 0; i < 12; i++) {
      const w = i / 12 * Math.PI * 2;
      g.beginPath(); g.moveTo(0.05 + Math.cos(w) * 0.08, Math.sin(w) * 0.08);
      g.lineTo(0.15 + Math.cos(w) * 0.5, Math.sin(w) * 0.46); g.stroke();
    }
    g.strokeStyle = FARBE.rand;
    g.lineWidth = 0.025;
    g.beginPath(); g.ellipse(0.15, 0, 0.6, 0.54, 0, 0, 6.283); g.stroke();
    g.fillStyle = '#0b0705';
    g.beginPath(); g.ellipse(0.02, 0, 0.07, 0.025, 0, 0, 6.283); g.fill();

    // Kieferklauen + Giftklauen
    for (const sgn of [-1, 1]) {
      g.fillStyle = '#1d1510';
      g.beginPath(); g.ellipse(0.84, sgn * 0.15, 0.21, 0.135, sgn * 0.1, 0, 6.283); g.fill();
      g.strokeStyle = FARBE.haar;
      g.lineWidth = 0.014;
      for (let i = 0; i < 5; i++) {
        g.beginPath(); g.moveTo(0.8 + i * 0.04, sgn * (0.1 + (i % 2) * 0.07));
        g.lineTo(0.92 + i * 0.045, sgn * (0.12 + (i % 2) * 0.09)); g.stroke();
      }
      if (this.droh > 0.05) {
        const f = this.droh;
        g.lineCap = 'round';
        g.strokeStyle = '#050302';
        g.lineWidth = 0.075;
        g.beginPath(); g.moveTo(1.0, sgn * 0.16);
        g.quadraticCurveTo(1.0 + 0.3 * f, sgn * 0.18, 1.0 + 0.26 * f, sgn * (0.16 - 0.17 * f)); g.stroke();
        g.strokeStyle = `rgba(120,70,40,${0.8 * f})`;
        g.lineWidth = 0.025;
        g.beginPath(); g.moveTo(1.04, sgn * 0.16);
        g.quadraticCurveTo(1.0 + 0.27 * f, sgn * 0.17, 1.0 + 0.24 * f, sgn * (0.16 - 0.15 * f)); g.stroke();
      }
    }
    g.restore();

    this.zeichneAugen(g, t, 1);
    if (oben) for (const b of sortiert) if (b.k === 0) zeichneBein(b);
    this.pos = altPos;
    g.restore();
  }

  /** Acht kleine glänzende Augen auf dem Augenhügel */
  zeichneAugen(g, t, staerke) {
    const s = this.s * (1 + this.droh * 0.14);
    g.save();
    g.translate(this.pos[0], this.pos[1]);
    g.rotate(this.theta);
    g.scale(s, s);
    g.fillStyle = '#16100c';
    g.beginPath(); g.ellipse(0.58, 0, 0.11, 0.1, 0, 0, 6.283); g.fill();
    const augen = [[0.62, -0.035, 0.03], [0.62, 0.035, 0.03], [0.55, -0.075, 0.022], [0.55, 0.075, 0.022],
                   [0.66, -0.08, 0.018], [0.66, 0.08, 0.018], [0.52, -0.03, 0.016], [0.52, 0.03, 0.016]];
    const glanz = 0.6 + 0.4 * Math.sin(t * 0.003) ** 2;
    for (const [x, y, r] of augen) {
      g.fillStyle = '#030201';
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
      g.fillStyle = `rgba(255,196,130,${0.85 * glanz * staerke})`;
      g.beginPath(); g.arc(x + r * 0.3, y - r * 0.3, r * 0.4, 0, 6.283); g.fill();
    }
    g.restore();
  }
}

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Ein Tautropfen-Glitzern, einmal vorgerendert
const GLITZER = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,214,160,1)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return c;
})();
