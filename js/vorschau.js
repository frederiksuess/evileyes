// Kleine Kameravorschau (Graustufen + erkannte Bewegung + Personenrahmen) zum Einrichten.
import { PW, PH, N, aktuell, sauber, bewegung, aktiveSpuren } from './bewegung.js';
import { aktuellerFokus } from './aufmerksamkeit.js';

const box = document.getElementById('vorschauBox');
const info = document.getElementById('vorschauInfo');
const cv = document.getElementById('vorschau');
const g = cv.getContext('2d');
const bild = g.createImageData(PW, PH);

export const vorschau = { an: false, naehe: () => 0 };

export function vorschauSchalten(an) {
  vorschau.an = an;
  box.classList.toggle('an', an);
}

bewegung.beiAnalyse.add(jetzt => {
  if (!vorschau.an) return;
  const o = bild.data;
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const v = aktuell[i] * 0.8;
    o[p] = sauber[i] ? 255 : v; o[p + 1] = sauber[i] ? 120 : v; o[p + 2] = sauber[i] ? 20 : v; o[p + 3] = 255;
  }
  g.putImageData(bild, 0, 0);
  const aktiv = aktiveSpuren(jetzt);
  g.lineWidth = 1;
  for (const sp of aktiv) {
    const [x, y, w, h] = sp.box;
    g.strokeStyle = sp.id === aktuellerFokus() ? '#ffc163' : 'rgba(255,255,255,0.7)';
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  const n = aktiv.length;
  info.textContent = `${n === 0 ? 'Niemand erkannt' : n === 1 ? '1 Person' : n + ' Personen'} · Nähe ${Math.round(vorschau.naehe() * 100)} %`;
});
