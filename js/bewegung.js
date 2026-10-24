// Bewegungserkennung auf einem kleinen Raster (96 x 72).
//  - Hintergrundmodell: was ist neu im Bild? -> Personen (Klumpen) und deren Spuren
//  - Bild-zu-Bild-Differenz: was bewegt sich gerade schnell? -> Patschen im Spiel, Winken
//  - Restlichtverstärker: dunkle Bilder werden aufgehellt, zeitlich geglättet, und die
//    Schwellen passen sich dem Bildrauschen an (sonst hält die Erkennung Rauschen für Bewegung)
import { video, bildBereit } from './kamera.js';
import { S } from './einstellungen.js';
import { klemm } from './util.js';

export const PW = 96, PH = 72, N = PW * PH;

const proc = document.createElement('canvas');
proc.width = PW; proc.height = PH;
const pctx = proc.getContext('2d', { willReadFrequently: true });

export const aktuell = new Float32Array(N);   // Graustufen
export const sauber = new Uint8Array(N);      // bereinigte Bewegungsmaske
export const schnell = new Uint8Array(N);     // schnelle Bewegung seit dem letzten Bild
const regung = new Uint8Array(N);             // feine Bewegung (Atmen, Wippen) – unterscheidet Menschen von „Geistern“
const regungNah = new Uint8Array(N);          // … in der Nähe (Radius 4)
const ruhig = new Uint16Array(N);             // Bilder in Folge ohne Regung in der Nähe
const hg = new Float32Array(N);
const roh = new Float32Array(N);
const histo = new Uint32Array(256);
const vorher = new Float32Array(N);
const bewegt = new Uint8Array(N);
const tmp = new Uint8Array(N);
const breit = new Uint8Array(N);
const label = new Int32Array(N);
const stapel = new Int32Array(N);

let hgBereit = false, vorherBereit = false, lernen = 0;

// Ausgeblendete Bereiche (z. B. die Leinwand selbst, ein Fenster, ein Fernseher)
const ignor = new Uint8Array(N);
let ignorSchluessel = '';
function ignorAktualisieren() {
  const s = JSON.stringify(S.ignorieren);
  if (s === ignorSchluessel) return;
  ignorSchluessel = s;
  ignor.fill(0);
  for (const [a, b, c, d] of S.ignorieren) {
    const x0 = Math.floor(Math.min(a, c) * PW), x1 = Math.ceil(Math.max(a, c) * PW);
    const y0 = Math.floor(Math.min(b, d) * PH), y1 = Math.ceil(Math.max(b, d) * PH);
    for (let y = Math.max(0, y0); y < Math.min(PH, y1); y++) for (let x = Math.max(0, x0); x < Math.min(PW, x1); x++) ignor[y * PW + x] = 1;
  }
}

export const bewegung = {
  gesamt: 0,           // Anteil bewegter Fläche (0..1)
  helligkeit: 1,       // mittlere Helligkeit des Kamerabilds (0..1)
  verstaerkung: 1,     // aktuelle Aufhellung durch den Restlichtverstärker
  rauschen: 0,         // geschätztes Bildrauschen (Graustufen)
  spuren: [],          // erkannte Personen über die Zeit
  schwelle: 26,
  takt: 66,            // ms zwischen zwei Analysen
  beiAnalyse: new Set() // Rückrufe nach jeder Analyse (Spiel, Vorschau)
};

export function empfindlichkeitSetzen(wert) { bewegung.schwelle = 66 - wert; }
export function neuLernen() { lernen = 12; bewegung.spuren = []; }

let naechsteId = 1;

