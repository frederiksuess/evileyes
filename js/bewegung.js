// Bewegungserkennung auf einem kleinen Raster (96 x 72).
//  - Hintergrundmodell: was ist neu im Bild? -> Personen (Klumpen) und deren Spuren
//  - Bild-zu-Bild-Differenz: was bewegt sich gerade schnell? -> Patschen im Spiel
import { video, bildBereit } from './kamera.js';
import { S } from './einstellungen.js';

export const PW = 96, PH = 72, N = PW * PH;

const proc = document.createElement('canvas');
proc.width = PW; proc.height = PH;
const pctx = proc.getContext('2d', { willReadFrequently: true });

export const aktuell = new Float32Array(N);   // Graustufen
export const sauber = new Uint8Array(N);      // bereinigte Bewegungsmaske
export const schnell = new Uint8Array(N);     // schnelle Bewegung seit dem letzten Bild
const hg = new Float32Array(N);
const vorher = new Float32Array(N);
const bewegt = new Uint8Array(N);
const tmp = new Uint8Array(N);
const breit = new Uint8Array(N);
const label = new Int32Array(N);
const stapel = new Int32Array(N);

let hgBereit = false, vorherBereit = false, lernen = 0;

export const bewegung = {
  gesamt: 0,           // Anteil bewegter Fläche (0..1)
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
    sp.x += (b.x - sp.x) * 0.35;
    sp.y += (b.y - sp.y) * 0.35;
    sp.w += (b.w - sp.w) * 0.2;
    sp.flaeche += (b.flaeche - sp.flaeche) * 0.3;
    sp.box = b.box;
    sp.zuletzt = jetzt;
    sp.treffer++;
  }
  for (const b of frei) {
    spuren.push({ id: naechsteId++, x: b.x, y: b.y, w: b.w, flaeche: b.flaeche, box: b.box,
                  erst: jetzt, zuletzt: jetzt, treffer: 1, gesehen: false });
  }
  bewegung.spuren = spuren.filter(sp => jetzt - sp.zuletzt < 1200);
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
    let n = 0, sx = 0, x0 = PW, x1 = -1, y0 = PH, y1 = -1;
    while (sp) {
      const j = stapel[--sp];
      const x = j % PW, y = (j / PW) | 0;
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
    if (n > N * 0.005) {
      klumpen.push({
        x: sx / n / PW,
        y: (y0 + (y1 - y0) * 0.22) / PH,     // oberer Teil ~ Kopf
        w: (x1 - x0 + 1) / PW,
        flaeche: n / N,
        box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1]
      });
    }
  }
  klumpen.sort((a, b) => b.flaeche - a.flaeche);
  return klumpen.slice(0, 5);
}

function analysieren() {
  pctx.drawImage(video, 0, 0, PW, PH);
  const d = pctx.getImageData(0, 0, PW, PH).data;
  for (let i = 0, p = 0; i < N; i++, p += 4)
    aktuell[i] = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;

  if (!hgBereit) { hg.set(aktuell); hgBereit = true; lernen = 12; }

  // schnelle Bewegung
  let nSchnell = 0;
  for (let i = 0; i < N; i++) {
    const b = vorherBereit && Math.abs(aktuell[i] - vorher[i]) > 22 ? 1 : 0;
    schnell[i] = b; nSchnell += b;
  }
  if (nSchnell > N * 0.6) schnell.fill(0);       // Kamera gewackelt / Licht
  vorher.set(aktuell);
  vorherBereit = true;

  // Hintergrundmodell
  let roh = 0;
  const thr = bewegung.schwelle;
  for (let i = 0; i < N; i++) {
    const b = Math.abs(aktuell[i] - hg[i]) > thr ? 1 : 0;
    bewegt[i] = b; roh += b;
  }
  sauber.fill(0);
  const jetzt = performance.now();

  if (lernen > 0 || roh > N * 0.55) {
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
    // Hintergrund langsam nachführen; bewegte Stellen nur sehr langsam
    for (let i = 0; i < N; i++) hg[i] += (aktuell[i] - hg[i]) * (bewegt[i] ? 0.004 : 0.05);
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

/** Aktive Personen (lange genug gesehen, nicht verloren) */
export const aktiveSpuren = t => bewegung.spuren.filter(sp => t - sp.zuletzt < 700 && sp.treffer >= 3);

/** Kamerabild-Koordinate (0..1) -> Bildschirm-Anteil (0..1), berücksichtigt das Spiegeln */
export const aufBildschirm = x => (S.spiegeln ? 1 - x : x);
