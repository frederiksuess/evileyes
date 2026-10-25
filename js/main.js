// Einstieg: verbindet Kamera, Erkennung, Szenen, Portal, Spiel und Bedienung.
import { S, speichern, MOTIV_IDS } from './einstellungen.js';
import { kamera, kameraStarten, kameraListe, wennKameraLaeuft } from './kamera.js';
import { bewegung, bewegungStarten, neuLernen, empfindlichkeitSetzen, aktiveSpuren } from './bewegung.js';
import { fokusWaehlen, wennJemandAuftaucht } from './aufmerksamkeit.js';
import { gestenStarten } from './mediapipe.js';
import { winkenErkennen } from './winken.js';
import { klangFreischalten, grollen, donner } from './audio.js';
import { zeige, verstecke } from './hinweis.js';
import { glatt, klemm } from './util.js';
import {
  ui, uiEinrichten, leisteZeigen, ansichtAnzeigen, kameraWahlFuellen,
  handyDialogZeigen, handyDialogSchliessen, handyStatus
} from './ui.js';
import { vorschau } from './vorschau.js';
import { portal, rahmen, innen, portalZeichnen } from './portal.js';
import { fern, empfaengerStarten, senderAdresse, qrSvg, STATUS_TEXT, laptopKennung } from './fernkamera.js';
import { steuerung, steuerungStarten, steuerungStatus, zustandSenden } from './steuerung.js';
import { spiel, spielAktiv, spielVorbereiten, spielSchritt, spinneImBlick } from './spiel/spinnenjagd.js';
import { AugenSzene } from './szenen/augen.js';
import { SkelettSzene } from './szenen/skelett.js';
import { RoentgenSzene } from './szenen/roentgen.js';
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
  szenen.roentgen = new RoentgenSzene();
  szenen.vogelspinne = new VogelspinneSzene();
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
  if (ui.gestartet && !kamera.laeuft && (id === 'skelett' || id === 'roentgen')) zeige('Das Skelett folgt dir, sobald die Kamera läuft.', 3500);
  if (id === 'roentgen') zeige('Röntgenspiegel: Die Körpererkennung braucht etwas Licht auf den Gästen.', 4000);
  if (steuerung.aktiv) zustandSenden();
  // Motivknöpfe in den Einstellungen nachziehen (falls per Fernbedienung gewechselt)
  document.querySelectorAll('[data-motiv]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.motiv === id)));
  if (ui.gestartet && !kamera.laeuft && id === 'vogelspinne') zeige('Leg den Finger auf den Bildschirm – die Spinne jagt ihn.', 3500);
  speichern();
}

// ---------------- Größe ----------------
function groesse() {
  // mehr als 2x bringt sichtbar nichts, kostet aber auf 3x-Displays doppelt so viel Rechenzeit
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  buehne.width = Math.round(innerWidth * dpr);
  buehne.height = Math.round(innerHeight * dpr);
  portal.version++;
}
addEventListener('resize', groesse);
groesse();

/** Bühnen-Gerätepixel -> Koordinaten innerhalb des Portal-Ausschnitts */
function zuSzene(x, y) {
  const r = rahmen();
  return [x - r.x, y - r.y];
}

// ---------------- Hauptschleife ----------------
let naehe = 0, aktivitaet = 0, tAlt = performance.now();
vorschau.naehe = () => naehe;

function schleife(t) {
  const dt = Math.min(0.1, (t - tAlt) / 1000);
  tAlt = t;
  const r = rahmen();
  const W = r.w, H = r.h;
  const imSpiel = spielAktiv();

  // Wohin soll die Kreatur schauen / laufen? (Koordinaten im Portal-Ausschnitt)
  let ziel = null, zielQuelle = null, zielNaehe = 0;
  const spielZiel = imSpiel ? spinneImBlick() : null;
  if (spielZiel) { ziel = spielZiel; zielQuelle = 'spiel'; zielNaehe = 0.15; }
  else if (fernBlick && t - fernBlick.zeit < 2500) { ziel = [fernBlick.x * W, fernBlick.y * H]; zielQuelle = 'finger'; zielNaehe = 0.2; }
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

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, buehne.width, buehne.height);
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  szene.zeichne(ctx, t, dt, {
    W, H, ziel, zielQuelle, naehe, aktivitaet, imSpiel,
    viele: aktiveSpuren(t).length >= 3,
    innen: (x, y) => innen(x + r.x, y + r.y),
    portalVersion: portal.version
  });
  if (imSpiel) spielSchritt(ctx, t, dt, W, H, szene);
  if (t < flackernBis) flackernZeichnen(ctx, t, W, H);
  ctx.restore();
  portalZeichnen(ctx, t);
  if (botschaftAktiv) botschaftPlatzieren(r);
  requestAnimationFrame(schleife);
}

