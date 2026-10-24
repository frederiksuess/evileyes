// sender.html: Das Handy schickt sein Kamerabild per WebRTC an den Laptop.
// Die Kennung des Laptops steht im Adress-Anker (#feueraugen-…) und wird nie an einen Server geschickt.
import { peerBibliothek, peerOptionen } from './fernkamera.js';

const $ = id => document.getElementById(id);
const ziel = decodeURIComponent(location.hash.slice(1));
const statusEl = $('senderStatus'), vorschau = $('eigenesBild');
let richtung = 'environment', stream = null, peer = null, anruf = null, timer = null, wachSperre = null;

function zeige(text, art = '') {
  statusEl.textContent = text;
  statusEl.className = art;
  $('schwarzStatus').textContent = text;
}

if (!/^feueraugen-[a-z0-9]{4,}$/.test(ziel)) {
  zeige('Keine gültige Laptop-Kennung. Bitte den QR-Code auf dem Portal erneut scannen.', 'warnung');
  $('senden').disabled = true;
}

document.querySelectorAll('[data-kamera]').forEach(b => b.addEventListener('click', async () => {
  richtung = b.dataset.kamera;
  document.querySelectorAll('[data-kamera]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  if (stream) await kameraOeffnen(true);
}));

async function kameraOeffnen(neuSenden = false) {
  stream?.getTracks().forEach(t => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: richtung }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 20, max: 30 } },
    audio: false
  });
  vorschau.srcObject = stream;
  $('keinBild').hidden = true;
  if (neuSenden && anruf) {
    // Kamera gewechselt: Spur im laufenden Anruf austauschen, ohne neu zu verbinden
    const sender = anruf.peerConnection?.getSenders().find(s => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(stream.getVideoTracks()[0]);
    else anrufen();
  }
}

function spaeterNochmal(ms = 3000) {
  clearTimeout(timer);
  timer = setTimeout(anrufen, ms);
}

function anrufen() {
  clearTimeout(timer);
  if (!peer || peer.destroyed || !peer.open || !stream) return;
  anruf?.close();
  zeige('Verbinde mit dem Portal …');
  const a = peer.call(ziel, stream);
  anruf = a;
  if (!a) { spaeterNochmal(); return; }
  const pc = a.peerConnection;
  pc?.addEventListener('connectionstatechange', () => {
    if (anruf !== a) return;
    const z = pc.connectionState;
    if (z === 'connected') zeige('Verbunden – das Portal sieht jetzt durch dieses Handy.', 'ok');
    if (z === 'failed' || z === 'disconnected' || z === 'closed') {
      zeige('Verbindung verloren – neuer Versuch …', 'warnung');
      spaeterNochmal(2500);
    }
  });
  a.on('close', () => { if (anruf === a) spaeterNochmal(2500); });
}

async function peerStarten() {
  const Peer = await peerBibliothek();
  peer?.destroy();
  peer = new Peer(undefined, peerOptionen());
  peer.on('open', anrufen);
  peer.on('disconnected', () => setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 3000));
  peer.on('error', e => {
    console.warn('PeerJS:', e.type, e);
    if (e.type === 'peer-unavailable') { zeige('Portal noch nicht bereit – warte …', 'warnung'); spaeterNochmal(4000); }
    else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) {
      zeige('Vermittlungsserver nicht erreichbar – neuer Versuch …', 'warnung');
      setTimeout(peerStarten, 6000);
    }
  });
}

async function wachHalten() {
  try { if ('wakeLock' in navigator && !wachSperre) { wachSperre = await navigator.wakeLock.request('screen'); wachSperre.addEventListener('release', () => { wachSperre = null; }); } }
  catch { /* nicht unterstützt */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && stream) {
    wachHalten();
    if (!peer?.open || anruf?.peerConnection?.connectionState !== 'connected') spaeterNochmal(500);
  }
});

$('senden').addEventListener('click', async () => {
  $('senden').disabled = true;
  try {
    await kameraOeffnen();
    wachHalten();
    $('dunkel').disabled = false;
    $('senden').textContent = 'Kamera läuft';
    await peerStarten();
  } catch (e) {
    $('senden').disabled = false;
    zeige(e?.name === 'NotAllowedError' ? 'Kamerazugriff wurde verweigert.' : 'Kamera oder Verbindung nicht verfügbar.', 'warnung');
  }
});

// Bildschirm abdunkeln (das Handy soll im Versteck nicht leuchten); Antippen holt ihn zurück
$('dunkel').addEventListener('click', () => { $('schwarz').hidden = false; });
$('schwarz').addEventListener('click', () => { $('schwarz').hidden = true; });