function spurenAktualisieren(klumpen, jetzt) {
  const frei = klumpen.slice();
  const spuren = bewegung.spuren.sort((a, b) => a.erst - b.erst);
  for (const sp of spuren) {
    let best = -1, bestD = 0.24;
    frei.forEach((b, i) => {
      const d = Math.hypot(b.x - sp.x, (b.y - sp.y) * 0.7);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0) continue;
    const b = frei.splice(best, 1)[0];
    sp.x += (b.x - sp.x) * 0.55;
    sp.y += (b.y - sp.y) * 0.55;
    if (b.aktiv >= 3) sp.zuletztAktiv = jetzt;
    sp.w += (b.w - sp.w) * 0.2;
    sp.flaeche += (b.flaeche - sp.flaeche) * 0.3;
    sp.box = b.box;
    sp.zuletzt = jetzt;
    sp.treffer++;
  }
  for (const b of frei) {
    spuren.push({ id: naechsteId++, x: b.x, y: b.y, w: b.w, flaeche: b.flaeche, box: b.box,
                  erst: jetzt, zuletzt: jetzt, zuletztAktiv: b.aktiv >= 3 ? jetzt : -1e9, treffer: 1, gesehen: false });
  }
  // „Geister“: Wo jemand beim Lernen stand und dann wegging, sieht der Hintergrund anders aus
  // als gelernt – das wirkt wie eine Person, die sich nie regt. Solche Bereiche werden nach
  // 4 s ohne jede feine Bewegung in den Hintergrund übernommen.
  for (const sp of spuren) {
    if (jetzt - sp.zuletzt < 300 && jetzt - sp.zuletztAktiv > 4000) {
      const [bx, by, bw, bh] = sp.box;
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
        const i = y * PW + x;
        if (sauber[i] || bewegt[i]) hg[i] = aktuell[i];
      }
      sp.zuletzt = -1e9;
    }
  }
  bewegung.spuren = spuren.filter(sp => jetzt - sp.zuletzt < 2500);
}

/** Binärmaske um r Pixel ausdehnen (getrennt in x und y) */
function ausdehnen(von, nach, r) {
  for (let y = 0; y < PH; y++) {
    let letzte = -1e9;
    for (let x = 0; x < PW; x++) { if (von[y * PW + x]) letzte = x; tmp[y * PW + x] = x - letzte <= r ? 1 : 0; }
    letzte = 1e9;
    for (let x = PW - 1; x >= 0; x--) { if (von[y * PW + x]) letzte = x; if (letzte - x <= r) tmp[y * PW + x] = 1; }
  }
  for (let x = 0; x < PW; x++) {
    let letzte = -1e9;
    for (let y = 0; y < PH; y++) { if (tmp[y * PW + x]) letzte = y; nach[y * PW + x] = y - letzte <= r ? 1 : 0; }
    letzte = 1e9;
    for (let y = PH - 1; y >= 0; y--) { if (tmp[y * PW + x]) letzte = y; if (letzte - y <= r) nach[y * PW + x] = 1; }
  }
}