// ---------------- Kamera ----------------
let erkennungLaeuft = false;
wennKameraLaeuft(() => {
  neuLernen();
  if (!erkennungLaeuft) {
    erkennungLaeuft = true;
    bewegungStarten();
    const darf = art => () => !spielAktiv() && performance.now() > spiel.sperreBis && !portal.bearbeiten &&
      (S.ausloeser === art || S.ausloeser === 'beide');
    gestenStarten(darf('peace'), spielVorbereiten);
    winkenErkennen(darf('winken'), spielVorbereiten);
  }
  for (const s of Object.values(szenen)) s.kameraGestartet?.();
  kameraWahlFuellen(kameraListe);
});

async function kameraWechseln(deviceId) {
  try {
    await kameraStarten(deviceId || undefined);
    zeige('Kamera gewechselt. Kurz stillhalten …', 2500);
  } catch (e) {
    zeige(e?.name === 'NotAllowedError' ? 'Kamerazugriff wurde verweigert.' : 'Diese Kamera ist nicht verfügbar.', 4000);
  }
}

let handyBeobachter = false;
async function handyVerbinden() {
  if (!handyBeobachter) {
    handyBeobachter = true;
    fern.bei.add(st => {
      handyStatus(STATUS_TEXT[st] || '', st === 'verbunden');
      if (st === 'verbunden') { setTimeout(handyDialogSchliessen, 1200); zeige('Handy verbunden – kurz stillhalten …', 3000); }
      if (st === 'getrennt' && document.getElementById('handyDialog').hidden) zeige(STATUS_TEXT.getrennt, 4000);
    });
  }
  await empfaengerStarten();
  const adresse = senderAdresse();
  let svg = '';
  try { svg = await qrSvg(adresse); }
  catch (e) { console.error('QR-Code nicht verfügbar:', e); zeige('QR-Code konnte nicht geladen werden – die Adresse unten im Handy eintippen.', 6000); }
  handyDialogZeigen(adresse, svg);
  handyStatus(STATUS_TEXT[fern.status] || '', fern.status === 'verbunden');
}

// ---------------- Fernbedienung: Effekte ----------------
let fernBlick = null, flackernBis = 0, flackernStart = 0;

/** Blitz & Donner: einzelne grelle Blitze, dazwischen Dunkelheit */
function flackernZeichnen(g, t, W, H) {
  const s = (t - flackernStart) / 1000;
  const blitze = [[0, 0.09], [0.16, 0.06], [0.42, 0.12], [0.62, 0.05], [1.15, 0.1]];
  let hell = 0;
  for (const [a, d] of blitze) if (s >= a && s < a + d) hell = 1 - (s - a) / d * 0.5;
  g.fillStyle = hell ? `rgba(235,240,255,${0.85 * hell})` : 'rgba(0,0,0,0.55)';
  g.fillRect(0, 0, W, H);
}

const botschaftEl = document.getElementById('botschaft');
let botschaftAktiv = false, botschaftTimer = null;
function botschaftZeigen(text) {
  const p = botschaftEl.querySelector('p');
  p.replaceChildren();
  [...text].forEach((z, i) => {
    const s = document.createElement('span');
    s.className = 'b';
    s.textContent = z === ' ' ? '\u00a0' : z;
    s.style.animationDelay = `${i * 70}ms`;
    p.append(s);
  });
  botschaftEl.classList.remove('weg');
  botschaftEl.hidden = false;
  botschaftAktiv = true;
  clearTimeout(botschaftTimer);
  const dauer = text.length * 70 + 7000;
  botschaftTimer = setTimeout(() => {
    botschaftEl.classList.add('weg');
    botschaftTimer = setTimeout(() => { botschaftEl.hidden = true; botschaftAktiv = false; }, 1300);
  }, dauer);
}
/** Botschaft mittig ins Portal legen (Gerätepixel -> CSS-Pixel) */
function botschaftPlatzieren(r) {
  const k = innerWidth / buehne.width;
  Object.assign(botschaftEl.style, { left: r.x * k + 'px', top: r.y * k + 'px', width: r.w * k + 'px', height: r.h * k + 'px' });
  const groesse = Math.max(28, Math.min(r.w * k * 0.085, r.h * k * 0.16));
  botschaftEl.querySelector('p').style.fontSize = groesse + 'px';
}

