// Winken erkennen – funktioniert auch bei wenig Licht, weil nur Bewegung ausgewertet wird.
// Idee: Die schnelle Bewegung einer Hand ist klein und pendelt hin und her.
// Wer vorbeigeht, erzeugt dagegen viel Bewegung in eine Richtung.
import { PW, PH, N, schnell, bewegung } from './bewegung.js';

const FENSTER = 2200;        // ms, in denen gewunken werden muss
const MIN_WENDEN = 3;        // so oft muss die Richtung kurz hintereinander wechseln
const MIN_HUB = 0.075;       // Mindestausschlag (Anteil der Bildbreite) – Zittern an Kanten ist kleiner
const MAX_HALB = 650;        // ms zwischen zwei Richtungswechseln (Winken ist schnell, Gehen nicht)
const MAX_STREUUNG = 0.09;   // die Bewegung muss kompakt sein (eine Hand, nicht zwei Personen)

let verlauf = [];
let darf = () => true, beiWinken = () => {};

export function winkenErkennen(darfPruefen, rueckruf) { darf = darfPruefen; beiWinken = rueckruf; }

bewegung.beiAnalyse.add(t => {
  if (!darf()) { verlauf = []; return; }
  // Schwerpunkt der schnellen Bewegung in den oberen 75 % des Bildes
  let n = 0, sx = 0, sxx = 0;
  const yMax = Math.floor(PH * 0.75);
  for (let y = 0; y < yMax; y++) for (let x = 0; x < PW; x++) {
    if (schnell[y * PW + x]) { n++; sx += x; sxx += x * x; }
  }
  const anteil = n / N;
  verlauf = verlauf.filter(p => t - p.t < FENSTER);
  if (anteil < 0.002 || anteil > 0.1) { if (anteil > 0.1) verlauf = []; return; }
  const mx = sx / n, streuung = Math.sqrt(Math.max(0, sxx / n - mx * mx)) / PW;
  if (streuung > MAX_STREUUNG) { verlauf = []; return; }
  verlauf.push({ t, x: mx / PW });

  // Richtungswechsel mit Mindestausschlag zählen
  // Nur schnell aufeinanderfolgende Wenden zählen als Kette
  let wenden = 0, richtung = 0, extrem = verlauf[0].x, extremT = verlauf[0].t, letzteWende = -1e9;
  const wende = (p, neu) => {
    wenden = extremT - letzteWende <= MAX_HALB ? wenden + 1 : 1;
    letzteWende = extremT;
    richtung = neu; extrem = p.x; extremT = p.t;
  };
  for (const p of verlauf) {
    if (richtung === 0) {
      if (p.x - extrem > MIN_HUB) { richtung = 1; extrem = p.x; extremT = p.t; }
      else if (extrem - p.x > MIN_HUB) { richtung = -1; extrem = p.x; extremT = p.t; }
    } else if (richtung === 1) {
      if (p.x > extrem) { extrem = p.x; extremT = p.t; }
      else if (extrem - p.x > MIN_HUB) wende(p, -1);
    } else {
      if (p.x < extrem) { extrem = p.x; extremT = p.t; }
      else if (p.x - extrem > MIN_HUB) wende(p, 1);
    }
  }
  if (wenden >= MIN_WENDEN) { verlauf = []; beiWinken(); }
});