/** Zusammenhängende Bewegungsbereiche finden (Kopf, Arme, Körper einer Person verschmelzen). */
function findeKlumpen() {
  // Ausdehnen mit Radius 2 (getrennt in x und y)
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    let v = 0;
    for (let k = -2; k <= 2 && !v; k++) { const xx = x + k; if (xx >= 0 && xx < PW && sauber[y * PW + xx]) v = 1; }
    tmp[y * PW + x] = v;
  }
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    let v = 0;
    for (let k = -2; k <= 2 && !v; k++) { const yy = y + k; if (yy >= 0 && yy < PH && tmp[yy * PW + x]) v = 1; }
    breit[y * PW + x] = v;
  }
  label.fill(0);
  const klumpen = [];
  let nr = 0;
  for (let i = 0; i < N; i++) {
    if (!breit[i] || label[i]) continue;
    nr++;
    let sp = 0; stapel[sp++] = i; label[i] = nr;
    let n = 0, sx = 0, aktiv = 0, sxa = 0, x0 = PW, x1 = -1, y0 = PH, y1 = -1;
    while (sp) {
      const j = stapel[--sp];
      const x = j % PW, y = (j / PW) | 0;
      if (regung[j]) { aktiv++; sxa += x; }
      if (sauber[j]) {
        n++; sx += x;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      if (x > 0 && breit[j - 1] && !label[j - 1]) { label[j - 1] = nr; stapel[sp++] = j - 1; }
      if (x < PW - 1 && breit[j + 1] && !label[j + 1]) { label[j + 1] = nr; stapel[sp++] = j + 1; }
      if (y > 0 && breit[j - PW] && !label[j - PW]) { label[j - PW] = nr; stapel[sp++] = j - PW; }
      if (y < PH - 1 && breit[j + PW] && !label[j + PW]) { label[j + PW] = nr; stapel[sp++] = j + PW; }
    }
    if (n > N * 0.002) klumpen.push({ n, sx, aktiv, sxa, x0, x1, y0, y1 });
  }
  // Teile übereinander (Kopf, Oberkörper, Beine) gehören zu einer Person -> verschmelzen
  let verschmolzen = true;
  while (verschmolzen) {
    verschmolzen = false;
    for (let a = 0; a < klumpen.length && !verschmolzen; a++) for (let b = a + 1; b < klumpen.length; b++) {
      const A = klumpen[a], B = klumpen[b];
      const ueber = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) + 1;
      const schmal = Math.min(A.x1 - A.x0, B.x1 - B.x0) + 1;
      const luecke = Math.max(A.y0, B.y0) - Math.min(A.y1, B.y1);
      if (ueber >= schmal * 0.5 && luecke <= PH * 0.2) {
        klumpen[a] = { n: A.n + B.n, sx: A.sx + B.sx, aktiv: A.aktiv + B.aktiv, sxa: A.sxa + B.sxa,
                       x0: Math.min(A.x0, B.x0), x1: Math.max(A.x1, B.x1), y0: Math.min(A.y0, B.y0), y1: Math.max(A.y1, B.y1) };
        klumpen.splice(b, 1);
        verschmolzen = true;
        break;
      }
    }
  }
  return klumpen
    .filter(k => k.n > N * 0.005)
    .map(k => ({
      // Wo es sich regt, ist die Person – das zieht die Position weg von trägen Restflächen
      x: (k.aktiv >= 6 ? 0.7 * k.sxa / k.aktiv + 0.3 * k.sx / k.n : k.sx / k.n) / PW,
      y: (k.y0 + (k.y1 - k.y0) * 0.22) / PH,     // oberer Teil ~ Kopf
      w: (k.x1 - k.x0 + 1) / PW,
      flaeche: k.n / N,
      aktiv: k.aktiv,
      box: [k.x0, k.y0, k.x1 - k.x0 + 1, k.y1 - k.y0 + 1]
    }))
    .sort((a, b) => b.flaeche - a.flaeche)
    .slice(0, 5);
}