/** Befehle der Fernbedienung – alles wird geprüft, nichts davon wird als HTML eingesetzt */
function fernBefehl(d) {
  if (!d || typeof d !== 'object' || typeof d.art !== 'string') return;
  klangFreischalten();
  switch (d.art) {
    case 'schreck': szene.schreck?.(); grollen(); break;
    case 'grollen': grollen(0.8); break;
    case 'flackern': flackernStart = performance.now(); flackernBis = flackernStart + 1600; donner(); break;
    case 'blinzeln': szene.blinzeln?.(); break;
    case 'spiel': spielVorbereiten(); break;
    case 'motiv': if (MOTIV_IDS.includes(d.motiv)) motivWaehlen(d.motiv); break;
    case 'blick':
      if (Number.isFinite(d.x) && Number.isFinite(d.y)) fernBlick = { x: klemm(d.x, 0, 1), y: klemm(d.y, 0, 1), zeit: performance.now() };
      break;
    case 'botschaft':
      if (typeof d.text === 'string' && d.text.trim()) botschaftZeigen(d.text.trim().slice(0, 80));
      break;
  }
}
steuerung.beiBefehl = fernBefehl;
steuerung.beiNeu = () => {
  zeige('Fernbedienung verbunden', 2500);
  const d = document.getElementById('fernDialog');
  if (!d.hidden) setTimeout(() => { d.hidden = true; }, 1500);
};
steuerung.beiStatus = st => {
  const fs = document.getElementById('fdStatus');
  if (st.anzahl) {
    fs.textContent = `${st.anzahl === 1 ? 'Eine Fernbedienung' : st.anzahl + ' Fernbedienungen'} verbunden (${st.direkt ? 'direkt' : 'über Relay'})`;
    fs.className = 'ok';
  } else {
    const wege = [];
    wege.push(st.relay ? 'Relay bereit' : 'Relay nicht erreichbar');
    wege.push(['wartet', 'verbunden', 'getrennt'].includes(st.vermittler) ? 'Direktweg bereit' : 'Direktweg nicht bereit');
    fs.textContent = `Warte auf die Fernbedienung … · ${wege.join(' · ')}`;
    fs.className = '';
  }
};

async function fernbedienungKoppeln() {
  leisteZeigen(false);
  laptopKennung();
  steuerungStarten();
  const adresse = senderAdresse('fernbedienung.html');
  document.getElementById('fdAdresse').textContent = adresse;
  try { document.getElementById('fdQr').innerHTML = await qrSvg(adresse); }
  catch { document.getElementById('fdQr').hidden = true; }
  steuerung.beiStatus(steuerungStatus());
  document.getElementById('fernDialog').hidden = false;
}
document.getElementById('bFern').addEventListener('click', fernbedienungKoppeln);
document.getElementById('fdSchliessen').addEventListener('click', () => { document.getElementById('fernDialog').hidden = true; });

// ---------------- Start ----------------
async function starten(art, automatisch = false) {
  klangFreischalten();
  wachHalten();
  S.quelle = art; speichern();
  // Wurde schon einmal eine Fernbedienung gekoppelt, gleich bereit sein – sie verbindet sich von selbst
  if (S.fernGekoppelt) steuerungStarten();
  if (art === 'keine') {
    zeige('Mit dem Finger steuern. Zwei Finger zoomen, P passt das Portal an.', 5000);
    return;
  }
  if (art === 'handy') {
    if (!automatisch) { await handyVerbinden(); return; }
    // Autostart: still auf das Handy warten; nur wenn es nicht kommt, den QR-Code zeigen
    await empfaengerStarten();
    setTimeout(() => { if (fern.status !== 'verbunden') handyVerbinden(); }, 20000);
    return;
  }
  try {
    await kameraStarten();
    zeige('Kurz stillhalten – der Hintergrund wird gelernt. Antippen oder Leertaste öffnet die Einstellungen.', 5000);
  } catch (e) {
    const grund = e?.name === 'NotAllowedError' ? 'Kamerazugriff wurde verweigert.' : 'Die Kamera ist hier nicht erreichbar.';
    zeige(`${grund} Steuerung jetzt per Finger.`, 6000);
  }
}

// Bildschirm wach halten (wichtig für eine Dauer-Deko)
let sperre = null;
async function wachHalten() {
  try {
    if ('wakeLock' in navigator && !sperre) {
      sperre = await navigator.wakeLock.request('screen');
      sperre.addEventListener('release', () => { sperre = null; });
    }
  } catch { /* nicht unterstützt */ }
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
    spielStarten: spielVorbereiten,
    kameraWechseln,
    handyVerbinden,
    zuSzene,
    szene: () => szene
  });
  requestAnimationFrame(schleife);
  // Dauerbetrieb: mit ?auto in der Adresse ohne Startbildschirm loslegen (zuletzt genutzte Quelle)
  if (new URLSearchParams(location.search).has('auto')) ui.automatischStarten(S.quelle);
}

init();

// Zum Ausprobieren in der Konsole: Seite mit ?debug öffnen
if (new URLSearchParams(location.search).has('debug')) {
  window.feueraugen = { szenen, S, spiel, bewegung, portal, fern, get szene() { return szene; } };
}

// Offline-Fähigkeit (GitHub Pages liefert HTTPS, damit sind Service Worker erlaubt)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW:', e)));
}
