// Wählt aus den erkannten Personen die, die gerade angeschaut / gejagt wird.
// Bewusst träge: mindestens 1,4 s Verweildauer, damit es nie hektisch wird.
import { aktiveSpuren } from './bewegung.js';
import { S } from './einstellungen.js';

let fokusId = null, fokusSeit = 0, naechsterWechsel = 0, zuletztJemand = -1e9;
const beiAuftauchen = new Set();

/** Rückruf, wenn nach einer Pause wieder jemand auftaucht (z. B. erschrockenes Blinzeln) */
export const wennJemandAuftaucht = f => beiAuftauchen.add(f);
export const aktuellerFokus = () => fokusId;

const groesste = liste => liste.reduce((a, b) => (b.flaeche > a.flaeche ? b : a));

export function fokusWaehlen(t) {
  const aktiv = aktiveSpuren(t);
  if (!aktiv.length) { fokusId = null; return null; }
  let akt = aktiv.find(sp => sp.id === fokusId) || null;
  const vorher = fokusId;
  const setze = sp => {
    if (sp.id !== fokusId) { fokusId = sp.id; fokusSeit = t; }
    sp.gesehen = true;
    akt = sp;
  };

  if (!S.mehrere) {
    // Eine Person: an der größten Bewegung festhalten, nur selten wechseln
    if (!akt) setze(groesste(aktiv));
    else {
      const g = groesste(aktiv);
      if (g !== akt && g.flaeche > akt.flaeche * 2.5 && t - fokusSeit > 2500) setze(g);
    }
  } else {
    const verweilt = t - fokusSeit > 1400;
    const neu = aktiv.filter(sp => !sp.gesehen && sp.id !== fokusId && sp.flaeche > 0.008);
    if (!akt) {
      setze(neu.length ? neu[0] : groesste(aktiv));
      naechsterWechsel = t + 2500 + Math.random() * 2500;
    } else if (verweilt && neu.length) {
      setze(neu[0]);                              // Neuankömmlinge kurz mustern
      naechsterWechsel = t + 2000 + Math.random() * 2000;
    } else if (verweilt && aktiv.length > 1 && t > naechsterWechsel) {
      const andere = aktiv.filter(sp => sp !== akt);
      let r = Math.random() * andere.reduce((s, sp) => s + sp.flaeche, 0);
      let wahl = andere[0];
      for (const sp of andere) { r -= sp.flaeche; if (r <= 0) { wahl = sp; break; } }
      setze(wahl);
      naechsterWechsel = t + 2500 + Math.random() * 3000;
    }
  }

  if (vorher === null && t - zuletztJemand > 2500) for (const f of beiAuftauchen) f(t);
  zuletztJemand = t;
  return akt;
}
