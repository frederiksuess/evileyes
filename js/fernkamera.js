// Handy als Kamera (WebRTC).
// Der Laptop meldet sich mit einer festen Kennung beim PeerJS-Vermittlungsserver an und zeigt
// einen QR-Code. Das Handy öffnet sender.html, ruft den Laptop an und schickt sein Kamerabild.
// Das Video selbst fließt direkt im WLAN von Gerät zu Gerät; der Server vermittelt nur.
import { S, speichern } from './einstellungen.js';
import { fremdenStreamSetzen } from './kamera.js';

let laden = null;
/** PeerJS erst laden, wenn es gebraucht wird */
export function peerBibliothek() {
  laden ??= new Promise((ok, fehler) => {
    if (window.peerjs?.Peer) return ok(window.peerjs.Peer);
    const s = document.createElement('script');
    s.src = new URL('./extern/peerjs-1.5.5.min.js', import.meta.url).href;
    s.onload = () => ok(window.peerjs.Peer);
    s.onerror = () => { laden = null; fehler(new Error('PeerJS konnte nicht geladen werden')); };
    document.head.append(s);
  });
  return laden;
}

/**
 * Vermittlungsserver: Standard ist der kostenlose PeerJS-Server.
 * Eigener Server (z. B. im Heimnetz): Seite mit ?peer=host:port öffnen.
 */
export function peerOptionen() {
  const p = new URLSearchParams(location.search).get('peer');
  if (!p) return { debug: 1 };
  const [host, port] = p.split(':');
  const lokal = host === 'localhost' || host === '127.0.0.1';
  return { host, port: Number(port) || (lokal ? 9000 : 443), path: '/', secure: !lokal, debug: 1 };
}

const zufallsId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 10);

export const fern = { status: 'aus', bei: new Set() };
const status = s => { fern.status = s; for (const f of fern.bei) f(s); };

let peer = null, anruf = null, wiederTimer = null;

export async function empfaengerStarten() {
  if (peer && !peer.destroyed) return;
  status('laedt');
  let Peer;
  try { Peer = await peerBibliothek(); }
  catch { status('fehler'); return; }
  if (!S.peerId) { S.peerId = 'feueraugen-' + zufallsId(); speichern(); }

  const starten = () => {
    clearTimeout(wiederTimer);
    peer = new Peer(S.peerId, peerOptionen());
    peer.on('open', () => status(anruf ? 'verbunden' : 'wartet'));
    peer.on('call', neu => {
      anruf?.close();
      anruf = neu;
      neu.answer();                                 // wir senden nichts zurück
      neu.on('stream', stream => { fremdenStreamSetzen(stream); status('verbunden'); });
      const pc = neu.peerConnection;
      pc?.addEventListener('connectionstatechange', () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && anruf === neu) {
          anruf = null; status('getrennt');
        }
      });
    });
    peer.on('disconnected', () => {
      // Verbindung zum Vermittler weg (das laufende Video bleibt davon unberührt)
      wiederTimer = setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 3000);
    });
    peer.on('error', e => {
      console.warn('PeerJS:', e.type, e);
      if (e.type === 'unavailable-id') {
        // nach einem Neuladen ist die alte Anmeldung manchmal noch kurz aktiv
        status('wartet-id');
        peer.destroy();
        wiederTimer = setTimeout(starten, 4000);
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) {
        status('kein-server');
        peer.destroy();
        wiederTimer = setTimeout(starten, 6000);
      }
    });
  };
  starten();
}

/** Adresse, die das Handy öffnen soll */
export function senderAdresse() {
  const u = new URL('sender.html', location.href);
  const p = new URLSearchParams(location.search).get('peer');
  u.search = p ? `?peer=${encodeURIComponent(p)}` : '';
  u.hash = S.peerId;
  return u.href;
}

/** QR-Code als SVG. Die Bibliothek wird erst hier geladen – fehlt sie, betrifft das nur den QR-Code. */
export async function qrSvg(text) {
  const { default: qrcode } = await import('./extern/qrcode-2.0.4.mjs');
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true, alt: 'QR-Code zur Handy-Kamera' });
}

export const STATUS_TEXT = {
  aus: '', laedt: 'Verbindung wird vorbereitet …',
  wartet: 'Warte auf das Handy …', 'wartet-id': 'Kennung wird freigegeben, gleich geht’s weiter …',
  verbunden: 'Handy verbunden', getrennt: 'Handy getrennt – es verbindet sich automatisch neu.',
  'kein-server': 'Vermittlungsserver nicht erreichbar. Ist der Laptop online? Neuer Versuch läuft …',
  fehler: 'WebRTC-Bibliothek konnte nicht geladen werden.'
};
