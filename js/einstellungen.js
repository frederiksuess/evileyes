// Persistente Einstellungen. Alles, was aus localStorage kommt, wird geprüft und begrenzt,
// damit eine kaputte oder alte Speicherung die App nie lahmlegt.
import { klemm } from './util.js';

const SCHLUESSEL = 'feueraugen.v2';
export const MOTIV_IDS = ['schuppen', 'rauch', 'skelett', 'vogelspinne'];

const STANDARD = {
  motiv: 'schuppen',
  mehrere: true,
  spiegeln: true,
  empf: 34,
  rekord: 0,
  ansicht: Object.fromEntries(MOTIV_IDS.map(id => [id, { zoom: 1, hoehe: 0 }]))
};

function pruefen(roh) {
  const s = structuredClone(STANDARD);
  if (!roh || typeof roh !== 'object') return s;
  if (MOTIV_IDS.includes(roh.motiv)) s.motiv = roh.motiv;
  if (typeof roh.mehrere === 'boolean') s.mehrere = roh.mehrere;
  if (typeof roh.spiegeln === 'boolean') s.spiegeln = roh.spiegeln;
  if (Number.isFinite(roh.empf)) s.empf = klemm(Math.round(roh.empf), 6, 60);
  if (Number.isFinite(roh.rekord)) s.rekord = klemm(Math.round(roh.rekord), 0, 9999);
  for (const id of MOTIV_IDS) {
    const a = roh.ansicht && roh.ansicht[id];
    if (a && Number.isFinite(a.zoom)) s.ansicht[id].zoom = klemm(a.zoom, 0.5, 3);
    if (a && Number.isFinite(a.hoehe)) s.ansicht[id].hoehe = klemm(a.hoehe, -1, 1);
  }
  return s;
}

function laden() {
  try { return pruefen(JSON.parse(localStorage.getItem(SCHLUESSEL) || 'null')); }
  catch { return pruefen(null); }
}

export const S = laden();

let timer = null;
export function speichern() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { localStorage.setItem(SCHLUESSEL, JSON.stringify(S)); } catch { /* privat / voll – egal */ }
  }, 300);
}

/** Zoom/Höhe des aktiven Motivs */
export const ansicht = () => S.ansicht[S.motiv];
