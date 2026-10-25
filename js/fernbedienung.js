// fernbedienung.html: Das Handy des Gastgebers steuert das Portal.
// Befehle gehen auf zwei Wegen raus: direkt (WebRTC) und über das Relay (MQTT-Broker).
// Das Portal sortiert doppelte Nachrichten aus. Die Kennung steht im Adress-Anker (#feueraugen-…).
import { peerBibliothek, peerOptionen } from './fernkamera.js';
import { relayVerbinden, relayThemen } from './relay.js';

const $ = id => document.getElementById(id);
const ziel = decodeURIComponent(location.hash.slice(1));
const ich = 'fb-' + Math.random().toString(36).slice(2, 10);
const zufall = () => Math.random().toString(36).slice(2, 10);

let peer = null, verbindung = null, timer = null, relay = null;
let portalZuletzt = -1e9, direktStatus = 'aus', relayAnzahl = 0;

// ---------------- Status ----------------
function statusZeigen() {
  const da = performance.now() - portalZuletzt < 9000;
  const direkt = verbindung?.open;
  let text;
  if (da || direkt) text = `Verbunden (${direkt ? 'direkt' : 'über Relay'})`;
  else if (!relayAnzahl && direktStatus === 'blockiert') text = 'Keine Verbindung – Internet am Handy und am Laptop prüfen';
  else text = 'Suche das Portal …';
  $('fernText').textContent = text;
  $('fernStatus').classList.toggle('ok', da || direkt);
  document.querySelectorAll('#fernSeite button').forEach(b => { b.disabled = !(da || direkt); });
}
setInterval(statusZeigen, 1000);

// ---------------- Senden (auf allen Wegen) ----------------
function senden(daten, fuehlbar = true) {
  const d = { ...daten, id: zufall(), von: ich };
  if (verbindung?.open) { try { verbindung.send(d); } catch { /* egal */ } }
  if (relay) relay.senden(relayThemen(ziel).zumPortal, d);
  if (fuehlbar) { try { navigator.vibrate?.(15); } catch { /* egal */ } }
}

function zustandEmpfangen(d) {
  if (d?.art !== 'zustand') return;
  portalZuletzt = performance.now();
  document.querySelectorAll('[data-motiv]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.motiv === d.motiv)));
  statusZeigen();
}

// ---------------- Weg 1: direkt (WebRTC) ----------------
function spaeter(ms = 3000) { clearTimeout(timer); timer = setTimeout(direktVerbinden, ms); }

function direktVerbinden() {
  clearTimeout(timer);
  if (!peer?.open) return;
  verbindung?.close();
  direktStatus = 'verbindet';
  const c = peer.connect(ziel, { reliable: true, metadata: { rolle: 'fernbedienung' } });
  verbindung = c;
  const aufgeben = setTimeout(() => {           // hängt der Aufbau, ist der Direktweg im Netz blockiert
    if (verbindung === c && !c.open) { direktStatus = 'blockiert'; c.close(); spaeter(20000); }
  }, 15000);
  c.on('open', () => { clearTimeout(aufgeben); direktStatus = 'offen'; senden({ art: 'hallo' }, false); statusZeigen(); });
  c.on('data', zustandEmpfangen);
  c.on('close', () => { clearTimeout(aufgeben); if (verbindung === c && direktStatus === 'offen') { direktStatus = 'aus'; spaeter(2500); } statusZeigen(); });
  c.on('error', () => { if (verbindung === c) spaeter(4000); });
}

async function direktStarten() {
  const Peer = await peerBibliothek();
  peer?.destroy();
  peer = new Peer(undefined, peerOptionen());
  peer.on('open', direktVerbinden);
  peer.on('disconnected', () => setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 3000));
  peer.on('error', e => {
    if (e.type === 'peer-unavailable') spaeter(5000);
    else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) setTimeout(direktStarten, 8000);
  });
}

// ---------------- Weg 2: Relay ----------------
async function relayStarten() {
  relay = await relayVerbinden(relayThemen(ziel).vomPortal, zustandEmpfangen, n => {
    const vorher = relayAnzahl;
    relayAnzahl = n;
    if (n && !vorher) senden({ art: 'hallo' }, false);   // Portal soll sich melden
    statusZeigen();
  });
}

// Lebenszeichen: Das Portal antwortet mit seinem Zustand
setInterval(() => senden({ art: 'hallo' }, false), 3000);

// ---------------- Knöpfe ----------------
document.querySelectorAll('[data-befehl]').forEach(b => b.addEventListener('click', () => senden({ art: b.dataset.befehl })));
document.querySelectorAll('[data-motiv]').forEach(b => b.addEventListener('click', () => senden({ art: 'motiv', motiv: b.dataset.motiv })));

const name = $('name');
try { name.value = localStorage.getItem('feueraugen.name') || ''; } catch { /* privat */ }
name.addEventListener('input', () => { try { localStorage.setItem('feueraugen.name', name.value); } catch { /* privat */ } });
document.querySelectorAll('[data-vorlage]').forEach(b => b.addEventListener('click', () => {
  const n = name.value.trim();
  if (!n) { name.focus(); name.placeholder = 'Erst einen Namen eingeben'; return; }
  senden({ art: 'botschaft', text: b.dataset.vorlage.replace('{name}', n) });
}));
$('eigenSenden').addEventListener('click', () => {
  const text = $('eigen').value.trim();
  if (text) senden({ art: 'botschaft', text });
});

// ---------------- Blick lenken ----------------
const pad = $('pad'), punkt = $('padPunkt');
let letzteSendung = 0;
function padPos(e) {
  const r = pad.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  punkt.style.left = x * 100 + '%'; punkt.style.top = y * 100 + '%';
  const jetzt = performance.now();
  if (jetzt - letzteSendung > 70) { letzteSendung = jetzt; senden({ art: 'blick', x, y }, false); }
}
pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); pad.classList.add('aktiv'); padPos(e); });
pad.addEventListener('pointermove', e => { if (pad.classList.contains('aktiv')) padPos(e); });
const padLos = () => pad.classList.remove('aktiv');
pad.addEventListener('pointerup', padLos);
pad.addEventListener('pointercancel', padLos);

// ---------------- Wach bleiben, nach dem Zurückkehren neu verbinden ----------------
let sperre = null;
async function wach() { try { if ('wakeLock' in navigator && !sperre) { sperre = await navigator.wakeLock.request('screen'); sperre.addEventListener('release', () => { sperre = null; }); } } catch { /* egal */ } }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  wach();
  senden({ art: 'hallo' }, false);
  if (!verbindung?.open) { if (peer?.open) spaeter(300); else direktStarten().catch(() => {}); }
});

// ---------------- Start ----------------
if (!/^feueraugen-[a-z0-9]{4,}$/.test(ziel)) {
  $('fernText').textContent = 'Ungültige Kennung – QR-Code im Portal neu scannen.';
} else {
  statusZeigen();
  wach();
  relayStarten().catch(e => console.warn('Relay:', e));
  direktStarten().catch(e => console.warn('Direktweg:', e));
}
