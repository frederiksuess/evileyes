// Persistente Einstellungen. Alles, was aus localStorage kommt, wird geprüft und begrenzt,
// damit eine kaputte oder alte Speicherung die App nie lahmlegt.
import { klemm } from './util.js';

const SCHLUESSEL = 'feueraugen.v2';
export const MOTIV_IDS = ['schuppen', 'rauch', 'skelett', 'vogelspinne'];

export const AUSLOESER = ['winken', 'peace', 'beide', 'aus'];

/** Standardform des Portals: Oval, normiert auf den Bildschirm (0..1); [x, y, eckig] */
export function portalOval(n = 12, cx = 0.5, cy = 0.5, rx = 0.36, ry = 0.44) {
  return Array.from({ length: n }, (_, i) => {
    const w = i / n * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(w) * rx, cy + Math.sin(w) * ry, false];
  });
}

const STANDARD = {
  motiv: 'schuppen',
  mehrere: true,
  spiegeln: true,
  empf: 34,
  rekord: 0,
  nachtsicht: true,          // Restlichtverstärker (wirkt nur, wenn es dunkel ist)
  ausloeser: 'beide',        // wie die Spinnenjagd startet
  kameraId: '',              // gewählte Kamera dieses Geräts
  quelle: 'lokal',           // zuletzt genutzt: lokal | handy | keine (für den Autostart)
  peerId: '',                // feste Kennung für die Handy-Kamera
  portal: { an: false, punkte: portalOval(), weich: 0.03, glut: false },
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
  if (typeof roh.nachtsicht === 'boolean') s.nachtsicht = roh.nachtsicht;
  if (AUSLOESER.includes(roh.ausloeser)) s.ausloeser = roh.ausloeser;
  if (typeof roh.kameraId === 'string') s.kameraId = roh.kameraId.slice(0, 200);
  if (['lokal', 'handy', 'keine'].includes(roh.quelle)) s.quelle = roh.quelle;
  if (typeof roh.peerId === 'string' && /^[a-z0-9-]{8,40}$/.test(roh.peerId)) s.peerId = roh.peerId;
  const p = roh.portal;
  if (p && typeof p === 'object') {
    if (typeof p.an === 'boolean') s.portal.an = p.an;
    if (typeof p.glut === 'boolean') s.portal.glut = p.glut;
    if (Number.isFinite(p.weich)) s.portal.weich = klemm(p.weich, 0, 0.15);
    if (Array.isArray(p.punkte) && p.punkte.length >= 3 && p.punkte.length <= 32 &&
        p.punkte.every(q => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]))) {
      s.portal.punkte = p.punkte.map(q => [klemm(q[0], -0.2, 1.2), klemm(q[1], -0.2, 1.2), !!q[2]]);
    }
  }
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
