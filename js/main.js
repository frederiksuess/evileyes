// Einstieg: verbindet Kamera, Erkennung, Szenen, Spiel und Bedienung.
import { S, speichern, MOTIV_IDS } from './einstellungen.js';
import { kamera, kameraStarten } from './kamera.js';
import { bewegung, bewegungStarten, neuLernen, empfindlichkeitSetzen, aktiveSpuren } from './bewegung.js';
import { fokusWaehlen, wennJemandAuftaucht } from './aufmerksamkeit.js';
import { gestenStarten } from './mediapipe.js';
import { klangFreischalten } from './audio.js';
import { zeige, verstecke } from './hinweis.js';
import { glatt, klemm } from './util.js';
import { ui, uiEinrichten, leisteZeigen, ansichtAnzeigen } from './ui.js';
import { vorschau } from './vorschau.js';
import { spiel, spielAktiv, spielVorbereiten, spielSchritt, spinneImBlick } from './spiel/spinnenjagd.js';
import { AugenSzene } from './szenen/augen.js';
import { SkelettSzene } from './szenen/skelett.js';
import { VogelspinneSzene } from './szenen/vogelspinne.js';

const buehne = document.getElementById('buehne');
const ctx = buehne.getContext('2d');

// ---------------- Szenen ----------------
const szenen = {};
let szene = null;

async function szenenAnlegen() {
  const daten = await fetch('assets/augen/motive.json').then(r => r.json());
  for (const d of daten) szenen[d.id] = new AugenSzene(d);
  szenen.skelett = new SkelettSzene();
  szenen.vogelspinne = new VogelspinneSzene();
  // Augenbilder vorladen (klein), damit der Wechsel sofort geht
  await Promise.all(Object.values(szenen).map(s => s.laden()));
}

function motivWaehlen(id) {
  if (!szenen[id]) id = MOTIV_IDS.find(m => szenen[m]);
  szene?.deaktivieren?.();
  S.motiv = id;
  szene = szenen[id];
  szene.aktivieren?.();
  ansichtAnzeigen(szene.hatHoehe !== false);
  document.getElementById('bBlinzeln').hidden = !szene.blinzeln;
  if (ui.gestartet && !kamera.laeuft && id === 'skelett') zeige('Das Skelett folgt dir, sobald die Kamera läuft.', 3500);
  if (ui.gestartet && !kamera.laeuft && id === 'vogelspinne') zeige('Zieh den Finger über den Bildschirm – die Spinne jagt ihn.', 3500);
  speichern();
}

// ---------------- Größe ----------------
function groesse() {
  // mehr als 2x bringt sichtbar nichts, kostet aber auf 3x-Displays doppelt so viel Rechenzeit
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  buehne.width = Math.round(innerWidth * dpr);
  buehne.height = Math.round(innerHeight * dpr);
}
addEventListener('resize', groesse);
groesse();

// ---------------- Hauptschleife ----------------
let naehe = 0, aktivitaet = 0, tAlt = performance.now();
vorschau.naehe = () => naehe;

function schleife(t) {
  const dt = Math.min(0.1, (t - tAlt) / 1000);
  tAlt = t;
  const W = buehne.width, H = buehne.height;
  const imSpiel = spielAktiv();

  // Wohin soll die Kreatur schauen / laufen?
  let ziel = null, zielQuelle = null, zielNaehe = 0;
  const spielZiel = imSpiel ? spinneImBlick() : null;
  if (spielZiel) { ziel = spielZiel; zielQuelle = 'spiel'; zielNaehe = 0.15; }
  else if (ui.finger) { ziel = ui.finger; zielQuelle = 'finger'; zielNaehe = 0.3; }
  else if (!imSpiel) {
    const fokus = fokusWaehlen(t);
    if (fokus) {
      ziel = [(S.spiegeln ? 1 - fokus.x : fokus.x) * W, fokus.y * H];
      zielQuelle = 'person';
      zielNaehe = klemm((fokus.w - 0.2) / 0.45, 0, 1);   // Breite im Bild ~ Abstand
    }
  }
  // Nähe und Aufregung bewusst träge – bleibt ruhig, auch wenn viel los ist
  naehe = glatt(naehe, zielNaehe, dt, zielNaehe > naehe ? 0.7 : 1.4);
  aktivitaet = glatt(aktivitaet, ui.finger ? 0.4 : Math.min(1, bewegung.gesamt * 5), dt, 0.6);

  szene.zeichne(ctx, t, dt, {
    W, H, ziel, zielQuelle, naehe, aktivitaet, imSpiel,
    viele: aktiveSpuren(t).length >= 3
  });
  if (imSpiel) spielSchritt(ctx, t, dt, W, H, szene);
  requestAnimationFrame(schleife);
}

// ---------------- Start ----------------
async function starten(mitKamera) {
  klangFreischalten();
  wachHalten();
  if (!mitKamera) {
    zeige('Zieh den Finger über den Bildschirm. Zwei Finger zoomen, doppelt tippen blinzelt.', 5000);
    return;
  }
  try {
    await kameraStarten();
    bewegungStarten();
    zeige('Kurz stillhalten – der Hintergrund wird gelernt. Antippen öffnet die Einstellungen.', 5000);
    szene.kameraGestartet?.();
    for (const s of Object.values(szenen)) if (s !== szene) s.kameraGestartet?.();
    gestenStarten(() => !spielAktiv() && performance.now() > spiel.sperreBis, spielVorbereiten);
  } catch (e) {
    const grund = e?.name === 'NotAllowedError' ? 'Kamerazugriff wurde verweigert.' : 'Die Kamera ist hier nicht erreichbar.';
    zeige(`${grund} Steuerung jetzt per Finger.`, 6000);
  }
}

// Bildschirm wach halten (wichtig, wenn das Handy als Deko aufgestellt ist)
let sperre = null;
async function wachHalten() {
  try { if ('wakeLock' in navigator && !sperre) { sperre = await navigator.wakeLock.request('screen'); sperre.addEventListener('release', () => { sperre = null; }); } }
  catch { /* nicht unterstützt */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ui.gestartet) wachHalten(); });

// Spielstart: Leiste zu, Augen blinzeln doppelt
spiel.beimStart = () => { leisteZeigen(false); verstecke(); szene.blinzeln?.(true); };

// Wer nach einer Pause auftaucht, wird erschrocken angeblinzelt (höchstens alle 4 s)
let letzterSchreck = 0;
wennJemandAuftaucht(t => {
  if (t - letzterSchreck > 4000 && Math.random() < 0.65) { szene.blinzeln?.(false, 120); letzterSchreck = t; }
});

async function init() {
  try {
    await szenenAnlegen();
  } catch (e) {
    console.error(e);
    zeige('Die Bilder konnten nicht geladen werden. Bitte Seite neu laden.', 8000);
    return;
  }
  motivWaehlen(S.motiv);
  uiEinrichten({
    starten,
    motivWaehlen,
    blinzeln: () => szene.blinzeln?.(),
    neuLernen,
    empfindlichkeit: empfindlichkeitSetzen,
    mehrereGeaendert: () => szenen.skelett.mehrereGeaendert(),
    spielStarten: spielVorbereiten
  });
  requestAnimationFrame(schleife);
}

init();

// Zum Ausprobieren in der Konsole: Seite mit ?debug öffnen
if (new URLSearchParams(location.search).has('debug')) window.feueraugen = { szenen, S, spiel, bewegung, get szene() { return szene; } };

// Offline-Fähigkeit (GitHub Pages liefert HTTPS, damit sind Service Worker erlaubt)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW:', e)));
}
