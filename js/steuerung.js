// Fernbedienung, Laptop-Seite: nimmt Befehle über zwei Wege an –
//  1. direkt per WebRTC-Datenkanal (schnell, braucht aber eine direkte Netzverbindung)
//  2. über das Relay (öffentliche MQTT-Broker; klappt auch in Gast-WLANs und mobilen Netzen)
// Die Fernbedienung schickt jede Nachricht auf allen Wegen; doppelte werden aussortiert.
import { S, speichern } from './einstellungen.js';
import { fern, fernsteuerung, anFernbedienungen, empfaengerStarten, laptopKennung } from './fernkamera.js';
import { relayVerbinden, relayThemen } from './relay.js';

export const steuerung = { aktiv: false, beiBefehl: null, beiStatus: null, beiNeu: null };

const gesehen = new Map();          // Nachrichten-Kennung -> Zeit (gegen Doppelte)
const fernbedienungen = new Map();  // Fernbedienungs-Kennung -> { zeit, kanal }
let relay = null, relayAnzahl = 0, themen = null;

const zufall = () => Math.random().toString(36).slice(2, 10);

function eingang(d, kanal) {
  if (!d || typeof d !== 'object' || typeof d.art !== 'string') return;
  const jetzt = performance.now();
  // Lebenszeichen je Weg merken (vor dem Aussortieren – so sehen wir, welche Wege funktionieren)
  let neu = false;
  if (typeof d.von === 'string' && d.von.length <= 40) {
    const f = fernbedienungen.get(d.von);
    neu = !f || jetzt - f.zeit > 12000;
    fernbedienungen.set(d.von, { ...(f || {}), zeit: jetzt, [kanal]: jetzt });
  }
  if (typeof d.id === 'string') {
    if (gesehen.has(d.id)) return;
    gesehen.set(d.id, jetzt);
    if (gesehen.size > 400) for (const [k, z] of gesehen) if (jetzt - z > 20000) gesehen.delete(k);
  }
  if (neu) {
    if (!S.fernGekoppelt) { S.fernGekoppelt = true; speichern(); }
    zustandSenden();
    steuerung.beiNeu?.();
    melden();
  }
  if (d.art === 'hallo') { zustandSenden(); return; }
  steuerung.beiBefehl?.(d);
}

/** Nachricht an alle Fernbedienungen, auf allen Wegen */
export function anAlle(daten) {
  const d = { ...daten, id: zufall() };
  anFernbedienungen(d);
  if (relay && themen) relay.senden(themen.vomPortal, d);
}
export const zustandSenden = () => anAlle({ art: 'zustand', motiv: S.motiv });

export function steuerungStatus() {
  const jetzt = performance.now();
  const aktiv = [...fernbedienungen.values()].filter(f => jetzt - f.zeit < 12000);
  return {
    anzahl: aktiv.length,
    direkt: aktiv.some(f => jetzt - (f.direkt ?? -1e9) < 12000),
    relay: relayAnzahl,
    vermittler: fern.status
  };
}
function melden() { steuerung.beiStatus?.(steuerungStatus()); }

export async function steuerungStarten() {
  if (steuerung.aktiv) return;
  steuerung.aktiv = true;
  const id = laptopKennung();
  themen = relayThemen(id);
  fernsteuerung.beiBefehl = d => eingang(d, 'direkt');
  fernsteuerung.beiVerbunden = () => melden();
  fern.bei.add(melden);
  setInterval(melden, 3000);                   // weggefallene Fernbedienungen austragen
  empfaengerStarten().catch(e => console.warn('WebRTC:', e));
  try {
    relay = await relayVerbinden(themen.zumPortal, d => eingang(d, 'relay'), n => { relayAnzahl = n; melden(); });
  } catch (e) {
    console.warn('Relay nicht verfügbar:', e);
  }
  melden();
}