function analysieren() {
  pctx.drawImage(video, 0, 0, PW, PH);
  const d = pctx.getImageData(0, 0, PW, PH).data;
  let summe = 0;
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    roh[i] = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
    summe += roh[i];
  }
  const mittel = summe / N;
  bewegung.helligkeit = mittel / 255;

  // Restlichtverstärker: auf mittlere Helligkeit ~110 bringen (max. 5-fach), träge nachgeführt
  const ziel = S.nachtsicht ? klemm(110 / Math.max(mittel, 1), 1, 5) : 1;
  bewegung.verstaerkung += (ziel - bewegung.verstaerkung) * 0.1;
  const v = bewegung.verstaerkung;
  const glaetten = vorherBereit && v > 1.5;            // im Dunkeln Rauschen zeitlich mitteln
  for (let i = 0; i < N; i++) {
    const wert = Math.min(255, roh[i] * v);
    aktuell[i] = glaetten ? (aktuell[i] + wert) * 0.5 : wert;
  }

  if (!hgBereit) { hg.set(aktuell); hgBereit = true; lernen = 12; }

  // Rauschen schätzen: Median der Bild-zu-Bild-Differenz
  if (vorherBereit) {
    histo.fill(0);
    for (let i = 0; i < N; i++) histo[Math.min(255, Math.abs(aktuell[i] - vorher[i]) | 0)]++;
    let n = 0, med = 0;
    while (med < 255 && (n += histo[med]) < N / 2) med++;
    bewegung.rauschen += (med - bewegung.rauschen) * 0.1;
  }
  const schnellSchwelle = Math.max(22, bewegung.rauschen * 4);

  // schnelle Bewegung
  ignorAktualisieren();
  const regSchwelle = Math.max(7, bewegung.rauschen * 3);
  let nSchnell = 0;
  for (let i = 0; i < N; i++) {
    const d = vorherBereit && !ignor[i] ? Math.abs(aktuell[i] - vorher[i]) : 0;
    const b = d > schnellSchwelle ? 1 : 0;
    schnell[i] = b; nSchnell += b;
    regung[i] = d > regSchwelle ? 1 : 0;
  }
  if (nSchnell > N * 0.6) schnell.fill(0);       // Kamera gewackelt / Licht
  vorher.set(aktuell);
  vorherBereit = true;

  // Belichtungsausgleich: Webcams regeln die Helligkeit nach, sobald jemand ins Bild kommt.
  // Verhältnis Hintergrund/aktuell über alle Stellen ohne Person -> vor dem Vergleich ausgleichen.
  let sh = 0, sa = 0;
  for (let i = 0; i < N; i++) if (!sauber[i]) { sh += hg[i]; sa += aktuell[i]; }
  const ausgleich = sa > 0 ? klemm(sh / sa, 0.7, 1.4) : 1;

  // Hintergrundmodell
  let anzahl = 0;
  const thr = Math.max(bewegung.schwelle, bewegung.rauschen * 3.5);
  for (let i = 0; i < N; i++) {
    const b = !ignor[i] && Math.abs(aktuell[i] * ausgleich - hg[i]) > thr ? 1 : 0;
    bewegt[i] = b; anzahl += b;
  }
  sauber.fill(0);
  const jetzt = performance.now();
  // (sauber war bis eben die Maske des letzten Bildes – oben für den Belichtungsausgleich genutzt)

  if (lernen > 0 || anzahl > N * 0.55) {
    // Lernphase oder Licht/Handy hat sich geändert: Hintergrund neu übernehmen
    if (lernen > 0) lernen--;
    hg.set(aktuell);
    bewegung.gesamt = 0;
  } else {
    let n = 0;
    for (let y = 1; y < PH - 1; y++) for (let x = 1; x < PW - 1; x++) {
      const i = y * PW + x;
      if (bewegt[i] && bewegt[i - 1] + bewegt[i + 1] + bewegt[i - PW] + bewegt[i + PW] >= 3) { sauber[i] = 1; n++; }
    }
    bewegung.gesamt = n / N;
    spurenAktualisieren(findeKlumpen(), jetzt);
    // Wo sich seit ~1 s in der Nähe nichts regt, aber trotzdem „Person“ erkannt wird, ist ein Geist:
    // z. B. die Stelle, an der jemand beim Lernen stand. Diese Pixel wandern rasch in den Hintergrund.
    ausdehnen(regung, regungNah, 4);
    const geistNach = Math.round(1000 / bewegung.takt);
    for (let i = 0; i < N; i++) {
      ruhig[i] = regungNah[i] ? 0 : Math.min(60000, ruhig[i] + 1);
      // Hintergrund langsam nachführen (an die neue Belichtung); echte Personen nur sehr langsam
      const rate = !bewegt[i] ? 0.05 : ruhig[i] > geistNach ? 0.25 : 0.004;
      hg[i] += (aktuell[i] - hg[i]) * rate;
    }
  }
  for (const f of bewegung.beiAnalyse) f(jetzt);
}

export function bewegungStarten() {
  const schleife = () => {
    try { if (bildBereit()) analysieren(); } catch (e) { console.warn(e); }
    setTimeout(schleife, bewegung.takt);
  };
  schleife();
}

/** Aktive Personen: lange genug gesehen, nicht verloren und mit Lebenszeichen (Geister zählen nicht) */
export const aktiveSpuren = t => bewegung.spuren.filter(sp =>
  t - sp.zuletzt < 1500 && sp.treffer >= 3 && t - sp.zuletztAktiv < 1200);

/** Kamerabild-Koordinate (0..1) -> Bildschirm-Anteil (0..1), berücksichtigt das Spiegeln */
export const aufBildschirm = x => (S.spiegeln ? 1 - x : x);
