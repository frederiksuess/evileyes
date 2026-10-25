// fernbedienung.html: Das Handy des Gastgebers steuert das Portal über einen WebRTC-Datenkanal.
// Die Kennung des Laptops steht im Adress-Anker (#feueraugen-…).
import { peerBibliothek, peerOptionen } from './fernkamera.js';

const $ = id => document.getElementById(id);
const ziel = decodeURIComponent(location.hash.slice(1));
let peer = null, verbindung = null, timer = null;

function status(text, ok = false) {
  $('fernText').textContent = text;
  $('fernStatus').classList.toggle('ok', ok);
  document.querySelectorAll('#fernSeite button').forEach(b => { b.disabled = !ok; });
}

function senden(daten) {
  if (!verbindung?.open) return;
  verbindung.send(daten);
  try { navigator.vibrate?.(15); } catch { /* egal */ }
}

function spaeter(ms = 3000) { clearTimeout(timer); timer = setTimeout(verbinden, ms); }

function verbinden() {
  clearTimeout(timer);
  if (!peer?.open) return;
  verbindung?.close();
  status('Verbinde mit dem Portal …');
  const c = peer.connect(ziel, { reliable: true, metadata: { rolle: 'fernbedienung' } });
  verbindung = c;
  c.on('open', () => status('Verbunden', true));
  c.on('data', d => {
    if (d?.art === 'zustand') document.querySelectorAll('[data-motiv]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.motiv === d.motiv)));
  });
  c.on('close', () => { if (verbindung === c) { status('Verbindung verloren – neuer Versuch …'); spaeter(2500); } });
  c.on('error', () => { if (verbindung === c) spaeter(3000); });
}

async function starten() {
  if (!/^feueraugen-[a-z0-9]{4,}$/.test(ziel)) { status('Ungültige Kennung – QR-Code im Portal neu scannen.'); return; }
  status('Verbinde …');
  const Peer = await peerBibliothek();
  peer?.destroy();
  peer = new Peer(undefined, peerOptionen());
  peer.on('open', verbinden);
  peer.on('disconnected', () => setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 3000));
  peer.on('error', e => {
    if (e.type === 'peer-unavailable') { status('Portal nicht erreichbar – warte …'); spaeter(4000); }
    else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) { status('Keine Verbindung zum Vermittler …'); setTimeout(starten, 6000); }
  });
}

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
  if (jetzt - letzteSendung > 50) { letzteSendung = jetzt; verbindung?.open && verbindung.send({ art: 'blick', x, y }); }
}
pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); pad.classList.add('aktiv'); padPos(e); });
pad.addEventListener('pointermove', e => { if (pad.classList.contains('aktiv')) padPos(e); });
const padLos = () => pad.classList.remove('aktiv');
pad.addEventListener('pointerup', padLos);
pad.addEventListener('pointercancel', padLos);

// Bildschirm wach halten, nach dem Zurückkehren neu verbinden
let sperre = null;
async function wach() { try { if ('wakeLock' in navigator && !sperre) { sperre = await navigator.wakeLock.request('screen'); sperre.addEventListener('release', () => { sperre = null; }); } } catch { /* egal */ } }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  wach();
  if (!verbindung?.open) { if (peer?.open) spaeter(300); else starten(); }
});

status('Verbinde …');
wach();
starten().catch(() => status('Fernbedienung konnte nicht geladen werden.'));
